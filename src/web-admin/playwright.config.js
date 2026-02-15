import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2Eテスト設定
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: './tests/e2e',

	/* 並列実行の最大数 */
	fullyParallel: true,

	/* CI環境でのみリトライ */
	retries: process.env.CI ? 2 : 0,

	/* CI環境では並列実行を制限 */
	workers: process.env.CI ? 1 : undefined,

	/* レポーター設定 */
	reporter: [['html'], ['list'], ['junit', { outputFile: 'test-results/junit.xml' }]],

	/* 共通設定 */
	use: {
		/* ベースURL */
		baseURL: process.env.BASE_URL || 'http://localhost:5173',

		/* トレース設定（失敗時のみ） */
		trace: 'on-first-retry',

		/* スクリーンショット設定 */
		screenshot: 'only-on-failure',

		/* ビデオ設定 */
		video: 'retain-on-failure'
	},

	/* テスト対象のブラウザとデバイス */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] }
		},
		/* モバイルテスト */
		{
			name: 'Mobile Chrome',
			use: { ...devices['Pixel 5'] }
		},
		{
			name: 'Mobile Safari',
			use: { ...devices['iPhone 12'] }
		}
	],

	/* ローカル開発サーバーの自動起動 */
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120000
	}
});
