// Real-time monitoring optimization for seamless video streaming
class RealtimeMonitoring {
    constructor() {
        this.localStreams = new Map(); // Store local video streams
        this.frameBuffers = new Map(); // Buffer frames locally
        this.uploadQueue = []; // Queue for Cloudinary uploads
        this.isUploading = false;
    }

    // Start real-time camera streaming
    async startRealtimeCamera(userId, stream) {
        try {
            // Store the stream locally for immediate display
            this.localStreams.set(userId, stream);
            
            // Create video element for immediate local display
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.muted = true;
            video.style.width = '100%';
            video.style.height = '200px';
            video.style.objectFit = 'cover';
            video.style.borderRadius = '8px';
            video.style.transform = 'scaleX(-1)'; // Mirror like webcam
            
            // Display immediately in monitoring dashboard
            const cameraContainer = document.getElementById(`camera-${userId}`);
            if (cameraContainer) {
                cameraContainer.innerHTML = '';
                cameraContainer.appendChild(video);
            }
            
            // Start background frame capture for AI detection
            this.startBackgroundCapture(userId, stream);
            
            console.log(`✅ Real-time camera started for ${userId}`);
        } catch (error) {
            console.error('Failed to start real-time camera:', error);
        }
    }

    // Background frame capture for AI detection (less frequent)
    startBackgroundCapture(userId, stream) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 640;
        canvas.height = 480;
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        
        // Capture every 3 seconds for AI detection (not for display)
        const captureInterval = setInterval(async () => {
            if (!stream.active) {
                clearInterval(captureInterval);
                return;
            }
            
            try {
                // Draw frame to canvas
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Convert to blob for AI processing
                canvas.toBlob(async (blob) => {
                    await this.processFrameForAI(userId, blob);
                }, 'image/jpeg', 0.7);
                
            } catch (error) {
                console.error('Background capture error:', error);
            }
        }, 3000); // Every 3 seconds for AI detection
        
        return captureInterval;
    }

    // Process frame for AI detection
    async processFrameForAI(userId, blob) {
        try {
            // Upload via the shared CloudinaryStorageManager (see
            // firebase-config.js) instead of hardcoded credentials, so there
            // is exactly one place upload config/logic lives.
            const storage = window.firebaseApp && window.firebaseApp.storage;
            if (!storage) return;

            const result = await storage.uploadFile(blob, `ai-detection/${userId}`);

            // Store in Firebase for AI processing
            await this.updateFrameInFirebase(userId, result.url, 'ai');

        } catch (error) {
            // Expected while Cloudinary credentials are still placeholders.
            console.log('AI frame upload skipped (Cloudinary not configured):', error.message);
        }
    }

    // Update frame URL in Firebase
    async updateFrameInFirebase(userId, frameUrl, type) {
        try {
            const { db } = window.firebaseApp;
            const examDoc = await db.collection('exams').doc(window.currentExamId).get();
            const examineesArray = examDoc.data().examinees || [];
            const examineeIndex = examineesArray.findIndex(e => e.uid === userId);
            
            if (examineeIndex !== -1) {
                examineesArray[examineeIndex][`${type}FrameUrl`] = frameUrl;
                examineesArray[examineeIndex][`${type}FrameTimestamp`] = new Date().toISOString();
                
                await db.collection('exams').doc(window.currentExamId).update({
                    examinees: examineesArray
                });
            }
        } catch (error) {
            console.error('Firebase update error:', error);
        }
    }

    // Start real-time monitoring updates
    startRealtimeMonitoring() {
        // Poll Firebase every 2 seconds for AI results and metadata
        setInterval(async () => {
            await this.updateMonitoringData();
        }, 2000);
    }

    // Update monitoring data from Firebase
    async updateMonitoringData() {
        try {
            if (!window.firebaseApp || !window.firebaseReady) return;
            
            const { db } = window.firebaseApp;
            const examDoc = await db.collection('exams').doc(window.currentExamId).get();
            
            if (examDoc.exists) {
                const examData = examDoc.data();
                const examinees = examData.examinees || [];
                
                examinees.forEach(examinee => {
                    this.updateExamineeDisplay(examinee);
                });
            }
        } catch (error) {
            console.error('Monitoring update error:', error);
        }
    }

    // Update examinee display with latest data
    updateExamineeDisplay(examinee) {
        const userId = examinee.uid || examinee.id;
        
        // Update status indicators
        const statusElement = document.querySelector(`[data-user-id="${userId}"] .tile-status`);
        if (statusElement) {
            statusElement.textContent = examinee.status || 'active';
            statusElement.className = `tile-status ${this.getStatusClass(examinee.status)}`;
        }
        
        // Update violation count
        const violationElement = document.querySelector(`[data-user-id="${userId}"] .violation-count`);
        if (violationElement) {
            violationElement.textContent = examinee.violations || 0;
        }
        
        // Update last activity
        const activityElement = document.querySelector(`[data-user-id="${userId}"] .last-activity`);
        if (activityElement && examinee.lastActivity) {
            activityElement.textContent = this.formatLastActivity(examinee.lastActivity);
        }
    }

    // Get status class for styling
    getStatusClass(status) {
        switch (status) {
            case 'danger': return 'status-danger';
            case 'warning': return 'status-warning';
            case 'paused': return 'status-paused';
            default: return 'status-active';
        }
    }

    // Format last activity time
    formatLastActivity(timestamp) {
        const now = new Date();
        const activity = new Date(timestamp);
        const diffMs = now - activity;
        const diffSecs = Math.floor(diffMs / 1000);
        
        if (diffSecs < 60) return `${diffSecs}s ago`;
        if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
        return `${Math.floor(diffSecs / 3600)}h ago`;
    }

    // Stop real-time monitoring
    stopRealtimeMonitoring(userId) {
        // Stop local stream
        const stream = this.localStreams.get(userId);
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            this.localStreams.delete(userId);
        }
        
        // Clear frame buffer
        this.frameBuffers.delete(userId);
        
        console.log(`🛑 Real-time monitoring stopped for ${userId}`);
    }
}

// Export for use in monitoring.js
window.RealtimeMonitoring = RealtimeMonitoring;
