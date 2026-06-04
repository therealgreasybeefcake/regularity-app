import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth';
import { env } from './env';
import { requireAuth, type AppVariables } from './middleware';
import { deleteUserAccount } from './lib/domain';
import { teamRouter } from './routes/team';
import { memberRouter, inviteRouter } from './routes/members';
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

// Permanently delete the signed-in user's account (+ owned data; shared teams
// they own are handed to a co-owner). The session cascade-invalidates server-side.
app.delete('/api/me', requireAuth, async (c) => {
  await deleteUserAccount(c.get('user').id);
  return c.json({ ok: true });
});

app.route('/api/teams', teamRouter);
app.route('/api/teams', memberRouter);
app.route('/api/invites', inviteRouter);
app.route('/api/drivers', driverRouter);
app.route('/api/sessions', sessionRouter);
app.route('/api/laps', lapRouter);
app.route('/api/live', liveRouter);

// Serve the Expo web build (same-origin) when present (set in the production
// image). Static assets first, then an SPA fallback to index.html so client
// routes like /live/<token> and /login resolve.
const webDist = process.env.WEB_DIST;
if (webDist) {
  // Content-hashed assets (entry-<hash>.js, fonts, images) never change, so cache
  // them for a year. index.html (and the SPA fallback) must NOT be cached, or
  // browsers keep loading an old bundle after a deploy (stale web).
  app.use(
    '/*',
    serveStatic({
      root: webDist,
      onFound: (filePath, c) => {
        if (
          /\/_expo\/static\//.test(filePath) ||
          /\.(js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp)$/i.test(filePath)
        ) {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          c.header('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get(
    '*',
    serveStatic({
      root: webDist,
      path: 'index.html',
      onFound: (_filePath, c) => c.header('Cache-Control', 'no-cache'),
    }),
  );
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${info.port}`);
});

export { app };
