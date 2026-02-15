using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// プロジェクトメンバー管理ダイアログ
    /// </summary>
    public partial class ProjectMemberManagementDialog : Window
    {
        private readonly Project _project;
        private List<MemberViewModel> _members;
        private List<User> _availableUsers;
        private bool _hasChanges = false;

        public ProjectMemberManagementDialog(Project project)
        {
            InitializeComponent();

            _project = project ?? throw new ArgumentNullException(nameof(project));
            _members = new List<MemberViewModel>();

            // プロジェクト名を表示
            ProjectNameText.Text = _project.Name;

            // メンバー一覧を読み込み
            Loaded += async (s, e) =>
            {
                await LoadAvailableUsersAsync();
                await LoadMembersAsync();
            };
        }

        /// <summary>
        /// 利用可能なユーザー一覧を読み込む
        /// </summary>
        private async Task LoadAvailableUsersAsync()
        {
            try
            {
                _availableUsers = await App.ApiService.GetUsersAsync();
                Logger.Info($"利用可能ユーザー読み込み完了: {_availableUsers.Count}件");
            }
            catch (Exception ex)
            {
                Logger.Error($"ユーザー一覧読み込みエラー: {ex.Message}");
                _availableUsers = new List<User>();
            }
        }

        /// <summary>
        /// メンバー一覧を読み込む
        /// </summary>
        private async Task LoadMembersAsync()
        {
            try
            {
                LoadingText.Visibility = Visibility.Visible;
                NoMembersText.Visibility = Visibility.Collapsed;
                MembersList.Visibility = Visibility.Collapsed;

                Logger.Info($"プロジェクトメンバー読み込み開始: ProjectId={_project.Id}");

                var projectMembers = await App.ApiService.GetProjectMembersAsync(_project.Id);

                LoadingText.Visibility = Visibility.Collapsed;

                if (projectMembers == null || projectMembers.Count == 0)
                {
                    NoMembersText.Visibility = Visibility.Visible;
                    MemberCountText.Text = "0人のメンバー";
                    Logger.Info("メンバーが見つかりませんでした");
                }
                else
                {
                    // ViewModelに変換
                    _members = projectMembers.Select(pm => new MemberViewModel(pm)).ToList();

                    MembersList.ItemsSource = _members;
                    MembersList.Visibility = Visibility.Visible;
                    MemberCountText.Text = $"{_members.Count}人のメンバー";

                    Logger.Info($"メンバー読み込み完了: {_members.Count}件");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"メンバー読み込みエラー: {ex.Message}");
                LoadingText.Text = $"エラー: {ex.Message}";
                LoadingText.Foreground = System.Windows.Media.Brushes.Red;

                Alert.Error(
                    $"メンバー一覧の読み込みに失敗しました。\n{ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// メンバー追加ボタンクリック
        /// </summary>
        private void AddMemberButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (_availableUsers == null || _availableUsers.Count == 0)
                {
                    Alert.Info(
                        "追加可能なユーザーがいません。",
                        "情報");
                    return;
                }

                // 既存メンバーのユーザーIDリスト
                var existingUserIds = _members.Select(m => m.UserId).ToList();

                // 追加可能なユーザー（まだメンバーでないユーザー）
                var availableToAdd = _availableUsers
                    .Where(u => !existingUserIds.Contains(u.Id))
                    .ToList();

                if (availableToAdd.Count == 0)
                {
                    Alert.Info(
                        "全てのユーザーが既にメンバーです。",
                        "情報");
                    return;
                }

                // ユーザー選択ダイアログを表示
                var dialog = new SelectUserDialog(availableToAdd);
                dialog.Owner = this;
                var result = dialog.ShowDialog();

                if (result == true && dialog.SelectedUser != null)
                {
                    // 新しいメンバーを追加
                    var newMember = new ProjectMember
                    {
                        ProjectId = _project.Id,
                        UserId = dialog.SelectedUser.Id,
                        Role = "member", // デフォルトはメンバー
                        User = dialog.SelectedUser
                    };

                    var viewModel = new MemberViewModel(newMember);
                    _members.Add(viewModel);

                    // UIを更新
                    MembersList.ItemsSource = null;
                    MembersList.ItemsSource = _members;
                    MemberCountText.Text = $"{_members.Count}人のメンバー";

                    NoMembersText.Visibility = Visibility.Collapsed;
                    MembersList.Visibility = Visibility.Visible;

                    _hasChanges = true;

                    Logger.Info($"メンバー追加: UserId={newMember.UserId}, Role={newMember.Role}");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"メンバー追加エラー: {ex.Message}");
                Alert.Error(
                    $"メンバー追加エラー: {ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// ロール変更
        /// </summary>
        private void RoleComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            try
            {
                var comboBox = sender as ComboBox;
                var member = comboBox?.Tag as MemberViewModel;

                if (member == null)
                {
                    return;
                }

                var selectedItem = comboBox.SelectedItem as ComboBoxItem;
                if (selectedItem != null)
                {
                    var newRole = selectedItem.Tag as string;
                    if (newRole != null && newRole != member.Role)
                    {
                        member.Role = newRole;
                        _hasChanges = true;
                        Logger.Info($"ロール変更: UserId={member.UserId}, NewRole={newRole}");
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"ロール変更エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// メンバー削除ボタンクリック
        /// </summary>
        private void RemoveMemberButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var button = sender as Button;
                var member = button?.Tag as MemberViewModel;

                if (member == null)
                {
                    return;
                }

                // オーナーが1人しかいない場合は削除不可
                var owners = _members.Where(m => m.Role == "owner").ToList();
                if (member.Role == "owner" && owners.Count <= 1)
                {
                    Alert.Warn(
                        "プロジェクトには少なくとも1人のオーナーが必要です。",
                        "削除不可");
                    return;
                }

                if (Alert.Confirm(
                    $"{member.UserName} をプロジェクトから削除しますか？",
                    "メンバー削除の確認"))
                {
                    _members.Remove(member);

                    // UIを更新
                    MembersList.ItemsSource = null;
                    MembersList.ItemsSource = _members;
                    MemberCountText.Text = $"{_members.Count}人のメンバー";

                    if (_members.Count == 0)
                    {
                        NoMembersText.Visibility = Visibility.Visible;
                        MembersList.Visibility = Visibility.Collapsed;
                    }

                    _hasChanges = true;

                    Logger.Info($"メンバー削除: UserId={member.UserId}");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"メンバー削除エラー: {ex.Message}");
                Alert.Error(
                    $"メンバー削除エラー: {ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// 保存ボタンクリック
        /// </summary>
        private async void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            if (!_hasChanges)
            {
                Alert.Info(
                    "変更がありません。",
                    "情報");
                return;
            }

            try
            {
                SaveButton.IsEnabled = false;

                // オーナーが最低1人いるか確認
                var owners = _members.Where(m => m.Role == "owner").ToList();
                if (owners.Count == 0)
                {
                    Alert.Warn(
                        "プロジェクトには少なくとも1人のオーナーが必要です。",
                        "保存エラー");
                    SaveButton.IsEnabled = true;
                    return;
                }

                Logger.Info($"メンバー保存開始: ProjectId={_project.Id}, Count={_members.Count}");

                // ViewModelからProjectMemberに変換
                var projectMembers = _members.Select(m => m.ToProjectMember()).ToList();

                var success = await App.ApiService.UpdateProjectMembersAsync(_project.Id, projectMembers);

                if (success)
                {
                    Logger.Info("メンバー保存成功");
                    Alert.Success(
                        "メンバーを保存しました。",
                        "成功");

                    _hasChanges = false;
                }
                else
                {
                    Logger.Error("メンバー保存失敗");
                    Alert.Error(
                        "メンバーの保存に失敗しました。",
                        "エラー");
                }

                SaveButton.IsEnabled = true;
            }
            catch (Exception ex)
            {
                Logger.Error($"メンバー保存エラー: {ex.Message}");
                Alert.Error(
                    $"メンバー保存エラー: {ex.Message}",
                    "エラー");

                SaveButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// 閉じるボタンクリック
        /// </summary>
        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            if (_hasChanges)
            {
                if (!Alert.Confirm(
                    "保存していない変更があります。保存せずに閉じますか？",
                    "確認"))
                {
                    return;
                }
            }

            Close();
        }
    }

    /// <summary>
    /// メンバー表示用ViewModel
    /// </summary>
    public class MemberViewModel : INotifyPropertyChanged
    {
        private string _role;

        public int UserId { get; set; }
        public string UserName { get; set; }
        public string FullName { get; set; }
        public string UserEmail { get; set; }

        public string Role
        {
            get => _role;
            set
            {
                if (_role != value)
                {
                    _role = value;
                    OnPropertyChanged(nameof(Role));
                    OnPropertyChanged(nameof(RoleIndex));
                }
            }
        }

        public int RoleIndex
        {
            get
            {
                switch (Role)
                {
                    case "owner": return 0;
                    case "member": return 1;
                    case "viewer": return 2;
                    default: return 1;
                }
            }
        }

        public string UserInitial
        {
            get
            {
                if (string.IsNullOrEmpty(UserName))
                {
                    return "?";
                }
                return UserName.Substring(0, 1).ToUpper();
            }
        }

        public MemberViewModel(ProjectMember member)
        {
            UserId = member.UserId;
            UserName = member.User?.Username ?? "Unknown";
            FullName = member.User?.FullName ?? string.Empty;
            UserEmail = member.User?.Email ?? string.Empty;
            Role = member.Role ?? "member";
        }

        public ProjectMember ToProjectMember()
        {
            return new ProjectMember
            {
                UserId = UserId,
                Role = Role,
                User = new User
                {
                    Id = UserId,
                    Username = UserName,
                    FullName = FullName,
                    Email = UserEmail
                }
            };
        }

        public event PropertyChangedEventHandler PropertyChanged;

        protected virtual void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}
