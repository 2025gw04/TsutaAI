const db = require('../services/database');
const taskService = require('../services/taskService');

/**
 * 作業セッションサマリーを作成
 * プライバシーに配慮し、プロジェクト/タスク単位の作業記録のみを保存
 */
async function createWorkSessionSummary(req, res, next) {
    try {
        const knex = db.getKnex();
        const {
            user_id,
            project_id,
            task_id,
            session_start,
            session_end,
            work_duration_seconds,
            progress_percentage,
            commits_count,
            files_changed,
            session_notes,
            session_type,
            // AI分析用詳細データ（保存はしないが分析に使用）
            mouse_clicks,
            key_presses,
            mouse_wheel_scrolls,
            top_windows
        } = req.body;

        // 必須フィールドのバリデーション
        if (!user_id || !session_start || !session_end) {
            return res.status(400).json({
                success: false,
                message: 'user_id, session_start, session_end は必須です'
            });
        }

        // AI分析ロジック（簡易版）
        // 将来的にはここでLLMを使用して詳細な分析を行う
        let aiAnalysisNote = '';
        const totalActivity = (mouse_clicks || 0) + (key_presses || 0);
        const duration = work_duration_seconds || 1;
        const activityPerMinute = totalActivity / (duration / 60);

        if (activityPerMinute > 100) {
            aiAnalysisNote = '【AI分析】非常に高い集中力で作業が行われました。';
        } else if (activityPerMinute > 50) {
            aiAnalysisNote = '【AI分析】順調に作業が進んでいます。';
        } else {
            aiAnalysisNote = '【AI分析】調査や思考時間が多かったようです。';
        }

        // トップウィンドウからの推測
        if (top_windows) {
            try {
                const windows = JSON.parse(top_windows);
                const devTools = windows.some(w => w.ProcessName === 'Code' || w.ProcessName === 'VisualStudio' || w.WindowTitle.includes('Studio'));
                const browser = windows.some(w => w.ProcessName === 'chrome' || w.ProcessName === 'msedge');

                if (devTools) aiAnalysisNote += ' コーディング作業が中心でした。';
                else if (browser) aiAnalysisNote += ' リサーチ作業が中心でした。';
            } catch (e) {
                // JSON parse error check
            }
        }

        // ユーザーメモとAI分析結果を結合
        const finalNotes = session_notes ? `${session_notes}\n\n${aiAnalysisNote}` : aiAnalysisNote;

        // セッションサマリーを挿入
        const [sessionId] = await knex('work_session_summary').insert({
            user_id,
            project_id: project_id || null,
            task_id: task_id || null,
            session_start,
            session_end,
            work_duration_seconds: work_duration_seconds || 0,
            progress_percentage: progress_percentage || 0,
            commits_count: commits_count || 0,
            files_changed: files_changed || 0,
            session_notes: finalNotes,
            session_type: session_type || 'work'
        });

        // タスクの進捗と実績時間を自動更新
        if (task_id) {
            await taskService.updateProgressAndHours(task_id, work_duration_seconds, progress_percentage);
        }

        res.status(201).json({
            success: true,
            data: { session_id: sessionId },
            message: '作業セッションサマリーが正常に作成されました'
        });
    } catch (error) {
        next(error);
    }
}

/**
 * ユーザーの作業セッションサマリー一覧を取得
 */
async function getWorkSessionSummaries(req, res, next) {
    try {
        const knex = db.getKnex();
        const { userId } = req.params;
        const { startDate, endDate, projectId, taskId, limit = 100 } = req.query;

        let query = knex('work_session_summary')
            .select(
                'work_session_summary.*',
                'projects.name as project_name',
                'tasks.name as task_title'
            )
            .leftJoin('projects', 'work_session_summary.project_id', 'projects.id')
            .leftJoin('tasks', 'work_session_summary.task_id', 'tasks.id')
            .where('work_session_summary.user_id', userId)
            .orderBy('work_session_summary.session_start', 'desc')
            .limit(parseInt(limit));

        if (startDate) {
            query = query.where('work_session_summary.session_start', '>=', startDate);
        }

        if (endDate) {
            query = query.where('work_session_summary.session_end', '<=', endDate);
        }

        if (projectId) {
            query = query.where('work_session_summary.project_id', projectId);
        }

        if (taskId) {
            query = query.where('work_session_summary.task_id', taskId);
        }

        const sessions = await query;

        res.json({
            success: true,
            data: sessions
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 特定の作業セッションサマリーを取得
 */
async function getWorkSessionSummary(req, res, next) {
    try {
        const knex = db.getKnex();
        const { sessionId } = req.params;

        const session = await knex('work_session_summary')
            .select(
                'work_session_summary.*',
                'projects.name as project_name',
                'tasks.name as task_title',
                'users.full_name as user_name'
            )
            .leftJoin('projects', 'work_session_summary.project_id', 'projects.id')
            .leftJoin('tasks', 'work_session_summary.task_id', 'tasks.id')
            .leftJoin('users', 'work_session_summary.user_id', 'users.id')
            .where('work_session_summary.session_id', sessionId)
            .first();

        if (!session) {
            return res.status(404).json({
                success: false,
                message: '作業セッションが見つかりません'
            });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        next(error);
    }
}

/**
 * プロジェクト別の作業時間集計を取得
 */
async function getProjectWorkSummary(req, res, next) {
    try {
        const knex = db.getKnex();
        const { projectId } = req.params;
        const { startDate, endDate } = req.query;

        let query = knex('work_session_summary')
            .select(
                'work_session_summary.user_id',
                'users.full_name as user_name',
                knex.raw('SUM(work_session_summary.work_duration_seconds) as total_work_seconds'),
                knex.raw('COUNT(*) as session_count'),
                knex.raw('SUM(work_session_summary.commits_count) as total_commits'),
                knex.raw('AVG(work_session_summary.progress_percentage) as avg_progress')
            )
            .leftJoin('users', 'work_session_summary.user_id', 'users.id')
            .where('work_session_summary.project_id', projectId)
            .groupBy('work_session_summary.user_id', 'users.full_name');

        if (startDate) {
            query = query.where('work_session_summary.session_start', '>=', startDate);
        }

        if (endDate) {
            query = query.where('work_session_summary.session_end', '<=', endDate);
        }

        const summary = await query;

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    createWorkSessionSummary,
    getWorkSessionSummaries,
    getWorkSessionSummary,
    getProjectWorkSummary
};
