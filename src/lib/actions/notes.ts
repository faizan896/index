"use server";

/** CONTRACT STUB — signatures are final; bodies are implemented by the server layer. */
import type { ActionResult, Note } from "@/lib/types";

export async function addNote(_linkId: string, _body: string): Promise<ActionResult<Note>> {
  throw new Error("not implemented");
}

export async function updateNote(_noteId: string, _body: string): Promise<ActionResult<Note>> {
  throw new Error("not implemented");
}

export async function deleteNote(_noteId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}
