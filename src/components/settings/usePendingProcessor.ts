"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { settle } from "@/components/library/action-result";
import { processPendingLinks } from "@/lib/actions/settings";
import { advance, LOOP_START, type ProcessingOrigin, type ProcessingState } from "./progress";

export interface PendingProcessor {
  /** Null until a run starts. */
  state: ProcessingState | null;
  running: boolean;
  /** Starts fetching and categorizing waiting links, a few at a time, until none remain. */
  start: (origin: ProcessingOrigin) => void;
  /** Stops after the batch in flight. */
  stop: () => void;
}

/**
 * Calls processPendingLinks() in a loop. Each call handles a small batch and
 * refreshes the page's data; the loop ends when nothing remains, when asked
 * to stop, on an error, or when the queue stops shrinking.
 */
export function usePendingProcessor(): PendingProcessor {
  const [state, setState] = useState<ProcessingState | null>(null);
  const runningRef = useRef(false);
  const stopRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (origin: ProcessingOrigin) => {
    let progress = LOOP_START;
    setState({ phase: "running", origin, processed: 0, remaining: null, stopping: false });
    try {
      for (;;) {
        const result = await settle(processPendingLinks());
        if (!mountedRef.current) return;
        if (!result.ok) {
          setState({ phase: "error", origin, processed: progress.processed, message: result.error });
          return;
        }
        const step = advance(progress, result.data);
        progress = step.progress;
        const remaining = progress.remaining ?? 0;
        if (step.outcome === "done") {
          setState({ phase: "done", origin, processed: progress.processed });
          return;
        }
        if (step.outcome === "stalled") {
          setState({ phase: "stalled", origin, processed: progress.processed, remaining });
          return;
        }
        if (stopRef.current) {
          setState({ phase: "stopped", origin, processed: progress.processed, remaining });
          return;
        }
        setState({ phase: "running", origin, processed: progress.processed, remaining, stopping: false });
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  const start = useCallback(
    (origin: ProcessingOrigin) => {
      if (runningRef.current) return;
      runningRef.current = true;
      stopRef.current = false;
      void run(origin);
    },
    [run],
  );

  const stop = useCallback(() => {
    if (!runningRef.current) return;
    stopRef.current = true;
    setState((current) => (current?.phase === "running" ? { ...current, stopping: true } : current));
  }, []);

  return { state, running: state?.phase === "running", start, stop };
}
