using System;
using System.Collections.Generic;
using System.Linq;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// ウィンドウ使用時間のトラッキングサービス
    /// </summary>
    public class WindowSessionTracker
    {
        private readonly LocalDatabaseService _localDatabaseService;
        private ActivitySession _currentSession;
        private readonly List<ActivitySession> _completedSessions;

        public WindowSessionTracker(LocalDatabaseService localDatabaseService)
        {
            _localDatabaseService = localDatabaseService;
            _completedSessions = new List<ActivitySession>();
        }

        /// <summary>
        /// ウィンドウが変更されたときに呼び出されます
        /// </summary>
        public void OnWindowChanged(int userId, string windowTitle, string processName)
        {
            if (_currentSession != null)
            {
                // 同じウィンドウなら何もしない
                if (_currentSession.WindowTitle == windowTitle &&
                    _currentSession.ProcessName == processName)
                {
                    return;
                }

                // 現在のセッションを終了
                EndCurrentSession();
            }

            // 新しいセッションを開始
            _currentSession = new ActivitySession
            {
                UserId = userId,
                WindowTitle = windowTitle,
                ProcessName = processName,
                StartTime = DateTime.Now,
                EndTime = null,
                DurationSeconds = 0,
                CreatedAt = DateTime.Now
            };
        }

        /// <summary>
        /// 現在のセッションを終了します
        /// </summary>
        public void EndCurrentSession()
        {
            if (_currentSession == null)
                return;

            _currentSession.EndTime = DateTime.Now;
            _currentSession.DurationSeconds = (int)(_currentSession.EndTime.Value - _currentSession.StartTime).TotalSeconds;

            // セッションが1秒未満の場合は無視
            if (_currentSession.DurationSeconds >= 1)
            {
                _completedSessions.Add(_currentSession);
                SaveSession(_currentSession);
            }

            _currentSession = null;
        }

        /// <summary>
        /// セッションをデータベースに保存します
        /// </summary>
        private void SaveSession(ActivitySession session)
        {
            try
            {
                _localDatabaseService.SaveActivitySession(session);
                Logger.Info($"セッション保存: {session.WindowTitle} ({session.DurationSeconds}秒)");
            }
            catch (Exception ex)
            {
                Logger.Error($"セッション保存エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// 時間単位の集計を取得します（トップ5ウィンドウ）
        /// </summary>
        public List<WindowUsageInfo> GetHourlySummary(DateTime hourStart, DateTime hourEnd)
        {
            try
            {
                var sessions = _localDatabaseService.GetActivitySessions(
                    _currentSession?.UserId ?? 0,
                    hourStart,
                    hourEnd
                );

                // 進行中のセッションも含める
                if (_currentSession != null)
                {
                    var tempSession = new ActivitySession
                    {
                        UserId = _currentSession.UserId,
                        WindowTitle = _currentSession.WindowTitle,
                        ProcessName = _currentSession.ProcessName,
                        StartTime = _currentSession.StartTime,
                        EndTime = DateTime.Now,
                        DurationSeconds = (int)(DateTime.Now - _currentSession.StartTime).TotalSeconds
                    };
                    sessions.Add(tempSession);
                }

                // ウィンドウごとに集計してトップ5を返す
                var grouped = sessions
                    .GroupBy(s => new { s.WindowTitle, s.ProcessName })
                    .Select(g => new WindowUsageInfo
                    {
                        WindowTitle = g.Key.WindowTitle,
                        ProcessName = g.Key.ProcessName,
                        DurationSeconds = g.Sum(s => s.DurationSeconds)
                    })
                    .OrderByDescending(w => w.DurationSeconds)
                    .Take(5)
                    .ToList();

                return grouped;
            }
            catch (Exception ex)
            {
                Logger.Error($"時間単位集計エラー: {ex.Message}");
                return new List<WindowUsageInfo>();
            }
        }

        /// <summary>
        /// 完了したセッションをクリアします
        /// </summary>
        public void ClearCompletedSessions()
        {
            _completedSessions.Clear();
        }
    }
}
