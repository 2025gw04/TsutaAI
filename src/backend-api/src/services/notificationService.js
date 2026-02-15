const db = require('./database');
const websocketService = require('./websocketService');

class NotificationService {
  /**
   * 通知を作成して送信する
   * @param {number} userId - 対象ユーザーID
   * @param {string} type - 通知タイプ
   * @param {string} title - タイトル
   * @param {string} message - メッセージ本文
   * @param {string} relatedEntityType - 関連エンティティタイプ
   * @param {number} relatedEntityId - 関連エンティティID
   */
  async send(userId, type, title, message, relatedEntityType = null, relatedEntityId = null) {
    const knex = db.getKnex();
    try {
      // 1. DBに保存
      // SQLite/MySQL対応: insertしてIDを取得
      let notificationId;
      const insertData = {
        user_id: userId,
        type,
        title,
        message,
        related_entity_type: relatedEntityType,
        related_entity_id: relatedEntityId,
        is_read: false,
        created_at: knex.fn.now()
      };

      const [id] = await knex('notifications').insert(insertData);
      notificationId = id; // Note: In some knex configs this returns array of ids

      const notification = {
        id: notificationId,
        ...insertData,
        // created_at might be raw fn, so use current time for socket
        created_at: new Date().toISOString()
      };

      // 2. WebSocketでリアルタイム通知（ユーザーがオンラインの場合）
      websocketService.sendToUser(userId, {
        type: 'notification',
        data: notification
      });

      console.log(`通知送信 (Internal ID: ${notificationId}, User: ${userId}): ${title}`);
      return notification;
    } catch (error) {
      console.error('通知送信エラー:', error);
      throw error;
    }
  }

  /**
   * 未読通知を取得する
   * @param {number} userId - ユーザーID
   */
  async getUnread(userId) {
    const knex = db.getKnex();
    try {
      console.log(`Fetching unread notifications for user ${userId}`);
      const result = await knex('notifications')
        .select('*')
        .where({ user_id: userId, is_read: false })
        .orderBy('created_at', 'desc');
      return result;
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
      throw error;
    }
  }

  /**
   * 全通知を取得する（ページネーションなしの簡易版）
   * @param {number} userId - ユーザーID
   * @param {number} limit - 取得件数
   */
  async getAll(userId, limit = 50) {
    const knex = db.getKnex();
    try {
      console.log(`Fetching all notifications for user ${userId}`);
      const result = await knex('notifications')
        .select('*')
        .where({ user_id: userId })
        .orderBy('created_at', 'desc')
        .limit(limit);
      return result;
    } catch (error) {
      console.error('Error fetching all notifications:', error);
      throw error;
    }
  }

  /**
   * 通知を既読にする
   * @param {number} userId - ユーザーID
   * @param {number} notificationId - 通知ID
   */
  async markAsRead(userId, notificationId) {
    const knex = db.getKnex();
    const count = await knex('notifications')
      .where({ id: notificationId, user_id: userId })
      .update({ is_read: true });
    return count > 0;
  }

  /**
   * 全通知を既読にする
   * @param {number} userId - ユーザーID
   * @param {number} limit - 取得件数
   */
  async markAllAsRead(userId) {
    const knex = db.getKnex();
    const count = await knex('notifications')
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true });
    return count;
  }

  /**
   * 通知を未読にする
   * @param {number} userId - ユーザーID
   * @param {number} notificationId - 通知ID
   */
  async markAsUnread(userId, notificationId) {
    const knex = require('./database').getKnex(); // Ensure knex is avail
    const count = await knex('notifications')
      .where({ id: notificationId, user_id: userId })
      .update({ is_read: false });
    return count > 0;
  }
}

module.exports = new NotificationService();
