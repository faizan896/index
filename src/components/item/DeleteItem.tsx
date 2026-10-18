"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteLink } from "@/lib/actions/links";

/**
 * "Delete" at the end of the action row, with an inline confirmation on its
 * own line. On success it returns to the library and says so.
 */
export function DeleteItem({ linkId }: { linkId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startDeleting] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const messageId = useId();

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  function cancel() {
    returnFocus.current = true;
    setConfirming(false);
  }

  function confirm() {
    startDeleting(async () => {
      const result = await settle(deleteLink(linkId));
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        return;
      }
      toast("Deleted.");
      router.push("/");
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || pending) return;
    event.preventDefault();
    cancel();
  }

  if (!confirming) {
    return (
      <Button ref={triggerRef} variant="danger" className="ml-auto text-sm" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={messageId}
      onKeyDown={onKeyDown}
      className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-4 text-sm"
    >
      <p id={messageId} className="text-ink-soft">
        Delete this item? It will be removed from your library, collections and notes.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="danger" size="sm" pending={pending} onClick={confirm}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
        <Button ref={cancelRef} variant="quiet" size="sm" disabled={pending} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
