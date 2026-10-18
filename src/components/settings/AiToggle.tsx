"use client";

import { useId, useState, useTransition } from "react";

import { settle } from "@/components/library/action-result";
import { useToast } from "@/components/ui/Toast";
import { setAiEnabled } from "@/lib/actions/settings";
import { cx } from "@/lib/cx";

/** "Categorize new links automatically": an accessible switch that saves at once and reverts if saving fails. */
export function AiToggle({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  // A local override shown until the server's value catches up.
  const [override, setOverride] = useState<{ value: boolean; base: boolean } | null>(null);
  const on = override && override.base === enabled ? override.value : enabled;
  const labelId = useId();
  const descriptionId = useId();

  function toggle() {
    const next = !on;
    setOverride({ value: next, base: enabled });
    startTransition(async () => {
      const result = await settle(setAiEnabled(next));
      if (!result.ok) {
        setOverride(null);
        toast(result.error, { tone: "error" });
        return;
      }
      toast(
        next
          ? "New links will be categorized automatically."
          : "Automatic categorization is off. New links are saved as Unsorted.",
      );
    });
  }

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p id={labelId} className="text-base text-ink">
          Categorize new links automatically
        </p>
        <p id={descriptionId} className="mt-1 text-sm text-muted">
          Only the title, description and opening text are sent — never your notes.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        onClick={toggle}
        className="group -m-2 inline-flex shrink-0 items-center gap-2.5 p-2 text-sm"
      >
        <span aria-hidden="true" className={cx("w-6 text-right transition-colors", on ? "text-ink" : "text-muted")}>
          {on ? "On" : "Off"}
        </span>
        <span
          aria-hidden="true"
          className={cx(
            "relative inline-flex h-[18px] w-8 items-center rounded-[var(--radius-control)] border transition-colors",
            on ? "border-ink bg-ink" : "border-rule-strong bg-paper group-hover:border-ink",
          )}
        >
          <span
            className={cx(
              "absolute left-[2px] size-3 rounded-[2px] transition-transform duration-150",
              on ? "translate-x-[14px] bg-paper" : "translate-x-0 bg-faint group-hover:bg-ink",
            )}
          />
        </span>
      </button>
    </div>
  );
}
