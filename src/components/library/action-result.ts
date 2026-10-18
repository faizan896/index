import type { ActionResult } from "@/lib/types";

const UNREACHABLE = "Index couldn't be reached. Check your connection and try again.";

/**
 * Awaits a server action. Actions never throw on their own, but the request
 * can fail (offline, deploy in progress); that becomes a calm error result.
 */
export async function settle<T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await call;
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}
