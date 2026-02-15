using System;
using System.Net;
using System.Net.Http;
using TsutaAI.Config;

namespace TsutaAI.Utils
{
    /// <summary>
    /// プロキシ設定から HttpClientHandler を生成するヘルパークラスです。
    /// </summary>
    public static class ProxyHelper
    {
        /// <summary>
        /// プロキシ設定に基づいて HttpClientHandler を生成します。
        /// </summary>
        /// <param name="proxySettings">使用するプロキシ設定</param>
        /// <returns>生成した HttpClientHandler。プロキシ未使用の場合は null。</returns>
        public static HttpClientHandler CreateHandler(ProxySettings proxySettings)
        {
            if (proxySettings == null || !proxySettings.UseProxy || string.IsNullOrWhiteSpace(proxySettings.ProxyUri))
            {
                return null;
            }

            var proxy = new WebProxy(proxySettings.ProxyUri, false);

            if (!string.IsNullOrWhiteSpace(proxySettings.UserName))
            {
                proxy.Credentials = CreateCredentials(proxySettings.UserName, proxySettings.Password);
            }

            var handler = new HttpClientHandler
            {
                Proxy = proxy,
                UseProxy = true,
                PreAuthenticate = true
            };

            if (proxy.Credentials != null)
            {
                handler.Credentials = proxy.Credentials;
                handler.UseDefaultCredentials = false;
            }

            return handler;
        }

        /// <summary>
        /// ユーザー名から適切な NetworkCredential を生成します。
        /// </summary>
        /// <param name="userName">プロキシユーザー名（ドメイン\\ユーザー形式可）</param>
        /// <param name="password">パスワード</param>
        /// <returns>生成した資格情報</returns>
        private static NetworkCredential CreateCredentials(string userName, string password)
        {
            if (userName.Contains("\\"))
            {
                var parts = userName.Split(new[] { '\\' }, 2);
                string domain = parts[0];
                string user = parts.Length > 1 ? parts[1] : string.Empty;
                return new NetworkCredential(user, password ?? string.Empty, domain);
            }

            return new NetworkCredential(userName, password ?? string.Empty);
        }
    }
}
