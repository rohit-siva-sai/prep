"use client";

import { toast, ToastOptions } from "react-toastify";

const baseOptions: ToastOptions = {
  position: "top-right",
  autoClose: 2800,
  hideProgressBar: false,
  pauseOnHover: true,
  closeOnClick: true,
  theme: "dark",
};

export const notify = {
  success: (message: string, options?: ToastOptions) =>
    toast.success(message, { ...baseOptions, ...options }),
  error: (message: string, options?: ToastOptions) =>
    toast.error(message, { ...baseOptions, autoClose: 3600, ...options }),
  info: (message: string, options?: ToastOptions) =>
    toast.info(message, { ...baseOptions, ...options }),
};

export const confirmToast = (title: string, detail?: string) =>
  new Promise<boolean>((resolve) => {
    const id = toast(
      ({ closeToast }) => (
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-slate-100">{title}</p>
            {detail ? <p className="mt-1 text-xs text-slate-300">{detail}</p> : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-md border border-white/20 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
              onClick={() => {
                toast.dismiss(id);
                resolve(false);
                closeToast?.();
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-red-500/90 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500"
              onClick={() => {
                toast.dismiss(id);
                resolve(true);
                closeToast?.();
              }}
              type="button"
            >
              Confirm
            </button>
          </div>
        </div>
      ),
      {
        ...baseOptions,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: false,
      },
    );
  });
