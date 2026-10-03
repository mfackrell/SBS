import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getQuickBooksConfig } from "./config";

function decodeEncryptionKey(value: string) {
  const trimmed = value.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== 32) {
    throw new Error("QUICKBOOKS_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

export function encryptQuickBooksSecret(value: string) {
  const { tokenEncryptionKey } = getQuickBooksConfig();
  const key = decodeEncryptionKey(tokenEncryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptQuickBooksSecret(value: string) {
  const { tokenEncryptionKey } = getQuickBooksConfig();
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");

  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported QuickBooks credential ciphertext.");
  }

  const key = decodeEncryptionKey(tokenEncryptionKey);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
