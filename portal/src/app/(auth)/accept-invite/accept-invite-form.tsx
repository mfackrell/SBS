"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createInviteBrowserSupabaseClient } from "@/lib/supabase/invite-client";
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

export function AcceptInviteForm() {
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "missing">("checking");
  const [accountEmail, setAccountEmail] = useState("");
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
    let active = true;
    const supabase = createInviteBrowserSupabaseClient();

    async function loadInviteSession() {
      await supabase.auth.getSession();
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        setSessionState("missing");
        return;
      }

      setAccountEmail(data.user.email ?? "");
      setSessionState("ready");
    }

    void loadInviteSession();

    return () => {
      active = false;
    };
  }, []);

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

    setSubmitting(true);

    const supabase = createInviteBrowserSupabaseClient();
    const { error: passwordError } = await supabase.auth.updateUser({
      password: parsed.data.password,
      data: {
        full_name: parsed.data.fullName,
      },
    });

    if (passwordError) {
      setServerError("We could not set your password. The invitation may have expired.");
      setSubmitting(false);
      return;
    }

    const result = await finalizeInvite({ fullName: parsed.data.fullName });

    if (result?.error) {
      setServerError(result.error);
      setSubmitting(false);
    }
  });

  if (sessionState === "checking") {
    return <p className="auth-note" role="status">Checking your invitation.</p>;
  }

  if (sessionState === "missing") {
    return (
      <div className="auth-state" role="alert">
        <strong>Invitation session not found</strong>
        <p>Open the newest invitation email from Strategic Business Services. If the link has expired, ask for a new invitation.</p>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={onSubmit} noValidate>
      {accountEmail ? <p className="invite-email">Invited account: <strong>{accountEmail}</strong></p> : null}

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
