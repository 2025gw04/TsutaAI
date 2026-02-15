module.exports = {
  // テスト環境
  testEnvironment: 'node',

  // テストファイルのパターン
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // カバレッジ設定
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // カバレッジ対象
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/app.js', // アプリケーションエントリーポイントは除外
  ],

  // カバレッジ閾値（80%以上を目標）
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // テストタイムアウト
  testTimeout: 10000,

  // モジュール名マッピング
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // 無視するパス
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],

  // トランスフォーム設定
  transform: {
    '^.+\\.js$': 'babel-jest'
  },

  // verbose出力
  verbose: true,

  // 並列実行の無効化（データベーステストの競合を避けるため）
  maxWorkers: 1,

  // クリアモック
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
