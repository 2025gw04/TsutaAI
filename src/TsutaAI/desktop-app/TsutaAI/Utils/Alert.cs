using System;
using System.Windows;
using TsutaAI.Windows;

namespace TsutaAI.Utils
{
    public static class Alert
    {
        public static void Info(string message, string title = "Information")
        {
            Show(message, AlertType.Info, title);
        }

        public static void Warn(string message, string title = "Warning")
        {
            Show(message, AlertType.Warn, title);
        }

        public static void Error(string message, string title = "Error")
        {
            Show(message, AlertType.Error, title);
        }

        public static void Success(string message, string title = "Success")
        {
            Show(message, AlertType.Success, title);
        }

        public static bool Confirm(string message, string title = "Confirm")
        {
            return Show(message, AlertType.Confirm, title) ?? false;
        }

        private static bool? Show(string message, AlertType type, string title)
        {
            // UIスレッドで実行することを保証
            return Application.Current.Dispatcher.Invoke(() =>
            {
                var window = new AlertWindow(message, type, title);
                // メインウィンドウが有効ならオーナーに設定
                if (Application.Current.MainWindow != null && Application.Current.MainWindow.IsVisible)
                {
                    window.Owner = Application.Current.MainWindow;
                    window.WindowStartupLocation = WindowStartupLocation.CenterOwner;
                }
                else
                {
                    window.WindowStartupLocation = WindowStartupLocation.CenterScreen;
                }
                
                return window.ShowDialog();
            });
        }
    }
}
