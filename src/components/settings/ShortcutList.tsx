const SHORTCUTS: ReadonlyArray<{ keys: readonly string[]; label: string }> = [
  { keys: ["N"], label: "Add a link (Your Library)" },
  { keys: ["/"], label: "Search" },
  { keys: ["J", "K"], label: "Move down and up the list" },
  { keys: ["Enter"], label: "Open the selected item" },
  { keys: ["F"], label: "Favorite or unfavorite" },
  { keys: ["S"], label: "Change reading status" },
  { keys: ["?"], label: "Show every shortcut" },
];

/** The library's keyboard shortcuts as a quiet two-column list: keys, then what they do. */
export function ShortcutList() {
  return (
    <dl className="grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-6 gap-y-2.5 text-sm">
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.label} className="contents">
          <dt className="flex items-center gap-1.5">
            {shortcut.keys.map((key) => (
              <kbd
                key={key}
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--radius-control)] border border-rule-strong px-1.5 font-sans text-xs text-ink"
              >
                {key}
              </kbd>
            ))}
          </dt>
          <dd className="self-center text-ink-soft">{shortcut.label}</dd>
        </div>
      ))}
    </dl>
  );
}
