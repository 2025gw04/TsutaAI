const fs = require('fs');
const path = require('path');
const settingsService = require('./settingsService');
const logger = require('../utils/logger');
const LLMAdapterFactory = require('./llm-adapters');
const { ProxyAgent } = require('undici');
const { MEMBER_ASSISTANT_TOOLS, isWriteTool } = require('./memberAssistantTools');

const PROMPT_DIR = path.resolve(process.cwd(), '..', 'prompts');

function providerNeedsApiKey(provider) {
  return (provider || 'groq').toLowerCase() !== 'ollama';
}

/**
 * 会話履歴をLLM向けに正規化
 * - user/assistant のみを対象
 * - 無効な要素や空メッセージは除外
 */
function normalizeConversationHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) {
    return [];
  }

  return conversationHistory
    .filter(msg => msg && typeof msg.content === 'string')
    .map(msg => {
      const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : '';
      if (role !== 'user' && role !== 'assistant') {
        return null;
      }

      const content = msg.content.trim();
      if (!content) {
        return null;
      }

      return {
        role,
        content
      };
    })
    .filter(Boolean);
}

// Phase 2で実装するツール定義（基本操作のみ）
const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_task',
      description: 'タスク情報を取得します。タスクIDまたはタスク名で検索できます。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'タスクID（例: "1.2"）'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'タスクの情報を更新します。タスク名、説明、担当者、期限などを変更できます。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'タスクID'
          },
          changes: {
            type: 'object',
            description: 'タスクの変更内容（name, description, assignee, startDate, endDate, priority, status等）',
            properties: {
              name: { type: 'string', description: 'タスク名' },
              description: { type: 'string', description: '説明' },
              assignee: { type: 'string', description: '担当者名' },
              startDate: { type: 'string', description: '開始日（YYYY-MM-DD形式）' },
              endDate: { type: 'string', description: '終了日（YYYY-MM-DD形式）' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '優先度' },
              status: { type: 'string', enum: ['not-started', 'in-progress', 'completed'], description: 'ステータス' },
              progress: { type: 'number', description: '進捗率（0-100）' },
              effortDays: { type: 'number', description: '工数（日数）' },
              deliverable: { type: 'string', description: '成果物' }
            }
          }
        },
        required: ['taskId', 'changes']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '新しいタスクを作成します。複数のタスクを作成する場合はtasksに配列で指定できます。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'タスク名（単一タスク作成時）' },
          parentId: { type: ['string', 'null'], description: '親タスクのID（ルートタスクの場合はnull）' },
          details: {
            type: 'object',
            description: 'タスクの詳細情報（単一タスク作成時）',
            properties: {
              description: { type: 'string' },
              assignee: { type: 'string' },
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              priority: { type: 'string' },
              effortDays: { type: 'number' },
              deliverable: { type: 'string' }
            }
          },
          tasks: {
            type: 'array',
            description: '複数タスク作成時のタスク配列',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                parentId: { type: ['string', 'null'] },
                description: { type: 'string' },
                assignee: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                priority: { type: 'string' },
                effortDays: { type: 'number' },
                deliverable: { type: 'string' }
              },
              required: ['name']
            }
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'タスクを削除します。子タスクも一緒に削除されます。複数のタスクを削除する場合はtaskIdsに配列で指定できます。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '削除するタスクID（単一）' },
          taskIds: { type: 'array', items: { type: 'string' }, description: '削除するタスクIDの配列（複数）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulk_update_tasks',
      description: '複数のタスクを一括で更新します。「すべてのタスク」「全タスク」「全て」のように全タスクを対象とする場合や、条件に合うタスクをまとめて変更する際に使用します。全タスクを対象にする場合はfilterに空のオブジェクト{}を指定してください。',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'object',
            description: '更新対象タスクの条件。全タスクを対象にする場合は空のオブジェクト{}を指定。特定の条件で絞り込む場合は以下のプロパティを使用。',
            properties: {
              taskIds: { type: 'array', items: { type: 'string' }, description: 'タスクIDの配列（特定のタスクを指定）' },
              parentId: { type: 'string', description: '特定の親タスク配下のみ対象にする' },
              assignee: { type: 'string', description: '特定の担当者が割り当てられたタスクのみ対象' },
              status: { type: 'string', description: '特定のステータスのタスクのみ対象' },
              nameContains: { type: 'string', description: 'タスク名に特定の文字列を含むもののみ対象' }
            }
          },
          changes: {
            type: 'object',
            description: '変更内容',
            properties: {
              assignee: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in-progress', 'completed', 'blocked'] },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              effortDays: { type: 'number' }
            }
          }
        },
        required: ['filter', 'changes']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_dependencies',
      description: 'タスク間の依存関係を設定します。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '依存先となるタスクのID' },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: '依存元タスクIDの配列（このタスクが完了するまで待つタスク）'
          },
          action: {
            type: 'string',
            enum: ['add', 'remove', 'replace'],
            description: 'add=追加、remove=削除、replace=置換'
          }
        },
        required: ['taskId', 'dependsOn', 'action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_task',
      description: 'タスクを別の親タスク配下に移動します。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '移動するタスクのID' },
          newParentId: {
            type: ['string', 'null'],
            description: '新しい親タスクのID（ルートレベルに移動する場合はnull）'
          },
          position: {
            type: 'number',
            description: '挿入位置（0から始まるインデックス、省略時は末尾）'
          }
        },
        required: ['taskId', 'newParentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_tasks',
      description: 'タスクの遅延やブロックを検知し、最適なリスケジュール案を提案します。既存のリスケジュール機能を呼び出します。',
      parameters: {
        type: 'object',
        properties: {
          triggerTaskId: {
            type: 'string',
            description: 'リスケジュールのトリガーとなったタスクのID（遅延したタスクなど）'
          },
          reason: {
            type: 'string',
            description: 'リスケジュールが必要な理由（例: タスク遅延、依存関係の変更、リソース不足など）'
          }
        },
        required: ['reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'auto_assign_tasks',
      description: '未割り当てのタスクをチームメンバーのスキルと負荷に基づいて自動的に割り当てます。',
      parameters: {
        type: 'object',
        properties: {
          targetTaskIds: {
            type: 'array',
            items: { type: 'string' },
            description: '割り当て対象のタスクID配列（省略時は全未割り当てタスク）'
          },
          balanceWorkload: {
            type: 'boolean',
            description: '作業負荷を均等に分散するかどうか（デフォルト: true）'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'decompose_task',
      description: 'タスクをより細かいサブタスクに分解します。AIが適切な粒度で分解案を提案します。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '分解するタスクのID'
          },
          detailLevel: {
            type: 'string',
            enum: ['basic', 'detailed', 'comprehensive'],
            description: '分解の詳細度（basic=基本的な分解、detailed=詳細な分解、comprehensive=包括的な分解）'
          },
          instruction: {
            type: 'string',
            description: '追加の指示やコンテキスト（省略可）'
          }
        },
        required: ['taskId']
      }
    }
  }
];

/**
 * WBSチャットメッセージを処理
 */
async function processWbsChatMessage(context) {
  const { userMessage, conversationHistory, tasks, project, teamMembers } = context;

  // システムプロンプトを読み込み
  const systemPromptTemplate = loadPrompt('wbs-chat-system');

  // プロンプト変数を置換
  let systemPrompt = systemPromptTemplate
    .replace('{project_name}', project.name || 'プロジェクト')
    .replace('{project_goal}', project.goal || 'プロジェクトの目標')
    .replace('{team_members}', teamMembers.map(u => u.fullName || u.username).join(', '))
    .replace('{current_tasks}', JSON.stringify(tasks, null, 2));

  // 「すべて」「全て」「全タスク」のパターンを検出
  const allTasksPatterns = [
    /すべて.*タスク/,
    /全て.*タスク/,
    /全タスク/,
    /タスク.*すべて/,
    /タスク.*全て/,
    /全部.*タスク/,
    /タスク.*全部/
  ];

  const containsAllTasks = allTasksPatterns.some(pattern => pattern.test(userMessage));
  const isUpdateOperation = /変更|修正|更新|設定/.test(userMessage);

  // 全タスク対象の更新操作の場合、システムプロンプトに追加指示
  if (containsAllTasks && isUpdateOperation) {
    systemPrompt += '\n\n【重要な追加指示】ユーザーは「すべてのタスク」または「全タスク」の更新を要求しています。必ずbulk_update_tasksツールを使用し、filterパラメータには空のオブジェクト{}を指定してください。update_taskツールは使用しないでください。';
  }

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
      } catch (error) {
        logger.error(`プロキシ初期化エラー: ${error.message}`);
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

    logger.info(`WBSチャット: provider=${aiConfig.provider}, model=${aiConfig.model}, tools=${AVAILABLE_TOOLS.length}`);

    // アダプター経由でチャット（Function Calling対応）
    // 継続会話のため、過去の user / assistant 両方を履歴として渡す
    const systemMessage = messages.find(m => m.role === 'system');
    const history = normalizeConversationHistory(conversationHistory);
    const userMessageText = messages[messages.length - 1].content;

    const result = await adapter.chat({
      systemPrompt: systemMessage?.content || '',
      history,
      userMessage: userMessageText,
      tools: AVAILABLE_TOOLS
    });

    // 結果からtoolCallsを取得
    const choice = {
      message: {
        content: result.message,
        tool_calls: result.toolCalls
      }
    };

    // ツール呼び出しがある場合
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const preview = [];

      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        // ツールごとにプレビューデータを生成
        const result = executeToolForPreview(toolName, args, tasks);
        if (result.changes) {
          preview.push(...result.changes);
        }
      }

      return {
        message: choice.message.content || 'タスクを変更します。内容を確認して「適用」ボタンをクリックしてください。',
        toolCalls: choice.message.tool_calls,
        preview,
        needsConfirmation: true
      };
    }

    // 通常の応答（ツール呼び出しなし）
    return {
      message: choice.message.content,
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
function executeToolForPreview(toolName, args, currentTasks) {
  logger.info(`ツール実行（プレビュー）: ${toolName}`, args);

  switch (toolName) {
    case 'get_task':
      // タスク照会はプレビュー不要
      return { changes: null };

    case 'update_task':
      // タスクを検索
      const task = findTaskById(currentTasks, args.taskId);
      if (!task) {
        return {
          changes: [{
            type: 'error',
            taskId: args.taskId,
            message: `タスク ${args.taskId} が見つかりませんでした`
          }]
        };
      }

      return {
        changes: [{
          type: 'update',
          taskId: args.taskId,
          taskName: task.name,
          changes: args.changes
        }]
      };

    case 'create_task':
      // 単一作成または複数作成に対応
      if (args.tasks && Array.isArray(args.tasks)) {
        // 複数タスク作成
        return {
          changes: args.tasks.map(task => ({
            type: 'create',
            parentId: task.parentId || null,
            taskName: task.name,
            changes: {
              name: task.name,
              description: task.description,
              assignee: task.assignee,
              startDate: task.startDate,
              endDate: task.endDate,
              priority: task.priority,
              effortDays: task.effortDays,
              deliverable: task.deliverable
            }
          }))
        };
      } else {
        // 単一タスク作成
        return {
          changes: [{
            type: 'create',
            parentId: args.parentId || null,
            taskName: args.name,
            changes: {
              name: args.name,
              ...args.details
            }
          }]
        };
      }

    case 'delete_task':
      // 単一削除または複数削除に対応
      const taskIdsToDelete = args.taskIds || (args.taskId ? [args.taskId] : []);
      return {
        changes: taskIdsToDelete.map(taskId => {
          const taskToDelete = findTaskById(currentTasks, taskId);
          return {
            type: 'delete',
            taskId,
            taskName: taskToDelete ? taskToDelete.name : taskId
          };
        })
      };

    case 'bulk_update_tasks':
      // フィルタに一致するタスクを検索
      const matchedTasks = filterTasks(currentTasks, args.filter);
      return {
        changes: matchedTasks.map(task => ({
          type: 'update',
          taskId: task.id,
          taskName: task.name,
          changes: args.changes
        }))
      };

    case 'set_dependencies':
      const depTask = findTaskById(currentTasks, args.taskId);
      if (!depTask) {
        return {
          changes: [{
            type: 'error',
            taskId: args.taskId,
            message: `タスク ${args.taskId} が見つかりませんでした`
          }]
        };
      }

      let newDependencies = depTask.dependencies || [];
      if (args.action === 'add') {
        newDependencies = [...new Set([...newDependencies, ...args.dependsOn])];
      } else if (args.action === 'remove') {
        newDependencies = newDependencies.filter(dep => !args.dependsOn.includes(dep));
      } else if (args.action === 'replace') {
        newDependencies = args.dependsOn;
      }

      return {
        changes: [{
          type: 'update',
          taskId: args.taskId,
          taskName: depTask.name,
          changes: { dependencies: newDependencies }
        }]
      };

    case 'move_task':
      const taskToMove = findTaskById(currentTasks, args.taskId);
      return {
        changes: [{
          type: 'move',
          taskId: args.taskId,
          taskName: taskToMove ? taskToMove.name : args.taskId,
          parentId: args.newParentId,
          newPosition: args.position
        }]
      };

    case 'reschedule_tasks':
      // リスケジュールは既存の機能を呼び出すため、プレビューではなく実行指示を返す
      return {
        changes: [{
          type: 'external_action',
          action: 'reschedule',
          taskId: args.triggerTaskId,
          reason: args.reason,
          message: 'リスケジュール機能を呼び出します。影響を受けるタスクを分析して最適なスケジュールを提案します。'
        }]
      };

    case 'auto_assign_tasks':
      // 自動割り当ても既存の機能を呼び出す
      return {
        changes: [{
          type: 'external_action',
          action: 'auto_assign',
          targetTaskIds: args.targetTaskIds,
          balanceWorkload: args.balanceWorkload !== false,
          message: 'タスクの自動割り当て機能を呼び出します。チームメンバーのスキルと負荷を分析して最適な割り当てを提案します。'
        }]
      };

    case 'decompose_task':
      // タスク分解も既存の機能を呼び出す
      const taskToDecompose = findTaskById(currentTasks, args.taskId);
      return {
        changes: [{
          type: 'external_action',
          action: 'decompose',
          taskId: args.taskId,
          taskName: taskToDecompose ? taskToDecompose.name : args.taskId,
          detailLevel: args.detailLevel || 'detailed',
          instruction: args.instruction,
          message: `タスク「${taskToDecompose ? taskToDecompose.name : args.taskId}」を分解します。AIがサブタスクの提案を生成します。`
        }]
      };

    default:
      logger.warn(`未知のツール: ${toolName}`);
      return { changes: null };
  }
}

/**
 * タスクをフィルタリングして返す
 * @param {Array} tasks タスク配列
 * @param {Object} filter フィルタ条件（空オブジェクト{}の場合は全タスクを返す）
 * @returns {Array} フィルタ条件に一致するタスクの配列
 */
function filterTasks(tasks, filter) {
  let result = [];

  function traverse(taskList, parentId = null) {
    for (const task of taskList) {
      let matches = true;

      // taskIdsフィルタ
      if (filter.taskIds && filter.taskIds.length > 0) {
        matches = matches && filter.taskIds.includes(task.id);
      }

      // parentIdフィルタ
      if (filter.parentId !== undefined) {
        matches = matches && (parentId === filter.parentId);
      }

      // assigneeフィルタ
      if (filter.assignee) {
        matches = matches && (task.assignee === filter.assignee);
      }

      // statusフィルタ
      if (filter.status) {
        matches = matches && (task.status === filter.status);
      }

      // nameContainsフィルタ
      if (filter.nameContains) {
        matches = matches && task.name.includes(filter.nameContains);
      }

      if (matches) {
        result.push(task);
      }

      // 子タスクを再帰的に検索
      if (task.children && task.children.length > 0) {
        traverse(task.children, task.id);
      }
    }
  }

  traverse(tasks);
  return result;
}

/**
 * タスクIDでタスクを検索
 */
function findTaskById(tasks, taskId) {
  for (const task of tasks) {
    if (task.id === taskId) {
      return task;
    }
    if (task.children && task.children.length > 0) {
      const found = findTaskById(task.children, taskId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * プロンプトファイルを読み込み
 */
function loadPrompt(name) {
  const filePath = path.join(PROMPT_DIR, `${name}.txt`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${name}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * メンバー向けAIアシスタントメッセージを処理
 */
async function processMemberAssistantMessage(context) {
  const { userMessage, conversationHistory, tasks, project, memberContext } = context;

  // システムプロンプトを読み込み
  const systemPromptTemplate = loadPrompt('member-assistant-system');

  // 担当タスク情報を整形
  const currentTasksFormatted = formatMemberTasks(memberContext.currentTasks || []);

  // プロジェクト情報を整形
  const projectInfo = project.name
    ? `プロジェクト名: ${project.name}\n目標: ${project.goal || '未設定'}`
    : '現在参加中のプロジェクトはありません。';

  // ダッシュボード全体状況を整形
  const dashboardOverview = formatDashboardOverview(memberContext);

  // プロンプト変数を置換
  let systemPrompt = systemPromptTemplate
    .replace('{user_name}', memberContext.userName || 'メンバー')
    .replace('{user_id}', memberContext.userId || '')
    .replace('{current_tasks}', currentTasksFormatted)
    .replace('{project_info}', projectInfo)
    .replace('{dashboard_overview}', dashboardOverview);

  // 旧テンプレート互換: プレースホルダが未定義でもダッシュボード文脈を付与
  if (!systemPromptTemplate.includes('{dashboard_overview}') && dashboardOverview) {
    systemPrompt += `\n\n# ダッシュボード全体状況\n${dashboardOverview}`;
  }

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
      } catch (error) {
        logger.error(`プロキシ初期化エラー: ${error.message}`);
      }
    }

    // LLMアダプターを生成
    const adapter = LLMAdapterFactory.create(aiConfig.provider, {
      apiKey: aiConfig.apiKey,
      endpoint: aiConfig.endpoint,
      model: aiConfig.model,
      temperature: 0.3,
      maxTokens: 4096,
      proxyAgent
    });

    logger.info(`メンバーアシスタント: provider=${aiConfig.provider}, model=${aiConfig.model}, tools=${MEMBER_ASSISTANT_TOOLS.length}`);

    // アダプター経由でチャット（Function Calling対応）
    // 継続会話のため、過去の user / assistant 両方を履歴として渡す
    const systemMessage = messages.find(m => m.role === 'system');
    const history = normalizeConversationHistory(conversationHistory);
    const userMsg = messages[messages.length - 1].content;

    const result = await adapter.chat({
      systemPrompt: systemMessage?.content || '',
      history,
      userMessage: userMsg,
      tools: MEMBER_ASSISTANT_TOOLS
    });

    // 結果からtoolCallsを取得
    const choice = {
      message: {
        content: result.message,
        tool_calls: result.toolCalls
      }
    };

    // ツール呼び出しがある場合
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const preview = [];
      let hasWriteOperation = false;
      const toolResults = [];

      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        // 書き込み系ツールかどうかを判定
        if (isWriteTool(toolName)) {
          hasWriteOperation = true;
          const result = executeMemberToolForPreview(toolName, args, memberContext);
          if (result.changes) {
            preview.push(...result.changes);
          }
        } else {
          // 読み取り系ツールを実行
          const toolResult = executeMemberReadTool(toolName, args, memberContext, project);
          if (toolResult) {
            toolResults.push({ tool: toolName, result: toolResult });
          }
        }
      }

      // 書き込み操作がある場合は確認を求める
      if (hasWriteOperation && preview.length > 0) {
        return {
          message: choice.message.content || '変更を行います。内容を確認して「適用」ボタンをクリックしてください。',
          toolCalls: choice.message.tool_calls,
          preview,
          needsConfirmation: true
        };
      }

      // 読み取りツールの結果がある場合、AIの応答と結合
      if (toolResults.length > 0) {
        const toolResultsText = toolResults.map(tr => formatToolResult(tr.tool, tr.result)).join('\n\n');
        const combinedMessage = choice.message.content
          ? `${choice.message.content}\n\n${toolResultsText}`
          : toolResultsText;
        return {
          message: combinedMessage,
          toolCalls: choice.message.tool_calls,
          preview: null,
          needsConfirmation: false
        };
      }
    }

    // 通常の応答（ツール呼び出しなし、または読み取り系のみ）
    return {
      message: choice.message.content,
      toolCalls: choice.message.tool_calls || null,
      preview: null,
      needsConfirmation: false
    };

  } catch (error) {
    logger.error('メンバーアシスタント処理エラー:', error);
    throw error;
  }
}

/**
 * メンバーのタスク情報を整形
 */
function formatMemberTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return '担当タスクはありません。';
  }

  return tasks.map(task => {
    const status = task.status === 'completed' ? '✅完了' :
                   task.status === 'in-progress' ? '🔄進行中' :
                   task.status === 'blocked' ? '⚠️ブロック' : '📋未着手';
    const progress = task.progress ? `${task.progress}%` : '0%';
    const dueDate = task.dueDate || task.endDate || '期限なし';

    return `- [${task.id}] ${task.name} | ${status} | 進捗: ${progress} | 期限: ${dueDate}`;
  }).join('\n');
}

/**
 * ダッシュボード全体状況を整形
 */
function formatDashboardOverview(memberContext) {
  const overview = typeof memberContext.dashboardOverview === 'string'
    ? memberContext.dashboardOverview.trim()
    : '';

  if (overview) {
    return overview;
  }

  const tasks = Array.isArray(memberContext.currentTasks) ? memberContext.currentTasks : [];
  if (tasks.length === 0) {
    return 'ダッシュボード概要は未取得です。';
  }

  const isCompleted = (task) => {
    const status = (task.status || '').toLowerCase();
    return status === 'completed' || status === 'done';
  };

  const total = tasks.length;
  const completed = tasks.filter(isCompleted).length;
  const inProgress = tasks.filter(t => (t.status || '').toLowerCase() === 'in-progress').length;
  const pending = total - completed;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter(t => {
    const dueDate = t.dueDate || t.endDate;
    if (!dueDate || isCompleted(t)) return false;
    return new Date(dueDate) < today;
  }).length;

  const lines = [
    `タスク集計: 全体=${total}件 / 未完了=${pending}件 / 完了=${completed}件 / 進行中=${inProgress}件 / 期限超過=${overdue}件`
  ];

  const highlightTasks = tasks
    .filter(t => !isCompleted(t))
    .slice(0, 3)
    .map(t => {
      const dueDate = t.dueDate || t.endDate || '期限未設定';
      const progress = typeof t.progress === 'number' ? `${t.progress}%` : '0%';
      return `- ${t.name || '名称未設定'} | 進捗=${progress} | 期限=${dueDate}`;
    });

  if (highlightTasks.length > 0) {
    lines.push('注目タスク:');
    lines.push(...highlightTasks);
  }

  return lines.join('\n');
}

/**
 * 読み取り系ツールを実行
 */
function executeMemberReadTool(toolName, args, memberContext, project) {
  logger.info(`メンバーツール実行（読み取り）: ${toolName}`, args);
  const tasks = memberContext.currentTasks || [];

  switch (toolName) {
    case 'get_my_tasks': {
      let filteredTasks = [...tasks];

      // フィルタ適用
      if (args.filter) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);

        switch (args.filter) {
          case 'today':
            filteredTasks = filteredTasks.filter(t => {
              const dueDate = t.dueDate || t.endDate;
              if (!dueDate) return false;
              const due = new Date(dueDate);
              due.setHours(0, 0, 0, 0);
              return due.getTime() === today.getTime();
            });
            break;
          case 'this_week':
            filteredTasks = filteredTasks.filter(t => {
              const dueDate = t.dueDate || t.endDate;
              if (!dueDate) return false;
              const due = new Date(dueDate);
              return due >= today && due <= weekEnd;
            });
            break;
          case 'overdue':
            filteredTasks = filteredTasks.filter(t => {
              const dueDate = t.dueDate || t.endDate;
              if (!dueDate) return false;
              const due = new Date(dueDate);
              return due < today && t.status !== 'completed';
            });
            break;
          case 'upcoming':
            filteredTasks = filteredTasks.filter(t => {
              const dueDate = t.dueDate || t.endDate;
              if (!dueDate) return false;
              const due = new Date(dueDate);
              const threeDaysLater = new Date(today);
              threeDaysLater.setDate(threeDaysLater.getDate() + 3);
              return due >= today && due <= threeDaysLater && t.status !== 'completed';
            });
            break;
        }
      }

      // ステータスフィルタ
      if (args.status) {
        filteredTasks = filteredTasks.filter(t => t.status === args.status);
      }

      return { tasks: filteredTasks, count: filteredTasks.length };
    }

    case 'get_task_details': {
      let task = null;
      if (args.taskId) {
        task = tasks.find(t => t.id === args.taskId || t.taskKey === args.taskId);
      } else if (args.taskName) {
        task = tasks.find(t =>
          t.name && t.name.toLowerCase().includes(args.taskName.toLowerCase())
        );
      }
      return task ? { task } : { error: 'タスクが見つかりません' };
    }

    case 'get_project_status': {
      const total = tasks.length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const inProgress = tasks.filter(t => t.status === 'in-progress').length;
      const notStarted = tasks.filter(t => t.status === 'not-started' || !t.status).length;
      const blocked = tasks.filter(t => t.status === 'blocked').length;

      const avgProgress = total > 0
        ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / total)
        : 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overdue = tasks.filter(t => {
        const dueDate = t.dueDate || t.endDate;
        if (!dueDate) return false;
        return new Date(dueDate) < today && t.status !== 'completed';
      }).length;

      return {
        projectName: project.name || '不明',
        total,
        completed,
        inProgress,
        notStarted,
        blocked,
        overdue,
        avgProgress
      };
    }

    case 'get_project_members': {
      // タスクから担当者を集約してメンバー情報を作成
      const memberMap = new Map();

      // 自分を追加
      if (memberContext.userId) {
        memberMap.set(memberContext.userId.toString(), {
          id: memberContext.userId.toString(),
          name: memberContext.userName || '自分'
        });
      }

      // タスクの担当者を追加
      tasks.forEach(task => {
        if (task.assigneeId && !memberMap.has(task.assigneeId.toString())) {
          memberMap.set(task.assigneeId.toString(), {
            id: task.assigneeId.toString(),
            name: task.assigneeName || `ユーザー${task.assigneeId}`
          });
        }
      });

      // タスク数を集計
      const members = Array.from(memberMap.values()).map(member => {
        const memberTasks = tasks.filter(t =>
          t.assigneeId && t.assigneeId.toString() === member.id
        );
        const completed = memberTasks.filter(t => t.status === 'completed').length;
        const inProgress = memberTasks.filter(t => t.status === 'in-progress').length;

        return {
          ...member,
          taskCount: memberTasks.length,
          completedTasks: completed,
          inProgressTasks: inProgress
        };
      });

      return {
        projectName: project.name || '不明',
        totalMembers: members.length,
        members
      };
    }

    case 'get_schedule': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let startDate = new Date(today);
      let endDate = new Date(today);

      switch (args.period) {
        case 'today':
          endDate = new Date(today);
          break;
        case 'tomorrow':
          startDate.setDate(startDate.getDate() + 1);
          endDate = new Date(startDate);
          break;
        case 'this_week':
          endDate.setDate(endDate.getDate() + 7);
          break;
        case 'next_week':
          startDate.setDate(startDate.getDate() + 7);
          endDate.setDate(endDate.getDate() + 14);
          break;
        case 'this_month':
          endDate.setMonth(endDate.getMonth() + 1);
          break;
      }

      const scheduledTasks = tasks.filter(t => {
        const dueDate = t.dueDate || t.endDate;
        if (!dueDate) return false;
        const due = new Date(dueDate);
        return due >= startDate && due <= endDate;
      });

      return { period: args.period, tasks: scheduledTasks, count: scheduledTasks.length };
    }

    case 'get_work_summary': {
      const total = tasks.length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const inProgress = tasks.filter(t => t.status === 'in-progress').length;

      return {
        period: args.period || 'today',
        totalTasks: total,
        completedTasks: completed,
        inProgressTasks: inProgress,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      };
    }

    case 'search_tasks': {
      const keyword = (args.keyword || '').toLowerCase();
      let results = tasks.filter(t =>
        (t.name && t.name.toLowerCase().includes(keyword)) ||
        (t.description && t.description.toLowerCase().includes(keyword))
      );

      if (args.status) {
        results = results.filter(t => t.status === args.status);
      }

      return { tasks: results, count: results.length, keyword: args.keyword };
    }

    default:
      return null;
  }
}

/**
 * ツール実行結果をフォーマット
 */
function formatToolResult(toolName, result) {
  if (!result) return '';

  switch (toolName) {
    case 'get_my_tasks':
    case 'search_tasks':
    case 'get_schedule': {
      const tasks = result.tasks || [];
      if (tasks.length === 0) {
        return '該当するタスクはありません。';
      }
      const taskList = tasks.map(t => {
        const status = t.status === 'completed' ? '✅' :
                       t.status === 'in-progress' ? '🔄' :
                       t.status === 'blocked' ? '⚠️' : '📋';
        const progress = t.progress ? `${t.progress}%` : '0%';
        const dueDate = t.dueDate || t.endDate || '期限なし';
        return `${status} ${t.name} (進捗: ${progress}, 期限: ${dueDate})`;
      }).join('\n');
      return `📋 タスク一覧 (${tasks.length}件):\n${taskList}`;
    }

    case 'get_task_details': {
      if (result.error) return result.error;
      const t = result.task;
      return `📋 タスク詳細: ${t.name}\n` +
             `・ID: ${t.id}\n` +
             `・ステータス: ${t.status || '未設定'}\n` +
             `・進捗: ${t.progress || 0}%\n` +
             `・期限: ${t.dueDate || t.endDate || '未設定'}\n` +
             (t.description ? `・説明: ${t.description}` : '');
    }

    case 'get_project_status': {
      return `📊 プロジェクト状況: ${result.projectName}\n` +
             `・全タスク: ${result.total}件\n` +
             `・完了: ${result.completed}件\n` +
             `・進行中: ${result.inProgress}件\n` +
             `・未着手: ${result.notStarted}件\n` +
             `・遅延: ${result.overdue}件\n` +
             `・平均進捗率: ${result.avgProgress}%`;
    }

    case 'get_project_members': {
      if (!result.members || result.members.length === 0) {
        return '👥 プロジェクトメンバー情報はありません。';
      }
      const memberList = result.members.map(m =>
        `・${m.name} (担当タスク: ${m.taskCount}件, 完了: ${m.completedTasks}件, 進行中: ${m.inProgressTasks}件)`
      ).join('\n');
      return `👥 プロジェクトメンバー: ${result.projectName} (${result.totalMembers}名)\n${memberList}`;
    }

    case 'get_work_summary': {
      return `📝 作業サマリー (${result.period})\n` +
             `・全タスク: ${result.totalTasks}件\n` +
             `・完了: ${result.completedTasks}件\n` +
             `・進行中: ${result.inProgressTasks}件\n` +
             `・完了率: ${result.completionRate}%`;
    }

    default:
      return JSON.stringify(result, null, 2);
  }
}

/**
 * メンバー向けツールを実行してプレビューデータを生成
 */
function executeMemberToolForPreview(toolName, args, memberContext) {
  logger.info(`メンバーツール実行（プレビュー）: ${toolName}`, args);

  switch (toolName) {
    case 'update_my_task_progress':
      // 権限チェック: 自分のタスクのみ更新可能
      const task = memberContext.currentTasks?.find(t => t.id === args.taskId);
      if (!task) {
        return {
          changes: [{
            type: 'error',
            taskId: args.taskId,
            message: 'このタスクはあなたの担当ではないため更新できません。'
          }]
        };
      }

      const changes = {};
      if (args.progress !== undefined) {
        changes.progress = { before: task.progress || 0, after: args.progress };
      }
      if (args.status) {
        changes.status = { before: task.status, after: args.status };
      }

      return {
        changes: [{
          type: 'update',
          taskId: args.taskId,
          taskName: task.name,
          changes
        }]
      };

    case 'add_task_comment':
      return {
        changes: [{
          type: 'comment',
          taskId: args.taskId,
          taskName: args.taskId,
          content: args.content
        }]
      };

    default:
      return { changes: null };
  }
}

module.exports = {
  processWbsChatMessage,
  processMemberAssistantMessage
};
