// 作業ログAPIのコントローラー
const worklogService = require('../services/worklogService');
const websocketService = require('../services/websocketService');

/** 作業ログ一覧を取得します。 */
async function listWorkLogs(req, res, next) {
  try {
    const filter = {
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      taskId: req.query.taskId ? Number(req.query.taskId) : undefined
    };
    const logs = await worklogService.findWorkLogs(filter);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
}

/** 作業ログを追加します。 */
async function createWorkLog(req, res, next) {
  try {
    const payload = {
      user_id: req.body.userId,
      task_id: req.body.taskId,
      start_time: req.body.startTime,
      end_time: req.body.endTime,
      duration_minutes: req.body.durationMinutes,
      activity_type: req.body.activityType,
      notes: req.body.notes
    };
    const result = await worklogService.createWorkLog(payload);

    // WebSocketで作業ログ作成を通知
    if (result && result.id) {
      websocketService.notifyWorkLogCreated(req.body.userId, result);
    }

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** 作業ログを更新します。 */
async function updateWorkLog(req, res, next) {
  try {
    const logId = Number(req.params.id);
    const payload = {
      start_time: req.body.startTime,
      end_time: req.body.endTime,
      duration_minutes: req.body.durationMinutes,
      activity_type: req.body.activityType,
      notes: req.body.notes
    };

    const result = await worklogService.updateWorkLog(logId, payload);

    if (!result) {
      return res.status(404).json({ success: false, message: '作業ログが見つかりません' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** 作業ログを削除します。 */
async function deleteWorkLog(req, res, next) {
  try {
    const logId = Number(req.params.id);
    const result = await worklogService.deleteWorkLog(logId);

    if (!result) {
      return res.status(404).json({ success: false, message: '作業ログが見つかりません' });
    }

    res.json({ success: true, message: '作業ログを削除しました' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listWorkLogs,
  createWorkLog,
  updateWorkLog,
  deleteWorkLog
};
