"use server";

/** CONTRACT STUB — signatures are final; bodies are implemented by the server layer. */
import type { ActionResult, ImportSummary, ProcessPendingSummary } from "@/lib/types";

export async function setAiEnabled(_enabled: boolean): Promise<ActionResult> {
  throw new Error("not implemented");
}

/** Reads the CSV in formData field "file" (max 5 MB, 5,000 rows) and imports it. */
export async function importBookmarks(_formData: FormData): Promise<ActionResult<ImportSummary>> {
  throw new Error("not implemented");
}

/**
 * Fetches and categorizes up to a handful of links still waiting for it (after
 * an import, or if background work was interrupted). Call repeatedly until
 * `remaining` is 0.
 */
export async function processPendingLinks(): Promise<ActionResult<ProcessPendingSummary>> {
  throw new Error("not implemented");
}
