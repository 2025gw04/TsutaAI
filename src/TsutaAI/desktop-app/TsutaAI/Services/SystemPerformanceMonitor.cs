using System;
using System.Diagnostics;
using System.Timers;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// システムパフォーマンス（CPU・メモリ使用率）監視サービス
    /// </summary>
    public class SystemPerformanceMonitor : IDisposable
    {
        private readonly LocalDatabaseService _localDatabaseService;
        private readonly Timer _monitorTimer;
        private readonly PerformanceCounter _cpuCounter;
        private readonly PerformanceCounter _memoryCounter;
        private int _userId;
        private bool _isMonitoring;

        // パフォーマンスメトリクス（1時間分の平均計算用）
        private float _totalCpuUsage;
        private long _totalMemoryUsage;
        private int _sampleCount;

        public SystemPerformanceMonitor(LocalDatabaseService localDatabaseService)
        {
            _localDatabaseService = localDatabaseService;
            _monitorTimer = new Timer(60000); // 1分ごとにサンプリング
            _monitorTimer.Elapsed += OnMonitorTick;

            try
            {
                // CPUカウンター初期化
                _cpuCounter = new PerformanceCounter(
                    "Processor",
                    "% Processor Time",
                    "_Total",
                    true
                );

                // メモリカウンター初期化（使用中の物理メモリ）
                _memoryCounter = new PerformanceCounter(
                    "Memory",
                    "Available MBytes",
                    true
                );

                // 初回呼び出しは0を返すため、事前に1回呼び出す
                _cpuCounter.NextValue();
            }
            catch (Exception ex)
            {
                Logger.Error($"パフォーマンスカウンター初期化エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// 監視を開始します
        /// </summary>
        public void StartMonitoring(int userId)
        {
            if (_isMonitoring)
                return;

            _userId = userId;
            _isMonitoring = true;
            _totalCpuUsage = 0;
            _totalMemoryUsage = 0;
            _sampleCount = 0;

            _monitorTimer.Start();
            Logger.Info("システムパフォーマンス監視を開始しました");
        }

        /// <summary>
        /// 監視を停止します
        /// </summary>
        public void StopMonitoring()
        {
            if (!_isMonitoring)
                return;

            _monitorTimer.Stop();
            _isMonitoring = false;
            Logger.Info("システムパフォーマンス監視を停止しました");
        }

        /// <summary>
        /// 1分ごとのタイマーイベント
        /// </summary>
        private void OnMonitorTick(object sender, ElapsedEventArgs e)
        {
            try
            {
                var (cpuUsage, memoryUsageMB) = GetCurrentPerformance();

                // 累積（1時間平均計算用）
                _totalCpuUsage += cpuUsage;
                _totalMemoryUsage += memoryUsageMB;
                _sampleCount++;

                // データベースに保存（1分ごと）
                SavePerformance(cpuUsage, memoryUsageMB);
            }
            catch (Exception ex)
            {
                Logger.Error($"パフォーマンス監視エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// 現在のCPU・メモリ使用率を取得します
        /// </summary>
        private (float CpuUsage, long MemoryUsageMB) GetCurrentPerformance()
        {
            float cpuUsage = 0;
            long memoryUsageMB = 0;

            try
            {
                if (_cpuCounter != null)
                {
                    cpuUsage = _cpuCounter.NextValue();
                }

                if (_memoryCounter != null)
                {
                    // Available MBytesを取得し、総メモリから引いて使用量を計算
                    float availableMB = _memoryCounter.NextValue();
                    long totalMemoryMB = GetTotalPhysicalMemoryMB();
                    memoryUsageMB = totalMemoryMB - (long)availableMB;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"パフォーマンスカウンター取得エラー: {ex.Message}");
            }

            return (cpuUsage, memoryUsageMB);
        }

        /// <summary>
        /// システムの総物理メモリ（MB）を取得します
        /// </summary>
        private long GetTotalPhysicalMemoryMB()
        {
            // デフォルト値（16GB）を返す
            // 注: より正確な値を取得するには、WMI（System.Management）を使用するか、
            // プロジェクトにMicrosoft.VisualBasic参照を追加してComputerInfoを使用します
            return 16384;
        }

        /// <summary>
        /// パフォーマンスデータをデータベースに保存します
        /// </summary>
        private void SavePerformance(float cpuUsage, long memoryUsageMB)
        {
            try
            {
                var performance = new SystemPerformance
                {
                    UserId = _userId,
                    CpuUsage = cpuUsage,
                    MemoryUsageMB = memoryUsageMB,
                    Timestamp = DateTime.Now
                };

                _localDatabaseService.SaveSystemPerformance(performance);
                Logger.Debug($"パフォーマンス保存: CPU={cpuUsage:F1}%, Memory={memoryUsageMB}MB");
            }
            catch (Exception ex)
            {
                Logger.Error($"パフォーマンス保存エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// 指定時間範囲の平均パフォーマンスを取得します
        /// </summary>
        public (float AvgCpu, long AvgMemory) GetAveragePerformance(DateTime hourStart, DateTime hourEnd)
        {
            try
            {
                var performances = _localDatabaseService.GetSystemPerformances(_userId, hourStart, hourEnd);

                if (performances.Count == 0)
                    return (0, 0);

                float totalCpu = 0;
                long totalMemory = 0;

                foreach (var perf in performances)
                {
                    totalCpu += perf.CpuUsage;
                    totalMemory += perf.MemoryUsageMB;
                }

                float avgCpu = totalCpu / performances.Count;
                long avgMemory = totalMemory / performances.Count;

                return (avgCpu, avgMemory);
            }
            catch (Exception ex)
            {
                Logger.Error($"平均パフォーマンス取得エラー: {ex.Message}");
                return (0, 0);
            }
        }

        /// <summary>
        /// 1時間分の累積データをリセットします（時間単位集計後に呼び出す）
        /// </summary>
        public void ResetHourlyAccumulation()
        {
            _totalCpuUsage = 0;
            _totalMemoryUsage = 0;
            _sampleCount = 0;
        }

        public void Dispose()
        {
            StopMonitoring();
            _monitorTimer?.Dispose();
            _cpuCounter?.Dispose();
            _memoryCounter?.Dispose();
        }
    }
}
