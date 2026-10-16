import "server-only";

import type { ActionResult } from "@/lib/types";
import { isEmailAllowed } from "./env";
import { logServerError } from "./log";
import { createSupabaseServerClient, type ServerSupabase } from "./supabase";

export interface ActionContext {
  supabase: ServerSupabase;
  user: { id: string; email: string | null };
}

/** The signed-in user's client, or null when the session is gone or not allowed. */
export async function getActionContext(): Promise<ActionContext | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || !isEmailAllowed(data.user.email)) return null;
    return { supabase, user: { id: data.user.id, email: data.user.email ?? null } };
  } catch (error) {
    logServerError("action: context", error);
    return null;
  }
}

export const SIGNED_OUT = "Your session has ended. Sign in again to continue.";
export const NOT_FOUND = "That item no longer exists.";
export const GENERIC_FAILURE = "That didn't work. Please try again.";

export function ok(): ActionResult;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | null> {
  return { ok: true, data: (data ?? null) as T | null };
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { ok: false, error };
}

/** Logs an unexpected database error and returns a calm failure. */
export function dbFailure<T = never>(scope: string, error: unknown, message = GENERIC_FAILURE): ActionResult<T> {
  logServerError(scope, error);
  return { ok: false, error: message };
}
