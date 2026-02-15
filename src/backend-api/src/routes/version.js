const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

/**
 * バージョン情報とCHANGELOGを取得
 * GET /api/version
 */
router.get('/', async (req, res) => {
    try {
        // package.jsonからバージョン情報を取得
        // __dirname は src/routes ディレクトリ
        const packageJsonPath = path.join(__dirname, '../../package.json');
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // CHANGELOGを取得（web-adminディレクトリから）
        // src/routes -> backend-api/src -> backend-api -> TsutaAI -> web-admin
        const changelogPath = path.join(__dirname, '../../../web-admin/CHANGELOG.md');
        let changelog = '';
        try {
            changelog = await fs.readFile(changelogPath, 'utf-8');
        } catch (err) {
            console.warn('CHANGELOG.md not found:', err.message);
            changelog = '# 変更履歴\n\n変更履歴ファイルが見つかりません。';
        }

        // CHANGELOGをパースしてバージョンリストを作成
        const versions = parseChangelog(changelog);

        res.json({
            success: true,
            data: {
                currentVersion: packageJson.version || '1.0.0',
                name: packageJson.name || 'TsutaAI Web Admin',
                description: packageJson.description || '',
                changelog: changelog,
                versions: versions
            }
        });
    } catch (error) {
        console.error('Error fetching version info:', error);
        res.status(500).json({
            success: false,
            error: 'バージョン情報の取得に失敗しました。'
        });
    }
});

/**
 * CHANGELOGをパースしてバージョンリストを作成
 */
function parseChangelog(changelog) {
    const versions = [];
    const lines = changelog.split('\n');

    let currentVersion = null;
    let currentSection = null;

    for (const line of lines) {
        // バージョンヘッダーを検出: ## [1.0.0] - 2026-01-03
        const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s+-\s+(.+)/);
        if (versionMatch) {
            if (currentVersion) {
                versions.push(currentVersion);
            }
            currentVersion = {
                version: versionMatch[1],
                date: versionMatch[2],
                added: [],
                changed: [],
                fixed: [],
                removed: []
            };
            currentSection = null;
            continue;
        }

        // セクションヘッダーを検出: ### 追加
        const sectionMatch = line.match(/^###\s+(.+)/);
        if (sectionMatch && currentVersion) {
            const sectionName = sectionMatch[1];
            if (sectionName === '追加') currentSection = 'added';
            else if (sectionName === '変更') currentSection = 'changed';
            else if (sectionName === '修正') currentSection = 'fixed';
            else if (sectionName === '削除') currentSection = 'removed';
            continue;
        }

        // リスト項目を検出: - 項目
        const itemMatch = line.match(/^-\s+(.+)/);
        if (itemMatch && currentVersion && currentSection) {
            const item = itemMatch[1];
            if (item !== 'なし') {
                currentVersion[currentSection].push(item);
            }
        }
    }

    // 最後のバージョンを追加
    if (currentVersion) {
        versions.push(currentVersion);
    }

    return versions;
}

module.exports = router;
