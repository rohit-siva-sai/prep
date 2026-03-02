"use client";

import { firebaseReady } from "@/lib/firebase";

export const FirebaseNotice = () => {
  if (firebaseReady) return null;
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-amber-100">
      Firebase is not configured yet. Add `NEXT_PUBLIC_FIREBASE_*` values in `.env.local`.
    </div>
  );
};
