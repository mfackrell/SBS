"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { acceptProposal, declineProposal } from "./actions";

const acceptanceStatement =
  "I have reviewed this proposal, including its line items, total, and terms, and I accept it on behalf of the organization.";

const acceptanceSchema = z.object({
  acceptedName: z.string().trim().min(2, "Enter your full name.").max(120),
  acceptanceConfirmed: z.literal(true, {
    error: "Confirm the acceptance statement.",
  }),
});

const declineSchema = z.object({
  reason: z.string().trim().max(1000, "Keep the reason under 1,000 characters."),
});

type ProposalDecisionFormProps = {
  proposalId: string;
};

export function ProposalDecisionForm({ proposalId }: ProposalDecisionFormProps) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState("");
  const [working, setWorking] = useState(false);

  const acceptanceForm = useForm<{
    acceptedName: string;
    acceptanceConfirmed: boolean;
  }>({
    defaultValues: {
      acceptedName: "",
      acceptanceConfirmed: false,
    },
  });

  const declineForm = useForm<z.infer<typeof declineSchema>>({
    defaultValues: {
      reason: "",
    },
  });

  const submitAcceptance = acceptanceForm.handleSubmit(async (values) => {
    setServerMessage("");
    const parsed = acceptanceSchema.safeParse(values);

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (field === "acceptedName" || field === "acceptanceConfirmed") {
          acceptanceForm.setError(field, { message: issue.message });
        }
      });
      return;
    }

    setWorking(true);
    const result = await acceptProposal({
      proposalId,
      acceptedName: parsed.data.acceptedName,
      acceptanceConfirmed: true,
    });

    if (!result.ok) {
      setServerMessage(result.error ?? "The proposal action could not be completed.");
      setWorking(false);
      return;
    }

    router.refresh();
  });

  const submitDecline = declineForm.handleSubmit(async (values) => {
    setServerMessage("");
    const parsed = declineSchema.safeParse(values);

    if (!parsed.success) {
      declineForm.setError("reason", { message: parsed.error.issues[0]?.message ?? "Check the decline reason." });
      return;
    }

    setWorking(true);
    const result = await declineProposal({
      proposalId,
      reason: parsed.data.reason,
    });

    if (!result.ok) {
      setServerMessage(result.error ?? "The proposal action could not be completed.");
      setWorking(false);
      return;
    }

    router.refresh();
  });

  return (
    <div className="proposal-decisions">
      <section className="decision-panel">
        <h2>Accept proposal</h2>
        <p>Acceptance records your authenticated user identity, typed name, timestamp, and the exact proposal snapshot.</p>

        <form className="stack-form" onSubmit={submitAcceptance} noValidate>
          <label className="checkbox-field proposal-acceptance-statement">
            <input type="checkbox" {...acceptanceForm.register("acceptanceConfirmed")} />
            <span>{acceptanceStatement}</span>
          </label>
          {acceptanceForm.formState.errors.acceptanceConfirmed ? (
            <span className="field-message">{acceptanceForm.formState.errors.acceptanceConfirmed.message}</span>
          ) : null}

          <div className="field">
            <label htmlFor="accepted-name">Type your full name</label>
            <input id="accepted-name" autoComplete="name" {...acceptanceForm.register("acceptedName")} />
            {acceptanceForm.formState.errors.acceptedName ? (
              <span className="field-message">{acceptanceForm.formState.errors.acceptedName.message}</span>
            ) : null}
          </div>

          <button className="button" type="submit" disabled={working}>Accept proposal</button>
        </form>
      </section>

      <section className="decision-panel decision-panel--secondary">
        <h2>Decline proposal</h2>
        <p>You may include a brief reason. The reason is optional and becomes part of the proposal workflow record.</p>

        <form className="stack-form" onSubmit={submitDecline} noValidate>
          <div className="field">
            <label htmlFor="decline-reason">Reason (optional)</label>
            <textarea id="decline-reason" rows={4} {...declineForm.register("reason")} />
            {declineForm.formState.errors.reason ? (
              <span className="field-message">{declineForm.formState.errors.reason.message}</span>
            ) : null}
          </div>
          <button className="button button--secondary" type="submit" disabled={working}>Decline proposal</button>
        </form>
      </section>

      {serverMessage ? <p className="form-error alert-box" role="alert">{serverMessage}</p> : null}
    </div>
  );
}
