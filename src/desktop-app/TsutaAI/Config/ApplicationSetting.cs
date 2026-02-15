using System;
using System.IO;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace TsutaAI.Config
{
    /// <summary>
    /// アプリケーション全体で利用する設定情報を管理するクラスです。
    /// </summary>
    public class ApplicationSetting
    {
        /// <summary>
        /// バックエンドAPIの接続情報です。
        /// </summary>
        public ApiSettings API { get; set; } = new ApiSettings();

        /// <summary>
        /// SQLite データベースの設定です。
        /// </summary>
        public DatabaseSettings Database { get; set; } = new DatabaseSettings();

        /// <summary>
        /// アプリの動作設定です。
        /// </summary>
        public AppConfig App { get; set; } = new AppConfig();

        /// <summary>
        /// 会社内プロキシ利用時の設定です。
        /// </summary>
        public ProxySettings Proxy { get; set; } = new ProxySettings();

        /// <summary>
        /// API URL（設定画面で利用）。
        /// </summary>
        public string ApiUrl
        {
            get => API?.BaseUrl ?? "http://localhost:3000";
            set { if (API != null) API.BaseUrl = value; }
        }

        /// <summary>
        /// 作業フォルダのパス。
        /// </summary>
        public string WorkFolder { get; set; } = "";

        /// <summary>
        /// ファイル変更を監視するか。
        /// </summary>
        public bool MonitorFileChanges { get; set; } = true;

        /// <summary>
        /// Git情報を収集するか。
        /// </summary>
        public bool MonitorGit { get; set; } = true;

        /// <summary>
        /// マウスクリックを監視するか。
        /// </summary>
        public bool MonitorMouse { get; set; } = true;

        /// <summary>
        /// キーボード入力を監視するか。
        /// </summary>
        public bool MonitorKeyboard { get; set; } = true;

        /// <summary>
        /// アクティブウィンドウを監視するか。
        /// </summary>
        public bool MonitorActiveWindow { get; set; } = true;

        /// <summary>
        /// 自動保存間隔（分）。
        /// </summary>
        public int AutoSaveIntervalMinutes { get; set; } = 60;

        /// <summary>
        /// アイドル検出時間（分）。
        /// </summary>
        public int IdleTimeMinutes { get; set; } = 10;

        /// <summary>
        /// タスク開始時に通知するか。
        /// </summary>
        public bool NotifyTaskStart { get; set; } = true;

        /// <summary>
        /// タスク終了予定時刻に通知するか。
        /// </summary>
        public bool NotifyTaskEnd { get; set; } = true;

        /// <summary>
        /// 休憩時間を通知するか。
        /// </summary>
        public bool NotifyBreak { get; set; } = false;

        /// <summary>
        /// AIアラートを通知するか。
        /// </summary>
        public bool NotifyAiAlert { get; set; } = true;

        /// <summary>
        /// 通知音を再生するか。
        /// </summary>
        public bool NotifySound { get; set; } = true;

        /// <summary>
        /// 休暇情報のリスト。
        /// </summary>
        public System.Collections.Generic.List<VacationInfo> Vacations { get; set; } = new System.Collections.Generic.List<VacationInfo>();

        /// <summary>
        /// バージョン管理システムの設定。
        /// </summary>
        public VersionControlSettings VersionControl { get; set; } = new VersionControlSettings();

        /// <summary>
        /// YAML ファイルから設定を読み込みます。
        /// </summary>
        /// <param name="filePath">読み込むファイルのパス</param>
        /// <returns>読み込んだ設定インスタンス</returns>
        public static ApplicationSetting Load(string filePath)
        {
            if (!File.Exists(filePath))
            {
                throw new FileNotFoundException($"設定ファイルが見つかりません: {filePath}");
            }

            string yamlContent = File.ReadAllText(filePath);
            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(PascalCaseNamingConvention.Instance)
                .Build();

            ApplicationSetting setting = deserializer.Deserialize<ApplicationSetting>(yamlContent) ?? new ApplicationSetting();
            if (!Path.IsPathRooted(setting.Database.Path))
            {
                string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
                setting.Database.Path = Path.GetFullPath(Path.Combine(baseDirectory, setting.Database.Path));
            }

            if (setting.Proxy == null)
            {
                setting.Proxy = new ProxySettings();
            }
            return setting;
        }

        /// <summary>
        /// 設定を YAML ファイルへ書き出します。
        /// </summary>
        /// <param name="filePath">書き出し先のファイルパス</param>
        public void Save(string filePath)
        {
            var serializer = new SerializerBuilder()
                .WithNamingConvention(PascalCaseNamingConvention.Instance)
                .ConfigureDefaultValuesHandling(DefaultValuesHandling.OmitDefaults)
                .Build();

            string yaml = serializer.Serialize(this);
            File.WriteAllText(filePath, yaml);
        }

        /// <summary>
        /// 既定値を持つ設定インスタンスを生成します。
        /// </summary>
        /// <returns>既定値を設定済みのインスタンス</returns>
        public static ApplicationSetting CreateDefault()
        {
            return new ApplicationSetting
            {
                API = new ApiSettings
                {
                    BaseUrl = "http://localhost:3000",
                    Timeout = 30
                },
                Database = new DatabaseSettings
                {
                    Path = @"..\\..\\..\\..\\database\\tsutaai.db"
                },
                App = new AppConfig
                {
                    LogLevel = "Info",
                    AutoSave = true,
                    Theme = "Light",
                    Language = "ja-JP"
                },
                Proxy = new ProxySettings
                {
                    UseProxy = false, // 必要に応じて true に変更
                    ProxyUri = Environment.GetEnvironmentVariable("PROXY_URI") ?? "",
                    // 🔒 セキュリティ: プロキシ認証情報は環境変数から取得してください
                    // 環境変数名: PROXY_USERNAME, PROXY_PASSWORD
                    // 設定例: setx PROXY_USERNAME "domain\\username"
                    // 設定例: setx PROXY_PASSWORD "your-password"
                    UserName = Environment.GetEnvironmentVariable("PROXY_USERNAME") ?? "",
                    Password = Environment.GetEnvironmentVariable("PROXY_PASSWORD") ?? ""
                }
            };
        }
    }

    /// <summary>
    /// バックエンドAPI設定を保持します。
    /// </summary>
    public class ApiSettings
    {
        /// <summary>
        /// API のベースURL
        /// </summary>
        public string BaseUrl { get; set; } = "http://localhost:3000";

        /// <summary>
        /// タイムアウト秒数
        /// </summary>
        public int Timeout { get; set; } = 30;
    }

    /// <summary>
    /// SQLite の接続設定を保持します。
    /// </summary>
    public class DatabaseSettings
    {
        /// <summary>
        /// データベースファイルのパス
        /// </summary>
        public string Path { get; set; } = @"database\\tsutaai.db";
    }

    /// <summary>
    /// アプリの追加設定を保持します。
    /// </summary>
    public class AppConfig
    {
        /// <summary>
        /// ログ出力レベル
        /// </summary>
        public string LogLevel { get; set; } = "Info";

        /// <summary>
        /// 自動保存機能のオンオフ
        /// </summary>
        public bool AutoSave { get; set; } = true;

        /// <summary>
        /// テーマ名
        /// </summary>
        public string Theme { get; set; } = "Light";

        /// <summary>
        /// 表示言語
        /// </summary>
        public string Language { get; set; } = "ja-JP";
    }

    /// <summary>
    /// プロキシ利用時の設定を保持します。
    /// </summary>
    public class ProxySettings
    {
        /// <summary>
        /// プロキシ経由で通信するかどうか
        /// </summary>
        public bool UseProxy { get; set; } = false;

        /// <summary>
        /// プロキシサーバーのURL
        /// </summary>
        public string ProxyUri { get; set; } = "";

        /// <summary>
        /// プロキシ認証に利用するユーザー名
        /// </summary>
        public string UserName { get; set; } = @"";

        /// <summary>
        /// プロキシ認証に利用するパスワード
        /// </summary>
        public string Password { get; set; } = "";
    }

    /// <summary>
    /// 休暇情報を保持します。
    /// </summary>
    public class VacationInfo
    {
        /// <summary>
        /// 休暇開始日。
        /// </summary>
        public DateTime StartDate { get; set; }

        /// <summary>
        /// 休暇終了日。
        /// </summary>
        public DateTime EndDate { get; set; }
    }

    /// <summary>
    /// バージョン管理システム（Git/SVN）の設定を保持します。
    /// </summary>
    public class VersionControlSettings
    {
        /// <summary>
        /// バージョン管理システムの種類（Git, SVN, None）
        /// </summary>
        public string Type { get; set; } = "Git";

        /// <summary>
        /// リポジトリのURL
        /// </summary>
        public string RepositoryUrl { get; set; } = "";

        /// <summary>
        /// 認証用ユーザー名
        /// </summary>
        public string Username { get; set; } = "";

        /// <summary>
        /// 認証用パスワード（暗号化推奨）
        /// </summary>
        public string Password { get; set; } = "";

        /// <summary>
        /// ローカルリポジトリのパス
        /// </summary>
        public string LocalPath { get; set; } = "";

        /// <summary>
        /// バージョン管理の監視を有効にするか
        /// </summary>
        public bool EnableMonitoring { get; set; } = true;

        /// <summary>
        /// コミット情報を自動的に作業内容として認識するか
        /// </summary>
        public bool AutoRecognizeCommits { get; set; } = true;
    }
}
