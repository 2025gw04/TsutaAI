using System;
using System.Windows;
using TsutaAI.Config;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// プロキシ設定画面のコードビハインドです。
    /// </summary>
    public partial class ProxySettingWindow : Window
    {
        private readonly ConfigService _configService;

        public ProxySettingWindow()
        {
            InitializeComponent();
            _configService = new ConfigService();
            LoadSettings();
            UpdateControlsEnabledState();
        }

        /// <summary>
        /// プロキシ設定を読み込んでUIに反映します。
        /// </summary>
        private void LoadSettings()
        {
            try
            {
                var settings = _configService.LoadSettings();

                if (settings?.Proxy != null)
                {
                    UseProxyCheckBox.IsChecked = settings.Proxy.UseProxy;
                    ProxyUriTextBox.Text = settings.Proxy.ProxyUri ?? "";
                    UserNameTextBox.Text = settings.Proxy.UserName ?? "";
                    PasswordBox.Password = settings.Proxy.Password ?? "";
                }
                else
                {
                    UseProxyCheckBox.IsChecked = false;
                    ProxyUriTextBox.Text = "";
                    UserNameTextBox.Text = "";
                    PasswordBox.Password = "";
                }

                Logger.Info("プロキシ設定を読み込みました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロキシ設定の読み込み中にエラーが発生しました: {ex.Message}");
                Alert.Error("プロキシ設定の読み込みに失敗しました。", "エラー");
            }
        }

        /// <summary>
        /// プロキシ設定を保存します。
        /// </summary>
        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (!TryGetValidatedProxyUri(out string proxyUri, out string validationMessage))
                {
                    Alert.Warn(validationMessage, "入力エラー");
                    return;
                }

                SaveButton.IsEnabled = false;
                var settings = _configService.LoadSettings();

                if (settings.Proxy == null)
                {
                    settings.Proxy = new ProxySettings();
                }

                settings.Proxy.UseProxy = UseProxyCheckBox.IsChecked ?? false;
                settings.Proxy.ProxyUri = proxyUri;
                settings.Proxy.UserName = UserNameTextBox.Text?.Trim() ?? "";
                settings.Proxy.Password = PasswordBox.Password ?? "";

                _configService.SaveSettings(settings);
                App.ApplyNetworkSettings();
                Logger.Info("プロキシ設定を保存しました。");

                Alert.Success("プロキシ設定を保存しました。", "成功");
                this.DialogResult = true;
                this.Close();
            }
            catch (Exception ex)
            {
                Logger.Error($"プロキシ設定の保存中にエラーが発生しました: {ex.Message}");
                Alert.Error("プロキシ設定の保存に失敗しました。", "エラー");
            }
            finally
            {
                SaveButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// キャンセルボタンのクリックイベントハンドラーです。
        /// </summary>
        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }

        /// <summary>
        /// プロキシ使用チェックボックスの状態変更イベントハンドラーです。
        /// </summary>
        private void UseProxyCheckBox_CheckedChanged(object sender, RoutedEventArgs e)
        {
            UpdateControlsEnabledState();
        }

        /// <summary>
        /// プロキシ使用チェックボックスの状態に応じてコントロールの有効/無効を切り替えます。
        /// </summary>
        private void UpdateControlsEnabledState()
        {
            bool isEnabled = UseProxyCheckBox.IsChecked ?? false;
            ProxyUriTextBox.IsEnabled = isEnabled;
            UserNameTextBox.IsEnabled = isEnabled;
            PasswordBox.IsEnabled = isEnabled;
        }

        private bool TryGetValidatedProxyUri(out string proxyUri, out string validationMessage)
        {
            proxyUri = (ProxyUriTextBox.Text ?? string.Empty).Trim();
            validationMessage = string.Empty;
            bool useProxy = UseProxyCheckBox.IsChecked ?? false;

            if (!useProxy)
            {
                return true;
            }

            if (string.IsNullOrWhiteSpace(proxyUri))
            {
                validationMessage = "プロキシを使用する場合は、プロキシサーバーURLを入力してください。";
                return false;
            }

            if (!Uri.TryCreate(proxyUri, UriKind.Absolute, out Uri parsedUri))
            {
                validationMessage = "プロキシURLの形式が正しくありません。";
                return false;
            }

            if (parsedUri.Scheme != Uri.UriSchemeHttp && parsedUri.Scheme != Uri.UriSchemeHttps)
            {
                validationMessage = "プロキシURLは http または https を指定してください。";
                return false;
            }

            return true;
        }
    }
}
