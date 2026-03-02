using System;
using System.Threading.Tasks;

namespace TsutaAI.Utils
{
    /// <summary>
    /// リトライポリシーを提供するユーティリティクラス
    /// </summary>
    public static class RetryPolicy
    {
        /// <summary>
        /// 指数バックオフでリトライを実行します。
        /// </summary>
        /// <typeparam name="T">戻り値の型</typeparam>
        /// <param name="action">実行する非同期アクション</param>
        /// <param name="maxRetries">最大リトライ回数</param>
        /// <param name="baseDelayMs">初期遅延時間（ミリ秒）</param>
        /// <param name="maxDelayMs">最大遅延時間（ミリ秒）</param>
        /// <param name="shouldRetry">リトライすべきかどうかを判定する関数</param>
        /// <returns>アクションの結果</returns>
        public static async Task<T> ExecuteWithRetryAsync<T>(
            Func<Task<T>> action,
            int maxRetries = 3,
            int baseDelayMs = 1000,
            int maxDelayMs = 30000,
            Func<Exception, bool> shouldRetry = null)
        {
            // デフォルトのリトライ判定関数
            if (shouldRetry == null)
            {
                shouldRetry = (ex) => ErrorHandler.IsRetryableError(ex);
            }

            Exception lastException = null;

            for (int attempt = 0; attempt <= maxRetries; attempt++)
            {
                try
                {
                    return await action();
                }
                catch (Exception ex)
                {
                    lastException = ex;

                    // リトライすべきでない場合、または最終試行の場合は例外をスロー
                    if (!shouldRetry(ex) || attempt >= maxRetries)
                    {
                        throw;
                    }

                    // 指数バックオフで待機
                    int delayMs = CalculateExponentialBackoff(attempt, baseDelayMs, maxDelayMs);

                    Logger.Warn($"リトライ {attempt + 1}/{maxRetries}: {ex.Message}。{delayMs}ms後に再試行します。");

                    await Task.Delay(delayMs);
                }
            }

            // ここには到達しないはずだが、念のため
            throw lastException ?? new InvalidOperationException("リトライが失敗しました");
        }

        /// <summary>
        /// 戻り値なしの非同期アクションに対してリトライを実行します。
        /// </summary>
        /// <param name="action">実行する非同期アクション</param>
        /// <param name="maxRetries">最大リトライ回数</param>
        /// <param name="baseDelayMs">初期遅延時間（ミリ秒）</param>
        /// <param name="maxDelayMs">最大遅延時間（ミリ秒）</param>
        /// <param name="shouldRetry">リトライすべきかどうかを判定する関数</param>
        public static async Task ExecuteWithRetryAsync(
            Func<Task> action,
            int maxRetries = 3,
            int baseDelayMs = 1000,
            int maxDelayMs = 30000,
            Func<Exception, bool> shouldRetry = null)
        {
            await ExecuteWithRetryAsync(async () =>
            {
                await action();
                return true; // ダミーの戻り値
            }, maxRetries, baseDelayMs, maxDelayMs, shouldRetry);
        }

        /// <summary>
        /// 指数バックオフの遅延時間を計算します。
        /// </summary>
        /// <param name="attempt">試行回数（0から始まる）</param>
        /// <param name="baseDelayMs">基本遅延時間（ミリ秒）</param>
        /// <param name="maxDelayMs">最大遅延時間（ミリ秒）</param>
        /// <returns>遅延時間（ミリ秒）</returns>
        private static int CalculateExponentialBackoff(int attempt, int baseDelayMs, int maxDelayMs)
        {
            // 2^attempt * baseDelayMs だが、maxDelayMsを超えないようにする
            int delayMs = baseDelayMs * (int)Math.Pow(2, attempt);

            // ジッター（ランダムな遅延）を追加して、リトライの衝突を避ける
            Random random = new Random();
            int jitter = random.Next(0, delayMs / 2);

            delayMs += jitter;

            return Math.Min(delayMs, maxDelayMs);
        }

        /// <summary>
        /// ネットワークエラーに対する標準的なリトライポリシーを適用します。
        /// </summary>
        /// <typeparam name="T">戻り値の型</typeparam>
        /// <param name="action">実行する非同期アクション</param>
        /// <returns>アクションの結果</returns>
        public static Task<T> ExecuteNetworkCallAsync<T>(Func<Task<T>> action)
        {
            return ExecuteWithRetryAsync(
                action,
                maxRetries: 3,
                baseDelayMs: 2000,
                maxDelayMs: 16000,
                shouldRetry: ErrorHandler.IsRetryableError);
        }

        /// <summary>
        /// ネットワークエラーに対する標準的なリトライポリシーを適用します（戻り値なし）。
        /// </summary>
        /// <param name="action">実行する非同期アクション</param>
        public static Task ExecuteNetworkCallAsync(Func<Task> action)
        {
            return ExecuteWithRetryAsync(
                action,
                maxRetries: 3,
                baseDelayMs: 2000,
                maxDelayMs: 16000,
                shouldRetry: ErrorHandler.IsRetryableError);
        }

        /// <summary>
        /// データベース操作に対する標準的なリトライポリシーを適用します。
        /// </summary>
        /// <typeparam name="T">戻り値の型</typeparam>
        /// <param name="action">実行するアクション</param>
        /// <returns>アクションの結果</returns>
        public static async Task<T> ExecuteDatabaseOperationAsync<T>(Func<Task<T>> action)
        {
            return await ExecuteWithRetryAsync(
                action,
                maxRetries: 5,
                baseDelayMs: 100,
                maxDelayMs: 2000,
                shouldRetry: (ex) => ex is System.Data.SQLite.SQLiteException sqliteEx &&
                    (sqliteEx.Message.Contains("database is locked") ||
                     sqliteEx.Message.Contains("busy")));
        }
    }
}
