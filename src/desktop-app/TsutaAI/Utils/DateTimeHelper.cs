using System;

namespace TsutaAI.Utils
{
    /// <summary>
    /// 日付や時間に関連する共通処理を提供するヘルパークラスです。
    /// </summary>
    public static class DateTimeHelper
    {
        /// <summary>
        /// 2つの日時の差を「hh:mm:ss」形式で返します。
        /// </summary>
        /// <param name="start">開始時刻</param>
        /// <param name="end">終了時刻</param>
        /// <returns>経過時間の文字列表現</returns>
        public static string FormatDuration(DateTime start, DateTime end)
        {
            TimeSpan span = end - start;
            if (span.TotalSeconds < 0)
            {
                span = TimeSpan.Zero;
            }
            return span.ToString(@"hh\:mm\:ss");
        }

        /// <summary>
        /// 予定終了時刻に対して残り時間を「hh:mm」形式で返します。
        /// </summary>
        /// <param name="target">予定終了時刻</param>
        /// <returns>残り時間の文字列表現</returns>
        public static string FormatRemainingTime(DateTime target)
        {
            TimeSpan span = target - DateTime.Now;
            if (span.TotalMinutes < 0)
            {
                return "00:00";
            }
            return span.ToString(@"hh\:mm");
        }
    }
}
