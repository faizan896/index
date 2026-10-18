import type { Metadata } from "next";

import { PageHeading } from "@/components/library/PageHeading";
import { AiToggle } from "@/components/settings/AiToggle";
import { PendingAndImport } from "@/components/settings/PendingAndImport";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ShortcutList } from "@/components/settings/ShortcutList";
import { Button } from "@/components/ui/Button";
import { getLibraryStats, getUserSettings } from "@/lib/server/queries";

export const metadata: Metadata = { title: "Settings" };

const EXPORT_LINK = "link text-ink";

export default async function SettingsPage() {
  const [settings, stats] = await Promise.all([getUserSettings(), getLibraryStats()]);

  return (
    <>
      <PageHeading title="Settings" />
      <div className="mt-10 border-b border-rule">
        <SettingsSection
          id="account"
          title="Account"
          description={
            settings.email ? (
              <>
                Signed in as <span className="break-all text-ink">{settings.email}</span>.
              </>
            ) : (
              "You are signed in."
            )
          }
        >
          <form action="/auth/signout" method="post">
            <Button type="submit" size="sm">
              Sign out
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection
          id="categorization"
          title="Categorization"
          description={
            settings.aiConfigured
              ? "When you save a link, Index reads its title and opening text and files it under a category. You can change any of it by hand."
              : "Automatic categorization is off because no Anthropic API key is configured on the server. New links are saved as Unsorted; you can organize them by hand."
          }
        >
          {settings.aiConfigured ? <AiToggle enabled={settings.aiEnabled} /> : null}
        </SettingsSection>

        <PendingAndImport pending={stats.pending} />

        <SettingsSection
          id="export"
          title="Export"
          description="JSON is the complete archive: every link with its notes, categories, tags and collections. CSV opens in any spreadsheet and can be imported back into Index."
        >
          <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href="/api/export?format=json" download className={EXPORT_LINK}>
              Download JSON
            </a>
            <a href="/api/export?format=csv" download className={EXPORT_LINK}>
              Download CSV
            </a>
          </p>
        </SettingsSection>

        <SettingsSection
          id="shortcuts"
          title="Keyboard shortcuts"
          description="These work on any list of links; press ? there to see them."
        >
          <ShortcutList />
        </SettingsSection>
      </div>
    </>
  );
}
