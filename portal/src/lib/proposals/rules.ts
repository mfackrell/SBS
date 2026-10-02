export function proposalCanBeAccepted(input: {
  status: string;
  expiresAt: string | null;
  now?: Date;
}) {
  if (input.status !== "sent" && input.status !== "viewed") {
    return false;
  }

  if (!input.expiresAt) {
    return true;
  }

  const expiration = new Date(input.expiresAt);
  const now = input.now ?? new Date();

  return Number.isFinite(expiration.getTime()) && expiration.getTime() > now.getTime();
}
