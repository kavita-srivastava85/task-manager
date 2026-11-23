import db from './db.js';

export function createNotification({
  userId,
  type,
  postId,
  replyId = null,
  actorId = null,
  message,
}) {
  if (!userId || userId === actorId) return null;
  const result = db
    .prepare(
      `INSERT INTO notifications
        (user_id, type, post_id, reply_id, actor_id, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, type, postId, replyId, actorId, message);
  return result.lastInsertRowid;
}

export function notifyMentions({
  mentionedUsers,
  postId,
  replyId = null,
  actorId,
}) {
  for (const user of mentionedUsers) {
    createNotification({
      userId: user.userId ?? user.id,
      type: 'mention',
      postId,
      replyId,
      actorId,
      message: 'You have a new message',
    });
  }
}

/** Notify every account (except the sender) about discussion activity. */
export function notifyEveryone({ postId, replyId = null, actorId }) {
  const users = db.prepare(`SELECT id FROM users`).all();
  for (const user of users) {
    createNotification({
      userId: user.id,
      type: 'reply',
      postId,
      replyId,
      actorId,
      message: 'You have a new message',
    });
  }
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
