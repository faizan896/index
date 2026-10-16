import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { requireSupabaseConfig } from "./env";

/**
 * A Supabase client acting as the signed-in user (from the session cookies).
 * Row-level security applies to everything it does. There is deliberately no
 * service-role client anywhere in this app.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, key } = requireSupabaseConfig();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session on every request, so this is safe.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
