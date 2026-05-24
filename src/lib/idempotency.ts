import { createHash } from "crypto";
import { prisma } from "./prisma";

export function hashBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export async function getCachedResponse(
  key: string,
  bodyHash: string
): Promise<{ status: number; body: unknown } | null> {
  const cached = await prisma.idempotencyCache.findUnique({
    where: { key },
  });

  if (!cached) return null;
  if (cached.requestBodyHash !== bodyHash) return null;
  if (cached.expiresAt < new Date()) return null;

  return {
    status: cached.responseStatus,
    body: JSON.parse(cached.responseBody),
  };
}

export async function cacheResponse(
  key: string,
  method: string,
  path: string,
  bodyHash: string,
  status: number,
  body: unknown,
  ttlMinutes = 60
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await prisma.idempotencyCache.create({
    data: {
      key,
      requestMethod: method,
      requestPath: path,
      requestBodyHash: bodyHash,
      responseStatus: status,
      responseBody: JSON.stringify(body),
      expiresAt,
    },
  });
}
