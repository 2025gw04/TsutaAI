/**
 * 見積もり用AIチャットサービス
 * WBSアシスタントと同様の高度なツール呼び出し機能を実装
 */

const fs = require('fs');
const path = require('path');
const settingsService = require('./settingsService');
const LLMAdapterFactory = require('./llm-adapters');
const { ProxyAgent } = require('undici');
const estimatePrompts = require('../prompts/estimatePrompts');
const logger = require('../utils/logger');

function providerNeedsApiKey(provider) {
  return (provider || 'groq').toLowerCase() !== 'ollama';
}

// 見積もり用のツール定義
const ESTIMATE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_phases',
      description: 'プロジェクトのフェーズを作成します。複数のフェーズを一度に作成できます。',
      parameters: {
        type: 'object',
        properties: {
          phases: {
            type: 'array',
            description: '作成するフェーズの配列',
            items: {
              type: 'object',
              properties: {
                phaseName: { type: 'string', description: 'フェーズ名（例: 要件定義、基本設計、実装）' },
                effort: { type: 'number', description: '工数（人日）' },
                durationDays: { type: 'number', description: '期間（日数）' },
                teamSize: { type: 'number', description: '担当人数' },
                useAi: { type: 'boolean', description: 'AIツールを活用するか' },
                aiEfficiencyRatio: { type: 'number', description: 'AI効率化比率（0.0〜0.5、例: 0.3は30%削減）' },
                description: { type: 'string', description: 'フェーズの説明' }
              },
              required: ['phaseName', 'effort', 'durationDays']
            }
          }
        },
        required: ['phases']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_phase',
      description: 'フェーズの情報を更新します。',
      parameters: {
        type: 'object',
        properties: {
          phaseName: { type: 'string', description: '更新するフェーズ名' },
          changes: {
            type: 'object',
            description: 'フェーズの変更内容',
            properties: {
              effort: { type: 'number', description: '工数（人日）' },
              durationDays: { type: 'number', description: '期間（日数）' },
              teamSize: { type: 'number', description: '担当人数' },
              useAi: { type: 'boolean', description: 'AIツールを活用するか' },
              aiEfficiencyRatio: { type: 'number', description: 'AI効率化比率' },
              description: { type: 'string', description: 'フェーズの説明' }
            }
          }
        },
        required: ['phaseName', 'changes']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_phases',
      description: 'フェーズを削除します。複数のフェーズを削除できます。',
      parameters: {
        type: 'object',
        properties: {
          phaseNames: {
            type: 'array',
            items: { type: 'string' },
            description: '削除するフェーズ名の配列'
          }
        },
        required: ['phaseNames']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_ai_efficiency',
      description: 'フェーズやタスクのAI効率化比率を計算します。タスクの性質に基づいて最適な効率化比率を提案します。',
      parameters: {
        type: 'object',
        properties: {
          taskType: {
            type: 'string',
            enum: ['coding', 'testing', 'documentation', 'design', 'research', 'meeting', 'review'],
            description: 'タスクの種類'
          },
          description: {
            type: 'string',
            description: 'タスクの詳細説明'
          }
        },
        required: ['taskType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'optimize_resource_allocation',
      description: '人数と期間のバランスを最適化します。制約条件を考慮して最適なリソース配分を提案します。',
      parameters: {
        type: 'object',
        properties: {
          totalEffort: { type: 'number', description: '総工数（人日）' },
          constraint: {
            type: 'string',
            enum: ['duration', 'headcount', 'cost'],
            description: '制約条件（期間固定、人数固定、予算固定）'
          },
          constraintValue: { type: 'number', description: '制約値' }
        },
        required: ['totalEffort', 'constraint']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prioritize_features',
      description: '予算内で実装可能な機能の優先順位付けを行います（budget_fixedパターン用）。Must Have / Should Have / Nice to Have の3段階で分類します。',
      parameters: {
        type: 'object',
        properties: {
          totalBudget: { type: 'number', description: '総予算（円）' },
          unitCost: { type: 'number', description: '人月単価（円）' },
          features: {
            type: 'array',
            description: '機能リスト',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '機能名' },
                estimatedEffort: { type: 'number', description: '見積もり工数（人日）' },
                businessValue: { type: 'string', enum: ['high', 'medium', 'low'], description: 'ビジネス価値' },
                useAi: { type: 'boolean', description: 'AI活用可能か' }
              },
              required: ['name', 'estimatedEffort']
            }
          }
        },
        required: ['totalBudget', 'unitCost', 'features']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_budget_scope',
      description: '予算から逆算してスコープを計算します（budget_fixedパターン用）。実装可能な総工数と推奨スコープを提示します。',
      parameters: {
        type: 'object',
        properties: {
          totalBudget: { type: 'number', description: '総予算（円）' },
          unitCost: { type: 'number', description: '人月単価（円）' },
          aiUtilizationRate: { type: 'number', description: 'AI活用率（0.0〜1.0）' },
          averageAiEfficiency: { type: 'number', description: '平均AI効率化比率（0.0〜0.5）' }
        },
        required: ['totalBudget', 'unitCost']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'define_core_value',
      description: 'MVPのコアバリューを定義し、それに紐づく最小機能を抽出します（mvpパターン用）。',
      parameters: {
        type: 'object',
        properties: {
          hypothesis: { type: 'string', description: 'ビジネス仮説' },
          targetUsers: { type: 'string', description: 'ターゲットユーザー像' },
          coreValue: { type: 'string', description: '核となる価値提案' },
          features: {
            type: 'array',
            description: '候補機能リスト',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '機能名' },
                isCoreFeature: { type: 'boolean', description: 'コア機能か' },
                validatesHypothesis: { type: 'boolean', description: '仮説検証に必要か' }
              },
              required: ['name']
            }
          }
        },
        required: ['hypothesis', 'targetUsers', 'coreValue']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_mvp_roadmap',
      description: 'MVP後の段階的拡張計画を作成します（mvpパターン用）。MVP → v1.0 → v2.0 のロードマップを提示します。',
      parameters: {
        type: 'object',
        properties: {
          mvpFeatures: {
            type: 'array',
            items: { type: 'string' },
            description: 'MVPに含める機能'
          },
          v1Features: {
            type: 'array',
            items: { type: 'string' },
            description: 'v1.0で追加する機能'
          },
          v2Features: {
            type: 'array',
            items: { type: 'string' },
            description: 'v2.0で追加する機能'
          },
          timeline: {
            type: 'object',
            properties: {
              mvpDuration: { type: 'number', description: 'MVP開発期間（週）' },
              v1Duration: { type: 'number', description: 'v1.0開発期間（週）' },
              v2Duration: { type: 'number', description: 'v2.0開発期間（週）' }
            }
          }
        },
        required: ['mvpFeatures']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'define_phase_gate',
      description: 'フェーズゲート（承認条件）を定義します（phase_basedパターン用）。各フェーズの終了条件とレビューチェックリストを設定します。',
      parameters: {
        type: 'object',
        properties: {
          phaseName: { type: 'string', description: 'フェーズ名' },
          deliverables: {
            type: 'array',
            items: { type: 'string' },
            description: '成果物リスト'
          },
          gateCriteria: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                criterion: { type: 'string', description: '判定基準' },
                mandatory: { type: 'boolean', description: '必須か' }
              }
            },
            description: 'ゲート条件リスト'
          }
        },
        required: ['phaseName', 'deliverables', 'gateCriteria']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_phase_dependencies',
      description: 'フェーズ間依存関係を計算します（phase_basedパターン用）。クリティカルパスと並行可能なフェーズを特定します。',
      parameters: {
        type: 'object',
        properties: {
          phases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                phaseName: { type: 'string' },
                durationDays: { type: 'number' },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '依存する前フェーズ名のリスト'
                }
              }
            },
            description: '全フェーズ情報'
          }
        },
        required: ['phases']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_user_stories',
      description: 'ユーザーストーリーを作成します（agileパターン用）。As a... I want... So that... 形式でストーリーを生成します。',
      parameters: {
        type: 'object',
        properties: {
          epic: { type: 'string', description: 'エピック名' },
          stories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                userStory: { type: 'string', description: 'ユーザーストーリー' },
                acceptanceCriteria: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '受け入れ条件'
                },
                priority: { type: 'number', description: '優先順位（1-5）' }
              },
              required: ['userStory']
            }
          }
        },
        required: ['epic', 'stories']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'estimate_story_points',
      description: 'ストーリーポイントを見積もります（agileパターン用）。フィボナッチ数列（1, 2, 3, 5, 8, 13...）でポイントを付けます。',
      parameters: {
        type: 'object',
        properties: {
          stories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                userStory: { type: 'string' },
                complexity: { type: 'string', enum: ['low', 'medium', 'high', 'very_high'] },
                storyPoints: { type: 'number', enum: [1, 2, 3, 5, 8, 13, 21] }
              },
              required: ['userStory', 'complexity', 'storyPoints']
            }
          }
        },
        required: ['stories']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plan_sprints',
      description: 'スプリント計画を作成します（agileパターン用）。ベロシティを考慮してストーリーをスプリントに配分します。',
      parameters: {
        type: 'object',
        properties: {
          velocity: { type: 'number', description: 'チームベロシティ（ポイント/スプリント）' },
          sprintDuration: { type: 'number', description: 'スプリント期間（週）' },
          sprints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sprintNumber: { type: 'number' },
                stories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'このスプリントで実施するストーリー'
                },
                totalPoints: { type: 'number' }
              }
            }
          }
        },
        required: ['velocity', 'sprintDuration', 'sprints']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_velocity',
      description: 'チームベロシティを計算します（agileパターン用）。チーム規模とAI活用を考慮して推定ベロシティを算出します。',
      parameters: {
        type: 'object',
        properties: {
          teamSize: { type: 'number', description: 'チーム人数' },
          sprintDuration: { type: 'number', description: 'スプリント期間（週）' },
          aiUtilization: { type: 'boolean', description: 'AI活用するか' },
          pastVelocity: { type: 'number', description: '過去のベロシティ（あれば）' }
        },
        required: ['teamSize', 'sprintDuration']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'allocate_by_skill',
      description: 'スキルレベルに基づいてタスク配分を行います（skill_basedパターン用）。最適なタスク割り当てを提案します。',
      parameters: {
        type: 'object',
        properties: {
          teamComposition: {
            type: 'object',
            properties: {
              senior: { type: 'number', description: 'シニアエンジニア人数' },
              middle: { type: 'number', description: 'ミドルエンジニア人数' },
              junior: { type: 'number', description: 'ジュニアエンジニア人数' }
            }
          },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                taskName: { type: 'string', description: 'タスク名' },
                requiredSkillLevel: { type: 'string', enum: ['senior', 'middle', 'junior'], description: '必要スキルレベル' },
                effort: { type: 'number', description: '工数（人日）' },
                complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: '複雑度' }
              },
              required: ['taskName', 'requiredSkillLevel', 'effort']
            }
          }
        },
        required: ['teamComposition', 'tasks']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_skill_efficiency',
      description: 'スキルレベル×AI活用の総合効率化比率を計算します（skill_basedパターン用）。',
      parameters: {
        type: 'object',
        properties: {
          skillLevel: { type: 'string', enum: ['senior', 'middle', 'junior'], description: 'スキルレベル' },
          taskType: { type: 'string', enum: ['coding', 'testing', 'documentation', 'design', 'research'], description: 'タスク種類' },
          useAi: { type: 'boolean', description: 'AI活用するか' }
        },
        required: ['skillLevel', 'taskType', 'useAi']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'identify_risks',
      description: 'プロジェクトのリスクを特定します（risk_basedパターン用）。リスク一覧（カテゴリ、影響度、発生確率）を生成します。',
      parameters: {
        type: 'object',
        properties: {
          projectOverview: { type: 'string', description: 'プロジェクト概要' },
          technologyStack: {
            type: 'array',
            items: { type: 'string' },
            description: '使用技術スタック'
          },
          knownRisks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string', enum: ['technical', 'human', 'schedule', 'quality', 'external'], description: 'リスクカテゴリ' },
                description: { type: 'string', description: 'リスク説明' },
                impact: { type: 'string', enum: ['high', 'medium', 'low'], description: '影響度' },
                probability: { type: 'string', enum: ['high', 'medium', 'low'], description: '発生確率' }
              },
              required: ['category', 'description', 'impact', 'probability']
            }
          }
        },
        required: ['projectOverview']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_risk_buffer',
      description: 'リスクバッファを計算します（risk_basedパターン用）。フェーズごとのバッファ（時間/コスト）を提案します。',
      parameters: {
        type: 'object',
        properties: {
          phases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                phaseName: { type: 'string' },
                effort: { type: 'number', description: '基本工数（人日）' },
                riskLevel: { type: 'string', enum: ['high', 'medium', 'low'], description: 'リスクレベル' }
              },
              required: ['phaseName', 'effort', 'riskLevel']
            }
          },
          riskTolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'], description: 'リスク許容度' }
        },
        required: ['phases', 'riskTolerance']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_similar_projects',
      description: '過去プロジェクトの類似度を計算します（similar_projectパターン用）。類似プロジェクトリストと類似度スコア（0-100%）を返します。',
      parameters: {
        type: 'object',
        properties: {
          currentProject: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'プロジェクト概要' },
              technologyStack: { type: 'array', items: { type: 'string' }, description: '技術スタック' },
              estimatedScale: { type: 'string', enum: ['small', 'medium', 'large'], description: '想定規模' }
            }
          },
          historicalProjects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                projectName: { type: 'string' },
                description: { type: 'string' },
                technologyStack: { type: 'array', items: { type: 'string' } },
                totalEffort: { type: 'number', description: '総工数（人日）' },
                duration: { type: 'number', description: '期間（日）' },
                teamSize: { type: 'number' }
              }
            }
          }
        },
        required: ['currentProject']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'adjust_for_differences',
      description: '過去プロジェクトとの差分を調整します（similar_projectパターン用）。調整後の見積もりを返します。',
      parameters: {
        type: 'object',
        properties: {
          baseProject: {
            type: 'object',
            properties: {
              projectName: { type: 'string' },
              totalEffort: { type: 'number' },
              duration: { type: 'number' }
            }
          },
          differences: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['addition', 'removal', 'change'], description: '差分タイプ' },
                description: { type: 'string', description: '差分内容' },
                impactPercentage: { type: 'number', description: '影響度（%）' }
              }
            }
          }
        },
        required: ['baseProject', 'differences']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_confidence_interval',
      description: '信頼区間を計算します（similar_projectパターン用）。楽観値/標準値/悲観値を返します。',
      parameters: {
        type: 'object',
        properties: {
          baseEstimate: { type: 'number', description: '基準見積もり（人日）' },
          similarityScore: { type: 'number', description: '類似度スコア（0-100）' },
          historicalVariance: { type: 'number', description: '過去データの分散（あれば）' }
        },
        required: ['baseEstimate', 'similarityScore']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'select_estimation_method',
      description: 'サブプロジェクトごとに最適な見積もり手法を選択します（hybridパターン用）。',
      parameters: {
        type: 'object',
        properties: {
          subProjects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'サブプロジェクト名' },
                characteristics: {
                  type: 'object',
                  properties: {
                    uncertainty: { type: 'string', enum: ['high', 'medium', 'low'] },
                    scale: { type: 'string', enum: ['small', 'medium', 'large'] },
                    constraints: { type: 'array', items: { type: 'string' } }
                  }
                },
                recommendedMethod: { type: 'string', description: '推奨手法' }
              },
              required: ['name', 'characteristics']
            }
          }
        },
        required: ['subProjects']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'integrate_estimates',
      description: '複数の見積もりを統合します（hybridパターン用）。統合見積もりとクリティカルパスを返します。',
      parameters: {
        type: 'object',
        properties: {
          subProjectEstimates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                method: { type: 'string', description: '使用した手法' },
                effort: { type: 'number' },
                duration: { type: 'number' },
                dependencies: { type: 'array', items: { type: 'string' } }
              },
              required: ['name', 'method', 'effort', 'duration']
            }
          }
        },
        required: ['subProjectEstimates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'define_sla',
      description: 'SLA（サービスレベル契約）を定義します（maintenanceパターン用）。SLA定義と対応体制要件を返します。',
      parameters: {
        type: 'object',
        properties: {
          availability: { type: 'number', description: '稼働率（%）例：99.9' },
          rto: { type: 'number', description: '復旧時間目標（分）' },
          responseTime: {
            type: 'object',
            properties: {
              critical: { type: 'number', description: '緊急対応時間（分）' },
              high: { type: 'number', description: '高優先度対応時間（分）' },
              normal: { type: 'number', description: '通常対応時間（時間）' }
            }
          }
        },
        required: ['availability', 'rto']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'estimate_maintenance_tasks',
      description: '保守タスクを分類・見積もります（maintenanceパターン用）。タスク分類と月次工数を返します。',
      parameters: {
        type: 'object',
        properties: {
          systemScale: { type: 'string', enum: ['small', 'medium', 'large'], description: 'システム規模' },
          maintenanceScope: {
            type: 'array',
            items: { type: 'string', enum: ['incident', 'maintenance', 'minor_change', 'inquiry'] }
          },
          monthlyIncidents: { type: 'number', description: '月次障害件数（想定）' },
          monthlyInquiries: { type: 'number', description: '月次問い合わせ件数（想定）' }
        },
        required: ['systemScale', 'maintenanceScope']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_monthly_cost',
      description: '月額保守費用を計算します（maintenanceパターン用）。月額・年額費用を返します。',
      parameters: {
        type: 'object',
        properties: {
          monthlyEffort: { type: 'number', description: '月次工数（人日）' },
          unitCost: { type: 'number', description: '人日単価（円）' },
          aiUtilization: { type: 'boolean', description: 'AI活用するか' },
          slaLevel: { type: 'string', enum: ['basic', 'standard', 'premium'], description: 'SLAレベル' }
        },
        required: ['monthlyEffort', 'unitCost']
      }
    }
  }
];

/**
 * 見積もりチャットメッセージを処理
 */
async function processEstimateChatMessage(context) {
  const {
    userMessage,
    conversationHistory,
    currentPhases,
    estimate,
    patternType
  } = context;

  // システムプロンプトを取得
  const baseSystemPrompt = estimatePrompts.getSystemPrompt(patternType);

  // フェーズ情報を追加
  let systemPrompt = baseSystemPrompt + '\n\n【現在のフェーズ情報】\n';
  if (currentPhases && currentPhases.length > 0) {
    systemPrompt += JSON.stringify(currentPhases, null, 2);
  } else {
    systemPrompt += 'まだフェーズは登録されていません。';
  }

  // ツール使用の指示を追加
  systemPrompt += '\n\n【ツール使用のガイドライン】\n';
  systemPrompt += '- フェーズを作成する場合は、必ずcreate_phasesツールを使用してください。\n';
  systemPrompt += '- フェーズを更新する場合は、update_phaseツールを使用してください。\n';
  systemPrompt += '- フェーズを削除する場合は、delete_phasesツールを使用してください。\n';
  systemPrompt += '- AI効率化比率を計算する場合は、calculate_ai_efficiencyツールを使用してください。\n';
  systemPrompt += '- リソース配分を最適化する場合は、optimize_resource_allocationツールを使用してください。\n';
  systemPrompt += '- ユーザーが「フェーズを作成」「見積もりを出して」などと依頼した場合は、必ずツールを呼び出してください。\n';

  // 会話履歴を構築
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ];

  // AI設定を取得
  const aiConfig = await settingsService.getAIConfig();

  if (providerNeedsApiKey(aiConfig.provider) && !aiConfig.apiKey) {
    logger.warn('AI API key が設定されていません');
    return {
      message: 'AIサービスは現在利用できません。環境変数または設定画面でAPIキーを設定してください。',
      toolCalls: null,
      preview: null,
      needsConfirmation: false
    };
  }

  try {
    // プロキシ設定を取得
    const proxyConfig = await settingsService.getProxyConfig();
    let proxyAgent = null;
    if (proxyConfig.enabled && proxyConfig.url) {
      try {
        let proxyUrl = proxyConfig.url;
        const hasCredentials = /\/\/[^@]+@/.test(proxyUrl);
        if (!hasCredentials && proxyConfig.username) {
          const [scheme, rest] = proxyUrl.split('://');
          if (rest) {
            const user = encodeURIComponent(proxyConfig.username);
            const pass = encodeURIComponent(proxyConfig.password || '');
            proxyUrl = `${scheme}://${user}:${pass}@${rest}`;
          }
        }
        proxyAgent = new ProxyAgent(proxyUrl);
      } catch (proxyError) {
        logger.error(`プロキシ初期化エラー: ${proxyError.message}`);
      }
    }

    // LLMアダプターを生成
    const adapter = LLMAdapterFactory.create(aiConfig.provider, {
      apiKey: aiConfig.apiKey,
      endpoint: aiConfig.endpoint,
      model: aiConfig.model,
      temperature: 0.3,
      maxTokens: 8192,
      proxyAgent
    });

    logger.info('Estimate AI Chat Request:', {
      provider: aiConfig.provider,
      endpoint: aiConfig.endpoint || '(default endpoint)',
      model: aiConfig.model || '(default model)',
      messageCount: messages.length,
      toolCount: ESTIMATE_TOOLS.length
    });

    // アダプター経由でチャット（Function Calling対応）
    const systemMessage = messages.find(m => m.role === 'system');
    const history = messages.slice(1, -1);
    const latestUserMessage = messages[messages.length - 1]?.content || userMessage;
    const result = await adapter.chat({
      systemPrompt: systemMessage?.content || '',
      history,
      userMessage: latestUserMessage,
      tools: ESTIMATE_TOOLS
    });

    const toolCalls = result?.toolCalls || null;
    const responseMessage = result?.message || '';

    // ツール呼び出しがある場合
    if (toolCalls && toolCalls.length > 0) {
      const preview = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const rawArguments = toolCall.function.arguments;
        const args =
          typeof rawArguments === 'string' ? JSON.parse(rawArguments) : (rawArguments || {});

        // ツールごとにプレビューデータを生成
        const previewResult = executeToolForPreview(toolName, args, currentPhases);
        if (previewResult.changes) {
          preview.push(...previewResult.changes);
        }
      }

      return {
        message: responseMessage || 'フェーズを変更します。内容を確認して「適用」ボタンをクリックしてください。',
        toolCalls,
        preview,
        needsConfirmation: true
      };
    }

    // 通常の応答（ツール呼び出しなし）
    return {
      message: responseMessage,
      toolCalls: null,
      preview: null,
      needsConfirmation: false
    };

  } catch (error) {
    logger.error('AI処理エラー:', error);
    throw error;
  }
}

/**
 * ツールを実行してプレビューデータを生成
 */
function executeToolForPreview(toolName, args, currentPhases) {
  logger.info(`ツール実行（プレビュー）: ${toolName}`, args);

  switch (toolName) {
    case 'create_phases':
      return {
        changes: args.phases.map((phase, index) => ({
          type: 'create',
          phaseName: phase.phaseName,
          changes: {
            phaseOrder: (currentPhases?.length || 0) + index + 1,
            effort: phase.effort,
            durationDays: phase.durationDays,
            teamSize: phase.teamSize || 1,
            useAi: phase.useAi || false,
            aiEfficiencyRatio: phase.aiEfficiencyRatio || 0,
            description: phase.description || ''
          }
        }))
      };

    case 'update_phase':
      const existingPhase = currentPhases?.find(p => p.phase_name === args.phaseName);
      if (!existingPhase) {
        return {
          changes: [{
            type: 'error',
            message: `フェーズ「${args.phaseName}」が見つかりませんでした`
          }]
        };
      }

      return {
        changes: [{
          type: 'update',
          phaseId: existingPhase.id,
          phaseName: args.phaseName,
          changes: args.changes
        }]
      };

    case 'delete_phases':
      return {
        changes: args.phaseNames.map(phaseName => {
          const phase = currentPhases?.find(p => p.phase_name === phaseName);
          return {
            type: 'delete',
            phaseId: phase?.id,
            phaseName: phaseName
          };
        })
      };

    case 'calculate_ai_efficiency':
      // AI効率化比率の計算ロジック
      const efficiencyMap = {
        'coding': 0.35,
        'testing': 0.30,
        'documentation': 0.40,
        'design': 0.25,
        'research': 0.25,
        'meeting': 0.10,
        'review': 0.30
      };

      return {
        changes: [{
          type: 'info',
          message: `${args.taskType}のAI効率化比率: ${(efficiencyMap[args.taskType] || 0.2) * 100}%`,
          data: {
            taskType: args.taskType,
            aiEfficiencyRatio: efficiencyMap[args.taskType] || 0.2
          }
        }]
      };

    case 'optimize_resource_allocation':
      // リソース配分の最適化ロジック
      return {
        changes: [{
          type: 'info',
          message: 'リソース配分を最適化します',
          data: {
            totalEffort: args.totalEffort,
            constraint: args.constraint,
            constraintValue: args.constraintValue
          }
        }]
      };

    case 'prioritize_features':
      // 機能優先順位付けロジック
      const availableManMonths = args.totalBudget / args.unitCost;
      const availableManDays = availableManMonths * 20; // 1人月 = 20人日

      let totalEffort = 0;
      const categorizedFeatures = {
        must: [],
        should: [],
        nice: []
      };

      args.features.forEach(feature => {
        const actualEffort = feature.useAi
          ? feature.estimatedEffort * 0.7  // AI活用で30%削減
          : feature.estimatedEffort;

        if (totalEffort + actualEffort <= availableManDays && feature.businessValue === 'high') {
          categorizedFeatures.must.push(feature.name);
          totalEffort += actualEffort;
        } else if (totalEffort + actualEffort <= availableManDays * 1.2 && feature.businessValue === 'medium') {
          categorizedFeatures.should.push(feature.name);
        } else {
          categorizedFeatures.nice.push(feature.name);
        }
      });

      return {
        changes: [{
          type: 'info',
          message: `予算内で実装可能な機能を優先順位付けしました（利用可能工数: ${availableManDays.toFixed(1)}人日）`,
          data: {
            totalBudget: args.totalBudget,
            unitCost: args.unitCost,
            availableManDays: availableManDays,
            categorizedFeatures: categorizedFeatures,
            estimatedTotalEffort: totalEffort
          }
        }]
      };

    case 'calculate_budget_scope':
      // 予算からスコープを計算
      const manMonths = args.totalBudget / args.unitCost;
      const manDays = manMonths * 20;
      const aiRate = args.aiUtilizationRate || 0.5;
      const aiEfficiency = args.averageAiEfficiency || 0.3;
      const effectiveManDays = manDays * (1 + aiRate * aiEfficiency);

      return {
        changes: [{
          type: 'info',
          message: `予算${args.totalBudget.toLocaleString()}円で実装可能な工数を算出しました`,
          data: {
            totalBudget: args.totalBudget,
            unitCost: args.unitCost,
            baseManDays: manDays,
            effectiveManDays: effectiveManDays,
            aiBonus: effectiveManDays - manDays,
            recommendation: effectiveManDays > 100
              ? '中規模プロジェクトとして、3-4人で約1-2ヶ月の開発が可能です'
              : effectiveManDays > 40
              ? '小規模プロジェクトとして、2-3人で約1ヶ月の開発が可能です'
              : 'PoC・MVPとして、1-2人で約2-4週間の開発が可能です'
          }
        }]
      };

    case 'define_core_value':
      // MVPコアバリュー定義
      const coreFeatures = args.features?.filter(f => f.isCoreFeature) || [];
      const hypothesisValidationFeatures = args.features?.filter(f => f.validatesHypothesis) || [];

      return {
        changes: [{
          type: 'info',
          message: 'MVPのコアバリューと必須機能を定義しました',
          data: {
            hypothesis: args.hypothesis,
            targetUsers: args.targetUsers,
            coreValue: args.coreValue,
            coreFeatures: coreFeatures.map(f => f.name),
            hypothesisValidationFeatures: hypothesisValidationFeatures.map(f => f.name),
            recommendation: `コア機能${coreFeatures.length}個、仮説検証機能${hypothesisValidationFeatures.length}個を優先実装してください`
          }
        }]
      };

    case 'create_mvp_roadmap':
      // MVPロードマップ作成
      const totalWeeks = (args.timeline?.mvpDuration || 0)
                        + (args.timeline?.v1Duration || 0)
                        + (args.timeline?.v2Duration || 0);

      return {
        changes: [{
          type: 'info',
          message: 'MVP後の段階的拡張ロードマップを作成しました',
          data: {
            roadmap: {
              mvp: {
                features: args.mvpFeatures,
                duration: args.timeline?.mvpDuration || 4,
                focus: '仮説検証とコアバリュー提供'
              },
              v1: {
                features: args.v1Features || [],
                duration: args.timeline?.v1Duration || 6,
                focus: 'ユーザーフィードバックに基づく改善'
              },
              v2: {
                features: args.v2Features || [],
                duration: args.timeline?.v2Duration || 8,
                focus: 'スケールと追加価値提供'
              }
            },
            totalWeeks: totalWeeks,
            recommendation: `MVP → v1.0 → v2.0 の段階的なリリース計画で、合計${totalWeeks}週間を想定しています`
          }
        }]
      };

    case 'define_phase_gate':
      // フェーズゲート定義
      const mandatoryCount = args.gateCriteria.filter(c => c.mandatory).length;
      return {
        changes: [{
          type: 'info',
          message: `フェーズ「${args.phaseName}」のゲート条件を定義しました`,
          data: {
            phaseName: args.phaseName,
            deliverables: args.deliverables,
            gateCriteria: args.gateCriteria,
            summary: `成果物${args.deliverables.length}個、判定基準${args.gateCriteria.length}個（うち必須${mandatoryCount}個）`
          }
        }]
      };

    case 'calculate_phase_dependencies':
      // フェーズ依存関係計算
      const criticalPath = [];
      const parallelPhases = [];

      args.phases.forEach(phase => {
        if (!phase.dependencies || phase.dependencies.length === 0) {
          parallelPhases.push(phase.phaseName);
        } else {
          criticalPath.push(phase.phaseName);
        }
      });

      const totalDuration = args.phases.reduce((sum, p) => sum + p.durationDays, 0);

      return {
        changes: [{
          type: 'info',
          message: 'フェーズ間依存関係を分析しました',
          data: {
            criticalPath: criticalPath,
            parallelPhases: parallelPhases,
            totalDuration: totalDuration,
            recommendation: parallelPhases.length > 0
              ? `${parallelPhases.length}個のフェーズは並行実行可能です。クリティカルパスは${criticalPath.length}個のフェーズです。`
              : 'すべてのフェーズが順次実行です。'
          }
        }]
      };

    case 'create_user_stories':
      // ユーザーストーリー作成
      const storyCount = args.stories.length;
      const avgPriority = args.stories.reduce((sum, s) => sum + (s.priority || 3), 0) / storyCount;

      return {
        changes: [{
          type: 'info',
          message: `エピック「${args.epic}」のユーザーストーリーを${storyCount}個作成しました`,
          data: {
            epic: args.epic,
            stories: args.stories,
            storyCount: storyCount,
            averagePriority: avgPriority.toFixed(1)
          }
        }]
      };

    case 'estimate_story_points':
      // ストーリーポイント見積もり
      const totalPoints = args.stories.reduce((sum, s) => sum + s.storyPoints, 0);
      const complexityDistribution = {
        low: args.stories.filter(s => s.complexity === 'low').length,
        medium: args.stories.filter(s => s.complexity === 'medium').length,
        high: args.stories.filter(s => s.complexity === 'high').length,
        very_high: args.stories.filter(s => s.complexity === 'very_high').length
      };

      return {
        changes: [{
          type: 'info',
          message: `${args.stories.length}個のストーリーにポイントを付けました（合計${totalPoints}ポイント）`,
          data: {
            stories: args.stories,
            totalPoints: totalPoints,
            averagePoints: (totalPoints / args.stories.length).toFixed(1),
            complexityDistribution: complexityDistribution
          }
        }]
      };

    case 'plan_sprints':
      // スプリント計画
      const sprintCount = args.sprints.length;
      const totalSprintPoints = args.sprints.reduce((sum, s) => sum + s.totalPoints, 0);
      const durationWeeks = sprintCount * args.sprintDuration;

      return {
        changes: [{
          type: 'info',
          message: `${sprintCount}スプリントの計画を作成しました（合計${durationWeeks}週間）`,
          data: {
            sprints: args.sprints,
            sprintCount: sprintCount,
            velocity: args.velocity,
            totalPoints: totalSprintPoints,
            durationWeeks: durationWeeks,
            recommendation: `ベロシティ${args.velocity}ポイント/スプリントで、合計${totalSprintPoints}ポイントを${sprintCount}スプリントで完了予定です。`
          }
        }]
      };

    case 'calculate_velocity':
      // ベロシティ計算
      const baseVelocity = args.pastVelocity || (args.teamSize * args.sprintDuration * 5); // 1人1週間=5ポイント
      const aiBoost = args.aiUtilization ? 1.4 : 1.0; // AI活用で40%向上
      const estimatedVelocity = Math.round(baseVelocity * aiBoost);

      return {
        changes: [{
          type: 'info',
          message: `推定ベロシティを計算しました: ${estimatedVelocity}ポイント/スプリント`,
          data: {
            teamSize: args.teamSize,
            sprintDuration: args.sprintDuration,
            baseVelocity: baseVelocity,
            aiUtilization: args.aiUtilization,
            aiBoost: args.aiUtilization ? '+40%' : 'なし',
            estimatedVelocity: estimatedVelocity,
            recommendation: args.pastVelocity
              ? `過去のベロシティ${args.pastVelocity}を基準に、AI活用で${estimatedVelocity}ポイントと予測します。`
              : `チーム${args.teamSize}名、${args.sprintDuration}週スプリントで${estimatedVelocity}ポイントと予測します。`
          }
        }]
      };

    case 'allocate_by_skill':
      // スキルレベル別タスク配分
      const totalTeam = (args.teamComposition.senior || 0)
                      + (args.teamComposition.middle || 0)
                      + (args.teamComposition.junior || 0);

      const allocation = {
        senior: { tasks: [], totalEffort: 0 },
        middle: { tasks: [], totalEffort: 0 },
        junior: { tasks: [], totalEffort: 0 }
      };

      args.tasks.forEach(task => {
        const level = task.requiredSkillLevel;
        allocation[level].tasks.push(task.taskName);
        allocation[level].totalEffort += task.effort;
      });

      return {
        changes: [{
          type: 'info',
          message: `チーム${totalTeam}名に対して${args.tasks.length}タスクを最適配分しました`,
          data: {
            teamComposition: args.teamComposition,
            allocation: allocation,
            recommendation: `シニア: ${allocation.senior.totalEffort}人日（${allocation.senior.tasks.length}タスク）、` +
                          `ミドル: ${allocation.middle.totalEffort}人日（${allocation.middle.tasks.length}タスク）、` +
                          `ジュニア: ${allocation.junior.totalEffort}人日（${allocation.junior.tasks.length}タスク）`
          }
        }]
      };

    case 'calculate_skill_efficiency':
      // スキルレベル×AI効率化計算
      const skillEfficiencyMap = {
        senior: { coding: 0.25, testing: 0.20, documentation: 0.30, design: 0.25, research: 0.25 },
        middle: { coding: 0.35, testing: 0.30, documentation: 0.35, design: 0.30, research: 0.30 },
        junior: { coding: 0.50, testing: 0.40, documentation: 0.40, design: 0.35, research: 0.35 }
      };

      const baseEfficiency = args.useAi
        ? (skillEfficiencyMap[args.skillLevel]?.[args.taskType] || 0.3)
        : 0;

      return {
        changes: [{
          type: 'info',
          message: `${args.skillLevel}エンジニアが${args.taskType}を${args.useAi ? 'AI活用で' : 'AI活用なしで'}実施する効率化比率を計算しました`,
          data: {
            skillLevel: args.skillLevel,
            taskType: args.taskType,
            useAi: args.useAi,
            efficiencyRatio: baseEfficiency,
            efficiencyPercentage: `${(baseEfficiency * 100).toFixed(0)}%`,
            recommendation: args.useAi
              ? `${args.skillLevel}がAI活用すると${(baseEfficiency * 100).toFixed(0)}%効率化されます`
              : 'AI活用を推奨します'
          }
        }]
      };

    case 'identify_risks':
      // リスク特定
      const riskCount = args.knownRisks?.length || 0;
      const highImpactRisks = args.knownRisks?.filter(r => r.impact === 'high').length || 0;
      const highProbabilityRisks = args.knownRisks?.filter(r => r.probability === 'high').length || 0;

      return {
        changes: [{
          type: 'info',
          message: `プロジェクトのリスクを${riskCount}個特定しました`,
          data: {
            projectOverview: args.projectOverview,
            technologyStack: args.technologyStack || [],
            risks: args.knownRisks || [],
            riskCount: riskCount,
            highImpactCount: highImpactRisks,
            highProbabilityCount: highProbabilityRisks,
            recommendation: highImpactRisks > 0
              ? `影響度「高」のリスクが${highImpactRisks}個あります。優先的に軽減策を検討してください。`
              : 'リスクは管理可能な範囲です。'
          }
        }]
      };

    case 'calculate_risk_buffer':
      // リスクバッファ計算
      const bufferMap = {
        conservative: { high: 0.50, medium: 0.30, low: 0.15 },
        moderate: { high: 0.30, medium: 0.20, low: 0.10 },
        aggressive: { high: 0.20, medium: 0.10, low: 0.05 }
      };

      const tolerance = args.riskTolerance || 'moderate';
      let totalBuffer = 0;
      const phaseBuffers = args.phases.map(phase => {
        const bufferRatio = bufferMap[tolerance][phase.riskLevel];
        const bufferEffort = phase.effort * bufferRatio;
        totalBuffer += bufferEffort;

        return {
          phaseName: phase.phaseName,
          baseEffort: phase.effort,
          riskLevel: phase.riskLevel,
          bufferPercentage: (bufferRatio * 100).toFixed(0),
          bufferEffort: bufferEffort.toFixed(1),
          totalEffort: (phase.effort + bufferEffort).toFixed(1)
        };
      });

      return {
        changes: [{
          type: 'info',
          message: `リスク許容度「${tolerance}」でバッファを計算しました（合計+${totalBuffer.toFixed(1)}人日）`,
          data: {
            riskTolerance: tolerance,
            phaseBuffers: phaseBuffers,
            totalBuffer: totalBuffer.toFixed(1),
            recommendation: tolerance === 'conservative'
              ? '保守的な見積もりです。スケジュール余裕を確保できます。'
              : tolerance === 'aggressive'
              ? 'アグレッシブな見積もりです。リスクが顕在化した場合の対応計画を用意してください。'
              : 'バランスの取れた見積もりです。'
          }
        }]
      };

    case 'find_similar_projects':
      // 類似プロジェクト検索
      const similarProjects = args.historicalProjects || [];
      const projectsWithSimilarity = similarProjects.map(proj => {
        // 簡易的な類似度計算（技術スタックの一致率）
        const currentTech = args.currentProject.technologyStack || [];
        const projTech = proj.technologyStack || [];
        const commonTech = currentTech.filter(t => projTech.includes(t));
        const similarityScore = currentTech.length > 0
          ? Math.round((commonTech.length / currentTech.length) * 100)
          : 0;

        return {
          projectName: proj.projectName,
          similarity: similarityScore,
          totalEffort: proj.totalEffort,
          duration: proj.duration
        };
      }).sort((a, b) => b.similarity - a.similarity);

      return {
        changes: [{
          type: 'info',
          message: `${similarProjects.length}個の過去プロジェクトから類似度を計算しました`,
          data: {
            currentProject: args.currentProject,
            similarProjects: projectsWithSimilarity,
            topMatch: projectsWithSimilarity[0] || null,
            recommendation: projectsWithSimilarity[0]
              ? `最も類似度が高いのは「${projectsWithSimilarity[0].projectName}」（類似度${projectsWithSimilarity[0].similarity}%）です。`
              : '過去プロジェクトデータがありません。'
          }
        }]
      };

    case 'adjust_for_differences':
      // 差分調整
      let adjustedEffort = args.baseProject.totalEffort;
      let adjustmentDetails = [];

      args.differences.forEach(diff => {
        const impact = diff.impactPercentage / 100;
        const adjustment = diff.type === 'addition'
          ? adjustedEffort * impact
          : diff.type === 'removal'
          ? -adjustedEffort * impact
          : adjustedEffort * impact * 0.5; // 変更は影響度半分

        adjustedEffort += adjustment;
        adjustmentDetails.push({
          type: diff.type,
          description: diff.description,
          adjustment: adjustment.toFixed(1)
        });
      });

      return {
        changes: [{
          type: 'info',
          message: `差分調整により、見積もりを${args.baseProject.totalEffort}人日から${adjustedEffort.toFixed(1)}人日に調整しました`,
          data: {
            baseProject: args.baseProject,
            adjustedEffort: adjustedEffort.toFixed(1),
            adjustmentDetails: adjustmentDetails,
            adjustmentRatio: ((adjustedEffort / args.baseProject.totalEffort) * 100).toFixed(0)
          }
        }]
      };

    case 'calculate_confidence_interval':
      // 信頼区間計算
      const variance = args.historicalVariance || 0.2; // デフォルト20%
      const similarityFactor = args.similarityScore / 100;
      const adjustedVariance = variance * (1 - similarityFactor * 0.5);

      const optimistic = args.baseEstimate * (1 - adjustedVariance);
      const standard = args.baseEstimate;
      const pessimistic = args.baseEstimate * (1 + adjustedVariance);

      return {
        changes: [{
          type: 'info',
          message: `類似度${args.similarityScore}%に基づく信頼区間を計算しました`,
          data: {
            baseEstimate: args.baseEstimate,
            similarityScore: args.similarityScore,
            optimistic: optimistic.toFixed(1),
            standard: standard.toFixed(1),
            pessimistic: pessimistic.toFixed(1),
            variance: (adjustedVariance * 100).toFixed(0),
            recommendation: similarityFactor > 0.7
              ? '類似度が高いため、信頼性の高い見積もりです。'
              : similarityFactor > 0.4
              ? '類似度が中程度です。差分調整を慎重に行ってください。'
              : '類似度が低いため、見積もりの不確実性が高いです。'
          }
        }]
      };

    case 'select_estimation_method':
      // 見積もり手法選択
      const methodRecommendations = args.subProjects.map(sub => {
        const { uncertainty, scale, constraints } = sub.characteristics;

        let method = 'task_based'; // デフォルト
        let reason = '';

        if (constraints?.includes('budget')) {
          method = 'budget_fixed';
          reason = '予算制約があるため';
        } else if (constraints?.includes('duration')) {
          method = 'duration_fixed';
          reason = '期間制約があるため';
        } else if (uncertainty === 'high') {
          method = 'risk_based';
          reason = '不確実性が高いため';
        } else if (scale === 'large') {
          method = 'phase_based';
          reason = '大規模プロジェクトのため';
        } else if (sub.recommendedMethod) {
          method = sub.recommendedMethod;
          reason = 'ユーザー指定';
        }

        return {
          name: sub.name,
          recommendedMethod: method,
          reason: reason,
          characteristics: sub.characteristics
        };
      });

      return {
        changes: [{
          type: 'info',
          message: `${args.subProjects.length}個のサブプロジェクトに対して最適な手法を選択しました`,
          data: {
            methodRecommendations: methodRecommendations,
            summary: methodRecommendations.reduce((acc, rec) => {
              acc[rec.recommendedMethod] = (acc[rec.recommendedMethod] || 0) + 1;
              return acc;
            }, {})
          }
        }]
      };

    case 'integrate_estimates':
      // 見積もり統合
      const integratedEffort = args.subProjectEstimates.reduce((sum, est) => sum + est.effort, 0);
      const maxDuration = Math.max(...args.subProjectEstimates.map(est => est.duration));

      // クリティカルパス簡易計算
      const integrationCriticalPath = args.subProjectEstimates
        .filter(est => (est.dependencies || []).length > 0)
        .map(est => est.name);

      return {
        changes: [{
          type: 'info',
          message: `${args.subProjectEstimates.length}個のサブプロジェクトを統合しました`,
          data: {
            subProjectEstimates: args.subProjectEstimates,
            totalEffort: integratedEffort.toFixed(1),
            estimatedDuration: maxDuration,
            criticalPath: integrationCriticalPath,
            recommendation: `総工数${integratedEffort.toFixed(1)}人日、最長期間${maxDuration}日で完了予定です。`
          }
        }]
      };

    case 'define_sla':
      // SLA定義
      const uptimeRequirement = args.availability >= 99.9 ? '高可用性' : args.availability >= 99.0 ? '標準' : '基本';
      const rtoMinutes = args.rto;
      const supportLevel = rtoMinutes <= 30 ? 'プレミアム（24/7対応）' : rtoMinutes <= 120 ? 'スタンダード（営業時間対応）' : 'ベーシック';

      return {
        changes: [{
          type: 'info',
          message: `稼働率${args.availability}%、RTO ${rtoMinutes}分のSLAを定義しました`,
          data: {
            availability: args.availability,
            rto: rtoMinutes,
            responseTime: args.responseTime,
            uptimeRequirement: uptimeRequirement,
            supportLevel: supportLevel,
            recommendation: `${uptimeRequirement}要件のため、${supportLevel}の体制が必要です。`
          }
        }]
      };

    case 'estimate_maintenance_tasks':
      // 保守タスク見積もり
      const scaleMultiplier = { small: 1, medium: 2, large: 4 }[args.systemScale] || 1;

      const taskEstimates = {
        incident: (args.monthlyIncidents || 5) * 4 * scaleMultiplier, // 1件4時間
        maintenance: 16 * scaleMultiplier, // 月16時間
        minor_change: 32 * scaleMultiplier, // 月32時間
        inquiry: (args.monthlyInquiries || 20) * 0.5 // 1件30分
      };

      const scopeItems = args.maintenanceScope || [];
      let totalMonthlyHours = 0;
      scopeItems.forEach(scope => {
        totalMonthlyHours += taskEstimates[scope] || 0;
      });

      const monthlyEffort = totalMonthlyHours / 8; // 人日換算

      return {
        changes: [{
          type: 'info',
          message: `${args.systemScale}規模システムの保守タスクを見積もりました（月次${monthlyEffort.toFixed(1)}人日）`,
          data: {
            systemScale: args.systemScale,
            maintenanceScope: scopeItems,
            taskEstimates: taskEstimates,
            totalMonthlyHours: totalMonthlyHours.toFixed(1),
            monthlyEffort: monthlyEffort.toFixed(1),
            recommendation: `月次${monthlyEffort.toFixed(1)}人日（約${totalMonthlyHours.toFixed(0)}時間）の保守工数が必要です。`
          }
        }]
      };

    case 'calculate_monthly_cost':
      // 月額コスト計算
      const maintenanceAiEfficiency = args.aiUtilization ? 0.35 : 0; // AI活用で35%削減
      const effectiveEffort = args.monthlyEffort * (1 - maintenanceAiEfficiency);

      const slaMultiplier = { basic: 1.0, standard: 1.3, premium: 1.8 }[args.slaLevel] || 1.0;
      const monthlyCost = effectiveEffort * args.unitCost * slaMultiplier;
      const annualCost = monthlyCost * 12;

      return {
        changes: [{
          type: 'info',
          message: `月額保守費用を計算しました: ${monthlyCost.toLocaleString()}円/月`,
          data: {
            monthlyEffort: args.monthlyEffort,
            unitCost: args.unitCost,
            aiUtilization: args.aiUtilization,
            aiSavings: args.aiUtilization ? (args.monthlyEffort * maintenanceAiEfficiency * args.unitCost).toFixed(0) : 0,
            slaLevel: args.slaLevel,
            slaMultiplier: slaMultiplier,
            effectiveEffort: effectiveEffort.toFixed(1),
            monthlyCost: monthlyCost.toFixed(0),
            annualCost: annualCost.toFixed(0),
            recommendation: args.aiUtilization
              ? `AI活用により月額${(args.monthlyEffort * maintenanceAiEfficiency * args.unitCost).toLocaleString()}円削減できます。`
              : 'AI活用を検討することで、さらにコスト削減が可能です。'
          }
        }]
      };

    default:
      logger.warn(`未知のツール: ${toolName}`);
      return { changes: null };
  }
}

module.exports = {
  processEstimateChatMessage,
  ESTIMATE_TOOLS
};
