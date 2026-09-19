import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function fail(status: ContentfulStatusCode, message: string): never {
  throw new HTTPException(status, { message });
}

export const newId = () => crypto.randomUUID();

export type Body = Record<string, unknown>;

export async function readBody(c: Context): Promise<Body> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(400, 'Request body must be a JSON object.');
  }
  return body as Body;
}

export function str(body: Body, key: string, label: string, min = 1, max = 200): string {
  const value = body[key];
  if (typeof value !== 'string') fail(400, `${label} is required.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail(400, `${label} must be between ${min} and ${max} characters.`);
  }
  return trimmed;
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed');
}

export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes('FOREIGN KEY constraint failed');
}

export function clerkErrorMessage(err: unknown, fallback: string): string {
  const errors = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  return errors?.[0]?.longMessage ?? errors?.[0]?.message ?? fallback;
}
