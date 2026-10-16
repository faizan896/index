"use client";

import { useState, useTransition } from "react";

import { StarIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { setLinkFavorite } from "@/lib/actions/links";
import { cx } from "@/lib/cx";

export interface FavoriteButtonProps {
  linkId: string;
  isFavorite: boolean;
  /** Called optimistically, and again with the old value if saving fails. */
  onChange?: (isFavorite: boolean) => void;
  /** Shows "Favorite" / "Favorited" next to the star (detail page). */
  withLabel?: boolean;
  className?: string;
}

/** A hairline star that fills in ink. Instant, and reverts if the save fails. */
export function FavoriteButton({ linkId, isFavorite, onChange, withLabel = false, className }: FavoriteButtonProps) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [override, setOverride] = useState<{ value: boolean; base: boolean } | null>(null);
  const shown = override && override.base === isFavorite ? override.value : isFavorite;

  function toggle() {
    const next = !shown;
    setOverride({ value: next, base: isFavorite });
    onChange?.(next);
    startTransition(async () => {
      const result = await setLinkFavorite(linkId, next);
      if (!result.ok) {
        setOverride(null);
        onChange?.(!next);
        toast(result.error, { tone: "error" });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={shown}
      aria-label={withLabel ? undefined : shown ? "Remove from favorites" : "Add to favorites"}
      title={shown ? "Remove from favorites" : "Add to favorites"}
      className={cx(
        "inline-flex items-center gap-1.5 text-sm transition-colors",
        shown ? "text-ink" : "text-faint hover:text-ink",
        className,
      )}
    >
      <StarIcon filled={shown} className="size-[15px]" />
      {withLabel ? <span>{shown ? "Favorited" : "Favorite"}</span> : null}
    </button>
  );
}
