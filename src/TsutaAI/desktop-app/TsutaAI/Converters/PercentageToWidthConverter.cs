using System;
using System.Globalization;
using System.Windows.Data;

namespace TsutaAI.Converters
{
    /// <summary>
    /// パーセンテージと親要素の幅から実際の幅(ピクセル)を計算するコンバーター
    /// </summary>
    public class PercentageToWidthConverter : IMultiValueConverter
    {
        /// <summary>
        /// パーセンテージと親要素の幅から実際の幅を計算
        /// values[0]: パーセンテージ (0-100)
        /// values[1]: 親要素の実際の幅 (ピクセル)
        /// </summary>
        public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
        {
            // 引数の検証
            if (values == null || values.Length < 2)
                return 0.0;

            // パーセンテージを取得 (0-100)
            double percentage;
            if (values[0] == null || !double.TryParse(values[0].ToString(), out percentage))
                return 0.0;

            // 親要素の幅を取得 (ピクセル)
            double parentWidth;
            if (values[1] == null || !double.TryParse(values[1].ToString(), out parentWidth))
                return 0.0;

            // 親要素の幅が有効でない場合
            if (double.IsNaN(parentWidth) || double.IsInfinity(parentWidth) || parentWidth <= 0)
                return 0.0;

            // パーセンテージを0-100の範囲に制限
            percentage = Math.Max(0, Math.Min(100, percentage));

            // 実際の幅を計算 (ピクセル)
            double actualWidth = (parentWidth * percentage) / 100.0;

            return actualWidth;
        }

        /// <summary>
        /// 逆変換は未実装 (一方向バインディングのみ)
        /// </summary>
        public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
