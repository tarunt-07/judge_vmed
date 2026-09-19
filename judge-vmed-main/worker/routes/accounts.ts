import { Hono } from 'hono';
import { clerkClient, requireRole, toAccount } from '../auth';
import { clerkErrorMessage, fail, isUniqueViolation, newId, readBody, str } from '../lib';
import type { AccountRow, AppEnv } from '../types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-zA-Z0-9_-]{4,64}$/;

export const accounts = new Hono<AppEnv>();
accounts.use('*', requireRole('admin'));

accounts.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM accounts ORDER BY role, display_name COLLATE NOCASE',
  ).all<AccountRow>();
  return c.json(results.map(toAccount));
});

accounts.post('/admins', async (c) => {
  const body = await readBody(c);
  const email = str(body, 'email', 'Email', 3, 254).toLowerCase();
  const displayName = str(body, 'displayName', 'Name', 1, 120);
  if (!EMAIL.test(email)) fail(400, 'Enter a valid email address.');

  const existing = await c.env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first();
  if (existing) fail(409, 'An admin with this email already exists.');

  try {
    await clerkClient(c.env).invitations.createInvitation({
      emailAddress: email,
      redirectUrl: new URL('/', c.req.url).toString(),
      ignoreExisting: true,
    });
  } catch (err) {
    fail(422, clerkErrorMessage(err, 'Could not send the invitation email.'));
  }

  const id = newId();
  try {
    await c.env.DB.prepare("INSERT INTO accounts (id, role, email, display_name) VALUES (?, 'admin', ?, ?)")
      .bind(id, email, displayName)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'An admin with this email already exists.');
    throw err;
  }
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<AccountRow>();
  return c.json(toAccount(row as AccountRow), 201);
});

accounts.post('/judges', async (c) => {
  const body = await readBody(c);
  const username = str(body, 'username', 'Username', 4, 64).toLowerCase();
  const displayName = str(body, 'displayName', 'Name', 1, 120);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME.test(username)) fail(400, 'Username can use letters, numbers, _ and -, 4 to 64 characters.');
  if (password.length < 8 || password.length > 72) fail(400, 'Password must be 8 to 72 characters.');

  const existing = await c.env.DB.prepare('SELECT id FROM accounts WHERE username = ?').bind(username).first();
  if (existing) fail(409, 'A judge with this username already exists.');

  const clerk = clerkClient(c.env);
  let clerkUserId: string;
  try {
    const user = await clerk.users.createUser({ username, password, firstName: displayName });
    clerkUserId = user.id;
  } catch (err) {
    fail(422, clerkErrorMessage(err, 'Could not create the judge login.'));
  }

  const id = newId();
  try {
    await c.env.DB.prepare(
      "INSERT INTO accounts (id, role, username, display_name, clerk_user_id) VALUES (?, 'judge', ?, ?, ?)",
    )
      .bind(id, username, displayName, clerkUserId)
      .run();
  } catch (err) {
    await clerk.users.deleteUser(clerkUserId).catch(() => undefined);
    if (isUniqueViolation(err)) fail(409, 'A judge with this username already exists.');
    throw err;
  }
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<AccountRow>();
  return c.json(toAccount(row as AccountRow), 201);
});

accounts.patch('/:id', async (c) => {
  const body = await readBody(c);
  const me = c.get('account');
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(c.req.param('id')).first<AccountRow>();
  if (!row) fail(404, 'Account not found.');

  if (typeof body.active === 'boolean') {
    if (row.id === me.id) fail(400, 'You cannot disable your own account.');
    const initial = c.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    if (!body.active && row.email && row.email.toLowerCase() === initial) {
      fail(400, 'The initial admin cannot be disabled.');
    }
    row.active = body.active ? 1 : 0;
  }
  if (body.displayName !== undefined) row.display_name = str(body, 'displayName', 'Name', 1, 120);

  await c.env.DB.prepare('UPDATE accounts SET active = ?, display_name = ? WHERE id = ?')
    .bind(row.active, row.display_name, row.id)
    .run();
  return c.json(toAccount(row));
});

accounts.post('/:id/password', async (c) => {
  const body = await readBody(c);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 72) fail(400, 'Password must be 8 to 72 characters.');
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(c.req.param('id')).first<AccountRow>();
  if (!row) fail(404, 'Account not found.');
  if (row.role !== 'judge' || !row.clerk_user_id) fail(400, 'Only judge passwords can be reset here.');
  try {
    await clerkClient(c.env).users.updateUser(row.clerk_user_id, { password });
  } catch (err) {
    fail(422, clerkErrorMessage(err, 'Could not reset the password.'));
  }
  return c.body(null, 204);
});
