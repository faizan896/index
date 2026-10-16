"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "@/lib/cx";
import { CheckIcon } from "./Icons";

export interface MenuItem<V extends string> {
  value: V;
  label: string;
  /** Renders the item in the destructive color. */
  danger?: boolean;
}

export interface MenuProps<V extends string> {
  /** Accessible name for the trigger, e.g. "Reading status". */
  label: string;
  items: readonly MenuItem<V>[];
  onSelect: (value: V) => void;
  /** Visible content of the trigger. */
  trigger: ReactNode;
  /** When set, items behave as a radio group and the current one is checked. */
  value?: V;
  align?: "start" | "end";
  disabled?: boolean;
  triggerClassName?: string;
}

/**
 * A small, keyboard-complete dropdown menu (WAI-ARIA menu button pattern):
 * Enter/Space/↓ opens, ↑/↓/Home/End move, Enter selects, Escape closes and
 * returns focus to the trigger, Tab or a click outside dismisses.
 */
export function Menu<V extends string>({
  label,
  items,
  onSelect,
  trigger,
  value,
  align = "start",
  disabled = false,
  triggerClassName,
}: MenuProps<V>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openAt = useCallback(
    (index: number) => {
      setActive(Math.max(0, Math.min(index, items.length - 1)));
      setOpen(true);
    },
    [items.length],
  );

  useEffect(() => {
    if (!open) return;
    itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const currentIndex = value === undefined ? 0 : Math.max(0, items.findIndex((item) => item.value === value));

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(event.key === "ArrowDown" ? currentIndex : items.length - 1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (index + 1) % items.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (index - 1 + items.length) % items.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  function choose(item: MenuItem<V>) {
    close(true);
    if (item.value !== value) onSelect(item.value);
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openAt(currentIndex))}
        onKeyDown={onTriggerKeyDown}
        className={cx("inline-flex items-center gap-1 disabled:opacity-45", triggerClassName)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cx(
            "absolute top-full z-40 mt-1.5 min-w-40 rounded-[var(--radius-control)] border border-rule-strong bg-paper py-1 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.18)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => {
            const checked = value !== undefined && item.value === value;
            return (
              <button
                key={item.value}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role={value !== undefined ? "menuitemradio" : "menuitem"}
                aria-checked={value !== undefined ? checked : undefined}
                tabIndex={index === active ? 0 : -1}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(index)}
                className={cx(
                  "flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-sm outline-none",
                  index === active ? "bg-wash" : "",
                  item.danger ? "text-danger" : checked ? "text-ink" : "text-ink-soft",
                )}
              >
                <span>{item.label}</span>
                {checked ? <CheckIcon className="size-3.5" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
