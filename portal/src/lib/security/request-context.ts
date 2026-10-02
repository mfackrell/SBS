import "server-only";

import { isIP } from "node:net";
type HeaderReader = {
  get(name: string): string | null;
};

export function requestIp(headers: HeaderReader) {
  const candidates = [
    headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    headers.get("x-real-ip")?.trim(),
  ].filter((value): value is string => Boolean(value));

  const candidate = candidates.find((value) => isIP(value) !== 0);
  return candidate ?? null;
}

export function requestUserAgent(headers: HeaderReader) {
  return (headers.get("user-agent") ?? "").slice(0, 1000);
}
