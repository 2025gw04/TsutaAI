// タスクAPIのコントローラー
const taskService = require('../services/taskService');
const websocketService = require('../services/websocketService');
const aiService = require('../services/aiService');
const taskImportService = require('../services/taskImportService');
const taskExportService = require('../services/taskExportService');
const logger = require('../utils/logger');
const dateCalculator = require('../utils/dateCalculator');
const { parsePaginationParams, createPaginatedResponse } = require('../utils/pagination');

/**
 * タスクの期間を検証・調整する
 * 土日祝を除外した営業日ベースで工数を自動計算
 * ※ 期間（開始日・終了日）から工数を計算するロジックに変更（工数は手動変更不可）
 * @param {Object} taskData - タスクデータ
 * @returns {Object} 調整後のタスクデータ
 */
function validateAndAdjustDates(taskData) {
  const { start_date, end_date } = taskData;

  // 開始日と終了日の両方がある場合、期間から工数を自動計算
  if (start_date && end_date) {
    try {
      // 開始日が営業日でない場合は次の営業日に調整
      if (!dateCalculator.isWorkingDay(start_date)) {
        const adjustedStart = dateCalculator.getNextWorkingDay(start_date);
        logger.info(`開始日を営業日に調整: ${start_date} → ${adjustedStart}`);
        taskData.start_date = adjustedStart;
      }

      // 終了日が営業日でない場合は次の営業日に調整
      if (!dateCalculator.isWorkingDay(end_date)) {
        const adjustedEnd = dateCalculator.getNextWorkingDay(end_date);
        logger.info(`終了日を営業日に調整: ${end_date} → ${adjustedEnd}`);
        taskData.end_date = adjustedEnd;
      }

      // 期間から工数を計算（土日祝を除外した営業日数）
      // ※ 1日=8時間として時間に変換
      const effortDays = dateCalculator.calculateEffortDays(taskData.start_date, taskData.end_date);
      const calculatedHours = effortDays * 8;

      // 工数を自動設定（フロントエンドから送信された値は上書き）
      if (taskData.estimated_hours !== calculatedHours) {
        logger.info(`期間から工数を計算: 開始=${taskData.start_date}, 終了=${taskData.end_date} → ${effortDays}日 (${calculatedHours}時間)`);
        taskData.estimated_hours = calculatedHours;
      }
    } catch (error) {
      logger.error(`日付の検証・調整中にエラー: ${error.message}`);
      // エラーが発生しても処理は続行（元の日付を使用）
    }
  }
  // 開始日のみの場合は営業日調整のみ
  else if (start_date) {
    try {
      if (!dateCalculator.isWorkingDay(start_date)) {
        const adjustedStart = dateCalculator.getNextWorkingDay(start_date);
        logger.info(`開始日を営業日に調整: ${start_date} → ${adjustedStart}`);
        taskData.start_date = adjustedStart;
      }
    } catch (error) {
      logger.error(`開始日の調整中にエラー: ${error.message}`);
    }
  }
  // 終了日のみの場合は営業日調整のみ
  else if (end_date) {
    try {
      if (!dateCalculator.isWorkingDay(end_date)) {
        const adjustedEnd = dateCalculator.getNextWorkingDay(end_date);
        logger.info(`終了日を営業日に調整: ${end_date} → ${adjustedEnd}`);
        taskData.end_date = adjustedEnd;
      }
    } catch (error) {
      logger.error(`終了日の調整中にエラー: ${error.message}`);
    }
  }

  return taskData;
}

/**
 * タスクオブジェクトから担当ユーザーIDを取得します。
 * findTaskById の camelCase 形式を優先し、互換のため snake_case も許容します。
 * @param {Object} task - タスク情報
 * @returns {number|undefined} 担当ユーザーID
 */
function resolveAssignedUserId(task) {
  if (!task) return undefined;
  return task.assignedTo ?? task.assigned_to;
}

/** タスク一覧を取得します（ページネーション対応）。 */
async function listTasks(req, res, next) {
  try {
    // ページネーションパラメータを解析
    const pagination = parsePaginationParams(req.query, {
      defaultLimit: 50,
      maxLimit: 200
    });

    // フィルタ条件を構築
    const filter = {
      projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
      assignedTo: req.query.assignedTo ? Number(req.query.assignedTo) : undefined,
      status: req.query.status,
      priority: req.query.priority,
      search: req.query.search,
      sortBy: req.query.sortBy,
      pagination
    };

    // タスク一覧を取得
    const { data, total } = await taskService.findTasks(filter);

    // ページネーションレスポンスを返す
    res.json(createPaginatedResponse(data, total, pagination.page, pagination.limit));
  } catch (error) {
    next(error);
  }
}

/** 指定タスクを取得します。 */
async function getTask(req, res, next) {
  try {
    const task = await taskService.findTaskById(Number(req.params.id));
    if (!task) {
      return res.status(404).json({ message: '指定したタスクは存在しません。' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
}

/** 新規タスクを追加します。 */
async function createTask(req, res, next) {
  try {
    // Priority値を正規化（小文字に統一し、無効な値を検証）
    const priorityInput = req.body.priority || 'medium';
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    const normalizedPriority = priorityInput.toLowerCase();

    let finalPriority;
    if (!validPriorities.includes(normalizedPriority)) {
      logger.warn(`Invalid priority value received: ${priorityInput}, using default 'medium'`);
      finalPriority = 'medium';
    } else {
      finalPriority = normalizedPriority;
    }

    // フロントエンドから送信されるフィールドを受け取る（title, assigneeUserId, estimatedMinutes など）
    const payload = {
      project_id: req.body.projectId,
      name: req.body.title || req.body.taskName || req.body.name, // titleをサポート
      description: req.body.description,
      assigned_to: req.body.assigneeUserId || req.body.assignedTo, // assigneeUserIdをサポート
      estimated_hours: req.body.estimatedMinutes ? req.body.estimatedMinutes / 60 : req.body.estimatedHours, // 分を時間に変換
      priority: finalPriority,
      status: req.body.status || 'todo',
      progress: req.body.progress || 0,
      due_date: req.body.dueDate,
      start_date: req.body.startDate,
      end_date: req.body.endDate,
      actual_start_date: req.body.actualStartDate,
      actual_end_date: req.body.actualEndDate,
      deliverable: req.body.deliverable || '',
      parent_task_id: req.body.parentTaskId,
      sort_order: 0,
      dependencies: '[]'
    };

    // 期間を検証・調整（土日祝を除外）
    const adjustedPayload = validateAndAdjustDates(payload);

    const result = await taskService.createTask(adjustedPayload);

    // WebSocketでタスク作成を通知
    if (result && result.id) {
      const createdTask = await taskService.findTaskById(result.id);
      websocketService.notifyTaskUpdate(result.id, resolveAssignedUserId(createdTask), {
        action: 'created',
        task: createdTask || result
      });
    }

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** タスク情報を更新します。 */
async function updateTask(req, res, next) {
  try {
    const taskId = Number(req.params.id);

    // Priority値を正規化（小文字に統一し、無効な値を検証）
    let finalPriority = undefined;
    if (req.body.priority) {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      const normalizedPriority = req.body.priority.toLowerCase();

      if (!validPriorities.includes(normalizedPriority)) {
        logger.warn(`Invalid priority value received in updateTask: ${req.body.priority}`);
        finalPriority = undefined; // 更新しない場合は undefined
      } else {
        finalPriority = normalizedPriority;
      }
    }

    const payload = {
      name: req.body.title || req.body.taskName || req.body.name,
      description: req.body.description,
      assigned_to: req.body.assigneeUserId || req.body.assignedTo,
      estimated_hours: req.body.estimatedMinutes ? req.body.estimatedMinutes / 60 : req.body.estimatedHours,
      actual_hours: req.body.actualHours,
      priority: finalPriority,
      status: req.body.status,
      progress: req.body.progress,
      due_date: req.body.dueDate,
      start_date: req.body.startDate,
      end_date: req.body.endDate,
      actual_start_date: req.body.actualStartDate,
      actual_end_date: req.body.actualEndDate,
      deliverable: req.body.deliverable,
      parent_task_id: req.body.parentTaskId
    };

    // 期間を検証・調整（土日祝を除外）
    const adjustedPayload = validateAndAdjustDates(payload);

    await taskService.updateTask(taskId, adjustedPayload);

    // WebSocketでタスク更新を通知
    const updatedTask = await taskService.findTaskById(taskId);
    if (updatedTask) {
      websocketService.notifyTaskUpdate(taskId, resolveAssignedUserId(updatedTask), {
        action: 'updated',
        task: updatedTask
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** タスクを削除します。 */
async function deleteTask(req, res, next) {
  try {
    const taskId = Number(req.params.id);
    const task = await taskService.findTaskById(taskId);

    await taskService.deleteTask(taskId);

    // WebSocketでタスク削除を通知
    if (task) {
      websocketService.notifyTaskUpdate(taskId, resolveAssignedUserId(task), {
        action: 'deleted',
        taskId: taskId
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** プロジェクトの全タスクを削除します。 */
async function deleteAllProjectTasks(req, res, next) {
  try {
    const projectId = Number(req.query.projectId);
    if (!projectId) {
      return res.status(400).json({ message: 'projectIdが必要です。' });
    }

    const deletedCount = await taskService.deleteAllTasksByProject(projectId);

    res.json({ success: true, deletedCount });
  } catch (error) {
    next(error);
  }
}

/** 本日のタスクを取得します（デスクトップアプリ用） */
async function getTodayTasks(req, res, next) {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 本日が期限のタスク、または進行中のタスクを取得
    const { data: allTasks } = await taskService.findTasks({ assignedTo: userId });

    const todayTasks = allTasks.filter(task => {
      // 期限が今日のタスク
      if (task.dueDate === todayStr) return true;
      if (task.startDate === todayStr) return true;

      // 進行中のタスク（開始日が今日以前、終了日が今日以降）
      if (task.startDate && task.endDate) {
        // 文字列比較で判定（Dateオブジェクトだと時間の関係で当日の判定がうまくいかない場合があるため）
        if (task.startDate <= todayStr && task.endDate >= todayStr) return true;
      }

      // ステータスが進行中のタスク
      if (task.status === 'in_progress') return true;

      return false;
    });

    res.json({ success: true, data: todayTasks });
  } catch (error) {
    next(error);
  }
}

/** タスクの詳細説明をAIで生成します */
async function generateDescription(req, res, next) {
  try {
    const payload = {
      task_name: req.body.task_name || '',
      parent_task_name: req.body.parent_task_name || '',
      parent_context: req.body.parent_context || '',
      project_name: req.body.project_name || '',
      project_summary: req.body.project_summary || '',
      effort_days: req.body.effort_days || 1,
      deliverable: req.body.deliverable || ''
    };

    const description = await aiService.generateTaskDescription(payload);
    res.json({ success: true, data: { description } });
  } catch (error) {
    next(error);
  }
}

/** タスクを子タスクに分割します */
async function subdivideTask(req, res, next) {
  try {
    const payload = {
      task_name: req.body.taskName || '',
      task_description: req.body.taskDescription || '',
      effort_days: req.body.effortDays || 1,
      deliverable: req.body.deliverable || '',
      project_name: req.body.projectName || '',
      project_summary: req.body.projectSummary || ''
    };

    const result = await aiService.subdivideTask(payload);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** タスクコメントを追加します */
async function addComment(req, res, next) {
  try {
    const taskId = Number(req.params.id);
    const payload = {
      task_id: taskId,
      user_id: req.body.userId,
      content: req.body.content
    };

    const result = await taskService.addComment(payload);

    // WebSocketでコメント追加を通知
    const task = await taskService.findTaskById(taskId);
    if (task) {
      websocketService.notifyTaskUpdate(taskId, resolveAssignedUserId(task), {
        action: 'comment_added',
        comment: result
      });
    }

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** タスクのコメント一覧を取得します */
async function getComments(req, res, next) {
  try {
    const taskId = Number(req.params.id);
    const comments = await taskService.getComments(taskId);
    res.json({ success: true, data: comments });
  } catch (error) {
    next(error);
  }
}

/** コメントを削除します */
async function deleteComment(req, res, next) {
  try {
    const commentId = Number(req.params.commentId);
    await taskService.deleteComment(commentId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** タスクに添付ファイルを追加します */
async function addAttachment(req, res, next) {
  try {
    const taskId = Number(req.params.id);

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ファイルがアップロードされていません' });
    }

    const payload = {
      task_id: taskId,
      uploaded_by: req.user?.id || 1, // 現在のユーザーID（認証トークンから取得）
      file_name: req.file.originalname,
      file_path: req.file.path,
      file_size: req.file.size,
      file_type: req.file.mimetype
    };

    const result = await taskService.addAttachment(payload);

    // WebSocketで添付ファイル追加を通知
    const task = await taskService.findTaskById(taskId);
    if (task) {
      websocketService.notifyTaskUpdate(taskId, resolveAssignedUserId(task), {
        action: 'attachment_added',
        attachment: result
      });
    }

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** タスクの添付ファイル一覧を取得します */
async function getAttachments(req, res, next) {
  try {
    const taskId = Number(req.params.id);
    const attachments = await taskService.getAttachments(taskId);
    res.json({ success: true, data: attachments });
  } catch (error) {
    next(error);
  }
}

/** 添付ファイルをダウンロードします */
async function downloadAttachment(req, res, next) {
  try {
    const attachmentId = Number(req.params.attachmentId);
    const attachment = await taskService.getAttachmentById(attachmentId);

    if (!attachment) {
      return res.status(404).json({ success: false, message: '添付ファイルが見つかりません' });
    }

    // ファイルが存在するか確認
    const fs = require('fs');
    if (!fs.existsSync(attachment.file_path)) {
      return res.status(404).json({ success: false, message: 'ファイルが見つかりません' });
    }

    // ファイルをダウンロード
    res.download(attachment.file_path, attachment.file_name, (err) => {
      if (err) {
        console.error('File download error:', err);
        if (!res.headersSent) {
          next(err);
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/** タスクのアクティビティログを取得します */
async function getActivityLog(req, res, next) {
  try {
    const taskId = Number(req.params.id);
    const logs = await taskService.getActivityLog(taskId);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
}

/** タスクリストをインポート（プレビューまたは実行） */
async function importTasks(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const preview = req.body.preview === 'true' || req.body.preview === true;

    if (!req.file) {
      return res.status(400).json({ message: 'ファイルがアップロードされていません。' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const fileType = getFileType(req.file.originalname);

    logger.info(`タスクインポート開始: projectId=${projectId}, filename=${req.file.originalname}, type=${fileType}, preview=${preview}`);

    // ファイルをパース
    const tasks = taskImportService.parseTaskFile(fileContent, fileType);

    if (preview) {
      // プレビューのみ
      const previewResult = await taskImportService.previewTaskImport(projectId, tasks);
      return res.json({
        success: true,
        preview: previewResult
      });
    } else {
      // 実行
      const result = await taskImportService.executeTaskImport(projectId, tasks);

      logger.info(`タスクインポート成功: projectId=${projectId}, 更新=${result.updated}, 追加=${result.added}`);

      // WebSocketで通知
      websocketService.notifyProjectUpdate(projectId, {
        action: 'tasks_imported',
        result
      });

      return res.json({
        success: true,
        result
      });
    }
  } catch (error) {
    logger.error(`タスクインポートエラー: ${error.message}`);
    next(error);
  }
}

/**
 * タスクリストをエクスポート
 */
async function exportTasks(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const format = req.query.format || 'json';

    logger.info(`タスクエクスポート開始: projectId=${projectId}, format=${format}`);

    const result = await taskExportService.exportTasks(projectId, format);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);

    logger.info(`タスクエクスポート完了: ${result.filename}`);
  } catch (error) {
    logger.error(`タスクエクスポートエラー: ${error.message}`);
    next(error);
  }
}

/**
 * ファイル名から拡張子を判定
 * @param {string} filename - ファイル名
 * @returns {string} ファイルタイプ
 */
function getFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const typeMap = {
    'txt': 'text',
    'csv': 'csv',
    'json': 'json',
    'md': 'markdown',
    'markdown': 'markdown'
  };
  return typeMap[ext] || 'text';
}

module.exports = {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  deleteAllProjectTasks,
  getTodayTasks,
  generateDescription,
  subdivideTask,
  addComment,
  getComments,
  deleteComment,
  addAttachment,
  getAttachments,
  downloadAttachment,
  getActivityLog,
  importTasks,
  exportTasks
};
