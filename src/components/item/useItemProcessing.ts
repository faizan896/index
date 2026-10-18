"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { settle } from "@/components/library/action-result";
import { useProcessingPoll } from "@/components/library/useProcessingPoll";
import { useToast } from "@/components/ui/Toast";
import { retryLinkProcessing } from "@/lib/actions/links";
import type { LinkListItem } from "@/lib/types";
import { processingPhase, type ProcessingPhase } from "./item-format";

export interface ItemProcessing {
  phase: ProcessingPhase;
  /** Still unfinished after waiting and one automatic retry; polling has stopped. */
  stalled: boolean;
  /** A manual "Try again" is running. */
  retrying: boolean;
  retry: () => void;
}

/**
 * Keeps the detail page current while its link is fetched and categorized in
 * the background: polls GET /api/links/[id] (via useProcessingPoll) and
 * refreshes the server-rendered page once per finished stage, so the title
 * arrives first and the categories (and the sidebar) follow.
 */
export function useItemProcessing(link: Pick<LinkListItem, "id" | "metadataStatus" | "classificationStatus">): ItemProcessing {
  const router = useRouter();
  const { toast } = useToast();
  const phase = processingPhase(link);
  const [stalled, setStalled] = useState(false);
  const [missing, setMissing] = useState(false);
  const [retrying, startRetry] = useTransition();
  // The stage a refresh was already asked for: a slow refresh isn't repeated on every poll.
  const refreshedFor = useRef<ProcessingPhase | null>(null);

  const { forget } = useProcessingPoll(phase !== "idle" && !stalled && !missing ? [link.id] : [], {
    onUpdate: (item, source) => {
      const next = processingPhase(item);
      // A retry is a server action, which refreshes the page by itself.
      if (source === "retry" || next === phase || refreshedFor.current === next) return;
      refreshedFor.current = next;
      router.refresh();
    },
    onMissing: () => {
      // Deleted elsewhere: the refreshed page shows "not found".
      setMissing(true);
      router.refresh();
    },
    onStalled: () => setStalled(true),
  });

  function retry() {
    forget(link.id);
    setStalled(false);
    refreshedFor.current = null;
    startRetry(async () => {
      const result = await settle(retryLinkProcessing(link.id));
      if (!result.ok) toast(result.error, { tone: "error" });
      else if (result.data.metadataStatus === "failed") toast("Index still couldn't read this page.");
    });
  }

  return { phase, stalled: stalled && phase !== "idle", retrying, retry };
}
