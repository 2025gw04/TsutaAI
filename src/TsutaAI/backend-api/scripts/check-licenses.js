#!/usr/bin/env node

/**
 * 依存パッケージのライセンスチェックスクリプト
 * 商用利用に問題のあるライセンスを検出します
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

// 商用利用可能なライセンス
const ALLOWED_LICENSES = [
    'MIT',
    'ISC',
    'BSD',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'Apache',
    'Apache-2.0',
    'Apache 2.0',
    'Artistic-2.0',
    'Unlicense',
    'CC0-1.0',
    '0BSD',
    'BlueOak-1.0.0',
    'Python-2.0'
];

// 商用利用に問題があるライセンス（コピーレフト）
const PROBLEMATIC_LICENSES = [
    'GPL',
    'GPL-2.0',
    'GPL-3.0',
    'LGPL',
    'LGPL-2.1',
    'LGPL-3.0',
    'AGPL',
    'AGPL-3.0',
    'MPL',
    'SSPL',
    'BUSL',
    'EPL',
    'EUPL',
    'OSL'
];

// 警告が必要なライセンス
const WARNING_LICENSES = [
    'UNLICENSED',
    'UNKNOWN',
    'SEE LICENSE IN'
];

/**
 * package.jsonからすべての依存関係を取得
 */
function getAllDependencies() {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
    };

    return dependencies;
}

/**
 * パッケージのライセンス情報を取得
 */
function getPackageLicense(packageName) {
    try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`, {
            paths: [path.join(__dirname, '..', 'node_modules')]
        });
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        let license = packageJson.license;

        // licensesフィールドもチェック
        if (!license && packageJson.licenses) {
            license = packageJson.licenses.map(l => l.type || l).join(', ');
        }

        return {
            name: packageName,
            version: packageJson.version,
            license: license || 'UNKNOWN',
            repository: packageJson.repository?.url || packageJson.repository || 'N/A'
        };
    } catch (error) {
        return {
            name: packageName,
            version: 'N/A',
            license: 'UNKNOWN',
            repository: 'N/A',
            error: error.message
        };
    }
}

/**
 * ライセンスの分類
 */
function classifyLicense(license) {
    const licenseUpper = String(license).toUpperCase();

    // 許可されたライセンス
    for (const allowed of ALLOWED_LICENSES) {
        if (licenseUpper.includes(allowed.toUpperCase())) {
            return 'allowed';
        }
    }

    // 問題のあるライセンス
    for (const problematic of PROBLEMATIC_LICENSES) {
        if (licenseUpper.includes(problematic.toUpperCase())) {
            return 'problematic';
        }
    }

    // 警告が必要なライセンス
    for (const warning of WARNING_LICENSES) {
        if (licenseUpper.includes(warning.toUpperCase())) {
            return 'warning';
        }
    }

    // 不明なライセンス
    return 'unknown';
}

/**
 * メイン処理
 */
function main() {
    log('\n' + '='.repeat(70), 'cyan');
    log('TsutaAI 依存パッケージライセンスチェック', 'cyan');
    log('='.repeat(70) + '\n', 'cyan');

    const dependencies = getAllDependencies();
    const totalPackages = Object.keys(dependencies).length;

    log(`合計パッケージ数: ${totalPackages}\n`, 'blue');

    const results = {
        allowed: [],
        problematic: [],
        warning: [],
        unknown: []
    };

    // 各パッケージのライセンスをチェック
    log('ライセンスをチェック中...', 'blue');
    for (const packageName of Object.keys(dependencies)) {
        const info = getPackageLicense(packageName);
        const classification = classifyLicense(info.license);
        results[classification].push(info);
    }

    // 結果の表示
    log('\n' + '='.repeat(70), 'cyan');
    log('チェック結果', 'cyan');
    log('='.repeat(70) + '\n', 'cyan');

    // 問題のあるライセンス
    if (results.problematic.length > 0) {
        log(`✗ 問題のあるライセンス: ${results.problematic.length}件`, 'red');
        results.problematic.forEach(pkg => {
            log(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`, 'red');
        });
        log('', 'reset');
    }

    // 警告が必要なライセンス
    if (results.warning.length > 0) {
        log(`⚠ 確認が必要なライセンス: ${results.warning.length}件`, 'yellow');
        results.warning.forEach(pkg => {
            log(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`, 'yellow');
        });
        log('', 'reset');
    }

    // 不明なライセンス
    if (results.unknown.length > 0) {
        log(`? 不明なライセンス: ${results.unknown.length}件`, 'yellow');
        results.unknown.forEach(pkg => {
            log(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`, 'yellow');
        });
        log('', 'reset');
    }

    // 許可されたライセンス
    log(`✓ 問題のないライセンス: ${results.allowed.length}件`, 'green');
    log('', 'reset');

    // サマリー
    log('='.repeat(70), 'cyan');
    log('サマリー', 'cyan');
    log('='.repeat(70), 'cyan');

    if (results.problematic.length > 0) {
        log('\n✗ 商用利用に問題のあるライセンスが検出されました', 'red');
        log('これらのパッケージは削除するか、代替パッケージに置き換える必要があります', 'red');
    } else if (results.warning.length > 0 || results.unknown.length > 0) {
        log('\n⚠ 確認が必要なライセンスが検出されました', 'yellow');
        log('これらのパッケージのライセンスを手動で確認してください', 'yellow');
    } else {
        log('\n✓ すべてのライセンスが商用利用可能です', 'green');
    }

    // THIRD-PARTY-NOTICES.txtの生成
    log('\n='.repeat(70), 'cyan');
    log('THIRD-PARTY-NOTICES.txt を生成中...', 'blue');

    const notices = generateThirdPartyNotices([
        ...results.allowed,
        ...results.warning,
        ...results.unknown
    ]);

    const noticesPath = path.join(__dirname, '..', '..', 'THIRD-PARTY-NOTICES.txt');
    fs.writeFileSync(noticesPath, notices, 'utf8');

    log(`✓ THIRD-PARTY-NOTICES.txt を作成しました: ${noticesPath}`, 'green');
    log('='.repeat(70) + '\n', 'cyan');

    // 終了コード
    if (results.problematic.length > 0) {
        process.exit(1);
    }
}

/**
 * THIRD-PARTY-NOTICES.txtの生成
 */
function generateThirdPartyNotices(packages) {
    let notices = 'TsutaAI - Third Party Notices\n';
    notices += '='.repeat(70) + '\n\n';
    notices += 'This software incorporates components from the projects listed below.\n\n';

    for (const pkg of packages) {
        notices += '-'.repeat(70) + '\n';
        notices += `Package: ${pkg.name}\n`;
        notices += `Version: ${pkg.version}\n`;
        notices += `License: ${pkg.license}\n`;
        notices += `Repository: ${pkg.repository}\n`;
        notices += '\n';
    }

    notices += '='.repeat(70) + '\n';
    notices += 'End of Third Party Notices\n';

    return notices;
}

// スクリプトとして実行された場合
if (require.main === module) {
    main();
}
