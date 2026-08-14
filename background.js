// Background service worker for Exam Proctor Extension
//
// This is a minimal, real coordinator between:
//  - exam-session.js (the examinee's persistent exam tab), which reports that
//    monitoring should start/stop for a given user+exam, and
//  - content.js (running in every tab the examinee visits during the exam),
//    which asks whether it should activate its violation detectors and
//    reports violations it finds.
//
// There is intentionally no exam/user CRUD here - popup.js, exam-session.js
// and monitoring.js talk to Firestore directly for that. This file only
// tracks "is there an active monitored session right now, and which tab
// should violations be relayed back to".

const STORAGE_KEY = 'activeSession';

// In-memory session state: { userId, examId, examTabId } or null.
let activeSession = null;

/**
 * Rehydrate activeSession from chrome.storage.local so it survives
 * service-worker restarts (MV3 workers can be killed/respawned at any time).
 */
async function loadActiveSession() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        activeSession = result[STORAGE_KEY] || null;
        console.log('Rehydrated activeSession from storage:', activeSession);
    } catch (error) {
        console.error('Failed to load activeSession from storage:', error);
        activeSession = null;
    }
}

async function persistActiveSession() {
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: activeSession });
    } catch (error) {
        console.error('Failed to persist activeSession:', error);
    }
}

async function handleMessage(request, sender, sendResponse) {
    try {
        switch (request.action) {
            case 'startContentMonitoring': {
                const examTabId = sender.tab ? sender.tab.id : null;
                activeSession = {
                    userId: request.userId,
                    examId: request.examId,
                    examTabId
                };
                await persistActiveSession();
                console.log('Content monitoring started:', activeSession);
                sendResponse({ success: true });
                break;
            }

            case 'stopContentMonitoring': {
                activeSession = null;
                await persistActiveSession();
                console.log('Content monitoring stopped');
                sendResponse({ success: true });
                break;
            }

            case 'checkMonitoringStatus': {
                sendResponse({
                    isMonitoring: !!activeSession,
                    userId: activeSession ? activeSession.userId : undefined,
                    examId: activeSession ? activeSession.examId : undefined
                });
                break;
            }

            case 'reportViolation': {
                const violation = request.violation;

                // Relay the violation to the examinee's persistent exam tab so
                // it can be written into Firestore. The tab may no longer
                // exist (closed, navigated away, etc.) - that's fine, just
                // swallow the error.
                if (activeSession && activeSession.examTabId) {
                    try {
                        await chrome.tabs.sendMessage(activeSession.examTabId, {
                            action: 'persistViolation',
                            violation
                        });
                    } catch (error) {
                        console.log('Could not relay violation to exam tab (tab may be closed):', error.message);
                    }
                }

                try {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                        title: 'Exam Violation Detected',
                        message: `Violation detected: ${violation && violation.type ? violation.type : 'unknown'}`,
                        priority: 2
                    });
                } catch (error) {
                    console.error('Failed to show violation notification:', error);
                }

                sendResponse({ success: true });
                break;
            }

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender, sendResponse);
    return true; // Keep message channel open for async response
});

// Rehydrate on service-worker startup (both cold start and onStartup).
loadActiveSession();

chrome.runtime.onInstalled.addListener(() => {
    console.log('Exam Proctor Extension installed');
});

chrome.runtime.onStartup.addListener(() => {
    console.log('Exam Proctor Extension started');
    loadActiveSession();
});
