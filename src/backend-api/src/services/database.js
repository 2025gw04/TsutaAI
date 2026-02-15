/**
 * データベース接続管理サービス
 *
 * このファイルは2つのモードをサポートします：
 * 1. レガシーモード: better-sqlite3 (同期API) - 既存サービス用
 * 2. Knex.jsモード: knex (非同期API) - 新規・移行済みサービス用
 *
 * 段階的移行のため、両方のAPIを提供します。
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const logger = require('../utils/logger');

// ============================================================
// Knex.js 接続管理（新規API）
// ============================================================

const knex = require('knex');
const knexConfig = require('../../knexfile');

let knexConnection = null;

/**
 * Knex.js接続を取得します（非同期API用）
 * @returns {Knex} Knex接続インスタンス
 */
function getKnex() {
  if (!knexConnection) {
    const environment = config.nodeEnv || 'development';
    const dbConfig = knexConfig[environment];

    if (!dbConfig) {
      throw new Error(`Unknown database environment: ${environment}`);
    }

    knexConnection = knex(dbConfig);
    logger.info(`Knex.js connected: ${dbConfig.client} (${environment})`);
  }
  return knexConnection;
}

/**
 * 現在のDBクライアント種別を取得
 * @returns {string} DBクライアント名 ('better-sqlite3', 'mysql2', 'pg', 'mssql')
 */
function getDbClient() {
  const environment = config.nodeEnv || 'development';
  const dbConfig = knexConfig[environment];
  return dbConfig?.client || 'better-sqlite3';
}

/**
 * Knex.js接続を閉じます
 */
async function closeKnex() {
  if (knexConnection) {
    await knexConnection.destroy();
    knexConnection = null;
    logger.info('Knex.js connection closed');
  }
}

// ============================================================
// レガシー better-sqlite3 接続管理（既存API - 段階的に廃止予定）
// ============================================================

const Database = require('better-sqlite3');

let legacyConnection = null;

/**
 * レガシーSQLite接続を取得します（同期API用）
 * @deprecated Knex.js移行後はgetKnex()を使用してください
 * @returns {Database} better-sqlite3接続インスタンス
 */
function getConnection() {
  if (!legacyConnection) {
    const dbPath = config.databasePath;
    logger.info(`Legacy SQLite Database Path: ${dbPath}`);
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      logger.info('データベース用ディレクトリを作成しました');
    }

    legacyConnection = new Database(dbPath);
    legacyConnection.pragma('foreign_keys = ON');
    legacyConnection.pragma('journal_mode = WAL');
    logger.info('レガシーSQLiteへ接続しました');

    // 既存テーブルに不足しているカラムを追加（後方互換性のため）
    ensureUsersSchema();
    ensureProjectsSchema();
    ensureTasksSchema();

    // schema.sqlからテーブルを初期化
    initializeFromSchema();
  }

  return legacyConnection;
}

/**
 * レガシー接続を閉じます
 */
function closeConnection() {
  if (legacyConnection) {
    legacyConnection.close();
    legacyConnection = null;
    logger.info('Legacy SQLite connection closed');
  }
}

/**
 * schema.sqlを読み込んでデータベースを初期化します
 */
function initializeFromSchema() {
  try {
    const schemaPath = path.join(__dirname, '../../../database/schema.sql');

    if (!fs.existsSync(schemaPath)) {
      logger.warn('schema.sqlが見つかりません。スキップします。');
      return;
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // BOMを削除（UTF-8 BOMがある場合）
    const cleanSql = schemaSql.replace(/^\uFEFF/, '');

    // SQLを実行（CREATE TABLE IF NOT EXISTSなので既存テーブルには影響なし）
    legacyConnection.exec(cleanSql);

    logger.info('schema.sqlからデータベーススキーマを初期化しました');
  } catch (error) {
    logger.error('schema.sqlの読み込みに失敗しました', error);
    throw error;
  }
}

function ensureUsersSchema() {
  try {
    let tableInfo = legacyConnection.pragma('table_info(users)');
    let columnNames = tableInfo.map((col) => col.name);

    if (!Array.isArray(tableInfo) || tableInfo.length === 0) {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
      `;
      legacyConnection.exec(createTableSQL);
      logger.info('usersテーブルを作成しました');
      return;
    }

    if (columnNames.includes('user_id') && !columnNames.includes('id')) {
      legacyConnection.exec("ALTER TABLE users RENAME COLUMN user_id TO id");
      logger.info('usersテーブルのuser_idカラムをidにリネームしました');
      tableInfo = legacyConnection.pragma('table_info(users)');
      columnNames = tableInfo.map((col) => col.name);
    }

    if (!columnNames.includes('role')) {
      legacyConnection.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
      logger.info('usersテーブルにroleカラムを追加しました');
    }

    if (!columnNames.includes('password_hash')) {
      legacyConnection.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT 'demo_password'");
      logger.info('usersテーブルにpassword_hashカラムを追加しました');
    }

    if (!columnNames.includes('full_name')) {
      legacyConnection.exec("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''");
      logger.info('usersテーブルにfull_nameカラムを追加しました');
    }

    if (!columnNames.includes('email')) {
      legacyConnection.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");
      logger.info('usersテーブルにemailカラムを追加しました');
    }

    if (!columnNames.includes('created_at')) {
      legacyConnection.exec("ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))");
      logger.info('usersテーブルにcreated_atカラムを追加しました');
    }

    if (!columnNames.includes('updated_at')) {
      legacyConnection.exec("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now','localtime'))");
      logger.info('usersテーブルにupdated_atカラムを追加しました');
    }
  } catch (error) {
    logger.error('usersテーブルのスキーマ確認に失敗しました', error);
  }
}

function ensureProjectsSchema() {
  try {
    let tableInfo = legacyConnection.pragma('table_info(projects)');
    let columnNames = tableInfo.map((col) => col.name);

    logger.info(`projectsテーブルのカラム: ${columnNames.join(', ')}`);

    if (columnNames.length === 0) {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          start_date TEXT NOT NULL DEFAULT '2025-01-01',
          end_date TEXT NOT NULL DEFAULT '2025-12-31',
          status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning', 'active', 'completed', 'cancelled')),
          created_by INTEGER,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime')),
          main_deliverable TEXT DEFAULT '',
          milestone TEXT DEFAULT '',
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );
      `;
      legacyConnection.exec(createTableSQL);
      logger.info('projectsテーブルを作成しました');
      return;
    }

    if (columnNames.includes('project_id') && !columnNames.includes('id')) {
      legacyConnection.exec("ALTER TABLE projects RENAME COLUMN project_id TO id");
      logger.info('projectsテーブルのproject_idカラムをidにリネームしました');
      tableInfo = legacyConnection.pragma('table_info(projects)');
      columnNames = tableInfo.map((col) => col.name);
    }

    if (columnNames.includes('project_name') && !columnNames.includes('name')) {
      try {
        legacyConnection.exec("ALTER TABLE projects RENAME COLUMN project_name TO name");
        logger.info('projectsテーブルのproject_nameカラムをnameにリネームしました');
      } catch (error) {
        logger.warn('project_nameからnameへのリネームに失敗: ' + error.message);
      }
    }

    tableInfo = legacyConnection.pragma('table_info(projects)');
    columnNames = tableInfo.map((col) => col.name);

    if (!columnNames.includes('name')) {
      safeAddColumn('projects', 'name', "TEXT NOT NULL DEFAULT 'Untitled Project'", 'projectsテーブルにnameカラムを追加しました');
      tableInfo = legacyConnection.pragma('table_info(projects)');
      columnNames = tableInfo.map((col) => col.name);
    }

    if (!columnNames.includes('start_date')) {
      legacyConnection.exec("ALTER TABLE projects ADD COLUMN start_date TEXT NOT NULL DEFAULT '2025-01-01'");
      logger.info('projectsテーブルにstart_dateカラムを追加しました');
    }

    if (!columnNames.includes('end_date')) {
      legacyConnection.exec("ALTER TABLE projects ADD COLUMN end_date TEXT NOT NULL DEFAULT '2025-12-31'");
      logger.info('projectsテーブルにend_dateカラムを追加しました');
    }

    if (!columnNames.includes('main_deliverable')) {
      legacyConnection.exec("ALTER TABLE projects ADD COLUMN main_deliverable TEXT DEFAULT ''");
      logger.info('projectsテーブルにmain_deliverableカラムを追加しました');
    }

    if (!columnNames.includes('milestone')) {
      legacyConnection.exec("ALTER TABLE projects ADD COLUMN milestone TEXT DEFAULT ''");
      logger.info('projectsテーブルにmilestoneカラムを追加しました');
    }
  } catch (error) {
    logger.error('projectsテーブルのスキーマ確認に失敗しました', error);
  }
}

function safeAddColumn(tableName, columnName, columnDef, logMessage) {
  try {
    legacyConnection.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    logger.info(logMessage);
  } catch (error) {
    if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
      logger.debug(`${tableName}.${columnName} は既に存在します`);
    } else {
      logger.warn(`カラム追加エラー: ${tableName}.${columnName} - ${error.message}`);
    }
  }
}

function ensureTasksSchema() {
  try {
    let tableInfo = legacyConnection.pragma('table_info(tasks)');
    let columnNames = tableInfo.map((col) => col.name);

    logger.info(`tasksテーブルのカラム: ${columnNames.join(', ')}`);

    if (columnNames.length === 0) {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          assigned_to INTEGER,
          estimated_hours REAL,
          actual_hours REAL DEFAULT 0,
          priority TEXT CHECK(priority IN ('low', 'medium', 'high')),
          status TEXT NOT NULL CHECK(status IN ('todo', 'in_progress', 'completed', 'cancelled')),
          progress INTEGER DEFAULT 0,
          due_date TEXT,
          start_date TEXT,
          end_date TEXT,
          actual_start_date TEXT,
          actual_end_date TEXT,
          deliverable TEXT DEFAULT '',
          parent_task_id INTEGER,
          sort_order INTEGER DEFAULT 0,
          dependencies TEXT,
          task_key TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
        );
      `;
      legacyConnection.exec(createTableSQL);
      logger.info('tasksテーブルを作成しました');
      return;
    }

    if (columnNames.includes('task_id') && !columnNames.includes('id')) {
      try {
        legacyConnection.exec("ALTER TABLE tasks RENAME COLUMN task_id TO id");
        logger.info('tasksテーブルのtask_idカラムをidにリネームしました');
        tableInfo = legacyConnection.pragma('table_info(tasks)');
        columnNames = tableInfo.map((col) => col.name);
      } catch (error) {
        logger.warn('task_idからidへのリネームに失敗: ' + error.message);
      }
    }

    if (columnNames.includes('task_name') && !columnNames.includes('name')) {
      try {
        legacyConnection.exec("ALTER TABLE tasks RENAME COLUMN task_name TO name");
        logger.info('tasksテーブルのtask_nameカラムをnameにリネームしました');
      } catch (error) {
        logger.warn('task_nameからnameへのリネームに失敗: ' + error.message);
      }
    }

    tableInfo = legacyConnection.pragma('table_info(tasks)');
    columnNames = tableInfo.map((col) => col.name);

    if (!columnNames.includes('name')) {
      safeAddColumn('tasks', 'name', "TEXT NOT NULL DEFAULT 'Untitled Task'", 'tasksテーブルにnameカラムを追加しました');
      tableInfo = legacyConnection.pragma('table_info(tasks)');
      columnNames = tableInfo.map((col) => col.name);
    }

    const columnsToAdd = [
      { name: 'description', def: 'TEXT' },
      { name: 'assigned_to', def: 'INTEGER' },
      { name: 'estimated_hours', def: 'REAL' },
      { name: 'actual_hours', def: 'REAL DEFAULT 0' },
      { name: 'priority', def: "TEXT CHECK(priority IN ('low', 'medium', 'high'))" },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'completed', 'cancelled'))" },
      { name: 'due_date', def: 'TEXT' },
      { name: 'start_date', def: 'TEXT' },
      { name: 'end_date', def: 'TEXT' },
      { name: 'parent_task_id', def: 'INTEGER' },
      { name: 'sort_order', def: 'INTEGER DEFAULT 0' },
      { name: 'dependencies', def: "TEXT DEFAULT '[]'" },
      { name: 'created_at', def: "TEXT DEFAULT (datetime('now', 'localtime'))" },
      { name: 'updated_at', def: "TEXT DEFAULT (datetime('now', 'localtime'))" },
      { name: 'deliverable', def: "TEXT DEFAULT ''" },
      { name: 'progress', def: 'INTEGER DEFAULT 0' },
      { name: 'actual_start_date', def: 'TEXT' },
      { name: 'actual_end_date', def: 'TEXT' },
      { name: 'task_key', def: 'TEXT' },
      { name: 'story_points', def: 'INTEGER DEFAULT 0' }
    ];

    for (const col of columnsToAdd) {
      if (!columnNames.includes(col.name)) {
        safeAddColumn('tasks', col.name, col.def, `tasksテーブルに${col.name}カラムを追加しました`);
      }
    }
  } catch (error) {
    logger.error('tasksテーブルのスキーマ確認に失敗しました', error);
  }
}

// ============================================================
// エクスポート
// ============================================================

module.exports = {
  // 新規API (Knex.js) - 推奨
  getKnex,
  getDbClient,
  closeKnex,

  // レガシーAPI (better-sqlite3) - 段階的に廃止予定
  getConnection,
  closeConnection
};
