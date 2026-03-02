/**
 * 本番用データベース初期化スクリプト
 * 既存のデータベースを初期化し、管理者アカウントのみを作成します。
 * サンプルデータは投入しません。
 */

const path = require('path');
const fs = require('fs');
const knexConfig = require('../knexfile');

// 環境設定
const env = process.env.NODE_ENV || 'development';
const config = knexConfig[env];
const dbClient = config.client;

const dbPath = path.join(__dirname, '../../database/tsutaai.db');
const backupPath = path.join(__dirname, '../../database/tsutaai_prod_init_backup.db');

console.log('データリセット・管理者初期化スクリプト');
console.log('========================================');
console.log('データベースクライアント:', dbClient);
console.log('環境:', env);
console.log('NOTE: サンプルデータは生成されません');
console.log('========================================\n');

async function initDatabase() {
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
            }

            // 既存の設定を退避（APIキーやモデル設定を維持するため）
            let preservedSettings = [];
            if (fs.existsSync(dbPath)) {
                console.log('\n[1.5/5] LLM設定を退避中...');
                try {
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
                    global.preservedLlmSettings = preservedSettings;
                } catch (e) {
                    console.log('  -> 設定テーブルが見つからないか、読み取りに失敗しました（スキップします）:', e.message);
                }
            }

            // ステップ2: 既存のデータベースを削除
            if (fs.existsSync(dbPath)) {
                console.log('\n[2/5] 既存データベースを削除中...');
                try {
                    fs.unlinkSync(dbPath);
                    const walPath = dbPath + '-wal';
                    const shmPath = dbPath + '-shm';
                    if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch (e) { }
                    if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch (e) { }
                    console.log('OK: 削除完了');
                } catch (error) {
                    console.error('WARNING: 削除に失敗しました:', error.message);
                    console.log('そのまま続行します。');
                }
            }
        }

        // ステップ3: Knex接続を初期化
        console.log('\n[3/5] データベース接続を初期化中...');
        const Knex = require('knex');
        knex = Knex(config);
        console.log('OK: 接続成功');

        // ステップ3.5: 既存テーブルのクリーンアップ（SQLite以外、または削除失敗時）
        if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
            try {
                const conn = await knex.client.acquireRawConnection();
                try {
                    conn.exec('PRAGMA foreign_keys = OFF;');
                    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
                    if (tables.length > 0) {
                        console.log(`  -> 残存テーブルをクリーンアップします...`);
                        for (const table of tables) {
                            try { conn.exec(`DROP TABLE IF EXISTS "${table.name}"`); } catch (e) { }
                        }
                    }
                } finally {
                    await knex.client.releaseConnection(conn);
                }
            } catch (e) {
                console.warn('  WARNING: テーブルクリーンアップ中にエラー:', e.message);
            }
        }

        // ステップ4: スキーマを作成（マイグレーションを実行）
        console.log('\n[4/5] スキーマを作成中 (マイグレーション実行)...');
        try {
            await knex.migrate.latest();
            console.log('OK: マイグレーション完了');
        } catch (e) {
            console.error('ERROR: マイグレーション失敗:', e.message);
            throw e;
        }

        // ステップ5: 管理者アカウントと設定のみ追加
        console.log('\n[5/5] 管理者アカウントとシステム設定を作成中...');

        // システム設定
        await seedSystemSettings(knex, dbClient);

        // 管理者ユーザー
        await seedAdminUser(knex);

        await knex.destroy();

        console.log('\n========================================');
        console.log('初期化完了！');
        console.log('========================================\n');
        console.log('作成されたユーザー:');
        console.log('  ユーザー名: admin');
        console.log('  パスワード: demo_password');
        console.log('\n※サンプルデータは含まれていません。');
        console.log('========================================\n');

        process.exit(0);
    } catch (error) {
        console.error('\nERROR: 初期化失敗:', error.message);
        console.error(error.stack);
        if (knex) await knex.destroy();
        process.exit(1);
    }
}

/**
 * 管理者ユーザーを作成する
 */
async function seedAdminUser(knex) {
    console.log('  -> 管理者ユーザーを作成しています...');
    try {
        await knex('users').insert({
            username: 'admin',
            email: 'admin@tsutaai.com',
            password_hash: 'demo_password', // 本番環境では変更推奨
            full_name: '管理者',
            role: 'admin'
        }).onConflict('username').ignore();
        console.log('  OK: 管理者ユーザー作成完了');
    } catch (e) {
        console.error('  ERROR: 管理者ユーザー作成失敗:', e.message);
        throw e;
    }
}

/**
 * システム設定のデフォルト値を生成する
 */
async function seedSystemSettings(knex, dbClient) {
    console.log('  -> システム設定を生成中...');

    const preserved = global.preservedLlmSettings || [];

    // 旧キーから新キーへのマッピング
    const keyMapping = {
        'groq_api_key': 'llm_api_key',
        'groq_endpoint': 'llm_endpoint',
        'ai_model': 'llm_model'
    };

    const deprecatedKeys = ['groq_api_key', 'groq_endpoint', 'ai_model'];

    const defaultSettings = [
        { key: 'llm_provider', value: 'groq', type: 'string', description: 'LLMプロバイダー' },
        { key: 'llm_endpoint', value: 'https://api.groq.com/openai/v1/chat/completions', type: 'string', description: 'LLM APIエンドポイントURL' },
        { key: 'llm_model', value: 'openai/gpt-oss-20b', type: 'string', description: 'LLMモデル名' },
        { key: 'ai_temperature', value: '0.3', type: 'number', description: 'AI応答の温度パラメータ' },
        { key: 'ai_max_tokens', value: '65536', type: 'number', description: 'AI応答の最大トークン数' },
        { key: 'proxy_enabled', value: 'false', type: 'boolean', description: 'プロキシ使用の有効/無効' }
    ];

    const finalSettings = [...defaultSettings];
    for (const p of preserved) {
        const targetKey = keyMapping[p.setting_key] || p.setting_key;
        if (!p.setting_value || p.setting_value === '********') continue;
        const existingIndex = finalSettings.findIndex(s => s.key === targetKey);
        if (existingIndex !== -1) {
            finalSettings[existingIndex].value = p.setting_value;
        } else if (!deprecatedKeys.includes(targetKey)) {
            finalSettings.push({
                key: targetKey,
                value: p.setting_value,
                type: p.setting_type,
                description: p.description
            });
        }
    }

    const uniqueSettings = [];
    const seenKeys = new Set();
    for (const s of finalSettings) {
        if (!seenKeys.has(s.key)) {
            uniqueSettings.push(s);
            seenKeys.add(s.key);
        }
    }

    for (const s of uniqueSettings) {
        try {
            await knex('system_settings').insert({
                setting_key: s.key,
                setting_value: s.value,
                setting_type: s.type,
                description: s.description
            }).onConflict('setting_key').merge();
        } catch (e) {
            console.error(`    Warning: 設定 ${s.key} の登録に失敗しました:`, e.message);
        }
    }
    console.log('  OK: システム設定完了');
}

if (require.main === module) {
    initDatabase();
}
