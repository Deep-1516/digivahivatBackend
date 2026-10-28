/**
 * config/firebase.js
 *
 * Firebase Admin SDK integration for sending Push Notifications
 * (Emergency SOS broadcasts, urgent society announcements, etc.).
 *
 * Degrades gracefully if credentials or packages are not yet installed.
 */
const fs   = require('fs');
const path = require('path');

let admin = null;
let isInitialized = false;

try {
  admin = require('firebase-admin');
} catch (_) {
  // firebase-admin is not yet installed
}

function initializeFirebase() {
  if (isInitialized || !admin) return;

  try {
    let serviceAccount = null;

    // 1. Check environment variable (raw JSON string or file path)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (raw.startsWith('{')) {
        serviceAccount = JSON.parse(raw);
      } else if (fs.existsSync(raw)) {
        serviceAccount = JSON.parse(fs.readFileSync(raw, 'utf8'));
      }
    }

    // 2. Check root or config folder for serviceAccountKey.json
    if (!serviceAccount) {
      const pathsToCheck = [
        path.join(__dirname, 'serviceAccountKey.json'),
        path.join(__dirname, '..', '..', 'serviceAccountKey.json'),
        path.join(__dirname, '..', 'serviceAccountKey.json'),
      ];
      for (const p of pathsToCheck) {
        if (fs.existsSync(p)) {
          serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
          break;
        }
      }
    }

    if (!serviceAccount) {
      console.log('ℹ️  [Firebase] Push notifications pending: serviceAccountKey.json not found yet.');
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    isInitialized = true;
    console.log('✅ [Firebase] Firebase Admin SDK initialized successfully for Push Notifications.');
  } catch (err) {
    console.warn('⚠️  [Firebase] Error initializing Firebase Admin:', err.message);
  }
}

// Auto-attempt initialization on import
initializeFirebase();

/**
 * Sends high-priority Emergency SOS push notification to residents and admins
 */
async function sendSosNotification({
  tokens = [],
  senderName = 'Resident',
  flatNo = 'General',
  emergencyType = 'General',
  description = '',
  alertId = '',
}) {
  if (!isInitialized || !admin) {
    console.log(`ℹ️  [Firebase] Simulated SOS push to ${tokens.length} device(s) (Firebase credentials pending).`);
    return { success: false, reason: 'FIREBASE_NOT_CONFIGURED', count: tokens.length };
  }

  const validTokens = [...new Set(tokens.filter(Boolean))];
  if (validTokens.length === 0) {
    return { success: true, count: 0 };
  }

  const message = {
    tokens: validTokens,
    notification: {
      title: `🚨 EMERGENCY SOS: Flat ${flatNo}`,
      body: `${senderName} reported a ${emergencyType} emergency! Immediate help requested.`,
    },
    data: {
      type: 'EMERGENCY_SOS',
      alertId: String(alertId || ''),
      flatNo: String(flatNo || ''),
      emergencyType: String(emergencyType || 'General'),
      senderName: String(senderName || ''),
      description: String(description || ''),
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'emergency_sos',
        priority: 'max',
        sound: 'default',
        color: '#DC2626',
        defaultVibrateTimings: true,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          contentAvailable: true,
        },
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`📣 [Firebase SOS Broadcast] Sent: ${response.successCount} succeeded, ${response.failureCount} failed.`);
    
    // Identify invalid tokens that need cleanup
    const deadTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered'
        ) {
          deadTokens.push(validTokens[idx]);
        }
      }
    });

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      deadTokens,
    };
  } catch (err) {
    console.error('❌ [Firebase] Failed to send SOS push notification:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  admin,
  isFirebaseConfigured: () => isInitialized,
  sendSosNotification,
};

