import { createMiddleware } from 'hono/factory';
import { auth } from './auth';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type AppVariables = {
  user: AuthUser;
  sessionToken: string;
};

/** Rejects unauthenticated requests; otherwise sets `user` on the context. */
export const requireAuth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result?.user) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  c.set('user', {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
  });
  await next();
});
