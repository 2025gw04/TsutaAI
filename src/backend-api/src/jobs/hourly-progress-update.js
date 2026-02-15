/**
 * 1時間ごとの進捗自動更新ジョブ
 *
 * 実行内容:
 * 1. 進行中のタスクの進捗予測を計算
 * 2. リスクの高いタスクにはAI提案を生成
 * 3. 結果をデータベースに保存
 * 4. 必要に応じてWebSocket通知を送信
 */

const db = require('../services/database');
const progressPredictionService = require('../services/progressPredictionService');
const aiService = require('../services/aiService');
const mentalHealthService = require('../services/mentalHealthService');
const logger = require('../utils/logger');

/**
 * 進捗自動更新ジョブを実行
 */
async function runHourlyProgressUpdate() {
  const startTime = Date.now();
  logger.info('='.repeat(60));
  logger.info('進捗自動更新ジョブ開始');
  logger.info('='.repeat(60));

  try {
    const connection = db.getConnection();

    // 進行中のタスク一覧を取得
    const inProgressTasks = connection.prepare(`
      SELECT t.id, t.name, t.progress, t.estimated_hours, t.actual_hours,
             t.due_date, t.start_date, t.status, t.assigned_to, t.priority,
             u.full_name AS assignee_name, u.username
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.status = 'in_progress'
      ORDER BY t.priority DESC, t.due_date ASC
    `).all();

    logger.info(`進行中のタスク: ${inProgressTasks.length}件`);

    let processedCount = 0;
    let aiSuggestionsGenerated = 0;
    let highRiskTasks = 0;
    const errors = [];

    // 各タスクの進捗予測を計算
    for (const task of inProgressTasks) {
      try {
        // 進捗予測を計算して保存
        const prediction = progressPredictionService.calculateAndSaveProgressPrediction(
          task.id,
          task.assigned_to
        );

        processedCount++;

        // リスクレベルをカウント
        if (prediction.riskLevel === 'high') {
          highRiskTasks++;
        }

        // リスクが medium 以上、または完了確率が 0.7 以下の場合はAI提案を生成
        if (
          (prediction.riskLevel === 'medium' || prediction.riskLevel === 'high') ||
          prediction.completionProbability <= 0.7
        ) {
          try {
            // メンタルヘルス情報を取得（利用可能な場合）
            const today = new Date().toISOString().split('T')[0];
            const mentalHealthLog = mentalHealthService.getMentalHealthLogByDate(
              task.assigned_to,
              today
            );

            // AI提案を生成
            const aiSuggestion = await aiService.generateProgressSuggestion({
              task_name: task.name,
              assignee_name: task.assignee_name || task.username,
              status: task.status,
              priority: task.priority,
              current_progress: prediction.currentProgress,
              estimated_hours: task.estimated_hours,
              actual_hours: task.actual_hours,
              start_date: task.start_date,
              due_date: task.due_date,
              predicted_completion_date: prediction.predictedCompletionDate,
              completion_probability: prediction.completionProbability,
              risk_level: prediction.riskLevel,
              is_on_track: prediction.isOnTrack,
              avg_activity_score: prediction.avgActivityScore,
              total_work_hours: prediction.totalWorkHours,
              daily_progress_rate: prediction.dailyProgressRate,
              recent_activity_logs: 0, // TODO: 取得する
              recent_mood: mentalHealthLog?.mood || '不明',
              stress_level: mentalHealthLog?.stress_level || '不明',
              has_blocker: mentalHealthLog?.has_blocker || false
            });

            // AI提案をデータベースに保存
            progressPredictionService.updateAiSuggestion(prediction.id, {
              suggestion: aiSuggestion.suggestion,
              bottleneckAnalysis: aiSuggestion.bottleneckAnalysis,
              resourceRecommendation: aiSuggestion.resourceRecommendation
            });

            aiSuggestionsGenerated++;

            logger.info(`タスク "${task.name}" (ID: ${task.id}) - リスク: ${prediction.riskLevel}, AI提案生成完了`);
          } catch (aiError) {
            logger.warn(`タスク "${task.name}" (ID: ${task.id}) - AI提案の生成に失敗:`, aiError.message);
            errors.push({
              task: task.name,
              error: `AI提案生成失敗: ${aiError.message}`
            });
          }
        } else {
          logger.info(`タスク "${task.name}" (ID: ${task.id}) - リスク: ${prediction.riskLevel}, 順調`);
        }
      } catch (taskError) {
        logger.error(`タスク "${task.name}" (ID: ${task.id}) の処理中にエラー:`, taskError.message);
        errors.push({
          task: task.name,
          error: taskError.message
        });
      }
    }

    // 実行サマリーをログ出力
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('='.repeat(60));
    logger.info('進捗自動更新ジョブ完了');
    logger.info(`処理時間: ${elapsed}秒`);
    logger.info(`処理タスク数: ${processedCount}/${inProgressTasks.length}`);
    logger.info(`AI提案生成数: ${aiSuggestionsGenerated}`);
    logger.info(`高リスクタスク: ${highRiskTasks}`);
    if (errors.length > 0) {
      logger.warn(`エラー件数: ${errors.length}`);
      errors.forEach((err, index) => {
        logger.warn(`  ${index + 1}. ${err.task}: ${err.error}`);
      });
    }
    logger.info('='.repeat(60));

    return {
      success: true,
      processedCount,
      aiSuggestionsGenerated,
      highRiskTasks,
      errors: errors.length,
      elapsed
    };
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error('進捗自動更新ジョブでエラー発生:', error);
    logger.info(`処理時間: ${elapsed}秒`);
    return {
      success: false,
      error: error.message,
      elapsed
    };
  }
}

/**
 * プロジェクト全体の納期分析を実行
 * @param {number} projectId - プロジェクトID
 */
async function analyzeProjectDeadline(projectId) {
  try {
    logger.info(`プロジェクト ${projectId} の納期分析開始`);

    const connection = db.getConnection();

    // プロジェクト情報を取得
    const project = connection.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      throw new Error(`プロジェクトID ${projectId} が見つかりません`);
    }

    // プロジェクトの進捗サマリーを取得
    const summary = progressPredictionService.getProjectProgressSummary(projectId);

    // 納期までの残り日数を計算
    const daysRemaining = project.end_date
      ? Math.ceil((new Date(project.end_date) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    // チームのメンタルヘルス状況を取得
    const mentalHealthSummary = mentalHealthService.getTeamMentalHealthSummary(7);
    const mentalHealthConcerns = mentalHealthSummary.needSupportUsers?.length || 0;

    // AI納期分析を実行
    const deadlineAnalysis = await aiService.analyzeDeadlinePrediction({
      project_name: project.name,
      project_deadline: project.end_date,
      days_remaining: daysRemaining,
      total_tasks: summary.totalTasks,
      completed_tasks: summary.completedTasks,
      in_progress_tasks: summary.inProgressTasks,
      todo_tasks: summary.todoTasks,
      avg_progress: summary.avgProgress,
      high_risk_tasks: summary.riskDistribution.high,
      medium_risk_tasks: summary.riskDistribution.medium,
      low_risk_tasks: summary.riskDistribution.low,
      delayed_tasks: summary.delayedTasks,
      critical_path_info: 'TODO: クリティカルパス分析を実装',
      team_size: mentalHealthSummary.totalMembers || 0,
      team_avg_activity: 0, // TODO: チーム平均アクティビティスコアを取得
      mental_health_concerns: mentalHealthConcerns
    });

    logger.info(`プロジェクト "${project.name}" の納期分析完了`);
    logger.info(`  - 納期達成可能性: ${deadlineAnalysis.deadlineAssessment?.canMeetDeadline ? '可能' : '困難'}`);
    logger.info(`  - リスクレベル: ${deadlineAnalysis.deadlineAssessment?.riskLevel}`);

    return deadlineAnalysis;
  } catch (error) {
    logger.error('納期分析でエラー発生:', error);
    throw error;
  }
}

// 直接実行された場合（node hourly-progress-update.js）
if (require.main === module) {
  runHourlyProgressUpdate()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('ジョブ実行中に致命的なエラー:', error);
      process.exit(1);
    });
}

module.exports = {
  runHourlyProgressUpdate,
  analyzeProjectDeadline
};
