import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getQuickBooksConfig } from "./config";

export type QuickBooksStateView = "client" | "admin";

type QuickBooksStatePayload = {
  orgId: string;
  userId: string;
  view: QuickBooksStateView;
  exp: number;
  nonce: string;
};

function sign(payload: string) {
  const { stateSecret } = getQuickBooksConfig();
  return createHmac("sha256", stateSecret).update(payload).digest("base64url");
}

export function createQuickBooksState(input: {
  orgId: string;
  userId: string;
  view: QuickBooksStateView;
}) {
  const payload: QuickBooksStatePayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    nonce: randomBytes(18).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyQuickBooksState(value: string) {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as QuickBooksStatePayload;

    if (
      !payload.orgId ||
      !payload.userId ||
      !payload.nonce ||
      (payload.view !== "client" && payload.view !== "admin") ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function quickBooksReturnPath(input: {
  orgId: string;
  view: QuickBooksStateView;
}) {
  return input.view === "admin"
    ? `/admin/organizations/${input.orgId}/quickbooks`
    : "/app/financials";
}
