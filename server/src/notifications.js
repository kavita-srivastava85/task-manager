import db from './db.js';

export async function createNotification({
  userId,
  type,
  postId,
  replyId = null,
  actorId = null,
  message,
}) {
  if (!userId || userId === actorId) return null;
  const result = await db
    .prepare(
      `INSERT INTO notifications
        (user_id, type, post_id, reply_id, actor_id, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, type, postId, replyId, actorId, message);
  return result.lastInsertRowid;
}

export async function notifyMentions({
  mentionedUsers,
  postId,
  replyId = null,
  actorId,
}) {
  for (const user of mentionedUsers) {
    await createNotification({
      userId: user.userId ?? user.id,
      type: 'mention',
      postId,
      replyId,
      actorId,
      // Short label — UI shows a number badge, not full sentences.
      message: 'Mention',
    });
  }
}

/** @deprecated Prefer notifyMentions — kept for any legacy callers. */
export async function notifyEveryone({ postId, replyId = null, actorId }) {
  await notifyMentions({
    mentionedUsers: (await db.prepare(`SELECT id FROM users`).all()).map((u) => ({
      userId: u.id,
    })),
    postId,
    replyId,
    actorId,
  });
}

export function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    postId: row.post_id,
    replyId: row.reply_id,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
    actor: row.actor_id
      ? {
          id: row.actor_id,
          displayName: row.actor_display_name,
          email: row.actor_email,
        }
      : null,
  };
}
