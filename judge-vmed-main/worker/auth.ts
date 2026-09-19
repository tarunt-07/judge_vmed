import { createClerkClient } from '@clerk/backend';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Account, Role } from '../shared/api';
import { fail, newId } from './lib';
import type { AccountRow, AppEnv, Bindings } from './types';

export type Clerk = ReturnType<typeof createClerkClient>;

export function clerkClient(env: Bindings): Clerk {
  return createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
}

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    active: row.active === 1,
    linked: row.clerk_user_id !== null,
    createdAt: row.created_at,
  };
}

function authorizedParties(c: Context<AppEnv>): string[] {
  const extra = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([new URL(c.req.url).origin, ...extra])];
}

function findByClerkId(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM accounts WHERE clerk_user_id = ?').bind(userId).first<AccountRow>();
}

// Admins are matched only by Clerk's verified primary email. Judges are never matched by email:
// their Clerk user is created with a username and linked at creation time.
async function linkAdminByEmail(c: Context<AppEnv>, clerk: Clerk, userId: string) {
  const user = await clerk.users.getUser(userId);
  const primary = user.emailAddresses.find((value) => value.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') return null;

  const email = primary.emailAddress.toLowerCase();
  const db = c.env.DB;
  const statements: D1PreparedStatement[] = [];
  const initial = c.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (initial && email === initial) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Admin';
    statements.push(
      db
        .prepare("INSERT INTO accounts (id, role, email, display_name) VALUES (?, 'admin', ?, ?) ON CONFLICT DO NOTHING")
        .bind(newId(), email, name),
    );
  }
  statements.push(
    db
      .prepare("UPDATE accounts SET clerk_user_id = ? WHERE role = 'admin' AND email = ? AND clerk_user_id IS NULL")
      .bind(userId, email),
  );
  await db.batch(statements);
  return findByClerkId(db, userId);
}

export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.env.CLERK_SECRET_KEY || !c.env.CLERK_PUBLISHABLE_KEY) fail(503, 'Sign-in is not configured yet.');
  if (!c.req.header('Authorization')?.startsWith('Bearer ')) fail(401, 'Please sign in.');

  const clerk = clerkClient(c.env);
  let userId: string | null = null;
  try {
    const state = await clerk.authenticateRequest(c.req.raw, {
      authorizedParties: authorizedParties(c),
      acceptsToken: 'session_token',
    });
    userId = state.toAuth()?.userId ?? null;
  } catch {
    fail(401, 'Please sign in again.');
  }
  if (!userId) fail(401, 'Please sign in again.');

  const account = (await findByClerkId(c.env.DB, userId)) ?? (await linkAdminByEmail(c, clerk, userId));
  if (!account) fail(403, 'This account has not been added to judging. Contact an admin.');
  if (account.active !== 1) fail(403, 'This account has been disabled. Contact an admin.');
  c.set('account', account);
  await next();
});

export const requireRole = (role: Role) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('account').role !== role) fail(403, 'You do not have access to this.');
    await next();
  });
