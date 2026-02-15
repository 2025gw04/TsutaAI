using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// プロジェクト管理ウィンドウ
    /// </summary>
    public partial class ProjectManagementWindow : Window
    {
        private List<Project> _projects;

        public ProjectManagementWindow()
        {
            InitializeComponent();

            // 権限チェック: manager または admin のみプロジェクト作成可能
            CreateProjectButton.IsEnabled = PermissionManager.CanManageProjects(App.CurrentUser);

            // プロジェクト一覧読み込み
            Loaded += async (s, e) => await LoadProjectsAsync();
        }

        /// <summary>
        /// プロジェクト一覧を読み込みます
        /// </summary>
        private async Task LoadProjectsAsync()
        {
            try
            {
                LoadingText.Visibility = Visibility.Visible;
                NoProjectsText.Visibility = Visibility.Collapsed;
                ProjectsList.Visibility = Visibility.Collapsed;
                StatusText.Text = "プロジェクトを読み込み中...";

                Logger.Info("プロジェクト一覧読み込み開始");

                _projects = await App.ApiService.GetProjectsAsync();

                LoadingText.Visibility = Visibility.Collapsed;

                if (_projects == null || _projects.Count == 0)
                {
                    NoProjectsText.Visibility = Visibility.Visible;
                    ProjectCountText.Text = "0件のプロジェクト";
                    StatusText.Text = "プロジェクトがありません";
                    Logger.Info("プロジェクトが見つかりませんでした");
                }
                else
                {
                    // ステータス順・作成日順にソート
                    _projects = _projects
                        .OrderBy(p => GetStatusPriority(p.Status))
                        .ThenByDescending(p => p.CreatedAt)
                        .ToList();

                    ProjectsList.ItemsSource = _projects;
                    ProjectsList.Visibility = Visibility.Visible;

                    ProjectCountText.Text = $"{_projects.Count}件のプロジェクト";
                    StatusText.Text = $"✓ プロジェクト読み込み完了: {_projects.Count}件";

                    Logger.Info($"プロジェクト読み込み完了: {_projects.Count}件");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト読み込みエラー: {ex.Message}");
                LoadingText.Text = $"エラー: {ex.Message}";
                LoadingText.Foreground = Brushes.Red;
                StatusText.Text = "エラー: プロジェクト読み込み失敗";

                Alert.Error(
                    $"プロジェクト一覧の読み込みに失敗しました。\n{ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// ステータスの優先順位を取得（表示順制御用）
        /// </summary>
        private int GetStatusPriority(string status)
        {
            switch (status)
            {
                case "active": return 1;
                case "planning": return 2;
                case "completed": return 3;
                case "cancelled": return 4;
                default: return 5;
            }
        }

        /// <summary>
        /// 新規プロジェクト作成ボタンクリック
        /// </summary>
        private async void CreateProjectButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dialog = new ProjectEditDialog(null);
                dialog.Owner = this;
                var result = dialog.ShowDialog();

                if (result == true)
                {
                    // プロジェクト一覧を再読み込み
                    await LoadProjectsAsync();
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト作成ダイアログエラー: {ex.Message}");
                Alert.Error(
                    $"エラーが発生しました。\n{ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// プロジェクト編集ボタンクリック
        /// </summary>
        private async void EditProjectButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var button = sender as Button;
                var project = button?.Tag as Project;

                if (project == null)
                {
                    Logger.Warn("プロジェクト編集: プロジェクトが見つかりません");
                    return;
                }

                // 権限チェック
                if (!PermissionManager.CanManageProjects(App.CurrentUser))
                {
                    Alert.Warn(
                        "プロジェクトを編集する権限がありません。\nmanager または admin 権限が必要です。",
                        "権限エラー");
                    return;
                }

                var dialog = new ProjectEditDialog(project);
                dialog.Owner = this;
                var result = dialog.ShowDialog();

                if (result == true)
                {
                    // プロジェクト一覧を再読み込み
                    await LoadProjectsAsync();
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト編集エラー: {ex.Message}");
                Alert.Error(
                    $"エラーが発生しました。\n{ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// プロジェクト削除ボタンクリック
        /// </summary>
        private async void DeleteProjectButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var button = sender as Button;
                var project = button?.Tag as Project;

                if (project == null)
                {
                    Logger.Warn("プロジェクト削除: プロジェクトが見つかりません");
                    return;
                }

                // 権限チェック: admin のみ削除可能
                if (!PermissionManager.CanManageUsers(App.CurrentUser))
                {
                    Alert.Warn(
                        "プロジェクトを削除する権限がありません。\nadmin 権限が必要です。",
                        "権限エラー");
                    return;
                }

                if (Alert.Confirm(
                    $"プロジェクト「{project.Name}」を削除しますか？\n\nこの操作は取り消せません。",
                    "プロジェクト削除の確認"))
                {
                    Logger.Info($"プロジェクト削除開始: ID={project.Id}, Name={project.Name}");
                    StatusText.Text = "プロジェクトを削除中...";

                    var success = await App.ApiService.DeleteProjectAsync(project.Id);

                    if (success)
                    {
                        Logger.Info("プロジェクト削除成功");
                        Alert.Success(
                            "プロジェクトを削除しました。",
                            "成功");

                        // プロジェクト一覧を再読み込み
                        await LoadProjectsAsync();
                    }
                    else
                    {
                        Logger.Error("プロジェクト削除失敗");
                        StatusText.Text = "エラー: プロジェクト削除失敗";
                        Alert.Error(
                            "プロジェクトの削除に失敗しました。",
                            "エラー");
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト削除エラー: {ex.Message}");
                StatusText.Text = "エラー: プロジェクト削除失敗";
                Alert.Error(
                    $"プロジェクト削除エラー: {ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// メンバー管理ボタンクリック
        /// </summary>
        private void ManageMembersButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var button = sender as Button;
                var project = button?.Tag as Project;

                if (project == null)
                {
                    Logger.Warn("メンバー管理: プロジェクトが見つかりません");
                    return;
                }

                var dialog = new ProjectMemberManagementDialog(project);
                dialog.Owner = this;
                dialog.ShowDialog();
            }
            catch (Exception ex)
            {
                Logger.Error($"メンバー管理ダイアログエラー: {ex.Message}");
                Alert.Error(
                    $"エラーが発生しました。\n{ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// 更新ボタンクリック
        /// </summary>
        private async void RefreshButton_Click(object sender, RoutedEventArgs e)
        {
            await LoadProjectsAsync();
        }

        /// <summary>
        /// プロジェクトカードにマウスが入ったとき
        /// </summary>
        private void ProjectCard_MouseEnter(object sender, MouseEventArgs e)
        {
            var border = sender as Border;
            if (border != null)
            {
                border.Background = new SolidColorBrush(Color.FromRgb(248, 249, 250));
            }
        }

        /// <summary>
        /// プロジェクトカードからマウスが出たとき
        /// </summary>
        private void ProjectCard_MouseLeave(object sender, MouseEventArgs e)
        {
            var border = sender as Border;
            if (border != null)
            {
                border.Background = Brushes.White;
            }
        }
    }

    #region コンバーター

    /// <summary>
    /// プロジェクトステータスを色に変換
    /// </summary>
    public class ProjectStatusToBrushConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            var status = value as string;
            switch (status)
            {
                case "active":
                    return new SolidColorBrush(Color.FromRgb(40, 167, 69)); // 緑
                case "planning":
                    return new SolidColorBrush(Color.FromRgb(0, 123, 255)); // 青
                case "completed":
                    return new SolidColorBrush(Color.FromRgb(108, 117, 125)); // グレー
                case "cancelled":
                    return new SolidColorBrush(Color.FromRgb(220, 53, 69)); // 赤
                default:
                    return new SolidColorBrush(Color.FromRgb(108, 117, 125)); // グレー
            }
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    /// <summary>
    /// プロジェクトステータスを表示名に変換
    /// </summary>
    public class ProjectStatusToDisplayConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            var status = value as string;
            switch (status)
            {
                case "planning":
                    return "計画中";
                case "active":
                    return "進行中";
                case "completed":
                    return "完了";
                case "cancelled":
                    return "中止";
                default:
                    return status;
            }
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    /// <summary>
    /// Null を Visibility に変換
    /// </summary>
    public class NullToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value == null ? Visibility.Collapsed : Visibility.Visible;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    #endregion
}
