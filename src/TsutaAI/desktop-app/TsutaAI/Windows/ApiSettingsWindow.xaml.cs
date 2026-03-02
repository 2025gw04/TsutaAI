using System;
using System.Windows;
using TsutaAI.Config;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// API接続設定ウィンドウのコードビハインドです。
    /// </summary>
    public partial class ApiSettingsWindow : Window
    {
        private readonly ConfigService _configService;

        public ApiSettingsWindow()
        {
            InitializeComponent();
            _configService = new ConfigService();
            LoadSettings();
        }

        /// <summary>
        /// 設定を読み込んでUIに反映します。
        /// </summary>
        private void LoadSettings()
        {
            try
            {
                var settings = _configService.LoadSettings();
                ApiUrlTextBox.Text = settings.ApiUrl ?? "http://localhost:3000";
            }
            catch (Exception ex)
            {
                Logger.Error($"API設定の読み込み中にエラーが発生しました: {ex.Message}");
            }
        }

        /// <summary>
        /// API接続をテストします。
        /// </summary>
        private async void TestConnection_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (!TryGetValidatedApiUrl(out string apiUrl, out string validationMessage))
                {
                    ConnectionStatusTextBlock.Text = $"✗ 入力エラー: {validationMessage}";
                    ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                    return;
                }

                TestConnectionButton.IsEnabled = false;
                ConnectionStatusTextBlock.Text = "接続テスト中...";
                ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;

                var loadedSettings = _configService.LoadSettings();
                var apiSettings = new ApiSettings
                {
                    BaseUrl = apiUrl,
                    Timeout = loadedSettings?.API?.Timeout ?? 30
                };
                var proxySettings = loadedSettings?.Proxy ?? new ProxySettings();

                var apiService = new ApiService(apiSettings, proxySettings);

                bool result = await apiService.TestConnectionAsync();

                if (result)
                {
                    ConnectionStatusTextBlock.Text = "✓ 接続成功 - APIサーバーに正常に接続できました";
                    ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.LightGreen;
                    Logger.Info($"API接続テスト成功: {ApiUrlTextBox.Text}");
                }
                else
                {
                    ConnectionStatusTextBlock.Text = "✗ 接続失敗 - APIサーバーから応答がありません";
                    ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                    Logger.Warn($"API接続テスト失敗: {ApiUrlTextBox.Text}");
                }
            }
            catch (Exception ex)
            {
                ConnectionStatusTextBlock.Text = "✗ 接続失敗: " + ex.Message;
                ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                Logger.Error($"API接続テスト失敗: {ex.Message}");
            }
            finally
            {
                TestConnectionButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// 設定を保存します。
        /// </summary>
        private void Save_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (!TryGetValidatedApiUrl(out string apiUrl, out string validationMessage))
                {
                    Alert.Warn(validationMessage, "入力エラー");
                    return;
                }

                SaveButton.IsEnabled = false;
                var settings = _configService.LoadSettings();
                settings.ApiUrl = apiUrl;
                _configService.SaveSettings(settings);
                App.ApplyNetworkSettings();

                Logger.Info($"API URLを保存しました: {apiUrl}");
                Alert.Success("API設定を保存しました。", "成功");
                this.DialogResult = true;
                this.Close();
            }
            catch (Exception ex)
            {
                Logger.Error($"API設定の保存中にエラーが発生しました: {ex.Message}");
                Alert.Error("API設定の保存に失敗しました。", "エラー");
            }
            finally
            {
                SaveButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// キャンセルしてウィンドウを閉じます。
        /// </summary>
        private void Cancel_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }

        private bool TryGetValidatedApiUrl(out string apiUrl, out string validationMessage)
        {
            apiUrl = (ApiUrlTextBox.Text ?? string.Empty).Trim();
            validationMessage = string.Empty;

            if (string.IsNullOrWhiteSpace(apiUrl))
            {
                validationMessage = "API URLを入力してください。";
                return false;
            }

            if (!Uri.TryCreate(apiUrl, UriKind.Absolute, out Uri parsedUri))
            {
                validationMessage = "API URLの形式が正しくありません。";
                return false;
            }

            if (parsedUri.Scheme != Uri.UriSchemeHttp && parsedUri.Scheme != Uri.UriSchemeHttps)
            {
                validationMessage = "API URLは http または https を指定してください。";
                return false;
            }

            return true;
        }
    }
}
