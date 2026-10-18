/**
 * The arithmetic and wording behind Settings' "Process now" and import
 * summaries. Pure, so it can be tested without React.
 */
import { pluralize } from "@/lib/format";
import type { ImportSummary, ProcessPendingSummary } from "@/lib/types";

/** Which part of the page started the run (and so shows its progress). */
export type ProcessingOrigin = "pending" | "import";

export type ProcessingState =
  | { phase: "running"; origin: ProcessingOrigin; processed: number; remaining: number | null; stopping: boolean }
  | { phase: "done"; origin: ProcessingOrigin; processed: number }
  | { phase: "stopped"; origin: ProcessingOrigin; processed: number; remaining: number }
  | { phase: "stalled"; origin: ProcessingOrigin; processed: number; remaining: number }
  | { phase: "error"; origin: ProcessingOrigin; processed: number; message: string };

/** Rounds in a row that may pass without the queue shrinking before the loop gives up. */
export const MAX_IDLE_ROUNDS = 3;

export interface LoopProgress {
  processed: number;
  /** Null before the first round. */
  remaining: number | null;
  /** Consecutive rounds that left the queue no shorter. */
  idleRounds: number;
}

export const LOOP_START: LoopProgress = { processed: 0, remaining: null, idleRounds: 0 };

/**
 * Folds one round of processPendingLinks() into the totals and says whether
 * to go on. Links that can't be claimed (or new ones arriving as fast as
 * they're processed) would otherwise keep the loop going forever.
 */
export function advance(
  progress: LoopProgress,
  round: ProcessPendingSummary,
): { progress: LoopProgress; outcome: "continue" | "done" | "stalled" } {
  const shrank = round.processed > 0 && (progress.remaining === null || round.remaining < progress.remaining);
  const next: LoopProgress = {
    processed: progress.processed + round.processed,
    remaining: round.remaining,
    idleRounds: shrank ? 0 : progress.idleRounds + 1,
  };
  if (round.remaining <= 0) return { progress: next, outcome: "done" };
  if (next.idleRounds >= MAX_IDLE_ROUNDS) return { progress: next, outcome: "stalled" };
  return { progress: next, outcome: "continue" };
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** One calm line for the live progress region. */
export function describeProgress(state: ProcessingState): string {
  switch (state.phase) {
    case "running":
      if (state.remaining === null) return state.stopping ? "Stopping…" : "Starting…";
      return `Processed ${count(state.processed)} · ${count(state.remaining)} remaining${state.stopping ? " · Stopping…" : ""}`;
    case "done":
      return state.processed > 0 ? `Done. ${pluralize(state.processed, "link")} processed.` : "Nothing was waiting.";
    case "stopped":
      return `Stopped. Processed ${count(state.processed)} · ${count(state.remaining)} remaining.`;
    case "stalled":
      return `Processed ${count(state.processed)}. ${pluralize(state.remaining, "link is", "links are")} still waiting; try again in a few minutes.`;
    case "error":
      return state.processed > 0 ? `${state.message} Processed ${count(state.processed)} before that.` : state.message;
  }
}

/** "Imported 120 · 4 already in your library · 2 rows without a usable link". */
export function describeImport(summary: ImportSummary): string {
  const parts = [`Imported ${count(summary.imported)}`];
  if (summary.duplicates > 0) parts.push(`${count(summary.duplicates)} already in your library`);
  if (summary.invalid > 0) parts.push(`${pluralize(summary.invalid, "row")} without a usable link`);
  if (summary.skipped > 0) parts.push(`${pluralize(summary.skipped, "row")} past the limit, not read`);
  return parts.join(" · ");
}
