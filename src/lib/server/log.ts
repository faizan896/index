/**
 * Server error logging that never writes user content. Logs a scope, an error
 * class/code and a short message — no URLs, titles, notes, emails or tokens.
 */
export function logServerError(scope: string, error: unknown): void {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "";
  // Messages from Postgres can quote values; keep only their first clause.
  const summary = message.split(/[:\n]/)[0]?.slice(0, 160) ?? "";
  console.error(`[index] ${scope}: ${name}${code ? ` ${code}` : ""}${summary ? ` — ${summary}` : ""}`);
}
