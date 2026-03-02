using System;
using System.IO;
using System.Text;

namespace TsutaAI.Utils
{
    /// <summary>
    /// アプリ全体で使用するシンプルなログユーティリティです。
    /// </summary>
    public static class Logger
    {
        /// <summary>
        /// ログレベルを表す列挙体です。
        /// </summary>
        public enum LogLevel
        {
            Debug,
            Info,
            Warn,
            Error
        }

        /// <summary>
        /// 現在の出力対象レベルです。このレベル以上のログのみ出力します。
        /// </summary>
        public static LogLevel CurrentLevel { get; set; } = LogLevel.Info;

        /// <summary>
        /// ログファイルのパスを返します。
        /// </summary>
        private static string LogFilePath
        {
            get
            {
                string directory = Common.GetLogDirectory();
                string fileName = $"TsutaAI_{DateTime.Now:yyyyMMdd}.log";
                return Path.Combine(directory, fileName);
            }
        }

        /// <summary>
        /// ログを出力します。
        /// </summary>
        /// <param name="level">ログレベル</param>
        /// <param name="message">出力するメッセージ</param>
        public static void Write(LogLevel level, string message)
        {
            if (level < CurrentLevel)
            {
                return;
            }

            string line = $"{DateTime.Now:yyyy/MM/dd HH:mm:ss.fff}\t{level}\t{message}";
            try
            {
                File.AppendAllText(LogFilePath, line + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
                // ここでは例外を握りつぶし、アプリの動作を優先します。
            }
        }

        /// <summary>
        /// 情報ログを出力します。
        /// </summary>
        /// <param name="message">出力するメッセージ</param>
        public static void Info(string message)
        {
            Write(LogLevel.Info, message);
        }

        /// <summary>
        /// デバッグログを出力します。
        /// </summary>
        /// <param name="message">出力するメッセージ</param>
        public static void Debug(string message)
        {
            Write(LogLevel.Debug, message);
        }

        /// <summary>
        /// 警告ログを出力します。
        /// </summary>
        /// <param name="message">出力するメッセージ</param>
        public static void Warn(string message)
        {
            Write(LogLevel.Warn, message);
        }

        /// <summary>
        /// エラーログを出力します。
        /// </summary>
        /// <param name="message">出力するメッセージ</param>
        public static void Error(string message)
        {
            Write(LogLevel.Error, message);
        }

        /// <summary>
        /// エラーログを例外情報と共に出力します。
        /// </summary>
        /// <param name="message">出力するメッセージ</param>
        /// <param name="exception">例外情報</param>
        public static void Error(string message, Exception exception)
        {
            if (exception != null)
            {
                Write(LogLevel.Error, $"{message} | Exception: {exception.GetType().Name} - {exception.Message}");
                if (!string.IsNullOrEmpty(exception.StackTrace))
                {
                    Write(LogLevel.Error, $"StackTrace: {exception.StackTrace}");
                }
            }
            else
            {
                Write(LogLevel.Error, message);
            }
        }
    }
}
