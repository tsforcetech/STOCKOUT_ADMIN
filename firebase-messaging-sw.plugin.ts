import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Emits /firebase-messaging-sw.js (under the app's base path) from the same public VITE_FIREBASE_* values the app
 * uses, so the Firebase web config lives in one place. A service worker cannot read import.meta.env, which is why it is
 * generated here instead of being a hand-edited file in public/. Only the PUBLIC web config is written: no
 * service-account JSON, private key or server secret ever reaches this file.
 *
 * When the config is incomplete nothing is emitted and the app never registers a worker (push stays off, the inbox
 * keeps working).
 */
export interface FirebaseSwOptions {
  /** Result of Vite's loadEnv(mode, cwd, ""). */
  env: Record<string, string>;
  /** Public base path ("/" or "/STOCKOUT_BUYER/"). */
  base: string;
  /** In-app inbox path relative to the base, e.g. "account/notifications". Push clicks always open this page. */
  inboxPath: string;
  /** Icon file relative to the base (must exist in public/). */
  icon: string;
}

export const FIREBASE_SW_FILE = "firebase-messaging-sw.js";

export function firebaseWebConfig(env: Record<string, string>) {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: env.VITE_FIREBASE_APP_ID ?? "",
  };
  const complete = Object.values(config).every((v) => v.trim() !== "") && (env.VITE_FIREBASE_VAPID_KEY ?? "").trim() !== "";
  return { config, complete };
}

function firebaseVersion(): string {
  const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), "node_modules/firebase/package.json"), "utf8")) as { version: string };
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error(`Unexpected firebase version "${pkg.version}"`);
  return pkg.version;
}

export function renderFirebaseSw(config: Record<string, string>, version: string, inboxPath: string, icon: string): string {
  const cdn = `https://www.gstatic.com/firebasejs/${version}`;
  return `/* STOCKOUT push service worker. Generated at build time from the public VITE_FIREBASE_* web config. Do not edit. */
"use strict";
var INBOX_PATH = ${JSON.stringify(inboxPath)};
var ICON = ${JSON.stringify(icon)};
// Order, payment, verification and finance pushes are always generic: nothing private on a lock screen.
var GENERIC_TITLE = "New notification";
var GENERIC_BODY = "Open STOCKOUT to view it.";

function inboxUrl() {
  return new URL(INBOX_PATH, self.registration.scope).href;
}

// Registered BEFORE the Firebase scripts so it runs first; stopImmediatePropagation keeps Firebase's own click handler
// from following any link carried in the push payload. A click only ever opens the signed-in inbox, which then routes
// from the server's own notification record, never from push data.
self.addEventListener("notificationclick", function (event) {
  event.stopImmediatePropagation();
  event.notification.close();
  var target = inboxUrl();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i++) {
        var client = windows[i];
        if (client.url.indexOf(self.registration.scope) === 0 && "focus" in client) {
          client.postMessage({ type: "STOCKOUT_OPEN_INBOX" });
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});

self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

importScripts(${JSON.stringify(`${cdn}/firebase-app-compat.js`)}, ${JSON.stringify(`${cdn}/firebase-messaging-compat.js`)});

firebase.initializeApp(${JSON.stringify(config, null, 2)});

firebase.messaging().onBackgroundMessage(function (payload) {
  // A payload with a notification block is already displayed by the browser; showing it again would duplicate it.
  if (payload && payload.notification) return;
  var data = (payload && payload.data) || {};
  var id = typeof data.notificationId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(data.notificationId) ? data.notificationId : null;
  return self.registration.showNotification(GENERIC_TITLE, {
    body: GENERIC_BODY,
    icon: new URL(ICON, self.registration.scope).href,
    // Same notification delivered twice replaces itself instead of stacking.
    tag: id ? "stockout-" + id : "stockout",
    renotify: false,
    data: {},
  });
});
`;
}

export function firebaseMessagingSw(options: FirebaseSwOptions): Plugin {
  const { config, complete } = firebaseWebConfig(options.env);
  let source: string | null = null;
  const getSource = () => (source ??= renderFirebaseSw(config, firebaseVersion(), options.inboxPath, options.icon));
  const base = options.base.endsWith("/") ? options.base : `${options.base}/`;

  return {
    name: "stockout-firebase-messaging-sw",
    configureServer(server) {
      if (!complete) return;
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== `${base}${FIREBASE_SW_FILE}`) return next();
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(getSource());
      });
    },
    generateBundle() {
      if (!complete) return;
      this.emitFile({ type: "asset", fileName: FIREBASE_SW_FILE, source: getSource() });
    },
  };
}
