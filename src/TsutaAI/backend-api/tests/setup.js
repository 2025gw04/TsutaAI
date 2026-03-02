/**
 * Jestグローバルセットアップファイル
 * すべてのテストの前に実行される
 */

const path = require('path');
const dotenv = require('dotenv');

// テスト環境用の.envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });

// テストタイムアウトの設定
jest.setTimeout(10000);

// グローバル変数の設定
global.testConfig = {
  apiUrl: `http://localhost:${process.env.PORT || 3001}`,
  testUser: {
    username: 'testuser',
    password: 'testpassword123',
    fullName: 'Test User',
    email: 'test@example.com',
    role: 'member'
  },
  testAdmin: {
    username: 'testadmin',
    password: 'adminpassword123',
    fullName: 'Test Admin',
    email: 'admin@example.com',
    role: 'admin'
  }
};

// コンソール出力の抑制（必要に応じてコメントアウト）
if (process.env.LOG_TO_CONSOLE !== 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // errorは残す（テスト失敗時のデバッグに必要）
    error: console.error
  };
}

// テスト前のクリーンアップ
beforeAll(() => {
  // グローバルなセットアップ処理
});

// テスト後のクリーンアップ
afterAll(() => {
  // グローバルなクリーンアップ処理
});
