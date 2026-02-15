using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace TsutaAI.Converters
{
    /// <summary>
    /// Null値をVisibilityに変換するコンバーター
    /// Null → Collapsed, NotNull → Visible
    /// </summary>
    public class NullToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            bool isInverted = parameter != null && parameter.ToString().ToLower() == "invert";

            if (isInverted)
            {
                // 反転モード: Null → Visible, NotNull → Collapsed
                return value == null ? Visibility.Visible : Visibility.Collapsed;
            }
            else
            {
                // 通常モード: Null → Collapsed, NotNull → Visible
                return value == null ? Visibility.Collapsed : Visibility.Visible;
            }
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
