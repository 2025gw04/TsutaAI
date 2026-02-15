// 成長分析AI サービス (Knex.js対応版)
const aiService = require('./aiService');
const growthTrackingService = require('./growthTrackingService');
const userService = require('./userService');

/**
 * メンバーの強みを分析（AI）
 * @param {number} userId - ユーザーID
 * @returns {Promise<Object>} 強み分析結果
 */
async function analyzeStrengths(userId) {
  // 成長レポートを取得 (now async)
  const report = await growthTrackingService.generateGrowthReport(userId, {
    months: 6,
    includeGoals: false,
    includeContributions: true
  });

  // プロンプトを構築
  const prompt = `
あなたはプロジェクトマネージャーとして、メンバーの成長を支援する役割を担っています。
以下のメンバーのデータを分析し、強みを3〜5つ抽出してください。

【メンバー情報】
名前: ${report.user.fullName}
ロール: ${report.user.role}

【現在のスキル】
${report.skillGrowth.current.map(s => `- ${s.skillName || s.name}: レベル ${s.skillLevel || s.level}/10`).join('\n')}

【スキルの成長（過去6ヶ月）】
${report.skillGrowth.changes.map(c => `- ${c.name}: ${c.oldLevel} → ${c.currentLevel} (${c.change > 0 ? '+' : ''}${c.change})`).join('\n')}

【パフォーマンスメトリクス（最新）】
${report.performance.latest ? `
- タスク完了速度: チーム平均の ${report.performance.latest.taskCompletionRate}%
- バグ率: ${report.performance.latest.bugRate}%
- ヘルプ対応回数: ${report.performance.latest.helpCount}回/月
- 集中度: ${report.performance.latest.focusLevelAvg}/100
- 完了タスク数: ${report.performance.latest.tasksCompleted}件
` : '（データなし）'}

【今月の主な貢献】
${report.contributions.map(c => `- ${c.title} (${c.impactLevel === 'high' ? '高' : c.impactLevel === 'medium' ? '中' : '低'}インパクト)`).join('\n') || '（データなし）'}

上記のデータから、このメンバーの強みを3〜5つ抽出してください。
各強みは、具体的な数値やスキルに基づいて記述してください。

【出力フォーマット】
\`\`\`json
{
  "strengths": [
    {
      "name": "具体的な強み1",
      "score": 9,
      "reason": "強みの根拠"
    },
    {
      "name": "具体的な強み2",
      "score": 8,
      "reason": "強みの根拠"
    }
  ]
}
\`\`\`

JSON以外の文字列は含めないでください。
`;

  try {
    const result = await aiService.callAI(prompt, { responseFormat: 'json' });
    const parsed = JSON.parse(result);
    return {
      strengths: parsed.strengths || []
    };
  } catch (error) {
    console.error('強み分析AIエラー:', error);
    return {
      strengths: [
        { name: '安定したタスク遂行能力', score: 8, reason: '継続的なタスク完了実績' },
        { name: 'チームへの貢献意欲', score: 7, reason: 'ヘルプ対応の積極性' },
        { name: '継続的なスキル向上', score: 7, reason: 'スキル習得の履歴' }
      ]
    };
  }
}

/**
 * 成長機会を提案（AI）
 * @param {number} userId - ユーザーID
 * @returns {Promise<Object>} 成長機会の提案
 */
async function suggestGrowthOpportunities(userId) {
  const report = await growthTrackingService.generateGrowthReport(userId, {
    months: 6,
    includeGoals: true,
    includeContributions: true
  });

  const prompt = `
あなたはプロジェクトマネージャーとして、メンバーのキャリア成長を支援しています。
以下のメンバーのデータを分析し、成長機会を2〜4つ提案してください。

【メンバー情報】
名前: ${report.user.fullName}
ロール: ${report.user.role}

【現在のスキル】
${report.skillGrowth.current.map(s => `- ${s.skillName || s.name}: レベル ${s.skillLevel || s.level}/10`).join('\n')}

【スキルの成長（過去6ヶ月）】
${report.skillGrowth.changes.length > 0
      ? report.skillGrowth.changes.map(c => `- ${c.name}: ${c.oldLevel} → ${c.currentLevel} (${c.change > 0 ? '+' : ''}${c.change})`).join('\n')
      : '（変化なし）'
    }

【パフォーマンスメトリクス】
${report.performance.latest ? `
- タスク完了速度: ${report.performance.latest.taskCompletionRate}%
- バグ率: ${report.performance.latest.bugRate}%
- ヘルプ対応: ${report.performance.latest.helpCount}回/月
` : '（データなし）'}

上記のデータから、このメンバーの成長機会を2〜4つ提案してください。
各提案は、現在のスキルや経験を活かしつつ、次のステップを示すものにしてください。

【出力フォーマット】
\`\`\`json
{
  "opportunities": [
    "成長機会の提案1",
    "成長機会の提案2"
  ]
}
\`\`\`

JSON以外の文字列は含めないでください。
`;

  try {
    const result = await aiService.callAI(prompt, { responseFormat: 'json' });
    const parsed = JSON.parse(result);
    return {
      opportunities: parsed.opportunities || []
    };
  } catch (error) {
    console.error('成長機会提案AIエラー:', error);
    return {
      opportunities: [
        'より高度な技術スキルの習得',
        'チーム内でのリーダーシップ経験'
      ]
    };
  }
}

/**
 * 次の目標を提案（AI）
 * @param {number} userId - ユーザーID
 * @returns {Promise<Object>} 目標提案
 */
async function generateGoalSuggestions(userId) {
  const report = await growthTrackingService.generateGrowthReport(userId, {
    months: 6,
    includeGoals: true,
    includeContributions: false
  });

  const prompt = `
あなたはプロジェクトマネージャーとして、メンバーの成長目標を設定しています。
以下のメンバーのデータを分析し、具体的な成長目標を2〜3つ提案してください。

【メンバー情報】
名前: ${report.user.fullName}
ロール: ${report.user.role}

【現在のスキル】
${report.skillGrowth.current.map(s => `- ${s.skillName || s.name}: レベル ${s.skillLevel || s.level}/10`).join('\n')}

【スキルの成長傾向】
${report.skillGrowth.changes.length > 0
      ? report.skillGrowth.changes.map(c => `- ${c.name}: ${c.change > 0 ? '成長中' : '停滞中'} (${c.change > 0 ? '+' : ''}${c.change})`).join('\n')
      : '（データ不足）'
    }

【既存の目標】
${report.goals.length > 0
      ? report.goals.map(g => `- ${g.goalTitle} (進捗: ${g.progress}%)`).join('\n')
      : '（なし）'
    }

上記のデータから、SMART原則（Specific, Measurable, Achievable, Relevant, Time-bound）に基づいた
成長目標を2〜3つ提案してください。各目標には、推定期間（週数）も含めてください。

【出力フォーマット】
\`\`\`json
{
  "goals": [
    {
      "title": "目標のタイトル",
      "description": "目標の詳細説明",
      "targetSkill": "対象スキル名（該当する場合）",
      "targetLevel": 8,
      "estimatedWeeks": 4
    }
  ]
}
\`\`\`

JSON以外の文字列は含めないでください。
`;

  try {
    const result = await aiService.callAI(prompt, { responseFormat: 'json' });
    const parsed = JSON.parse(result);
    return {
      goals: parsed.goals || []
    };
  } catch (error) {
    console.error('目標提案AIエラー:', error);
    return {
      goals: [
        {
          title: '新しい技術スキルの習得',
          description: '業務に関連する新しい技術を学び、プロジェクトで活用する',
          targetSkill: null,
          targetLevel: null,
          estimatedWeeks: 8
        }
      ]
    };
  }
}

/**
 * 1on1資料を生成（AI）
 * @param {number} userId - ユーザーID
 * @param {string} period - 期間（'weekly', 'monthly', 'quarterly'）
 * @returns {Promise<Object>} 1on1資料
 */
async function generate1on1Material(userId, period = 'monthly') {
  const months = period === 'quarterly' ? 3 : period === 'monthly' ? 1 : 1;
  const report = await growthTrackingService.generateGrowthReport(userId, {
    months: Math.max(months, 6),
    includeGoals: true,
    includeContributions: true
  });

  const prompt = `
あなたはプロジェクトマネージャーとして、メンバーとの1on1面談の資料を作成しています。
以下のメンバーのデータを元に、${period === 'quarterly' ? '四半期' : period === 'monthly' ? '月次' : '週次'}の1on1面談資料を作成してください。

【メンバー情報】
名前: ${report.user.fullName}

【パフォーマンス】
${report.performance.latest ? `
- タスク完了速度: ${report.performance.latest.taskCompletionRate}% (チーム平均比)
- 完了タスク数: ${report.performance.latest.tasksCompleted}件
- バグ率: ${report.performance.latest.bugRate}%
- ヘルプ対応: ${report.performance.latest.helpCount}回
- 集中度: ${report.performance.latest.focusLevelAvg}/100
` : '（データなし）'}

【最近の貢献】
${report.contributions.slice(0, 5).map(c => `- ${c.title}`).join('\n') || '（なし）'}

【現在の目標と進捗】
${report.goals.map(g => `- ${g.goalTitle}: ${g.progress}%`).join('\n') || '（なし）'}

以下の構成で1on1資料を作成してください：
1. 今期の振り返り（成果と課題）
2. 良かった点（2〜3点）
3. 改善が必要な点（1〜2点）
4. 次の期間の目標
5. マネージャーからの質問事項（2〜3つ）

【出力フォーマット】
\`\`\`json
{
  "period": "${period}",
  "summary": "今期の総括（1〜2文）",
  "achievements": ["成果1", "成果2"],
  "improvements": ["改善点1"],
  "nextGoals": ["次の目標1", "次の目標2"],
  "questions": ["質問1", "質問2"]
}
\`\`\`

JSON以外の文字列は含めないでください。
`;

  try {
    const result = await aiService.callAI(prompt, { responseFormat: 'json' });
    const parsed = JSON.parse(result);
    return {
      userId,
      userName: report.user.fullName,
      period,
      generatedAt: new Date().toISOString(),
      ...parsed
    };
  } catch (error) {
    console.error('1on1資料生成AIエラー:', error);
    return {
      userId,
      userName: report.user.fullName,
      period,
      generatedAt: new Date().toISOString(),
      summary: '順調に業務を遂行しています。',
      achievements: ['タスクの着実な遂行'],
      improvements: ['さらなるスキル向上'],
      nextGoals: ['次の期間の目標設定'],
      questions: ['最近の業務で困っていることはありますか？']
    };
  }
}

/**
 * 評価シートを生成（AI）
 * @param {number} userId - ユーザーID
 * @param {string} evaluationPeriod - 評価期間（'Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'annual'）
 * @returns {Promise<Object>} 評価シート
 */
async function generateEvaluationSheet(userId, evaluationPeriod = 'Q1') {
  const months = evaluationPeriod === 'annual' ? 12 : evaluationPeriod.startsWith('H') ? 6 : 3;
  const report = await growthTrackingService.generateGrowthReport(userId, {
    months,
    includeGoals: true,
    includeContributions: true
  });

  const prompt = `
あなたは人事評価を担当するマネージャーです。
以下のメンバーの${evaluationPeriod}の評価シートを作成してください。

【メンバー情報】
名前: ${report.user.fullName}
ロール: ${report.user.role}

【スキル】
${report.skillGrowth.current.map(s => `- ${s.skillName || s.name}: ${s.skillLevel || s.level}/10`).join('\n')}

【パフォーマンスサマリー（期間内平均）】
${report.performance.history.length > 0 ? `
- 平均タスク完了速度: ${Math.round(report.performance.history.reduce((sum, m) => sum + m.taskCompletionRate, 0) / report.performance.history.length)}%
- 平均バグ率: ${Math.round(report.performance.history.reduce((sum, m) => sum + m.bugRate, 0) / report.performance.history.length * 10) / 10}%
- 総完了タスク数: ${report.performance.history.reduce((sum, m) => sum + m.tasksCompleted, 0)}件
- 平均ヘルプ対応: ${Math.round(report.performance.history.reduce((sum, m) => sum + m.helpCount, 0) / report.performance.history.length)}回/月
` : '（データ不足）'}

【主な貢献】
${report.contributions.slice(0, 10).map(c => `- ${c.title} (${c.impactLevel})`).join('\n') || '（なし）'}

【目標達成状況】
${report.goals.map(g => `- ${g.goalTitle}: ${g.status === 'completed' ? '達成' : g.status === 'active' ? `進行中 (${g.progress}%)` : 'キャンセル'}`).join('\n') || '（なし）'}

以下の評価項目について、5段階評価（1-5）と コメントを記載してください：
1. 業務遂行能力
2. 技術スキル
3. チームワーク・協調性
4. 自己成長意欲
5. リーダーシップ

【出力フォーマット】
\`\`\`json
{
  "evaluationPeriod": "${evaluationPeriod}",
  "overallRating": 4,
  "ratings": {
    "taskExecution": { "score": 4, "comment": "コメント" },
    "technicalSkill": { "score": 4, "comment": "コメント" },
    "teamwork": { "score": 4, "comment": "コメント" },
    "growthMindset": { "score": 4, "comment": "コメント" },
    "leadership": { "score": 3, "comment": "コメント" }
  },
  "strengths": ["強み1", "強み2"],
  "improvements": ["改善点1"],
  "nextTermGoals": ["次期の目標1", "次期の目標2"]
}
\`\`\`

JSON以外の文字列は含めないでください。
`;

  try {
    const result = await aiService.callAI(prompt, { responseFormat: 'json' });
    const parsed = JSON.parse(result);
    return {
      userId,
      userName: report.user.fullName,
      evaluationPeriod,
      generatedAt: new Date().toISOString(),
      ...parsed
    };
  } catch (error) {
    console.error('評価シート生成AIエラー:', error);
    return {
      userId,
      userName: report.user.fullName,
      evaluationPeriod,
      generatedAt: new Date().toISOString(),
      overallRating: 3,
      ratings: {
        taskExecution: { score: 3, comment: '適切に業務を遂行しています。' },
        technicalSkill: { score: 3, comment: '必要なスキルを保持しています。' },
        teamwork: { score: 3, comment: 'チームと協力して作業しています。' },
        growthMindset: { score: 3, comment: '成長意欲が見られます。' },
        leadership: { score: 3, comment: '今後のリーダーシップ発揮に期待します。' }
      },
      strengths: ['安定した業務遂行'],
      improvements: ['さらなるスキル向上'],
      nextTermGoals: ['新しいスキルの習得']
    };
  }
}

module.exports = {
  analyzeStrengths,
  suggestGrowthOpportunities,
  generateGoalSuggestions,
  generate1on1Material,
  generateEvaluationSheet
};
