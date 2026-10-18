/**
 * Shared rules for the library's single-key shortcuts (n, /, j, k, o, f, s, ?).
 * A shortcut never fires while the user is typing, holding a modifier, inside
 * an open menu, or while a modal dialog is open.
 */

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "email",
  "password",
  "tel",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** True when keystrokes on this target are typing rather than commands. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

/** True while a modal dialog (keyboard shortcuts, the phone menu) is open. */
export function isModalOpen(): boolean {
  return document.querySelector('dialog[open], [aria-modal="true"]') !== null;
}

/** Whether this keydown may run a single-key shortcut. Shift is allowed, for "?". */
export function isShortcutEvent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isEditableTarget(event.target)) return false;
  if (event.target instanceof Element && event.target.closest('[role="menu"]')) return false;
  return !isModalOpen();
}

/** The pressed key, lowercased for letters so Caps Lock doesn't disable shortcuts. */
export function shortcutKey(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

/** True for elements that already act on Enter themselves (links, buttons, form controls). */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role^="menuitem"]') !==
      null
  );
}
