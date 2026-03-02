"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clearSessionUser,
  getSessionUser,
  hashPassword,
  setSessionUser,
  SessionUser,
} from "@/lib/auth";
import { createUser, ensureSeedData, getUserByUsername } from "@/lib/data-service";
import { ensureAnonymousAuth, firebaseReady } from "@/lib/firebase";

type SignupInput = {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
};

type AuthContextType = {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (payload: SignupInput) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const BOOT_TIMEOUT_MS = 12000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const friendlyError = (error: unknown, fallback: string) => {
    const code = String((error as { code?: string })?.code || "");
    if (code.includes("permission-denied")) {
      return "Firestore permission denied. Set Firestore rules to allow authenticated users, then try again.";
    }
    if (code.includes("operation-not-allowed")) {
      return "Anonymous sign-in is disabled in Firebase Auth. Enable Anonymous provider and try again.";
    }
    return error instanceof Error ? error.message : fallback;
  };

  useEffect(() => {
    let active = true;

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race<T>([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), timeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const bootstrap = async () => {
      try {
        await withTimeout(
          (async () => {
            if (firebaseReady) {
              await ensureAnonymousAuth();
            }
            await ensureSeedData();
          })(),
          BOOT_TIMEOUT_MS,
          "App initialization timed out. Check Firebase Auth/Firestore setup and Vercel env variables.",
        );
        if (!active) return;
        setBootError(null);
      } catch (error) {
        if (!active) return;
        setBootError(friendlyError(error, "App initialization failed."));
      } finally {
        if (!active) return;
        const existing = getSessionUser();
        setUser(existing);
        setLoading(false);
      }
    };
    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (usernameRaw: string, password: string) => {
    if (bootError) {
      throw new Error(bootError);
    }
    const username = usernameRaw.trim().toLowerCase();
    if (!username || !password) {
      throw new Error("Username and password are required.");
    }
    let profile;
    try {
      profile = await getUserByUsername(username);
    } catch (error) {
      throw new Error(friendlyError(error, "Login failed while reading user profile."));
    }
    if (!profile) {
      throw new Error("Invalid username or password.");
    }
    const hash = await hashPassword(password);
    if (hash !== profile.passwordHash) {
      throw new Error("Invalid username or password.");
    }
    const session = {
      username: profile.username,
      fullName: profile.fullName,
      role: profile.role,
    } as SessionUser;
    setSessionUser(session);
    setUser(session);
  }, [bootError]);

  const signup = useCallback(async (payload: SignupInput) => {
    if (bootError) {
      throw new Error(bootError);
    }
    const fullName = payload.fullName.trim();
    const username = payload.username.trim().toLowerCase();
    if (!fullName || !username || !payload.password) {
      throw new Error("All fields are required.");
    }
    if (payload.password !== payload.confirmPassword) {
      throw new Error("Password and confirm password do not match.");
    }
    let existing;
    try {
      existing = await getUserByUsername(username);
    } catch (error) {
      throw new Error(friendlyError(error, "Signup failed while checking existing user."));
    }
    if (existing) {
      throw new Error("Username already exists. Please choose another.");
    }
    try {
      await createUser({
        username,
        fullName,
        passwordHash: await hashPassword(payload.password),
        role: "student",
        createdAt: Date.now(),
      });
    } catch (error) {
      throw new Error(friendlyError(error, "Signup failed while creating user."));
    }
  }, [bootError]);

  const logout = useCallback(() => {
    clearSessionUser();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
