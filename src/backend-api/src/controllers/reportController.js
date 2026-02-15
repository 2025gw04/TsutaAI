const db = require('../services/database'); // 追加
const reportService = require('../services/reportService');
const aiService = require('../services/aiService');

/** 日報一覧を取得します。 */
async function listReports(req, res, next) {
  try {
    const filter = {
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      date: req.query.date
    };
    const reports = await reportService.findDailyReports(filter);

    // AI分析コメントの付加
    const knex = db.getKnex();
    const dbClient = db.getDbClient();

    const enrichedReports = await Promise.all(reports.map(async (report) => {
      const reportDateStr = new Date(report.report_date).toISOString().split('T')[0];

      // work_session_summaryからその日のsession_notesを取得
      let query = knex('work_session_summary')
        .where('user_id', report.user_id)
        .whereNotNull('session_notes');

      // 日付比較のSQL構築（DB依存）
      if (dbClient === 'better-sqlite3') {
        query = query.whereRaw("date(session_start) = ?", [reportDateStr]);
      } else if (dbClient === 'pg') {
        query = query.whereRaw("DATE(session_start) = DATE(?)", [reportDateStr]);
      } else if (dbClient === 'mysql2') {
        query = query.whereRaw("DATE(session_start) = ?", [reportDateStr]);
      } else {
        query = query.whereRaw("CAST(session_start AS DATE) = ?", [reportDateStr]);
      }

      const sessions = await query.select('session_notes');

      // AI分析コメントのみを抽出して結合
      const aiComments = sessions
        .map(s => s.session_notes)
        .filter(n => n && n.includes('【AI分析】')) // AI分析を含むもののみ
        .join('\n\n');

      return {
        ...report,
        ai_work_summary: aiComments // 新フィールド
      };
    }));

    res.json({ success: true, data: enrichedReports });
  } catch (error) {
    next(error);
  }
}

/** 日報を登録します。 */
async function createReport(req, res, next) {
  try {
    const payload = {
      user_id: req.body.userId,
      report_date: req.body.reportDate,
      summary: req.body.summary || req.body.generatedSummary,
      satisfaction_level: req.body.satisfactionLevel,
      achievement_rate: req.body.achievementRate,
      focus_level: req.body.focusLevel,
      difficulty_level: req.body.difficultyLevel,
      learning_level: req.body.learningLevel,
      comment: req.body.comment,
      ai_generated: req.body.aiGenerated ? 1 : 0
    };
    // 既存の日報があるかチェック（Upsertロジック）
    const existingReports = await reportService.findDailyReports({
      userId: payload.user_id,
      date: payload.report_date
    });

    let result;
    if (existingReports && existingReports.length > 0) {
      // 既存があれば更新
      // updateDailyReportは payload.summary, payload.satisfaction_level などの形式を受け取るため
      // create用のpayloadをそのまま渡して問題ない（IDなどは無視されるか、updateDailyReport内で処理されない）
      result = await reportService.updateDailyReport(existingReports[0].id, payload);
      // 結果形式を合わせる
      if (!result) { result = { id: existingReports[0].id }; }
    } else {
      // 新規作成
      result = await reportService.createDailyReport(payload);
    }

    // AI分析を非同期で実行（レスポンスをブロックしない）
    // 日報オブジェクトを再構築して渡す
    const newReport = {
      id: result.id,
      ...payload,
      // member_nameはここでは取得できないが、aiService側でuserIdから引くか、許容する
      // reportService.findDailyReportsで取得した形式に合わせるならmember_nameが必要だが
      // analyzeDailyReportTrends内で再取得してもよい。
      // ここでは最低限IDとユーザーID、満足度があれば機能する。
    };

    // DBから最新のデザイン（更新後）を取得してAI分析に渡す
    // ※ existingReports[0] は更新前のデータなので使わない
    const latestReports = await reportService.findDailyReports({ userId: req.body.userId, date: req.body.reportDate });

    if (latestReports && latestReports.length > 0) {
      // 非同期で実行し、エラーをキャッチ
      aiService.analyzeDailyReportTrends(req.body.userId, latestReports[0])
        .catch(err => console.error('AI analysis error:', err));
    }

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** 日報を更新します。 */
async function updateReport(req, res, next) {
  try {
    const reportId = Number(req.params.id);
    const payload = {
      summary: req.body.summary,
      satisfaction_level: req.body.satisfactionLevel,
      achievement_rate: req.body.achievementRate,
      focus_level: req.body.focusLevel,
      difficulty_level: req.body.difficultyLevel,
      learning_level: req.body.learningLevel,
      comment: req.body.comment,
      ai_generated: req.body.aiGenerated !== undefined ? (req.body.aiGenerated ? 1 : 0) : undefined
    };

    const result = await reportService.updateDailyReport(reportId, payload);

    if (!result) {
      return res.status(404).json({ success: false, message: '日報が見つかりません' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** 日報を削除します。 */
async function deleteReport(req, res, next) {
  try {
    const reportId = Number(req.params.id);
    const result = await reportService.deleteDailyReport(reportId);

    if (!result) {
      return res.status(404).json({ success: false, message: '日報が見つかりません' });
    }

    res.json({ success: true, message: '日報を削除しました' });
  } catch (error) {
    next(error);
  }
}

/** AIを使った日報トレンド分析 */
async function analyzeTrendsAI(req, res, next) {
  try {
    const userId = Number(req.params.userId);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userIdが必要です'
      });
    }

    const result = await aiService.analyzeDailyReportTrendsAI(userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listReports,
  createReport,
  updateReport,
  deleteReport,
  analyzeTrendsAI
};
