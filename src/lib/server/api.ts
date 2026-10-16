import "server-only";

import { NextResponse } from "next/server";

import { isEmailAllowed } from "./env";
import { createSupabaseServerClient, type ServerSupabase } from "./supabase";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** The signed-in user's client for a route handler, or a 401 response. */
export async function apiClient(): Promise<{ supabase: ServerSupabase } | { response: NextResponse }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !isEmailAllowed(data.user.email)) {
    return { response: json({ error: "Sign in to continue." }, 401) };
  }
  return { supabase };
}
