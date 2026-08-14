/**
 * YOLO Model Loader for Exam Proctor Extension
 * IEEE Standard Compliant Implementation
 * 
 * This module handles the loading and initialization of YOLO models
 * for real-time object detection in exam proctoring scenarios.
 * 
 * @author Exam Proctor Team
 * @version 2.0.0
 * @license MIT
 */

class YOLOModelLoader {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.modelVersion = 'yolov8n';
        this.inputSize = 640;
        this.confidenceThreshold = 0.5;
        this.nmsThreshold = 0.4;
        this.classNames = this.initializeClassNames();
        this.modelPath = this.getModelPath();
    }

    /**
     * Initialize COCO class names for object detection
     * @returns {Array} Array of class names
     */
    initializeClassNames() {
        return [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
            'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
            'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
            'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
            'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
            'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
            'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
            'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
            'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
            'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
        ];
    }

    /**
     * Get model path based on environment
     * @returns {string} Model path
     */
    getModelPath() {
        // Point to the actual yolov8m.onnx model
        return chrome.runtime.getURL('models/yolov8m.onnx');
    }

    /**
     * Load YOLO model using ONNX.js for browser compatibility
     * @returns {Promise<boolean>} Success status
     */
    async loadModel() {
        try {
            console.log('Loading YOLO model...');
            
            // Check if ONNX.js is available
            if (typeof ort === 'undefined') {
                throw new Error('ONNX.js runtime not available');
            }

            // ort.min.js and its .wasm binaries are vendored locally in lib/
            // (see manifest.json's web_accessible_resources and
            // download-onnxruntime.ps1) instead of being loaded from a CDN,
            // since the extension's CSP (script-src 'self') blocks remote
            // scripts. Point the wasm loader at the extension's own lib/
            // folder so it resolves correctly from a chrome-extension://
            // origin, and force single-threaded wasm since extension pages
            // aren't cross-origin-isolated (no SharedArrayBuffer available
            // for the threaded build).
            if (ort.env && ort.env.wasm) {
                ort.env.wasm.wasmPaths = chrome.runtime.getURL('lib/');
                ort.env.wasm.numThreads = 1;
            }

            // Create ONNX inference session
            this.model = await ort.InferenceSession.create(this.modelPath, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });

            this.isModelLoaded = true;
            console.log('YOLO model loaded successfully');
            
            // Emit model loaded event
            this.emitEvent('modelLoaded', {
                modelVersion: this.modelVersion,
                inputSize: this.inputSize,
                classCount: this.classNames.length
            });

            return true;
        } catch (error) {
            console.error('Failed to load YOLO model:', error);
            console.warn('YOLO model not available - system will continue with reduced AI detection');
            this.emitEvent('modelError', { error: error.message });
            // Return false but don't break the entire system
            return false;
        }
    }

    /**
     * Preprocess image data for YOLO inference
     * @param {ImageData} imageData - Input image data
     * @returns {Float32Array} Preprocessed tensor data
     */
    preprocessImage(imageData) {
        const { width, height, data } = imageData;
        
        // Create canvas for resizing
        const canvas = new OffscreenCanvas(this.inputSize, this.inputSize);
        const ctx = canvas.getContext('2d');
        
        // Create temporary canvas with original image
        const tempCanvas = new OffscreenCanvas(width, height);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        // Resize and draw to target canvas
        ctx.drawImage(tempCanvas, 0, 0, this.inputSize, this.inputSize);
        
        // Get resized image data
        const resizedData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
        
        // Convert to tensor format (normalize to 0-1)
        const tensorData = new Float32Array(this.inputSize * this.inputSize * 3);
        let index = 0;
        
        for (let i = 0; i < resizedData.data.length; i += 4) {
            tensorData[index] = resizedData.data[i] / 255.0;     // R
            tensorData[index + 1] = resizedData.data[i + 1] / 255.0; // G
            tensorData[index + 2] = resizedData.data[i + 2] / 255.0; // B
            index += 3;
        }
        
        return tensorData;
    }

    /**
     * Run YOLO inference on preprocessed image
     * @param {Float32Array} tensorData - Preprocessed image data
     * @returns {Promise<Array>} Detection results
     */
    async runInference(tensorData) {
        try {
            if (!this.isModelLoaded) {
                throw new Error('Model not loaded');
            }

            // Create input tensor
            const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, this.inputSize, this.inputSize]);
            
            // Run inference
            const results = await this.model.run({ images: inputTensor });
            
            // Extract output tensor
            const output = results.output0;
            
            // Process detections
            const detections = this.postprocessDetections(output);
            
            return detections;
        } catch (error) {
            console.error('Inference failed:', error);
            throw error;
        }
    }

    /**
     * Post-process YOLO output to extract bounding boxes and classes
     * @param {ort.Tensor} output - Model output tensor
     * @returns {Array} Processed detections
     */
    postprocessDetections(output) {
        const detections = [];
        const outputData = output.data;
        const outputShape = output.dims;
        
        // YOLOv8 output format: [1, 84, 8400]
        // 84 = 4 (bbox) + 80 (classes)
        const numDetections = outputShape[2];
        const numClasses = outputShape[1] - 4;
        
        for (let i = 0; i < numDetections; i++) {
            // Extract bounding box coordinates
            const x = outputData[i * outputShape[1] + 0];
            const y = outputData[i * outputShape[1] + 1];
            const w = outputData[i * outputShape[1] + 2];
            const h = outputData[i * outputShape[1] + 3];
            
            // Find class with highest confidence
            let maxConfidence = 0;
            let maxClassIndex = 0;
            
            for (let j = 0; j < numClasses; j++) {
                const confidence = outputData[i * outputShape[1] + 4 + j];
                if (confidence > maxConfidence) {
                    maxConfidence = confidence;
                    maxClassIndex = j;
                }
            }
            
            // Filter by confidence threshold
            if (maxConfidence > this.confidenceThreshold) {
                detections.push({
                    classId: maxClassIndex,
                    className: this.classNames[maxClassIndex],
                    confidence: maxConfidence,
                    bbox: [x, y, w, h],
                    centerX: x,
                    centerY: y,
                    width: w,
                    height: h
                });
            }
        }
        
        // Apply Non-Maximum Suppression
        return this.applyNMS(detections);
    }

    /**
     * Apply Non-Maximum Suppression to remove overlapping detections
     * @param {Array} detections - Raw detections
     * @returns {Array} Filtered detections
     */
    applyNMS(detections) {
        // Sort by confidence
        detections.sort((a, b) => b.confidence - a.confidence);
        
        const filteredDetections = [];
        const suppressed = new Set();
        
        for (let i = 0; i < detections.length; i++) {
            if (suppressed.has(i)) continue;
            
            filteredDetections.push(detections[i]);
            
            // Suppress overlapping detections
            for (let j = i + 1; j < detections.length; j++) {
                if (suppressed.has(j)) continue;
                
                const iou = this.calculateIoU(detections[i].bbox, detections[j].bbox);
                if (iou > this.nmsThreshold) {
                    suppressed.add(j);
                }
            }
        }
        
        return filteredDetections;
    }

    /**
     * Calculate Intersection over Union (IoU) between two bounding boxes
     * @param {Array} bbox1 - First bounding box [x, y, w, h]
     * @param {Array} bbox2 - Second bounding box [x, y, w, h]
     * @returns {number} IoU value
     */
    calculateIoU(bbox1, bbox2) {
        const [x1, y1, w1, h1] = bbox1;
        const [x2, y2, w2, h2] = bbox2;
        
        const xLeft = Math.max(x1 - w1/2, x2 - w2/2);
        const yTop = Math.max(y1 - h1/2, y2 - h2/2);
        const xRight = Math.min(x1 + w1/2, x2 + w2/2);
        const yBottom = Math.min(y1 + h1/2, y2 + h2/2);
        
        if (xRight < xLeft || yBottom < yTop) {
            return 0;
        }
        
        const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
        const bbox1Area = w1 * h1;
        const bbox2Area = w2 * h2;
        const unionArea = bbox1Area + bbox2Area - intersectionArea;
        
        return intersectionArea / unionArea;
    }

    /**
     * Filter detections relevant to exam proctoring
     * @param {Array} detections - All detections
     * @returns {Array} Relevant detections
     */
    filterRelevantDetections(detections) {
        const relevantClasses = [
            'person',           // Student presence
            'cell phone',       // Phone usage
            'laptop',           // Multiple devices
            'book',             // Physical materials
            'remote',           // Remote control
            'tv',               // TV/monitor
            'keyboard',         // Multiple keyboards
            'mouse',            // Multiple mice
            'bottle',           // Food/drink
            'cup',              // Food/drink
            'chair',            // Multiple seating
            'backpack',         // Suspicious items
            'handbag'           // Suspicious items
        ];

        return detections.filter(detection => 
            relevantClasses.includes(detection.className)
        );
    }

    /**
     * Update model thresholds
     * @param {Object} thresholds - New threshold values
     */
    updateThresholds(thresholds) {
        if (thresholds.confidence !== undefined) {
            this.confidenceThreshold = Math.max(0.1, Math.min(1.0, thresholds.confidence));
        }
        if (thresholds.nms !== undefined) {
            this.nmsThreshold = Math.max(0.1, Math.min(1.0, thresholds.nms));
        }
        
        console.log('Thresholds updated:', {
            confidence: this.confidenceThreshold,
            nms: this.nmsThreshold
        });
    }

    /**
     * Get model information
     * @returns {Object} Model information
     */
    getModelInfo() {
        return {
            version: this.modelVersion,
            inputSize: this.inputSize,
            isLoaded: this.isModelLoaded,
            classCount: this.classNames.length,
            confidenceThreshold: this.confidenceThreshold,
            nmsThreshold: this.nmsThreshold
        };
    }

    /**
     * Emit custom events
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     */
    emitEvent(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        window.dispatchEvent(event);
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.model) {
            this.model.release();
            this.model = null;
        }
        this.isModelLoaded = false;
        console.log('YOLO model disposed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YOLOModelLoader;
} else {
    window.YOLOModelLoader = YOLOModelLoader;
}
