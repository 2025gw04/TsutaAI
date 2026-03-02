// 1時間単位活動集計データのコントローラー
const db = require('../services/database');
const aiService = require('../services/aiService');

/**
 * 1時間単位活動集計データを作成（デスクトップアプリから送信）
 */
async function createHourlyActivitySummary(req, res, next) {
    try {
        const knex = db.getKnex();
        const {
            userId,
            hourStart,
            hourEnd,
            mouseClicks,
            keyPresses,
            mouseWheelScrolls,
            totalActiveSeconds,
            topWindows,
            fileChangesCount,
            linesAdded,
            linesRemoved,
            activityIntensity,
            avgCpuUsage,
            avgMemoryMb
        } = req.body;

        // 必須フィールドのバリデーション
        if (!userId || !hourStart || !hourEnd) {
            return res.status(400).json({
                success: false,
                message: 'userId, hourStart, hourEnd are required'
            });
        }

        // データベースに保存
        const [summaryId] = await knex('hourly_activity_summary').insert({
            user_id: userId,
            hour_start: hourStart,
            hour_end: hourEnd,
            mouse_clicks: mouseClicks || 0,
            key_presses: keyPresses || 0,
            mouse_wheel_scrolls: mouseWheelScrolls || 0,
            total_active_seconds: totalActiveSeconds || 0,
            top_windows: topWindows || null,
            file_changes_count: fileChangesCount || 0,
            lines_added: linesAdded || 0,
            lines_removed: linesRemoved || 0,
            activity_intensity: activityIntensity || 'low',
            avg_cpu_usage: avgCpuUsage || 0,
            avg_memory_mb: avgMemoryMb || 0,
            ai_analysis_status: 'pending',
            created_at: knex.fn.now()
        });

        console.log(`[HourlyActivity] Created summary ID: ${summaryId} for user ${userId}`);

        // AI分析を非同期で実行
        setImmediate(async () => {
            try {
                await aiService.analyzeHourlyActivity(summaryId);
                console.log(`[HourlyActivity] AI analysis completed for summary ID: ${summaryId}`);
            } catch (error) {
                console.error(`[HourlyActivity] AI analysis failed for summary ID: ${summaryId}`, error);
            }
        });

        res.status(201).json({
            success: true,
            data: {
                summaryId,
                message: 'Hourly activity summary created successfully'
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * ユーザーの1時間単位活動集計データを取得
 */
async function getHourlyActivitySummaries(req, res, next) {
    try {
        const knex = db.getKnex();
        const { userId } = req.params;
        const { startDate, endDate, limit = 100 } = req.query;

        let query = knex('hourly_activity_summary')
            .where('user_id', userId)
            .orderBy('hour_start', 'desc')
            .limit(parseInt(limit));

        if (startDate) {
            query = query.where('hour_start', '>=', startDate);
        }

        if (endDate) {
            query = query.where('hour_start', '<=', endDate);
        }

        const summaries = await query;

        res.json({
            success: true,
            data: summaries
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 特定の1時間単位活動集計データを取得
 */
async function getHourlyActivitySummary(req, res, next) {
    try {
        const knex = db.getKnex();
        const { summaryId } = req.params;

        const summary = await knex('hourly_activity_summary')
            .where('summary_id', summaryId)
            .first();

        if (!summary) {
            return res.status(404).json({
                success: false,
                message: 'Hourly activity summary not found'
            });
        }

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    createHourlyActivitySummary,
    getHourlyActivitySummaries,
    getHourlyActivitySummary
};
