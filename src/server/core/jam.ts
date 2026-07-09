import { redis, realtime } from '@devvit/web/server';
import {
  decodeFx,
  encodeFx,
  instrumentById,
  LIBRARY,
  MAX_FICHAS,
  pickDailyPool,
  REFILL_MS,
  STEPS,
  TRACKS,
  type Cell,
  type JamAction,
  type JamDiff,
  type JamMeta,
  type JamState,
  type TrackFx,
} from '../../shared/jam';
import { recordCommit } from './stats';

const PRESENCE_TTL_MS = 30_000;

const metaKey = (postId: string): string => `jam:${postId}:meta`;
const gridKey = (postId: string): string => `jam:${postId}:grid`;
const energyKey = (postId: string, userId: string): string => `jam:${postId}:energy:${userId}`;
const presenceKey = (postId: string): string => `jam:${postId}:presence`;
// Realtime channel names cannot contain ':' — use a hyphen (Redis keys keep the colons).
export const channelFor = (postId: string): string => `jam-${postId}`;

const intOr = (v: string | undefined, d: number): number => {
  if (v === undefined) return d;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
};

const currentPeriod = (now: number): number => Math.floor(now / REFILL_MS);
const todayStr = (now: number): string => new Date(now).toISOString().slice(0, 10);

// A grid cell's value encodes its placer + its expression: "by" (flat) or "by;<encoded fx>".
// Store whenever ANY expression is non-default (wave, pitch, ratchet, or duration), not just
// the wave — otherwise a beat pitched/ratcheted without a wave would lose those on save.
const cellHasFx = (fx: TrackFx): boolean =>
  fx.depth > 0 || fx.pitch !== 0 || fx.sub !== 1 || fx.vol !== 0 || Math.round(fx.dur * 100) !== 50;
const cellVal = (by: string, fx: TrackFx): string => (cellHasFx(fx) ? `${by};${encodeFx(fx)}` : by);
const parseCell = (value: string): { by: string; fx: TrackFx } => {
  const i = value.indexOf(';');
  return i < 0
    ? { by: value, fx: decodeFx(undefined) }
    : { by: value.slice(0, i), fx: decodeFx(value.slice(i + 1)) };
};

// tiny deterministic RNG so every client agrees on the day's base
const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Generate today's random-but-musical base: 3 seeded tracks + 3 empty slots. */
async function seedJam(postId: string, now: number): Promise<void> {
  const day = todayStr(now);
  const rnd = mulberry32(hashStr(day + postId));
  const bpm = 88 + Math.floor(rnd() * 5) * 4; // 88..104 in steps of 4
  // A fresh base note (root of the pentatonic) each day — the whole jam transposes to it.
  const KEYS = ['C', 'D', 'E', 'F', 'G', 'A'];
  const key = KEYS[Math.floor(mulberry32(hashStr(day))() * KEYS.length)] ?? 'C';

  // The day's pickable palette (a random 24 of the whole library, same for everyone).
  const pool = pickDailyPool(day);
  const inCat = (cat: string): string | undefined => pool.find((id) => instrumentById(id)?.category === cat);
  // Seed 3 starter rows FROM the pool (a beat, a bass, a melody if present); rest empty.
  const seededIds = [inCat('drum') ?? pool[0], inCat('bass') ?? pool[1], inCat('melody') ?? pool[2]];
  const metaFields: Record<string, string> = {
    day,
    key,
    scale: 'minor-pentatonic',
    bpm: String(bpm),
    bpmMin: String(bpm - 20),
    bpmMax: String(bpm + 20),
    t0: String(now),
    steps: String(STEPS),
    tracks: String(TRACKS),
    version: '1',
    pool: pool.join(','),
  };
  for (let t = 0; t < TRACKS; t++) metaFields['inst' + t] = seededIds[t] ?? '';
  // Start CLEAN: 3 instruments + a tempo, but NO notes — the community builds from zero.
  await redis.hSet(metaKey(postId), metaFields);
}

export async function getState(postId: string): Promise<JamState> {
  const now = Date.now();
  let metaRaw = await redis.hGetAll(metaKey(postId));
  if (!metaRaw || !metaRaw['day']) {
    await seedJam(postId, now);
    metaRaw = await redis.hGetAll(metaKey(postId));
  }

  const tracks = intOr(metaRaw['tracks'], TRACKS);
  const instruments: string[] = [];
  for (let t = 0; t < tracks; t++) instruments.push(metaRaw['inst' + t] ?? '');

  const day = metaRaw['day'] ?? todayStr(now);
  const poolRaw = metaRaw['pool'];
  const pool = poolRaw ? poolRaw.split(',').filter(Boolean) : pickDailyPool(day); // fallback for pre-pool posts
  const meta: JamMeta = {
    day,
    key: metaRaw['key'] ?? 'C',
    scale: metaRaw['scale'] ?? 'minor-pentatonic',
    bpm: intOr(metaRaw['bpm'], 96),
    bpmMin: intOr(metaRaw['bpmMin'], 76),
    bpmMax: intOr(metaRaw['bpmMax'], 116),
    t0: intOr(metaRaw['t0'], now),
    steps: intOr(metaRaw['steps'], STEPS),
    tracks,
    version: intOr(metaRaw['version'], 1),
    instruments,
    pool,
  };

  const gridRaw = await redis.hGetAll(gridKey(postId));
  const cells: Cell[] = [];
  for (const [field, value] of Object.entries(gridRaw ?? {})) {
    const parts = field.split('_');
    const track = intOr(parts[0], -1);
    const step = intOr(parts[1], -1);
    if (track >= 0 && step >= 0) {
      const { by, fx } = parseCell(value);
      cells.push({ track, step, by, fx });
    }
  }

  return { meta, cells };
}

/** Effective fichas for a user right now (refills to MAX when the 12h period rolls over). */
export async function getEnergy(postId: string, userId: string): Promise<number> {
  const raw = await redis.hGetAll(energyKey(postId, userId));
  if (!raw || intOr(raw['period'], -1) !== currentPeriod(Date.now())) return MAX_FICHAS;
  return Math.max(0, Math.min(MAX_FICHAS, intOr(raw['fichas'], MAX_FICHAS)));
}

const validCell = (track: number, step: number, meta: JamMeta): boolean =>
  track >= 0 && track < meta.tracks && step >= 0 && step < meta.steps;

export type CommitResult = { ok: boolean; energy: number; version: number; message?: string };

/** Apply a batch of actions (each costs 1 ficha), broadcasting each as a realtime diff. */
export async function commit(
  postId: string,
  userId: string,
  actions: JamAction[]
): Promise<CommitResult> {
  const state = await getState(postId);
  const fichas = await getEnergy(postId, userId);

  // Who placed each existing beat (for ownership-based cost).
  const ownerOf = new Map<string, string>();
  for (const c of state.cells) ownerOf.set(`${c.track}_${c.step}`, c.by);
  const mine = (k: string): boolean => ownerOf.get(k) === userId;

  // place a beat = 1; removing a committed beat = 1 (even your own, so saves stick);
  // editing YOUR OWN beat's wave = 0, someone else's = 1;
  // choosing an instrument for an EMPTY row = 0 (rides on the first beat's ficha), changing
  // an existing one = 1; tempo = 1 per 2 BPM.
  const actionCost = (a: JamAction): number => {
    switch (a.kind) {
      case 'remove':
        return 1;
      case 'setCellFx':
        return mine(`${a.track}_${a.step}`) ? 0 : 1;
      case 'setInstrument':
        return (state.meta.instruments[a.track] ?? '') === '' ? 0 : 1;
      case 'nudgeTempo':
        return Math.max(1, Math.ceil(Math.abs(a.delta) / 2));
      default:
        return 1; // place
    }
  };
  const cost = actions.reduce((sum, a) => sum + actionCost(a), 0);
  if (actions.length === 0) return { ok: true, energy: fichas, version: state.meta.version };
  if (cost > fichas) {
    return { ok: false, energy: fichas, version: state.meta.version, message: 'Sin fichas suficientes' };
  }

  const channel = channelFor(postId);
  const gk = gridKey(postId);
  let version = state.meta.version;
  let bpm = state.meta.bpm;

  // Effective instrument per track (committed + any setInstrument in this same batch) so a
  // placed beat is attributed to the right sound for the "favorite instrument" stat.
  const effInst = [...state.meta.instruments];
  for (const a of actions) if (a.kind === 'setInstrument' && a.track >= 0 && a.track < effInst.length) effInst[a.track] = a.instrument;
  const placedInstr: string[] = [];
  let removedN = 0;

  for (const a of actions) {
    version = await redis.hIncrBy(metaKey(postId), 'version', 1);

    if (a.kind === 'place') {
      if (!validCell(a.track, a.step, state.meta)) continue;
      await redis.hSet(gk, { [`${a.track}_${a.step}`]: cellVal(userId, a.fx) });
      await realtime.send<JamDiff>(channel, { kind: 'place', track: a.track, step: a.step, by: userId, fx: a.fx, version });
      placedInstr.push(effInst[a.track] ?? '');
    } else if (a.kind === 'remove') {
      if (!validCell(a.track, a.step, state.meta)) continue;
      await redis.hDel(gk, [`${a.track}_${a.step}`]);
      await realtime.send<JamDiff>(channel, { kind: 'remove', track: a.track, step: a.step, version });
      removedN++;
    } else if (a.kind === 'setCellFx') {
      const k = `${a.track}_${a.step}`;
      if (!validCell(a.track, a.step, state.meta) || !ownerOf.has(k)) continue;
      await redis.hSet(gk, { [k]: cellVal(ownerOf.get(k) ?? userId, a.fx) });
      await realtime.send<JamDiff>(channel, { kind: 'cellFx', track: a.track, step: a.step, fx: a.fx, version });
    } else if (a.kind === 'setInstrument') {
      if (a.track < 0 || a.track >= state.meta.tracks) continue;
      if (a.instrument !== '' && !LIBRARY.some((i) => i.id === a.instrument)) continue;
      await redis.hSet(metaKey(postId), { ['inst' + a.track]: a.instrument });
      await realtime.send<JamDiff>(channel, { kind: 'setInstrument', track: a.track, instrument: a.instrument, version });
    } else {
      // nudgeTempo — bounded to the day's range
      bpm = Math.max(state.meta.bpmMin, Math.min(state.meta.bpmMax, bpm + a.delta));
      await redis.hSet(metaKey(postId), { bpm: String(bpm) });
      await realtime.send<JamDiff>(channel, { kind: 'tempo', bpm, version });
    }
  }

  const remaining = Math.max(0, fichas - cost);
  await redis.hSet(energyKey(postId, userId), {
    fichas: String(remaining),
    period: String(currentPeriod(Date.now())),
  });

  // Player stats for rankings/profiles — never let a stats failure break the commit.
  try {
    if (placedInstr.length > 0 || removedN > 0) await recordCommit(userId, placedInstr, removedN, Date.now());
  } catch (e) {
    console.error('recordCommit failed:', e);
  }

  return { ok: true, energy: remaining, version };
}

/** Presence heartbeat → returns the current live count. */
export async function heartbeat(postId: string, userId: string): Promise<number> {
  const now = Date.now();
  await redis.zAdd(presenceKey(postId), { score: now, member: userId });
  await redis.zRemRangeByScore(presenceKey(postId), 0, now - PRESENCE_TTL_MS);
  return redis.zCard(presenceKey(postId));
}
