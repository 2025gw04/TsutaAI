// プロジェクトAPIのコントローラー
const projectService = require('../services/projectService');
const websocketService = require('../services/websocketService');
const aiService = require('../services/aiService');
const exportService = require('../services/exportService');
const logger = require('../utils/logger');
const { parsePaginationParams, createPaginatedResponse } = require('../utils/pagination');

/** プロジェクト一覧を取得します（ページネーション対応）。 */
async function listProjects(req, res, next) {
  try {
    // ページネーションパラメータを解析
    const pagination = parsePaginationParams(req.query, {
      defaultLimit: 20,
      maxLimit: 100
    });

    // フィルタ条件を構築
    const filter = {
      status: req.query.status,
      search: req.query.search,
      sortBy: req.query.sortBy || '-id',
      pagination
    };

    // プロジェクト一覧を取得
    const { data, total } = await projectService.findProjects(filter);

    // ページネーションレスポンスを返す
    res.json(createPaginatedResponse(data, total, pagination.page, pagination.limit));
  } catch (error) {
    next(error);
  }
}

/** 指定IDのプロジェクトを取得します。 */
async function getProject(req, res, next) {
  try {
    const project = await projectService.findProjectById(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: '指定したプロジェクトは存在しません。' });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
}

/** プロジェクトを新規登録します。 */
async function createProject(req, res, next) {
  try {
    const payload = {
      name: req.body.projectName || req.body.name,
      description: req.body.description,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      status: req.body.status || 'planning',
      createdBy: req.body.createdBy || 1,
      mainDeliverable: req.body.mainDeliverable || '',
      milestone: req.body.milestone || ''
    };
    const result = await projectService.createProject(payload);
    const projectId = result.id || result;

    // プロジェクトメンバーが指定されている場合は登録
    if (req.body.teamMembers && Array.isArray(req.body.teamMembers)) {
      await projectService.updateProjectMembers(projectId, req.body.teamMembers);
    }

    // WebSocketでプロジェクト作成を通知
    if (projectId) {
      websocketService.notifyProjectUpdate(projectId, {
        action: 'created',
        project: { ...payload, id: projectId }
      });
    }

    res.status(201).json({ success: true, data: { ...result, id: projectId } });
  } catch (error) {
    next(error);
  }
}

/** プロジェクト情報を更新します。 */
async function updateProject(req, res, next) {
  try {
    const projectId = Number(req.params.id);
    const payload = {
      name: req.body.projectName || req.body.name,
      description: req.body.description,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      status: req.body.status
    };
    await projectService.updateProject(projectId, payload);

    // WebSocketでプロジェクト更新を通知
    const updatedProject = await projectService.findProjectById(projectId);
    if (updatedProject) {
      websocketService.notifyProjectUpdate(projectId, {
        action: 'updated',
        project: updatedProject
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** プロジェクトを削除します。 */
async function deleteProject(req, res, next) {
  try {
    await projectService.deleteProject(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** プロジェクトファイルをインポートしてプロジェクトを作成します */
async function importProject(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'ファイルがアップロードされていません。' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const fileType = getFileType(req.file.originalname);
    const additionalInstructions = req.body.additionalInstructions || '';

    logger.info(`プロジェクトインポート開始: filename=${req.file.originalname}, type=${fileType}, size=${fileContent.length}`);

    // AIでファイル内容を解析
    const analysisResult = await aiService.analyzeProjectImport({
      file_type: fileType,
      file_content: fileContent,
      additional_instructions: additionalInstructions
    });

    // 解析結果を検証
    if (!analysisResult.project || !analysisResult.project.name) {
      return res.status(400).json({
        message: 'プロジェクト情報の解析に失敗しました。',
        details: analysisResult.warnings || []
      });
    }

    // プロジェクトとタスクを作成
    const result = await projectService.createProjectWithTasks(
      {
        name: analysisResult.project.name,
        description: analysisResult.project.description || '',
        startDate: analysisResult.project.startDate || null,
        endDate: analysisResult.project.endDate || null,
        status: analysisResult.project.status || 'planning',
        createdBy: req.body.createdBy || 1
      },
      analysisResult.tasks || []
    );

    logger.info(`プロジェクトインポート成功: projectId=${result.projectId}, taskCount=${result.taskCount}`);

    // WebSocketで通知
    if (result.projectId) {
      websocketService.notifyProjectUpdate(result.projectId, {
        action: 'imported',
        project: { id: result.projectId }
      });
    }

    res.status(201).json({
      success: true,
      data: {
        projectId: result.projectId,
        taskCount: result.taskCount,
        warnings: analysisResult.warnings || []
      }
    });
  } catch (error) {
    logger.error(`プロジェクトインポートエラー: ${error.message}`);
    next(error);
  }
}

/** プロジェクトを指定形式でエクスポートします */
async function exportProject(req, res, next) {
  try {
    const projectId = Number(req.params.id);
    const format = req.query.format || 'json'; // json, md, csv

    const project = await projectService.findProjectById(projectId);
    if (!project) {
      return res.status(404).json({ message: '指定したプロジェクトは存在しません。' });
    }

    logger.info(`プロジェクトエクスポート: projectId=${projectId}, format=${format}`);

    let content, contentType, filename;

    switch (format.toLowerCase()) {
      case 'json':
        content = JSON.stringify(await exportService.exportProjectAsJson(projectId), null, 2);
        contentType = 'application/json';
        filename = `project_${projectId}_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        break;

      case 'md':
      case 'markdown':
        content = await exportService.exportProjectAsMarkdown(projectId);
        contentType = 'text/markdown';
        filename = `project_${projectId}_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
        break;

      case 'csv':
        content = await exportService.exportProjectAsCsv(projectId);
        contentType = 'text/csv';
        filename = `project_${projectId}_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
        break;

      default:
        return res.status(400).json({ message: '不正なフォーマットです。json, md, csv のいずれかを指定してください。' });
    }

    // ダウンロード用のヘッダーを設定
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(content);
  } catch (error) {
    logger.error(`プロジェクトエクスポートエラー: ${error.message}`);
    next(error);
  }
}

/** プロジェクトメンバーを取得します */
async function getProjectMembers(req, res, next) {
  try {
    const projectId = Number(req.params.id);
    const members = await projectService.getProjectMembers(projectId);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

/** プロジェクトメンバーを更新します */
async function updateProjectMembers(req, res, next) {
  try {
    const projectId = Number(req.params.id);
    const userIds = req.body.userIds || [];

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ message: 'userIds は配列である必要があります。' });
    }

    await projectService.updateProjectMembers(projectId, userIds);

    // WebSocket通知
    const updatedMembers = await projectService.getProjectMembers(projectId);
    websocketService.notifyProjectUpdate(projectId, {
      action: 'members_updated',
      members: updatedMembers
    });

    res.json({ success: true });
  } catch (error) {
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
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  importProject,
  exportProject,
  getProjectMembers,
  updateProjectMembers
};
