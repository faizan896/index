"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/Button";
import { signInWithGoogle } from "@/lib/actions/auth";

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" pending={pending} className="w-full">
      {pending ? "Opening Google…" : "Continue with Google"}
    </Button>
  );
}

/** "Continue with Google": posts to the server, which redirects to Google and back to `next`. */
export function GoogleSignInForm({ next }: { next: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <GoogleButton />
    </form>
  );
}
