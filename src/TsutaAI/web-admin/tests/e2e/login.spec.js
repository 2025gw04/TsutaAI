// @ts-nocheck
import { test, expect } from '@playwright/test';

/**
 * ログイン機能のE2Eテスト
 */
test.describe('Login Page', () => {
	test.beforeEach(async ({ page }) => {
		// ログインページに移動
		await page.goto('/');
	});

	test('should display login page', async ({ page }) => {
		// ページタイトルを確認
		await expect(page).toHaveTitle(/TsutaAI/);

		// ログインフォームの要素を確認
		await expect(page.getByLabel(/ユーザー名|Username/i)).toBeVisible();
		await expect(page.getByLabel(/パスワード|Password/i)).toBeVisible();
		await expect(page.getByRole('button', { name: /ログイン|Login/i })).toBeVisible();
	});

	test('should login with valid credentials', async ({ page }) => {
		// ユーザー名とパスワードを入力
		await page.getByLabel(/ユーザー名|Username/i).fill('testadmin');
		await page.getByLabel(/パスワード|Password/i).fill('adminpassword123');

		// ログインボタンをクリック
		await page.getByRole('button', { name: /ログイン|Login/i }).click();

		// ダッシュボードに遷移することを確認
		await expect(page).toHaveURL(/.*dashboard/);

		// ナビゲーションバーにユーザー名が表示されることを確認
		await expect(page.getByText(/testadmin/i)).toBeVisible();
	});

	test('should show error with invalid credentials', async ({ page }) => {
		// 無効な認証情報を入力
		await page.getByLabel(/ユーザー名|Username/i).fill('invaliduser');
		await page.getByLabel(/パスワード|Password/i).fill('wrongpassword');

		// ログインボタンをクリック
		await page.getByRole('button', { name: /ログイン|Login/i }).click();

		// エラーメッセージが表示されることを確認
		await expect(page.getByText(/ログインに失敗|Login failed|認証エラー/i)).toBeVisible();

		// ログインページに留まることを確認
		await expect(page).toHaveURL(/.*login|\/$/);
	});

	test('should show validation error for empty fields', async ({ page }) => {
		// フィールドを空のままログインボタンをクリック
		await page.getByRole('button', { name: /ログイン|Login/i }).click();

		// バリデーションエラーが表示されることを確認
		const usernameInput = page.getByLabel(/ユーザー名|Username/i);
		const passwordInput = page.getByLabel(/パスワード|Password/i);

		// HTML5バリデーションまたはカスタムエラーメッセージを確認
		await expect(usernameInput).toHaveAttribute('required');
		await expect(passwordInput).toHaveAttribute('required');
	});

	test('should toggle password visibility', async ({ page }) => {
		const passwordInput = page.getByLabel(/パスワード|Password/i);

		// 初期状態ではパスワードが隠されている
		await expect(passwordInput).toHaveAttribute('type', 'password');

		// パスワード表示切り替えボタンをクリック（存在する場合）
		const toggleButton = page.getByRole('button', { name: /表示|Show|Hide/i });
		if (await toggleButton.isVisible()) {
			await toggleButton.click();

			// パスワードが表示される
			await expect(passwordInput).toHaveAttribute('type', 'text');
		}
	});

	test('should navigate to forgot password page', async ({ page }) => {
		// パスワードを忘れた場合のリンクをクリック（存在する場合）
		const forgotPasswordLink = page.getByText(/パスワードを忘れた|Forgot Password/i);

		if (await forgotPasswordLink.isVisible()) {
			await forgotPasswordLink.click();

			// パスワードリセットページに遷移
			await expect(page).toHaveURL(/.*forgot-password|.*reset-password/);
		}
	});
});

/**
 * ダッシュボード機能のE2Eテスト（ログイン後）
 */
test.describe('Dashboard (Authenticated)', () => {
	test.beforeEach(async ({ page }) => {
		// 事前にログイン
		await page.goto('/');
		await page.getByLabel(/ユーザー名|Username/i).fill('testadmin');
		await page.getByLabel(/パスワード|Password/i).fill('adminpassword123');
		await page.getByRole('button', { name: /ログイン|Login/i }).click();
		await page.waitForURL(/.*dashboard/);
	});

	test('should display dashboard elements', async ({ page }) => {
		// ダッシュボードの主要な要素を確認
		await expect(page.getByText(/ダッシュボード|Dashboard/i)).toBeVisible();

		// ナビゲーションメニューを確認
		await expect(page.getByRole('navigation')).toBeVisible();
	});

	test('should logout successfully', async ({ page }) => {
		// ログアウトボタンを探してクリック
		const logoutButton = page.getByRole('button', { name: /ログアウト|Logout|サインアウト/i });

		if (await logoutButton.isVisible()) {
			await logoutButton.click();

			// ログインページに戻ることを確認
			await expect(page).toHaveURL(/.*login|\/$/);
		}
	});
});
