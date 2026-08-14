/**
 * Firebase Configuration for Exam Proctor Extension
 * IEEE Standard Compliant Implementation
 * 
 * This module handles Firebase initialization and configuration
 * with enhanced security and error handling.
 * 
 * @author Exam Proctor Team
 * @version 2.0.0
 * @license MIT
 */

// Firebase Configuration - Replace with your actual config
const firebaseConfig = {
    apiKey: "AIzaSyD6xYmIIz8E5eDQ8JwsWFg_7SV4cmDUncw",
    authDomain: "ieee-ocd.firebaseapp.com",
    projectId: "ieee-ocd",
    storageBucket: "ieee-ocd.firebasestorage.app",
    messagingSenderId: "113954770966",
    appId: "1:113954770966:web:edc28364acddf50998a537",
    measurementId: "G-LZN9KPS4ZT"
};

// Cloudinary Configuration (Free alternative to Firebase Storage)
const cloudinaryConfig = {
    cloudName: "YOUR_CLOUD_NAME",
    uploadPreset: "YOUR_UPLOAD_PRESET",
    apiKey: "YOUR_API_KEY"
};

/**
 * Firebase Service Manager Class
 */
class FirebaseServiceManager {
    constructor() {
        this.app = null;
        this.auth = null;
        this.db = null;
        this.functions = null;
        this.isInitialized = false;
        this.connectionStatus = 'disconnected';
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    /**
     * Initialize Firebase services with error handling
     */
    async initialize() {
        try {
            // Check if Firebase is available
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK not loaded');
            }

            // Initialize Firebase app
            this.app = firebase.initializeApp(firebaseConfig);
            console.log('Firebase app initialized successfully');

            // Initialize services
            await this.initializeServices();

            // Setup connection monitoring
            this.setupConnectionMonitoring();

            this.isInitialized = true;
            this.connectionStatus = 'connected';

            console.log('Firebase services initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Firebase:', error);
            this.connectionStatus = 'error';
            return false;
        }
    }

    /**
     * Initialize individual Firebase services
     */
    async initializeServices() {
        try {
            // Initialize Auth
            this.auth = this.app.auth();
            console.log('Firebase Auth initialized');

            // Initialize Firestore with settings
            this.db = this.app.firestore();
            this.db.settings({
                cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
                merge: true
            });
            console.log('Firebase Firestore initialized');

            // Initialize Functions
            this.functions = this.app.functions();
            console.log('Firebase Functions initialized');

            // Enable offline persistence
            await this.enableOfflinePersistence();

        } catch (error) {
            console.error('Failed to initialize Firebase services:', error);
            throw error;
        }
    }

    /**
     * Enable offline persistence for Firestore
     */
    async enableOfflinePersistence() {
        try {
            await this.db.enablePersistence({
                synchronizeTabs: true
            });
            console.log('Firestore offline persistence enabled');
        } catch (error) {
            if (error.code === 'failed-precondition') {
                console.log('Persistence failed - multiple tabs open');
            } else if (error.code === 'unimplemented') {
                console.log('Persistence not supported in this browser');
            } else {
                console.error('Failed to enable persistence:', error);
            }
        }
    }

    /**
     * Setup connection monitoring
     */
    setupConnectionMonitoring() {
        // Monitor Firestore connection
        this.db.enableNetwork().then(() => {
            this.connectionStatus = 'connected';
            this.retryCount = 0;
        }).catch((error) => {
            console.error('Firestore connection failed:', error);
            this.connectionStatus = 'disconnected';
            this.handleConnectionError();
        });

        // Monitor Auth state
        this.auth.onAuthStateChanged((user) => {
            if (user) {
                console.log('User authenticated:', user.uid);
            } else {
                console.log('User not authenticated');
            }
        });
    }

    /**
     * Handle connection errors with retry logic
     */
    async handleConnectionError() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`Retrying connection (${this.retryCount}/${this.maxRetries})...`);

            setTimeout(async () => {
                try {
                    await this.db.enableNetwork();
                    this.connectionStatus = 'connected';
                    this.retryCount = 0;
                } catch (error) {
                    this.handleConnectionError();
                }
            }, 5000 * this.retryCount); // Exponential backoff
        } else {
            console.error('Max retry attempts reached. Connection failed.');
            this.connectionStatus = 'failed';
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            status: this.connectionStatus,
            isInitialized: this.isInitialized,
            retryCount: this.retryCount
        };
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.app) {
            this.app.delete();
        }
        this.isInitialized = false;
        this.connectionStatus = 'disconnected';
    }
}

// Initialize Firebase services
const firebaseManager = new FirebaseServiceManager();

/**
 * Cloudinary Storage Manager
 */
class CloudinaryStorageManager {
    constructor() {
        this.config = cloudinaryConfig;
        this.uploadQueue = [];
        this.isUploading = false;
    }

    /**
     * Upload file to Cloudinary
     * @param {File} file - File to upload
     * @param {string} folder - Upload folder
     * @returns {Promise<Object>} Upload result
     */
    async uploadFile(file, folder = 'exam-proctor') {
        if (!this.config.cloudName || this.config.cloudName === 'YOUR_CLOUD_NAME') {
            // Cloudinary isn't configured yet - fail quietly instead of
            // hitting the network and logging a scary error every frame.
            throw new Error('Cloudinary not configured (placeholder cloudName)');
        }

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', this.config.uploadPreset);
            formData.append('folder', folder);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${this.config.cloudName}/auto/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            return {
                url: result.secure_url,
                publicId: result.public_id,
                format: result.format,
                size: result.bytes,
                uploadedAt: new Date().toISOString()
            };
        } catch (error) {
            // Caller (exam-session.js) already logs a friendly message for
            // this expected-while-unconfigured case - don't double-log here.
            throw error;
        }
    }

    /**
     * Delete file from Cloudinary
     * @param {string} publicId - Public ID of file to delete
     * @returns {Promise<boolean>} Deletion result
     */
    async deleteFile(publicId) {
        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/destroy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    public_id: publicId,
                    api_key: this.config.apiKey
                })
            });

            const result = await response.json();
            return result.result === 'ok';
        } catch (error) {
            console.error('Cloudinary deletion failed:', error);
            return false;
        }
    }
}

// Initialize storage manager
const storageManager = new CloudinaryStorageManager();

/**
 * Initialize Firebase and make services available globally
 */
async function initializeFirebase() {
    try {
        const success = await firebaseManager.initialize();

        if (success) {
            // Make Firebase services available globally
            window.firebaseApp = {
                auth: firebaseManager.auth,
                db: firebaseManager.db,
                functions: firebaseManager.functions,
                storage: storageManager,
                manager: firebaseManager,
                // Add FieldValue for compatibility
                FieldValue: firebase.firestore.FieldValue
            };

            // Set Firebase ready flag
            window.firebaseReady = true;

            console.log('Firebase initialized successfully');
            console.log('Connection status: Connected to Firebase');

            // Emit ready event
            window.dispatchEvent(new CustomEvent('firebaseReady', {
                detail: { status: 'connected' }
            }));
        } else {
            throw new Error('Firebase initialization failed');
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
        window.firebaseReady = false;

        // Emit error event
        window.dispatchEvent(new CustomEvent('firebaseError', {
            detail: { error: error.message }
        }));
    }
}

// Start Firebase initialization
initializeFirebase();
