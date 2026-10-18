import Link from "next/link";

/** Any address outside the library's own routes. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 pb-[12vh] pt-16">
      <h1 className="font-serif text-display font-normal text-ink">Not found.</h1>
      <p className="mt-3 text-sm text-muted">There is nothing at this address.</p>
      <p className="mt-6 text-sm">
        <Link href="/" className="link text-ink">
          Go to your library
        </Link>
      </p>
    </main>
  );
}
