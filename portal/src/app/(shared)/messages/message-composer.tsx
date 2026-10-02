"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { sendMessage } from "./actions";

const composerSchema = z.object({
  body: z.string().trim().min(1, "Enter a message.").max(10_000, "Keep the message under 10,000 characters."),
});

type MessageComposerProps = {
  threadId: string;
  returnPath: string;
};

export function MessageComposer({ threadId, returnPath }: MessageComposerProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [sending, setSending] = useState(false);
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<{ body: string }>({
    defaultValues: { body: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");
    const parsed = composerSchema.safeParse(values);

    if (!parsed.success) {
      setError("body", { message: parsed.error.issues[0]?.message ?? "Enter a message." });
      return;
    }

    setSending(true);
    const result = await sendMessage({
      threadId,
      body: parsed.data.body,
      returnPath,
    });

    if (!result.ok) {
      setServerError(result.error);
      setSending(false);
      return;
    }

    reset();
    setSending(false);
    router.refresh();
  });

  return (
    <form className="message-composer" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="message-body">Message</label>
        <textarea
          id="message-body"
          rows={5}
          placeholder="Write a message"
          {...register("body")}
          aria-invalid={Boolean(errors.body)}
        />
        {errors.body ? <span className="field-message" role="alert">{errors.body.message}</span> : null}
      </div>
      {serverError ? <p className="form-error" role="alert">{serverError}</p> : null}
      <button className="button" type="submit" disabled={sending}>{sending ? "Sending…" : "Send message"}</button>
    </form>
  );
}
