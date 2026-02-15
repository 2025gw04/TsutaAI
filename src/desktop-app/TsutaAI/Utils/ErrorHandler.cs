using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;

namespace TsutaAI.Utils
{
    /// <summary>
    /// エラーハンドリングのユーティリティクラス
    /// </summary>
    public static class ErrorHandler
    {
        /// <summary>
        /// 例外を処理し、適切なユーザーメッセージを表示します。
        /// </summary>
        /// <param name="ex">発生した例外</param>
        /// <param name="context">エラーが発生したコンテキスト</param>
        /// <param name="showMessageBox">ユーザーにメッセージボックスを表示するかどうか</param>
        public static void HandleException(Exception ex, string context, bool showMessageBox = true)
        {
            string userMessage;
            string logMessage;

            switch (ex)
            {
                case HttpRequestException httpEx:
                    userMessage = "ネットワーク接続に問題があります。\nインターネット接続を確認してください。";
                    logMessage = $"{context}: ネットワークエラー - {httpEx.Message}";
                    Logger.Error(logMessage, httpEx);
                    break;

                case TaskCanceledException timeoutEx:
                    userMessage = "処理がタイムアウトしました。\nもう一度お試しください。";
                    logMessage = $"{context}: タイムアウト - {timeoutEx.Message}";
                    Logger.Error(logMessage, timeoutEx);
                    break;

                case InvalidOperationException invalidOpEx:
                    userMessage = $"操作を実行できませんでした。\n{invalidOpEx.Message}";
                    logMessage = $"{context}: 無効な操作 - {invalidOpEx.Message}";
                    Logger.Error(logMessage, invalidOpEx);
                    break;

                case UnauthorizedAccessException unauthorizedEx:
                    userMessage = "アクセス権限がありません。\n再ログインしてください。";
                    logMessage = $"{context}: アクセス拒否 - {unauthorizedEx.Message}";
                    Logger.Error(logMessage, unauthorizedEx);
                    break;

                case System.IO.IOException ioEx:
                    userMessage = "ファイル操作中にエラーが発生しました。\nファイルのアクセス権限を確認してください。";
                    logMessage = $"{context}: I/Oエラー - {ioEx.Message}";
                    Logger.Error(logMessage, ioEx);
                    break;

                case System.Data.SQLite.SQLiteException sqliteEx:
                    userMessage = "データベース操作中にエラーが発生しました。\nデータベースファイルを確認してください。";
                    logMessage = $"{context}: SQLiteエラー - {sqliteEx.Message}";
                    Logger.Error(logMessage, sqliteEx);
                    break;

                default:
                    userMessage = $"予期しないエラーが発生しました。\n{ex.Message}\n\n詳細はログファイルを確認してください。";
                    logMessage = $"{context}: 予期しないエラー - {ex.Message}\nStackTrace: {ex.StackTrace}";
                    Logger.Error(logMessage, ex);
                    break;
            }

            if (showMessageBox)
            {
                ShowErrorMessage(userMessage, GetErrorTitle(ex));
            }
        }

        /// <summary>
        /// エラーメッセージボックスを表示します。
        /// </summary>
        /// <param name="message">表示するメッセージ</param>
        /// <param name="title">タイトル</param>
        public static void ShowErrorMessage(string message, string title = "エラー")
        {
            try
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    MessageBox.Show(
                        message,
                        title,
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                });
            }
            catch
            {
                // Dispatcherが利用できない場合は直接表示
                MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// 警告メッセージボックスを表示します。
        /// </summary>
        /// <param name="message">表示するメッセージ</param>
        /// <param name="title">タイトル</param>
        public static void ShowWarningMessage(string message, string title = "警告")
        {
            try
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    MessageBox.Show(
                        message,
                        title,
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning);
                });
            }
            catch
            {
                MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        /// <summary>
        /// 情報メッセージボックスを表示します。
        /// </summary>
        /// <param name="message">表示するメッセージ</param>
        /// <param name="title">タイトル</param>
        public static void ShowInfoMessage(string message, string title = "情報")
        {
            try
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    MessageBox.Show(
                        message,
                        title,
                        MessageBoxButton.OK,
                        MessageBoxImage.Information);
                });
            }
            catch
            {
                MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        /// <summary>
        /// 確認ダイアログを表示します。
        /// </summary>
        /// <param name="message">表示するメッセージ</param>
        /// <param name="title">タイトル</param>
        /// <returns>ユーザーの選択（はい/いいえ）</returns>
        public static bool ShowConfirmDialog(string message, string title = "確認")
        {
            bool result = false;

            try
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    result = MessageBox.Show(
                        message,
                        title,
                        MessageBoxButton.YesNo,
                        MessageBoxImage.Question) == MessageBoxResult.Yes;
                });
            }
            catch
            {
                result = MessageBox.Show(message, title, MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes;
            }

            return result;
        }

        /// <summary>
        /// 例外の種類に応じたタイトルを返します。
        /// </summary>
        /// <param name="ex">例外</param>
        /// <returns>エラータイトル</returns>
        private static string GetErrorTitle(Exception ex)
        {
            switch (ex)
            {
                case HttpRequestException _:
                    return "ネットワークエラー";
                case TaskCanceledException _:
                    return "タイムアウトエラー";
                case InvalidOperationException _:
                    return "操作エラー";
                case UnauthorizedAccessException _:
                    return "アクセスエラー";
                case System.IO.IOException _:
                    return "ファイルエラー";
                case System.Data.SQLite.SQLiteException _:
                    return "データベースエラー";
                default:
                    return "エラー";
            }
        }

        /// <summary>
        /// エラー情報を収集してログに記録します。
        /// </summary>
        /// <param name="ex">例外</param>
        /// <param name="additionalInfo">追加情報</param>
        public static void LogDetailedError(Exception ex, string additionalInfo = null)
        {
            Logger.Error("=== 詳細エラー情報 ===");
            Logger.Error($"エラー種類: {ex.GetType().FullName}");
            Logger.Error($"メッセージ: {ex.Message}");
            Logger.Error($"スタックトレース:\n{ex.StackTrace}");

            if (ex.InnerException != null)
            {
                Logger.Error($"内部例外: {ex.InnerException.Message}");
                Logger.Error($"内部例外スタックトレース:\n{ex.InnerException.StackTrace}");
            }

            if (!string.IsNullOrEmpty(additionalInfo))
            {
                Logger.Error($"追加情報: {additionalInfo}");
            }

            Logger.Error("======================");
        }

        /// <summary>
        /// ネットワークエラーかどうかを判定します。
        /// </summary>
        /// <param name="ex">例外</param>
        /// <returns>ネットワークエラーの場合true</returns>
        public static bool IsNetworkError(Exception ex)
        {
            return ex is HttpRequestException ||
                   ex is TaskCanceledException ||
                   (ex is InvalidOperationException && ex.Message.Contains("network"));
        }

        /// <summary>
        /// リトライ可能なエラーかどうかを判定します。
        /// </summary>
        /// <param name="ex">例外</param>
        /// <returns>リトライ可能な場合true</returns>
        public static bool IsRetryableError(Exception ex)
        {
            return IsNetworkError(ex) ||
                   ex is TaskCanceledException ||
                   (ex is HttpRequestException httpEx && httpEx.Message.Contains("500"));
        }
    }
}
