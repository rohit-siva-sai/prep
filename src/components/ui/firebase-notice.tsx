"use client";

import { firebaseReady } from "@/lib/firebase";

export const FirebaseNotice = () => {
  if (firebaseReady) return null;
  return (
    <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-3 text-cyan-100">
      Running in local free mode (browser storage). Add `NEXT_PUBLIC_FIREBASE_*` to enable cloud sync.
    </div>
  );
};
