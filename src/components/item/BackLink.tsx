"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { ArrowLeftIcon } from "@/components/ui/Icons";

/**
 * Whether the previous history entry is a page of this app, so going back
 * returns to the list the reader came from (with its filters and scroll).
 */
function hasInAppHistory(): boolean {
  // The Navigation API only lists same-origin entries, so canGoBack answers exactly that.
  const navigation = (window as Window & { navigation?: { canGoBack?: unknown } }).navigation;
  if (typeof navigation?.canGoBack === "boolean") return navigation.canGoBack;
  try {
    return window.history.length > 1 && document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** "← Library": goes back when the reader came from inside the app, otherwise to the library. */
export function BackLink() {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!hasInAppHistory()) return;
    event.preventDefault();
    router.back();
  }

  return (
    <Link
      href="/"
      onClick={onClick}
      className="-my-1.5 inline-flex items-center gap-1.5 py-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeftIcon className="size-3.5" />
      Library
    </Link>
  );
}
