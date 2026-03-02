using System;
using System.IO;
using TsutaAI.Config;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// 設定ファイルの読み込みとアクセスを管理する静的クラスです。
    /// シングルトンパターンで実装し、アプリケーション全体で単一の設定情報を共有します。
    /// </summary>
    public sealed class ConfigService
    {
        /// <summary>
        /// ConfigService の唯一のインスタンス
        /// </summary>
        private static ConfigService _instance = null;

        /// <summary>
        /// スレッドセーフなインスタンス生成のためのロックオブジェクト
        /// </summary>
        private static readonly object _lock = new object();

        /// <summary>
        /// 実際に利用中の設定情報
        /// </summary>
        public ApplicationSetting Setting { get; private set; }

        /// <summary>
        /// 設定ファイルのフルパス
        /// </summary>
        private readonly string _configPath;

        /// <summary>
        /// アプリケーション全体で共有される設定情報へのアクセスポイントです。
        /// 必ず Initialize() メソッドで初期化してから使用してください。
        /// </summary>
        public static ApplicationSetting Current
        {
            get
            {
                if (_instance == null)
                {
                    throw new InvalidOperationException("ConfigService が初期化されていません。App.xaml.cs の OnStartup で Initialize() を呼び出してください。");
                }
                return _instance.Setting;
            }
        }

        /// <summary>
        /// プライベートコンストラクタ。外部からのインスタンス化を防ぎます。
        /// </summary>
        /// <param name="configPath">設定ファイルの場所</param>
        private ConfigService(string configPath)
        {
            _configPath = configPath;
            EnsureConfigFile();
            Setting = ApplicationSetting.Load(_configPath);
        }

        /// <summary>
        /// アプリケーションの起動時に一度だけ呼び出し、設定サービスを初期化します。
        /// </summary>
        public static void Initialize()
        {
            lock (_lock)
            {
                if (_instance == null)
                {
                    // appsettings.yaml を実行ファイルと同じディレクトリの "Config" フォルダ内に配置
                    string configFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Config", "appsettings.yaml");
                    _instance = new ConfigService(configFilePath);
                    Logger.Info($"設定サービスが初期化されました。設定ファイル: {configFilePath}");
                }
            }
        }

        /// <summary>
        /// 現在の設定をファイルに保存します。
        /// </summary>
        public static void Save()
        {
            if (_instance == null)
            {
                throw new InvalidOperationException("ConfigService が初期化されていません。");
            }

            _instance.Setting.Save(_instance._configPath);
            Logger.Info($"設定ファイルを保存しました: {_instance._configPath}");
        }

        /// <summary>
        /// パブリックコンストラクタ。設定画面からの使用を可能にします。
        /// </summary>
        public ConfigService()
        {
            string configFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Config", "appsettings.yaml");
            _configPath = configFilePath;
            EnsureConfigFile();
            Setting = ApplicationSetting.Load(_configPath);
        }

        /// <summary>
        /// 設定を読み込みます。
        /// </summary>
        public ApplicationSetting LoadSettings()
        {
            return ApplicationSetting.Load(_configPath);
        }

        /// <summary>
        /// 設定を保存します。
        /// </summary>
        public void SaveSettings(ApplicationSetting settings)
        {
            if (settings == null)
            {
                throw new ArgumentNullException(nameof(settings));
            }

            settings.Save(_configPath);
            Setting = settings;

            // App 起動時に初期化済みの共有設定にも反映する
            lock (_lock)
            {
                if (_instance != null && string.Equals(_instance._configPath, _configPath, StringComparison.OrdinalIgnoreCase))
                {
                    _instance.Setting = settings;
                }
            }

            Logger.Info($"設定を保存しました: {_configPath}");
        }

        /// <summary>
        /// 設定ファイルが存在しない場合に既定値で生成します。
        /// </summary>
        private void EnsureConfigFile()
        {
            string directory = Path.GetDirectoryName(_configPath);
            if (!Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            if (!File.Exists(_configPath))
            {
                Logger.Warn($"設定ファイルが見つからなかったため、既定値で生成します: {_configPath}");
                var defaultConfig = ApplicationSetting.CreateDefault();
                defaultConfig.Save(_configPath);
            }
        }
    }
}
