using System;
using System.IO;

namespace TsutaAI.Utils
{
    /// <summary>
    /// 共通的に利用するユーティリティメソッドをまとめたクラスです。
    /// </summary>
    public static class Common
    {
        /// <summary>
        /// ローカルデータ保存用のルートディレクトリを返します。
        /// </summary>
        /// <returns>ユーザープロファイル配下の TsutaAI ディレクトリ</returns>
        public static string GetLocalRoot()
        {
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TsutaAI");
            EnsureDirectory(root);
            return root;
        }

        /// <summary>
        /// ログファイルを格納するディレクトリを返します。
        /// </summary>
        /// <returns>ログディレクトリのパス</returns>
        public static string GetLogDirectory()
        {
            string logDir = Path.Combine(GetLocalRoot(), "Logs");
            EnsureDirectory(logDir);
            return logDir;
        }

        /// <summary>
        /// 一時ファイルを格納するディレクトリを返します。
        /// </summary>
        /// <returns>一時ファイル用のディレクトリ</returns>
        public static string GetTempDirectory()
        {
            string tempDir = Path.Combine(GetLocalRoot(), "Temp");
            EnsureDirectory(tempDir);
            return tempDir;
        }

        /// <summary>
        /// 指定したディレクトリが存在しない場合に作成します。
        /// </summary>
        /// <param name="directoryPath">確認するディレクトリのパス</param>
        public static void EnsureDirectory(string directoryPath)
        {
            if (!Directory.Exists(directoryPath))
            {
                Directory.CreateDirectory(directoryPath);
            }
        }
    }
}
