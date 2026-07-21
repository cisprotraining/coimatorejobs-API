import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import FcmToken from '../models/fcmToken.model.js';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

const normalizePrivateKey = (value = '') => value.replace(/\\n/g, '\n');

const getFirebaseProjectId = () =>
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  '';

const getServiceAccountCredentials = () => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    return {
      client_email: serviceAccount.client_email,
      private_key: normalizePrivateKey(serviceAccount.private_key || ''),
    };
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    client_email: clientEmail,
    private_key: normalizePrivateKey(privateKey),
  };
};

const getAccessToken = async () => {
  const credentials = getServiceAccountCredentials();
  if (!credentials) return null;

  const auth = new GoogleAuth({
    credentials,
    scopes: [FCM_SCOPE],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token?.token || null;
};

export const isFcmConfigured = () =>
  Boolean(getFirebaseProjectId() && getServiceAccountCredentials());

export const getFirebaseWebConfig = () => ({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: getFirebaseProjectId(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '',
});

const pruneInactiveTokens = async (tokens = []) => {
  if (!tokens.length) return;
  await FcmToken.updateMany({ token: { $in: tokens } }, { isActive: false });
};

export const sendPushToTokens = async (tokens = [], payload = {}) => {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  const projectId = getFirebaseProjectId();
  const accessToken = await getAccessToken();

  if (!uniqueTokens.length || !projectId || !accessToken) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const results = await Promise.allSettled(
    uniqueTokens.map((token) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: Object.fromEntries(
              Object.entries(payload.data || {}).map(([key, value]) => [key, String(value ?? '')]),
            ),
            webpush: {
              fcm_options: {
                link: payload.link || process.env.FRONTEND_URL || '/',
              },
            },
          },
        }),
      }).then(async (response) => {
        if (!response.ok) {
          const body = await response.text();
          const error = new Error(body || `FCM request failed with ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return response.json();
      }),
    ),
  );

  const staleTokens = [];
  let sent = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent += 1;
      return;
    }

    failed += 1;
    const message = result.reason?.message || '';
    if (
      result.reason?.status === 404 ||
      message.includes('UNREGISTERED') ||
      message.includes('registration-token-not-registered')
    ) {
      staleTokens.push(uniqueTokens[index]);
    }
  });

  await pruneInactiveTokens(staleTokens);

  return {
    attempted: uniqueTokens.length,
    sent,
    failed,
    skipped: false,
  };
};

export const sendPushToUsers = async (userIds = [], payload = {}) => {
  const ids = [...new Set(userIds.filter(Boolean).map((id) => String(id)))];
  if (!ids.length) return { attempted: 0, sent: 0, failed: 0, skipped: true };

  const tokenDocs = await FcmToken.find({
    user: { $in: ids },
    isActive: true,
  }).select('token');

  return sendPushToTokens(
    tokenDocs.map((doc) => doc.token),
    payload,
  );
};
