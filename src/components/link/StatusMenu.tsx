"use client";

import { useState, useTransition } from "react";

import { Menu, type MenuItem } from "@/components/ui/Menu";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { setLinkStatus } from "@/lib/actions/links";
import { cx } from "@/lib/cx";
import { READING_STATUS_LABEL, READING_STATUSES, type ReadingStatus } from "@/lib/types";

const ITEMS: readonly MenuItem<ReadingStatus>[] = READING_STATUSES.map((status) => ({
  value: status,
  label: READING_STATUS_LABEL[status],
}));

export interface StatusMenuProps {
  linkId: string;
  status: ReadingStatus;
  /** Called optimistically with the new status, and again with the old one if saving fails. */
  onChange?: (status: ReadingStatus) => void;
  className?: string;
}

/**
 * Inline reading-status control: reads as quiet text ("Unread ▾") and opens
 * a three-item menu. Updates instantly and reverts if the save fails.
 */
export function StatusMenu({ linkId, status, onChange, className }: StatusMenuProps) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  // A local override shown until the parent's `status` prop catches up.
  const [override, setOverride] = useState<{ value: ReadingStatus; base: ReadingStatus } | null>(null);
  const shown = override && override.base === status ? override.value : status;

  function select(next: ReadingStatus) {
    const previous = shown;
    setOverride({ value: next, base: status });
    onChange?.(next);
    startTransition(async () => {
      const result = await setLinkStatus(linkId, next);
      if (!result.ok) {
        setOverride(null);
        onChange?.(previous);
        toast(result.error, { tone: "error" });
      }
    });
  }

  return (
    <Menu
      label={`Reading status: ${READING_STATUS_LABEL[shown]}`}
      value={shown}
      items={ITEMS}
      onSelect={select}
      triggerClassName={cx("text-sm text-muted transition-colors hover:text-ink", shown !== "unread" && "text-ink-soft", className)}
      trigger={
        <>
          <span>{READING_STATUS_LABEL[shown]}</span>
          <ChevronDownIcon className="size-3 text-faint" />
        </>
      }
    />
  );
}
