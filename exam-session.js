// Exam Session - persistent tab that hosts an examinee's camera/screen
// capture for the duration of an exam.
//
// This exists because the extension's toolbar popup is destroyed by Chrome
// the instant it loses focus, so any getUserMedia()/getDisplayMedia() stream
// started inside popup.js dies as soon as the student clicks back into the
// exam page. Moving capture into a normal persistent tab keeps the streams
// alive for as long as the tab stays open.
//
// Responsibilities:
//  - Load the exam + user context saved by popup.js when the student joined.
//  - Let the student enable camera / screen share, uploading periodic frames
//    via the (currently placeholder-configured) CloudinaryStorageManager.
//  - Tell background.js to start/stop content-script monitoring for this
//    user+exam (see background.js's 'startContentMonitoring' handler).
//  - Receive violations relayed by background.js (originally detected by
//    content.js in *other* tabs the student visits) and persist them into
//    the exam's Firestore document in the same shape monitoring.js expects.

const SESSION_STORAGE_KEY = 'activeExamSession';

// Violation types content.js actually emits (see content.js reportViolation
// call sites) that we treat as high severity; everything else defaults to
// medium.
const HIGH_SEVERITY_TYPES = new Set([
    'developer_tools_detected',
    'suspicious_url_change',
    'multiple_exam_tabs',
    'external_script_detected',
    'suspicious_extensions_detected'
]);

class ExamSession {
    constructor() {
        this.currentUser = null;
        this.sessionInfo = null; // { examId, userId, userEmail, examTitle, endTime }
        this.cameraStream = null;
        this.screenStream = null;
        this.cameraInterval = null;
        this.screenInterval = null;
        this.countdownInterval = null;
        this.statusMonitorInterval = null;
        this.violationCount = 0;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.waitForFirebase();
        await this.loadSessionInfo();

        if (!this.sessionInfo) {
            this.showMessage('No active exam session found. Please join an exam from the extension popup.', true);
            return;
        }

        await this.resolveCurrentUser();
        await this.loadExamData();
        this.startContentMonitoring();
        this.monitorExamStatus();

        // Listen for violations relayed from background.js (detected by
        // content.js in other tabs).
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'persistViolation') {
                this.handleIncomingViolation(request.violation);
                sendResponse({ success: true });
            }
        });

        window.addEventListener('beforeunload', () => {
            this.stopContentMonitoring();
        });
    }

    bindEvents() {
        document.getElementById('enableCameraBtn').addEventListener('click', () => this.enableCamera());
        document.getElementById('shareScreenBtn').addEventListener('click', () => this.shareScreen());
        document.getElementById('leaveExamBtn').addEventListener('click', () => this.endExam());
    }

    waitForFirebase() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.firebaseApp && window.firebaseReady) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
            // Don't hang forever if Firebase never initializes.
            setTimeout(resolve, 8000);
        });
    }

    async loadSessionInfo() {
        const result = await chrome.storage.local.get([SESSION_STORAGE_KEY]);
        this.sessionInfo = result[SESSION_STORAGE_KEY] || null;
    }

    async resolveCurrentUser() {
        try {
            const { auth } = window.firebaseApp;
            let user = auth.currentUser;

            if (!user) {
                // Auth state may not have hydrated yet - wait briefly for it.
                user = await new Promise((resolve) => {
                    const unsubscribe = auth.onAuthStateChanged((u) => {
                        unsubscribe();
                        resolve(u);
                    });
                    setTimeout(() => resolve(auth.currentUser), 3000);
                });
            }

            this.currentUser = user
                ? { uid: user.uid, email: user.email }
                : { uid: this.sessionInfo.userId, email: this.sessionInfo.userEmail };
        } catch (error) {
            console.error('Failed to resolve current user:', error);
            this.currentUser = { uid: this.sessionInfo.userId, email: this.sessionInfo.userEmail };
        }
    }

    async loadExamData() {
        document.getElementById('examTitle').textContent = this.sessionInfo.examTitle || 'Exam Session';

        try {
            const { db } = window.firebaseApp;
            const examDoc = await db.collection('exams').doc(this.sessionInfo.examId).get();

            if (examDoc.exists) {
                const examData = examDoc.data();
                document.getElementById('examTitle').textContent = examData.title || this.sessionInfo.examTitle || 'Exam Session';
                document.getElementById('examStatusText').textContent = examData.status || 'active';

                if (examData.endTime) {
                    this.sessionInfo.endTime = examData.endTime;
                    this.startCountdown(examData.endTime);
                }
            }
        } catch (error) {
            console.error('Failed to load exam data:', error);
        }
    }

    startCountdown(endTime) {
        const timerElement = document.getElementById('examTimer');
        if (!timerElement) return;

        if (this.countdownInterval) clearInterval(this.countdownInterval);

        const update = () => {
            const now = new Date();
            const end = new Date(endTime);
            const remaining = end - now;

            if (remaining <= 0) {
                timerElement.textContent = '00:00:00';
                clearInterval(this.countdownInterval);
                this.showMessage('Exam time has ended.', false);
                return;
            }

            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            timerElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };

        update();
        this.countdownInterval = setInterval(update, 1000);
    }

    monitorExamStatus() {
        if (this.statusMonitorInterval) clearInterval(this.statusMonitorInterval);

        this.statusMonitorInterval = setInterval(async () => {
            try {
                const { db } = window.firebaseApp;
                const examDoc = await db.collection('exams').doc(this.sessionInfo.examId).get();
                if (!examDoc.exists) return;

                const examData = examDoc.data();
                document.getElementById('examStatusText').textContent = examData.status || 'active';

                if (examData.status === 'completed') {
                    clearInterval(this.statusMonitorInterval);
                    this.showMessage('This exam has ended. You may close this tab.', false);
                    this.stopContentMonitoring();
                }
            } catch (error) {
                console.error('Error monitoring exam status:', error);
            }
        }, 10000);
    }

    // --- background.js coordination -----------------------------------

    startContentMonitoring() {
        chrome.runtime.sendMessage({
            action: 'startContentMonitoring',
            userId: this.currentUser.uid,
            examId: this.sessionInfo.examId
        }, (response) => {
            const textEl = document.getElementById('contentMonitoringText');
            const dot = document.getElementById('monitoringDot');
            if (response && response.success) {
                if (textEl) textEl.textContent = 'Active';
                if (dot) dot.classList.add('active');
                document.getElementById('monitoringStatusText').textContent = 'Monitoring Active';
            } else {
                if (textEl) textEl.textContent = 'Failed to start';
            }
        });
    }

    stopContentMonitoring() {
        try {
            chrome.runtime.sendMessage({ action: 'stopContentMonitoring' });
        } catch (error) {
            // Extension context may already be gone during unload - ignore.
        }
    }

    // --- Violation handling ---------------------------------------------

    async handleIncomingViolation(violation) {
        if (!violation) return;

        this.violationCount++;
        const countEl = document.getElementById('violationCount');
        if (countEl) countEl.textContent = this.violationCount;

        const severity = HIGH_SEVERITY_TYPES.has(violation.type) ? 'high' : 'medium';

        const enrichedViolation = {
            id: 'content_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            examineeId: violation.userId || this.currentUser.uid,
            examineeName: this.currentUser.email,
            type: violation.type,
            severity,
            timestamp: violation.timestamp || new Date().toISOString(),
            description: `Detected on page: ${violation.type}`,
            data: violation.data,
            pageUrl: violation.pageUrl
        };

        try {
            await this.persistViolation(enrichedViolation);
        } catch (error) {
            console.error('Failed to persist violation:', error);
        }
    }

    async persistViolation(violation) {
        const { db } = window.firebaseApp;
        const examRef = db.collection('exams').doc(this.sessionInfo.examId);
        const examDoc = await examRef.get();
        if (!examDoc.exists) return;

        const data = examDoc.data();
        const violationsArray = data.violations || [];
        violationsArray.push(violation);
        // Cap stored violations so the document doesn't grow unbounded.
        if (violationsArray.length > 200) {
            violationsArray.splice(0, violationsArray.length - 200);
        }

        const examineesArray = data.examinees || [];
        const idx = examineesArray.findIndex(e => (e.uid || e.id) === violation.examineeId);
        if (idx !== -1) {
            const currentCount = typeof examineesArray[idx].violations === 'number' ? examineesArray[idx].violations : 0;
            examineesArray[idx] = { ...examineesArray[idx], violations: currentCount + 1 };
        }

        await examRef.update({
            violations: violationsArray,
            examinees: examineesArray
        });
    }

    // --- Camera / screen capture -----------------------------------------

    async enableCamera() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera API not supported in this browser');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                audio: false
            });

            this.cameraStream = stream;

            const container = document.getElementById('cameraPreviewContainer');
            container.innerHTML = '';
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.muted = true;
            video.playsInline = true;
            video.style.transform = 'scaleX(-1)';
            container.appendChild(video);
            video.play().catch(error => console.error('Camera video failed to start playing:', error));

            this.startFrameCapture(stream, 'camera');
        } catch (error) {
            console.error('Camera access failed:', error);
            this.showMessage(`Camera access failed: ${error.message}`, true);
        }
    }

    async shareScreen() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            this.screenStream = stream;

            const container = document.getElementById('screenPreviewContainer');
            container.innerHTML = '';
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.muted = true;
            container.appendChild(video);
            video.play().catch(error => console.error('Screen-share video failed to start playing:', error));

            this.startFrameCapture(stream, 'screen');

            stream.getVideoTracks()[0].onended = () => {
                this.screenStream = null;
                if (this.screenInterval) clearInterval(this.screenInterval);
                container.innerHTML = '<p class="media-placeholder">Screen sharing stopped</p>';
            };
        } catch (error) {
            console.error('Screen sharing failed:', error);
            this.showMessage(`Screen sharing failed: ${error.message}`, true);
        }
    }

    // Capture frames from a stream and upload them through the (placeholder
    // until configured) CloudinaryStorageManager instead of hardcoded
    // Cloudinary credentials.
    startFrameCapture(stream, type) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 640;
        canvas.height = 480;

        const captureInterval = setInterval(async () => {
            if (!stream.active) {
                clearInterval(captureInterval);
                return;
            }

            try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    try {
                        const storage = window.firebaseApp && window.firebaseApp.storage;
                        if (!storage) return;

                        const folder = `exam-monitoring/${this.sessionInfo.examId}/${this.currentUser.uid}`;
                        const result = await storage.uploadFile(blob, folder);

                        await this.updateExamineeFrame(type, result.url);
                    } catch (error) {
                        // Expected while Cloudinary credentials are placeholders -
                        // don't spam the console with a stack trace every second.
                        console.log(`Frame upload skipped for ${type} (Cloudinary not configured):`, error.message);
                    }
                }, 'image/jpeg', 0.8);
            } catch (error) {
                console.error('Frame capture error:', error);
            }
        }, 1000);

        if (type === 'camera') {
            this.cameraInterval = captureInterval;
        } else {
            this.screenInterval = captureInterval;
        }
    }

    async updateExamineeFrame(type, frameUrl) {
        try {
            const { db } = window.firebaseApp;
            const examRef = db.collection('exams').doc(this.sessionInfo.examId);
            const examDoc = await examRef.get();
            if (!examDoc.exists) return;

            const examineesArray = examDoc.data().examinees || [];
            const idx = examineesArray.findIndex(e => (e.uid || e.id) === this.currentUser.uid);
            if (idx === -1) return;

            examineesArray[idx] = {
                ...examineesArray[idx],
                [`${type}FrameUrl`]: frameUrl,
                [`${type}FrameTimestamp`]: new Date().toISOString(),
                [`${type}Enabled`]: true
            };

            await examRef.update({ examinees: examineesArray });
        } catch (error) {
            console.error(`Failed to update ${type} frame:`, error);
        }
    }

    // --- Leaving the exam --------------------------------------------------

    async endExam() {
        if (!confirm('End your exam session? This will stop monitoring and camera/screen sharing.')) {
            return;
        }

        this.stopContentMonitoring();

        if (this.cameraInterval) clearInterval(this.cameraInterval);
        if (this.screenInterval) clearInterval(this.screenInterval);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        if (this.statusMonitorInterval) clearInterval(this.statusMonitorInterval);

        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
        }
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }

        try {
            const { db } = window.firebaseApp;
            await db.collection('exams').doc(this.sessionInfo.examId).update({
                examinees: window.firebaseApp.FieldValue.arrayRemove({
                    uid: this.currentUser.uid,
                    email: this.currentUser.email
                })
            });
        } catch (error) {
            console.log('Could not remove examinee entry (shape may differ from stored entry):', error.message);
        }

        await chrome.storage.local.remove([SESSION_STORAGE_KEY]);

        this.showMessage('Exam session ended. This tab can be closed.', false);
        setTimeout(() => window.close(), 1500);
    }

    showMessage(message, isError) {
        const el = document.getElementById('sessionMessage');
        if (!el) return;
        el.textContent = message;
        el.style.color = isError ? '#ef4444' : 'inherit';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ExamSession();
});
