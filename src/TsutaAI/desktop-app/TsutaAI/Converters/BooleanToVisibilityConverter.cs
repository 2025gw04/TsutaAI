using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace TsutaAI.Converters
{
    /// <summary>
    /// bool値をVisibilityに変換するコンバーター。
    /// Parameterに"Inverse"を指定すると、trueの場合にCollapsed、falseの場合にVisibleを返します。
    /// </summary>
    public class BooleanToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            bool flag = false;
            if (value is bool)
            {
                flag = (bool)value;
            }
            else if (value is bool?)
            {
                flag = ((bool?)value).GetValueOrDefault();
            }

            if (parameter != null && parameter.ToString().Equals("Inverse", StringComparison.OrdinalIgnoreCase))
            {
                flag = !flag;
            }

            return flag ? Visibility.Visible : Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is Visibility visibility)
            {
                bool flag = (visibility == Visibility.Visible);
                
                if (parameter != null && parameter.ToString().Equals("Inverse", StringComparison.OrdinalIgnoreCase))
                {
                    flag = !flag;
                }
                
                return flag;
            }
            return false;
        }
    }
}
