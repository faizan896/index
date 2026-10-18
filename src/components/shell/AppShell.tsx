import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";
import type { CategorySummary, LibraryStats } from "@/lib/types";
import { MobileNav } from "./MobileNav";
import { SidebarNav } from "./SidebarNav";
import { Wordmark } from "./Wordmark";

export interface AppShellProps {
  categories: CategorySummary[];
  stats: LibraryStats;
  children: ReactNode;
}

/**
 * The signed-in frame: a fixed sidebar on desktop, a top bar with a menu
 * sheet on phones, and a single reading column for the page.
 */
export function AppShell({ categories, stats, children }: AppShellProps) {
  const navCategories = categories.map(({ id, name, slug, linkCount }) => ({ id, name, slug, linkCount }));
  const navStats = { unread: stats.unread, unsorted: stats.unsorted };

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:bg-paper focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to content
      </a>

      <MobileNav categories={navCategories} stats={navStats} />

      <header className="fixed inset-y-0 left-0 z-20 hidden w-[232px] overflow-y-auto overscroll-contain border-r border-rule bg-paper px-7 pb-12 pt-10 md:block">
        <Wordmark />
        <div className="mt-9">
          <SidebarNav categories={navCategories} stats={navStats} />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none md:pl-[232px]">
        <div className="px-4 pb-24 pt-8 sm:px-8 md:pt-14 lg:px-12">
          <div className="mx-auto w-full max-w-[760px]">{children}</div>
        </div>
      </main>
    </ToastProvider>
  );
}
