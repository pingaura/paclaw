import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getOrchestratorState, saveOrchestratorState, runOrchestrationCycle } from '../orchestrator';

const orchestratorApi = new Hono<AppEnv>();

// GET /state — Current orchestrator state
orchestratorApi.get('/state', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const state = await getOrchestratorState(bucket);
  return c.json(state);
});

// POST /trigger — Manually trigger an orchestration cycle
orchestratorApi.post('/trigger', async (c) => {
  const sandbox = c.get('sandbox');
  c.executionCtx.waitUntil(
    runOrchestrationCycle(sandbox, c.env).catch((err) => {
      console.error('[Orchestrator] Manual trigger failed:', err);
    }),
  );
  return c.json({ ok: true, message: 'Orchestration cycle triggered' });
});

// POST /toggle — Enable or disable auto-orchestration
orchestratorApi.post('/toggle', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const body = await c.req.json<{ enabled: boolean }>();

  if (typeof body.enabled !== 'boolean') {
    return c.json({ error: 'enabled must be a boolean' }, 400);
  }

  const state = await getOrchestratorState(bucket);
  state.enabled = body.enabled;
  await saveOrchestratorState(bucket, state);

  return c.json({ ok: true, enabled: state.enabled });
});

export { orchestratorApi };
