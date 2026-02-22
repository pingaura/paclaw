import { Hono } from 'hono';
import type { AppEnv } from '../types';

/**
 * Team Dashboard UI routes
 * Serves team.html for /_team/* routes (SPA).
 *
 * Note: Static assets (/_admin/assets/*) are shared with admin app.
 * Auth is applied centrally in index.ts before this app is mounted.
 */
const teamUi = new Hono<AppEnv>();

// Serve team.html for all team routes (SPA)
teamUi.get('*', async (c) => {
  const url = new URL(c.req.url);
  return c.env.ASSETS.fetch(new Request(new URL('/team.html', url.origin).toString()));
});

export { teamUi };
