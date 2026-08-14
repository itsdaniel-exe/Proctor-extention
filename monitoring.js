// Monitoring Interface JavaScript
class ExamMonitoringInterface {
    constructor() {
        this.currentExam = null;
        this.examinees = new Map();
        this.violations = [];
        this.isMonitoring = false;
        this.yoloLoader = null;
        this.isYoloReady = false;
        this.realtimeMonitor = null; // Real-time monitoring instance
        this.settings = {
            yoloConfidence: 0.5,
            yoloNMS: 0.4,
            frameRate: 1, // Faster frame rate for real-time feel
            autoFlag: true
        };
        // Firebase is still using the placeholder config shipped in
        // firebase-config.js - there's no real backend to talk to, so we
        // fall back to clearly-labeled simulated data instead of silently
        // showing fake violations as if they were real.
        this.demoMode = typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey === 'YOUR_API_KEY';
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateDemoModeBanner();
        this.waitForFirebaseAndInit();
    }

    updateDemoModeBanner() {
        const banner = document.getElementById('demoModeBanner');
        if (banner) {
            banner.classList.toggle('hidden', !this.demoMode);
        }
    }

    async waitForFirebaseAndInit() {
        // Wait for Firebase to be ready
        const waitForFirebase = () => {
            if (window.firebaseApp && window.firebaseReady) {
                console.log('Firebase ready, loading monitoring data...');
                this.loadExamData();
                this.startPeriodicUpdates();
                this.loadSettings();
                this.initializeYOLO();
            } else {
                console.log('Waiting for Firebase...');
                setTimeout(waitForFirebase, 100);
            }
        };
        
        // Start waiting, but with timeout
        waitForFirebase();
        
        // Initialize real-time monitoring
        if (typeof RealtimeMonitoring !== 'undefined') {
            this.realtimeMonitor = new RealtimeMonitoring();
        }
        
        // If Firebase doesn't load in 5 seconds, load with default settings
        setTimeout(() => {
            if (!window.firebaseApp || !window.firebaseReady) {
                console.warn('Firebase not available, loading with default settings');
                this.loadExamData();
                this.startPeriodicUpdates();
                this.loadSettings();
                this.initializeYOLO();
            }
        }, 5000);
    }
    
    // Initialize YOLO model for AI detection
    async initializeYOLO() {
        try {
            console.log('Initializing YOLO model...');
            
            // Check if ONNX runtime is available
            if (typeof ort === 'undefined') {
                console.error('ONNX.js runtime not available');
                this.showNotification('ONNX.js runtime not found', 'error');
                return;
            }
            
            // Check if YOLO loader is available
            if (typeof YOLOModelLoader === 'undefined') {
                console.error('YOLO Model Loader not available');
                this.showNotification('YOLO Model Loader not found', 'error');
                return;
            }
            
            console.log('Creating YOLO loader instance...');
            // Create YOLO loader instance
            this.yoloLoader = new YOLOModelLoader();
            
            // Set thresholds from settings
            this.yoloLoader.updateThresholds({
                confidence: this.settings.yoloConfidence,
                nms: this.settings.yoloNMS
            });
            
            console.log('Loading YOLO model...');
            // Load the model
            const success = await this.yoloLoader.loadModel();
            
            if (success) {
                this.isYoloReady = true;
                console.log('✅ YOLO model loaded successfully!');
                this.showNotification('AI Detection Active', 'success');
            } else {
                console.error('❌ YOLO model failed to load');
                this.showNotification('YOLO model failed to load - check console for details', 'error');
            }
        } catch (error) {
            console.error('YOLO initialization error:', error);
            this.showNotification(`YOLO initialization failed: ${error.message}`, 'error');
        }
    }

    bindEvents() {
        // Header controls
        document.getElementById('loadExamBtn').addEventListener('click', () => this.loadExamByCode());
        document.getElementById('pauseBtn').addEventListener('click', () => this.toggleMonitoring());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('debugBtn').addEventListener('click', () => this.debugMonitoringStatus());
        document.getElementById('closeBtn').addEventListener('click', () => this.closeMonitoring());

        // Settings modal
        document.getElementById('closeSettings').addEventListener('click', () => this.hideSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('cancelSettings').addEventListener('click', () => this.hideSettings());

        // Settings controls
        document.getElementById('yoloConfidence').addEventListener('input', (e) => {
            document.getElementById('confidenceValue').textContent = e.target.value;
        });

        document.getElementById('yoloNMS').addEventListener('input', (e) => {
            document.getElementById('nmsValue').textContent = e.target.value;
        });

        // Violation modal
        document.getElementById('closeViolation').addEventListener('click', () => this.hideViolationModal());
        document.getElementById('acknowledgeViolation').addEventListener('click', () => this.acknowledgeViolation());
        document.getElementById('dismissViolation').addEventListener('click', () => this.dismissViolation());

        // Examinee details modal
        const closeExamineeDetailsBtn = document.getElementById('closeExamineeDetails');
        if (closeExamineeDetailsBtn) {
            closeExamineeDetailsBtn.addEventListener('click', () => this.hideExamineeDetails());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    // --- Minimal modal focus management -----------------------------------
    // Moves focus into the modal when it opens, traps Tab/Shift+Tab within
    // it, and restores focus to whatever triggered it on close.
    openModal(modal) {
        if (!modal) return;
        this._lastFocusedElement = document.activeElement;
        modal.classList.remove('hidden');

        const getFocusable = () => Array.from(
            modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter(el => !el.disabled && el.offsetParent !== null);

        const focusable = getFocusable();
        if (focusable.length) focusable[0].focus();

        this._modalKeydownHandler = (e) => {
            if (e.key !== 'Tab') return;
            const items = getFocusable();
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        modal.addEventListener('keydown', this._modalKeydownHandler);
    }

    closeModal(modal) {
        if (!modal) return;
        modal.classList.add('hidden');
        if (this._modalKeydownHandler) {
            modal.removeEventListener('keydown', this._modalKeydownHandler);
            this._modalKeydownHandler = null;
        }
        if (this._lastFocusedElement && typeof this._lastFocusedElement.focus === 'function') {
            this._lastFocusedElement.focus();
        }
    }

    // Escape a user-supplied string before interpolating it into innerHTML.
    // Examinee name/email come from Firestore's fullName/email fields, which
    // are user-controlled, so they must never be inserted as raw HTML.
    escapeHtml(value) {
        if (value === undefined || value === null) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    async loadExamByCode() {
        const examCode = document.getElementById('manualExamCode').value.trim();
        if (!examCode) {
            alert('Please enter an exam code');
            return;
        }

        try {
            console.log('Loading exam by code:', examCode);
            
            if (window.firebaseApp && window.firebaseReady) {
                const { db } = window.firebaseApp;
                const examDoc = await db.collection('exams').doc(examCode).get();
                
                if (examDoc.exists) {
                    const examData = examDoc.data();
                    console.log('Found exam:', examData);
                    
                    this.currentExam = {
                        id: examCode,
                        title: examData.title || 'Unknown Exam',
                        code: examCode,
                        status: examData.status || 'active',
                        ...examData
                    };
                    
                    // Update storage
                    await chrome.storage.local.set({ currentExam: this.currentExam });
                    
                    this.updateExamInfo();
                    this.loadExaminees();
                    this.loadViolations();
                    this.startExamTimer();
                    
                    this.showNotification(`Loaded exam: ${examData.title}`, 'success');
                } else {
                    alert(`Exam with code "${examCode}" not found`);
                }
            } else {
                alert('Firebase not connected. Please wait and try again.');
            }
        } catch (error) {
            console.error('Error loading exam by code:', error);
            alert('Failed to load exam. Please check the code and try again.');
        }
    }

    async loadExamData() {
        try {
            // Load from storage (set by popup.js)
            const result = await chrome.storage.local.get(['currentExam']);
            if (result.currentExam) {
                this.currentExam = result.currentExam;
                
                // Try to load full exam data from Firebase
                if (window.firebaseApp && window.firebaseReady) {
                    try {
                        const { db } = window.firebaseApp;
                        const examDoc = await db.collection('exams').doc(this.currentExam.id).get();
                        
                        if (examDoc.exists) {
                            const examData = examDoc.data();
                            // Merge Firebase data with current exam data
                            this.currentExam = {
                                ...this.currentExam,
                                ...examData,
                                id: this.currentExam.id,
                                code: this.currentExam.code || examData.examineeCode
                            };
                        }
                    } catch (error) {
                        console.error('Error loading exam from Firebase:', error);
                    }
                }
                
                this.updateExamInfo();
                this.loadExaminees();
                this.loadViolations();
            } else {
                // Create default exam data if none exists
                this.currentExam = {
                    id: 'EXAM',
                    title: 'Exam Monitoring',
                    code: 'EXAM123',
                    status: 'active'
                };
                this.updateExamInfo();
                this.loadExaminees();
                this.loadViolations();
            }
        } catch (error) {
            console.error('Error loading exam data:', error);
            this.showError('Failed to load exam data');
        }
    }

    updateExamInfo() {
        if (this.currentExam) {
            document.getElementById('examTitle').textContent = this.currentExam.title;
            document.getElementById('examCode').textContent = `Code: ${this.currentExam.code}`;
            
            // Start countdown timer if exam has an end time
            if (this.currentExam.endTime) {
                this.startExamTimer(this.currentExam.endTime);
            }
        }
    }
    
    startExamTimer(endTime) {
        const timerElement = document.getElementById('examTimer');
        if (!timerElement) return;
        
        // Clear any existing timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        const updateTimer = () => {
            const now = new Date();
            const end = new Date(endTime);
            const timeRemaining = end - now;
            
            if (timeRemaining <= 0) {
                timerElement.textContent = '⏱️ 00:00:00';
                timerElement.style.background = 'rgba(239, 68, 68, 0.2)';
                timerElement.style.borderColor = '#ef4444';
                clearInterval(this.timerInterval);
                this.showNotification('⏰ Exam time has ended!', 'warning');
                return;
            }
            
            // Calculate hours, minutes, seconds
            const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
            
            // Format time
            const formatted = `⏱️ ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            timerElement.textContent = formatted;
            
            // Change color based on time remaining
            if (timeRemaining < 5 * 60 * 1000) {
                timerElement.style.background = 'rgba(239, 68, 68, 0.2)';
                timerElement.style.borderColor = '#ef4444';
            } else if (timeRemaining < 15 * 60 * 1000) {
                timerElement.style.background = 'rgba(245, 158, 11, 0.2)';
                timerElement.style.borderColor = '#f59e0b';
            } else {
                timerElement.style.background = 'rgba(16, 185, 129, 0.2)';
                timerElement.style.borderColor = '#10b981';
            }
        };
        
        // Update immediately and then every second
        updateTimer();
        this.timerInterval = setInterval(updateTimer, 1000);
    }

    async loadExaminees() {
        try {
            if (!this.currentExam) {
                console.log('No current exam, cannot load examinees');
                return;
            }

            console.log('Loading examinees for exam:', this.currentExam.id);

            // Try to load from Firebase first
            if (window.firebaseApp && window.firebaseReady) {
                try {
                    const { db } = window.firebaseApp;
                    const examDoc = await db.collection('exams').doc(this.currentExam.id).get();
                    
                    console.log('Exam document exists:', examDoc.exists);
                    
                    if (examDoc.exists) {
                        const examData = examDoc.data();
                        const examinees = examData.examinees || [];
                        
                        console.log('Found examinees in Firebase:', examinees.length, examinees);
                        
                        this.examinees.clear();
                        examinees.forEach(examinee => {
                            const examineeData = {
                                id: examinee.uid || examinee.id,
                                name: examinee.fullName || examinee.email || 'Unknown',
                                email: examinee.email,
                                status: examinee.status || 'active',
                                violations: examinee.violations || 0,
                                joinTime: examinee.joinedAt || new Date().toISOString(),
                                // Get camera/screen status from examinee data
                                cameraEnabled: examinee.cameraEnabled || examinee.cameraFrameUrl ? true : false,
                                screenEnabled: examinee.screenEnabled || examinee.screenFrameUrl ? true : false,
                                // Store frame URLs for monitoring
                                cameraFrameUrl: examinee.cameraFrameUrl,
                                screenFrameUrl: examinee.screenFrameUrl
                            };
                            this.examinees.set(examineeData.id, examineeData);
                            console.log('Loaded examinee:', examineeData);
                        });
                        
                        console.log('Total examinees loaded:', this.examinees.size);
                        
                        this.updateExamineeList();
                        this.updateMonitoringGrid();
                        this.updateSystemStatus();

                        // Only ever generate simulated violations when Firebase
                        // isn't actually configured - never mix fake data into
                        // a real monitoring session.
                        if (this.demoMode && !this.mockViolationsStarted) {
                            this.mockViolationsStarted = true;
                            this.startMockViolations();
                        }
                        return;
                    } else {
                        console.log('Exam document not found in Firebase:', this.currentExam.id);
                    }
                } catch (error) {
                    console.error('Error loading from Firebase:', error);
                }
            } else {
                console.log('Firebase not ready:', {
                    firebaseApp: !!window.firebaseApp,
                    firebaseReady: !!window.firebaseReady
                });
            }

            // No real examinees found - show empty state
            console.log('No real examinees found, showing empty state');
            this.examinees.clear();
            this.updateExamineeList();
            this.updateMonitoringGrid();
            this.updateSystemStatus();
        } catch (error) {
            console.error('Error loading examinees:', error);
        }
    }

    updateExamineeList() {
        const examineeList = document.getElementById('examineeList');
        examineeList.innerHTML = '';

        this.examinees.forEach((examinee, userId) => {
            const examineeItem = document.createElement('div');
            examineeItem.className = 'examinee-item';
            examineeItem.dataset.userId = userId;

            const status = this.getExamineeStatus(examinee);
            const statusClass = this.getStatusClass(status);

            const info = document.createElement('div');
            info.className = 'examinee-info';

            // examinee.name comes from Firestore's user-controlled
            // fullName/email fields - use textContent, never innerHTML, so it
            // can never be interpreted as markup.
            const nameSpan = document.createElement('span');
            nameSpan.className = 'examinee-name';
            nameSpan.textContent = examinee.name || 'Unknown';

            const statusSpan = document.createElement('span');
            statusSpan.className = `examinee-status ${statusClass}`;
            statusSpan.textContent = status;

            info.appendChild(nameSpan);
            info.appendChild(statusSpan);
            examineeItem.appendChild(info);

            examineeItem.addEventListener('click', () => this.focusExaminee(userId));
            examineeList.appendChild(examineeItem);
        });
    }

    updateMonitoringGrid() {
        const monitoringGrid = document.getElementById('monitoringGrid');
        monitoringGrid.innerHTML = '';

        if (this.examinees.size === 0) {
            monitoringGrid.innerHTML = `
                <div class="loading-placeholder">
                    <div class="spinner"></div>
                    <p>Waiting for examinees to join...</p>
                    <p style="font-size: 14px; color: var(--text-muted); margin-top: 10px;">
                        Share the exam code with students to start monitoring
                    </p>
                </div>
            `;
            return;
        }

        this.examinees.forEach((examinee, userId) => {
            const tile = this.createMonitoringTile(examinee, userId);
            monitoringGrid.appendChild(tile);
        });

        // Real YOLO detection will start automatically when camera feeds are available
    }

    createMonitoringTile(examinee, userId) {
        const tile = document.createElement('div');
        tile.className = 'monitoring-tile';
        tile.dataset.userId = userId;

        const status = this.getExamineeStatus(examinee);
        const statusClass = this.getStatusClass(status);
        // examinee.name comes from Firestore's user-controlled
        // fullName/email fields - escape before interpolating into innerHTML.
        const safeName = this.escapeHtml(examinee.name || 'Unknown');
        const violationCount = examinee.violations || 0;
        const severityClass = violationCount > 3 ? 'severity-high' : (violationCount > 0 ? 'severity-medium' : 'severity-none');

        // Create real camera feed container with image element
        const cameraFeed = examinee.cameraEnabled ?
            `<div class="camera-feed-container">
                <img id="camera-${userId}"
                     alt="Camera feed loading..."
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="camera-placeholder">📹 Camera Loading...</div>
                <div class="feed-badge">📹 Camera Active</div>
                <div class="feed-badge-live">LIVE</div>
            </div>` :
            `<div class="feed-off feed-off-camera">📹 Camera Off</div>`;

        const screenFeed = examinee.screenEnabled ?
            `<div class="screen-feed-container">
                <img id="screen-${userId}"
                     alt="Screen share loading..."
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="screen-placeholder">🖥️ Screen Loading...</div>
                <div class="feed-badge feed-badge-sm">🖥️ Screen Active</div>
            </div>` :
            `<div class="feed-off feed-off-screen">🖥️ Screen Off</div>`;

        tile.innerHTML = `
            <div class="tile-header">
                <span class="tile-title">${safeName}</span>
                <span class="tile-status ${statusClass}">${status}</span>
                <span class="violation-count-badge ${severityClass}">${violationCount}</span>
            </div>
            <div class="video-container">
                ${cameraFeed}
                <div class="video-overlay video-overlay-bottom-left">
                    ${this.formatLastActivity(examinee.joinTime)}
                </div>
            </div>
            <div class="video-container video-container-stacked">
                ${screenFeed}
                <div class="video-overlay video-overlay-bottom-left">
                    ${this.formatLastActivity(examinee.joinTime)}
                </div>
            </div>
            <div class="tile-controls">
                <button class="btn btn-primary" data-action="focus">Focus</button>
                <button class="btn btn-warning" data-action="pause">Pause</button>
                <button class="btn btn-danger" data-action="remove">Remove</button>
            </div>
        `;

        // Wire up controls directly instead of inline onclick handlers that
        // reach for a global `examMonitoring` reference.
        tile.querySelector('[data-action="focus"]').addEventListener('click', () => this.focusExaminee(userId));
        tile.querySelector('[data-action="pause"]').addEventListener('click', () => this.pauseExaminee(userId));
        tile.querySelector('[data-action="remove"]').addEventListener('click', () => this.removeExaminee(userId));

        // Start real-time monitoring for this examinee
        this.startRealtimeMonitoring(userId);

        return tile;
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

    // Start periodic violation monitoring (for demonstration)
    startMockViolations() {
        const violationTypes = [
            'Cell Phone Detected',
            'Looking Away',
            'Multiple People Detected',
            'Book/Notes Detected',
            'Tab Switching',
            'Unauthorized Software'
        ];
        
        const examineeIds = Array.from(this.examinees.keys());
        
        setInterval(() => {
            if (examineeIds.length === 0) return;
            
            // 20% chance of generating a violation every 10 seconds
            if (Math.random() < 0.2) {
                const randomExamineeId = examineeIds[Math.floor(Math.random() * examineeIds.length)];
                const examinee = this.examinees.get(randomExamineeId);
                
                if (examinee) {
                    const randomType = violationTypes[Math.floor(Math.random() * violationTypes.length)];
                    const severity = randomType.includes('Cell Phone') || randomType.includes('Multiple People') ? 'high' : 'medium';
                    
                    const violation = {
                        id: 'demo-violation-' + Date.now(),
                        examineeId: randomExamineeId,
                        examineeName: examinee.name,
                        type: randomType,
                        severity: severity,
                        timestamp: new Date().toISOString(),
                        description: `AI detected: ${randomType.toLowerCase()}`
                    };
                    
                    this.violations.unshift(violation);
                    if (this.violations.length > 10) {
                        this.violations = this.violations.slice(0, 10);
                    }
                    
                    this.updateViolationsList();
                    
                    // Update examinee violation count
                    examinee.violations++;
                    if (severity === 'high') {
                        examinee.status = 'danger';
                    } else if (examinee.status !== 'danger') {
                        examinee.status = 'warning';
                    }
                    
                    this.updateExamineeList();
                    this.updateMonitoringGrid();
                    
                    console.log('🚨 Violation detected:', violation);
                }
            }
        }, 10000); // Every 10 seconds
    }

    // Start real-time monitoring for an examinee
    startRealtimeMonitoring(userId) {
        if (!this.realtimeMonitor) return;
        
        // Start real-time monitoring updates
        this.realtimeMonitor.startRealtimeMonitoring();
        
        // Also start the traditional polling as backup
        this.monitorExamineeFeeds(userId);
    }

    async monitorExamineeFeeds(userId) {
        // Poll for updated frames every 5 seconds
        const feedInterval = setInterval(async () => {
            try {
                if (!this.currentExam) {
                    clearInterval(feedInterval);
                    return;
                }
                
                // Get latest exam data from Firebase
                if (window.firebaseApp && window.firebaseReady) {
                    const { db } = window.firebaseApp;
                    const examDoc = await db.collection('exams').doc(this.currentExam.id).get();
                    
                    if (!examDoc.exists) {
                        clearInterval(feedInterval);
                        return;
                    }
                    
                    const examData = examDoc.data();
                    const examinees = examData.examinees || [];
                    const examinee = examinees.find(e => (e.uid || e.id) === userId);
                    
                    if (examinee) {
                        // Update camera feed from Cloudinary URL
                        if (examinee.cameraFrameUrl) {
                            const cameraImg = document.getElementById(`camera-${userId}`);
                            if (cameraImg) {
                                // Add timestamp to prevent caching
                                const timestamp = new Date().getTime();
                                cameraImg.src = `${examinee.cameraFrameUrl}?t=${timestamp}`;
                                
                                // Show the image and hide placeholder
                                cameraImg.style.display = 'block';
                                const placeholder = cameraImg.nextElementSibling;
                                if (placeholder && placeholder.classList.contains('camera-placeholder')) {
                                    placeholder.style.display = 'none';
                                }
                                
                                // Run YOLO detection on the camera frame
                                if (this.isYoloReady) {
                                    this.runYOLODetection(cameraImg, userId, examinee);
                                }
                                
                                console.log(`📹 Updated camera feed for ${userId}: ${examinee.cameraFrameUrl}`);
                            }
                        }
                        
                        // Update screen feed from Cloudinary URL
                        if (examinee.screenFrameUrl) {
                            const screenImg = document.getElementById(`screen-${userId}`);
                            if (screenImg) {
                                // Add timestamp to prevent caching
                                const timestamp = new Date().getTime();
                                screenImg.src = `${examinee.screenFrameUrl}?t=${timestamp}`;
                                
                                // Show the image and hide placeholder
                                screenImg.style.display = 'block';
                                const placeholder = screenImg.nextElementSibling;
                                if (placeholder && placeholder.classList.contains('screen-placeholder')) {
                                    placeholder.style.display = 'none';
                                }
                                
                                console.log(`🖥️ Updated screen feed for ${userId}: ${examinee.screenFrameUrl}`);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error monitoring feeds:', error);
            }
        }, 1000); // Poll every 1 second for real-time updates
        
        // Store interval so we can clear it later
        if (!this.feedIntervals) this.feedIntervals = new Map();
        this.feedIntervals.set(userId, feedInterval);
    }
    
    // Run YOLO detection on camera frame
    async runYOLODetection(imgElement, userId, examinee) {
        try {
            if (!this.yoloLoader || !this.isYoloReady) return;
            
            // Create canvas from image
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Wait for image to load
            if (!imgElement.complete) return;
            
            canvas.width = imgElement.naturalWidth || 640;
            canvas.height = imgElement.naturalHeight || 480;
            ctx.drawImage(imgElement, 0, 0);
            
            // Get image data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Preprocess image
            const tensorData = this.yoloLoader.preprocessImage(imageData);
            
            // Run inference
            const detections = await this.yoloLoader.runInference(tensorData);
            
            // Filter relevant detections
            const relevantDetections = this.yoloLoader.filterRelevantDetections(detections);
            
            // Process violations
            if (relevantDetections.length > 0) {
                this.processYOLOViolations(userId, examinee, relevantDetections);
            }
            
        } catch (error) {
            console.error('YOLO detection error:', error);
        }
    }
    
    // Process YOLO violations
    processYOLOViolations(userId, examinee, detections) {
        detections.forEach(detection => {
            // Determine violation severity
            let severity = 'medium';
            let violationType = detection.className;
            
            // High severity items
            if (['cell phone', 'laptop', 'book'].includes(detection.className)) {
                severity = 'high';
            }
            
            // Check for multiple people
            const personCount = detections.filter(d => d.className === 'person').length;
            if (personCount > 1) {
                severity = 'high';
                violationType = 'Multiple People Detected';
            }
            
            // Create violation
            const violation = {
                id: 'yolo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                examineeId: userId,
                examineeName: examinee.name || examinee.email,
                type: `${detection.className} detected`,
                severity: severity,
                timestamp: new Date().toISOString(),
                description: `AI detected: ${detection.className} (confidence: ${(detection.confidence * 100).toFixed(1)}%)`,
                data: {
                    className: detection.className,
                    confidence: detection.confidence,
                    bbox: detection.bbox
                }
            };
            
            // Add to violations list
            this.violations.unshift(violation);
            
            // Keep only last 50 violations
            if (this.violations.length > 50) {
                this.violations = this.violations.slice(0, 50);
            }
            
            // Update violations display
            this.updateViolationsList();
            
            // Update examinee status
            const currentExaminee = this.examinees.get(userId);
            if (currentExaminee) {
                if (severity === 'high') {
                    currentExaminee.status = 'danger';
                } else {
                    currentExaminee.status = 'warning';
                }
                currentExaminee.violations++;
            }
            
            console.log('🚨 YOLO Violation:', violation);
        });
    }

    getExamineeStatus(examinee) {
        // examinee.violations is a count (see loadExaminees()), not an array
        // of violation objects, so severity comes from the `status` field
        // that gets set directly by processYOLOViolations()/startMockViolations()
        // when a high/medium severity violation is recorded.
        if (examinee.status === 'danger') return 'Warning';
        if (examinee.status === 'warning') return 'Caution';
        if (examinee.violations > 0) return 'Caution';
        return 'Active';
    }

    getStatusClass(status) {
        switch (status) {
            case 'Active': return 'active';
            case 'Caution': return 'warning';
            case 'Warning': return 'danger';
            default: return 'active';
        }
    }

    updateSystemStatus() {
        document.getElementById('totalExaminees').textContent = this.examinees.size;
        document.getElementById('activeFeeds').textContent = this.examinees.size;
        document.getElementById('violationsToday').textContent = this.violations.length;
        
        // Update system uptime
        this.updateUptime();
    }

    updateUptime() {
        const startTime = this.currentExam?.startedAt ? new Date(this.currentExam.startedAt) : new Date();
        const now = new Date();
        const diff = now - startTime;
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        document.getElementById('systemUptime').textContent = `${hours}h ${minutes}m`;
    }

    async loadViolations() {
        try {
            if (!this.currentExam) return;

                // Load violations from Firebase or use empty array
            if (window.firebaseApp && window.firebaseReady) {
                try {
                    const { db } = window.firebaseApp;
                    const examDoc = await db.collection('exams').doc(this.currentExam.id).get();
                    if (examDoc.exists) {
                        const examData = examDoc.data();
                        this.violations = examData.violations || [];
                    } else {
                        this.violations = [];
                    }
                } catch (error) {
                    console.error('Error loading violations from Firebase:', error);
                    this.violations = [];
                }
            } else {
                this.violations = [];
            }
            this.updateViolationsList();
        } catch (error) {
            console.error('Error loading violations:', error);
        }
    }

    updateViolationsList() {
        const violationsList = document.getElementById('violationsList');
        violationsList.innerHTML = '';

        if (this.violations.length === 0) {
            violationsList.innerHTML = '<p style="color: #bdc3c7; text-align: center;">No violations detected</p>';
            return;
        }

        // Show recent violations (last 10)
        const recentViolations = this.violations.slice(-10);
        
        recentViolations.forEach(violation => {
            const violationItem = document.createElement('div');
            violationItem.className = 'violation-item';
            violationItem.dataset.violationId = violation.id;

            const time = new Date(violation.timestamp).toLocaleTimeString();
            
            violationItem.innerHTML = `
                <div class="violation-type">${this.formatViolationType(violation.type)}</div>
                <div class="violation-time">${time}</div>
                <span class="violation-severity ${violation.severity}">${violation.severity}</span>
            `;

            violationItem.addEventListener('click', () => this.showViolationDetails(violation));
            violationsList.appendChild(violationItem);
        });
    }

    formatViolationType(type) {
        const typeMap = {
            'suspicious_tab': 'Suspicious Tab Change',
            'suspicious_url_change': 'Suspicious URL',
            'page_hidden': 'Page Hidden',
            'page_lost_focus': 'Page Lost Focus',
            'yolo_detection': 'YOLO Detection',
            'keyboard_shortcut': 'Keyboard Shortcut',
            'suspicious_mouse_pattern': 'Mouse Pattern',
            'suspicious_content_detected': 'Suspicious Content',
            'external_iframe_detected': 'External Iframe',
            'external_script_detected': 'External Script',
            'multiple_exam_tabs': 'Multiple Tabs',
            'developer_tools_detected': 'Developer Tools',
            'suspicious_extensions_detected': 'Suspicious Extensions'
        };

        return typeMap[type] || type;
    }

    async toggleMonitoring() {
        try {
            if (!this.currentExam) return;

            const newMonitoringState = !this.isMonitoring;

            const { db } = window.firebaseApp;
            await db.collection('exams').doc(this.currentExam.id).update({
                monitoringPaused: !newMonitoringState
            });

            this.isMonitoring = newMonitoringState;
            this.updateMonitoringStatus();

            const pauseBtn = document.getElementById('pauseBtn');
            if (this.isMonitoring) {
                pauseBtn.textContent = 'Pause';
                pauseBtn.className = 'btn btn-warning';
            } else {
                pauseBtn.textContent = 'Resume';
                pauseBtn.className = 'btn btn-success';
            }
        } catch (error) {
            console.error('Error toggling monitoring:', error);
            this.showNotification('Failed to toggle monitoring', 'error');
        }
    }

    // Read-modify-write helpers matching the pattern already used elsewhere
    // in this codebase (see popup.js) for Firestore array fields that have no
    // atomic "update one entry" operation.
    async updateExamineesArray(mutatorFn) {
        const { db } = window.firebaseApp;
        const examRef = db.collection('exams').doc(this.currentExam.id);
        const examDoc = await examRef.get();
        if (!examDoc.exists) throw new Error('Exam not found');

        const examinees = examDoc.data().examinees || [];
        const updated = mutatorFn(examinees);
        await examRef.update({ examinees: updated });
        return updated;
    }

    async updateViolationsArray(mutatorFn) {
        const { db } = window.firebaseApp;
        const examRef = db.collection('exams').doc(this.currentExam.id);
        const examDoc = await examRef.get();
        if (!examDoc.exists) throw new Error('Exam not found');

        const violations = examDoc.data().violations || [];
        const updated = mutatorFn(violations);
        await examRef.update({ violations: updated });
        return updated;
    }

    updateMonitoringStatus() {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        
        if (this.isMonitoring) {
            statusDot.classList.add('active');
            statusText.textContent = 'Monitoring Active';
        } else {
            statusDot.classList.remove('active');
            statusText.textContent = 'Monitoring Paused';
        }
    }

    showSettings() {
        this.openModal(document.getElementById('settingsModal'));

        // Load current settings
        document.getElementById('yoloConfidence').value = this.settings.yoloConfidence;
        document.getElementById('confidenceValue').textContent = this.settings.yoloConfidence;
        document.getElementById('yoloNMS').value = this.settings.yoloNMS;
        document.getElementById('nmsValue').textContent = this.settings.yoloNMS;
        document.getElementById('frameRate').value = this.settings.frameRate;
        document.getElementById('autoFlag').checked = this.settings.autoFlag;
    }

    hideSettings() {
        this.closeModal(document.getElementById('settingsModal'));
    }

    async saveSettings() {
        try {
            const newSettings = {
                yoloConfidence: parseFloat(document.getElementById('yoloConfidence').value),
                yoloNMS: parseFloat(document.getElementById('yoloNMS').value),
                frameRate: parseInt(document.getElementById('frameRate').value),
                autoFlag: document.getElementById('autoFlag').checked
            };

            // Update YOLO thresholds in the model loader
            if (this.yoloLoader) {
                this.yoloLoader.updateThresholds({
                    confidence: newSettings.yoloConfidence,
                    nms: newSettings.yoloNMS
                });
            }

            // YOLO thresholds are a purely client-side detection-sensitivity
            // setting - just persist them locally, no backend call needed.
            await chrome.storage.local.set({
                yoloThresholds: {
                    confidence: newSettings.yoloConfidence,
                    nms: newSettings.yoloNMS
                }
            });

            this.settings = newSettings;
            this.saveSettingsToStorage();
            this.hideSettings();
            
            // Show success message
            this.showNotification('Settings saved successfully', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Failed to save settings', 'error');
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['monitoringSettings']);
            if (result.monitoringSettings) {
                this.settings = { ...this.settings, ...result.monitoringSettings };
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    saveSettingsToStorage() {
        chrome.storage.local.set({ monitoringSettings: this.settings });
    }

    async focusExaminee(userId) {
        try {
            // Highlight examinee in list
            document.querySelectorAll('.examinee-item').forEach(item => {
                item.classList.remove('active');
            });

            const examineeItem = document.querySelector(`[data-user-id="${userId}"]`);
            if (examineeItem) {
                examineeItem.classList.add('active');
            }

            // Scroll to examinee tile
            const tile = document.querySelector(`[data-user-id="${userId}"]`);
            if (tile) {
                tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Examinee data is already loaded locally by loadExaminees() -
            // no need for a round trip through background.js.
            const examinee = this.examinees.get(userId);
            if (examinee) {
                const recentViolations = this.violations.filter(v => v.examineeId === userId);
                this.showExamineeDetails({ ...examinee, id: userId, recentViolations });
            }
        } catch (error) {
            console.error('Error focusing examinee:', error);
        }
    }

    showExamineeDetails(examinee) {
        const nameEl = document.getElementById('examineeDetailName');
        const emailEl = document.getElementById('examineeDetailEmail');
        const bodyEl = document.getElementById('examineeDetailsBody');
        if (!bodyEl) return;

        // Name/email are user-controlled - set via textContent, never innerHTML.
        if (nameEl) nameEl.textContent = examinee.name || 'Unknown';
        if (emailEl) emailEl.textContent = examinee.email || 'Unknown';

        const status = this.getExamineeStatus(examinee);
        const violationsHtml = (examinee.recentViolations || []).slice(0, 5)
            .map(v => `<li>${this.escapeHtml(this.formatViolationType(v.type))} - <span class="violation-severity ${v.severity}">${this.escapeHtml(v.severity)}</span> - ${new Date(v.timestamp).toLocaleString()}</li>`)
            .join('') || '<li>No recent violations</li>';

        bodyEl.innerHTML = `
            <p><strong>Status:</strong> ${this.escapeHtml(status)}</p>
            <p><strong>Violation count:</strong> ${examinee.violations || 0}</p>
            <p><strong>Camera:</strong> ${examinee.cameraEnabled ? 'Enabled' : 'Off'}</p>
            <p><strong>Screen Share:</strong> ${examinee.screenEnabled ? 'Enabled' : 'Off'}</p>
            <p><strong>Joined:</strong> ${examinee.joinTime ? new Date(examinee.joinTime).toLocaleString() : 'Unknown'}</p>
            <h4>Recent Violations</h4>
            <ul>${violationsHtml}</ul>
        `;

        this.openModal(document.getElementById('examineeDetailsModal'));
    }

    hideExamineeDetails() {
        this.closeModal(document.getElementById('examineeDetailsModal'));
    }

    async pauseExaminee(userId) {
        try {
            const examinee = this.examinees.get(userId);
            const shouldPause = !(examinee && examinee.paused);

            await this.updateExamineesArray(examinees => examinees.map(e => {
                if ((e.uid || e.id) === userId) {
                    return { ...e, paused: shouldPause };
                }
                return e;
            }));

            this.showNotification(shouldPause ? 'Monitoring paused for examinee' : 'Monitoring resumed for examinee', 'success');
            this.loadExaminees(); // Refresh the list
        } catch (error) {
            console.error('Error pausing examinee:', error);
            this.showNotification('Failed to update examinee monitoring', 'error');
        }
    }

    async removeExaminee(userId) {
        try {
            if (confirm('Are you sure you want to remove this examinee from the exam?')) {
                await this.updateExamineesArray(examinees => examinees.filter(e => (e.uid || e.id) !== userId));

                this.examinees.delete(userId);
                this.updateExamineeList();
                this.updateMonitoringGrid();
                this.updateSystemStatus();
                this.showNotification('Examinee removed successfully', 'success');
            }
        } catch (error) {
            console.error('Error removing examinee:', error);
            this.showNotification('Failed to remove examinee', 'error');
        }
    }

    showViolationDetails(violation) {
        const violationDetails = document.getElementById('violationDetails');

        // Every violation object in this codebase uses `examineeId`, not
        // `userId` - this lookup used to always miss.
        const examineeName = this.examinees.get(violation.examineeId)?.name || violation.examineeName || 'Unknown';

        violationDetails.innerHTML = `
            <div class="violation-detail">
                <h4>Violation Type: ${this.escapeHtml(this.formatViolationType(violation.type))}</h4>
                <p><strong>Severity:</strong> <span class="violation-severity ${violation.severity}">${this.escapeHtml(violation.severity)}</span></p>
                <p><strong>Time:</strong> ${new Date(violation.timestamp).toLocaleString()}</p>
                <p><strong>Examinee:</strong> ${this.escapeHtml(examineeName)}</p>
                ${violation.data ? `<p><strong>Details:</strong> ${this.escapeHtml(JSON.stringify(violation.data, null, 2))}</p>` : ''}
            </div>
        `;

        this.openModal(document.getElementById('violationModal'));
        this.currentViolation = violation;
    }

    hideViolationModal() {
        this.closeModal(document.getElementById('violationModal'));
        this.currentViolation = null;
    }

    async acknowledgeViolation() {
        if (!this.currentViolation) return;

        try {
            await this.updateViolationsArray(violations => violations.map(v =>
                v.id === this.currentViolation.id
                    ? { ...v, acknowledged: true, acknowledgedAt: new Date().toISOString() }
                    : v
            ));

            this.showNotification('Violation acknowledged', 'success');
            this.hideViolationModal();
            this.loadViolations(); // Refresh violations list
        } catch (error) {
            console.error('Error acknowledging violation:', error);
            this.showNotification('Failed to acknowledge violation', 'error');
        }
    }

    async dismissViolation() {
        if (!this.currentViolation) return;

        try {
            await this.updateViolationsArray(violations => violations.filter(v => v.id !== this.currentViolation.id));

            this.showNotification('Violation dismissed', 'success');
            this.hideViolationModal();
            this.loadViolations(); // Refresh violations list
        } catch (error) {
            console.error('Error dismissing violation:', error);
            this.showNotification('Failed to dismiss violation', 'error');
        }
    }

    closeMonitoring() {
        if (confirm('Are you sure you want to close the monitoring interface?')) {
            // Clear all feed intervals
            if (this.feedIntervals) {
                this.feedIntervals.forEach((interval, userId) => {
                    clearInterval(interval);
                });
                this.feedIntervals.clear();
            }
            
            // Clear timer interval
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            
            window.close();
        }
    }


    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + S for settings
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.showSettings();
        }
        
        // Ctrl/Cmd + P for pause/resume
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            this.toggleMonitoring();
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            this.hideSettings();
            this.hideViolationModal();
            this.hideExamineeDetails();
        }
    }

    startPeriodicUpdates() {
        // Update system status every minute
        setInterval(() => {
            this.updateUptime();
        }, 60000);

        // Refresh examinee data every 30 seconds
        setInterval(() => {
            this.loadExaminees();
            this.loadViolations();
        }, 30000);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1001;
            animation: slideIn 0.3s ease;
        `;

        // Set background color based on type
        switch (type) {
            case 'success':
                notification.style.background = '#27ae60';
                break;
            case 'error':
                notification.style.background = '#e74c3c';
                break;
            case 'warning':
                notification.style.background = '#f39c12';
                break;
            default:
                notification.style.background = '#3498db';
        }

        // Add to DOM
        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    // Debug function to check monitoring status
    async debugMonitoringStatus() {
        console.log('🔧 DEBUGGING MONITORING STATUS:');
        console.log('Current exam:', this.currentExam);
        console.log('Examinees loaded:', this.examinees.size);
        console.log('Firebase ready:', window.firebaseReady);
        console.log('Firebase app:', !!window.firebaseApp);
        
        if (this.currentExam && window.firebaseApp && window.firebaseReady) {
            try {
                const { db } = window.firebaseApp;
                const examDoc = await db.collection('exams').doc(this.currentExam.id).get();
                
                if (examDoc.exists) {
                    const examData = examDoc.data();
                    console.log('Exam data:', examData);
                    console.log('Examinees in Firebase:', examData.examinees);
                    
                    examData.examinees?.forEach((examinee, index) => {
                        console.log(`Examinee ${index}:`, {
                            uid: examinee.uid,
                            email: examinee.email,
                            cameraEnabled: examinee.cameraEnabled,
                            screenEnabled: examinee.screenEnabled,
                            cameraFrameUrl: examinee.cameraFrameUrl,
                            screenFrameUrl: examinee.screenFrameUrl
                        });
                    });
                } else {
                    console.log('❌ Exam document not found in Firebase');
                }
            } catch (error) {
                console.error('❌ Error debugging Firebase:', error);
            }
        }
        
        // Check DOM elements
        console.log('DOM elements:');
        this.examinees.forEach((examinee, userId) => {
            const cameraImg = document.getElementById(`camera-${userId}`);
            const screenImg = document.getElementById(`screen-${userId}`);
            console.log(`User ${userId}:`, {
                cameraImg: !!cameraImg,
                screenImg: !!screenImg,
                cameraImgSrc: cameraImg?.src,
                screenImgSrc: screenImg?.src
            });
        });
    }
}

// Initialize the monitoring interface
const examMonitoring = new ExamMonitoringInterface();

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .violation-detail h4 {
        color: #ecf0f1;
        margin-bottom: 15px;
    }
    
    .violation-detail p {
        margin-bottom: 10px;
        color: #bdc3c7;
    }
    
    .violation-detail strong {
        color: #ecf0f1;
    }
`;
document.head.appendChild(style);
