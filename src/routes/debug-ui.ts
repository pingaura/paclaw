import { Hono } from 'hono';
import type { AppEnv } from '../types';

const debugUi = new Hono<AppEnv>();

debugUi.get('*', async (c) => {
  const url = new URL(c.req.url);
  return c.env.ASSETS.fetch(new Request(new URL('/debug.html', url.origin).toString()));
});

export { debugUi };
