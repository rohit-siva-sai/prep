"use client";

const AUTH_KEY = "exam-grid-auth-user";

export type SessionUser = {
  username: string;
  fullName: string;
  role: "admin" | "student";
};

export const getSessionUser = (): SessionUser | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
};

export const setSessionUser = (user: SessionUser) => {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(user));
};

export const clearSessionUser = () => {
  window.localStorage.removeItem(AUTH_KEY);
};

export const hashPassword = async (input: string) => {
  const msg = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", msg);
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
