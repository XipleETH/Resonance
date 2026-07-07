import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { channelFor, commit, getEnergy, getState, heartbeat } from '../core/jam';
import { getProfile, getRankings, upsertUser } from '../core/stats';
import type { JamAction, JamCommitResponse, JamInitResponse, ProfileResponse, RankingsResponse } from '../../shared/jam';

const MAX_BATCH = 8;

export const jam = new Hono();

jam.get('/init', async (c) => {
  const { postId, userId } = context;
  if (!postId) return c.json({ status: 'error', message: 'postId required' }, 400);

  const [state, username] = await Promise.all([getState(postId), reddit.getCurrentUsername()]);
  const energy = userId ? await getEnergy(postId, userId) : 0;

  // Remember this player's Reddit name + avatar for rankings/profiles (best-effort).
  if (userId && username) {
    try {
      const avatar = await reddit.getSnoovatarUrl(username);
      await upsertUser(userId, username, avatar ?? '');
    } catch (e) {
      console.error('upsertUser failed:', e);
    }
  }

  const res: JamInitResponse = {
    type: 'jamInit',
    postId,
    username: username ?? 'anonymous',
    userId: userId ?? '',
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

jam.get('/rankings', async (c) => {
  return c.json<RankingsResponse>(await getRankings());
});

jam.get('/profile', async (c) => {
  const { userId } = context;
  const empty: ProfileResponse = { userId: '', username: 'anónimo', avatar: '', placed: 0, removed: 0, commits: 0, streak: 0, best: 0, favInstrument: '' };
  if (!userId) return c.json<ProfileResponse>(empty);
  return c.json<ProfileResponse>(await getProfile(userId));
});
