"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cx } from "@/lib/cx";

export type ToastTone = "default" | "error";

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onAction: () => void };
}

interface ToastApi {
  /** Shows a short message at the bottom of the screen for a few seconds. */
  toast: (message: string, options?: { tone?: ToastTone; action?: ToastEntry["action"] }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback<ToastApi["toast"]>(
    (message, options) => {
      const id = nextId.current++;
      setEntries((current) => [...current.slice(-2), { id, message, tone: options?.tone ?? "default", action: options?.action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-start gap-2 sm:inset-x-auto sm:left-6 sm:bottom-6"
      >
        {entries.map((entry) => (
          <div
            key={entry.id}
            role={entry.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex max-w-sm items-center gap-4 rounded-[var(--radius-control)] border bg-paper px-3.5 py-2.5 text-sm shadow-[0_8px_28px_-14px_rgba(0,0,0,0.25)]",
              entry.tone === "error" ? "border-danger/40 text-danger" : "border-rule-strong text-ink",
            )}
          >
            <span>{entry.message}</span>
            {entry.action ? (
              <button
                type="button"
                className="link shrink-0 text-ink"
                onClick={() => {
                  entry.action?.onAction();
                  dismiss(entry.id);
                }}
              >
                {entry.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
