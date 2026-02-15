using System;
using System.Globalization;
using System.Windows.Data;

namespace TsutaAI.Converters
{
    /// <summary>
    /// プロジェクトステータスを表示名に変換するコンバーター
    /// </summary>
    public class ProjectStatusToDisplayConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value == null)
                return "不明";

            string status = value.ToString().ToLower();

            switch (status)
            {
                case "planning":
                    return "計画中";

                case "active":
                    return "進行中";

                case "on_hold":
                    return "保留";

                case "completed":
                    return "完了";

                case "cancelled":
                    return "キャンセル";

                // 既に日本語の場合はそのまま返す
                case "計画中":
                case "進行中":
                case "保留":
                case "完了":
                case "キャンセル":
                    return value.ToString();

                default:
                    return value.ToString();
            }
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value == null)
                return null;

            string displayName = value.ToString();

            switch (displayName)
            {
                case "計画中":
                    return "planning";

                case "進行中":
                    return "active";

                case "保留":
                    return "on_hold";

                case "完了":
                    return "completed";

                case "キャンセル":
                    return "cancelled";

                default:
                    return value.ToString().ToLower();
            }
        }
    }
}
