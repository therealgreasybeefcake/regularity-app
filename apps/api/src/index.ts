import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth';
import { env } from './env';
import { requireAuth, type AppVariables } from './middleware';
import { teamRouter } from './routes/team';
import { driverRouter } from './routes/drivers';
import { sessionRouter, lapRouter } from './routes/sessions';
import { liveRouter } from './routes/live';

const app = new Hono<{ Variables: AppVariables }>();

app.use(
  '*',
  cors({
    origin: env.TRUSTED_ORIGINS,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

// BetterAuth mounts all of /api/auth/* (sign-in, OAuth callbacks, session, sign-out).
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Current authenticated user (quick auth integration check).
app.get('/api/me', requireAuth, (c) => c.json({ user: c.get('user') }));

app.route('/api/teams', teamRouter);
app.route('/api/drivers', driverRouter);
app.route('/api/sessions', sessionRouter);
app.route('/api/laps', lapRouter);
app.route('/api/live', liveRouter);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${info.port}`);
});

export { app };
