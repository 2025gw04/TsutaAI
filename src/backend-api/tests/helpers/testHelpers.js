/**
 * テストヘルパー関数
 * テストで共通して使用する関数を定義
 */

const { generateToken } = require('../../src/middleware/auth');
const bcrypt = require('bcrypt');

/**
 * テスト用のJWTトークンを生成
 * @param {Object} payload - トークンに含めるデータ
 * @returns {string} JWTトークン
 */
function generateTestToken(payload = {}) {
  const defaultPayload = {
    userId: 1,
    username: 'testuser',
    role: 'member',
    ...payload
  };
  return generateToken(defaultPayload);
}

/**
 * テスト用の管理者トークンを生成
 * @returns {string} 管理者用JWTトークン
 */
function generateAdminToken() {
  return generateTestToken({
    userId: 999,
    username: 'testadmin',
    role: 'admin'
  });
}

/**
 * パスワードをハッシュ化
 * @param {string} password - 平文パスワード
 * @returns {Promise<string>} ハッシュ化されたパスワード
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * テスト用のユーザーデータを作成
 * @param {Object} overrides - デフォルト値を上書きするプロパティ
 * @returns {Object} ユーザーデータ
 */
function createTestUser(overrides = {}) {
  return {
    username: 'testuser',
    password: 'testpassword123',
    fullName: 'Test User',
    email: 'test@example.com',
    role: 'member',
    ...overrides
  };
}

/**
 * テスト用のプロジェクトデータを作成
 * @param {Object} overrides - デフォルト値を上書きするプロパティ
 * @returns {Object} プロジェクトデータ
 */
function createTestProject(overrides = {}) {
  return {
    name: 'Test Project',
    description: 'This is a test project',
    status: 'active',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    ...overrides
  };
}

/**
 * テスト用のタスクデータを作成
 * @param {Object} overrides - デフォルト値を上書きするプロパティ
 * @returns {Object} タスクデータ
 */
function createTestTask(overrides = {}) {
  return {
    name: 'Test Task',
    description: 'This is a test task',
    status: 'not_started',
    priority: 'medium',
    estimated_hours: 8,
    start_date: '2025-01-01',
    end_date: '2025-01-05',
    ...overrides
  };
}

/**
 * データベーステーブルをクリア
 * @param {Object} knex - Knexインスタンス
 * @param {string[]} tables - クリアするテーブル名の配列
 */
async function clearTables(knex, tables) {
  // 外部キー制約を一時的に無効化
  await knex.raw('PRAGMA foreign_keys = OFF');

  for (const table of tables) {
    await knex(table).del();
  }

  // 外部キー制約を再度有効化
  await knex.raw('PRAGMA foreign_keys = ON');
}

/**
 * テスト用のデータベースをセットアップ
 * @param {Object} knex - Knexインスタンス
 */
async function setupTestDatabase(knex) {
  // テーブルのクリア
  const tables = [
    'worklogs',
    'tasks',
    'projects',
    'users'
  ];

  await clearTables(knex, tables);

  // テストユーザーの作成
  const hashedPassword = await hashPassword('testpassword123');
  await knex('users').insert({
    username: 'testuser',
    password: hashedPassword,
    full_name: 'Test User',
    email: 'test@example.com',
    role: 'member'
  });

  // テスト管理者の作成
  const hashedAdminPassword = await hashPassword('adminpassword123');
  await knex('users').insert({
    username: 'testadmin',
    password: hashedAdminPassword,
    full_name: 'Test Admin',
    email: 'admin@example.com',
    role: 'admin'
  });
}

/**
 * モック関数のリセット
 * @param {Object[]} mocks - リセットするモックの配列
 */
function resetMocks(...mocks) {
  mocks.forEach(mock => {
    if (mock && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
}

/**
 * APIレスポンスのアサーション
 * @param {Object} response - Supertestレスポンス
 * @param {number} expectedStatus - 期待されるステータスコード
 * @param {Object} expectedBody - 期待されるボディの一部
 */
function assertApiResponse(response, expectedStatus, expectedBody = {}) {
  expect(response.status).toBe(expectedStatus);

  if (Object.keys(expectedBody).length > 0) {
    expect(response.body).toMatchObject(expectedBody);
  }
}

/**
 * エラーレスポンスのアサーション
 * @param {Object} response - Supertestレスポンス
 * @param {number} expectedStatus - 期待されるステータスコード
 * @param {string} expectedMessage - 期待されるエラーメッセージ（部分一致）
 */
function assertErrorResponse(response, expectedStatus, expectedMessage) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body.success).toBe(false);
  if (expectedMessage) {
    expect(response.body.message).toContain(expectedMessage);
  }
}

module.exports = {
  generateTestToken,
  generateAdminToken,
  hashPassword,
  createTestUser,
  createTestProject,
  createTestTask,
  clearTables,
  setupTestDatabase,
  resetMocks,
  assertApiResponse,
  assertErrorResponse
};
