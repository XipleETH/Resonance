import { Hono } from 'hono';
import { context, type TaskRequest, type TaskResponse } from '@devvit/web/server';
import { createPost } from '../core/post';

export const scheduler = new Hono();

// Mounted at /internal/scheduler → this is /internal/scheduler/daily-post,
// fired once a day by the "daily-post" cron task in devvit.json. Each run creates a
// fresh post, which seeds a new day (new base note, new palette, new pool of 24 sounds).
scheduler.post('/daily-post', async (c) => {
  try {
    const input = await c.req.json<TaskRequest>();
    const post = await createPost();
    console.log(`[scheduler] daily-post (${input.name}) created ${post.id} in ${context.subredditName} at ${new Date().toISOString()}`);
    return c.json<TaskResponse>({}, 200);
  } catch (error) {
    console.error(`[scheduler] daily-post failed: ${error}`);
    return c.json<TaskResponse>({}, 500);
  }
});
