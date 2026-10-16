"use server";

/** CONTRACT STUB — signatures are final; bodies are implemented by the server layer. */

export interface EmailSignInState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

/** For useActionState: reads "email" and "next" from the form and sends a sign-in link. */
export async function signInWithEmail(_previous: EmailSignInState, _formData: FormData): Promise<EmailSignInState> {
  throw new Error("not implemented");
}

/** Form action: reads "next" from the form and redirects to Google via Supabase OAuth. */
export async function signInWithGoogle(_formData: FormData): Promise<void> {
  throw new Error("not implemented");
}
