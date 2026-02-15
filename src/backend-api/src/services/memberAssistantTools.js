/**
 * メンバー向けAIアシスタントのツール定義
 *
 * メンバーは以下の操作のみ可能：
 * - 自分のタスクの照会・更新
 * - コメントの閲覧・追加
 * - プロジェクト状況の照会
 */

// メンバー向けツール定義（読み取り系）
const READ_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_my_tasks',
      description: '自分が担当しているタスクの一覧を取得します。フィルタで絞り込みができます。',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['all', 'today', 'this_week', 'overdue', 'upcoming'],
            description: 'フィルタ条件（all=全て、today=今日、this_week=今週、overdue=遅延、upcoming=期限が近い）'
          },
          status: {
            type: 'string',
            enum: ['not-started', 'in-progress', 'completed', 'blocked'],
            description: 'ステータスで絞り込み（省略時は全ステータス）'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_details',
      description: 'タスクの詳細情報を取得します。タスクIDまたはタスク名で指定できます。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'タスクID（例: "1.2"）'
          },
          taskName: {
            type: 'string',
            description: 'タスク名（部分一致で検索）'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_comments',
      description: 'タスクに付いているコメント一覧を取得します。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'タスクID'
          },
          limit: {
            type: 'number',
            description: '取得件数（デフォルト: 20）'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_comments',
      description: 'コメントをキーワードで検索します。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '検索キーワード'
          },
          taskId: {
            type: 'string',
            description: '特定タスクのコメントのみ検索する場合に指定'
          },
          author: {
            type: 'string',
            description: '特定の投稿者のコメントのみ検索する場合に指定'
          }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_status',
      description: 'プロジェクト全体の進捗状況を取得します。',
      parameters: {
        type: 'object',
        properties: {
          includeDetails: {
            type: 'boolean',
            description: 'マイルストーンや遅延タスクの詳細を含めるかどうか（デフォルト: false）'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_members',
      description: 'プロジェクトの参加メンバー一覧を取得します。',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'プロジェクトID（省略時は現在のプロジェクト）'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_schedule',
      description: '指定期間のスケジュール情報を取得します。',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'tomorrow', 'this_week', 'next_week', 'this_month'],
            description: '期間（today=今日、tomorrow=明日、this_week=今週、next_week=来週、this_month=今月）'
          }
        },
        required: ['period']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_dependencies',
      description: 'タスクの依存関係を取得します。このタスクがブロックしている/されているタスクを確認できます。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'タスクID'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_work_summary',
      description: '指定期間の作業サマリーを取得します。日報作成などに使用できます。',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'yesterday', 'this_week', 'last_week'],
            description: '期間'
          },
          format: {
            type: 'string',
            enum: ['brief', 'detailed'],
            description: '出力形式（brief=簡潔、detailed=詳細）'
          }
        },
        required: ['period']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_tasks',
      description: 'タスクをキーワードで検索します。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '検索キーワード（タスク名、説明で検索）'
          },
          assignee: {
            type: 'string',
            description: '担当者名で絞り込み'
          },
          status: {
            type: 'string',
            enum: ['not-started', 'in-progress', 'completed', 'blocked'],
            description: 'ステータスで絞り込み'
          }
        },
        required: ['keyword']
      }
    }
  }
];

// メンバー向けツール定義（書き込み系 - 確認必要）
const WRITE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'update_my_task_progress',
      description: '自分が担当しているタスクの進捗を更新します。自分のタスクのみ更新可能です。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'タスクID'
          },
          progress: {
            type: 'number',
            description: '進捗率（0-100）'
          },
          status: {
            type: 'string',
            enum: ['not-started', 'in-progress', 'completed', 'blocked'],
            description: 'ステータス'
          },
          note: {
            type: 'string',
            description: '更新メモ（任意）'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_task_comment',
      description: 'タスクにコメントを追加します。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'タスクID'
          },
          content: {
            type: 'string',
            description: 'コメント内容'
          }
        },
        required: ['taskId', 'content']
      }
    }
  }
];

// 全ツールを結合
const MEMBER_ASSISTANT_TOOLS = [...READ_ONLY_TOOLS, ...WRITE_TOOLS];

// 書き込み系ツールかどうかを判定
function isWriteTool(toolName) {
  return WRITE_TOOLS.some(t => t.function.name === toolName);
}

// ツール名のリストを取得
function getToolNames() {
  return MEMBER_ASSISTANT_TOOLS.map(t => t.function.name);
}

module.exports = {
  MEMBER_ASSISTANT_TOOLS,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
  isWriteTool,
  getToolNames
};
