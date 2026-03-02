// 詳細レポート生成サービス (Knex.js対応版)
const db = require('./database');

/**
 * プロジェクトの詳細レポートを生成します
 */
async function generateProjectReport(projectId, options = {}) {
  const knex = db.getKnex();

  // プロジェクト基本情報を取得
  const project = await knex('projects as p')
    .select('p.*', 'u.username as created_by_username')
    .leftJoin('users as u', 'p.created_by', 'u.id')
    .where('p.id', projectId)
    .first();

  if (!project) {
    throw new Error('プロジェクトが見つかりません');
  }

  const report = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      startDate: project.start_date,
      endDate: project.end_date,
      status: project.status,
      createdBy: project.created_by_username,
      createdAt: project.created_at
    },
    generatedAt: new Date().toISOString()
  };

  // タスク情報を含める
  if (options.includeTasks) {
    let tasksQuery = knex('tasks as t')
      .select('t.*', 'u.username as assigned_to_username')
      .leftJoin('users as u', 't.assigned_to', 'u.id')
      .where('t.project_id', projectId);

    if (options.startDate) {
      tasksQuery = tasksQuery.where('t.start_date', '>=', options.startDate);
    }
    if (options.endDate) {
      tasksQuery = tasksQuery.where('t.end_date', '<=', options.endDate);
    }

    tasksQuery = tasksQuery.orderBy('t.task_key');

    const tasks = await tasksQuery;

    // タスク統計を計算
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const blockedTasks = tasks.filter(t => t.status === 'cancelled').length;

    report.tasks = {
      total: totalTasks,
      completed: completedTasks,
      inProgress: inProgressTasks,
      blocked: blockedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      list: tasks.map(task => ({
        id: task.id,
        wbsCode: task.task_key,
        title: task.name,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignedTo: task.assigned_to_username,
        startDate: task.start_date,
        endDate: task.end_date,
        estimatedMinutes: task.estimated_hours,
        progress: task.progress
      }))
    };
  }

  // 作業ログ情報を含める
  if (options.includeWorkLogs) {
    let workLogsQuery = knex('work_logs as wl')
      .select('wl.*', 'u.username', 't.name as task_name')
      .leftJoin('users as u', 'wl.user_id', 'u.id')
      .leftJoin('tasks as t', 'wl.task_id', 't.id')
      .where('t.project_id', projectId);

    if (options.startDate) {
      workLogsQuery = workLogsQuery.whereRaw('DATE(wl.start_time) >= ?', [options.startDate]);
    }
    if (options.endDate) {
      workLogsQuery = workLogsQuery.whereRaw('DATE(wl.end_time) <= ?', [options.endDate]);
    }

    workLogsQuery = workLogsQuery.orderBy('wl.start_time', 'desc');

    const workLogs = await workLogsQuery;

    const totalMinutes = workLogs.reduce((sum, wl) => sum + (wl.duration_minutes || 0), 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    report.workLogs = {
      totalEntries: workLogs.length,
      totalMinutes,
      totalHours,
      list: workLogs.map(wl => ({
        id: wl.log_id,
        username: wl.username,
        taskTitle: wl.task_name,
        startTime: wl.start_time,
        endTime: wl.end_time,
        durationMinutes: wl.duration_minutes,
        activityType: wl.activity_type,
        notes: wl.notes
      }))
    };
  }

  // チームメトリクスを含める
  if (options.includeTeamMetrics) {
    const teamMetrics = await knex('users as u')
      .select(
        'u.username',
        knex.raw('COUNT(DISTINCT t.id) as assigned_tasks'),
        knex.raw("SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks"),
        knex.raw('SUM(COALESCE(wl.duration_minutes, 0)) as total_work_minutes')
      )
      .leftJoin('tasks as t', function() {
        this.on('u.id', 't.assigned_to').andOn('t.project_id', knex.raw('?', [projectId]));
      })
      .leftJoin('work_logs as wl', function() {
        this.on('u.id', 'wl.user_id').andOnIn('wl.task_id', function() {
          this.select('id').from('tasks').where('project_id', projectId);
        });
      })
      .whereIn('u.id', function() {
        this.select('assigned_to').distinct().from('tasks').where('project_id', projectId).whereNotNull('assigned_to');
      })
      .groupBy('u.id', 'u.username');

    report.teamMetrics = teamMetrics.map(tm => ({
      username: tm.username,
      assignedTasks: tm.assigned_tasks || 0,
      completedTasks: tm.completed_tasks || 0,
      completionRate: tm.assigned_tasks > 0 ? Math.round((tm.completed_tasks / tm.assigned_tasks) * 100) : 0,
      totalWorkHours: Math.round((tm.total_work_minutes || 0) / 60 * 10) / 10
    }));
  }

  // AIインサイトを含める
  if (options.includeAiInsights) {
    // プロジェクトサマリーを取得
    const summary = await knex('project_summaries')
      .where('project_id', projectId)
      .first();

    // アラートを取得
    const alerts = await knex('dashboard_alerts')
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
      .limit(10);

    report.aiInsights = {
      summary: summary ? {
        progressPercentage: summary.progress_percentage,
        currentPhase: summary.current_phase,
        summaryText: summary.summary_text,
        updatedAt: summary.updated_at
      } : null,
      alerts: alerts.map(a => ({
        severity: a.severity,
        message: a.message,
        createdAt: a.created_at
      }))
    };
  }

  // リスク評価を含める
  if (options.includeRiskAssessment) {
    const today = new Date().toISOString().split('T')[0];

    const risks = {
      overdueTasks: 0,
      blockedTasks: 0,
      unassignedTasks: 0,
      highPriorityIncomplete: 0
    };

    if (report.tasks && report.tasks.list) {
      risks.overdueTasks = report.tasks.list.filter(t =>
        t.endDate && t.endDate < today && t.status !== 'completed'
      ).length;
      risks.blockedTasks = report.tasks.list.filter(t => t.status === 'cancelled').length;
      risks.unassignedTasks = report.tasks.list.filter(t => !t.assignedTo).length;
      risks.highPriorityIncomplete = report.tasks.list.filter(t =>
        t.priority === 'high' && t.status !== 'completed'
      ).length;
    }

    const riskLevel =
      risks.overdueTasks > 5 || risks.blockedTasks > 3 ? 'high' :
      risks.overdueTasks > 2 || risks.blockedTasks > 1 ? 'medium' : 'low';

    report.riskAssessment = {
      level: riskLevel,
      risks
    };
  }

  // フォーマット変換
  if (options.format === 'markdown') {
    return formatReportAsMarkdown(report);
  } else if (options.format === 'html') {
    return formatReportAsHTML(report);
  }

  return report;
}

/**
 * 全プロジェクトのサマリーレポートを生成します
 */
async function generateAllProjectsReport(options = {}) {
  const knex = db.getKnex();

  const projects = await knex('projects as p')
    .select('p.*', 'u.username as created_by_username')
    .leftJoin('users as u', 'p.created_by', 'u.id')
    .orderBy('p.created_at', 'desc');

  const report = {
    totalProjects: projects.length,
    projects: [],
    generatedAt: new Date().toISOString()
  };

  if (options.includeMetrics) {
    for (const project of projects) {
      const tasks = await knex('tasks')
        .select('status')
        .where('project_id', project.id);

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;

      report.projects.push({
        id: project.id,
        name: project.name,
        status: project.status,
        startDate: project.start_date,
        endDate: project.end_date,
        totalTasks,
        completedTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      });
    }
  } else {
    report.projects = projects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      startDate: p.start_date,
      endDate: p.end_date
    }));
  }

  if (options.includeAlerts) {
    const alerts = await knex('dashboard_alerts')
      .orderBy('created_at', 'desc')
      .limit(20);

    report.alerts = alerts.map(a => ({
      projectId: a.project_id,
      severity: a.severity,
      message: a.message,
      createdAt: a.created_at
    }));
  }

  if (options.format === 'markdown') {
    return formatAllProjectsReportAsMarkdown(report);
  }

  return report;
}

/**
 * ユーザーの作業レポートを生成します
 */
async function generateUserWorkReport(userId, options = {}) {
  const knex = db.getKnex();

  const user = await knex('users')
    .where('id', userId)
    .first();

  if (!user) {
    throw new Error('ユーザーが見つかりません');
  }

  const report = {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email
    },
    generatedAt: new Date().toISOString()
  };

  // 作業ログを取得
  let workLogsQuery = knex('work_logs as wl')
    .select('wl.*', 't.name as task_name', 'p.name as project_name')
    .leftJoin('tasks as t', 'wl.task_id', 't.id')
    .leftJoin('projects as p', 't.project_id', 'p.id')
    .where('wl.user_id', userId);

  if (options.startDate) {
    workLogsQuery = workLogsQuery.whereRaw('DATE(wl.start_time) >= ?', [options.startDate]);
  }
  if (options.endDate) {
    workLogsQuery = workLogsQuery.whereRaw('DATE(wl.end_time) <= ?', [options.endDate]);
  }

  workLogsQuery = workLogsQuery.orderBy('wl.start_time', 'desc');

  const workLogs = await workLogsQuery;

  const totalMinutes = workLogs.reduce((sum, wl) => sum + (wl.duration_minutes || 0), 0);

  report.workSummary = {
    totalEntries: workLogs.length,
    totalMinutes,
    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    workLogs: workLogs.map(wl => ({
      projectName: wl.project_name,
      taskTitle: wl.task_name,
      startTime: wl.start_time,
      endTime: wl.end_time,
      durationMinutes: wl.duration_minutes,
      activityType: wl.activity_type,
      notes: wl.notes
    }))
  };

  if (options.includeTaskDetails) {
    let tasksQuery = knex('tasks as t')
      .select('t.*', 'p.name as project_name')
      .leftJoin('projects as p', 't.project_id', 'p.id')
      .where('t.assigned_to', userId);

    if (options.startDate) {
      tasksQuery = tasksQuery.where('t.start_date', '>=', options.startDate);
    }
    if (options.endDate) {
      tasksQuery = tasksQuery.where('t.end_date', '<=', options.endDate);
    }

    tasksQuery = tasksQuery.orderBy('t.start_date', 'desc');

    const tasks = await tasksQuery;

    report.tasks = {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      list: tasks.map(t => ({
        projectName: t.project_name,
        title: t.name,
        status: t.status,
        priority: t.priority,
        startDate: t.start_date,
        endDate: t.end_date,
        estimatedMinutes: t.estimated_hours
      }))
    };
  }

  if (options.format === 'markdown') {
    return formatUserWorkReportAsMarkdown(report);
  }

  return report;
}

/**
 * プロジェクトレポートをCSV形式で生成します
 */
async function generateProjectReportCSV(projectId) {
  const knex = db.getKnex();

  const tasks = await knex('tasks as t')
    .select('t.*', 'u.username as assigned_to_username')
    .leftJoin('users as u', 't.assigned_to', 'u.id')
    .where('t.project_id', projectId)
    .orderBy('t.task_key');

  const headers = ['WBSコード', 'タスク名', 'ステータス', '優先度', '担当者', '開始日', '終了日', '見積時間(分)', '進捗率'];
  const rows = tasks.map(t => [
    t.task_key || '',
    t.name || '',
    t.status || '',
    t.priority || '',
    t.assigned_to_username || '未割り当て',
    t.start_date || '',
    t.end_date || '',
    t.estimated_hours || '',
    t.progress || '0'
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // UTF-8 BOM for Excel compatibility
  return '\ufeff' + csv;
}

/**
 * レポートをMarkdown形式にフォーマットします
 */
function formatReportAsMarkdown(report) {
  let md = `# ${report.project.name}\n\n`;
  md += `**プロジェクトID:** ${report.project.id}  \n`;
  md += `**ステータス:** ${report.project.status}  \n`;
  md += `**期間:** ${report.project.startDate} 〜 ${report.project.endDate}  \n`;
  md += `**作成者:** ${report.project.createdBy}  \n`;
  md += `**レポート生成日時:** ${new Date(report.generatedAt).toLocaleString('ja-JP')}  \n\n`;

  if (report.project.description) {
    md += `## 概要\n\n${report.project.description}\n\n`;
  }

  if (report.tasks) {
    md += `## タスク統計\n\n`;
    md += `- **総タスク数:** ${report.tasks.total}\n`;
    md += `- **完了:** ${report.tasks.completed}\n`;
    md += `- **進行中:** ${report.tasks.inProgress}\n`;
    md += `- **ブロック中:** ${report.tasks.blocked}\n`;
    md += `- **完了率:** ${report.tasks.completionRate}%\n\n`;
  }

  if (report.workLogs) {
    md += `## 作業時間\n\n`;
    md += `- **作業ログ件数:** ${report.workLogs.totalEntries}\n`;
    md += `- **総作業時間:** ${report.workLogs.totalHours} 時間\n\n`;
  }

  if (report.teamMetrics) {
    md += `## チームメトリクス\n\n`;
    md += `| メンバー | 割当タスク | 完了タスク | 完了率 | 作業時間 |\n`;
    md += `|---------|-----------|-----------|--------|----------|\n`;
    report.teamMetrics.forEach(tm => {
      md += `| ${tm.username} | ${tm.assignedTasks} | ${tm.completedTasks} | ${tm.completionRate}% | ${tm.totalWorkHours}h |\n`;
    });
    md += `\n`;
  }

  if (report.riskAssessment) {
    md += `## リスク評価\n\n`;
    md += `**リスクレベル:** ${report.riskAssessment.level === 'high' ? '⚠️ 高' : report.riskAssessment.level === 'medium' ? '⚡ 中' : '✅ 低'}\n\n`;
    md += `- 期限超過タスク: ${report.riskAssessment.risks.overdueTasks}\n`;
    md += `- ブロック中タスク: ${report.riskAssessment.risks.blockedTasks}\n`;
    md += `- 未割当タスク: ${report.riskAssessment.risks.unassignedTasks}\n`;
    md += `- 高優先度未完了: ${report.riskAssessment.risks.highPriorityIncomplete}\n\n`;
  }

  if (report.aiInsights) {
    if (report.aiInsights.summary) {
      md += `## AIサマリー\n\n`;
      md += `${report.aiInsights.summary.summaryText}\n\n`;
    }

    if (report.aiInsights.alerts && report.aiInsights.alerts.length > 0) {
      md += `## AIアラート\n\n`;
      report.aiInsights.alerts.forEach(alert => {
        const icon = alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟡' : '🔵';
        md += `${icon} ${alert.message}\n`;
      });
      md += `\n`;
    }
  }

  return md;
}

/**
 * レポートをHTML形式にフォーマットします
 */
function formatReportAsHTML(report) {
  // 簡易的なHTML生成
  const md = formatReportAsMarkdown(report);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${report.project.name} - レポート</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1, h2 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f3f4f6; }
  </style>
</head>
<body>
  <pre style="white-space: pre-wrap;">${md}</pre>
</body>
</html>`;
}

/**
 * 全プロジェクトレポートをMarkdown形式にフォーマットします
 */
function formatAllProjectsReportAsMarkdown(report) {
  let md = `# 全プロジェクトサマリーレポート\n\n`;
  md += `**総プロジェクト数:** ${report.totalProjects}  \n`;
  md += `**レポート生成日時:** ${new Date(report.generatedAt).toLocaleString('ja-JP')}  \n\n`;

  md += `## プロジェクト一覧\n\n`;
  md += `| プロジェクト名 | ステータス | 期間 | タスク数 | 完了率 |\n`;
  md += `|--------------|-----------|------|---------|--------|\n`;

  report.projects.forEach(p => {
    const taskInfo = p.totalTasks !== undefined ? `${p.totalTasks}` : '-';
    const completeRate = p.completionRate !== undefined ? `${p.completionRate}%` : '-';
    md += `| ${p.name} | ${p.status} | ${p.startDate} 〜 ${p.endDate} | ${taskInfo} | ${completeRate} |\n`;
  });

  if (report.alerts && report.alerts.length > 0) {
    md += `\n## 最新AIアラート\n\n`;
    report.alerts.slice(0, 10).forEach(alert => {
      const icon = alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟡' : '🔵';
      md += `${icon} [Project ${alert.projectId}] ${alert.message}\n`;
    });
  }

  return md;
}

/**
 * ユーザー作業レポートをMarkdown形式にフォーマットします
 */
function formatUserWorkReportAsMarkdown(report) {
  let md = `# ${report.user.fullName} (${report.user.username}) 作業レポート\n\n`;
  md += `**メールアドレス:** ${report.user.email}  \n`;
  md += `**レポート生成日時:** ${new Date(report.generatedAt).toLocaleString('ja-JP')}  \n\n`;

  if (report.workSummary) {
    md += `## 作業サマリー\n\n`;
    md += `- **作業ログ件数:** ${report.workSummary.totalEntries}\n`;
    md += `- **総作業時間:** ${report.workSummary.totalHours} 時間\n\n`;
  }

  if (report.tasks) {
    md += `## タスクサマリー\n\n`;
    md += `- **総タスク数:** ${report.tasks.total}\n`;
    md += `- **完了タスク:** ${report.tasks.completed}\n`;
    md += `- **進行中タスク:** ${report.tasks.inProgress}\n\n`;
  }

  return md;
}

module.exports = {
  generateProjectReport,
  generateAllProjectsReport,
  generateUserWorkReport,
  generateProjectReportCSV
};
