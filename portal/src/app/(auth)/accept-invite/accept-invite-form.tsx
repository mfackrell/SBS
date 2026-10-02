"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { finalizeInvite } from "./actions";

const formSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    password: z.string().min(12, "Use at least 12 characters."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

type FormValues = z.infer<typeof formSchema>;

type AcceptInviteFormProps = {
  inviteId: string;
};

export function AcceptInviteForm({ inviteId }: AcceptInviteFormProps) {
  const [inviteToken, setInviteToken] = useState("");
  const [linkState, setLinkState] = useState<"checking" | "ready" | "missing">("checking");
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      fullName: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = fragment.get("token") ?? "";

      if (!inviteId || !token) {
        setLinkState("missing");
        return;
      }

      setInviteToken(token);
      setLinkState("ready");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [inviteId]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");

    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (field === "fullName" || field === "password" || field === "confirmPassword") {
          setError(field, { message: issue.message });
        }
      });
      return;
    }

    if (!inviteId || !inviteToken) {
      setServerError("This invitation link is incomplete. Use the newest invitation link.");
      return;
    }

    setSubmitting(true);

    const result = await finalizeInvite({
      inviteId,
      inviteToken,
      fullName: parsed.data.fullName,
      password: parsed.data.password,
    });

    if (result?.error) {
      setServerError(result.error);
      setSubmitting(false);
    }
  });

  if (linkState === "checking") {
    return <p className="auth-note" role="status">Checking your invitation.</p>;
  }

  if (linkState === "missing") {
    return (
      <div className="auth-state" role="alert">
        <strong>Invitation link is incomplete</strong>
        <p>Use the newest invitation link from Strategic Business Services. If you need another link, ask SBS to resend the invitation.</p>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" autoComplete="name" {...register("fullName")} aria-invalid={Boolean(errors.fullName)} />
        {errors.fullName ? <span className="field-message" role="alert">{errors.fullName.message}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="password">Create password</label>
        <input id="password" type="password" autoComplete="new-password" {...register("password")} aria-invalid={Boolean(errors.password)} />
        {errors.password ? <span className="field-message" role="alert">{errors.password.message}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} aria-invalid={Boolean(errors.confirmPassword)} />
        {errors.confirmPassword ? <span className="field-message" role="alert">{errors.confirmPassword.message}</span> : null}
      </div>

      {serverError ? <p className="form-error" role="alert">{serverError}</p> : null}

      <button className="button" type="submit" disabled={submitting}>
        {submitting ? "Activating access…" : "Activate portal access"}
      </button>
    </form>
  );
}
