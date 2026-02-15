/**
 * 環境変数検証スクリプト
 * 起動時に必須の環境変数が設定されているかチェックします
 */

const fs = require('fs');
const path = require('path');

// 色付きコンソール出力
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 環境変数の検証ルール
const validationRules = {
    // 必須項目
    required: [
        'GROQ_API_KEY'
    ],

    // 本番環境で必須
    productionRequired: [
        'JWT_SECRET',
        'ENCRYPTION_KEY'
    ],

    // 推奨項目
    recommended: [
        'NODE_ENV',
        'PORT',
        'LOG_LEVEL'
    ],

    // 弱いデフォルト値（変更が必要）
    weakDefaults: {
        'JWT_SECRET': [
            'tsutaai-secret-key-change-in-production',
            'CHANGE_THIS_TO_A_STRONG_SECRET_KEY_MIN_32_CHARACTERS'
        ],
        'ENCRYPTION_KEY': [
            'change-this-to-a-strong-random-key-in-production'
        ]
    }
};

// 検証結果
const results = {
    errors: [],
    warnings: [],
    info: []
};

/**
 * 環境変数の存在チェック
 */
function checkRequired() {
    log('\n=== 必須環境変数のチェック ===', 'cyan');

    validationRules.required.forEach(key => {
        if (!process.env[key]) {
            results.errors.push(`${key} が設定されていません`);
            log(`✗ ${key}: 未設定`, 'red');
        } else {
            log(`✓ ${key}: 設定済み`, 'green');
        }
    });
}

/**
 * 本番環境の検証
 */
function checkProduction() {
    if (process.env.NODE_ENV === 'production') {
        log('\n=== 本番環境設定のチェック ===', 'cyan');

        validationRules.productionRequired.forEach(key => {
            if (!process.env[key]) {
                results.errors.push(`本番環境では ${key} の設定が必須です`);
                log(`✗ ${key}: 未設定（本番環境では必須）`, 'red');
            } else {
                log(`✓ ${key}: 設定済み`, 'green');
            }
        });

        // HTTPS チェック
        if (process.env.ENABLE_HTTPS !== 'true') {
            results.warnings.push('本番環境ではHTTPSを有効にすることを強く推奨します');
            log(`⚠ HTTPS: 無効（本番環境では有効化を推奨）`, 'yellow');
        } else {
            log(`✓ HTTPS: 有効`, 'green');
        }
    }
}

/**
 * 弱いデフォルト値のチェック
 */
function checkWeakDefaults() {
    log('\n=== セキュリティ設定のチェック ===', 'cyan');

    Object.keys(validationRules.weakDefaults).forEach(key => {
        const value = process.env[key];
        const weakValues = validationRules.weakDefaults[key];

        if (value && weakValues.includes(value)) {
            results.warnings.push(`${key} がデフォルト値のままです。本番環境では必ず変更してください`);
            log(`⚠ ${key}: デフォルト値のまま（変更が必要）`, 'yellow');
        } else if (value) {
            // 最小長チェック
            if (key === 'JWT_SECRET' && value.length < 32) {
                results.warnings.push(`${key} は32文字以上を推奨します（現在: ${value.length}文字）`);
                log(`⚠ ${key}: 短すぎます（${value.length}文字、32文字以上を推奨）`, 'yellow');
            } else {
                log(`✓ ${key}: カスタム値が設定されています`, 'green');
            }
        }
    });
}

/**
 * 推奨設定のチェック
 */
function checkRecommended() {
    log('\n=== 推奨設定のチェック ===', 'cyan');

    validationRules.recommended.forEach(key => {
        if (!process.env[key]) {
            results.info.push(`${key} の設定を推奨します`);
            log(`ℹ ${key}: 未設定（推奨）`, 'blue');
        } else {
            log(`✓ ${key}: ${process.env[key]}`, 'green');
        }
    });
}

/**
 * .envファイルの存在チェック
 */
function checkEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', '.env.example');

    if (!fs.existsSync(envPath)) {
        if (fs.existsSync(envExamplePath)) {
            results.warnings.push('.envファイルが見つかりません。.env.exampleをコピーして作成してください');
            log('\n⚠ .envファイルが見つかりません', 'yellow');
            log('  以下のコマンドで作成できます:', 'yellow');
            log('  cp .env.example .env', 'cyan');
        } else {
            results.errors.push('.envファイルと.env.exampleファイルの両方が見つかりません');
            log('\n✗ .envファイルが見つかりません', 'red');
        }
    } else {
        log('\n✓ .envファイルが見つかりました', 'green');
    }
}

/**
 * 結果のサマリー表示
 */
function showSummary() {
    log('\n' + '='.repeat(50), 'cyan');
    log('検証結果サマリー', 'cyan');
    log('='.repeat(50), 'cyan');

    if (results.errors.length > 0) {
        log(`\n✗ エラー: ${results.errors.length}件`, 'red');
        results.errors.forEach(err => log(`  - ${err}`, 'red'));
    }

    if (results.warnings.length > 0) {
        log(`\n⚠ 警告: ${results.warnings.length}件`, 'yellow');
        results.warnings.forEach(warn => log(`  - ${warn}`, 'yellow'));
    }

    if (results.info.length > 0) {
        log(`\nℹ 情報: ${results.info.length}件`, 'blue');
        results.info.forEach(info => log(`  - ${info}`, 'blue'));
    }

    if (results.errors.length === 0 && results.warnings.length === 0) {
        log('\n✓ すべての検証に合格しました！', 'green');
    }

    log('\n' + '='.repeat(50) + '\n', 'cyan');
}

/**
 * メイン処理
 */
function main() {
    log('\n' + '='.repeat(50), 'cyan');
    log('TsutaAI 環境変数検証', 'cyan');
    log('='.repeat(50), 'cyan');

    // .envファイルのチェック
    checkEnvFile();

    // 各種検証
    checkRequired();
    checkProduction();
    checkWeakDefaults();
    checkRecommended();

    // サマリー表示
    showSummary();

    // エラーがある場合は終了コード1で終了
    if (results.errors.length > 0) {
        process.exit(1);
    }
}

// スクリプトとして実行された場合
if (require.main === module) {
    main();
}

module.exports = { main, results };
