"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { proposalDraftSchema, proposalIdSchema, type ProposalDraftInput } from "@/lib/contracts/proposals";
import { requireOrgManager } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function expiresAtFromDate(value: string | null) {
  return value ? `${value}T23:59:59.999Z` : null;
}

async function proposalManagerContext(proposalId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("id,org_id,status")
    .eq("id", proposalId)
    .maybeSingle();

  if (error || !proposal) {
    redirect("/admin/proposals?error=proposal-not-found");
  }

  await requireOrgManager(proposal.org_id);
  return { supabase, proposal };
}

export async function saveProposalDraft(input: ProposalDraftInput) {
  const parsed = proposalDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Check the proposal title, terms, expiration date, and line items." };
  }

  const { supabase } = await proposalManagerContext(parsed.data.proposalId);
  const { data, error } = await supabase.rpc("update_portal_proposal_draft", {
    p_proposal_id: parsed.data.proposalId,
    p_title: parsed.data.title,
    p_currency: parsed.data.currency,
    p_terms_text: parsed.data.termsText,
    p_expires_at: expiresAtFromDate(parsed.data.expiresOn),
    p_line_items: parsed.data.lineItems.map((item) => ({
      label: item.label,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
    })),
  });

  if (error || typeof data !== "number") {
    return { ok: false as const, error: "The draft could not be saved. Only draft proposals can be edited." };
  }

  revalidatePath("/admin/proposals");
  revalidatePath(`/admin/proposals/${parsed.data.proposalId}`);
  return { ok: true as const, subtotalCents: data };
}

export async function sendProposal(formData: FormData) {
  const parsed = proposalIdSchema.safeParse(formData.get("proposal_id"));
  if (!parsed.success) redirect("/admin/proposals?error=invalid-proposal");

  const { supabase } = await proposalManagerContext(parsed.data);
  const { error } = await supabase.rpc("send_portal_proposal", {
    p_proposal_id: parsed.data,
  });

  if (error) {
    const code = error.message.includes("requires_line_items") ? "line-items-required" : "send-failed";
    redirect(`/admin/proposals/${parsed.data}?error=${code}`);
  }

  revalidatePath("/admin/proposals");
  revalidatePath(`/admin/proposals/${parsed.data}`);
  redirect(`/admin/proposals/${parsed.data}?notice=sent`);
}

export async function createProposalVersion(formData: FormData) {
  const parsed = proposalIdSchema.safeParse(formData.get("proposal_id"));
  if (!parsed.success) redirect("/admin/proposals?error=invalid-proposal");

  const { supabase } = await proposalManagerContext(parsed.data);
  const { data, error } = await supabase.rpc("create_portal_proposal_version", {
    p_proposal_id: parsed.data,
  });

  if (error || typeof data !== "string") {
    redirect(`/admin/proposals/${parsed.data}?error=version-failed`);
  }

  revalidatePath("/admin/proposals");
  redirect(`/admin/proposals/${data}?notice=version-created`);
}
