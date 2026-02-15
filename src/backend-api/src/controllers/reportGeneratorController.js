// 詳細レポート生成コントローラー
const reportGeneratorService = require('../services/reportGeneratorService');

/**
 * プロジェクトの詳細レポートを生成します
 */
async function generateProjectReport(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const options = {
      includeTasks: req.body.includeTasks !== false,
      includeWorkLogs: req.body.includeWorkLogs !== false,
      includeAiInsights: req.body.includeAiInsights !== false,
      includeTeamMetrics: req.body.includeTeamMetrics !== false,
      includeRiskAssessment: req.body.includeRiskAssessment !== false,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      format: req.body.format || 'json' // json, markdown, html
    };

    const report = await reportGeneratorService.generateProjectReport(projectId, options);

    if (options.format === 'markdown') {
      res.set('Content-Type', 'text/markdown');
      res.send(report);
    } else if (options.format === 'html') {
      res.set('Content-Type', 'text/html');
      res.send(report);
    } else {
      res.json({ success: true, data: report });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * 全プロジェクトのサマリーレポートを生成します
 */
async function generateAllProjectsReport(req, res, next) {
  try {
    const options = {
      includeMetrics: req.body.includeMetrics !== false,
      includeAlerts: req.body.includeAlerts !== false,
      format: req.body.format || 'json'
    };

    const report = await reportGeneratorService.generateAllProjectsReport(options);

    if (options.format === 'markdown') {
      res.set('Content-Type', 'text/markdown');
      res.send(report);
    } else {
      res.json({ success: true, data: report });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * ユーザーの作業レポートを生成します
 */
async function generateUserWorkReport(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const options = {
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      includeTaskDetails: req.body.includeTaskDetails !== false,
      format: req.body.format || 'json'
    };

    const report = await reportGeneratorService.generateUserWorkReport(userId, options);

    if (options.format === 'markdown') {
      res.set('Content-Type', 'text/markdown');
      res.send(report);
    } else {
      res.json({ success: true, data: report });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * CSVエクスポート用のプロジェクトレポートを生成します
 */
async function exportProjectReportCSV(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const csv = await reportGeneratorService.generateProjectReportCSV(projectId);

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="project_${projectId}_report.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  generateProjectReport,
  generateAllProjectsReport,
  generateUserWorkReport,
  exportProjectReportCSV
};
