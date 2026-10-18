import Link from "next/link";

/** Shown for an unknown, deleted or malformed item address. */
export default function ItemNotFound() {
  return (
    <div className="py-16">
      <h1 className="font-serif text-display font-normal text-ink">This item isn&apos;t in your library.</h1>
      <p className="mt-3 text-sm text-muted">It may have been deleted, or the address may be incomplete.</p>
      <p className="mt-6 text-sm">
        <Link href="/" className="link text-ink">
          Back to your library
        </Link>
      </p>
    </div>
  );
}
