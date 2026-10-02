"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { proposalAcceptSchema, proposalDeclineSchema } from "@/lib/contracts/proposals";
import { emitInternalEvent } from "@/lib/events/internal";
import { requireClientUser, requireOrgMember } from "@/lib/auth/guards";
import { requestIp, requestUserAgent } from "@/lib/security/request-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requireClientProposal(proposalId: string) {
  const context = await requireClientUser();
  const supabase = await createServerSupabaseClient();
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("id,org_id,status")
    .eq("id", proposalId)
    .maybeSingle();

  if (error || !proposal) {
    return { error: "Proposal not found." as const };
  }

  const orgContext = await requireOrgMember(proposal.org_id);
  if (orgContext.orgRole !== "client") {
    return { error: "Client membership is required." as const };
  }

  return { context: orgContext, supabase, proposal };
}

export async function acceptProposal(input: {
  proposalId: string;
  acceptedName: string;
  acceptanceConfirmed: boolean;
}) {
  const parsed = proposalAcceptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Confirm the acceptance statement and enter your full name." };
  }

  const proposalContext = await requireClientProposal(parsed.data.proposalId);
  if ("error" in proposalContext) {
    return { ok: false as const, error: proposalContext.error };
  }

  const requestHeaders = await headers();
  const { data, error } = await proposalContext.supabase.rpc("accept_portal_proposal", {
    p_proposal_id: parsed.data.proposalId,
    p_accepted_name: parsed.data.acceptedName,
    p_acceptance_confirmed: true,
    p_ip_address: requestIp(requestHeaders),
    p_user_agent: requestUserAgent(requestHeaders),
  });

  if (error || typeof data !== "string") {
    const message = error?.message ?? "";
    const publicMessage = message.includes("expired")
      ? "This proposal has expired and can no longer be accepted."
      : message.includes("already_accepted")
        ? "A version of this proposal has already been accepted."
        : "The proposal could not be accepted.";

    return { ok: false as const, error: publicMessage };
  }

  await emitInternalEvent({
    name: "proposal_accepted",
    orgId: proposalContext.proposal.org_id,
    actorUserId: proposalContext.context.user.id,
    entityType: "proposal",
    entityId: parsed.data.proposalId,
    metadata: { acceptance_id: data },
  });

  revalidatePath("/app/proposals");
  revalidatePath(`/app/proposals/${parsed.data.proposalId}`);
  return { ok: true as const };
}

export async function declineProposal(input: {
  proposalId: string;
  reason: string;
}) {
  const parsed = proposalDeclineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "The decline reason is too long." };
  }

  const proposalContext = await requireClientProposal(parsed.data.proposalId);
  if ("error" in proposalContext) {
    return { ok: false as const, error: proposalContext.error };
  }

  const { error } = await proposalContext.supabase.rpc("decline_portal_proposal", {
    p_proposal_id: parsed.data.proposalId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const message = error.message;
    return {
      ok: false as const,
      error: message.includes("expired")
        ? "This proposal has expired."
        : "The proposal could not be declined.",
    };
  }

  await emitInternalEvent({
    name: "proposal_declined",
    orgId: proposalContext.proposal.org_id,
    actorUserId: proposalContext.context.user.id,
    entityType: "proposal",
    entityId: parsed.data.proposalId,
  });

  revalidatePath("/app/proposals");
  revalidatePath(`/app/proposals/${parsed.data.proposalId}`);
  return { ok: true as const };
}
