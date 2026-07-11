import { reddit, redis } from '@devvit/web/server';
import { keyForDay, titleEmojisForDay } from './jam';

/**
 * Title like "JamPad 🥁 🎸 🎹 — Jam #7 in C minor": a global counter that grows, the day's three
 * seeded sounds as emoji (drum · bass · melody), and the day's note. Everything after the number is
 * a pure function of the date, so the title matches what the post actually opens with.
 */
export const createPost = async () => {
  const day = new Date().toISOString().slice(0, 10);
  const n = await redis.incrBy('jampad:count', 1);
  return await reddit.submitCustomPost({
    title: `JamPad ${titleEmojisForDay(day)} — Jam #${n} in ${keyForDay(day)} minor`,
  });
};
