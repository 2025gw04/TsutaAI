using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace TsutaAI.Converters
{
    /// <summary>
    /// プロジェクトステータスを色に変換するコンバーター
    /// </summary>
    public class ProjectStatusToBrushConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value == null)
                return new SolidColorBrush(Colors.Gray);

            string status = value.ToString().ToLower();

            switch (status)
            {
                case "planning":
                case "計画中":
                    return new SolidColorBrush(Color.FromRgb(66, 165, 245)); // 青 (Blue)

                case "active":
                case "進行中":
                    return new SolidColorBrush(Color.FromRgb(102, 187, 106)); // 緑 (Green)

                case "on_hold":
                case "保留":
                    return new SolidColorBrush(Color.FromRgb(255, 167, 38)); // オレンジ (Orange)

                case "completed":
                case "完了":
                    return new SolidColorBrush(Color.FromRgb(158, 158, 158)); // グレー (Gray)

                case "cancelled":
                case "キャンセル":
                    return new SolidColorBrush(Color.FromRgb(239, 83, 80)); // 赤 (Red)

                default:
                    return new SolidColorBrush(Colors.Gray);
            }
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
