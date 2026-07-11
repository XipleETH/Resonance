import { reddit, redis } from '@devvit/web/server';
import { keyForDay } from './jam';

/** Title like "JamPad — Jam #7 in C minor 🎹": a global counter that grows, plus the day's note. */
export const createPost = async () => {
  const day = new Date().toISOString().slice(0, 10);
  const n = await redis.incrBy('jampad:count', 1);
  return await reddit.submitCustomPost({
    title: `JamPad — Jam #${n} in ${keyForDay(day)} minor 🎹`,
  });
};
