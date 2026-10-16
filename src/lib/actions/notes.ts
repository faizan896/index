"use server";

import { revalidatePath } from "next/cache";

import { dbFailure, fail, getActionContext, NOT_FOUND, ok, SIGNED_OUT } from "@/lib/server/action-context";
import { mapNote } from "@/lib/server/mappers";
import type { ActionResult, Note } from "@/lib/types";
import { isUuid, optionalText } from "@/lib/validate";

const MAX_NOTE_LENGTH = 20_000;

function cleanBody(body: unknown): string | null {
  return optionalText(body, MAX_NOTE_LENGTH) ?? null;
}

export async function addNote(linkId: string, body: string): Promise<ActionResult<Note>> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  const text = cleanBody(body);
  if (!text) return fail("Write something first.");

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase
    .from("notes")
    .insert({ link_id: linkId, body: text })
    .select("id, link_id, body, created_at, updated_at")
    .single();
  // A foreign-key violation means the link isn't there (or isn't ours).
  if (error) return error.code === "23503" ? fail(NOT_FOUND) : dbFailure("addNote", error, "Couldn't save the note.");
  revalidatePath(`/item/${linkId}`);
  return ok(mapNote(data));
}

export async function updateNote(noteId: string, body: string): Promise<ActionResult<Note>> {
  if (!isUuid(noteId)) return fail("That note no longer exists.");
  const text = cleanBody(body);
  if (!text) return fail("A note can't be empty. Delete it instead.");

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase
    .from("notes")
    .update({ body: text })
    .eq("id", noteId)
    .select("id, link_id, body, created_at, updated_at")
    .maybeSingle();
  if (error) return dbFailure("updateNote", error, "Couldn't save the note.");
  if (!data) return fail("That note no longer exists.");
  revalidatePath(`/item/${data.link_id}`);
  return ok(mapNote(data));
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  if (!isUuid(noteId)) return fail("That note no longer exists.");
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase.from("notes").delete().eq("id", noteId).select("link_id").maybeSingle();
  if (error) return dbFailure("deleteNote", error, "Couldn't delete the note.");
  if (data) revalidatePath(`/item/${data.link_id}`);
  return ok();
}
