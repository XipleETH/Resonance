import { redis } from '@devvit/web/server';
import type { ProfileResponse, RankingsResponse, RankEntry } from '../../shared/jam';

// Subreddit-wide, all-time. Redis is already scoped per installation/subreddit.
const uKey = (id: string): string => `u:${id}`; // hash: username, avatar, placed, removed, commits, streak, best, lastDay
const uiKey = (id: string): string => `ui:${id}`; // hash: instrumentId -> count (this user)
const LB_PLACED = 'lb:placed';
const LB_REMOVED = 'lb:removed';
const LB_STREAK = 'lb:streak';
const INSTR_GLOBAL = 'instr:global'; // hash instrumentId -> total placed (community)

const dayStr = (now: number): string => new Date(now).toISOString().slice(0, 10);
const num = (v: string | undefined): number => {
  const n = parseInt(v ?? '0', 10);
  return Number.isNaN(n) ? 0 : n;
};

/** Store/refresh a player's Reddit name + avatar (called on init). */
export async function upsertUser(userId: string, username: string, avatar: string): Promise<void> {
  const fields: Record<string, string> = { username };
  if (avatar) fields['avatar'] = avatar;
  await redis.hSet(uKey(userId), fields);
}

/** Record a committed batch: beats placed (by instrument), beats removed, and the daily streak. */
export async function recordCommit(userId: string, placedInstr: string[], removed: number, now: number): Promise<void> {
  const placed = placedInstr.length;
  if (placed > 0) {
    await redis.hIncrBy(uKey(userId), 'placed', placed);
    await redis.zIncrBy(LB_PLACED, userId, placed);
    for (const id of placedInstr) {
      if (!id) continue;
      await redis.hIncrBy(uiKey(userId), id, 1);
      await redis.hIncrBy(INSTR_GLOBAL, id, 1);
    }
  }
  if (removed > 0) {
    await redis.hIncrBy(uKey(userId), 'removed', removed);
    await redis.zIncrBy(LB_REMOVED, userId, removed);
  }
  await redis.hIncrBy(uKey(userId), 'commits', 1);

  // Daily streak: bump once per UTC day; +1 if yesterday, reset to 1 otherwise.
  const h = await redis.hGetAll(uKey(userId));
  const today = dayStr(now);
  if (h['lastDay'] !== today) {
    const yesterday = dayStr(now - 86_400_000);
    const streak = h['lastDay'] === yesterday ? num(h['streak']) + 1 : 1;
    const best = Math.max(streak, num(h['best']));
    await redis.hSet(uKey(userId), { lastDay: today, streak: String(streak), best: String(best) });
    await redis.zAdd(LB_STREAK, { member: userId, score: streak });
  }
}

async function topEntries(key: string, topN: number): Promise<RankEntry[]> {
  const rows = await redis.zRange(key, 0, topN - 1, { reverse: true, by: 'rank' });
  const out: RankEntry[] = [];
  for (const r of rows) {
    const h = await redis.hGetAll(uKey(r.member));
    out.push({ userId: r.member, username: h['username'] ?? 'anónimo', avatar: h['avatar'] ?? '', value: r.score });
  }
  return out;
}

export async function getRankings(topN = 10): Promise<RankingsResponse> {
  const [placed, removed, streak, gi] = await Promise.all([
    topEntries(LB_PLACED, topN),
    topEntries(LB_REMOVED, topN),
    topEntries(LB_STREAK, topN),
    redis.hGetAll(INSTR_GLOBAL),
  ]);
  let topInstrument: { id: string; count: number } | null = null;
  for (const [id, cnt] of Object.entries(gi ?? {})) {
    const c = num(cnt);
    if (!topInstrument || c > topInstrument.count) topInstrument = { id, count: c };
  }
  return { placed, removed, streak, topInstrument };
}

export async function getProfile(userId: string): Promise<ProfileResponse> {
  const [h, ui] = await Promise.all([redis.hGetAll(uKey(userId)), redis.hGetAll(uiKey(userId))]);
  let favInstrument = '';
  let favN = -1;
  for (const [id, cnt] of Object.entries(ui ?? {})) {
    const c = num(cnt);
    if (c > favN) {
      favN = c;
      favInstrument = id;
    }
  }
  return {
    userId,
    username: h['username'] ?? 'anónimo',
    avatar: h['avatar'] ?? '',
    placed: num(h['placed']),
    removed: num(h['removed']),
    commits: num(h['commits']),
    streak: num(h['streak']),
    best: num(h['best']),
    favInstrument,
  };
}
