"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { ToastContainer } from "react-toastify";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      {children}
      <ToastContainer
        closeButton
        newestOnTop
        pauseOnFocusLoss={false}
        position="top-center"
      />
    </AuthProvider>
  );
};
