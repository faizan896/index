import { NextResponse, type NextRequest } from "next/server";

import { siteRedirect } from "@/lib/server/auth-redirect";
import { createSupabaseServerClient } from "@/lib/server/supabase";

/** POST-only, same-origin: a cross-site page can't sign you out. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return siteRedirect(request, "/login");
}
