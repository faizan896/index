"use client";

import { useCallback, useEffect, useRef } from "react";

import { retryLinkProcessing } from "@/lib/actions/links";
import type { LinkListItem, ProcessingStatus } from "@/lib/types";
import { settle } from "./action-result";

const POLL_INTERVAL_MS = 1500;
/** How long to wait on background processing before nudging it once with a retry. */
const PATIENCE_MS = 45_000;
/** At most this many items are polled per tick (an import can leave many pending). */
const MAX_PER_TICK = 6;

const ACTIVE: readonly ProcessingStatus[] = ["pending", "processing"];

/** Whether a link is still being fetched or categorized in the background. */
export function isProcessing(item: Pick<LinkListItem, "metadataStatus" | "classificationStatus">): boolean {
  return ACTIVE.includes(item.metadataStatus) || ACTIVE.includes(item.classificationStatus);
}

export interface ProcessingPollHandlers {
  /** A fresher copy arrived, from polling or from the one automatic retry. */
  onUpdate: (item: LinkListItem, source: "poll" | "retry") => void;
  /** The link no longer exists (deleted elsewhere). */
  onMissing: (linkId: string) => void;
  /** Still unfinished after waiting and one retry; polling stops for it. */
  onStalled: (linkId: string) => void;
}

interface Tracked {
  since: number;
  retried: boolean;
  retrying: boolean;
}

/**
 * Watches links that are still being processed: polls GET /api/links/[id]
 * every 1.5 s while the tab is visible, and if one is still unfinished after
 * ~45 s, asks the server to process it once more (retryLinkProcessing) before
 * giving up on it. Only one retry runs at a time.
 */
export function useProcessingPoll(
  linkIds: readonly string[],
  handlers: ProcessingPollHandlers,
): { forget: (linkId: string) => void } {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const tracked = useRef(new Map<string, Tracked>());
  const key = linkIds.join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function poll(linkId: string): Promise<void> {
      const response = await fetch(`/api/links/${encodeURIComponent(linkId)}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (stopped) return;
      if (response.status === 404) {
        handlersRef.current.onMissing(linkId);
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as { item?: LinkListItem };
      if (!stopped && body.item) handlersRef.current.onUpdate(body.item, "poll");
    }

    function retry(linkId: string, entry: Tracked): void {
      entry.retried = true;
      entry.retrying = true;
      // Not cancelled with the effect: the result is fresh whenever it lands.
      void settle(retryLinkProcessing(linkId)).then((result) => {
        entry.retrying = false;
        if (!result.ok) {
          handlersRef.current.onStalled(linkId);
          return;
        }
        handlersRef.current.onUpdate(result.data, "retry");
        if (isProcessing(result.data)) handlersRef.current.onStalled(linkId);
      });
    }

    async function tick(): Promise<void> {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        let retryRunning = [...tracked.current.values()].some((entry) => entry.retrying);
        const polls: Array<Promise<void>> = [];
        for (const linkId of ids.slice(0, MAX_PER_TICK)) {
          let entry = tracked.current.get(linkId);
          if (!entry) {
            entry = { since: now, retried: false, retrying: false };
            tracked.current.set(linkId, entry);
          }
          if (entry.retrying) continue;
          const overdue = now - entry.since >= PATIENCE_MS;
          if (overdue && entry.retried) {
            handlersRef.current.onStalled(linkId);
            continue;
          }
          if (overdue && !retryRunning) {
            retryRunning = true;
            retry(linkId, entry);
            continue;
          }
          polls.push(poll(linkId).catch(() => undefined));
        }
        await Promise.all(polls);
      }
      if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [key]);

  /** Starts a link's waiting period afresh (after a manual "Try again"). */
  const forget = useCallback((linkId: string) => {
    tracked.current.delete(linkId);
  }, []);

  return { forget };
}
