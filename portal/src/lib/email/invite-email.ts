import "server-only";

import { getServerEnv } from "@/lib/env/server";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function portalInviteActivationUrl(input: {
  inviteId: string;
  token: string;
}) {
  const env = getServerEnv();
  const url = new URL("/accept-invite", env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("invite_id", input.inviteId);
  return `${url.toString()}#token=${encodeURIComponent(input.token)}`;
}

export async function sendPortalInviteEmail(input: {
  to: string;
  organizationName: string;
  inviteId: string;
  token: string;
  role: string;
  expiresAt: string;
}) {
  const env = getServerEnv();

  if (!env.RESEND_API_KEY) {
    throw new Error("branded_email_not_configured");
  }

  const activationUrl = portalInviteActivationUrl({
    inviteId: input.inviteId,
    token: input.token,
  });

  const organizationName = escapeHtml(input.organizationName);
  const recipient = escapeHtml(input.to);
  const role = escapeHtml(input.role);
  const subject = "Strategic Business Services | Activate your client portal access";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f5f0;font-family:Arial,Helvetica,sans-serif;color:#12263f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f5f0;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e1ddd4;">
          <tr>
            <td style="padding:28px 32px;background:#12263f;color:#ffffff;">
              <div style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">SBS</div>
              <div style="font-size:24px;font-weight:700;margin-top:6px;">Strategic Business Services</div>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 32px;">
              <h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;color:#12263f;">Activate your portal access</h1>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#44546a;">You have been invited to the secure Strategic Business Services portal for <strong>${organizationName}</strong>.</p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#44546a;">Your portal role is <strong>${role}</strong>. Use the button below to confirm your name and create your password.</p>
              <p style="margin:0 0 28px;"><a href="${activationUrl}" style="display:inline-block;background:#f2a900;color:#12263f;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:4px;">Activate portal access</a></p>
              <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#667085;">This link is safe to preview in email security scanners. Access is not activated until you submit the portal form.</p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#667085;">If you were not expecting this invitation, you can ignore this email or reply to Strategic Business Services.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px;border-top:1px solid #e1ddd4;font-size:13px;line-height:1.6;color:#667085;">
              Strategic Business Services<br>
              contract-cfo.com<br>
              Invitation sent to ${recipient}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const textBody = [
    "Strategic Business Services",
    "",
    `You have been invited to the secure SBS portal for ${input.organizationName}.`,
    `Portal role: ${input.role}.`,
    "",
    "Activate your portal access:",
    activationUrl,
    "",
    "The link is safe for email security scanners. Access is not activated until you submit the portal form.",
    "",
    "If you were not expecting this invitation, you can ignore this email or reply to Strategic Business Services.",
    "",
    "Strategic Business Services",
    "contract-cfo.com",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.PORTAL_EMAIL_FROM,
      to: [input.to],
      reply_to: env.PORTAL_EMAIL_REPLY_TO,
      subject,
      html,
      text: textBody,
      tags: [
        { name: "message_type", value: "portal_invite" },
        { name: "invite_id", value: input.inviteId },
      ],
    }),
  });

  const payload = await response.json().catch(() => null) as
    | { id?: string; message?: string }
    | null;

  if (!response.ok || !payload?.id) {
    throw new Error(
      `branded_email_delivery_failed:${payload?.message ?? response.status}`,
    );
  }

  return {
    provider: "resend" as const,
    messageId: payload.id,
    activationUrl,
    expiresAt: input.expiresAt,
  };
}
