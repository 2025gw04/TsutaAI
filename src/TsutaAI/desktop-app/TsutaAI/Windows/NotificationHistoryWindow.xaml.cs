using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    public partial class NotificationHistoryWindow : Window
    {
        private readonly ApiService _apiService;
        private ObservableCollection<Notification> _notifications;

        public NotificationHistoryWindow(ApiService apiService)
        {
            InitializeComponent();
            _apiService = apiService;
            _notifications = new ObservableCollection<Notification>();
            NotificationsItemsControl.ItemsSource = _notifications;
            Loaded += NotificationHistoryWindow_Loaded;
        }

        private async void NotificationHistoryWindow_Loaded(object sender, RoutedEventArgs e)
        {
            await LoadNotifications();
        }

        private async System.Threading.Tasks.Task LoadNotifications()
        {
            try
            {
                if (_apiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                // false = get all notifications, not just unread
                var notifications = await _apiService.GetNotificationsAsync(unreadOnly: false) ?? new List<Notification>();

                _notifications.Clear();
                foreach (var n in notifications)
                {
                    _notifications.Add(n);
                }

                EmptyMessageTextBlock.Visibility = _notifications.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
            }
            catch (Exception ex)
            {
                Alert.Error($"通知の読み込みに失敗しました: {ex.Message}", "エラー");
            }
        }

        private async void MarkAllReadButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Note: ApiService needs a MarkAllAsRead method, or we loop.
                // For now, let's assume we implement it or loop.
                // Ideally, backend should support this.
                // Assuming backend has PUT /notifications/read-all or similar, let's check ApiService.
                // If not, we iterate unread ones.
                await _apiService.MarkAllNotificationsAsReadAsync();
                
                // Refresh list to update UI state properly
                await LoadNotifications();
            }
            catch (Exception ex)
            {
                Alert.Error($"すべて既読にする処理に失敗しました: {ex.Message}", "エラー");
            }
        }

        private async void MarkAsReadButton_Click(object sender, RoutedEventArgs e)
        {
            e.Handled = true;

            if (sender is Button button && button.Tag is Notification notification)
            {
                try
                {
                    await _apiService.MarkNotificationAsReadAsync(notification.Id);
                    notification.IsRead = true;
                    // Trigger refresh or manually force UI update if INotifyPropertyChanged is missing
                    // Simple reload for now to be safe
                    await LoadNotifications();
                }
                catch (Exception ex)
                {
                    Alert.Error($"既読にする処理に失敗しました: {ex.Message}", "エラー");
                }
            }
        }

        private async void MarkAsUnreadButton_Click(object sender, RoutedEventArgs e)
        {
            e.Handled = true;

            if (sender is Button button && button.Tag is Notification notification)
            {
                try
                {
                    await _apiService.MarkNotificationAsUnreadAsync(notification.Id);
                    notification.IsRead = false;
                    await LoadNotifications();
                }
                catch (Exception ex)
                {
                    Alert.Error($"未読に戻す処理に失敗しました: {ex.Message}", "エラー");
                }
            }
        }

        private async void NotificationItem_MouseLeftButtonUp(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (IsClickFromButton(e.OriginalSource as DependencyObject))
            {
                return;
            }

            if (sender is Border border && border.Tag is Notification notification)
            {
                if (notification.RelatedEntityType == "help_request" && notification.RelatedEntityId.HasValue)
                {
                    try
                    {
                        var helpRequest = await _apiService.GetHelpRequestAsync(notification.RelatedEntityId.Value);
                        if (helpRequest != null)
                        {
                            // Show Custom Detail Window
                            var detailWindow = new HelpRequestDetailWindow(notification, helpRequest);
                            detailWindow.Owner = this;
                            detailWindow.ShowDialog();
                            
                            // 既読にする (オプション)
                            if (!notification.IsRead)
                            {
                                await _apiService.MarkNotificationAsReadAsync(notification.Id);
                                notification.IsRead = true;
                                
                                // リスト更新は軽いのであえて再ロードしてもいいが、UIだけ更新する
                                // var border = sender as Border;
                                // if (border != null) { ... }
                                // ここではシンプルに再読み込み
                                await LoadNotifications();
                            }
                        }
                        else
                        {
                            // ヘルプリクエストが見つからない（削除済み）
                            Alert.Info(
                                "このヘルプリクエストは既に削除されています。",
                                "情報");
                            
                            // 既読にして通知を更新
                            if (!notification.IsRead)
                            {
                                await _apiService.MarkNotificationAsReadAsync(notification.Id);
                                await LoadNotifications();
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        // ヘルプリクエストが削除されている場合のエラーハンドリング
                        if (ex.Message.Contains("404") || ex.Message.Contains("見つかりません"))
                        {
                            Alert.Info(
                                "このヘルプリクエストは既に削除されています。",
                                "情報");
                            
                            // 既読にして通知を更新
                            if (!notification.IsRead)
                            {
                                await _apiService.MarkNotificationAsReadAsync(notification.Id);
                                await LoadNotifications();
                            }
                        }
                        else
                        {
                            Alert.Error($"詳細の取得に失敗しました: {ex.Message}", "エラー");
                        }
                    }
                }
                else
                {
                    // 一般的な通知も詳細ウィンドウで表示する
                    var detailWindow = new HelpRequestDetailWindow(notification, null);
                    detailWindow.Owner = this;
                    detailWindow.ShowDialog();

                    if (!notification.IsRead)
                    {
                        await _apiService.MarkNotificationAsReadAsync(notification.Id);
                        notification.IsRead = true;
                        await LoadNotifications();
                    }
                }
            }
        }

        private static bool IsClickFromButton(DependencyObject source)
        {
            var current = source;
            while (current != null)
            {
                if (current is Button)
                {
                    return true;
                }

                current = VisualTreeHelper.GetParent(current);
            }

            return false;
        }
    }
}
