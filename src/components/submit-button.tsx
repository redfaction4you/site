"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that admits it is working.
 *
 * A server action gives no feedback of its own, so a form whose action takes a
 * minute — commissioning a feature is a model round trip, a fact check and up
 * to three attempts — looks exactly like a button that is not wired up. That is
 * how it was reported on 9 August: "I clicked write it but nothing reacted."
 *
 * `useFormStatus` has to be read from inside the form it describes, which is
 * why this is its own component rather than a flag passed down.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  /** What it says while the action runs. Say what is happening, not "Loading". */
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      // Disabled rather than only relabelled: pressing it twice would spend a
      // second lot of model quota on the same piece.
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-progress disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
