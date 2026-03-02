import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const configured = Boolean(config.apiKey && config.projectId && config.appId);

export const firebaseReady = configured;

const app = configured
  ? getApps()[0] ?? initializeApp(config)
  : null;

export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;

export const ensureAnonymousAuth = async () => {
  if (!firebaseReady || !auth) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values.");
  }
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
};
