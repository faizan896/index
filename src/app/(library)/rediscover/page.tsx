import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/library/PageHeading";
import { RediscoverList } from "@/components/rediscover/RediscoverList";
import { dailySeed, nextSeed, readSeed } from "@/components/rediscover/seed";
import { EmptyState } from "@/components/ui/EmptyState";
import { getRediscoverPicks } from "@/lib/server/queries";

export const metadata: Metadata = { title: "Rediscover" };

export default async function RediscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { s } = await searchParams;
  const now = new Date();
  // Today's date unless the reader asked for others, so a reload shows the same picks.
  const seed = readSeed(s) ?? dailySeed(now);
  const picks = await getRediscoverPicks(seed);

  return (
    <>
      <PageHeading title="Rediscover" subtitle="Three things from your archive." />
      <div className="mt-10">
        {picks.length > 0 ? (
          <>
            <RediscoverList picks={picks} now={now} />
            <p className="mt-8 text-sm">
              <Link
                href={`/rediscover?s=${encodeURIComponent(nextSeed(seed))}`}
                prefetch={false}
                className="link text-muted transition-colors hover:text-ink"
              >
                Show me others
              </Link>
            </p>
          </>
        ) : (
          <EmptyState title="Your archive is empty for now.">
            Rediscover surfaces older reads once you&apos;ve saved a few.
          </EmptyState>
        )}
      </div>
    </>
  );
}
