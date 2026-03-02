// プロジェクトのエクスポートサービス (Knex.js対応版)
const projectService = require('./projectService');
const taskService = require('./taskService');

/**
 * プロジェクトをJSON形式でエクスポート
 * @param {number} projectId - プロジェクトID
 * @returns {object} エクスポートデータ
 */
async function exportProjectAsJson(projectId) {
  const project = await projectService.findProjectById(projectId);
  if (!project) {
    throw new Error('プロジェクトが見つかりません');
  }

  const result = await taskService.findTasks({ projectId });
  const tasks = result.data || [];

  // タスクを階層構造に変換
  const taskMap = new Map();
  tasks.forEach(task => {
    taskMap.set(task.id, {
      ...task,
      children: []
    });
  });

  const rootTasks = [];
  taskMap.forEach(task => {
    if (task.parent_task_id) {
      const parent = taskMap.get(task.parent_task_id);
      if (parent) {
        parent.children.push(task);
      }
    } else {
      rootTasks.push(task);
    }
  });

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      start_date: project.start_date,
      end_date: project.end_date,
      created_at: project.created_at,
      updated_at: project.updated_at
    },
    tasks: rootTasks,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };
}

/**
 * プロジェクトをMarkdown形式でエクスポート
 * @param {number} projectId - プロジェクトID
 * @returns {string} Markdown文字列
 */
async function exportProjectAsMarkdown(projectId) {
  const project = await projectService.findProjectById(projectId);
  if (!project) {
    throw new Error('プロジェクトが見つかりません');
  }

  const result = await taskService.findTasks({ projectId });
  const tasks = result.data || [];

  // タスクを階層構造に変換
  const taskMap = new Map();
  tasks.forEach(task => {
    taskMap.set(task.id, {
      ...task,
      children: []
    });
  });

  const rootTasks = [];
  taskMap.forEach(task => {
    if (task.parent_task_id) {
      const parent = taskMap.get(task.parent_task_id);
      if (parent) {
        parent.children.push(task);
      }
    } else {
      rootTasks.push(task);
    }
  });

  let markdown = `# ${project.name}\n\n`;

  if (project.description) {
    markdown += `## 概要\n\n${project.description}\n\n`;
  }

  markdown += `## プロジェクト情報\n\n`;
  markdown += `- **ステータス**: ${getStatusLabel(project.status)}\n`;
  markdown += `- **開始日**: ${project.start_date || '未設定'}\n`;
  markdown += `- **終了日**: ${project.end_date || '未設定'}\n`;
  markdown += `- **作成日**: ${project.created_at}\n`;
  markdown += `- **更新日**: ${project.updated_at}\n\n`;

  if (rootTasks.length > 0) {
    markdown += `## WBS (Work Breakdown Structure)\n\n`;
    markdown += generateTaskMarkdown(rootTasks, 0);
  }

  markdown += `\n---\n`;
  markdown += `*エクスポート日時: ${new Date().toLocaleString('ja-JP')}*\n`;

  return markdown;
}

/**
 * タスクの階層構造をMarkdownに変換
 * @param {Array} tasks - タスク配列
 * @param {number} level - 階層レベル
 * @returns {string} Markdown文字列
 */
function generateTaskMarkdown(tasks, level) {
  let markdown = '';
  const indent = '  '.repeat(level);

  tasks.forEach((task, index) => {
    const taskNumber = `${level + 1}.${index + 1}`;
    markdown += `${indent}### ${taskNumber} ${task.name}\n\n`;

    // タスクキーを最初に表示
    if (task.task_key) {
      markdown += `${indent}**タスクキー**: \`${task.task_key}\`\n\n`;
    }

    if (task.description) {
      markdown += `${indent}**説明**: ${task.description}\n\n`;
    }

    const details = [];
    if (task.estimated_hours) details.push(`**見積工数**: ${task.estimated_hours}時間 (${(task.estimated_hours / 8).toFixed(1)}日)`);
    if (task.actual_hours) details.push(`**実績工数**: ${task.actual_hours}時間 (${(task.actual_hours / 8).toFixed(1)}日)`);
    if (task.priority) details.push(`**優先度**: ${getPriorityLabel(task.priority)}`);
    if (task.status) details.push(`**ステータス**: ${getTaskStatusLabel(task.status)}`);
    if (task.progress !== undefined) details.push(`**進捗**: ${task.progress}%`);
    if (task.start_date) details.push(`**開始予定**: ${task.start_date}`);
    if (task.end_date) details.push(`**終了予定**: ${task.end_date}`);
    if (task.actual_start_date) details.push(`**実際の開始**: ${task.actual_start_date}`);
    if (task.actual_end_date) details.push(`**実際の終了**: ${task.actual_end_date}`);
    if (task.deliverable) details.push(`**成果物**: ${task.deliverable}`);

    if (details.length > 0) {
      markdown += `${indent}${details.join(' | ')}\n\n`;
    }

    if (task.children && task.children.length > 0) {
      markdown += generateTaskMarkdown(task.children, level + 1);
    }
  });

  return markdown;
}

/**
 * プロジェクトをCSV形式でエクスポート
 * @param {number} projectId - プロジェクトID
 * @returns {string} CSV文字列
 */
async function exportProjectAsCsv(projectId) {
  const project = await projectService.findProjectById(projectId);
  if (!project) {
    throw new Error('プロジェクトが見つかりません');
  }

  const result = await taskService.findTasks({ projectId });
  const tasks = result.data || [];

  // CSVヘッダー
  const headers = [
    'タスクキー',
    'タスクID',
    'タスク名',
    '説明',
    '見積工数(時間)',
    '実績工数(時間)',
    '優先度',
    'ステータス',
    '進捗(%)',
    '開始予定日',
    '終了予定日',
    '実際の開始日',
    '実際の終了日',
    '成果物',
    '親タスクID',
    '作成日',
    '更新日'
  ];

  let csv = headers.map(h => escapeCsvValue(h)).join(',') + '\n';

  // プロジェクト情報行（最初の行）
  csv += [
    '',  // タスクキー（プロジェクト行では空）
    `"プロジェクト: ${project.name}"`,
    escapeCsvValue(project.description || ''),
    '',
    '',
    '',
    '',
    '',
    escapeCsvValue(getStatusLabel(project.status)),
    '',
    escapeCsvValue(project.start_date || ''),
    escapeCsvValue(project.end_date || ''),
    '',
    '',
    '',
    '',
    escapeCsvValue(project.created_at),
    escapeCsvValue(project.updated_at)
  ].join(',') + '\n';

  // タスク行
  tasks.forEach(task => {
    const row = [
      escapeCsvValue(task.task_key || ''),  // タスクキーを最初の列に
      task.id,
      escapeCsvValue(task.name),
      escapeCsvValue(task.description || ''),
      task.estimated_hours || '',
      task.actual_hours || '',
      escapeCsvValue(getPriorityLabel(task.priority)),
      escapeCsvValue(getTaskStatusLabel(task.status)),
      task.progress !== undefined ? task.progress : '',
      escapeCsvValue(task.start_date || ''),
      escapeCsvValue(task.end_date || ''),
      escapeCsvValue(task.actual_start_date || ''),
      escapeCsvValue(task.actual_end_date || ''),
      escapeCsvValue(task.deliverable || ''),
      task.parent_task_id || '',
      escapeCsvValue(task.created_at),
      escapeCsvValue(task.updated_at)
    ];
    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * CSV値をエスケープ
 * @param {string} value - 値
 * @returns {string} エスケープされた値
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * ステータスのラベルを取得
 * @param {string} status - ステータス値
 * @returns {string} ラベル
 */
function getStatusLabel(status) {
  const labels = {
    'planning': '計画中',
    'active': '進行中',
    'completed': '完了',
    'cancelled': 'キャンセル',
    'on_hold': '保留中'
  };
  return labels[status] || status;
}

/**
 * タスクステータスのラベルを取得
 * @param {string} status - ステータス値
 * @returns {string} ラベル
 */
function getTaskStatusLabel(status) {
  const labels = {
    'todo': '未着手',
    'in_progress': '進行中',
    'done': '完了',
    'completed': '完了',
    'cancelled': 'キャンセル',
    'not-started': '未着手',
    'planning': '計画中',
    'in-review': 'レビュー待ち',
    'blocked': 'ブロック中'
  };
  return labels[status] || status;
}

/**
 * 優先度のラベルを取得
 * @param {string} priority - 優先度値
 * @returns {string} ラベル
 */
function getPriorityLabel(priority) {
  const labels = {
    'low': '低',
    'medium': '中',
    'high': '高',
    'urgent': '緊急',
    'none': 'なし'
  };
  return labels[priority] || priority;
}

module.exports = {
  exportProjectAsJson,
  exportProjectAsMarkdown,
  exportProjectAsCsv
};
