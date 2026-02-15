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
                TestConnectionButton.IsEnabled = false;
                ConnectionStatusTextBlock.Text = "接続テスト中...";
                ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;

                var loadedSettings = _configService.LoadSettings();
                var apiSettings = new ApiSettings
                {
                    BaseUrl = ApiUrlTextBox.Text,
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
                var settings = _configService.LoadSettings();
                settings.ApiUrl = ApiUrlTextBox.Text;
                _configService.SaveSettings(settings);

                Logger.Info($"API URLを保存しました: {ApiUrlTextBox.Text}");
                Alert.Success("API設定を保存しました。", "成功");
                this.DialogResult = true;
                this.Close();
            }
            catch (Exception ex)
            {
                Logger.Error($"API設定の保存中にエラーが発生しました: {ex.Message}");
                Alert.Error("API設定の保存に失敗しました。", "エラー");
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
    }
}
