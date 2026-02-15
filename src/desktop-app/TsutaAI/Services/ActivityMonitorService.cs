using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using System.Windows.Threading;

namespace TsutaAI.Services
{
    /// <summary>
    /// ユーザーの作業活動（マウス、キーボード、アクティブウィンドウ）を監視するサービスです。
    /// </summary>
    public class ActivityMonitorService : IDisposable
    {
        #region Win32 API インポート

        /// <summary>
        /// 低レベルマウスフックをインストールします。
        /// </summary>
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

        /// <summary>
        /// 低レベルキーボードフックをインストールします。
        /// </summary>
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        /// <summary>
        /// フックを解除します。
        /// </summary>
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        /// <summary>
        /// 次のフックプロシージャを呼び出します。
        /// </summary>
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        /// <summary>
        /// 現在のモジュールハンドルを取得します。
        /// </summary>
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        /// <summary>
        /// フォアグラウンドウィンドウのハンドルを取得します。
        /// </summary>
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        /// <summary>
        /// ウィンドウのタイトルを取得します。
        /// </summary>
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        /// <summary>
        /// ウィンドウのタイトルの長さを取得します。
        /// </summary>
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        /// <summary>
        /// ウィンドウを所有するプロセスIDを取得します。
        /// </summary>
        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        #endregion

        #region 定数

        private const int WH_MOUSE_LL = 14;
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_MOUSEWHEEL = 0x020A;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;

        #endregion

        #region デリゲート

        private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);
        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        #endregion

        #region フィールド

        private IntPtr _mouseHookID = IntPtr.Zero;
        private IntPtr _keyboardHookID = IntPtr.Zero;
        private LowLevelMouseProc _mouseProc;
        private LowLevelKeyboardProc _keyboardProc;
        private DispatcherTimer _windowCheckTimer;

        // 統計情報
        private int _mouseClickCount = 0;
        private int _mouseWheelCount = 0;
        private int _keyPressCount = 0;
        private string _currentWindowTitle = "";
        private string _currentProcessName = "";
        private DateTime _lastActivityTime = DateTime.Now;

        private bool _isMonitoring = false;

        // 監視制御フラグ
        private bool _monitorMouse = true;
        private bool _monitorKeyboard = true;
        private bool _monitorActiveWindow = true;

        #endregion

        #region イベント

        /// <summary>
        /// アクティブウィンドウが変更されたときに発生します。
        /// </summary>
        public event EventHandler<ActiveWindowChangedEventArgs> ActiveWindowChanged;

        /// <summary>
        /// 活動統計が更新されたときに発生します。
        /// </summary>
        public event EventHandler<ActivityStatsEventArgs> ActivityStatsUpdated;

        #endregion

        #region プロパティ

        /// <summary>
        /// 監視が有効かどうかを取得します。
        /// </summary>
        public bool IsMonitoring => _isMonitoring;

        /// <summary>
        /// 現在のマウスクリック数を取得します。
        /// </summary>
        public int MouseClickCount => _mouseClickCount;

        /// <summary>
        /// 現在のマウスホイール操作数を取得します。
        /// </summary>
        public int MouseWheelCount => _mouseWheelCount;

        /// <summary>
        /// 現在のキー押下数を取得します。
        /// </summary>
        public int KeyPressCount => _keyPressCount;

        /// <summary>
        /// 現在のウィンドウタイトルを取得します。
        /// </summary>
        public string CurrentWindowTitle => _currentWindowTitle;

        /// <summary>
        /// 現在のプロセス名を取得します。
        /// </summary>
        public string CurrentProcessName => _currentProcessName;

        /// <summary>
        /// 最後の活動時刻を取得します。
        /// </summary>
        public DateTime LastActivityTime => _lastActivityTime;

        /// <summary>
        /// マウス監視を有効にするかどうかを取得または設定します。
        /// </summary>
        public bool MonitorMouse
        {
            get => _monitorMouse;
            set
            {
                if (_monitorMouse != value)
                {
                    _monitorMouse = value;
                    UpdateMonitoringState();
                }
            }
        }

        /// <summary>
        /// キーボード監視を有効にするかどうかを取得または設定します。
        /// </summary>
        public bool MonitorKeyboard
        {
            get => _monitorKeyboard;
            set
            {
                if (_monitorKeyboard != value)
                {
                    _monitorKeyboard = value;
                    UpdateMonitoringState();
                }
            }
        }

        /// <summary>
        /// アクティブウィンドウ監視を有効にするかどうかを取得または設定します。
        /// </summary>
        public bool MonitorActiveWindow
        {
            get => _monitorActiveWindow;
            set
            {
                if (_monitorActiveWindow != value)
                {
                    _monitorActiveWindow = value;
                    UpdateMonitoringState();
                }
            }
        }

        #endregion

        #region コンストラクター

        /// <summary>
        /// 新しい ActivityMonitorService を初期化します。
        /// </summary>
        public ActivityMonitorService()
        {
            _mouseProc = MouseHookCallback;
            _keyboardProc = KeyboardHookCallback;

            // ウィンドウチェック用のタイマーを設定（1秒間隔）
            _windowCheckTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _windowCheckTimer.Tick += WindowCheckTimer_Tick;
        }

        #endregion

        #region パブリックメソッド

        /// <summary>
        /// 監視を開始します。
        /// </summary>
        public void Start()
        {
            if (_isMonitoring)
                return;

            if (_monitorMouse)
                _mouseHookID = SetMouseHook(_mouseProc);

            if (_monitorKeyboard)
                _keyboardHookID = SetKeyboardHook(_keyboardProc);

            if (_monitorActiveWindow)
            {
                _windowCheckTimer.Start();
                UpdateActiveWindow();
            }

            _isMonitoring = true;
        }

        /// <summary>
        /// 監視を停止します。
        /// </summary>
        public void Stop()
        {
            if (!_isMonitoring)
                return;

            UnhookWindowsHookEx(_mouseHookID);
            UnhookWindowsHookEx(_keyboardHookID);
            _windowCheckTimer.Stop();
            _isMonitoring = false;
        }

        /// <summary>
        /// 統計情報をリセットします。
        /// </summary>
        public void ResetStats()
        {
            _mouseClickCount = 0;
            _mouseWheelCount = 0;
            _keyPressCount = 0;
            _lastActivityTime = DateTime.Now;
        }

        /// <summary>
        /// 現在の統計情報を取得します。
        /// </summary>
        public ActivityStats GetCurrentStats()
        {
            return new ActivityStats
            {
                MouseClickCount = _mouseClickCount,
                MouseWheelCount = _mouseWheelCount,
                KeyPressCount = _keyPressCount,
                CurrentWindowTitle = _currentWindowTitle,
                CurrentProcessName = _currentProcessName,
                LastActivityTime = _lastActivityTime
            };
        }

        /// <summary>
        /// 時間単位の統計情報を取得します（AI監視機能用）
        /// </summary>
        public HourlyStats GetHourlyStats()
        {
            // アクティブ時間の計算（最後の活動から5分以内は継続中とみなす）
            int totalActiveSeconds = 0;
            var now = DateTime.Now;
            var timeSinceLastActivity = (now - _lastActivityTime).TotalSeconds;

            // 最後の活動が5分以内であれば、その時間をアクティブ時間として計算
            if (timeSinceLastActivity <= 300) // 5分 = 300秒
            {
                // 簡易的な計算: クリック数とキー押下数から推定
                // 平均的に1秒に1回程度の入力があると仮定
                int estimatedActiveSeconds = _mouseClickCount + _keyPressCount + (_mouseWheelCount / 2);
                totalActiveSeconds = Math.Min(estimatedActiveSeconds, 3600); // 最大1時間
            }

            return new HourlyStats
            {
                MouseClicks = _mouseClickCount,
                KeyPresses = _keyPressCount,
                MouseWheelScrolls = _mouseWheelCount,
                TotalActiveSeconds = totalActiveSeconds
            };
        }

        /// <summary>
        /// 時間単位の統計情報をリセットします（AI監視機能用）
        /// </summary>
        public void ResetHourlyStats()
        {
            _mouseClickCount = 0;
            _mouseWheelCount = 0;
            _keyPressCount = 0;
            // lastActivityTimeはリセットしない（継続監視のため）
        }

        /// <summary>
        /// 監視中に設定変更を動的に反映します。
        /// </summary>
        public void UpdateMonitoringState()
        {
            if (!_isMonitoring)
                return;

            // マウス監視の動的切り替え
            if (_monitorMouse && _mouseHookID == IntPtr.Zero)
            {
                _mouseHookID = SetMouseHook(_mouseProc);
            }
            else if (!_monitorMouse && _mouseHookID != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_mouseHookID);
                _mouseHookID = IntPtr.Zero;
            }

            // キーボード監視の動的切り替え
            if (_monitorKeyboard && _keyboardHookID == IntPtr.Zero)
            {
                _keyboardHookID = SetKeyboardHook(_keyboardProc);
            }
            else if (!_monitorKeyboard && _keyboardHookID != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_keyboardHookID);
                _keyboardHookID = IntPtr.Zero;
            }

            // アクティブウィンドウ監視の動的切り替え
            if (_monitorActiveWindow && !_windowCheckTimer.IsEnabled)
            {
                _windowCheckTimer.Start();
                UpdateActiveWindow();
            }
            else if (!_monitorActiveWindow && _windowCheckTimer.IsEnabled)
            {
                _windowCheckTimer.Stop();
            }
        }

        #endregion

        #region プライベートメソッド

        /// <summary>
        /// マウスフックをインストールします。
        /// </summary>
        private IntPtr SetMouseHook(LowLevelMouseProc proc)
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
            {
                return SetWindowsHookEx(WH_MOUSE_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        /// <summary>
        /// キーボードフックをインストールします。
        /// </summary>
        private IntPtr SetKeyboardHook(LowLevelKeyboardProc proc)
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
            {
                return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        /// <summary>
        /// マウスイベントのコールバック処理です。
        /// </summary>
        private IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int message = wParam.ToInt32();

                if (message == WM_LBUTTONDOWN || message == WM_RBUTTONDOWN)
                {
                    _mouseClickCount++;
                    _lastActivityTime = DateTime.Now;
                    RaiseActivityStatsUpdated();
                }
                else if (message == WM_MOUSEWHEEL)
                {
                    _mouseWheelCount++;
                    _lastActivityTime = DateTime.Now;
                    RaiseActivityStatsUpdated();
                }
            }

            return CallNextHookEx(_mouseHookID, nCode, wParam, lParam);
        }

        /// <summary>
        /// キーボードイベントのコールバック処理です。
        /// </summary>
        private IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int message = wParam.ToInt32();

                if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN)
                {
                    _keyPressCount++;
                    _lastActivityTime = DateTime.Now;
                    RaiseActivityStatsUpdated();
                }
            }

            return CallNextHookEx(_keyboardHookID, nCode, wParam, lParam);
        }

        /// <summary>
        /// ウィンドウチェックタイマーのTickイベントハンドラーです。
        /// </summary>
        private void WindowCheckTimer_Tick(object sender, EventArgs e)
        {
            UpdateActiveWindow();
        }

        /// <summary>
        /// アクティブウィンドウの情報を更新します。
        /// </summary>
        private void UpdateActiveWindow()
        {
            IntPtr hWnd = GetForegroundWindow();
            if (hWnd == IntPtr.Zero)
                return;

            // ウィンドウタイトルを取得
            int length = GetWindowTextLength(hWnd);
            if (length == 0)
                return;

            StringBuilder sb = new StringBuilder(length + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string windowTitle = sb.ToString();

            // プロセス名を取得
            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);
            string processName = "";

            try
            {
                Process process = Process.GetProcessById((int)processId);
                processName = process.ProcessName;
            }
            catch
            {
                processName = "Unknown";
            }

            // 変更があった場合のみイベントを発生
            if (_currentWindowTitle != windowTitle || _currentProcessName != processName)
            {
                _currentWindowTitle = windowTitle;
                _currentProcessName = processName;
                RaiseActiveWindowChanged();
            }
        }

        /// <summary>
        /// ActiveWindowChanged イベントを発生させます。
        /// </summary>
        private void RaiseActiveWindowChanged()
        {
            ActiveWindowChanged?.Invoke(this, new ActiveWindowChangedEventArgs
            {
                WindowTitle = _currentWindowTitle,
                ProcessName = _currentProcessName,
                Timestamp = DateTime.Now
            });
        }

        /// <summary>
        /// ActivityStatsUpdated イベントを発生させます。
        /// </summary>
        private void RaiseActivityStatsUpdated()
        {
            ActivityStatsUpdated?.Invoke(this, new ActivityStatsEventArgs
            {
                Stats = GetCurrentStats()
            });
        }

        #endregion

        #region IDisposable 実装

        /// <summary>
        /// リソースを解放します。
        /// </summary>
        public void Dispose()
        {
            Stop();
            _windowCheckTimer?.Stop();
        }

        #endregion
    }

    #region イベント引数クラス

    /// <summary>
    /// アクティブウィンドウ変更イベントの引数です。
    /// </summary>
    public class ActiveWindowChangedEventArgs : EventArgs
    {
        /// <summary>
        /// ウィンドウタイトルを取得または設定します。
        /// </summary>
        public string WindowTitle { get; set; }

        /// <summary>
        /// プロセス名を取得または設定します。
        /// </summary>
        public string ProcessName { get; set; }

        /// <summary>
        /// タイムスタンプを取得または設定します。
        /// </summary>
        public DateTime Timestamp { get; set; }
    }

    /// <summary>
    /// 活動統計更新イベントの引数です。
    /// </summary>
    public class ActivityStatsEventArgs : EventArgs
    {
        /// <summary>
        /// 統計情報を取得または設定します。
        /// </summary>
        public ActivityStats Stats { get; set; }
    }

    /// <summary>
    /// 活動統計情報を表すクラスです。
    /// </summary>
    public class ActivityStats
    {
        /// <summary>
        /// マウスクリック数を取得または設定します。
        /// </summary>
        public int MouseClickCount { get; set; }

        /// <summary>
        /// マウスホイール操作数を取得または設定します。
        /// </summary>
        public int MouseWheelCount { get; set; }

        /// <summary>
        /// キー押下数を取得または設定します。
        /// </summary>
        public int KeyPressCount { get; set; }

        /// <summary>
        /// 現在のウィンドウタイトルを取得または設定します。
        /// </summary>
        public string CurrentWindowTitle { get; set; }

        /// <summary>
        /// 現在のプロセス名を取得または設定します。
        /// </summary>
        public string CurrentProcessName { get; set; }

        /// <summary>
        /// 最後の活動時刻を取得または設定します。
        /// </summary>
        public DateTime LastActivityTime { get; set; }
    }

    /// <summary>
    /// 時間単位の活動統計情報を表すクラスです（AI監視機能用）
    /// </summary>
    public class HourlyStats
    {
        /// <summary>
        /// マウスクリック数を取得または設定します。
        /// </summary>
        public int MouseClicks { get; set; }

        /// <summary>
        /// キー押下数を取得または設定します。
        /// </summary>
        public int KeyPresses { get; set; }

        /// <summary>
        /// マウスホイール操作数を取得または設定します。
        /// </summary>
        public int MouseWheelScrolls { get; set; }

        /// <summary>
        /// 合計アクティブ秒数を取得または設定します。
        /// </summary>
        public int TotalActiveSeconds { get; set; }
    }

    #endregion
}
