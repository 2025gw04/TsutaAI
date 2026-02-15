// 個人タスク API のコントローラー
const personalTaskService = require('../services/personalTaskService');
const websocketService = require('../services/websocketService');

/** 個人タスク一覧を取得します */
async function listPersonalTasks(req, res, next) {
  try {
    const filter = {
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      status: req.query.status ? String(req.query.status) : undefined
    };

    const tasks = await personalTaskService.findPersonalTasks(filter);
    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
}

/** 指定した個人タスクを取得します */
async function getPersonalTask(req, res, next) {
  try {
    const task = await personalTaskService.findPersonalTaskById(Number(req.params.id));
    if (!task) {
      return res.status(404).json({ success: false, message: '指定した個人タスクは存在しません。' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
}

/** 新規個人タスクを追加します */
async function createPersonalTask(req, res, next) {
  try {
    const payload = {
      user_id: req.body.userId,
      title: req.body.title,
      description: req.body.description || '',
      notes: req.body.notes || '',
      report_notes: req.body.reportNotes || '',
      priority: req.body.priority || 'Medium',
      status: req.body.status || 'not-started',
      progress: req.body.progress || 0,
      estimated_minutes: req.body.estimatedMinutes || 0,
      actual_minutes: req.body.actualMinutes || 0,
      start_date: req.body.startDate || '',
      due_date: req.body.dueDate || '',
      completed_at: req.body.completedAt || ''
    };

    // 必須フィールドチェック
    if (!payload.user_id) {
      return res.status(400).json({ success: false, message: 'ユーザーIDは必須です。' });
    }
    if (!payload.title) {
      return res.status(400).json({ success: false, message: 'タスクタイトルは必須です。' });
    }

    const result = await personalTaskService.createPersonalTask(payload);

    // WebSocket で個人タスク作成を通知
    if (result && result.id) {
      websocketService.notifyTaskUpdate(result.taskId, payload.user_id, {
        action: 'personal_task_created',
        task: result
      });
    }

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** 個人タスク情報を更新します */
async function updatePersonalTask(req, res, next) {
  try {
    const taskId = Number(req.params.id);

    // 更新前のタスク情報を取得
    const oldTask = await personalTaskService.findPersonalTaskById(taskId);
    if (!oldTask) {
      return res.status(404).json({ success: false, message: '指定した個人タスクは存在しません。' });
    }

    const payload = {
      title: req.body.title,
      description: req.body.description,
      notes: req.body.notes,
      reportNotes: req.body.reportNotes,
      priority: req.body.priority,
      status: req.body.status,
      progress: req.body.progress,
      estimatedMinutes: req.body.estimatedMinutes,
      actualMinutes: req.body.actualMinutes,
      startDate: req.body.startDate,
      dueDate: req.body.dueDate,
      completedAt: req.body.completedAt
    };

    await personalTaskService.updatePersonalTask(taskId, payload);

    // 更新後のタスク情報を取得
    const updatedTask = await personalTaskService.findPersonalTaskById(taskId);

    // WebSocket で個人タスク更新を通知
    if (updatedTask) {
      websocketService.notifyTaskUpdate(updatedTask.taskId, updatedTask.userId, {
        action: 'personal_task_updated',
        task: updatedTask
      });
    }

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    next(error);
  }
}

/** 個人タスクを削除します */
async function deletePersonalTask(req, res, next) {
  try {
    const taskId = Number(req.params.id);

    // 削除前のタスク情報を取得
    const task = await personalTaskService.findPersonalTaskById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: '指定した個人タスクは存在しません。' });
    }

    await personalTaskService.deletePersonalTask(taskId);

    // WebSocket で個人タスク削除を通知
    websocketService.notifyTaskUpdate(task.taskId, task.userId, {
      action: 'personal_task_deleted',
      taskId: taskId
    });

    res.json({ success: true, message: '個人タスクを削除しました。' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPersonalTasks,
  getPersonalTask,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask
};
