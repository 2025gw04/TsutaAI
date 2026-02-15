const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PROMPT_DIR = path.resolve(process.cwd(), '..', 'prompts');

/**
 * プロンプト一覧を取得
 */
router.get('/', async (req, res) => {
    try {
        if (!fs.existsSync(PROMPT_DIR)) {
            return res.json({ success: true, data: [] });
        }

        // プロンプトの説明マッピング
        const promptDescriptions = {
            'critical-path-analysis': 'プロジェクトのクリティカルパス分析を行い、最も重要なタスクと依存関係を特定します',
            'daily-report': 'ユーザーの作業ログから日報を自動生成し、成果と課題をまとめます',
            'daily-report-draft': '作業ログから日報の下書きを生成し、報告作成をサポートします',
            'daily-report-trend-analysis': 'メンバーの日報データを分析し、管理者への具体的な対応策を提案します',
            'member-assistant-system': 'プロジェクトメンバー向けのAIアシスタントです。メンバーの日常業務をサポートし、タスク情報の照会・検索、進捗報告の支援を行います',
            'deadline-prediction': 'タスクの進捗状況から完了予定日を予測し、遅延リスクを評価します',
            'help-problem-detection': 'ヘルプリクエストから問題の種類と原因を自動検出します',
            'help-request-context-summary': 'ヘルプリクエストの背景情報を要約し、問題の全体像を把握しやすくします',
            'help-request-helper-suggestion': 'スキルと経験に基づいて最適なヘルパーを提案します',
            'help-request-refinement': 'ヘルプリクエストをより明確で具体的な内容に改善します',
            'hourly-activity-analysis': '1時間ごとのアクティビティデータを分析し、作業パターンを可視化します',
            'mental-health-advice': 'メンタルヘルスログからストレス状態を分析し、改善アドバイスを提供します',
            'progress-suggestion': 'タスクの進捗状況を分析し、効率化のための具体的な提案を行います',
            'project-field-generation': '新規プロジェクト作成時に未入力フィールドを自動生成します',
            'project-health-score': 'プロジェクトの健全性を多角的に評価し、スコアとリスク要因を算出します',
            'project-import-analysis': 'インポートファイルを解析し、プロジェクトとタスクの構造を自動抽出します',
            'project-summary': 'プロジェクトの現状を要約し、進捗率と現在のフェーズを明確化します',
            'risk-detection-json': 'プロジェクトデータからリスクを検出し、JSON形式で構造化して返します',
            'risk-detection': 'プロジェクトの潜在的なリスクを検出し、優先度付きで報告します',
            'sentiment-analysis-json': 'チームのコメントから感情を分析し、JSON形式でポジティブ・ネガティブ要素を抽出します',
            'sentiment-analysis': 'チームメンバーのコメントから全体的な雰囲気とモチベーションを分析します',
            'sprint-goal-analysis': 'スプリント目標の達成可能性を分析し、リスクと改善策を提案します',
            'task-allocation': 'メンバーのスキルと負荷を考慮して最適なタスク割り当てを提案します',
            'task-description-generate': 'タスク名から詳細な説明文を自動生成します',
            'task-duration-estimate': 'タスクの工数を見積もり、営業日ベースで開始日と終了日を算出します',
            'task-reschedule': '遅延や変更に応じてタスクのスケジュールを再調整し、最適な計画を提案します',
            'task-subdivide': '大きなタスクを適切な粒度の子タスクに分割し、それぞれに説明を付与します',
            'task-suggestion': 'プロジェクトの状況に応じて次に取り組むべきタスクを提案します',
            'team-contribution-analysis': 'チームメンバーの貢献度を分析し、強みと改善点を明確化します',
            'team-workload-assessment': 'チーム全体の作業負荷を評価し、リソース配分の最適化を提案します',
            'wbs-builder-finalize': 'WBSビルダーで作成したタスク構造に対して、各タスクの詳細情報（担当者、日程、優先度、成果物）を補完・生成します',
            'wbs-builder-generate': 'WBSビルダーで段階的にタスクを生成し、対話的にWBSを構築します',
            'wbs-chat-system': 'WBS作成時のAIチャット機能のシステムプロンプトを定義します',
            'wbs-decompose': 'タスクを子タスクに分解し、階層的なWBS構造を作成します',
            'wbs-generation': 'プロジェクト情報から完全なWBSを自動生成します（廃止予定）',
            'wbs-phase-detail': 'WBSのフェーズごとに詳細なタスクを生成します',
            'wbs-phase-outline': 'プロジェクトの主要フェーズの概要を生成します',
            'wbs-sanity-check': 'WBS全体の整合性をチェックし、問題点と改善提案を提示します',
            'wbs-task-refine': 'タスクの内容を洗練し、より明確で実行可能な形に改善します'
        };

        const files = fs.readdirSync(PROMPT_DIR);
        const prompts = files
            .filter(file => file.endsWith('.txt'))
            .map(file => {
                const name = file.replace('.txt', '');
                const filePath = path.join(PROMPT_DIR, file);
                const stats = fs.statSync(filePath);
                const content = fs.readFileSync(filePath, 'utf-8');

                // プロンプトの説明を取得（マッピングから、なければファイルの最初の行から）
                let description = promptDescriptions[name] || '';

                if (!description) {
                    const firstLine = content.split('\n')[0];
                    description = firstLine.startsWith('#') || firstLine.startsWith('//')
                        ? firstLine.replace(/^[#\/]+\s*/, '').trim()
                        : '';
                }

                return {
                    name,
                    description,
                    size: stats.size,
                    content: content
                };
            });

        res.json({ success: true, data: prompts });
    } catch (error) {
        logger.error('プロンプト一覧取得エラー:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 特定のプロンプトを取得
 */
router.get('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const filePath = path.join(PROMPT_DIR, `${name}.txt`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'プロンプトが見つかりません' });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const stats = fs.statSync(filePath);

        res.json({
            success: true,
            data: {
                name,
                content,
                size: stats.size
            }
        });
    } catch (error) {
        logger.error('プロンプト取得エラー:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * プロンプトを更新
 */
router.put('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, error: 'プロンプト内容が必要です' });
        }

        const filePath = path.join(PROMPT_DIR, `${name}.txt`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'プロンプトが見つかりません' });
        }

        // バックアップを作成
        const backupDir = path.join(PROMPT_DIR, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `${name}_${timestamp}.txt`);
        fs.copyFileSync(filePath, backupPath);

        // プロンプトを更新
        fs.writeFileSync(filePath, content, 'utf-8');

        logger.info(`プロンプト更新: ${name} (バックアップ: ${backupPath})`);

        res.json({ success: true, message: 'プロンプトを更新しました' });
    } catch (error) {
        logger.error('プロンプト更新エラー:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * プロンプトをデフォルトに戻す（カスタマイズを削除）
 * 注: この実装では、バックアップから復元する必要があります
 */
router.delete('/:name', async (req, res) => {
    try {
        const { name } = req.params;

        // この機能は、元のプロンプトファイルを別の場所に保存している場合に有効
        // 現在の実装では、バックアップから手動で復元する必要があります

        res.json({
            success: false,
            error: 'デフォルトに戻す機能は現在サポートされていません。バックアップから手動で復元してください。'
        });
    } catch (error) {
        logger.error('プロンプトリセットエラー:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
