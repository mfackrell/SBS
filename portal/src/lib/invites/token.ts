import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createInviteToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  return { token, tokenHash };
}
