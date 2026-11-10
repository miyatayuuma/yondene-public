// Firebase Web SDK config (public client identifiers, NOT admin secrets).
// Access to reading records is controlled by Firebase Authentication + Firestore rules.
export const firebaseConfig = {
  apiKey: "AIzaSyBmF8qdYlX7ZIXYOC_IixMdeU_5llIqPxY",
  authDomain: "kodomo-reading-shelf-87f11.firebaseapp.com",
  projectId: "kodomo-reading-shelf-87f11",
  storageBucket: "kodomo-reading-shelf-87f11.firebasestorage.app",
  messagingSenderId: "565070188680",
  appId: "1:565070188680:web:1e94bbcb854526b0dc0f3d"
};

// Live forest AI: set workerUrl to the deployed HTTPS Cloudflare Worker URL.
// Until then, the existing Firebase AI Logic implementation remains active.
// Public reCAPTCHA site keys and Worker URLs are not private API credentials.
export const forestAIConfig = {
  enabled: true,
  workerUrl: '',
  appCheckSiteKey: '6LfIFBkuAAAAAPGF2MMF5MlRfUAX_GZ_KLgqqKfw',
  modelId: 'gemini-3.8-flash'
};
