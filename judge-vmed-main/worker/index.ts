import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { AppConfig } from '../shared/api';
import { authenticate, toAccount } from './auth';
import { accounts } from './routes/accounts';
import { judging } from './routes/judging';
import { results } from './routes/results';
import { rounds } from './routes/rounds';
import { teams } from './routes/teams';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>().basePath('/api');

// JSON bodies stay small: the largest accepted payload is the 1 MB teams CSV.
app.use(
  '*',
  bodyLimit({
    maxSize: 1_500_000,
    onError: (c) => c.json({ error: 'The request is too large. Keep the CSV under 1 MB.' }, 413),
  }),
);
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin)
      return c.json({ error: 'Request origin is not allowed.' }, 403);
  }
  await next();
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error('Unhandled error', err instanceof Error ? err.name : typeof err);
  return c.json({ error: 'Something went wrong. Try again.' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));
app.get('/config', (c) => c.json<AppConfig>({ clerkPublishableKey: c.env.CLERK_PUBLISHABLE_KEY }));

app.use('*', authenticate);
app.get('/me', (c) => c.json(toAccount(c.get('account'))));
app.route('/accounts', accounts);
app.route('/teams', teams);
app.route('/rounds', rounds);
app.route('/results', results);
app.route('/judging', judging);

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

export default app;
