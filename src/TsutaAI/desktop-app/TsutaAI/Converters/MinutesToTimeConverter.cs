using System;
using System.Globalization;
using System.Windows.Data;

namespace TsutaAI.Converters
{
    public class MinutesToTimeConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is int minutes)
            {
                if (minutes < 60)
                {
                    return $"{minutes}分";
                }
                else if (minutes < 1440) // 24 * 60
                {
                    int h = minutes / 60;
                    int m = minutes % 60;
                    return $"{h}時間 {m}分";
                }
                else
                {
                    int d = minutes / 1440;
                    int remainingMinutes = minutes % 1440;
                    int h = remainingMinutes / 60;
                    int m = remainingMinutes % 60;
                    return $"{d}日 {h}時間 {m}分";
                }
            }
            // value might be long or double, handle safely or just strict int?
            // TaskItem.EstimatedMinutes is likely int.
            return "0分";
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
