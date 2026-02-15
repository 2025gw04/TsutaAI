using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// ユーザー選択ダイアログ
    /// </summary>
    public partial class SelectUserDialog : Window
    {
        private readonly List<User> _allUsers;
        private List<UserViewModel> _filteredUsers;

        public User SelectedUser { get; private set; }

        public SelectUserDialog(List<User> availableUsers)
        {
            InitializeComponent();

            _allUsers = availableUsers ?? new List<User>();
            _filteredUsers = _allUsers.Select(u => new UserViewModel(u)).ToList();

            UsersList.ItemsSource = _filteredUsers;

            // 最初のユーザーを選択
            if (_filteredUsers.Count > 0)
            {
                UsersList.SelectedIndex = 0;
            }

            SearchTextBox.Focus();
        }

        /// <summary>
        /// 検索テキスト変更
        /// </summary>
        private void SearchTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            try
            {
                var searchText = SearchTextBox.Text.Trim().ToLower();

                if (string.IsNullOrEmpty(searchText))
                {
                    _filteredUsers = _allUsers.Select(u => new UserViewModel(u)).ToList();
                }
                else
                {
                    _filteredUsers = _allUsers
                        .Where(u =>
                            (u.Username != null && u.Username.ToLower().Contains(searchText)) ||
                            (u.Email != null && u.Email.ToLower().Contains(searchText)) ||
                            (u.FullName != null && u.FullName.ToLower().Contains(searchText)))
                        .Select(u => new UserViewModel(u))
                        .ToList();
                }

                UsersList.ItemsSource = _filteredUsers;

                // 最初のユーザーを選択
                if (_filteredUsers.Count > 0)
                {
                    UsersList.SelectedIndex = 0;
                }
            }
            catch (Exception ex)
            {
                Utils.Logger.Error($"検索エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// ユーザーリストダブルクリック
        /// </summary>
        private void UsersList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            SelectUser();
        }

        /// <summary>
        /// 選択ボタンクリック
        /// </summary>
        private void SelectButton_Click(object sender, RoutedEventArgs e)
        {
            SelectUser();
        }

        /// <summary>
        /// キャンセルボタンクリック
        /// </summary>
        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        /// <summary>
        /// ユーザーを選択
        /// </summary>
        private void SelectUser()
        {
            var selectedViewModel = UsersList.SelectedItem as UserViewModel;
            if (selectedViewModel != null)
            {
                SelectedUser = _allUsers.FirstOrDefault(u => u.Id == selectedViewModel.UserId);
                DialogResult = true;
                Close();
            }
            else
            {
                Alert.Warn("ユーザーを選択してください。", "選択エラー");
            }
        }
    }

    /// <summary>
    /// ユーザー表示用ViewModel
    /// </summary>
    public class UserViewModel
    {
        public int UserId { get; set; }
        public string Username { get; set; }
        public string FullName { get; set; }
        public string Email { get; set; }

        public string UserInitial
        {
            get
            {
                if (string.IsNullOrEmpty(FullName))
                {
                    return "?";
                }
                return FullName.Substring(0, 1).ToUpper();
            }
        }

        public UserViewModel(User user)
        {
            UserId = user.Id;
            Username = user.Username ?? "Unknown";
            FullName = user.FullName ?? user.Username;
            Email = user.Email ?? string.Empty;
        }
    }
}