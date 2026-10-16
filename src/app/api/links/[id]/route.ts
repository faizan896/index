import { apiClient, json } from "@/lib/server/api";
import { loadListItem } from "@/lib/server/items";
import { logServerError } from "@/lib/server/log";
import { isUuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** One link as a list item: polled while it's being fetched and categorized. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Not found." }, 404);

  const auth = await apiClient();
  if ("response" in auth) return auth.response;

  try {
    const item = await loadListItem(auth.supabase, id);
    if (!item) return json({ error: "Not found." }, 404);
    return json({ item });
  } catch (error) {
    logServerError("api: link item", error);
    return json({ error: "Could not load this item." }, 500);
  }
}
