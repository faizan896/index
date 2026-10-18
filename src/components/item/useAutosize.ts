"use client";

import { useEffect, type RefObject } from "react";

/** Grows a textarea with its content, up to `maxHeight` pixels; beyond that it scrolls. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxHeight = 480): void {
  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const border = textarea.offsetHeight - textarea.clientHeight;
    const wanted = textarea.scrollHeight + border;
    textarea.style.height = `${Math.min(wanted, maxHeight)}px`;
    textarea.style.overflowY = wanted > maxHeight ? "auto" : "hidden";
  }, [ref, value, maxHeight]);
}
