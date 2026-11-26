/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
  readonly VITE_REFRESH_TOKEN_STORAGE?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_MARKETPLACE_URL?: string;
  /** Firebase PUBLIC web app config for browser push (Project settings → Your apps → Web app). Never a service account. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** PUBLIC Web Push (VAPID) key from Cloud Messaging → Web Push certificates. Never the private key. */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
