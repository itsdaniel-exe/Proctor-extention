// Exam Proctor Extension - Simplified Popup Script
// Handles authentication and the three main exam functions

class ExamProctor {
    constructor() {
        this.currentUser = null;
        this.currentExam = null;
        this.isProctoring = false;
        this.init();
    }

    async init() {
        this.currentSection = null;
        this.setupEventListeners();
        await this.checkAuthState();
        this.updateConnectionStatus('connecting');
    }

    setupEventListeners() {
        // Authentication
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        document.getElementById('showRegisterBtn').addEventListener('click', () => this.showRegistration());
        document.getElementById('registerBtn').addEventListener('click', () => this.register());
        document.getElementById('backToLoginBtn').addEventListener('click', () => this.showLogin());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Main options
        document.getElementById('createExamOption').addEventListener('click', () => this.showCreateExam());
        document.getElementById('attendExamOption').addEventListener('click', () => this.showAttendExam());
        document.getElementById('proctorExamOption').addEventListener('click', () => this.showProctorExam());

        // Create exam
        document.getElementById('createExamBtn').addEventListener('click', () => this.createExam());
        document.getElementById('backToMainBtn').addEventListener('click', () => this.clearAndGoToMain());
        document.getElementById('startExamBtn').addEventListener('click', () => this.startExam());
        document.getElementById('viewExamBtn').addEventListener('click', () => this.viewExamDashboard());

        // Attend exam
        document.getElementById('joinExamBtn').addEventListener('click', () => this.joinExam());
        document.getElementById('backToMainBtn2').addEventListener('click', () => this.showMainOptions());
        document.getElementById('reopenSessionBtn').addEventListener('click', () => this.reopenExamSession());
        document.getElementById('debugCameraBtn').addEventListener('click', () => this.debugCamera());
        document.getElementById('leaveExamBtn').addEventListener('click', () => this.leaveExam());

        // Proctor exam
        document.getElementById('joinProctorBtn').addEventListener('click', () => this.joinAsProctor());
        document.getElementById('backToMainBtn3').addEventListener('click', () => this.showMainOptions());
        document.getElementById('openMonitoringBtn').addEventListener('click', () => this.openMonitoring());
        document.getElementById('refreshFeedsBtn').addEventListener('click', () => this.refreshFeeds());
        document.getElementById('leaveProctorBtn').addEventListener('click', () => this.leaveProctor());

        // Form interactions
        document.getElementById('orgOnlyCheck').addEventListener('change', (e) => {
            document.getElementById('orgEmailGroup').style.display = e.target.checked ? 'block' : 'none';
        });
    }

    async checkAuthState() {
        try {
            const { auth } = window.firebaseApp;
            
            auth.onAuthStateChanged(async (user) => {
                console.log('Auth state changed:', user ? 'User logged in' : 'User logged out');
                
                if (user) {
                    console.log('User authenticated, getting profile...');
                    this.currentUser = await this.getUserProfile(user.uid);
                    console.log('Profile loaded:', this.currentUser);
                    
                    // Restore last section instead of always showing main options
                    await this.restoreLastSection();
                    this.updateStatusIndicator('active', 'Connected');
                    this.updateConnectionStatus('connected');
                } else {
                    this.currentUser = null;
                    this.showLogin();
                    this.updateStatusIndicator('inactive', 'Not Connected');
                    this.updateConnectionStatus('disconnected');
                }
            });
            
            // Also check current user immediately
            const currentUser = auth.currentUser;
            if (currentUser) {
                console.log('Current user found on init:', currentUser.email);
                this.currentUser = await this.getUserProfile(currentUser.uid);
                // Restore last section instead of always showing main options
                await this.restoreLastSection();
                this.updateStatusIndicator('active', 'Connected');
                this.updateConnectionStatus('connected');
            } else {
                console.log('No current user on init');
                this.showLogin();
            }
        } catch (error) {
            console.error('Auth state check failed:', error);
            this.showAuthStatus('Authentication error', 'error');
            this.updateConnectionStatus('disconnected');
        }
    }

    async getUserProfile(uid) {
        try {
            const { db, auth } = window.firebaseApp;
            const userDoc = await db.collection('users').doc(uid).get();
            
            if (userDoc.exists) {
                return { uid, ...userDoc.data() };
            } else {
                // Create user profile if it doesn't exist
                const user = auth.currentUser;
                const userProfile = {
                    uid: user.uid,
                    email: user.email,
                    role: 'user', // Default role for regular users
                    createdAt: window.firebaseApp.FieldValue.serverTimestamp(),
                    lastLogin: window.firebaseApp.FieldValue.serverTimestamp()
                };
                
                await db.collection('users').doc(uid).set(userProfile);
                return userProfile;
            }
        } catch (error) {
            console.error('Failed to get user profile:', error);
            return null;
        }
    }

    async login() {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;

        if (!email || !password) {
            this.showAuthStatus('Please fill in all fields', 'error');
            return;
        }

        try {
            const { auth } = window.firebaseApp;
            await auth.signInWithEmailAndPassword(email, password);
            
            // Get user profile after successful login
            const user = auth.currentUser;
            if (user) {
                this.currentUser = await this.getUserProfile(user.uid);
                this.showAuthStatus('Login successful!', 'success');
                
                // Explicitly show main options after successful login
                setTimeout(() => {
                    this.showMainOptions();
                    this.updateStatusIndicator('active', 'Connected');
                    this.updateConnectionStatus('connected');
                }, 500);
            }
        } catch (error) {
            console.error('Login failed:', error);
            this.showAuthStatus(this.getAuthErrorMessage(error), 'error');
        }
    }

    async register() {
        const email = document.getElementById('regEmailInput').value;
        const password = document.getElementById('regPasswordInput').value;
        const confirmPassword = document.getElementById('regConfirmPasswordInput').value;
        const fullName = document.getElementById('regFullNameInput').value;
        const college = document.getElementById('regCollegeInput').value;
        const studentId = document.getElementById('regStudentIdInput').value;
        const phone = document.getElementById('regPhoneInput').value;
        const termsAccepted = document.getElementById('regTermsCheck').checked;

        // Validation
        if (!email || !password || !confirmPassword || !fullName || !college || !termsAccepted) {
            this.showRegAuthStatus('Please fill in all required fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showRegAuthStatus('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            this.showRegAuthStatus('Password must be at least 6 characters long', 'error');
            return;
        }

        try {
            const { auth, db } = window.firebaseApp;
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            
            // Create comprehensive user profile
            const userProfile = {
                uid: userCredential.user.uid,
                email: email,
                fullName: fullName,
                college: college,
                studentId: studentId || null,
                phone: phone || null,
                role: 'user', // Regular user role
                createdAt: window.firebaseApp.FieldValue.serverTimestamp(),
                lastLogin: window.firebaseApp.FieldValue.serverTimestamp(),
                termsAccepted: termsAccepted,
                termsAcceptedAt: window.firebaseApp.FieldValue.serverTimestamp()
            };
            
            await db.collection('users').doc(userCredential.user.uid).set(userProfile);
            this.showRegAuthStatus('Registration successful! Redirecting to login...', 'success');
            
            // Clear form
            this.clearRegistrationForm();
            
            // Redirect to login after 2 seconds
            setTimeout(() => {
                this.showLogin();
            }, 2000);
        } catch (error) {
            console.error('Registration failed:', error);
            this.showRegAuthStatus(this.getAuthErrorMessage(error), 'error');
        }
    }

    async logout() {
        try {
            const { auth } = window.firebaseApp;
            await auth.signOut();
            this.currentUser = null;
            this.currentExam = null;
            this.isProctoring = false;
            
            // Clear saved section on logout
            await chrome.storage.local.remove(['lastSection']);
            
            this.showLogin();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    getAuthErrorMessage(error) {
        switch (error.code) {
            case 'auth/user-not-found':
                return 'User not found. Please register first.';
            case 'auth/wrong-password':
                return 'Incorrect password.';
            case 'auth/email-already-in-use':
                return 'Email already registered. Please login.';
            case 'auth/weak-password':
                return 'Password is too weak. Use at least 6 characters.';
            case 'auth/invalid-email':
                return 'Invalid email address.';
            default:
                return 'Authentication failed. Please try again.';
        }
    }

    showAuthStatus(message, type) {
        const statusEl = document.getElementById('authStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `auth-status ${type}`;
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'auth-status';
            }, 5000);
        }
    }

    showRegAuthStatus(message, type) {
        const statusEl = document.getElementById('regAuthStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `auth-status ${type}`;
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'auth-status';
            }, 5000);
        }
    }

    updateStatusIndicator(status, text) {
        const indicator = document.getElementById('statusIndicator');
        if (indicator) {
            const dot = indicator.querySelector('.status-dot');
            const textEl = indicator.querySelector('.status-text');
            
            if (dot) {
                dot.className = `status-dot ${status}`;
            }
            if (textEl) {
                textEl.textContent = text;
            }
        }
    }

    updateConnectionStatus(status) {
        const connectionEl = document.getElementById('connectionStatus');
        if (connectionEl) {
            connectionEl.className = `connection-status ${status}`;
            const dot = connectionEl.querySelector('.status-dot');
            const text = connectionEl.querySelector('.status-text');
            
            if (dot) {
                dot.className = `status-dot ${status}`;
            }
            if (text) {
                switch (status) {
                    case 'connected':
                        text.textContent = 'Connected to server';
                        break;
                    case 'connecting':
                        text.textContent = 'Connecting to server...';
                        break;
                    case 'disconnected':
                        text.textContent = 'Disconnected from server';
                        break;
                }
            }
        }
    }

    // Save current section to storage
    async saveCurrentSection(sectionName) {
        this.currentSection = sectionName;
        try {
            await chrome.storage.local.set({ lastSection: sectionName });
            console.log('Saved current section:', sectionName);
        } catch (error) {
            console.error('Failed to save section:', error);
        }
    }

    // Restore last section from storage
    async restoreLastSection() {
        try {
            const result = await chrome.storage.local.get(['lastSection']);
            const lastSection = result.lastSection;
            
            console.log('Restoring last section:', lastSection);
            
            if (lastSection) {
                // Map section names to their show functions (handle async)
                switch (lastSection) {
                    case 'mainOptions':
                        this.showMainOptions();
                        break;
                    case 'createExam':
                        await this.showCreateExam();
                        break;
                    case 'attendExam':
                        this.showAttendExam();
                        break;
                    case 'proctorExam':
                        this.showProctorExam();
                        break;
                    default:
                        this.showMainOptions();
                }
                console.log('Successfully restored section:', lastSection);
            } else {
                // No saved section, show main options
                this.showMainOptions();
            }
        } catch (error) {
            console.error('Failed to restore section:', error);
            this.showMainOptions();
        }
    }

    // Navigation functions
    hideAllSections() {
        const sections = document.querySelectorAll('.section');
        console.log('Hiding all sections, found:', sections.length);
        sections.forEach(section => {
            section.classList.remove('active');
            console.log('Removed active class from:', section.id);
        });
    }

    showLogin() {
        this.hideAllSections();
        document.getElementById('loginSection').classList.add('active');
    }

    showRegistration() {
        this.hideAllSections();
        document.getElementById('registrationSection').classList.add('active');
    }

    showMainOptions() {
        console.log('Showing main options...');
        this.hideAllSections();
        document.getElementById('mainOptionsSection').classList.add('active');
        
        // Update user info
        if (this.currentUser) {
            const userEmailEl = document.getElementById('userEmail');
            if (userEmailEl) {
                userEmailEl.textContent = this.currentUser.email;
                console.log('Updated user email display:', this.currentUser.email);
            }
        }
        
        // Save this section to storage
        this.saveCurrentSection('mainOptions');
        console.log('Main options section should now be visible');
    }
    
    // Clear created exam and go to main
    async clearAndGoToMain() {
        try {
            // Clear the created exam from storage
            await chrome.storage.local.remove(['createdExam']);
            
            // Clear the form
            document.getElementById('examTitleInput').value = '';
            document.getElementById('examDescriptionInput').value = '';
            document.getElementById('examDuration').value = '60';
            document.getElementById('orgOnlyCheck').checked = false;
            document.getElementById('orgEmailInput').value = '';
            document.getElementById('examCreatedSection').style.display = 'none';
            
            // Clear current exam
            this.currentExam = null;
            
            // Go to main options
            this.showMainOptions();
            
            console.log('Cleared created exam and returned to main');
        } catch (error) {
            console.error('Failed to clear exam:', error);
            this.showMainOptions();
        }
    }

    async showCreateExam() {
        this.hideAllSections();
        document.getElementById('createExamSection').classList.add('active');
        
        // Check if there's a created exam to restore
        await this.restoreCreatedExam();
        
        // Save this section to storage
        this.saveCurrentSection('createExam');
    }
    
    // Restore created exam data if it exists
    async restoreCreatedExam() {
        try {
            const result = await chrome.storage.local.get(['createdExam']);
            const createdExam = result.createdExam;
            
            if (createdExam) {
                console.log('Restoring created exam:', createdExam);
                
                // Fill in the exam title
                document.getElementById('examTitleInput').value = createdExam.title;
                
                // Show the exam codes
                document.getElementById('examineeCode').textContent = createdExam.examineeCode;
                document.getElementById('proctorCode').textContent = createdExam.proctorCode;
                document.getElementById('examCreatedSection').style.display = 'block';
                
                this.currentExam = createdExam.examineeCode;
                
                console.log('Successfully restored created exam');
            } else {
                // No created exam, hide the success section
                document.getElementById('examCreatedSection').style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to restore created exam:', error);
        }
    }

    showAttendExam() {
        this.hideAllSections();
        document.getElementById('attendExamSection').classList.add('active');
        // Save this section to storage
        this.saveCurrentSection('attendExam');
    }

    showProctorExam() {
        this.hideAllSections();
        document.getElementById('proctorExamSection').classList.add('active');
        // Save this section to storage
        this.saveCurrentSection('proctorExam');
    }

    // Create Exam Functions
    async createExam() {
        const title = document.getElementById('examTitleInput').value;
        const description = document.getElementById('examDescriptionInput').value;
        const duration = parseInt(document.getElementById('examDuration').value);
        const orgOnly = document.getElementById('orgOnlyCheck').checked;
        const orgEmail = document.getElementById('orgEmailInput').value;

        if (!title) {
            alert('Please enter an exam title');
            return;
        }

        try {
            const { db } = window.firebaseApp;
            
            // Generate unique codes
            const examineeCode = this.generateCode('EXAM');
            const proctorCode = this.generateCode('PROC');
            
            const examData = {
                title: title,
                description: description || '',
                duration: duration,
                examinerId: this.currentUser.uid,
                examinerEmail: this.currentUser.email,
                orgOnly: orgOnly,
                orgEmail: orgOnly ? orgEmail : null,
                status: 'created',
                examineeCode: examineeCode,
                proctorCode: proctorCode,
                createdAt: window.firebaseApp.FieldValue.serverTimestamp(),
                startTime: null,
                endTime: null,
                examinees: [],
                proctors: [],
                violations: []
            };

            await db.collection('exams').doc(examineeCode).set(examData);
            
            // Show success with codes
            document.getElementById('examineeCode').textContent = examineeCode;
            document.getElementById('proctorCode').textContent = proctorCode;
            document.getElementById('examCreatedSection').style.display = 'block';
            
            this.currentExam = examineeCode;
            
            // Save created exam data to storage
            await chrome.storage.local.set({
                createdExam: {
                    title: title,
                    examineeCode: examineeCode,
                    proctorCode: proctorCode,
                    timestamp: Date.now()
                }
            });
            
            alert('Exam created successfully!');
        } catch (error) {
            console.error('Failed to create exam:', error);
            alert('Failed to create exam. Please try again.');
        }
    }

    generateCode(prefix) {
        return prefix + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async startExam() {
        if (!this.currentExam) return;

        try {
            const { db } = window.firebaseApp;
            
            // Get exam data to calculate end time
            const examDoc = await db.collection('exams').doc(this.currentExam).get();
            if (!examDoc.exists) {
                alert('Exam not found');
                return;
            }
            
            const examData = examDoc.data();
            const duration = examData.duration || 60; // Default 60 minutes
            
            // Calculate end time (duration is in minutes)
            const startTime = new Date();
            const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
            
            await db.collection('exams').doc(this.currentExam).update({
                status: 'active',
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                duration: duration,
                actualStartTime: window.firebaseApp.FieldValue.serverTimestamp()
            });

            alert(`Exam started successfully! Duration: ${duration} minutes`);
            
            // Start monitoring exam time
            this.startExamTimeMonitoring(this.currentExam, endTime);
        } catch (error) {
            console.error('Failed to start exam:', error);
            alert('Failed to start exam. Please try again.');
        }
    }
    
    // Monitor exam time and auto-end when duration expires
    startExamTimeMonitoring(examId, endTime) {
        const checkInterval = setInterval(async () => {
            const now = new Date();
            const timeRemaining = endTime - now;
            
            // If time is up, end the exam
            if (timeRemaining <= 0) {
                clearInterval(checkInterval);
                await this.autoEndExam(examId);
            }
        }, 10000); // Check every 10 seconds
        
        // Store interval ID so we can clear it later
        if (!this.examTimers) this.examTimers = new Map();
        this.examTimers.set(examId, checkInterval);
    }
    
    // Automatically end exam when time runs out
    async autoEndExam(examId) {
        try {
            const { db } = window.firebaseApp;
            
            await db.collection('exams').doc(examId).update({
                status: 'completed',
                completedAt: window.firebaseApp.FieldValue.serverTimestamp(),
                autoEnded: true
            });
            
            // Notify all students
            alert('⏰ Exam time has ended! The exam has been automatically closed.');
            
            console.log(`Exam ${examId} automatically ended due to time expiration`);
        } catch (error) {
            console.error('Failed to auto-end exam:', error);
        }
    }

    viewExamDashboard() {
        // Store current exam data for monitoring dashboard
        chrome.storage.local.set({
            currentExam: {
                id: this.currentExam,
                title: document.getElementById('examTitleInput').value || 'Test Exam',
                code: this.currentExam,
                status: 'active'
            }
        });
        
        // Open monitoring dashboard
        chrome.windows.create({
            url: chrome.runtime.getURL('monitoring.html'),
            type: 'popup',
            width: 1200,
            height: 800
        });
    }

    // Attend Exam Functions
    async joinExam() {
        const code = document.getElementById('examineeCodeInput').value;
        if (!code) {
            alert('Please enter an examinee code');
            return;
        }

        try {
            const { db } = window.firebaseApp;
            const examDoc = await db.collection('exams').doc(code).get();
            
            if (!examDoc.exists) {
                alert('Exam not found. Please check the code.');
                return;
            }

            const examData = examDoc.data();
            
            // Check if exam is active
            if (examData.status !== 'active') {
                alert('This exam is not currently active.');
                return;
            }

            // Check organization restriction
            if (examData.orgOnly && examData.orgEmail) {
                const userDomain = this.currentUser.email.split('@')[1];
                if (userDomain !== examData.orgEmail) {
                    alert('This exam is restricted to ' + examData.orgEmail + ' users only.');
                    return;
                }
            }

            // Add examinee to exam
            await db.collection('exams').doc(code).update({
                examinees: window.firebaseApp.FieldValue.arrayUnion({
                    uid: this.currentUser.uid,
                    email: this.currentUser.email,
                    joinedAt: new Date().toISOString(),
                    status: 'active'
                })
            });

            this.currentExam = code;
            document.getElementById('joinedExamTitle').textContent = examData.title;
            document.getElementById('examJoinedSection').style.display = 'block';

            // Start countdown timer if exam has started
            if (examData.endTime) {
                this.startExamCountdown(examData.endTime);
            }

            // Monitor exam status for time expiration
            this.monitorExamStatus(code);

            // Camera/screen capture needs to survive the popup closing (Chrome
            // destroys the popup the instant it loses focus), so it runs in a
            // dedicated persistent tab instead of inline here.
            await this.openExamSession(code, examData.title, examData.endTime);
        } catch (error) {
            console.error('Failed to join exam:', error);
            alert('Failed to join exam. Please try again.');
        }
    }

    // Reopen the exam-session tab if the student closed it accidentally.
    async reopenExamSession() {
        try {
            const result = await chrome.storage.local.get(['activeExamSession']);
            if (result.activeExamSession) {
                chrome.tabs.create({ url: chrome.runtime.getURL('exam-session.html') });
            } else if (this.currentExam) {
                await this.openExamSession(
                    this.currentExam,
                    document.getElementById('joinedExamTitle').textContent || 'Exam Session',
                    null
                );
            } else {
                alert('No active exam session found. Please join an exam first.');
            }
        } catch (error) {
            console.error('Failed to reopen exam session:', error);
        }
    }

    // Open (or reopen) the persistent exam-session tab that hosts camera and
    // screen-share capture for the duration of the exam.
    async openExamSession(examId, examTitle, endTime) {
        try {
            await chrome.storage.local.set({
                activeExamSession: {
                    examId: examId,
                    userId: this.currentUser.uid,
                    userEmail: this.currentUser.email,
                    examTitle: examTitle,
                    endTime: endTime || null
                }
            });

            chrome.tabs.create({
                url: chrome.runtime.getURL('exam-session.html')
            });
        } catch (error) {
            console.error('Failed to open exam session tab:', error);
            alert('Failed to open the exam session tab. Please try again.');
        }
    }
    
    // Start countdown timer for exam
    startExamCountdown(endTime) {
        const timerElement = document.getElementById('examTimeRemaining');
        if (!timerElement) return;
        
        // Clear any existing timer
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        const updateTimer = () => {
            const now = new Date();
            const end = new Date(endTime);
            const timeRemaining = end - now;
            
            if (timeRemaining <= 0) {
                timerElement.textContent = '00:00:00';
                timerElement.style.color = '#ef4444'; // Red
                clearInterval(this.countdownInterval);
                alert('⏰ Exam time has ended!');
                return;
            }
            
            // Calculate hours, minutes, seconds
            const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
            
            // Format time
            const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            timerElement.textContent = formatted;
            
            // Change color when less than 5 minutes remaining
            if (timeRemaining < 5 * 60 * 1000) {
                timerElement.style.color = '#ef4444'; // Red
            } else if (timeRemaining < 15 * 60 * 1000) {
                timerElement.style.color = '#f59e0b'; // Orange
            } else {
                timerElement.style.color = '#10b981'; // Green
            }
        };
        
        // Update immediately and then every second
        updateTimer();
        this.countdownInterval = setInterval(updateTimer, 1000);
    }
    
    // Monitor exam status to check if it has ended
    monitorExamStatus(examCode) {
        // Clear any existing monitor
        if (this.statusMonitorInterval) {
            clearInterval(this.statusMonitorInterval);
        }
        
        this.statusMonitorInterval = setInterval(async () => {
            try {
                const { db } = window.firebaseApp;
                const examDoc = await db.collection('exams').doc(examCode).get();
                
                if (!examDoc.exists) return;
                
                const examData = examDoc.data();
                
                // Check if exam has been completed
                if (examData.status === 'completed') {
                    clearInterval(this.statusMonitorInterval);
                    clearInterval(this.countdownInterval);
                    
                    document.getElementById('examStatus').textContent = 'Exam Ended';
                    document.getElementById('examTimeRemaining').textContent = '00:00:00';
                    document.getElementById('examTimeRemaining').style.color = '#ef4444';
                    
                    alert('⏰ This exam has ended. Thank you for participating!');
                }
            } catch (error) {
                console.error('Error monitoring exam status:', error);
            }
        }, 10000); // Check every 10 seconds
    }

    // Debug camera function
    async debugCamera() {
        console.log('🔧 Starting camera debug...');
        
        let debugInfo = '🔧 CAMERA DEBUG INFO:\n\n';
        
        // Check browser support
        debugInfo += `✅ navigator.mediaDevices: ${!!navigator.mediaDevices}\n`;
        debugInfo += `✅ getUserMedia: ${!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)}\n`;
        debugInfo += `✅ getDisplayMedia: ${!!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)}\n`;
        debugInfo += `✅ HTTPS: ${location.protocol === 'https:' || location.hostname === 'localhost'}\n`;
        debugInfo += `✅ Chrome Extension: ${typeof chrome !== 'undefined' && !!chrome.runtime}\n`;
        
        // Check permissions
        if (navigator.permissions) {
            try {
                const cameraPermission = await navigator.permissions.query({ name: 'camera' });
                debugInfo += `📷 Camera permission: ${cameraPermission.state}\n`;
            } catch (e) {
                debugInfo += `📷 Camera permission: Error checking (${e.message})\n`;
            }
        } else {
            debugInfo += `📷 Camera permission: Permissions API not available\n`;
        }
        
        // Check available devices
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            debugInfo += `📹 Video devices found: ${videoDevices.length}\n`;
            videoDevices.forEach((device, index) => {
                debugInfo += `   ${index + 1}. ${device.label || 'Unnamed camera'} (${device.deviceId.substring(0, 8)}...)\n`;
            });
        } catch (e) {
            debugInfo += `📹 Device enumeration error: ${e.message}\n`;
        }
        
        // Test actual camera access
        debugInfo += '\n🎥 Testing camera access...\n';
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240 },
                audio: false
            });
            
            debugInfo += `✅ Camera access SUCCESS!\n`;
            debugInfo += `📹 Stream tracks: ${stream.getTracks().length}\n`;
            
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                const settings = videoTrack.getSettings();
                debugInfo += `📐 Resolution: ${settings.width}x${settings.height}\n`;
                debugInfo += `🎯 FPS: ${settings.frameRate}\n`;
            }
            
            // Stop the test stream
            stream.getTracks().forEach(track => track.stop());
            
        } catch (error) {
            debugInfo += `❌ Camera access FAILED!\n`;
            debugInfo += `   Error: ${error.name}\n`;
            debugInfo += `   Message: ${error.message}\n`;
            
            if (error.name === 'NotAllowedError') {
                debugInfo += `💡 SOLUTION: Allow camera access in browser settings\n`;
                debugInfo += `   1. Click the camera icon in address bar\n`;
                debugInfo += `   2. Select "Allow" for camera access\n`;
                debugInfo += `   3. Or go to chrome://settings/content/camera\n`;
            } else if (error.name === 'NotFoundError') {
                debugInfo += `💡 SOLUTION: Connect a camera to your device\n`;
            } else if (error.name === 'NotSupportedError') {
                debugInfo += `💡 SOLUTION: Update Chrome or try different browser\n`;
            }
        }
        
        // Show debug info
        alert(debugInfo);
        console.log(debugInfo);
        
        // Also open camera test page
        chrome.tabs.create({
            url: chrome.runtime.getURL('camera-test.html')
        });
    }
    
    async leaveExam() {
        if (!this.currentExam) return;

        try {
            const { db } = window.firebaseApp;
            await db.collection('exams').doc(this.currentExam).update({
                examinees: window.firebaseApp.FieldValue.arrayRemove({
                    uid: this.currentUser.uid,
                    email: this.currentUser.email
                })
            });

            // Clear timers
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
            if (this.statusMonitorInterval) {
                clearInterval(this.statusMonitorInterval);
                this.statusMonitorInterval = null;
            }

            // Camera/screen capture now runs in the dedicated exam-session
            // tab (see exam-session.js), not inline in the popup - nothing
            // to stop here.
            await chrome.storage.local.remove(['activeExamSession']);

            this.currentExam = null;
            document.getElementById('examJoinedSection').style.display = 'none';
            alert('Left exam successfully');
        } catch (error) {
            console.error('Failed to leave exam:', error);
            alert('Failed to leave exam. Please try again.');
        }
    }

    // Proctor Exam Functions
    async joinAsProctor() {
        const code = document.getElementById('proctorCodeInput').value;
        if (!code) {
            alert('Please enter a proctor code');
            return;
        }

        try {
            const { db } = window.firebaseApp;
            // Search for exam by proctor code instead of document ID
            const examQuery = await db.collection('exams').where('proctorCode', '==', code).get();
            
            if (examQuery.empty) {
                alert('Exam not found. Please check the code.');
                return;
            }
            
            const examDoc = examQuery.docs[0];

            const examData = examDoc.data();
            
            // Check if exam is active
            if (examData.status !== 'active') {
                alert('This exam is not currently active.');
                return;
            }

            // Add proctor to exam
            await db.collection('exams').doc(examDoc.id).update({
                proctors: window.firebaseApp.FieldValue.arrayUnion({
                    uid: this.currentUser.uid,
                    email: this.currentUser.email,
                    joinedAt: new Date().toISOString(),
                    status: 'active'
                })
            });

            this.currentExam = examDoc.id;
            this.isProctoring = true;
            document.getElementById('proctorExamTitle').textContent = examData.title;
            document.getElementById('proctorExamStatus').textContent = examData.status;
            document.getElementById('activeExaminees').textContent = examData.examinees?.length || 0;
            document.getElementById('proctorJoinedSection').style.display = 'block';
            
            alert('Successfully joined as proctor: ' + examData.title);
        } catch (error) {
            console.error('Failed to join as proctor:', error);
            alert('Failed to join as proctor. Please try again.');
        }
    }

    openMonitoring() {
        // Store current exam data for monitoring dashboard
        chrome.storage.local.set({
            currentExam: {
                id: this.currentExam || 'EXAM',
                title: 'Exam Monitoring',
                code: this.currentExam || 'EXAM123',
                status: 'active'
            }
        });
        
        // Open monitoring dashboard
        chrome.windows.create({
            url: chrome.runtime.getURL('monitoring.html'),
            type: 'popup',
            width: 1200,
            height: 800
        });
    }

    refreshFeeds() {
        alert('Refreshing monitoring feeds...');
    }

    async leaveProctor() {
        if (!this.currentExam || !this.isProctoring) return;

        try {
            const { db } = window.firebaseApp;
            await db.collection('exams').doc(this.currentExam).update({
                proctors: window.firebaseApp.FieldValue.arrayRemove({
                    uid: this.currentUser.uid,
                    email: this.currentUser.email
                })
            });

            this.currentExam = null;
            this.isProctoring = false;
            document.getElementById('proctorJoinedSection').style.display = 'none';
            alert('Stopped proctoring successfully');
        } catch (error) {
            console.error('Failed to leave proctor mode:', error);
            alert('Failed to stop proctoring. Please try again.');
        }
    }

    clearRegistrationForm() {
        document.getElementById('regEmailInput').value = '';
        document.getElementById('regPasswordInput').value = '';
        document.getElementById('regConfirmPasswordInput').value = '';
        document.getElementById('regFullNameInput').value = '';
        document.getElementById('regCollegeInput').value = '';
        document.getElementById('regStudentIdInput').value = '';
        document.getElementById('regPhoneInput').value = '';
        document.getElementById('regTermsCheck').checked = false;
    }
}

// Initialize the extension when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, checking Firebase availability...');

    // Keep the footer copyright year current without hardcoding it (inline
    // scripts are blocked by the extension's CSP, so this lives here).
    const footerYearEl = document.getElementById('footerYear');
    if (footerYearEl) {
        footerYearEl.textContent = new Date().getFullYear();
    }

    // Wait for Firebase to be available
    const initExtension = () => {
        if (window.firebaseApp && window.firebaseReady) {
            console.log('Firebase ready, initializing extension...');
            try {
                new ExamProctor();
                console.log('Extension initialized successfully');
            } catch (error) {
                console.error('Failed to initialize extension:', error);
            }
        } else {
            console.log('Waiting for Firebase...', {
                firebaseApp: !!window.firebaseApp,
                firebaseReady: !!window.firebaseReady
            });
            setTimeout(initExtension, 100);
        }
    };
    
    // Start initialization
    initExtension();
    
    // Timeout after 10 seconds
    setTimeout(() => {
        if (!window.firebaseApp || !window.firebaseReady) {
            console.error('Firebase initialization timeout after 10 seconds');
            const statusEl = document.getElementById('connectionStatus');
            if (statusEl) {
                statusEl.innerHTML = '<span class="status-dot error"></span><span class="status-text">Connection failed - check console</span>';
            }
        }
    }, 10000);
});
