const db = require('../services/database');
const dateCalculator = require('../utils/dateCalculator');
const logger = require('../utils/logger');

/**
 * プロジェクトの全タスクの工数を再計算する
 * 開始日と終了日から営業日ベースで工数を計算し、estimated_hoursを更新
 */
async function recalculateProjectEffort(req, res) {
    const { projectId } = req.params;

    try {
        const connection = db.getConnection();

        // プロジェクトの全タスクを取得
        const tasks = connection
            .prepare(
                `SELECT id, name, start_date, end_date, estimated_hours 
         FROM tasks 
         WHERE project_id = ? AND start_date IS NOT NULL AND end_date IS NOT NULL`
            )
            .all(projectId);

        if (!tasks || tasks.length === 0) {
            return res.status(404).json({
                success: false,
                message: '開始日と終了日が設定されたタスクが見つかりません'
            });
        }

        logger.info(`プロジェクト${projectId}の${tasks.length}件のタスクの工数を再計算します`);

        const updateStmt = connection.prepare(
            'UPDATE tasks SET estimated_hours = ? WHERE id = ?'
        );

        let updatedCount = 0;
        const updates = [];

        // 各タスクの工数を再計算
        for (const task of tasks) {
            try {
                // 営業日ベースで工数を計算
                const effortDays = dateCalculator.calculateEffortDays(
                    task.start_date,
                    task.end_date
                );
                const calculatedHours = effortDays * 8; // 1日=8時間

                // 現在の工数と異なる場合のみ更新
                if (task.estimated_hours !== calculatedHours) {
                    updateStmt.run(calculatedHours, task.id);
                    updatedCount++;
                    updates.push({
                        taskId: task.id,
                        taskName: task.name,
                        oldHours: task.estimated_hours,
                        newHours: calculatedHours,
                        effortDays: effortDays
                    });
                    logger.info(
                        `タスク「${task.name}」(ID:${task.id}): ${task.estimated_hours}時間 → ${calculatedHours}時間 (${effortDays}営業日)`
                    );
                }
            } catch (error) {
                logger.error(`タスク「${task.name}」(ID:${task.id})の工数計算に失敗:`, error);
                // エラーがあっても他のタスクの処理は続行
            }
        }

        logger.info(`工数再計算完了: ${updatedCount}件のタスクを更新しました`);

        res.json({
            success: true,
            message: `${updatedCount}件のタスクの工数を再計算しました`,
            data: {
                totalTasks: tasks.length,
                updatedCount,
                updates
            }
        });
    } catch (error) {
        logger.error('工数再計算エラー:', error);
        res.status(500).json({
            success: false,
            message: '工数の再計算に失敗しました',
            error: error.message
        });
    }
}

module.exports = {
    recalculateProjectEffort
};
