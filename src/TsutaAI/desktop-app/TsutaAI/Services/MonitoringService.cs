using System;
using System.Timers;

namespace TsutaAI.Services
{
    /// <summary>
    /// タスクの作業時間を計測し通知するサービスです。
    /// </summary>
    public class MonitoringService : IDisposable
    {
        /// <summary>
        /// 経過時間を測定するタイマーです。
        /// </summary>
        private readonly Timer _timer;

        /// <summary>
        /// 計測開始時刻です。
        /// </summary>
        private DateTime _startTime;

        /// <summary>
        /// タイマー更新時に呼び出されるコールバックです。
        /// </summary>
        private readonly Action<TimeSpan> _tickAction;

        /// <summary>
        /// 新しい MonitoringService を初期化します。
        /// </summary>
        /// <param name="tickAction">タイマー更新時の処理</param>
        public MonitoringService(Action<TimeSpan> tickAction)
        {
            _tickAction = tickAction;
            _timer = new Timer(1000);
            _timer.Elapsed += OnTimerElapsed;
        }

        /// <summary>
        /// 計測を開始します。
        /// </summary>
        public void Start()
        {
            _startTime = DateTime.Now;
            _timer.Start();
        }

        /// <summary>
        /// 計測を停止します。
        /// </summary>
        public TimeSpan Stop()
        {
            _timer.Stop();
            return DateTime.Now - _startTime;
        }

        /// <summary>
        /// タイマーイベントです。
        /// </summary>
        private void OnTimerElapsed(object sender, ElapsedEventArgs e)
        {
            TimeSpan duration = e.SignalTime - _startTime;
            _tickAction?.Invoke(duration);
        }

        /// <summary>
        /// リソースを解放します。
        /// </summary>
        public void Dispose()
        {
            _timer.Dispose();
        }
    }
}
