using System;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using MahApps.Metro.IconPacks;

namespace TsutaAI.Windows
{
    public enum AlertType
    {
        Info,
        Warn,
        Error,
        Success,
        Confirm // Added
    }

    /// <summary>
    /// AlertWindow.xaml の相互作用ロジック
    /// </summary>
    public partial class AlertWindow : Window
    {
        public AlertWindow(string message, AlertType type, string title = null)
        {
            InitializeComponent();
            SetupWindow(message, type, title);
            
            // 画面サイズに基づいた最大サイズの制限
            MaxWidth = SystemParameters.PrimaryScreenWidth * 0.8;
            MaxHeight = SystemParameters.PrimaryScreenHeight * 0.8;
        }

        private void SetupWindow(string message, AlertType type, string title)
        {
            MessageText.Text = message;
            TitleText.Text = title ?? type.ToString();

            // Reset buttons
            OkButton.Content = "OK";
            CancelButton.Visibility = Visibility.Collapsed;

            switch (type)
            {
                case AlertType.Info:
                    SetIcon(PackIconBoxIconsKind.SolidInfoCircle, "#E3F2FD", "#2196F3"); // Info Blue
                    TitleText.Text = title ?? "Information";
                    break;
                case AlertType.Warn:
                    SetIcon(PackIconBoxIconsKind.SolidMessageExclamation, "#FFF3E0", "#FF9800"); // Warning Orange
                    TitleText.Text = title ?? "Warning";
                    break;
                case AlertType.Error:
                    SetIcon(PackIconBoxIconsKind.SolidXCircle, "#FFEBEE", "#F44336"); // Error Red
                    TitleText.Text = title ?? "Error";
                    break;
                case AlertType.Success:
                    SetIcon(PackIconBoxIconsKind.RegularCheck, "#E8F5E9", "#4CAF50"); // Success Green
                    TitleText.Text = title ?? "Success";
                    break;
                case AlertType.Confirm:
                    SetIcon(PackIconBoxIconsKind.RegularHelpCircle, "#E0F7FA", "#00BCD4"); // Question Cyan
                    TitleText.Text = title ?? "Confirm";
                    OkButton.Content = "Yes";
                    CancelButton.Content = "No"; // Using "No" for confirmation dialogs commonly
                    CancelButton.Visibility = Visibility.Visible;
                    break;
            }
        }

        private void SetIcon(PackIconBoxIconsKind kind, string bgHex, string fgHex)
        {
            AlertIcon.Kind = kind;
            IconContainer.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(bgHex));
            AlertIcon.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(fgHex));
        }

        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
            Close();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            DragMove();
        }
    }
}
