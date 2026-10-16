import "server-only";

import type { LinkListItem } from "@/lib/types";
import { mapListRow } from "./mappers";
import type { ServerSupabase } from "./supabase";

/** One link as a list item, or null when it doesn't exist for this user. */
export async function loadListItem(supabase: ServerSupabase, linkId: string): Promise<LinkListItem | null> {
  const { data, error } = await supabase.rpc("get_link_item", { p_link_id: linkId });
  if (error) throw error;
  const row = data?.[0];
  return row ? mapListRow(row) : null;
}
