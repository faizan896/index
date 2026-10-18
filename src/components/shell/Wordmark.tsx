import Link from "next/link";

/** "Index", set in the serif italic. Links home. */
export function Wordmark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="inline-block font-serif text-[1.375rem] italic leading-7 tracking-[-0.01em] text-ink"
    >
      Index
    </Link>
  );
}
