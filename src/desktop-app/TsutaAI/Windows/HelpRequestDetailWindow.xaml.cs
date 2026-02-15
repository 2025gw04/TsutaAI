using System;
using System.Windows;
using System.Windows.Media;
using TsutaAI.Models;

namespace TsutaAI.Windows
{
    /// <summary>
    /// Notifications and Help Request Details Window
    /// </summary>
    public partial class HelpRequestDetailWindow : Window
    {
        private Notification _notification;
        private HelpRequest _helpRequest;

        public HelpRequestDetailWindow(Notification notification, HelpRequest helpRequest = null)
        {
            InitializeComponent();
            _notification = notification;
            _helpRequest = helpRequest;
            
            LoadData();
        }

        private void LoadData()
        {
            if (_notification == null) return;

            // Basic Info
            NotificationTitleText.Text = _notification.Title;
            NotificationDateText.Text = _notification.CreatedAt.ToString("yyyy/MM/dd HH:mm");
            MessageText.Text = _notification.Message;

            // Help Request Details
            if (_helpRequest != null)
            {
                // Override title if help request title exists
                NotificationTitleText.Text = _helpRequest.RequestTitle ?? _notification.Title;

                // Show Badge
                if (!string.IsNullOrEmpty(_helpRequest.Urgency))
                {
                    UrgencyBadge.Visibility = Visibility.Visible;
                    UrgencyText.Text = _helpRequest.Urgency.ToUpper();

                    // Color based on urgency
                    if (_helpRequest.Urgency.ToLower() == "critical")
                        UrgencyBadge.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#D32F2F")); // Red
                    else if (_helpRequest.Urgency.ToLower() == "high")
                        UrgencyBadge.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F57C00")); // Orange
                    else if (_helpRequest.Urgency.ToLower() == "medium")
                        UrgencyBadge.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1976D2")); // Blue
                    else
                        UrgencyBadge.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#757575")); // Grey
                }

                // Show Details Panel
                HelpRequestDetailsPanel.Visibility = Visibility.Visible;
                DescriptionText.Text = _helpRequest.RequestDescription ?? "（説明なし）";
                
                AiAnalysisText.Text = !string.IsNullOrEmpty(_helpRequest.AiContextSummary) 
                    ? _helpRequest.AiContextSummary 
                    : "（AIによる分析データはありません）";
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }
    }
}
