import type { NextRequest } from "next/server";

import { buildLibraryExport, exportFilename, libraryExportToCsv } from "@/lib/core/export";
import { apiClient, json } from "@/lib/server/api";
import { logServerError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The whole library as a download: ?format=json (complete) or ?format=csv. */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

  const auth = await apiClient();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase.rpc("export_library");
  if (error) {
    logServerError("api: export", error);
    return json({ error: "Could not export your library." }, 500);
  }

  const exportedAt = new Date();
  const document = buildLibraryExport(data, exportedAt);
  const filename = exportFilename(format, exportedAt);
  const body = format === "csv" ? libraryExportToCsv(document) : JSON.stringify(document, null, 2);

  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
