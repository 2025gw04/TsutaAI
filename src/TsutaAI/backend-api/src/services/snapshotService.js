/**
 * プロジェクトスナップショットサービス
 * プロジェクトの状態を保存・比較して変更を検知
 */

const dbModule = require('./database');
const db = dbModule.getConnection(); // レガシーAPI使用
const crypto = require('crypto');

/**
 * プロジェクトのスナップショットを作成
 * @param {Object} project - プロジェクトオブジェクト
 * @returns {Object} スナップショットデータ
 */
function createSnapshot(project) {
    // タスク統計を計算
    const taskStats = calculateTaskStats(project);

    return {
        id: project.id,
        name: project.name,
        status: project.status,
        progress: project.progress || 0,
        startDate: project.start_date || project.startDate,
        endDate: project.end_date || project.endDate,
        budget: project.budget,
        actualCost: project.actual_cost || project.actualCost || 0,
        taskStats: taskStats,
        memberCount: project.member_count || project.memberCount || 0,
        lastUpdated: new Date().toISOString()
    };
}

/**
 * タスク統計を計算
 * @param {Object} project - プロジェクトオブジェクト
 * @returns {Object} タスク統計
 */
function calculateTaskStats(project) {
    // プロジェクトに既にtaskStatsがある場合はそれを使用
    if (project.taskStats) {
        return project.taskStats;
    }

    // タスクデータから計算（必要に応じて実装）
    return {
        total: project.total_tasks || 0,
        completed: project.completed_tasks || 0,
        inProgress: project.in_progress_tasks || 0,
        overdue: project.overdue_tasks || 0
    };
}

/**
 * スナップショットのハッシュ値を計算
 * @param {Object} snapshot - スナップショットデータ
 * @returns {string} SHA-256ハッシュ値
 */
function hashSnapshot(snapshot) {
    // lastUpdatedを除外してハッシュ計算（時刻の違いで変更と判定されないように）
    const { lastUpdated, ...snapshotWithoutTimestamp } = snapshot;
    const data = JSON.stringify(snapshotWithoutTimestamp);
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 最新のスナップショットを取得
 * @returns {Array} 各プロジェクトの最新スナップショット
 */
function getLatestSnapshots() {
    const query = `
    SELECT ps.* FROM project_snapshots ps
    INNER JOIN (
      SELECT project_id, MAX(created_at) as max_date
      FROM project_snapshots
      GROUP BY project_id
    ) latest ON ps.project_id = latest.project_id 
      AND ps.created_at = latest.max_date
  `;

    return db.prepare(query).all();
}

/**
 * 特定プロジェクトの最新スナップショットを取得
 * @param {number} projectId - プロジェクトID
 * @returns {Object|null} 最新のスナップショット
 */
function getLatestSnapshotByProject(projectId) {
    const query = `
    SELECT * FROM project_snapshots
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;

    return db.prepare(query).get(projectId);
}

/**
 * スナップショットを保存
 * @param {number} projectId - プロジェクトID
 * @param {Object} snapshot - スナップショットデータ
 * @returns {number} 挿入されたレコードのID
 */
function saveSnapshot(projectId, snapshot) {
    const hash = hashSnapshot(snapshot);
    const query = `
    INSERT INTO project_snapshots (project_id, snapshot_data, snapshot_hash)
    VALUES (?, ?, ?)
  `;

    const result = db.prepare(query).run(projectId, JSON.stringify(snapshot), hash);
    return result.lastInsertRowid;
}

/**
 * 変更を検知
 * @param {Object} currentSnapshot - 現在のスナップショット
 * @param {Object} previousSnapshot - 前回のスナップショット
 * @returns {Array<Object>} 変更の配列
 */
function detectChanges(currentSnapshot, previousSnapshot) {
    const changes = [];
    const currentTaskStats = normalizeTaskStats(currentSnapshot.taskStats);
    const previousTaskStats = normalizeTaskStats(previousSnapshot.taskStats);

    // ステータス変更（高優先度）
    if (currentSnapshot.status !== previousSnapshot.status) {
        changes.push({
            field: 'status',
            priority: 'high',
            oldValue: previousSnapshot.status,
            newValue: currentSnapshot.status,
            description: `ステータスが「${previousSnapshot.status}」から「${currentSnapshot.status}」に変更されました`
        });
    }

    // 進捗率の変化
    const progressDiff = Math.abs(
        (currentSnapshot.progress || 0) - (previousSnapshot.progress || 0)
    );
    if (progressDiff >= 10) {
        changes.push({
            field: 'progress',
            priority: progressDiff >= 20 ? 'high' : 'medium',
            oldValue: previousSnapshot.progress,
            newValue: currentSnapshot.progress,
            description: `進捗率が${previousSnapshot.progress}%から${currentSnapshot.progress}%に変更されました`
        });
    }

    // 期限の変更
    if (currentSnapshot.endDate !== previousSnapshot.endDate) {
        changes.push({
            field: 'endDate',
            priority: 'medium',
            oldValue: previousSnapshot.endDate,
            newValue: currentSnapshot.endDate,
            description: `終了予定日が変更されました`
        });
    }

    // 予算・実績コストの変化
    const costDiff = Math.abs(
        (currentSnapshot.actualCost || 0) - (previousSnapshot.actualCost || 0)
    );
    if (costDiff > 0) {
        const budgetRatio = currentSnapshot.budget ?
            (currentSnapshot.actualCost / currentSnapshot.budget) : 0;

        changes.push({
            field: 'actualCost',
            priority: budgetRatio > 0.9 ? 'high' : 'medium',
            oldValue: previousSnapshot.actualCost,
            newValue: currentSnapshot.actualCost,
            description: `実績コストが変更されました`
        });
    }

    // 遅延タスク数の変化
    const currentOverdue = currentTaskStats.overdue;
    const previousOverdue = previousTaskStats.overdue;
    const overdueDiff = currentOverdue - previousOverdue;

    if (overdueDiff !== 0) {
        changes.push({
            field: 'overdueTasks',
            priority: overdueDiff >= 3 ? 'high' : (overdueDiff > 0 ? 'medium' : 'low'),
            oldValue: previousOverdue,
            newValue: currentOverdue,
            description: overdueDiff > 0
                ? `遅延タスクが${overdueDiff}件増加しました`
                : `遅延タスクが${Math.abs(overdueDiff)}件減少しました`
        });
    }

    // メンバー数の変化
    if (currentSnapshot.memberCount !== previousSnapshot.memberCount) {
        changes.push({
            field: 'memberCount',
            priority: 'low',
            oldValue: previousSnapshot.memberCount,
            newValue: currentSnapshot.memberCount,
            description: `メンバー数が変更されました`
        });
    }

    // タスク総数の変化
    if (currentTaskStats.total !== previousTaskStats.total) {
        changes.push({
            field: 'taskTotal',
            priority: 'medium',
            oldValue: previousTaskStats.total,
            newValue: currentTaskStats.total,
            description: `総タスク数が${previousTaskStats.total}件から${currentTaskStats.total}件に変更されました`
        });
    }

    // 完了タスク数の変化
    if (currentTaskStats.completed !== previousTaskStats.completed) {
        const diff = currentTaskStats.completed - previousTaskStats.completed;
        changes.push({
            field: 'taskCompleted',
            priority: diff > 0 ? 'low' : 'medium',
            oldValue: previousTaskStats.completed,
            newValue: currentTaskStats.completed,
            description: `完了タスク数が${previousTaskStats.completed}件から${currentTaskStats.completed}件に変更されました`
        });
    }

    // 進行中タスク数の変化
    if (currentTaskStats.inProgress !== previousTaskStats.inProgress) {
        changes.push({
            field: 'taskInProgress',
            priority: 'low',
            oldValue: previousTaskStats.inProgress,
            newValue: currentTaskStats.inProgress,
            description: `進行中タスク数が${previousTaskStats.inProgress}件から${currentTaskStats.inProgress}件に変更されました`
        });
    }

    // タスク完了率の変化
    const currentCompletionRate = calculateCompletionRate(currentTaskStats);
    const previousCompletionRate = calculateCompletionRate(previousTaskStats);
    const completionRateDiff = Math.abs(currentCompletionRate - previousCompletionRate);
    if (completionRateDiff >= 5) {
        changes.push({
            field: 'taskCompletionRate',
            priority: completionRateDiff >= 15 ? 'high' : 'medium',
            oldValue: previousCompletionRate,
            newValue: currentCompletionRate,
            description: `タスク完了率が${previousCompletionRate}%から${currentCompletionRate}%に変化しました`
        });
    }

    return changes;
}

/**
 * タスク統計を正規化
 * @param {Object|undefined} taskStats - タスク統計
 * @returns {{total: number, completed: number, inProgress: number, overdue: number}}
 */
function normalizeTaskStats(taskStats) {
    return {
        total: Number(taskStats?.total || 0),
        completed: Number(taskStats?.completed || 0),
        inProgress: Number(taskStats?.inProgress || taskStats?.in_progress || 0),
        overdue: Number(taskStats?.overdue || 0)
    };
}

/**
 * タスク完了率を計算
 * @param {{total: number, completed: number}} taskStats - タスク統計
 * @returns {number} 完了率（整数％）
 */
function calculateCompletionRate(taskStats) {
    if (!taskStats.total) return 0;
    return Math.round((taskStats.completed / taskStats.total) * 100);
}

/**
 * 古いスナップショットを削除（クリーンアップ）
 * @param {number} daysToKeep - 保持する日数（デフォルト: 30日）
 * @returns {number} 削除されたレコード数
 */
function cleanupOldSnapshots(daysToKeep = 30) {
    const query = `
    DELETE FROM project_snapshots
    WHERE created_at < datetime('now', '-${daysToKeep} days')
  `;

    const result = db.prepare(query).run();
    return result.changes;
}

module.exports = {
    createSnapshot,
    hashSnapshot,
    getLatestSnapshots,
    getLatestSnapshotByProject,
    saveSnapshot,
    detectChanges,
    cleanupOldSnapshots
};
