import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { channelFor, commit, getEnergy, getState, heartbeat } from '../core/jam';
import type { JamAction, JamCommitResponse, JamInitResponse } from '../../shared/jam';

const MAX_BATCH = 8;

export const jam = new Hono();

jam.get('/init', async (c) => {
  const { postId, userId } = context;
  if (!postId) return c.json({ status: 'error', message: 'postId required' }, 400);

  const [state, username] = await Promise.all([getState(postId), reddit.getCurrentUsername()]);
  const energy = userId ? await getEnergy(postId, userId) : 0;

  const res: JamInitResponse = {
    type: 'jamInit',
    postId,
    username: username ?? 'anonymous',
    state,
    energy,
    channel: channelFor(postId),
  };
  return c.json<JamInitResponse>(res);
});

jam.post('/commit', async (c) => {
  const { postId, userId } = context;
  if (!postId) return c.json({ status: 'error', message: 'postId required' }, 400);
  if (!userId) {
    return c.json<JamCommitResponse>(
      { type: 'jamCommit', ok: false, energy: 0, version: 0, message: 'Debes iniciar sesión' },
      200
    );
  }

  const body = await c.req.json<{ actions?: JamAction[] }>();
  const actions = Array.isArray(body.actions) ? body.actions.slice(0, MAX_BATCH) : [];
  const result = await commit(postId, userId, actions);

  const res: JamCommitResponse = {
    type: 'jamCommit',
    ok: result.ok,
    energy: result.energy,
    version: result.version,
    ...(result.message ? { message: result.message } : {}),
  };
  return c.json<JamCommitResponse>(res);
});

jam.post('/heartbeat', async (c) => {
  const { postId, userId } = context;
  if (!postId || !userId) return c.json({ count: 0 });
  const count = await heartbeat(postId, userId);
  return c.json({ count });
});
