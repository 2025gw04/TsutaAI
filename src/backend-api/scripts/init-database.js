/**
 * データベース初期化スクリプト (Knex.js対応版)
 * 既存のデータベースを削除し、マイグレーションとシードデータを実行してデータベースを初期化します
 * 対応DB: SQLite, MySQL, PostgreSQL, SQL Server
 */

const path = require('path');
const fs = require('fs');
const knexConfig = require('../knexfile');

// 環境設定
const env = process.env.NODE_ENV || 'development';
const config = knexConfig[env];
const dbClient = config.client;

const dbPath = path.join(__dirname, '../../database/tsutaai.db');
const backupPath = path.join(__dirname, '../../database/tsutaai_init_backup.db');
const schemaPath = path.join(__dirname, '../../database/schema.sql');
const seedPath = path.join(__dirname, '../../database/seed.sql');

console.log('データベース初期化スクリプト（Knex.js対応版）');
console.log('========================================');
console.log('データベースクライアント:', dbClient);
console.log('環境:', env);
console.log('========================================\n');

async function initDatabase() {
  let knex;

  try {
    // ステップ1: SQLiteの場合は既存のデータベースをバックアップ
    if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
      if (fs.existsSync(dbPath)) {
        console.log('[1/6] 既存データベースをバックアップ中...');
        try {
          fs.copyFileSync(dbPath, backupPath);
          console.log('OK: バックアップ完了:', backupPath);
        } catch (error) {
          console.log('WARNING: バックアップに失敗しました:', error.message);
        }
      } else {
        console.log('[1/6] 既存データベースが見つかりません（新規作成）');
      }

      // 既存の設定を退避（APIキーやモデル設定を維持するため）
      let preservedSettings = [];
      if (fs.existsSync(dbPath)) {
        console.log('\n[1.5/6] LLM設定を退避中...');
        try {
          // Knexではなく直接 better-sqlite3 を使い、readonly で開くことでロック競合を避ける
          const Database = require('better-sqlite3');
          const tempDb = new Database(dbPath, { readonly: true, timeout: 5000 });

          const keys = [
            'llm_provider', 'llm_api_key', 'llm_endpoint',
            'ai_temperature', 'ai_max_tokens', 'proxy_enabled',
            'proxy_url', 'proxy_username', 'proxy_password',
            'groq_api_key', 'groq_endpoint'
          ];

          const questionMarks = keys.map(() => '?').join(',');
          preservedSettings = tempDb.prepare(`
            SELECT setting_key, setting_value, setting_type, description 
            FROM system_settings 
            WHERE setting_key IN (${questionMarks})
          `).all();

          tempDb.close();
          console.log(`OK: ${preservedSettings.length} 件の設定を退避しました。`);
          // グローバル変数に保存して seeders で使えるようにする
          global.preservedLlmSettings = preservedSettings;
        } catch (e) {
          console.log('  -> 設定テーブルが見つからないか、読み取りに失敗しました（スキップします）:', e.message);
        }
      }

      // ステップ2: 既存のデータベースを削除
      if (fs.existsSync(dbPath)) {
        console.log('\n[2/6] 既存データベースを削除中...');
        try {
          // メインのDBファイルを削除
          fs.unlinkSync(dbPath);

          // WALモードの周辺ファイルも削除（Linuxでのロックや不整合を防ぐため）
          const walPath = dbPath + '-wal';
          const shmPath = dbPath + '-shm';
          if (fs.existsSync(walPath)) {
            try { fs.unlinkSync(walPath); } catch (e) { console.log('Note: -walファイルの削除をスキップ:', e.message); }
          }
          if (fs.existsSync(shmPath)) {
            try { fs.unlinkSync(shmPath); } catch (e) { console.log('Note: -shmファイルの削除をスキップ:', e.message); }
          }

          console.log('OK: 削除完了');
        } catch (error) {
          console.error('WARNING: 削除に失敗しました（ファイルが他で使用中の可能性があります）:', error.message);
          console.log('そのまま続行します。スキーマの再作成で上書きされるはずです。');
        }
      } else {
        console.log('\n[2/6] 削除するデータベースがありません');
      }
    } else {
      console.log('[1/6] 非SQLiteデータベース - バックアップスキップ');
      console.log('[2/6] 非SQLiteデータベース - ファイル削除スキップ');
    }

    // ステップ3: Knex接続を初期化
    console.log('\n[3/6] データベース接続を初期化中...');
    const Knex = require('knex');
    knex = Knex(config);
    console.log('OK: 接続成功');

    // ステップ3.5: 既存テーブルのクリーンアップ（SQLiteかつファイル削除失敗時用）
    // ファイル削除がロック等で失敗した場合でも、論理的にテーブルを空にしてからマイグレーションを実行する
    if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
      try {
        const conn = await knex.client.acquireRawConnection();
        try {
          // 外部キー制約を無効化
          conn.exec('PRAGMA foreign_keys = OFF;');

          // すべてのユーザーテーブルとKnex管理テーブルを取得
          const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

          if (tables.length > 0) {
            console.log(`  -> [補正処理] 残存している ${tables.length} 個のテーブルをクリーンアップします...`);
            for (const table of tables) {
              try {
                conn.exec(`DROP TABLE IF EXISTS "${table.name}"`);
              } catch (dropErr) {
                console.warn(`    WARNING: テーブル ${table.name} の削除失敗: ${dropErr.message}`);
              }
            }
            console.log('  -> テーブル削除完了');
          }
        } finally {
          await knex.client.releaseConnection(conn);
        }
      } catch (e) {
        console.warn('  WARNING: テーブルクリーンアップ中にエラー:', e.message);
      }
    }

    // ステップ4: スキーマを作成（マイグレーションを実行）
    // schema.sqlは使用せず、マイグレーションファイルから最新のスキーマを構築します
    console.log('\n[4/6] スキーマを作成中 (マイグレーション実行)...');
    try {
      await knex.migrate.latest();
      console.log('OK: マイグレーション完了');
    } catch (e) {
      console.error('ERROR: マイグレーション失敗:', e.message);
      throw e;
    }

    // ステップ5: シードデータを投入
    console.log('\n[5/6] サンプルデータを投入中...');

    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, 'utf-8');
      if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
        const conn = await knex.client.acquireRawConnection();
        try {
          conn.exec(seedSql);
          console.log('OK: シードデータ投入完了 (seed.sql / native exec)');
        } catch (e) {
          console.log('WARNING: seed.sql実行中に一部エラーが発生しましたが続行します:', e.message.substring(0, 100));
        } finally {
          await knex.client.releaseConnection(conn);
        }
      } else {
        try {
          await knex.raw(seedSql);
        } catch (e) {
          console.log('  Warning: seed.sql一括実行に失敗。個別実行を試みます...');
          const statements = seedSql.split(';').filter(s => s.trim());
          for (const stmt of statements) {
            if (stmt.trim()) {
              try {
                await knex.raw(stmt);
              } catch (stmtError) {
                // 無視
              }
            }
          }
        }
      }
      console.log('OK: シードデータ投入完了');
    } else {
      console.log('WARNING: seed.sqlが見つかりません');
    }

    // ステップ6: 追加のサンプルデータを生成
    console.log('\n[6/6] 追加サンプルデータを生成中...');

    // シーダーのリスト
    const seeders = [
      { name: 'システム設定', fn: seedSystemSettings }, // 設定を最初に実行
      { name: '詳細WBSプロジェクト(4, 6, 7)', fn: seedAllDetailedProjects },
      { name: 'メンバー成長データ', fn: seedMemberGrowthData },
      { name: 'ヘルプリクエスト', fn: seedHelpRequests },
      { name: 'ワークログデータ', fn: seedWorkLogs },
      { name: '見積もりデータ', fn: seedEstimates },
      { name: '休暇データ', fn: seedVacations },
      { name: 'メンタルヘルスデータ', fn: seedMentalHealthData },
      { name: '日報データ', fn: seedDailyReports },
      { name: 'アクティビティログ', fn: seedActivityLogs },
      { name: 'AI活動分析サマリー', fn: seedHourlyActivitySummaries },
      { name: '作業セッションサマリー', fn: seedWorkSessionSummaries },
      { name: '開発者松本用データ', fn: seedDevMatsumotoData }
    ];

    for (const seeder of seeders) {
      try {
        await seeder.fn(knex, dbClient);
      } catch (e) {
        console.error(`  Warning: ${seeder.name}の生成中にエラーが発生しました:`, e.message);
      }
    }
    console.log('OK: 追加サンプルデータ生成完了');

    // データベース統計を表示
    console.log('\n========================================');
    console.log('データベース統計');
    console.log('========================================\n');

    // テーブル一覧を取得
    let tables;
    if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
      tables = await knex.raw("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      tables = tables.map(t => t.name);
    } else if (dbClient === 'pg') {
      const result = await knex.raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
      tables = result.rows.map(t => t.tablename);
    } else if (dbClient === 'mysql2') {
      const result = await knex.raw('SHOW TABLES');
      tables = result[0].map(t => Object.values(t)[0]);
    } else {
      const result = await knex.raw("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
      tables = result.map(t => t.TABLE_NAME);
    }

    console.log('作成されたテーブル:', tables.length, '個');
    for (let i = 0; i < tables.length; i++) {
      try {
        const tableName = tables[i];
        if (tableName.startsWith('knex_') || tableName.startsWith('sqlite_')) continue;
        const countResult = await knex(tableName).count('* as count').first();
        const count = countResult.count;
        console.log('  ' + (i + 1).toString().padStart(2) + '. ' + tableName.padEnd(35) + ' - ' + count + '行');
      } catch (e) {
        console.log('  ' + (i + 1).toString().padStart(2) + '. ' + tables[i].padEnd(35) + ' - (カウント失敗)');
      }
    }

    // 整合性チェック（SQLiteのみ）
    if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
      console.log('\n========================================');
      console.log('整合性チェック');
      console.log('========================================\n');
      const integrityResult = await knex.raw('PRAGMA integrity_check');
      if (integrityResult[0].integrity_check === 'ok') {
        console.log('OK: 整合性チェック合格');
      } else {
        console.error('ERROR: 整合性チェック失敗:', integrityResult);
      }
    }

    await knex.destroy();

    console.log('\n========================================');
    console.log('初期化完了！');
    console.log('========================================\n');
    console.log('サンプルユーザー:');
    console.log('  ユーザー名: admin');
    console.log('  パスワード: demo_password\n');
    console.log('プロジェクト数: 3個');
    console.log('  - 顧客管理システム刷新 (ID: 4)');
    console.log('  - AIチャットボット開発 (ID: 6)');
    console.log('  - 次世代AI搭載 業務効率化プラットフォーム (ID: 7)');
    console.log('メンバー数: 15人');
    console.log('見積もり数: 3件\n');

    if (fs.existsSync(backupPath)) {
      console.log('バックアップ:', backupPath);
    }
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\nERROR: 初期化失敗:', error.message);
    console.error(error.stack);
    if (knex) {
      await knex.destroy();
    }
    process.exit(1);
  }
}

// ============================================================================
// ID取得ヘルパー関数
// ============================================================================
async function getInsertedId(knex, dbClient, tableName, data, idColumn = 'id') {
  if (dbClient === 'pg') {
    const [result] = await knex(tableName).insert(data).returning(idColumn);
    return typeof result === 'object' ? result[idColumn] : result;
  } else {
    const [id] = await knex(tableName).insert(data);
    return id;
  }
}

// ============================================================================
// 営業日計算ヘルパー
// ============================================================================
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function getHolidays(knex) {
  const rows = await knex('holidays').select('holiday_date');
  return rows.map(r => r.holiday_date);
}

function isWorkingDay(date, holidays) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const dateStr = formatDate(date);
  return !holidays.includes(dateStr);
}

function getNextWorkingDay(date, holidays) {
  const d = new Date(date);
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, holidays)) return new Date(d);
  }
  return d;
}

function getWorkingDays(start, end, holidays) {
  let count = 0;
  const cur = new Date(start);
  const finish = new Date(end);
  while (cur <= finish) {
    if (isWorkingDay(cur, holidays)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * 期間を営業日に調整する
 */
function adjustPeriod(startStr, endStr, holidays) {
  let start = new Date(startStr);
  let end = new Date(endStr);

  if (!isWorkingDay(start, holidays)) {
    start = getNextWorkingDay(start, holidays);
  }
  if (!isWorkingDay(end, holidays)) {
    end = getNextWorkingDay(end, holidays);
  }
  if (start > end) end = new Date(start);

  return { start: formatDate(start), end: formatDate(end) };
}

/**
 * メンバーの成長データを生成する
 */
async function seedMemberGrowthData(knex, dbClient) {
  console.log('  -> メンバー成長データを生成中...');

  const users = [
    { id: 1, role: 'Manager', skills: ['Project Management', 'Leadership', 'Architecture', 'Budgeting'] },
    { id: 2, role: 'PM', skills: ['Agile', 'Scrum', 'Communication', 'Risk Management'] },
    { id: 3, role: 'Backend', skills: ['Node.js', 'TypeScript', 'SQL', 'AWS', 'Docker'] },
    { id: 4, role: 'Frontend', skills: ['React', 'Svelte', 'CSS', 'TypeScript', 'Figma'] },
    { id: 5, role: 'QA', skills: ['Test Automation', 'Selenium', 'Test Planning', 'JIRA'] },
    { id: 6, role: 'Designer', skills: ['UI Design', 'UX Research', 'Figma', 'Adobe XD'] },
    { id: 7, role: 'Backend', skills: ['Python', 'Django', 'PostgreSQL', 'GCP'] },
    { id: 8, role: 'Frontend', skills: ['Vue.js', 'JavaScript', 'HTML', 'Tailwind'] },
    { id: 9, role: 'QA', skills: ['Manual Testing', 'Bug Tracking', 'SQL'] },
    { id: 10, role: 'PM', skills: ['Waterfall', 'Schedule Management', 'Client Negotiation'] },
    { id: 11, role: 'Backend', skills: ['Java', 'Spring Boot', 'Microservices', 'Kubernetes'] },
    { id: 12, role: 'Designer', skills: ['Graphic Design', 'Illustrator', 'Photoshop'] },
    { id: 13, role: 'Mobile', skills: ['Flutter', 'Dart', 'iOS', 'Android'] },
    { id: 14, role: 'QA', skills: ['Performance Testing', 'JMeter', 'Security Testing'] },
    { id: 15, role: 'AI', skills: ['Python', 'PyTorch', 'Machine Learning', 'NLP', 'RAG'] }
  ];

  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const today = new Date();

  for (const user of users) {
    // 1. Performance Metrics (Past 12 months)
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const metricDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const baseCompletion = 85 + randomInt(-10, 10);
      const bugRate = Math.max(0, 5 - randomInt(0, 5) + (user.role === 'Dev' ? 2 : 0));
      const tasksTotal = randomInt(5, 15);
      const tasksCompleted = Math.round(tasksTotal * (baseCompletion / 100));

      try {
        await knex('performance_metrics').insert({
          user_id: user.id,
          metric_date: metricDate,
          task_completion_rate: Math.min(100, baseCompletion),
          bug_rate: bugRate,
          help_count: randomInt(0, 8),
          focus_level_avg: randomInt(60, 95),
          tasks_completed: tasksCompleted,
          tasks_total: tasksTotal,
          estimated_vs_actual_ratio: 0.8 + Math.random() * 0.4,
          avg_task_duration_hours: randomInt(4, 12),
          team_avg_duration_hours: 8.0
        }).onConflict(['user_id', 'metric_date']).ignore();
      } catch (e) {
        // Ignore duplicate errors
      }
    }

    // 2. Skill Growth
    for (const skill of user.skills) {
      let currentLevel = randomInt(3, 7);
      const initDate = new Date(today.getFullYear() - 1, today.getMonth(), 1);

      await knex('skill_growth_history').insert({
        user_id: user.id,
        skill_name: skill,
        skill_level: currentLevel,
        recorded_date: initDate.toISOString().split('T')[0],
        change_reason: 'initial_assessment',
        notes: '初期評価'
      });

      const growthEvents = randomInt(1, 3);
      for (let k = 0; k < growthEvents; k++) {
        if (currentLevel < 10) {
          currentLevel++;
          const growthDate = new Date(today.getFullYear(), today.getMonth() - randomInt(1, 10), randomInt(1, 28));
          await knex('skill_growth_history').insert({
            user_id: user.id,
            skill_name: skill,
            skill_level: currentLevel,
            recorded_date: growthDate.toISOString().split('T')[0],
            change_reason: 'project_completion',
            notes: 'プロジェクトでの実践を通じて向上'
          });
        }
      }
    }

    // 3. Contributions
    const contributionTypes = ['task_completion', 'mentoring', 'documentation', 'innovation', 'other'];
    const contributionTitles = [
      '難易度の高いバグ修正',
      '新人メンバーへの技術レクチャー',
      '開発環境構築ドキュメントの整備',
      'CI/CDパイプラインの高速化',
      'チーム内勉強会の主催',
      'コードレビューでの品質向上貢献',
      'ライブラリのバージョンアップ対応'
    ];

    const numContributions = randomInt(3, 8);
    for (let i = 0; i < numContributions; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - randomInt(0, 6), randomInt(1, 28));
      await knex('member_contributions').insert({
        user_id: user.id,
        contribution_date: date.toISOString().split('T')[0],
        contribution_type: randomItem(contributionTypes),
        title: randomItem(contributionTitles),
        description: 'プロジェクトの品質と効率向上に寄与しました。',
        impact_level: randomItem(['low', 'medium', 'high'])
      });
    }

    // 4. Growth Goals
    await knex('growth_goals').insert({
      user_id: user.id,
      goal_title: `${randomItem(user.skills)}の基礎習得`,
      goal_description: '基本構文と主要なライブラリの使い方をマスターする',
      target_skill: randomItem(user.skills),
      target_level: randomInt(4, 6),
      estimated_duration_weeks: 4,
      status: 'completed',
      progress: 100,
      created_at: new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString(),
      completed_at: new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString()
    });

    await knex('growth_goals').insert({
      user_id: user.id,
      goal_title: `${randomItem(user.skills)}のエキスパート化`,
      goal_description: '高度な機能の実装とパフォーマンスチューニングを習得する',
      target_skill: randomItem(user.skills),
      target_level: randomInt(7, 9),
      estimated_duration_weeks: 12,
      status: 'active',
      progress: randomInt(20, 80),
      created_at: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
      completed_at: null
    });
  }

  console.log('  -> メンバー成長データ生成完了');
}

// ============================================================================
// 詳細WBSプロジェクト生成
// ============================================================================

async function seedAllDetailedProjects(knex, dbClient) {
  const holidays = await getHolidays(knex);
  const admin = await knex('users').where('username', 'admin').first();
  const createdBy = admin ? admin.id : 1;

  // プロジェクト4: 顧客管理システム刷新
  const project4 = {
    id: 4,
    name: '顧客管理システム刷新',
    description: 'CRMシステムの全面刷新。顧客情報の一元管理とMA機能を追加。',
    start: '2025-10-01', end: '2026-06-30',
    wbs: [
      {
        name: '企画・分析', start: '2025-10-01', end: '2025-10-31', progress: 100, status: 'completed', assignee: 2,
        description: 'CRMシステム刷新に向けた現行業務の棚卸しと課題抽出を実施。プロジェクトの成功基準を明確に定める。',
        children: [
          { name: '現状調査', start: '2025-10-01', end: '2025-10-07', progress: 100, status: 'completed', assignee: 2, description: '既存のレガシーシステムにおけるデータ構造と運用上の課題、保守コストの増大要因を詳細に調査し、解決すべきボトルネックを特定する。' },
          { name: 'ステークホルダーインタビュー', start: '2025-10-08', end: '2025-10-14', progress: 100, status: 'completed', assignee: 10, description: '各部門の責任者および現場スタッフに対し、新システムに期待する機能や解決したい課題の優先順位を整理し、プロジェクト全体の合意形成を図る。' },
          { name: '業務フロー定義', start: '2025-10-15', end: '2025-10-21', progress: 100, status: 'completed', assignee: 2, description: '現行の顧客管理業務を可視化し、新システム導入後のあるべき業務プロセス（To-Be）を設計。無駄なプロセスの削減と全体の効率化を意識した最適解を導き出す。' },
          { name: 'システム化範囲決定', start: '2025-10-22', end: '2025-10-31', progress: 100, status: 'completed', assignee: 1, description: '予算とスケジュールに基づき、今回のリプレース対象とする機能スコープを最終決定。要件の取捨選択を行い、開発の優先順位とプロジェクトの最終ゴールを明確化する。' }
        ]
      },
      {
        name: '要件定義', start: '2025-11-01', end: '2025-11-30', progress: 100, status: 'completed', assignee: 10,
        description: '策定されたスコープに基づき、必要な機能および非機能要件を詳細化。すべての仕様の根拠をドキュメント化する。',
        children: [
          { name: '機能要件定義', start: '2025-11-01', end: '2025-11-10', progress: 100, status: 'completed', assignee: 10, description: '顧客管理、商談記録、MA連携、ダッシュボードなど、新システムが備えるべき具体的機能を網羅的に定義。各機能の入出力項目と例外処理の振る舞いを明確にする。' },
          { name: '非機能要件定義', start: '2025-11-05', end: '2025-11-15', progress: 100, status: 'completed', assignee: 3, description: 'システムの可用性、ピーク時の応答性能、将来的なデータ量増大への拡張性、運用の容易性などの品質指標を設定し、具体的な目標数値を定める。' },
          { name: 'データ移行要件', start: '2025-11-10', end: '2025-11-20', progress: 100, status: 'completed', assignee: 7, description: 'レガシーDBから新DBへ移行すべきデータの抽出条件、マッピングの定義、クレンジング方針、移行に伴う業務停止時間などの手順と制約を策定する。' },
          { name: 'セキュリティ要件', start: '2025-11-15', end: '2025-11-25', progress: 100, status: 'completed', assignee: 1, description: '個人情報の保護を最優先とし、暗号化基準、段階的なアクセス権限管理、監査ログの取得レベル、脆弱性診断の実施方針などのセキュリティ保護基準を定める。' },
          { name: '要件定義承認', start: '2025-11-26', end: '2025-11-30', progress: 100, status: 'completed', assignee: 2, description: '定義された全ての要件について、ステークホルダーと最終確認を行い、公式に承認を得る。これにより後続の設計・実装工程へと進むための確定事項とする。' }
        ]
      },
      {
        name: '設計', start: '2025-12-01', end: '2026-01-31', progress: 60, status: 'in_progress', assignee: 1,
        description: '承認された要件に基づき、システム構造（アーキテクチャ）と詳細なプログラム仕様を構築する。',
        children: [
          { name: 'インフラ設計', start: '2025-12-01', end: '2025-12-10', progress: 100, status: 'completed', assignee: 7, description: 'AWSを利用した冗長構成、ネットワークのネットワークセグメント分割、ストレージのバックアップ方針など、高可用な基盤構造を設計する。' },
          { name: 'データベース論理設計', start: '2025-12-05', end: '2025-12-20', progress: 100, status: 'completed', assignee: 3, description: '顧客情報を核としたER図の作成、テーブル間のリレーションシップの定義を行い、データの冗長性を排除しながら検索速度を両立させるスキーマを完成させる。' },
          { name: '画面遷移設計', start: '2025-12-10', end: '2025-12-25', progress: 100, status: 'completed', assignee: 6, description: 'ユーザーの直感的な操作を支えるUI/UXの設計。主要画面のワイヤーフレームを作成し、業務フローに即したスムーズな動線とエラーハンドリングの表示方針を固める。' },
          { name: '外部システム連携設計', start: '2025-12-20', end: '2026-01-10', progress: 40, status: 'in_progress', assignee: 3, description: '既存のメール連携基盤やSFAシステムとのデータ通信プロトコルを定義。APIのインターフェース、バッチ連携のタイミング、エラー時のリカバリ手順を詳細化する。' },
          { name: '詳細仕様作成（顧客）', start: '2026-01-05', end: '2026-01-20', progress: 20, status: 'in_progress', assignee: 11, description: '顧客情報の登録・検索・編集機能における詳細ロジック、入力チェックルール、権限による表示制御、バックエンドでのデータ変換処理など、実装に必要な最小単位の仕様を定義する。' },
          { name: '詳細仕様作成（MA）', start: '2026-01-15', end: '2026-01-31', progress: 10, status: 'in_progress', assignee: 15, description: 'マーケティングオートメーション機能のトリガー発火条件、アクションフロー、セグメント抽出のアルゴリズムを詳細設計し、マーケティング施策の自動化ロジックを確定させる。' }
        ]
      },
      {
        name: '実装・単体テスト', start: '2026-02-01', end: '2026-04-30', progress: 0, status: 'todo', assignee: 11,
        description: '詳細設計書に基づき、プログラムの実装と単体テストを実施。品質基準を満たすコードを構築する。',
        children: [
          { name: '開発環境構築', start: '2026-02-01', end: '2026-02-07', progress: 0, status: 'todo', assignee: 7, description: 'コンテナ技術を用いた統一的な開発環境を整備。CI/CDパイプラインを構築し、自動テストとデプロイを可能にする基盤をセットアップする。' },
          { name: '共通コンポーネント実装', start: '2026-02-05', end: '2026-02-20', progress: 0, status: 'todo', assignee: 1, description: 'ヘッダー、ナビゲーション、汎用フォーム、ボタン類など、システム全体で利用するUIパーツを実装。デザイン一貫性と開発効率を向上させる。' },
          { name: '顧客情報管理機能', start: '2026-02-15', end: '2026-03-15', progress: 0, status: 'todo', assignee: 11, description: '顧客の基本属性、連絡先、ステータス等の登録・更新・検索・論理削除機能を実装。効率的なデータアクセスと詳細な入力検証をパッケージ化する。' },
          { name: '商談履歴管理機能', start: '2026-03-01', end: '2026-03-31', progress: 0, status: 'todo', assignee: 3, description: '顧客に紐づく商談の進捗履歴、担当者ログ、関連ドキュメントの管理機能を実装。時系列での履歴追跡を容易にする。' },
          { name: 'MA連携バッチ', start: '2026-03-15', end: '2026-04-15', progress: 0, status: 'todo', assignee: 15, description: 'マーケティングオートメーションツールとのデータ同期バッチを構築。大量データの効率的な転送とエラー時の再試行ロジックを実装する。' },
          { name: 'ダッシュボード実装', start: '2026-04-01', end: '2026-04-30', progress: 0, status: 'todo', assignee: 15, description: '主要なKPI（顧客数、商談成約率等）をチャートで可視化する画面を実装。リアルタイム集計APIの統合と動的なデータ表示を行う。' }
        ]
      },
      {
        name: 'テスト・移行', start: '2026-05-01', end: '2026-06-30', progress: 0, status: 'todo', assignee: 5,
        description: '結合・総合テストを通じて品質を保証し、旧システムからのデータ移行と本番稼働を完了させる。',
        children: [
          { name: '結合テスト(A)', start: '2026-05-01', end: '2026-05-15', progress: 0, status: 'todo', assignee: 5, description: 'フロントエンドとバックエンドのモジュール間連携テストを実施。データ授受の整合性とUIの動作仕様が満たされているかを確認する。' },
          { name: '結合テスト(B)', start: '2026-05-10', end: '2026-05-25', progress: 0, status: 'todo', assignee: 5, description: '他システム（MA/SFA等）とのデータ連動を含むエンドツーエンドテストを実施。ビジネスプロセス全般の動作を検証する。' },
          { name: 'ユーザー受入テスト', start: '2026-05-25', end: '2026-06-10', progress: 0, status: 'todo', assignee: 2, description: '実際の業務シナリオに基づき、現場ユーザーによる最終評価を行う。操作性や要件の充足度を確認し、リリースの承認を得る。' },
          { name: 'データ移行実施', start: '2026-06-10', end: '2026-06-20', progress: 0, status: 'todo', assignee: 7, description: '策定された移行手順に則り、本番データベースへのデータ投入と整合性チェックを実施。新システムの利用が可能な状態を確立する。' },
          { name: 'ユーザーマニュアル作成', start: '2026-06-05', end: '2026-06-25', progress: 0, status: 'todo', assignee: 12, description: '操作方法、トラブルシューティング、運用ルールを網羅したマニュアルを作成。画面キャプチャを用い、直感的な理解を促進する。' },
          { name: '本番リリース', start: '2026-06-26', end: '2026-06-30', progress: 0, status: 'todo', assignee: 1, description: '本番稼働判定をパスし、システム切り替え作業を実施。全ユーザーへの告知を行い、安定稼働をモニタリングする。' }
        ]
      }
    ]
  };

  // プロジェクト6: AIチャットボット開発
  const project6 = {
    id: 6,
    name: 'AIチャットボット開発',
    description: 'カスタマーサポート向けAIチャットボットの開発。',
    start: '2025-11-01', end: '2026-05-31',
    wbs: [
      {
        name: '調査・計画', start: '2025-11-01', end: '2025-11-30', progress: 100, status: 'completed', assignee: 2,
        description: '市場のAI動向とユーザーニーズを分析し、最適なチャットボットの導入計画を策定する。',
        children: [
          { name: '市場調査', start: '2025-11-01', end: '2025-11-07', progress: 100, status: 'completed', assignee: 2, description: '最新のAI対話技術の動向とカスタマーサポート領域での成功事例、主要プロダクトの機能を網羅的に調査・整理する。' },
          { name: '競合比較', start: '2025-11-05', end: '2025-11-12', progress: 100, status: 'completed', assignee: 2, description: '同業他社が提供するチャットボットサービスの応答精度やコスト、サポート体制を比較。自社が競争優位を持つためのポイントを分析する。' },
          { name: 'FAQデータ収集', start: '2025-11-10', end: '2025-11-20', progress: 100, status: 'completed', assignee: 12, description: '過去のサポートログやコールセンターの履歴から、自動化に適した頻出質問とその回答データを抽出・構造化し、AI学習の基盤を作成する。' },
          { name: 'プラットフォーム選定', start: '2025-11-15', end: '2025-11-30', progress: 100, status: 'completed', assignee: 11, description: '性能、運用コスト、将来の拡張性を評価し、利用するAIモデル（LLM）やボット構築基盤、サーバー環境の技術選定を決定する。' }
        ]
      },
      {
        name: 'モデル開発', start: '2025-12-01', end: '2026-02-15', progress: 50, status: 'in_progress', assignee: 15,
        description: '高精度の対話応答を実現するため、AIモデルのチューニング、プロンプト設計、RAG基盤の構築を実施。',
        children: [
          { name: '学習データ整形', start: '2025-12-01', end: '2025-12-15', progress: 100, status: 'completed', assignee: 15, description: '収集したFAQや過去ログをAIモデルの学習形式に合わせて加工。誤情報の排除（クレンジング）とデータのラベル付けを行い、品質を確保する。' },
          { name: '意図分析モデル定義', start: '2025-12-10', end: '2025-12-31', progress: 100, status: 'completed', assignee: 15, description: 'ユーザーの多様な問い合わせ形式から真の意図（インテント）を正確に判別するための分類規則およびモデルロジックを設計する。' },
          { name: 'プロンプトエンジニアリング', start: '2026-01-01', end: '2026-01-20', progress: 80, status: 'in_progress', assignee: 15, description: 'LLMに対し、企業のトーン＆マナーに沿った正確な回答を行わせるための最適な指示文（プロンプト）を設計。誤回答やハルシネーションを抑制する。' },
          { name: 'RAG基盤構築', start: '2026-01-15', end: '2026-02-10', progress: 20, status: 'in_progress', assignee: 3, description: '最新のドキュメント情報を元にした検索拡張生成（RAG）を実現するための構成を設計。ベクトルDBの構築と検索ロジックを実装する。' },
          { name: '精度評価指標策定', start: '2026-02-01', end: '2026-02-15', progress: 0, status: 'todo', assignee: 5, description: 'AIの応答がどの程度正確で解決に至ったか（解決率、正解率等）を定量的に計測するためのテストセットおよび評価スクリプトを整備する。' }
        ]
      },
      {
        name: 'UI/UX・フロントエンド', start: '2026-01-15', end: '2026-03-31', progress: 10, status: 'in_progress', assignee: 6,
        description: 'ユーザーが直感的にAIと対話できるインターフェースの設計と開発を行う。レスポンスの速さと使いやすさを追求する。',
        children: [
          { name: 'チャットUIデザイン', start: '2026-01-15', end: '2026-01-31', progress: 100, status: 'completed', assignee: 6, description: '親しみやすく、かつ業務効率を妨げないクリーンなチャットUIを設計。タイピングインジケータや吹き出しのスタイル、色調を決定する。' },
          { name: 'プロトタイプ作成', start: '2026-02-01', end: '2026-02-15', progress: 40, status: 'in_progress', assignee: 6, description: '設計したUIをベースに、主要な対話フローを確認できるプロトタイプを制作。操作上の課題を早期に発見・修正するためのモックアップを構築する。' },
          { name: 'コンポーネント開発', start: '2026-02-10', end: '2026-03-10', progress: 0, status: 'todo', assignee: 8, description: '再利用可能なチャット部品、メッセージ一覧、入力フォーム、添付ファイルプレビュー等のUIコンポーネントをSvelteで実装。一貫性のある外観と動作を実現する。' },
          { name: 'WebSocket連携', start: '2026-03-01', end: '2026-03-20', progress: 0, status: 'todo', assignee: 8, description: 'サーバーとのリアルタイムな双方向通信のためのWebSocket接続をフロントエンドに統合。メッセージの遅延を抑え、ストレスのない対話体験を提供する。' },
          { name: '履歴閲覧機能', start: '2026-03-15', end: '2026-03-31', progress: 0, status: 'todo', assignee: 4, description: 'ユーザーが過去にAIと行ったやり取りを遡って確認できる履歴閲覧画面を実装。セッションごとのログ表示と、キーワードによる過去発言の検索を可能にする。' }
        ]
      },
      {
        name: 'バックエンド・連携', start: '2026-02-01', end: '2026-04-15', progress: 5, status: 'todo', assignee: 3,
        description: 'AIモデル、外部API、社内システムを仲介するバックエンドサーバーと対話管理ロジックを開発する。',
        children: [
          { name: 'API GW構築', start: '2026-02-01', end: '2026-02-10', progress: 50, status: 'in_progress', assignee: 7, description: '外部リクエストの認証、負荷分散、レートリミット、共通ロギングを担当するAPIゲートウェイを構築。各サービスへの安全なアクセスの入り口とする。' },
          { name: '対話管理ロジック', start: '2026-02-11', end: '2026-03-15', progress: 0, status: 'todo', assignee: 3, description: 'ユーザーごとの対話セッション管理、コンテキストの保持、LLMへの問い合わせフロー制御を行うコアロジックを実装。矛盾のない継続した対話を可能にする。' },
          { name: '基幹システム連携API', start: '2026-03-01', end: '2026-03-31', progress: 0, status: 'todo', assignee: 11, description: '顧客データベースや注文管理システムから情報を取得・更新するための連携インターフェースを開発。AIが顧客固有の情報を元に回答できる基盤を作る。' },
          { name: '認証機能実装', start: '2026-03-15', end: '2026-04-05', progress: 0, status: 'todo', assignee: 3, description: 'ユーザーログイン、セッション維持、JWTを用いた認可処理。安全にAPIが利用できるようセキュリティ対策を徹底する。' },
          { name: 'ロギング・監視設定', start: '2026-04-01', end: '2026-04-15', progress: 0, status: 'todo', assignee: 7, description: 'システム稼働状況、AIのレスポンスタイム、エラーログを収集・可視化する仕組みを導入。障害の早期発見と性能改善のための分析基盤を整える。' }
        ]
      },
      {
        name: '検証・展開', start: '2026-04-16', end: '2026-05-31', progress: 0, status: 'todo', assignee: 5,
        description: 'システム全体の動作確認、セキュリティ診断を経て、社内公開および本番リリースに向けた最終調整を行う。',
        children: [
          { name: 'システムテスト', start: '2026-04-16', end: '2026-04-30', progress: 0, status: 'todo', assignee: 5, description: '要件定義で定めた全機能が期待通りに動作するかを網羅的にテスト。正常系、異常系、境界値テストを実施し、不具合を解消する。' },
          { name: 'セキュリティ診断', start: '2026-05-01', end: '2026-05-10', progress: 0, status: 'todo', assignee: 9, description: '脆弱性スキャンおよびペネトレーションテストを実施。AIへの不正なプロンプト注入や情報の不正取得、認証バイパスなどのリスクに対する防御を検証する。' },
          { name: 'ベータ版社内公開', start: '2026-05-11', end: '2026-05-20', progress: 0, status: 'todo', assignee: 2, description: '一部部署のユーザーに限定してサービスを先行公開し、実際の対話環境での動作と精度を評価。フィードバックを収集するための準備を行う。' },
          { name: 'フィードバック改善', start: '2026-05-21', end: '2026-05-30', progress: 0, status: 'todo', assignee: 15, description: '社内ベータ版の利用データから、回答の誤りや使いにくいUI、改善要望を抽出。LLMのプロンプト調整やプログラムの最終修正を行う。' },
          { name: '本番リリース判定', start: '2026-05-31', end: '2026-05-31', progress: 0, status: 'todo', assignee: 1, description: '全機能の品質、安定性、セキュリティ状況、運用マニュアルの整備状況を最終確認。関係者による合意を経て本番リリースの実施を決定する。' }
        ]
      }
    ]
  };

  // プロジェクト7: 次世代AIプラットフォーム
  const project7 = {
    id: 7,
    name: '次世代AI搭載 業務効率化プラットフォーム',
    description: '社内業務を効率化するためのAIエージェント統合プラットフォーム開発。複数の専門エージェントが協調して動作する自律型システム。',
    start: '2025-10-01', end: '2026-06-30',
    wbs: [
      {
        name: '企画・要件定義', start: '2025-10-01', end: '2025-10-31', progress: 100, status: 'completed', assignee: 2,
        description: '次世代プラットフォームのコンセプト策定と、AIが解決すべき具体的課題の定義、プロジェクトロードマップの作成を実施。',
        children: [
          { name: '業務プロセス分析', start: '2025-10-01', end: '2025-10-07', progress: 100, status: 'completed', assignee: 2, description: '現行の社内各部署の主要業務フローを可視化。自動化によるインパクトが大きい作業を特定し、AIプラットフォームの導入効果を最大化するターゲットを定める。' },
          { name: 'AIユースケース策定', start: '2025-10-08', end: '2025-10-14', progress: 100, status: 'completed', assignee: 15, description: '自動要約、分析支援、コード生成、自動応答など、AIが担当する具体的な活用シナリオを作成。各ユースケースの実現可能性と優先順位を整理する。' },
          { name: 'システム全体要件', start: '2025-10-15', end: '2025-10-21', progress: 100, status: 'completed', assignee: 10, description: 'プラットフォーム全体としての機能要件（管理、連携等）および非機能要件（セキュリティ、拡張性）を網羅。基幹システムとのインターフェース方針を決定する。' },
          { name: 'アーキテクチャ選定', start: '2025-10-22', end: '2025-10-28', progress: 100, status: 'completed', assignee: 1, description: '最新のクラウドネイティブな技術スタックと最適なAIモデル、スケーラビリティを考慮したインフラ構成、開発言語・フレームワークを総合的に判断して決定する。' },
          { name: '第1期ロードマップ策定', start: '2025-10-29', end: '2025-10-31', progress: 100, status: 'completed', assignee: 2, description: '開発フェーズの区切りとマイルストーンを設定。各リリースのターゲット機能とリソース配分を定め、ステークホルダーとの合意を形成しプロジェクトの指針とする。' }
        ]
      },
      {
        name: '基本設計・詳細設計', start: '2025-11-01', end: '2025-12-15', progress: 100, status: 'completed', assignee: 1,
        description: 'プラットフォームのコアとなる共通基盤、API仕様、データモデル、セキュリティ基準を定義し、詳細な設計書に落とし込む。',
        children: [
          { name: 'プラットフォーム基本設計', start: '2025-11-01', end: '2025-11-10', progress: 100, status: 'completed', assignee: 1, description: '全体のコンポーネント構成、サービス間の協調動作、イベント駆動アーキテクチャの詳細を設計。システムの屋台骨となる基盤構造を確定させる。' },
          { name: 'APIインターフェース設計', start: '2025-11-08', end: '2025-11-20', progress: 100, status: 'completed', assignee: 10, description: '外部連携およびマイクロサービス間で利用するAPIのエンドポイント、リクエスト・レスポンスフォーマット、エラーコード体系を詳細に定義する。' },
          { name: 'データモデル詳細設計', start: '2025-11-15', end: '2025-11-30', progress: 100, status: 'completed', assignee: 3, description: '多種多様なAIデータ、文脈情報、メタデータを管理するための論理・物理データモデルを設計。クエリのパフォーマンスとデータの整合性を両立させる。' },
          { name: 'セキュリティ・権限設計', start: '2025-11-25', end: '2025-12-05', progress: 100, status: 'completed', assignee: 7, description: 'マルチテナント対応を前提とした高度なアクセス制御、認証トークン管理、データの暗号化、監査トレールの出力ルールを詳細に定める。' },
          { name: '設計レビュー', start: '2025-12-06', end: '2025-12-15', progress: 100, status: 'completed', assignee: 2, description: '策定された設計書の内容をアーキテクチャ・セキュリティ・運用の多角的側面から検証。潜在的なリスクを排除し、実装フェーズへ向けた品質の担保を行う。' }
        ]
      },
      {
        name: 'フェーズ1：基盤開発', start: '2025-12-01', end: '2026-01-31', progress: 90, status: 'completed', assignee: 7,
        description: 'プラットフォームの中核となるインフラ構築、CI/CD環境、認証認可およびデータ管理の基本機能を実装する。',
        children: [
          { name: 'クラウド環境セットアップ', start: '2025-12-01', end: '2025-12-15', progress: 100, status: 'completed', assignee: 7, description: 'Terraform等のツールを用い、AWS上にスケーラブルなネットワーク、クラスタ、ストレージ環境を構築。IaC化による環境管理を実現する。' },
          { name: 'CI/CDパイプライン構築', start: '2025-12-05', end: '2025-12-20', progress: 100, status: 'completed', assignee: 7, description: '自動ビルド、自動テスト、脆弱性スキャン、コンテナデプロイまでを一貫して行う自動化パイプラインを構築。高速なリリース・サイクルの基盤を作る。' },
          { name: '認証ゲートウェイ実装', start: '2025-12-10', end: '2025-12-31', progress: 100, status: 'completed', assignee: 3, description: '全ての外部リクエストの認証、権限のバリデーション、流量制御を一括で行うゲートウェイ・サービスを実装。セキュアなアクセスを強制するレイヤーを構築する。' },
          { name: 'ログ・統計収集機能', start: '2026-01-05', end: '2026-01-20', progress: 100, status: 'completed', assignee: 11, description: 'プラットフォーム内の全API呼び出しログ、リソース利用統計、AI性能メトリクスを収集・集約。運用分析および精算のためのデータ基盤を構築する。' },
          { name: 'データクレンジング基盤', start: '2025-12-20', end: '2026-01-20', progress: 100, status: 'completed', assignee: 15, description: 'AIが処理しやすい形に大量の非構造化データ（文書、メール等）を加工・蓄積するETLプロセスを実装。ノイズ除去と形式変換の自動化を行う。' }
        ]
      },
      {
        name: 'フェーズ2：AIエージェント実装', start: '2026-01-15', end: '2026-03-31', progress: 40, status: 'in_progress', assignee: 15,
        description: '特定用途に特化した複数のAIエージェントを並行して開発・実装する。自律的な課題解決を目指す。',
        children: [
          { name: '汎用対話エンジン実装', start: '2026-01-15', end: '2026-02-10', progress: 100, status: 'completed', assignee: 15, description: 'LLMの応答を制御し、文脈（メモリ）を保持しながら対話を行うコアエンジンを実装。適切なプロンプト注入とハルシネーション抑制ロジックを統合する。' },
          { name: 'プラグイン機構開発', start: '2026-02-01', end: '2026-02-28', progress: 80, status: 'in_progress', assignee: 3, description: 'AIエージェントが外部ツールや自社サービスを呼び出すための標準インターフェースを開発。動的な機能拡張を可能にする「Function Calling」基盤を構築する。' },
          { name: 'カレンダー連携エージェント', start: '2026-02-15', end: '2026-03-10', progress: 60, status: 'in_progress', assignee: 11, description: 'ユーザーのカレンダー情報を取得・解析し、ミーティングの自動予約や調整を行う専門エージェント。Google/OutlookカレンダーAPIと連携する。' },
          { name: 'ナレッジベース(RAG)エージェント', start: '2026-02-15', end: '2026-03-20', progress: 30, status: 'in_progress', assignee: 15, description: '社内ドキュメントを一括検索し、根拠に基づいた回答を生成するRAGエンジンを搭載したエージェント。ベクトルDBの最適化と検索精度の向上を図る。' },
          { name: 'データ分析エージェント', start: '2026-02-20', end: '2026-03-31', progress: 10, status: 'todo', assignee: 7, description: 'CSVやExcelデータを読み込み、Pythonコードを動的に生成・実行してグラフ描画や統計分析を行うエージェント。サンドボックス環境でのコード実行を実装する。' }
        ]
      },
      {
        name: 'フェーズ3：ユーザーインターフェース構築', start: '2026-02-15', end: '2026-04-30', progress: 10, status: 'in_progress', assignee: 8,
        description: 'Web、モバイル、チャットツールなど、マルチチャネルでのユーザー体験を並行して構築する。',
        children: [
          { name: 'デザインシステム・コンポーネント作成', start: '2026-02-15', end: '2026-03-05', progress: 100, status: 'completed', assignee: 6, description: 'ボタン、フォーム、カード、モーダルなどの共通UIコンポーネントをFigmaで定義し、Svelte/Tailwindでの実装コード化を完了させる。' },
          { name: 'メインダッシュボード実装', start: '2026-03-06', end: '2026-03-31', progress: 20, status: 'in_progress', assignee: 8, description: 'PCブラウザ向けの管理画面およびエージェント操作画面。ドラッグ＆ドロップによるレイアウト変更やリアルタイムグラフ表示を実装する。' },
          { name: 'モバイルアプリ（iOS/Android）開発', start: '2026-03-06', end: '2026-04-20', progress: 0, status: 'todo', assignee: 13, description: 'Flutterを用いたクロスプラットフォーム開発。プッシュ通知によるリマインダーや、音声入力によるエージェント操作をネイティブ機能として実装する。' },
          { name: 'Slack/Teams連携アプリ開発', start: '2026-03-10', end: '2026-04-10', progress: 0, status: 'todo', assignee: 4, description: 'Slack BoltやMicrosoft Bot Frameworkを用いたチャットボット統合。メンションによる即時呼び出しとスレッド内の文脈理解を実装する。' }
        ]
      },
      {
        name: 'フェーズ4：先行機能・統合テスト', start: '2026-04-01', end: '2026-06-30', progress: 0, status: 'todo', assignee: 10,
        description: '高度なマルチモーダル機能の追加と、全体のエンドツーエンドテストを実施し、本番リリースの品質を確保する。',
        children: [
          { name: '画像認識・生成機能実装', start: '2026-04-01', end: '2026-04-20', progress: 0, status: 'todo', assignee: 15, description: 'アップロードされた画像を解析して説明する機能や、エージェントが図解を生成して回答するマルチモーダル機能を組み込む。' },
          { name: '音声対話インターフェース', start: '2026-04-05', end: '2026-04-25', progress: 0, status: 'todo', assignee: 13, description: 'WebSpeech APIおよびモバイルネイティブ音声機能を用いた、ハンズフリーでのリアルタイム音声対話モードを実装する。' },
          { name: '統合テスト・負荷試験', start: '2026-05-01', end: '2026-05-20', progress: 0, status: 'todo', assignee: 5, description: '全プラットフォーム（Web, Mobile, Slack）を通したシナリオテストと、AIモデルの応答速度・コスト負荷の検証を行う。' },
          { name: 'セキュリティ監査', start: '2026-05-15', end: '2026-05-31', progress: 0, status: 'todo', assignee: 9, description: '外部セキュリティベンダーによるホワイトボックステストを実施。プロンプトインジェクション対策と個人情報保護の堅牢性を証明する。' },
          { name: '本番リリース・運用開始', start: '2026-06-01', end: '2026-06-15', progress: 0, status: 'todo', assignee: 1, description: '段階的なロールアウト（カナリアリリース）による本番環境への展開。初期ユーザーへのオンボーディングと監視体制を確立する。' }
        ]
      }
    ]
  };

  const projects = [project4, project6, project7];

  for (const p of projects) {
    await seedOneWbsProject(knex, dbClient, p, holidays, createdBy);
  }
}

async function seedOneWbsProject(knex, dbClient, data, holidays, createdBy) {
  console.log(`  -> プロジェクト ${data.id} (${data.name}) の詳細WBSを生成中...`);

  // 既存データ削除 (外部キー制約を考慮)
  // まずプロジェクトからの参照を解除
  await knex('projects').where('id', data.id).update({ current_sprint_id: null });

  const taskIds = await knex('tasks').where('project_id', data.id).pluck('id');

  // タスクに関連するデータを削除
  await knex('help_requests').whereIn('task_id', taskIds).del();
  await knex('work_logs').whereIn('task_id', taskIds).del();
  await knex('task_activity_log').whereIn('task_id', taskIds).del();
  await knex('task_comments').whereIn('task_id', taskIds).del();
  await knex('task_attachments').whereIn('task_id', taskIds).del();
  await knex('critical_path_tasks').where('project_id', data.id).del();
  await knex('progress_predictions').whereIn('task_id', taskIds).del();
  await knex('personal_tasks').whereIn('task_id', taskIds).del();
  await knex('member_contributions').where('project_id', data.id).del();
  await knex('activity_logs').whereIn('task_id', taskIds).del();

  // プロジェクトに関連するデータを削除
  await knex('estimates').where('project_id', data.id).del();
  await knex('project_health_scores').where('project_id', data.id).del();
  await knex('burndown_data').where('project_id', data.id).del();
  await knex('project_summaries').where('project_id', data.id).del();
  await knex('dashboard_alerts').where('project_id', data.id).del();
  await knex('ai_predictions').where('project_id', data.id).del();
  await knex('project_milestones').where('project_id', data.id).del();
  await knex('project_members').where('project_id', data.id).del();

  // sprint関連
  await knex('sprint_progress').whereIn('sprint_id', knex('sprint_goals').select('id').where('project_id', data.id)).del();
  await knex('team_member_sprint_performance').whereIn('sprint_id', knex('sprint_goals').select('id').where('project_id', data.id)).del();
  await knex('sprint_goals').where('project_id', data.id).del();

  // タスク本体とプロジェクト本体
  await knex('tasks').where('project_id', data.id).del();
  await knex('projects').where('id', data.id).del();

  const adjustedProject = adjustPeriod(data.start, data.end, holidays);
  await knex('projects').insert({
    id: data.id,
    name: data.name,
    description: data.description,
    start_date: adjustedProject.start,
    end_date: adjustedProject.end,
    status: data.id === 7 ? 'active' : 'planning',
    created_by: createdBy,
    main_deliverable: '',
    milestone: ''
  });

  const taskNameToId = {};
  let sortOrder = 1;

  async function insertRecursive(tasks, parentId = null) {
    for (const t of tasks) {
      const period = adjustPeriod(t.start, t.end, holidays);
      const workingDays = getWorkingDays(period.start, period.end, holidays);
      const hours = workingDays * 8;
      // 実績日付の算出（現実感を出すための揺らぎ）
      let actualStart = null;
      let actualEnd = null;

      const startShift = Math.floor(Math.random() * 6) - 2; // -2〜+3日のズレ
      const durationShift = Math.floor(Math.random() * 5) - 1; // -1〜+3日のズレ

      if (t.status === 'completed' || t.status === 'in_progress') {
        const sDate = new Date(period.start);
        sDate.setDate(sDate.getDate() + startShift);
        actualStart = formatDate(sDate);

        if (t.status === 'completed') {
          const eDate = new Date(period.end);
          eDate.setDate(eDate.getDate() + startShift + durationShift);
          if (eDate < sDate) eDate.setTime(sDate.getTime());
          actualEnd = formatDate(eDate);
        }
      }

      // 実際にかかった工数にも揺らぎ（0.9〜1.4倍）
      const efficiencyFactor = 0.9 + Math.random() * 0.5;
      const actualHours = Math.floor(hours * (t.progress / 100) * efficiencyFactor);

      // 優先度の決定 (高: 20%, 低: 20%, 中: 60%)
      let priority = t.priority;
      if (!priority) {
        const rand = Math.random();
        if (rand < 0.2) priority = 'high';
        else if (rand < 0.4) priority = 'low';
        else priority = 'medium';
      }

      const taskId = await getInsertedId(knex, dbClient, 'tasks', {
        project_id: data.id,
        name: t.name,
        description: t.description || t.name,
        assigned_to: t.assignee,
        estimated_hours: hours,
        actual_hours: actualHours,
        priority: priority,
        status: t.status || 'todo',
        start_date: period.start,
        end_date: period.end,
        due_date: period.end,
        actual_start_date: actualStart,
        actual_end_date: actualEnd,
        progress: t.progress || 0,
        parent_task_id: parentId,
        sort_order: sortOrder++,
        story_points: t.storyPoints || 0
      });

      t.db_id = taskId;
      taskNameToId[t.name] = taskId;

      if (t.children) {
        await insertRecursive(t.children, taskId);
      }
    }
  }

  await insertRecursive(data.wbs);

  // 依存関係更新
  async function updateDeps(tasks) {
    for (const t of tasks) {
      if (t.dependsOn) {
        const depIds = t.dependsOn.map(name => taskNameToId[name]).filter(id => id);
        if (depIds.length > 0) {
          await knex('tasks').where('id', t.db_id).update({
            dependencies: JSON.stringify(depIds.map(String))
          });
        }
      }
      if (t.children) await updateDeps(t.children);
    }
  }
  await updateDeps(data.wbs);

  // スプリント生成と進捗データの生成 (実行日を基準としてシミュレーション)
  await seedSprintsAndProgress(knex, dbClient, data.id, adjustedProject.start, adjustedProject.end, holidays);

  // メンバー追加: WBSのタスクに割り当てられているメンバーを自動収集
  const assignees = new Set();

  function collectAssignees(tasks) {
    for (const t of tasks) {
      if (t.assignee) {
        assignees.add(t.assignee);
      }
      if (t.children) {
        collectAssignees(t.children);
      }
    }
  }

  collectAssignees(data.wbs);

  // プロジェクトオーナーの決定（最初のタスクの担当者、またはID=2をデフォルト）
  const ownerIds = [2, 1, 10]; // 優先順位: PM系のユーザー
  let ownerId = 2;
  for (const candidateId of ownerIds) {
    if (assignees.has(candidateId)) {
      ownerId = candidateId;
      break;
    }
  }

  for (const uid of assignees) {
    await knex('project_members').insert({
      project_id: data.id,
      user_id: uid,
      role: uid === ownerId ? 'owner' : 'member'
    }).onConflict(['project_id', 'user_id']).ignore();
  }
}

/**
 * プロジェクトに関連するスプリント、進捗、バーンダウン、ヘルススコアを生成する
 */
async function seedSprintsAndProgress(knex, dbClient, projectId, projectStart, projectEnd, holidays) {
  // 本日の日付（実行日を基準にする）
  const today = new Date();
  const todayStr = formatDate(today);
  const start = new Date(projectStart);
  const end = new Date(projectEnd);

  // 1. スプリント生成 (14日間隔)
  let sprintDate = new Date(start);
  let sprintNumber = 1;

  while (sprintDate < end) {
    const sStart = new Date(sprintDate);
    const sEnd = new Date(sprintDate);
    sEnd.setDate(sEnd.getDate() + 13);

    let status = 'planning';
    if (sEnd < today) status = 'completed';
    else if (sStart <= today && sEnd >= today) status = 'active';

    // プロジェクトIDに応じたスプリント名のパターンを定義
    const getSprintName = (projectId, sprintNumber) => {
      const sprintNames = {
        7: ['基盤設計', 'AI機能実装', 'UI開発', 'データ連携', '統合テスト', 'パフォーマンス改善', 'セキュリティ強化', 'ユーザー受入', 'リリース準備', '本番展開', '運用改善', '機能拡張', '品質向上', '最適化', '保守対応', '追加開発']
      };
      return (sprintNames[projectId] && sprintNames[projectId][sprintNumber - 1]) || `第${sprintNumber}期`;
    };

    const sprintId = await getInsertedId(knex, dbClient, 'sprint_goals', {
      project_id: projectId,
      sprint_name: getSprintName(projectId, sprintNumber),
      sprint_number: sprintNumber,
      start_date: formatDate(sStart),
      end_date: formatDate(sEnd),
      goal_description: `${sprintNumber}期目の目標：主要な開発マイルストーンの達成と品質の確保。`,
      status: status,
      target_story_points: 20 + (sprintNumber * 2),
      target_task_count: 5 + (sprintNumber % 3),
      completed_story_points: status === 'completed' ? 18 + (sprintNumber * 2) : 0,
      completed_task_count: status === 'completed' ? 4 + (sprintNumber % 3) : 0,
      created_by: 1
    });

    if (status === 'active') {
      await knex('projects').where('id', projectId).update({ current_sprint_id: sprintId });
    }

    // スプリント進捗データ (過去と現在のスプリントのみ)
    if (status !== 'planning') {
      let progressDate = new Date(sStart);
      const daysSinceStart = Math.min(14, Math.floor((today - sStart) / (24 * 60 * 60 * 1000)) + 1);

      for (let i = 0; i < daysSinceStart; i++) {
        const d = new Date(progressDate);
        await knex('sprint_progress').insert({
          sprint_id: sprintId,
          progress_date: formatDate(d),
          completed_story_points: Math.floor((i / 14) * 20),
          completed_tasks: Math.floor((i / 14) * 5),
          remaining_story_points: 20 - Math.floor((i / 14) * 20),
          remaining_tasks: 5 - Math.floor((i / 14) * 5),
          momentum_score: 70 + Math.random() * 20,
          trend: 'steady',
          on_track: 1
        }).onConflict(['sprint_id', 'progress_date']).ignore();
        progressDate.setDate(progressDate.getDate() + 1);
      }
    }

    sprintDate.setDate(sprintDate.getDate() + 14);
    sprintNumber++;
  }

  // 2. バーンダウンデータ (プロジェクト開始から今日まで)
  let burndownDate = new Date(start);
  const totalTasks = 30;
  const totalHours = 240;
  let dayIdx = 0;
  while (burndownDate <= today && burndownDate <= end) {
    const ratio = dayIdx / 90; // 適当な進捗率の計算用
    await knex('burndown_data').insert({
      project_id: projectId,
      date: formatDate(burndownDate),
      planned_remaining_tasks: Math.max(0, totalTasks - Math.floor(ratio * totalTasks)),
      planned_remaining_hours: Math.max(0, totalHours - (ratio * totalHours)),
      actual_remaining_tasks: Math.max(0, totalTasks - Math.floor(ratio * 0.9 * totalTasks)),
      actual_remaining_hours: Math.max(0, totalHours - (ratio * 0.85 * totalHours)),
      completed_tasks_count: Math.floor(ratio * 0.9 * totalTasks),
      completed_hours: Math.floor(ratio * 0.85 * totalHours)
    }).onConflict(['project_id', 'date']).ignore();
    burndownDate.setDate(burndownDate.getDate() + 1);
    dayIdx++;
  }

  // 3. プロジェクトヘルススコア (直近1週間)
  let healthDate = new Date(today);
  healthDate.setDate(healthDate.getDate() - 7);
  for (let i = 0; i < 7; i++) {
    const score = 75 + Math.floor(Math.random() * 20);
    await knex('project_health_scores').insert({
      project_id: projectId,
      health_score: score,
      score_date: formatDate(healthDate),
      progress_score: score - 5,
      deadline_score: score + 2,
      team_morale_score: 80,
      blocker_score: 95,
      velocity_score: 85,
      ai_analysis: 'プロジェクトは概ね順調です。一部のタスクでリソースの調整が必要ですが、致命的な遅延はありません。',
      risk_factors: '外部APIの仕様変更による微修正の可能性。',
      recommendations: '次週のレビューで進捗の微調整を行ってください。'
    });
    healthDate.setDate(healthDate.getDate() + 1);
  }

  // 4. クリティカルパス分析 (適当に5つのタスクを抽出)
  const tasks = await knex('tasks').where('project_id', projectId).limit(5);
  for (const t of tasks) {
    await knex('critical_path_tasks').insert({
      project_id: projectId,
      task_id: t.id,
      analysis_date: todayStr,
      is_critical: Math.random() > 0.6 ? 1 : 0,
      slack_days: Math.floor(Math.random() * 3),
      earliest_start: t.start_date,
      latest_start: t.start_date,
      earliest_finish: t.end_date,
      latest_finish: t.end_date,
      impact_analysis: 'このタスクの遅延は全体のリリース日に影響する可能性があります。'
    }).onConflict(['project_id', 'task_id', 'analysis_date']).ignore();
  }

  // 5. 進捗予測データの生成
  await seedProgressPredictions(knex, dbClient, projectId);

  // 6. プロジェクトサマリーとアラートの生成
  await seedProjectDashboardExtra(knex, dbClient, projectId);
}

/**
 * 進捗予測データを生成する
 */
async function seedProgressPredictions(knex, dbClient, projectId) {
  const tasks = await knex('tasks').where('project_id', projectId).whereIn('status', ['todo', 'in_progress']);
  const today = new Date();
  const todayStr = formatDate(today);

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + 45); // 1.5ヶ月後

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    // 3割程度をリスクありに設定
    const isDelayed = i % 3 === 0;
    const riskLevel = isDelayed ? (i % 2 === 0 ? 'high' : 'medium') : 'low';

    await knex('progress_predictions').insert({
      task_id: t.id,
      user_id: t.assigned_to || 1,
      prediction_date: todayStr,
      current_progress: t.progress || 0,
      predicted_completion_date: isDelayed ? formatDate(futureDate) : t.end_date,
      completion_probability: isDelayed ? 0.3 + Math.random() * 0.4 : 0.8 + Math.random() * 0.2,
      risk_level: riskLevel,
      avg_activity_score: 40 + Math.random() * 50,
      total_work_hours: 10 + Math.random() * 20,
      daily_progress_rate: 2 + Math.random() * 5,
      ai_suggestion: isDelayed
        ? 'リソースの再配分か、依存タスクの見直しを検討してください。必要であればスコープの調整も有効です。'
        : '現在の進捗スピードは良好です。特に介入の必要はありません。',
      bottleneck_analysis: isDelayed
        ? '担当者の他プロジェクト並行によるリソース不足、または外部APIのリプライ待ちが要因と推測されます。'
        : null,
      resource_recommendation: isDelayed ? 'シニアエンジニアの1日程度のスポット参画を推奨します。' : null,
      confidence_score: 0.7 + Math.random() * 0.2,
      is_on_track: isDelayed ? 0 : 1
    });
  }
}

/**
 * プロジェクトサマリー、アラート、センチメント分析データを生成する
 */
async function seedProjectDashboardExtra(knex, dbClient, projectId) {
  const today = new Date();
  const todayStr = formatDate(today);

  // 1. プロジェクトサマリー (project_summaries)
  await knex('project_summaries').insert({
    project_id: projectId,
    progress_percentage: projectId === 4 ? 45 : (projectId === 6 ? 65 : 20),
    current_phase: projectId === 4 ? '設計フェーズ' : (projectId === 6 ? '開発フェーズ' : '要件定義'),
    summary_text: 'プロジェクトは計画通り進行中です。目標マイルストーンに向けてチーム一丸となって取り組んでいます。',
    updated_at: todayStr + ' 10:00:00'
  }).onConflict('project_id').ignore();

  // 2. ダッシュボードアラート (dashboard_alerts)
  const alerts = [
    { sev: 'high', msg: 'クリティカルパス上のタスクに遅延の兆候があります。早期の対策が必要です。' },
    { sev: 'medium', msg: '一部のリソースが過負荷状態にあります。タスクの再割り当てを検討してください。' },
    { sev: 'low', msg: '次週の祝日による稼働時間減少を考慮し、スケジュールを微調整しました。' }
  ];

  for (const alert of alerts) {
    if (Math.random() > 0.4) {
      await knex('dashboard_alerts').insert({
        project_id: projectId,
        severity: alert.sev,
        message: alert.msg,
        created_at: todayStr + ' 09:00:00'
      });
    }
  }

  // 3. センチメント分析 (sentiment_analysis)
  // schema.sql: overall_score, summary, positive_keywords, negative_keywords, comments_json
  await knex('sentiment_analysis').insert({
    overall_score: 0.6 + (Math.random() * 0.3),
    summary: 'チーム内のコミュニケーションは活発で、技術的な課題に対しても前向きに取り組む姿勢が見られます。',
    positive_keywords: JSON.stringify(['協力', '効率的', '技術向上']),
    negative_keywords: JSON.stringify(['工数過多', '微遅延']),
    comments_json: JSON.stringify([
      { user: '山田太郎', sentiment: 0.8, comment: '開発環境が整い、作業効率が上がりました。' },
      { user: '佐藤由美', sentiment: 0.5, comment: '要件の調整に少し手間取っていますが、概ね良好です。' }
    ]),
    updated_at: todayStr + ' 18:00:00'
  });
}

/**
 * ヘルプリクエストのサンプルデータを生成する
 */
async function seedHelpRequests(knex, dbClient) {
  console.log('  -> ヘルプリクエストデータを生成中...');

  // プロジェクト4, 6, 7のタスクを取得
  let validTasks = await knex('tasks')
    .select('id', 'name', 'project_id')
    .whereIn('project_id', [4, 6, 7])
    .whereNotNull('assigned_to')
    .orderBy('id');

  if (validTasks.length < 5) {
    console.log('    -> 有効なタスクが不足しています。ヘルプリクエストをスキップします。');
    return;
  }

  const now = new Date();
  const requests = [
    { projId: 7, title: '認証APIのJWT実装について', desc: 'Auth0との連携部分でトークン検証エラーが発生しています。', urgency: 'high', status: 'resolved', helper: 3, resolution: '公開鍵の取得エンドポイント設定が間違っていたため修正しました。', daysAgo: 5, durationHours: 2 },
    { projId: 7, title: 'Svelteコンポーネントのライフサイクル', desc: 'onMountとonDestroyの挙動が想定と異なります。', urgency: 'medium', status: 'resolved', helper: 4, resolution: 'クリーンアップ関数の戻り値を修正し解決しました。', daysAgo: 3, durationHours: 1 },
    { projId: 4, title: 'CRM連携のデータマッピング', desc: '旧システムと新システムの顧客IDマッピングで不整合が生じています。', urgency: 'critical', status: 'in_progress', helper: 11, daysAgo: 1, durationHours: 0 },
    { projId: 6, title: 'NLPモデルの精度向上', desc: '特定の言い回しに対する意図認識率が低いです。', urgency: 'high', status: 'open', helper: null, daysAgo: 0, durationHours: 0 },
    { projId: 4, title: 'UIデザインのアクセシビリティ', desc: 'コントラスト比がガイドラインを満たしていない箇所があります。', urgency: 'medium', status: 'resolved', helper: 6, resolution: 'カラーパレットを調整し解決。', daysAgo: 7, durationHours: 4 },
    { projId: 7, title: 'RAGのベクトル検索精度向上', desc: '検索結果の適合率が低いため、リランキング処理を追加したいです。', urgency: 'high', status: 'open', helper: null, daysAgo: 0, durationHours: 0 },
    { projId: 6, title: 'WebSocketの再接続ロジック', desc: 'モバイル環境での瞬断時にセッションが切れてしまいます。', urgency: 'medium', status: 'assigned', helper: 11, daysAgo: 2, durationHours: 0 }
  ];

  for (const req of requests) {
    const task = validTasks.find(t => t.project_id === req.projId);
    if (!task) continue;

    const createdAt = new Date(now.getTime() - req.daysAgo * 24 * 60 * 60 * 1000);
    let assignedAt = null;
    let resolvedAt = null;

    if (req.helper) {
      assignedAt = new Date(createdAt.getTime() + 1 * 60 * 60 * 1000).toISOString();
    }
    if (req.status === 'resolved') {
      resolvedAt = new Date(createdAt.getTime() + (1 + req.durationHours) * 60 * 60 * 1000).toISOString();
    }

    // 重複を避けるためにタスクIDを使用済みにする
    validTasks = validTasks.filter(t => t.id !== task.id);

    const helpRequestId = await getInsertedId(knex, dbClient, 'help_requests', {
      task_id: task.id,
      requester_id: 10,
      request_title: req.title,
      request_description: req.desc,
      urgency: req.urgency,
      status: req.status,
      ai_context_summary: `AI分析: ${req.title} に関する課題です。`,
      assigned_to: req.helper,
      assigned_at: assignedAt,
      resolved_at: resolvedAt,
      resolution_notes: req.resolution,
      created_at: createdAt.toISOString()
    });

    if (req.status === 'open') {
      const helpers = [1, 3, 7, 11, 15].slice(0, 3);
      for (let idx = 0; idx < helpers.length; idx++) {
        await knex('help_request_suggestions').insert({
          help_request_id: helpRequestId,
          suggested_user_id: helpers[idx],
          skill_match_score: 85 - idx * 5,
          availability_score: 90 - idx * 10,
          experience_score: 80,
          total_match_score: 85 - idx * 5,
          ai_reasoning: 'AIによる最適任者の推奨です。',
          suggestion_rank: idx + 1
        });
      }
    }
  }

  console.log(`  -> ${requests.length}件のヘルプリクエストデータを生成完了`);
}

/**
 * 作業ログのサンプルデータを生成する
 */
async function seedWorkLogs(knex, dbClient) {
  console.log('  -> 作業ログデータを生成中...');

  const tasks = await knex('tasks').select('id', 'assigned_to').whereNotNull('assigned_to').limit(50);
  if (tasks.length === 0) {
    console.log('    -> タスクが見つかりません。作業ログをスキップします。');
    return;
  }

  const activityTypes = ['coding', 'meeting', 'review', 'planning', 'testing', 'documentation', 'research'];
  const activityNotes = {
    coding: ['API実装を進めました', 'バグ修正を行いました', '新機能の実装を完了しました'],
    meeting: ['チームミーティングに参加しました', 'クライアントとの打ち合わせを行いました'],
    review: ['コードレビューを実施しました', 'プルリクエストのレビューを行いました'],
    planning: ['タスクの見積もりを行いました', 'スプリント計画を立てました'],
    testing: ['単体テストを実施しました', '結合テストを行いました'],
    documentation: ['API仕様書を作成しました', 'READMEを更新しました'],
    research: ['技術調査を行いました', '新しいライブラリの検証を実施しました']
  };

  const now = new Date();
  let logCount = 0;

  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const date = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const logsPerDay = Math.floor(Math.random() * 11) + 5;

    for (let i = 0; i < logsPerDay; i++) {
      const task = tasks[Math.floor(Math.random() * tasks.length)];
      const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
      const durationMinutes = (Math.floor(Math.random() * 7) + 1) * 30;
      const startHour = Math.floor(Math.random() * 8) + 9;
      const startMinute = Math.floor(Math.random() * 4) * 15;

      const startTime = new Date(date);
      startTime.setHours(startHour, startMinute, 0, 0);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

      const notes = activityNotes[activityType][Math.floor(Math.random() * activityNotes[activityType].length)];

      await knex('work_logs').insert({
        user_id: task.assigned_to,
        task_id: task.id,
        start_time: startTime.toISOString().replace('T', ' ').substring(0, 19),
        end_time: endTime.toISOString().replace('T', ' ').substring(0, 19),
        duration_minutes: durationMinutes,
        activity_type: activityType,
        notes: notes
      });

      logCount++;
    }
  }

  console.log(`  -> ${logCount}件の作業ログを生成しました`);
}

/**
  * 見積もりサンプルデータを生成する
  */
async function seedEstimates(knex, dbClient) {
  console.log('  -> 見積もりサンプルデータを生成中...');

  // 既存の見積もりデータを削除（重複回避）
  console.log('  -> 既存の見積もりデータを削除中...');
  await knex('estimates').del();
  console.log('  -> 既存データ削除完了');

  const now = new Date();

  // フェーズテンプレート
  const phaseTemplates = {
    crm: [
      { name: '要件定義', effort: 15, duration: 14, teamSize: 2, useAi: false, aiEfficiency: 0 },
      { name: '基本設計', effort: 20, duration: 14, teamSize: 2, useAi: true, aiEfficiency: 0.2 },
      { name: '詳細設計', effort: 25, duration: 14, teamSize: 3, useAi: true, aiEfficiency: 0.25 },
      { name: 'データベース設計', effort: 10, duration: 7, teamSize: 2, useAi: true, aiEfficiency: 0.15 },
      { name: 'UI/UXデザイン', effort: 15, duration: 10, teamSize: 2, useAi: true, aiEfficiency: 0.1 },
      { name: 'フロントエンド開発', effort: 40, duration: 28, teamSize: 3, useAi: true, aiEfficiency: 0.3 },
      { name: 'バックエンド開発', effort: 50, duration: 35, teamSize: 3, useAi: true, aiEfficiency: 0.35 },
      { name: '結合テスト', effort: 15, duration: 10, teamSize: 3, useAi: true, aiEfficiency: 0.2 },
      { name: 'ユーザー受入テスト', effort: 10, duration: 7, teamSize: 2, useAi: false, aiEfficiency: 0 },
      { name: 'リリース・移行', effort: 8, duration: 5, teamSize: 2, useAi: false, aiEfficiency: 0 }
    ],
    chatbot: [
      { name: '要件定義・FAQ収集', effort: 12, duration: 10, teamSize: 2, useAi: false, aiEfficiency: 0 },
      { name: 'プラットフォーム選定', effort: 5, duration: 5, teamSize: 2, useAi: true, aiEfficiency: 0.1 },
      { name: 'アーキテクチャ設計', effort: 8, duration: 7, teamSize: 2, useAi: true, aiEfficiency: 0.2 },
      { name: 'NLPモデル開発', effort: 30, duration: 21, teamSize: 2, useAi: true, aiEfficiency: 0.4 },
      { name: 'FAQ応答ロジック実装', effort: 20, duration: 14, teamSize: 2, useAi: true, aiEfficiency: 0.35 },
      { name: 'チャットUI開発', effort: 18, duration: 14, teamSize: 2, useAi: true, aiEfficiency: 0.3 },
      { name: 'オペレーター連携機能', effort: 12, duration: 10, teamSize: 2, useAi: true, aiEfficiency: 0.25 },
      { name: '結合テスト', effort: 10, duration: 7, teamSize: 2, useAi: true, aiEfficiency: 0.2 },
      { name: 'パイロット運用', effort: 15, duration: 21, teamSize: 2, useAi: false, aiEfficiency: 0 },
      { name: '本番展開', effort: 5, duration: 5, teamSize: 2, useAi: false, aiEfficiency: 0 }
    ],
    aiPlatform: [
      { name: '企画・要件定義', effort: 20, duration: 21, teamSize: 3, useAi: false, aiEfficiency: 0 },
      { name: '基本設計', effort: 15, duration: 14, teamSize: 3, useAi: true, aiEfficiency: 0.2 },
      { name: '詳細設計', effort: 20, duration: 14, teamSize: 4, useAi: true, aiEfficiency: 0.25 },
      { name: '基盤構築', effort: 15, duration: 10, teamSize: 2, useAi: true, aiEfficiency: 0.15 },
      { name: 'バックエンド開発', effort: 60, duration: 42, teamSize: 4, useAi: true, aiEfficiency: 0.35 },
      { name: 'フロントエンド開発', effort: 45, duration: 35, teamSize: 3, useAi: true, aiEfficiency: 0.3 },
      { name: 'AI機能開発', effort: 40, duration: 28, teamSize: 2, useAi: true, aiEfficiency: 0.4 },
      { name: '結合テスト', effort: 20, duration: 14, teamSize: 3, useAi: true, aiEfficiency: 0.2 },
      { name: 'AI精度評価', effort: 12, duration: 10, teamSize: 2, useAi: false, aiEfficiency: 0 },
      { name: 'UAT・受入テスト', effort: 15, duration: 10, teamSize: 3, useAi: false, aiEfficiency: 0 },
      { name: 'マニュアル作成', effort: 10, duration: 10, teamSize: 2, useAi: true, aiEfficiency: 0.3 },
      { name: 'リリース・移行', effort: 8, duration: 5, teamSize: 3, useAi: false, aiEfficiency: 0 }
    ]
  };

  const estimates = [
    {
      projectId: 4,
      patternType: 'duration_fixed',
      title: '顧客管理システム刷新見積もり',
      description: 'CRMシステムの全面刷新。顧客情報の一元管理とマーケティングオートメーション機能を追加。',
      status: 'completed',
      createdBy: 2,
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
      phases: phaseTemplates.crm
    },
    {
      projectId: 6,
      patternType: 'task_based',
      title: 'AIチャットボット開発見積もり',
      description: 'カスタマーサポート向けAIチャットボットの開発。FAQ自動応答とオペレーター連携機能を実装。',
      status: 'in_progress',
      createdBy: 1,
      createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      completedAt: null,
      phases: phaseTemplates.chatbot
    },
    {
      projectId: null,
      patternType: 'duration_unknown',
      title: '次世代AI業務効率化プラットフォーム見積もり',
      description: '社内業務を効率化するためのAIエージェント統合プラットフォーム開発。自然言語処理を用いたドキュメント検索、自動応答、タスク自動化機能を提供。',
      status: 'draft',
      createdBy: 1,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      completedAt: null,
      phases: phaseTemplates.aiPlatform
    }
  ];

  let estimateCount = 0;
  let phaseCount = 0;

  for (const est of estimates) {
    // 重複を避けるために、既存の見積もりデータを削除
    if (est.projectId) {
      await knex('estimates')
        .where('project_id', est.projectId)
        .del();
    }
    const estimateId = await getInsertedId(knex, dbClient, 'estimates', {
      project_id: est.projectId,
      pattern_type: est.patternType,
      title: est.title,
      description: est.description,
      status: est.status,
      created_by: est.createdBy,
      created_at: est.createdAt.toISOString(),
      updated_at: est.createdAt.toISOString(),
      completed_at: est.completedAt ? est.completedAt.toISOString() : null
    });

    // 会話履歴
    await knex('estimate_conversations').insert({
      estimate_id: estimateId,
      role: 'system',
      content: `${est.title}の見積もりセッションを開始します。`,
      metadata: null,
      created_at: est.createdAt.toISOString()
    });

    // フェーズデータを追加
    let currentDate = new Date(est.createdAt);
    for (let i = 0; i < est.phases.length; i++) {
      const phase = est.phases[i];
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + phase.duration);

      // AI効率化時の工数と期間を計算
      const effortWithAi = phase.useAi ? Math.round(phase.effort * (1 - phase.aiEfficiency) * 10) / 10 : phase.effort;
      const durationWithAi = phase.useAi ? Math.round(phase.duration * (1 - phase.aiEfficiency * 0.7)) : phase.duration;

      await knex('estimate_phases').insert({
        estimate_id: estimateId,
        phase_name: phase.name,
        phase_order: i + 1,
        effort: phase.effort,
        duration_days: phase.duration,
        team_size: phase.teamSize,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        dependencies: i > 0 ? JSON.stringify([i]) : null,
        use_ai: phase.useAi ? 1 : 0,
        ai_efficiency_ratio: phase.aiEfficiency,
        ai_efficiency_auto: 1,
        effort_with_ai: effortWithAi,
        duration_with_ai: durationWithAi
      });

      phaseCount++;
      // 次のフェーズの開始日を設定（一部重複を許容）
      currentDate = new Date(endDate);
      currentDate.setDate(currentDate.getDate() - Math.floor(phase.duration * 0.2)); // 20%オーバーラップ
    }

    // 見積もり結果（completed/in_progressの場合のみ）
    if (est.status === 'completed' || est.status === 'in_progress') {
      const totalEffort = est.phases.reduce((sum, p) => sum + p.effort, 0);
      const totalDuration = est.phases.reduce((sum, p) => sum + p.duration, 0);
      const avgTeamSize = est.phases.reduce((sum, p) => sum + p.teamSize, 0) / est.phases.length;
      const totalEffortWithAi = est.phases.reduce((sum, p) => {
        return sum + (p.useAi ? p.effort * (1 - p.aiEfficiency) : p.effort);
      }, 0);

      await knex('estimate_results').insert({
        estimate_id: estimateId,
        result_type: 'standard',
        total_effort: totalEffort,
        duration_days: Math.round(totalDuration * 0.7), // 並列作業を考慮
        team_size: Math.round(avgTeamSize * 10) / 10,
        total_cost: totalEffort * 50000, // 1人日5万円で計算
        confidence_level: est.status === 'completed' ? 0.9 : 0.75,
        breakdown: JSON.stringify({
          phases: est.phases.map(p => ({
            name: p.name,
            effort: p.effort,
            duration: p.duration
          })),
          aiImpact: {
            originalEffort: totalEffort,
            effortWithAi: Math.round(totalEffortWithAi),
            savingsPercent: Math.round((1 - totalEffortWithAi / totalEffort) * 100)
          }
        }),
        recommendations: JSON.stringify([
          'チーム間のコミュニケーションを密に行い、依存関係のあるタスクの遅延を防いでください',
          'AI活用により開発効率の向上が期待できます',
          '品質確保のため、テストフェーズには十分なリソースを確保してください'
        ]),
        created_at: est.createdAt.toISOString()
      });
    }

    estimateCount++;
  }

  console.log(`  -> ${estimateCount}件の見積もりと${phaseCount}件のフェーズデータを生成しました`);
}

/**
 * 作業セッションサマリーのサンプルデータを生成する
 */
// @ts-ignore
async function seedWorkSessionSummaries(knex, dbClient) {
  console.log('  -> 作業セッションサマリーデータを生成中...');

  const exists = await knex.schema.hasTable('work_session_summary');
  if (!exists) {
    await knex.schema.createTable('work_session_summary', (table) => {
      table.increments('session_id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('SET NULL');
      table.integer('task_id').unsigned().nullable().references('id').inTable('tasks').onDelete('SET NULL');
      table.timestamp('session_start').notNullable();
      table.timestamp('session_end').notNullable();
      table.integer('work_duration_seconds').defaultTo(0);
      table.integer('progress_percentage').defaultTo(0);
      table.integer('commits_count').defaultTo(0);
      table.integer('files_changed').defaultTo(0);
      table.text('session_notes');
      table.string('session_type', 20).defaultTo('work');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_work_session_user');
      table.index('project_id', 'idx_work_session_project');
      table.index('task_id', 'idx_work_session_task');
      table.index('session_start', 'idx_work_session_start');
    });
    console.log('    (work_session_summary table created)');
  }

  // 既存データ削除
  await knex('work_session_summary').del();

  const users = await knex('users').select('id');
  const projects = await knex('projects').select('id');
  // 全タスクを取得
  const tasks = await knex('tasks').select('id', 'project_id', 'name');

  const today = new Date();
  let count = 0;

  for (const user of users) {
    // 過去7日分
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);

      const isToday = d === 0;
      const currentHour = today.getHours();

      // 1日あたり2-4セッション
      const sessionsPerDay = Math.floor(Math.random() * 3) + 2;

      for (let s = 0; s < sessionsPerDay; s++) {
        const startHour = 9 + (s * 3); // 9, 12, 15...

        // 今日の場合、現在時刻より未来のデータは作らない
        if (isToday && startHour > currentHour) continue;

        const sessionStart = new Date(date);
        sessionStart.setHours(startHour, Math.floor(Math.random() * 60), 0);

        // 未来時刻になってしまったらスキップ (念のため)
        if (sessionStart > today) continue;

        const durationMin = Math.floor(Math.random() * 90) + 30; // 30-120分
        const sessionEnd = new Date(sessionStart);
        sessionEnd.setMinutes(sessionEnd.getMinutes() + durationMin);

        // 終了時間が未来なら現在時刻に丸める
        if (sessionEnd > today) {
          sessionEnd.setTime(today.getTime());
        }

        // 開始時間が終了時間より後になってしまったらスキップ
        if (sessionStart >= sessionEnd) continue;

        // ランダムにプロジェクト/タスクを選択
        const project = projects[Math.floor(Math.random() * projects.length)];
        // プロジェクトに紐づくタスクか、なければnull
        const projectTasks = tasks.filter(t => t.project_id === project.id);
        const task = projectTasks.length > 0 ? projectTasks[Math.floor(Math.random() * projectTasks.length)] : null;

        const progress = Math.min(100, Math.floor(Math.random() * 10) * 10 + 10); // 10-100%

        await knex('work_session_summary').insert({
          user_id: user.id,
          project_id: project.id,
          task_id: task ? task.id : null,
          session_start: sessionStart.toISOString(),
          session_end: sessionEnd.toISOString(),
          work_duration_seconds: Math.floor((sessionEnd.getTime() - sessionStart.getTime()) / 1000),
          progress_percentage: progress,
          commits_count: Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0,
          files_changed: Math.floor(Math.random() * 5) + 1,
          session_notes: task ? `${task.name}の実装を進めました。` : '調査作業',
          session_type: 'work'
        });
        count++;
      }
    }
  }

  console.log(`  -> ${count}件の作業セッションサマリーを生成しました`);
}

/**
 * 休暇サンプルデータを生成する
 */
async function seedVacations(knex, dbClient) {
  console.log('  -> 休暇サンプルデータを生成中...');

  const today = new Date();
  const vacations = [
    { userId: 3, startOffset: -14, endOffset: -12, type: '有給休暇', notes: '家族旅行のため' },
    { userId: 4, startOffset: -7, endOffset: -7, type: '有給休暇', notes: '私用のため' },
    { userId: 6, startOffset: -21, endOffset: -18, type: '夏季休暇', notes: '帰省のため' },
    { userId: 9, startOffset: -1, endOffset: 2, type: '有給休暇', notes: '体調不良のため' },
    { userId: 2, startOffset: 7, endOffset: 9, type: '有給休暇', notes: '資格試験受験のため' },
    { userId: 5, startOffset: 14, endOffset: 14, type: '特別休暇', notes: '結婚記念日' },
    { userId: 7, startOffset: 21, endOffset: 25, type: '年末年始休暇', notes: '年末年始帰省' },
    { userId: 8, startOffset: 10, endOffset: 12, type: '有給休暇', notes: '旅行のため' },
    { userId: 11, startOffset: 30, endOffset: 31, type: '慶弔休暇', notes: '法事のため' },
    { userId: 15, startOffset: 5, endOffset: 5, type: '有給休暇', notes: '通院のため' }
  ];

  let count = 0;
  for (const v of vacations) {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + v.startOffset);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + v.endOffset);

    await knex('vacations').insert({
      user_id: v.userId,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      vacation_type: v.type,
      notes: v.notes
    });
    count++;
  }

  console.log(`  -> ${count}件の休暇データを生成しました`);
}

/**
 * システム設定のデフォルト値を生成する
 */
async function seedSystemSettings(knex, dbClient) {
  console.log('  -> システム設定のデフォルト値を生成中...');

  const preserved = global.preservedLlmSettings || [];

  // 旧キーから新キーへのマッピング
  const keyMapping = {
    'groq_api_key': 'llm_api_key',
    'groq_endpoint': 'llm_endpoint',
    'ai_model': 'llm_model'
  };

  // 破棄する古いキー（マッピング済み、または不要なもの）
  const deprecatedKeys = ['groq_api_key', 'groq_endpoint', 'ai_model'];

  const defaultSettings = [
    { key: 'llm_provider', value: 'groq', type: 'string', description: 'LLMプロバイダー' },
    { key: 'llm_endpoint', value: 'https://api.groq.com/openai/v1/chat/completions', type: 'string', description: 'LLM APIエンドポイントURL' },
    { key: 'llm_model', value: 'openai/gpt-oss-20b', type: 'string', description: 'LLMモデル名' },
    { key: 'ai_temperature', value: '0.3', type: 'number', description: 'AI応答の温度パラメータ' },
    { key: 'ai_max_tokens', value: '65536', type: 'number', description: 'AI応答の最大トークン数' },
    { key: 'proxy_enabled', value: 'false', type: 'boolean', description: 'プロキシ使用の有効/無効' }
  ];

  // 退避された設定がある場合は、デフォルト値を上書きし、不足分を追加する
  const finalSettings = [...defaultSettings];
  for (const p of preserved) {
    const targetKey = keyMapping[p.setting_key] || p.setting_key;

    // 値が空、またはマスクされている場合はスキップ
    if (!p.setting_value || p.setting_value === '********') continue;

    const existingIndex = finalSettings.findIndex(s => s.key === targetKey);
    if (existingIndex !== -1) {
      // 既存のキーがある場合は値を上書き
      finalSettings[existingIndex].value = p.setting_value;
    } else if (!deprecatedKeys.includes(targetKey)) {
      // 新しいキー（APIキーなど）は追加（ただし破棄対象でない場合）
      finalSettings.push({
        key: targetKey,
        value: p.setting_value,
        type: p.setting_type,
        description: p.description
      });
    }
  }

  // 重複キーが発生しないように調整（念のため）
  const uniqueSettings = [];
  const seenKeys = new Set();
  // finalSettingsは後ろのほうが優先される可能性があるが、ここではfindIndexで最初に見つかったものを更新しているので、
  // Setを使って重複を排除する
  for (const s of finalSettings) {
    if (!seenKeys.has(s.key)) {
      uniqueSettings.push(s);
      seenKeys.add(s.key);
    }
  }

  // 既存のテーブルをきれいに掃除（念のため）
  // ただしマイグレーションで入った初期値がある可能性があるため、
  // きれいに消すか、あるいは insert ... onConflict merge を使う

  let count = 0;
  for (const s of uniqueSettings) {
    try {
      await knex('system_settings').insert({
        setting_key: s.key,
        setting_value: s.value,
        setting_type: s.type,
        description: s.description
      }).onConflict('setting_key').merge();
      console.log(`    -> Setting [${s.key}] = [${s.value}]`);
      count++;
    } catch (e) {
      console.error(`    Warning: 設定 ${s.key} の登録に失敗しました:`, e.message);
    }
  }

  console.log(`  -> ${count}件のシステム設定（退避分を含む）を生成しました`);
}

/**
 * メンタルヘルスデータのサンプルを生成する (パターンの多様化)
 */
/**
 * メンタルヘルスデータのサンプルを生成する (パターンの多様化・詳細データ追加)
 */
async function seedMentalHealthData(knex, dbClient) {
  console.log('  -> メンタルヘルスデータを生成中...');

  const users = await knex('users').select('id', 'full_name');
  const now = new Date();
  let count = 0;

  // テキストサンプルデータ
  const blockerSamples = [
    "APIの仕様変更により、フロントエンドの実装が大幅に遅れています。仕様書の更新も追いついておらず、確認に時間がかかっています。",
    "依存しているライブラリ（Better-SQLite3）のビルドエラーが解消できず、開発環境が正常に動作しません。",
    "要件定義の曖昧な点が多く、実装中に手戻りが頻発しています。クライアントへの確認待ちで作業が止まることが多いです。",
    "急な割り込みタスク（バグ修正、問い合わせ対応）が多く、本来予定していたスプリントタスクに着手できていません。",
    "デザインの意図がエンジニアに正しく伝わっておらず、実装後の修正ラリーが続いています。",
    "テストデータが不足しており、エッジケースの検証が進んでいません。"
  ];

  const supportSamples = [
    "バックエンド担当者との仕様すり合わせMTGを設定してほしいです。",
    "環境構築に詳しいメンバー（おそらくインフラチーム）に30分ほど相談したいです。",
    "タスクの優先順位について、PMと早急に相談させてください。現状のリソースでは納期遵守が厳しいです。",
    "体調が優れないため、午後半休を調整させていただけますでしょうか。",
    "新しいフレームワークの学習コストが高く、有識者によるレクチャーをお願いしたいです。",
    "チーム内のコミュニケーションロスを感じています。朝会の運用方法を見直したいです。"
  ];

  const aiAdviceSamples = [
    "【管理者向け推奨アクション】\n技術的なブロッカーが発生しています。テックリードをアサインし、ペアプログラミング等での早期解消を指示してください。また、仕様変更のプロセスを見直す必要があります。",
    "【管理者向け推奨アクション】\n業務過多（オーバーワーク）の兆候が見られます。直ちにタスクの棚卸しを行い、優先度の低いタスクを別メンバーへ委譲するか、期日を再調整してください。",
    "【管理者向け推奨アクション】\nメンタル不調のリスクが高まっています。本日中に1on1を設定し、業務上の悩みや体調について丁寧にヒアリングしてください。業務調整だけではなく、休息の提案も必要です。",
    "【管理者向け推奨アクション】\nコミュニケーション不足による手戻りが懸念されます。定例MTG以外に、担当者間でのショートミーティング（15分程度）を設定し、認識齟齬を解消するよう促してください。",
    "【管理者向け推奨アクション】\nスキル不足による停滞の可能性があります。学習のための時間を確保するか、メンターを配置してサポート体制を強化してください。"
  ];

  // ユーザーごとに特性を割り当てる
  const userPatterns = {};
  users.forEach(u => {
    const rand = Math.random();
    if (rand < 0.2) userPatterns[u.id] = 'stressed';
    else if (rand < 0.4) userPatterns[u.id] = 'improving';
    else if (rand < 0.6) userPatterns[u.id] = 'worsening';
    else userPatterns[u.id] = 'stable';
  });

  // 直近30日間を生成
  for (let i = 29; i >= 0; i--) {
    const reportDate = new Date(now);
    reportDate.setDate(reportDate.getDate() - i);
    const dateStr = formatDate(reportDate);

    // 土日はスキップ
    const day = reportDate.getDay();
    if (day === 0 || day === 6) continue;

    for (const user of users) {
      // 全員記録するわけではない (約11%の確率で記録 -> 30日*15人*0.11 ≈ 50件)
      if (Math.random() > 0.11) continue;

      const pattern = userPatterns[user.id];
      let mood, stress;

      if (pattern === 'stressed') {
        mood = Math.floor(Math.random() * 2) + 1; // 1-2
        stress = Math.floor(Math.random() * 2) + 4; // 4-5
      } else if (pattern === 'improving') {
        const progress = (29 - i) / 29;
        mood = Math.min(5, Math.floor(2 + progress * 3 + Math.random()));
        stress = Math.max(1, Math.floor(4 - progress * 3 + Math.random()));
      } else if (pattern === 'worsening') {
        const progress = (29 - i) / 29;
        mood = Math.max(1, Math.floor(4 - progress * 3 + Math.random()));
        stress = Math.min(5, Math.floor(2 + progress * 3 + Math.random()));
      } else {
        mood = Math.floor(Math.random() * 2) + 3; // 3-4
        stress = Math.floor(Math.random() * 2) + 2; // 2-3
      }

      // ストレスが高い、またはランダムでブロッカー/サポート発生
      const hasBlocker = (stress >= 4 || Math.random() < 0.2) ? 1 : 0;
      const needSupport = (stress >= 4 || Math.random() < 0.2) ? 1 : 0;

      let blockerDetails = null;
      let supportDetails = null;
      let aiAdvice = null;

      if (hasBlocker) {
        blockerDetails = blockerSamples[Math.floor(Math.random() * blockerSamples.length)];
      }

      if (needSupport) {
        supportDetails = supportSamples[Math.floor(Math.random() * supportSamples.length)];
      }

      // AIアドバイスの生成
      if (hasBlocker || needSupport || stress >= 4 || mood <= 2) {
        if (needSupport) {
          aiAdvice = aiAdviceSamples[2]; // 1on1推奨
        } else if (hasBlocker) {
          aiAdvice = aiAdviceSamples[0]; // 技術的ブロッカー
        } else if (stress >= 5) {
          aiAdvice = aiAdviceSamples[1]; // オーバーワーク
        } else {
          aiAdvice = aiAdviceSamples[3]; // コミュニケーション
        }
      } else {
        // 良好な場合でも簡単なコメント
        aiAdvice = "【管理者向け情報】\n状態は安定しています。現在のパフォーマンスを維持できるよう、定期的なフィードバック（承認・賞賛）を行ってください。";
      }

      const data = {
        user_id: user.id,
        report_date: dateStr,
        mood: mood,
        stress_level: stress,
        has_blocker: hasBlocker,
        blocker_details: blockerDetails,
        need_support: needSupport,
        support_details: supportDetails,
        ai_advice: aiAdvice,
        created_at: dateStr + ' 18:30:00'
      };

      // 管理者コメント（たまに）
      if (data.need_support && Math.random() > 0.5) {
        data.manager_id = 1;
        data.manager_comment = '了解しました。明日の朝、時間を取って話し合いましょう。カレンダーに予定を入れておきます。';
        data.commented_at = dateStr + ' 19:00:00';
      }

      await knex('mental_health_logs').insert(data).onConflict(['user_id', 'report_date']).ignore();
      count++;
    }
  }

  console.log(`  -> ${count}件のメンタルヘルスログ（詳細付）を生成しました`);
}

/**
 * 日報データのサンプルを生成する
 */
async function seedDailyReports(knex, dbClient) {
  console.log('  -> 日報データを生成中...');

  const users = await knex('users').select('id', 'full_name');
  const now = new Date();

  // ユーザーごとのシナリオ設定
  const scenarios = {
    // ユーザー2（PM）は過労気味で満足度低下
    2: { type: 'declining', base: 4, trend: -0.5 },
    // ユーザー3（Backend）は技術的課題で苦戦中（低空飛行）
    3: { type: 'struggling', base: 2, trend: 0 },
    // ユーザー4（Frontend）は順調
    4: { type: 'stable_high', base: 4.5, trend: 0 },
    // ユーザー5（QA）は普通
    5: { type: 'normal', base: 3.5, trend: 0 }
  };

  const sampleSummaries = [
    "本日は予定通りタスクを消化できました。",
    "バグ修正に時間がかかり、進捗が遅れています。",
    "新しいライブラリの調査を行い、知見を得ました。",
    "ミーティングが多く、作業時間が確保できませんでした。",
    "仕様の確認待ちで待機時間が発生しました。"
  ];

  let count = 0;

  // 過去14日分生成
  for (let i = 13; i >= 0; i--) {
    const reportDate = new Date(now);
    reportDate.setDate(reportDate.getDate() - i);

    // 土日はスキップ（ランダムでたまに休日出勤）
    const day = reportDate.getDay();
    if ((day === 0 || day === 6) && Math.random() > 0.1) continue;

    const dateStr = formatDate(reportDate);

    for (const user of users) {
      if (user.id === 1) continue; // adminはスキップ

      const scenario = scenarios[user.id] || { type: 'normal', base: 3.5, trend: 0 };

      let satisfaction = 3;
      let focus = 3;
      let difficulty = 3;
      let learning = 3;
      let achievement = 80;
      let comment = "";

      // シナリオに応じたデータ生成
      if (scenario.type === 'declining') {
        // 徐々に下がる (直近ほど低い)
        // 14日前はbase, 0日前は base + (trend * 14) -> trendが負なら下がる
        const change = (13 - i) * scenario.trend;
        satisfaction = Math.max(1, Math.min(5, scenario.base + change + (Math.random() * 1 - 0.5)));
        focus = Math.max(1, Math.min(5, satisfaction + (Math.random() * 1)));
        difficulty = Math.min(5, Math.max(1, 3 - change)); // 満足度下がると難易度上がり目

        if (i < 3) comment = "疲れが取れず、集中力が続きません。タスク量が多いです。";
      } else if (scenario.type === 'struggling') {
        // 常に低い
        satisfaction = Math.max(1, Math.min(2.5, scenario.base + (Math.random() * 1 - 0.5)));
        focus = Math.max(1, Math.min(3, 2 + Math.random()));
        difficulty = 4 + Math.random(); // 難しい
        achievement = 40 + Math.random() * 30; // 進捗悪い

        if (i < 3) comment = "技術的な解決策が見つからず詰まっています。";
      } else if (scenario.type === 'stable_high') {
        // 高水準安定
        satisfaction = Math.max(4, Math.min(5, scenario.base + (Math.random() * 0.5)));
        focus = Math.max(4, Math.min(5, 4 + Math.random()));
        difficulty = 3 + Math.random();
        achievement = 95 + Math.random() * 5;
        learning = 4 + Math.random();
      } else {
        // 普通 (ランダム)
        satisfaction = Math.max(2, Math.min(5, 3 + (Math.random() * 2 - 1)));
        focus = Math.max(2, Math.min(5, 3 + (Math.random() * 2 - 1)));
        difficulty = Math.floor(Math.random() * 3) + 2;
        achievement = 70 + Math.floor(Math.random() * 30);
      }

      // 数値を丸める
      satisfaction = Math.round(satisfaction * 10) / 10;
      focus = Math.round(focus * 10) / 10;
      difficulty = Math.round(difficulty * 10) / 10;
      learning = Math.round(learning * 10) / 10;
      achievement = Math.round(achievement);

      if (!comment) {
        comment = sampleSummaries[Math.floor(Math.random() * sampleSummaries.length)];
      }

      const report = {
        user_id: user.id,
        report_date: dateStr,
        summary: `[${dateStr}] の作業報告`,
        satisfaction_level: satisfaction,
        achievement_rate: achievement,
        focus_level: focus,
        difficulty_level: difficulty,
        learning_level: learning,
        comment: comment,
        ai_generated: Math.random() > 0.7 ? 1 : 0
      };

      try {
        if (dbClient === 'pg') {
          await knex('daily_reports').insert(report).onConflict(['user_id', 'report_date']).ignore();
        } else {
          await knex('daily_reports').insert(report).onConflict().ignore();
        }
        count++;
      } catch (e) {
        // mysql2などonConflict構文が違う場合の簡易フォールバック（重複なら無視）
        // または、insertしてエラーならcatchするだけでもよい
      }
    }
  }

  console.log(`  -> ${count}件の日報データを生成しました`);
}

/**
 * アクティビティログのサンプルデータを生成する
 */
async function seedActivityLogs(knex, dbClient) {
  console.log('  -> アクティビティログを生成中...');

  const users = await knex('users').select('id').where('role', '!=', 'admin');
  const now = new Date();
  const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);
  let count = 0;

  for (const user of users) {
    // 直近24時間を生成
    for (let h = 0; h < 24; h++) {
      const timestamp = new Date(now);
      timestamp.setHours(timestamp.getHours() - h);

      const year = timestamp.getFullYear();
      const month = String(timestamp.getMonth() + 1).padStart(2, '0');
      const day = String(timestamp.getDate()).padStart(2, '0');
      const hours = String(timestamp.getHours()).padStart(2, '0');
      const minutes = String(timestamp.getMinutes()).padStart(2, '0');
      const seconds = String(timestamp.getSeconds()).padStart(2, '0');
      const localTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      const isLowActivity = user.id % 5 === 0; // 一部のユーザーを低活動に
      const baseActivity = isLowActivity ? 15 : (user.id % 2 === 0 ? 75 : 45);
      const score = Math.max(0, Math.min(100, Math.round(baseActivity + Math.random() * 20 - 10)));

      await knex('activity_logs').insert({
        user_id: user.id,
        activity_score: score,
        mouse_clicks: Math.round(score * 3),
        key_presses: Math.round(score * 10),
        mouse_wheel: Math.round(score / 2),
        active_window: 'Visual Studio Code',
        process_name: 'Code.exe',
        timestamp: localTimestamp
      });
      count++;
    }
  }

  console.log(`  -> ${count}件のアクティビティログを生成しました`);
}



/**
 * AI活動分析サマリーデータを生成する
 */
// @ts-ignore
async function seedHourlyActivitySummaries(knex, dbClient) {
  console.log('  -> AI活動分析サマリーデータを生成中...');

  // 既存データ削除
  try {
    // テーブルが存在するか確認してから削除（初回実行対策）
    await knex('hourly_activity_summary').del();
  } catch (e) {
    console.log('    (hourly_activity_summary table might not exist yet or empty)');
  }

  const users = [1, 2]; // Admin, PM
  const today = new Date();

  // 分析結果のテンプレート要素
  const issueTemplates = [
    "長時間の連続作業による疲労の兆候が見られます。",
    "コンテキストスイッチが多発しており、集中力が低下している可能性があります。",
    "特定ファイルへの変更が集中しており、リファクタリングの余地があります。",
    "休憩時間が不足しており、効率低下のリスクがあります。"
  ];

  const recommendationTemplates = [
    "ポモドーロテクニックを導入し、定期的な休憩を取りましょう。",
    "タスクを細分化し、一つずつ着実に完了させることをお勧めします。",
    "複雑なロジックは別関数に切り出し、可読性を向上させましょう。",
    "散歩やストレッチを行い、リフレッシュすることをお勧めします。"
  ];

  for (const userId of users) {
    // 1. 本日のデータ (9:00 - 現在時刻まで)
    const currentHour = today.getHours();
    const startScriptHour = 9;

    // 生成する時間の範囲 (最低でも数時間分作る)
    const endScriptHour = Math.max(currentHour, 12);

    for (let hour = startScriptHour; hour <= endScriptHour; hour++) {
      const hourStart = new Date(today);
      hourStart.setHours(hour, 0, 0, 0);

      const hourEnd = new Date(today);
      hourEnd.setHours(hour, 59, 59, 999);

      // スコア生成
      const concentrationScore = Math.floor(Math.random() * 41) + 60; // 60-100
      const progressScore = Math.floor(Math.random() * 41) + 50;      // 50-90
      const efficiencyScore = Math.floor(Math.random() * 31) + 60;    // 60-90

      // 分析結果JSON構築
      const analysisResult = {
        ConcentrationScore: concentrationScore,
        ProgressScore: progressScore,
        EfficiencyScore: efficiencyScore,
        ActivityIntensity: ["High", "Medium", "Low"][Math.floor(Math.random() * 3)],
        Issues: [issueTemplates[Math.floor(Math.random() * issueTemplates.length)]],
        Recommendations: [recommendationTemplates[Math.floor(Math.random() * recommendationTemplates.length)]],
        Summary: `${hour}時台は安定したパフォーマンスを発揮しました。特に集中度が${concentrationScore}点と高く維持されています。`
      };

      await knex('hourly_activity_summary').insert({
        user_id: userId,
        hour_start: hourStart.toISOString(),
        hour_end: hourEnd.toISOString(),
        mouse_clicks: Math.floor(Math.random() * 500) + 100,
        key_presses: Math.floor(Math.random() * 1000) + 200,
        mouse_wheel_scrolls: Math.floor(Math.random() * 200) + 50,
        total_active_seconds: Math.floor(Math.random() * 3000) + 600, // 10分〜60分
        top_windows: JSON.stringify([{ WindowTitle: "Visual Studio", DurationSeconds: 1800 }]),
        file_changes_count: Math.floor(Math.random() * 10),
        lines_added: Math.floor(Math.random() * 100),
        lines_removed: Math.floor(Math.random() * 50),
        activity_intensity: analysisResult.ActivityIntensity,
        avg_cpu_usage: Math.floor(Math.random() * 30) + 10,
        avg_memory_mb: Math.floor(Math.random() * 2000) + 4000,
        ai_analysis_status: 'completed',
        ai_analysis_result: JSON.stringify(analysisResult),
        created_at: new Date().toISOString()
      });
    }

    // 2. 過去7日間の履歴データ (1日1件、代表的な時間のものを作成)
    for (let d = 1; d <= 7; d++) {
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - d);

      // 代表として14:00〜15:00のデータを1件入れる (ヒストリー表示確認用)
      const hourStart = new Date(pastDate);
      hourStart.setHours(14, 0, 0, 0);
      const hourEnd = new Date(pastDate);
      hourEnd.setHours(14, 59, 59, 999);

      const concentrationScore = Math.floor(Math.random() * 40) + 50;
      const progressScore = Math.floor(Math.random() * 40) + 50;
      const efficiencyScore = Math.floor(Math.random() * 40) + 50;

      const analysisResult = {
        ConcentrationScore: concentrationScore,
        ProgressScore: progressScore,
        EfficiencyScore: efficiencyScore,
        ActivityIntensity: "Medium",
        Issues: [],
        Recommendations: [],
        Summary: `${d}日前(${pastDate.toLocaleDateString()})の活動分析です。全体的に平均的なパフォーマンスでした。`
      };

      await knex('hourly_activity_summary').insert({
        user_id: userId,
        hour_start: hourStart.toISOString(),
        hour_end: hourEnd.toISOString(),
        mouse_clicks: Math.floor(Math.random() * 300),
        key_presses: Math.floor(Math.random() * 600),
        mouse_wheel_scrolls: Math.floor(Math.random() * 100),
        total_active_seconds: Math.floor(Math.random() * 2000) + 500,
        top_windows: JSON.stringify([{ WindowTitle: "Chrome", DurationSeconds: 1200 }]),
        file_changes_count: Math.floor(Math.random() * 5),
        lines_added: Math.floor(Math.random() * 50),
        lines_removed: Math.floor(Math.random() * 20),
        activity_intensity: "Medium",
        avg_cpu_usage: 15,
        avg_memory_mb: 4500,
        ai_analysis_status: 'completed',
        ai_analysis_result: JSON.stringify(analysisResult),
        created_at: new Date().toISOString()
      });
    }
  }

  console.log('  -> AI活動分析サマリーデータ生成完了');
}

// 実行
initDatabase();

// ============================================================================
// 開発者「松本」向けデータ生成
// ============================================================================
// ============================================================================
// 開発者「松本」向けデータ生成
// ============================================================================
async function seedDevMatsumotoData(knex, dbClient) {
  console.log('  -> dev_matsumoto向けのサンプルデータを生成中...');

  try {
    // ユーザーID取得（存在しない場合は作成）
    let user = await knex('users').where('username', 'dev_matsumoto').first();
    if (!user) {
      console.log('    dev_matsumotoユーザーを作成します...');
      await knex('users').insert({
        username: 'dev_matsumoto',
        email: 'matsumoto@tsutaai.com',
        password_hash: 'demo_password',
        full_name: '松本 慎太郎',
        role: 'member'
      });
      user = await knex('users').where('username', 'dev_matsumoto').first();
    }
    const userId = user.id;

    // 1. 過去の通知を追加
    const notifications = [
      {
        user_id: userId,
        title: '【重要】プロジェクト進捗会議のお知らせ',
        message: '明日の15時からプロジェクト進捗会議を行います。第2会議室に集まってください。',
        type: 'info',
        is_read: 1,
        created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now', '-5 days')" : "NOW() - INTERVAL '5 days'")
      },
      {
        user_id: userId,
        title: 'タスク「API設計」の期限が迫っています',
        message: '担当タスクの期限まであと2日です。進捗状況を確認してください。',
        type: 'warning',
        is_read: 0,
        created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now', '-1 day')" : "NOW() - INTERVAL '1 day'")
      },
      {
        user_id: userId,
        title: 'コードレビュー依頼',
        message: '山田さんから「認証機能」のPRレビュー依頼が届いています。',
        type: 'task',
        is_read: 0,
        related_entity_type: 'pull_request',
        related_entity_id: 101,
        created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now', '-3 hours')" : "NOW() - INTERVAL '3 hours'")
      }
    ];

    for (const n of notifications) {
      await knex('notifications').insert(n);
    }

    // 日付フォーマットヘルパー
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // プロジェクト取得
    const project4 = await knex('projects').where('id', 4).first(); // 顧客管理システム
    const project6 = await knex('projects').where('id', 6).first(); // AIチャットボット

    // タスク生成用配列
    const tasksToCreate = [];

    // Project 4 tasks
    if (project4) {
      tasksToCreate.push({
        project_id: project4.id,
        name: '緊急対応: DB接続エラー調査',
        description: '本番環境で断続的にDB接続エラーが発生しています。ログ解析と原因特定をお願いします。',
        status: 'in_progress',
        assigned_to: userId,
        estimated_hours: 4,
        priority: 'high',
        start_date: todayStr,
        due_date: todayStr, // 本日が期限
        created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now')" : "NOW()")
      });

      tasksToCreate.push({
        project_id: project4.id,
        name: 'DBパフォーマンスチューニング',
        description: 'スロークエリの特定とインデックス最適化を実施してください。',
        status: 'todo',
        assigned_to: userId,
        estimated_hours: 8,
        priority: 'medium',
        start_date: todayStr, // 本日開始予定
        due_date: tomorrowStr,
        created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now')" : "NOW()")
      });
    }

    // Project 6 tasks
    if (project6) {
      tasksToCreate.push({
        project_id: project6.id,
        name: 'Chatbot応答精度の評価',
        description: '最新モデルの応答精度を検証データセットを用いて評価し、レポートを作成してください。',
        status: 'in_progress',
        assigned_to: userId,
        estimated_hours: 6,
        priority: 'high',
        start_date: yesterdayStr,
        end_date: tomorrowStr, // 期間内（今日を含む）
        progress: 50,
        created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now')" : "NOW()")
      });
    }

    // タスクを一括挿入し、最初のタスクIDを取得してヘルプリクエストに紐付け
    let firstTaskId = null;

    for (const taskData of tasksToCreate) {
      try {
        const id = await getInsertedId(knex, dbClient, 'tasks', taskData);
        if (!firstTaskId && taskData.name.includes('DB接続エラー調査')) {
          firstTaskId = id;
        }
        console.log(`    作成完了: タスク ID ${id} - ${taskData.name}`);
      } catch (err) {
        console.error(`    タスク作成エラー (${taskData.name}):`, err.message);
      }
    }

    // ヘルプリクエスト作成 (最初のタスクに対して)
    if (firstTaskId) {
      const admin = await knex('users').where('username', 'admin').first();
      const requesterId = admin ? admin.id : 1;

      const helpRequestData = {
        task_id: firstTaskId,
        requester_id: requesterId,
        request_title: 'DB接続エラーの調査支援',
        request_description: 'ログ解析の知見がある松本さんに調査をお願いしたいです。',
        urgency: 'high',
        ai_context_summary: '【ログ解析結果】\nエラーログによると、DB接続プールが枯渇している可能性があります。\n特に10:00-11:00の間に関数がタイムアウトしています。\n『Connection pool exhausted』というエラーが多数記録されています。\nコネクションリークの疑いがあるため、該当時間のトランザクション処理を確認することを推奨します。',
        problem_type: 'technical',
        status: 'assigned',
        assigned_to: userId,
        assigned_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now')" : "NOW()"),
        created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now')" : "NOW()")
      };

      try {
        const helpRequestId = await getInsertedId(knex, dbClient, 'help_requests', helpRequestData);

        // 通知作成
        await knex('notifications').insert({
          user_id: userId,
          title: 'ヘルプリクエストが割り当てられました',
          message: `管理者から緊急のヘルプリクエスト「${helpRequestData.request_title}」が割り当てられました。`,
          type: 'help_request',
          related_entity_type: 'help_request',
          related_entity_id: helpRequestId,
          is_read: 0,
          created_at: knex.raw(dbClient === 'better-sqlite3' ? "datetime('now')" : "NOW()")
        });

        console.log(`    作成完了: ヘルプリクエスト ID ${helpRequestId}`);
      } catch (err) {
        console.error('    ヘルプリクエスト作成エラー:', err.message);
      }
    }

  } catch (error) {
    console.error('    seedDevMatsumotoData 致命的エラー:', error);
  }
}
