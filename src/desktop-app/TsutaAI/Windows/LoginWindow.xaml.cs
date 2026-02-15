using System;
using System.Threading.Tasks;
using System.Windows;
using TsutaAI.Models;

namespace TsutaAI.Windows
{
    /// <summary>
    /// ログイン画面のコードビハインドです。
    /// </summary>
    public partial class LoginWindow : Window
    {
        public LoginWindow()
        {
            InitializeComponent();
        }

        private async void OnLoginClicked(object sender, RoutedEventArgs e)
        {
            ErrorTextBlock.Visibility = Visibility.Collapsed;

            var username = UsernameTextBox.Text?.Trim();
            var password = PasswordBox.Password;

            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                ShowError("ユーザーIDとパスワードを入力してください。");
                return;
            }

            if (App.ApiService == null)
            {
                ShowError("APIサービスが初期化されていません。設定をご確認ください。");
                return;
            }

            LoginButton.IsEnabled = false;

            try
            {
                var user = await App.ApiService.LoginAsync(username, password);
                if (user == null)
                {
                    throw new InvalidOperationException("ログイン情報を取得できませんでした。");
                }

                App.SetCurrentUser(user);

                // WebSocket接続を開始
                App.ConnectWebSocketAsync();

                var dashboard = new DashboardWindow();
                dashboard.Show();
                Close();
            }
            catch (Exception ex)
            {
                ShowError($"ログインに失敗しました: {ex.Message}");
            }
            finally
            {
                LoginButton.IsEnabled = true;
                PasswordBox.Clear();
            }
        }

        private void OnExitClicked(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        private void OnProxySettingClicked(object sender, RoutedEventArgs e)
        {
            var proxySettingWindow = new ProxySettingWindow();
            proxySettingWindow.ShowDialog();
        }

        private void OnApiSettingClicked(object sender, RoutedEventArgs e)
        {
            var apiSettingWindow = new ApiSettingsWindow();
            apiSettingWindow.ShowDialog();
        }

        private void ShowError(string message)
        {
            ErrorTextBlock.Text = message;
            ErrorTextBlock.Visibility = Visibility.Visible;
        }
    }
}
