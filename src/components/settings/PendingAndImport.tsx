"use client";

import { useId, useState, useTransition, type FormEvent } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/Field";
import { importBookmarks } from "@/lib/actions/settings";
import { MAX_IMPORT_BYTES } from "@/lib/core/import";
import { cx } from "@/lib/cx";
import { pluralize } from "@/lib/format";
import type { ImportSummary } from "@/lib/types";
import { describeImport, describeProgress, type ProcessingState } from "./progress";
import { SettingsSection } from "./SettingsSection";
import { usePendingProcessor } from "./usePendingProcessor";

/** Mirrors the server's limit, so an oversized file is refused before it uploads. */

const COLUMN = "text-ink-soft";

type ImportOutcome = { kind: "imported"; summary: ImportSummary } | { kind: "error"; message: string };

function ProgressText({ state }: { state: ProcessingState }) {
  return (
    <span className={cx("tabular", state.phase === "error" ? "text-danger" : "text-ink-soft")}>
      {describeProgress(state)}
    </span>
  );
}

export interface PendingAndImportProps {
  /** Links still waiting to be fetched or categorized, from the server. */
  pending: number;
}

/**
 * Settings' "Pending" and "Import" sections. They share one processing loop:
 * an import starts it automatically, and two loops never run at once.
 */
export function PendingAndImport({ pending }: PendingAndImportProps) {
  const processor = usePendingProcessor();
  const { state } = processor;
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [importing, startImport] = useTransition();
  const fileId = useId();
  const importStatusId = useId();

  const fromImport = state?.origin === "import" ? state : null;
  const fromPending = state?.origin === "pending" ? state : null;
  // While an import's own run is going, its progress shows under the import, not twice.
  const showPending = (pending > 0 && fromImport?.phase !== "running") || fromPending !== null;
  const stopping = state?.phase === "running" && state.stopping;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importing) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setOutcome({ kind: "error", message: "Choose a CSV file to import." });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setOutcome({ kind: "error", message: "That file is larger than 4 MB. Split it and import the parts." });
      return;
    }
    setOutcome(null);
    startImport(async () => {
      const result = await settle(importBookmarks(formData));
      if (!result.ok) {
        setOutcome({ kind: "error", message: result.error });
        return;
      }
      setOutcome({ kind: "imported", summary: result.data });
      form.reset();
      // Fetch details and categorize the new links straight away (not awaited: it runs on its own).
      if (result.data.imported > 0) processor.start("import");
    });
  }

  return (
    <>
      {showPending ? (
        <SettingsSection
          id="pending"
          title="Pending"
          description={
            pending > 0
              ? `${pluralize(pending, "link is", "links are")} still waiting to be fetched or categorized.`
              : "Nothing is waiting to be fetched or categorized."
          }
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {/* One button that turns into Stop, so keyboard focus stays put. */}
            <Button
              size="sm"
              aria-busy={stopping || undefined}
              onClick={() => (processor.running ? processor.stop() : processor.start("pending"))}
            >
              {processor.running ? (stopping ? "Stopping…" : "Stop") : "Process now"}
            </Button>
            <p aria-live="polite" className="min-w-0">
              {fromPending ? <ProgressText state={fromPending} /> : null}
            </p>
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="import"
        title="Import"
        description={
          <>
            <p>
              Bring in links from Pocket, Raindrop, Instapaper or any CSV file. Only a <span className={COLUMN}>url</span>{" "}
              column is required; <span className={COLUMN}>title</span>, <span className={COLUMN}>tags</span>,{" "}
              <span className={COLUMN}>categories</span> (or <span className={COLUMN}>folder</span>),{" "}
              <span className={COLUMN}>status</span>, <span className={COLUMN}>favorite</span>,{" "}
              <span className={COLUMN}>notes</span> and <span className={COLUMN}>date</span> are used when present.
            </p>
            <p className="mt-2">
              Links already in your library are skipped. Up to 5,000 rows or 4 MB per file. Afterwards Index fetches
              each link&apos;s details and files it, a few at a time.
            </p>
          </>
        }
      >
        <form onSubmit={submit} aria-label="Import bookmarks" noValidate>
          <FieldLabel htmlFor={fileId}>CSV file</FieldLabel>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <input
              id={fileId}
              name="file"
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              onChange={() => {
                if (outcome?.kind === "error") setOutcome(null);
              }}
              aria-describedby={importStatusId}
              aria-invalid={outcome?.kind === "error" ? true : undefined}
              className={cx(
                "block w-full min-w-0 max-w-full text-sm text-muted sm:flex-1",
                "file:mr-3 file:h-8 file:cursor-pointer file:rounded-[var(--radius-control)] file:border file:border-rule-strong file:bg-paper file:px-3 file:text-sm file:font-medium file:text-ink file:transition-colors hover:file:border-ink",
                "disabled:opacity-45",
              )}
            />
            <Button type="submit" pending={importing}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
          <div id={importStatusId} aria-live="polite" className="mt-3 min-h-5 text-sm">
            {outcome?.kind === "error" ? <p className="text-danger">{outcome.message}</p> : null}
            {outcome?.kind === "imported" ? <p className="tabular text-ink">{describeImport(outcome.summary)}</p> : null}
            {fromImport ? (
              <p className="mt-1">
                <ProgressText state={fromImport} />
              </p>
            ) : null}
          </div>
          {fromImport?.phase === "running" ? (
            <Button variant="quiet" size="sm" className="-ml-1" aria-busy={stopping || undefined} onClick={processor.stop}>
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          ) : null}
        </form>
      </SettingsSection>
    </>
  );
}
