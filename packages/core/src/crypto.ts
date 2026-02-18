import crypto from "node:crypto";

import { getConfig } from "./config";

const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const raw = getConfig().ENCRYPTION_KEY;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 43) {
    const base64 = Buffer.from(raw, "base64");
    if (base64.length === 32) return base64;
  }
  const fallback = Buffer.from(raw, "utf8");
  if (fallback.length >= 32) return fallback.subarray(0, 32);
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptJson(payload: unknown): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptJson<T>(encryptedPayload: string): T {
  const [ivStr, tagStr, dataStr] = encryptedPayload.split(":");
  if (!ivStr || !tagStr || !dataStr) {
    throw new Error("Invalid encrypted payload format");
  }
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivStr, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagStr, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataStr, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as T;
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

