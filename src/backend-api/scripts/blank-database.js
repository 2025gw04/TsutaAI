/**
 * 本番用データベース初期化スクリプト (Knex.js対応版)
 * 既存のデータベースを削除し、マイグレーションを実行してデータベースを初期化します
 * テストデータは含まず、adminユーザーと基本設定のみを作成します
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
const backupPath = path.join(__dirname, '../../database/tsutaai_blank_backup.db');
const schemaPath = path.join(__dirname, '../../database/schema.sql');

console.log('本番用データベース初期化スクリプト（Knex.js対応版）');
console.log('========================================');
console.log('データベースクライアント:', dbClient);
console.log('環境:', env);
console.log('========================================\n');

async function initBlankDatabase() {
    let knex;

    try {
        // ステップ1: SQLiteの場合は既存のデータベースをバックアップ
        if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
            if (fs.existsSync(dbPath)) {
                console.log('[1/5] 既存データベースをバックアップ中...');
                try {
                    fs.copyFileSync(dbPath, backupPath);
                    console.log('OK: バックアップ完了:', backupPath);
                } catch (error) {
                    console.log('WARNING: バックアップに失敗しました:', error.message);
                }
            } else {
                console.log('[1/5] 既存データベースが見つかりません（新規作成）');
            }

            // ステップ2: 既存のデータベースを削除
            if (fs.existsSync(dbPath)) {
                console.log('\n[2/5] 既存データベースを削除中...');
                try {
                    fs.unlinkSync(dbPath);
                    console.log('OK: 削除完了');
                } catch (error) {
                    console.error('ERROR: 削除失敗:', error.message);
                    process.exit(1);
                }
            } else {
                console.log('\n[2/5] 削除するデータベースがありません');
            }
        } else {
            console.log('[1/5] 非SQLiteデータベース - バックアップスキップ');
            console.log('[2/5] 非SQLiteデータベース - ファイル削除スキップ');
        }

        // ステップ3: Knex接続を初期化
        console.log('\n[3/5] データベース接続を初期化中...');
        const Knex = require('knex');
        knex = Knex(config);
        console.log('OK: 接続成功');

        // ステップ4: スキーマを作成（schema.sqlを実行、または手動でテーブル作成）
        console.log('\n[4/5] スキーマを作成中...');

        if ((dbClient === 'better-sqlite3' || dbClient === 'sqlite3') && fs.existsSync(schemaPath)) {
            // SQLiteの場合はschema.sqlを直接実行（互換性のため）
            const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
            // SQLiteでは複数のステートメントを個別に実行する必要がある場合がある
            const statements = schemaSql.split(';').filter(s => s.trim());
            for (const stmt of statements) {
                if (stmt.trim()) {
                    await knex.raw(stmt);
                }
            }
            console.log('OK: スキーマ作成完了 (schema.sql)');
        } else if (fs.existsSync(schemaPath)) {
            // 他のDBの場合もschema.sqlを試す
            try {
                const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
                await knex.raw(schemaSql);
                console.log('OK: スキーマ作成完了 (schema.sql)');
            } catch (schemaError) {
                console.log('WARNING: schema.sqlの実行に失敗。マイグレーションを試みます...');
                await knex.migrate.latest();
                console.log('OK: マイグレーション完了');
            }
        } else {
            // schema.sqlがない場合はマイグレーションを実行
            console.log('schema.sqlが見つかりません。マイグレーションを実行します...');
            await knex.migrate.latest();
            console.log('OK: マイグレーション完了');
        }

        // ステップ5: 基本データを投入（adminユーザーとシステム設定のみ）
        console.log('\n[5/5] 基本データを投入中...');
        await seedAdminUser(knex, dbClient);
        await seedSystemSettings(knex, dbClient);
        console.log('OK: 基本データ投入完了');

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
        console.log('管理者ユーザー:');
        console.log('  ユーザー名: admin');
        console.log('  パスワード: admin123\n');
        console.log('データベースは本番運用可能な状態です。');
        console.log('プロジェクト、メンバー、見積もりなどのデータは含まれていません。\n');

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

/**
 * ID取得ヘルパー関数（PostgreSQL対応）
 */
async function getInsertedId(knex, dbClient, tableName, data, idColumn = 'id') {
    if (dbClient === 'pg') {
        const [result] = await knex(tableName).insert(data).returning(idColumn);
        return typeof result === 'object' ? result[idColumn] : result;
    } else {
        const [id] = await knex(tableName).insert(data);
        return id;
    }
}

/**
 * 管理者ユーザーを作成する
 */
async function seedAdminUser(knex, dbClient) {
    console.log('  -> 管理者ユーザーを作成中...');

    // bcryptを使用してパスワードをハッシュ化
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('admin123', 10);

    try {
        await knex('users').insert({
            id: 1,
            username: 'admin',
            password_hash: hashedPassword,
            email: 'admin@example.com',
            full_name: 'Administrator',
            role: 'admin',
            created_at: new Date().toISOString()
        });
        console.log('  -> 管理者ユーザー作成完了 (username: admin, password: admin123)');
    } catch (error) {
        if (error.message.includes('UNIQUE') || error.message.includes('Duplicate')) {
            console.log('  -> 管理者ユーザーは既に存在します');
        } else {
            throw error;
        }
    }
}

/**
 * システム設定のデフォルト値を生成する（API keyは含まない）
 */
async function seedSystemSettings(knex, dbClient) {
    console.log('  -> システム設定のデフォルト値を生成中...');

    const settings = [
        { key: 'groq_endpoint', value: 'https://api.groq.com/openai/v1/chat/completions', type: 'string', description: 'AI APIエンドポイントURL' },
        { key: 'ai_model', value: 'openai/gpt-oss-20b', type: 'string', description: 'AIモデル名' },
        { key: 'ai_temperature', value: '0.3', type: 'number', description: 'AI応答の温度パラメータ' },
        { key: 'ai_max_tokens', value: '65536', type: 'number', description: 'AI応答の最大トークン数' },
        { key: 'proxy_enabled', value: 'false', type: 'boolean', description: 'プロキシ使用の有効/無効' }
    ];

    let count = 0;
    for (const s of settings) {
        try {
            await knex('system_settings').insert({
                setting_key: s.key,
                setting_value: s.value,
                setting_type: s.type,
                description: s.description
            }).onConflict('setting_key').ignore();
            count++;
        } catch (e) {
            // 重複エラーは無視
        }
    }

    console.log(`  -> ${count}件のシステム設定を生成しました（API keyは含まれていません）`);
}

// 実行
initBlankDatabase();
