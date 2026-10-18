import Link from "next/link";

export default function LibraryNotFound() {
  return (
    <div className="py-16">
      <h1 className="font-serif text-display font-normal text-ink">Not found.</h1>
      <p className="mt-3 text-sm text-muted">There is nothing at this address. It may have been renamed or removed.</p>
      <p className="mt-6 text-sm">
        <Link href="/" className="link text-ink">
          Back to your library
        </Link>
      </p>
    </div>
  );
}
