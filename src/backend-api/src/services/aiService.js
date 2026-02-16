const fs = require('fs');
const path = require('path');
const { ProxyAgent } = require('undici');
const config = require('../config/env');
const logger = require('../utils/logger');
const db = require('./database');
const settingsService = require('./settingsService');
const notificationService = require('./notificationService');
const reportService = require('./reportService');
const dateCalculator = require('../utils/dateCalculator');
const LLMAdapterFactory = require('./llm-adapters');

const PROMPT_DIR = path.resolve(process.cwd(), '..', 'prompts');

// プロキシエージェントは動的に初期化
let proxyAgent = null;

function providerNeedsApiKey(provider) {
  return (provider || 'groq').toLowerCase() !== 'ollama';
}

async function initializeProxyAgent() {
  // 設定サービスからプロキシ設定を取得
  const proxyConfig = await settingsService.getProxyConfig();

  if (!proxyConfig.enabled || !proxyConfig.url) {
    return null;
  }

  try {
    let proxyUrl = proxyConfig.url;
    const hasCredentials = /\/\/[^@]+@/.test(proxyUrl);
    if (!hasCredentials && proxyConfig.username) {
      const [scheme, rest] = proxyUrl.split('://');
      if (!rest) {
        logger.warn('PROXY_URL の形式が不正なため、プロキシ設定をスキップします。');
        return null;
      }
      const user = encodeURIComponent(proxyConfig.username);
      const pass = encodeURIComponent(proxyConfig.password || '');
      proxyUrl = `${scheme}://${user}:${pass}@${rest}`;
    }
    logger.info(`プロキシ経由で外部 API に接続します: ${proxyConfig.url}`);
    return new ProxyAgent(proxyUrl);
  } catch (error) {
    logger.error(`プロキシ初期化中にエラーが発生しました: ${error.message}`);
    return null;
  }
}

function loadPrompt(name) {
  const filePath = path.join(PROMPT_DIR, `${name}.txt`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${name}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function fillTemplate(template, variables) {
  return Object.entries(variables).reduce((acc, [key, value]) => {
    const pattern = new RegExp(`\\{${key}\\}`, 'g');
    return acc.replace(pattern, value ?? '');
  }, template);
}

async function callAI(prompt, options = { responseFormat: 'text' }, retryCount = 0) {
  try {
    // 設定サービスからAI API設定を取得（環境変数 > データベース の優先順位）
    const aiConfig = await settingsService.getAIConfig();

    if (providerNeedsApiKey(aiConfig.provider) && !aiConfig.apiKey) {
      logger.warn('AI API key が設定されていません。スタブ応答を返します。');
      return options.responseFormat === 'json'
        ? { stub: true }
        : 'AIサービスは現在利用できません。環境変数または設定画面でAPIキーを設定してください。';
    }

    // プロキシエージェントを初期化
    if (!proxyAgent) {
      proxyAgent = await initializeProxyAgent();
    }

    // LLMアダプターを生成
    const adapter = LLMAdapterFactory.create(aiConfig.provider, {
      apiKey: aiConfig.apiKey,
      endpoint: aiConfig.endpoint,
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      maxTokens: aiConfig.maxTokens,
      proxyAgent
    });

    logger.info(`LLMアダプター使用: provider=${aiConfig.provider}, model=${aiConfig.model}`);

    // アダプター経由でAPI呼び出し
    const result = await adapter.call(prompt, options);

    // JSON形式の場合、リトライロジックを適用
    if (options.responseFormat === 'json' && typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch (parseError) {
        logger.error(`JSON解析エラー (試行 ${retryCount + 1}): ${parseError.message}`);

        if (retryCount < 1) {
          logger.info('AIによるJSON自動修復を試みます...');
          const repairPrompt = `以下のJSON文字列は構文エラーを含んでいます。エラー原因を特定し、正しいJSON形式に修正して出力してください。\nMarkdown記法は使用しないでください。JSONのみを返してください。\n\nエラーメッセージ: ${parseError.message}\n\n対象のJSON:\n${result}`;
          return callAI(repairPrompt, { responseFormat: 'json' }, retryCount + 1);
        }

        logger.error(`生成されたコンテンツの最初の500文字: ${result.substring(0, 500)}`);
        throw new Error(`JSONの解析に失敗しました: ${parseError.message}`);
      }
    }

    return result;
  } catch (error) {
    logger.error(`AI API 呼び出し中にエラーが発生しました: ${error.message}`);
    if (error.message.includes('JSON')) {
      throw error; // JSON解析エラーは再スローして上位で処理
    }
    return options.responseFormat === 'json'
      ? { stub: true, error: error.message }
      : 'AIサービス呼び出し中にエラーが発生しました。詳細はログを確認してください。';
  }
}

/**
 * JSON文字列の一般的なエラー（クォート漏れなど）を正規表現で修復を試みる
 * @param {string} jsonStr 
 * @returns {object|null} 修復・パース成功したオブジェクト、失敗時はnull
 */
function tryManualRepair(jsonStr) {
  try {
    let fixed = jsonStr;

    // ケース1: 値の開始ダブルクォート忘れ (例: "key": value", -> "key": "value",)
    // キーの後ろ(:)に続き、" { [ 数字 - true false null 以外で始まり、末尾が ", または "} で終わるパターン
    fixed = fixed.replace(/("[\w\d_]+"\s*:\s*)([^"{\[\d\-tfn][^,}]*?)("\s*[,}])/g, '$1"$2$3');

    // ケース2: 値の終了ダブルクォート忘れ (例: "key": "value, -> "key": "value",)
    // これは誤爆が多いので慎重に。改行を含まない単純な文字列の場合のみ対応
    fixed = fixed.replace(/("[\w\d_]+"\s*:\s*")([^",}\n\r]+)(\s*[,}])/g, '$1$2"$3');

    // ケース3: 末尾の余分なカンマ (例: "key": "value", } -> "key": "value" })
    fixed = fixed.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    return JSON.parse(fixed);
  } catch (e) {
    return null;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value);
}

function normalizeNameToken(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function extractProjectDates(payload = {}) {
  let startDate = payload.start_date || payload.startDate || '';
  let endDate = payload.end_date || payload.endDate || '';

  if ((!startDate || !endDate) && typeof payload.duration === 'string') {
    const matches = payload.duration.match(/\d{4}-\d{2}-\d{2}/g) || [];
    if (!startDate && matches[0]) {
      startDate = matches[0];
    }
    if (!endDate && matches[1]) {
      endDate = matches[1];
    }
  }

  return {
    startDate: isValidDateString(startDate) ? startDate : '',
    endDate: isValidDateString(endDate) ? endDate : ''
  };
}

function getTodayYmd() {
  return dateCalculator.formatDate(new Date());
}

function addDays(dateStr, days) {
  if (!isValidDateString(dateStr)) {
    return '';
  }
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateCalculator.formatDate(date);
}

function toWorkingDay(dateStr, fallback = '') {
  const base = isValidDateString(dateStr) ? dateStr : isValidDateString(fallback) ? fallback : '';
  if (!base) {
    return '';
  }

  if (dateCalculator.isWorkingDay(base)) {
    return base;
  }

  const previousDay = addDays(base, -1);
  if (!previousDay) {
    return base;
  }
  return dateCalculator.getNextWorkingDay(previousDay);
}

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function sanitizeTeamMembers(teamMembers = []) {
  if (!Array.isArray(teamMembers)) {
    return [];
  }

  const uniqueMembers = new Map();

  for (const member of teamMembers) {
    if (!member || typeof member !== 'object') {
      continue;
    }

    const fullName = String(member.fullName || member.name || member.username || '').trim();
    if (!fullName) {
      continue;
    }

    const uniqueKey = normalizeNameToken(fullName);
    if (!uniqueKey || uniqueMembers.has(uniqueKey)) {
      continue;
    }

    const role = String(member.role || member.user?.role || 'member').trim() || 'member';
    const username = String(member.username || '').trim();
    const aliasTokens = [normalizeNameToken(fullName)];
    if (username) {
      aliasTokens.push(normalizeNameToken(username));
    }

    const skillsText =
      Array.isArray(member.skills) && member.skills.length > 0
        ? member.skills
            .map((skill) => {
              if (typeof skill === 'string') {
                return skill;
              }
              if (skill && typeof skill === 'object') {
                const skillName = skill.skillName || skill.name || '';
                const level = skill.skillLevel || skill.level || '';
                if (skillName && level) {
                  return `${skillName}(レベル${level})`;
                }
                if (skillName) {
                  return skillName;
                }
              }
              return '';
            })
            .filter(Boolean)
            .join(', ')
        : 'スキル情報なし';

    uniqueMembers.set(uniqueKey, {
      id: member.id ?? null,
      fullName,
      role,
      aliasTokens: [...new Set(aliasTokens.filter(Boolean))],
      skillsText: skillsText || 'スキル情報なし'
    });
  }

  return Array.from(uniqueMembers.values());
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function uniqueNumericIds(values = []) {
  return [...new Set(
    (values || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  )];
}

function normalizeVacationRows(vacations = []) {
  if (!Array.isArray(vacations)) {
    return [];
  }

  return vacations
    .map((vacation) => {
      const userId = Number(vacation.user_id || vacation.userId);
      const startDate = String(vacation.start_date || vacation.startDate || '').trim();
      const endDate = String(vacation.end_date || vacation.endDate || '').trim();
      if (!Number.isFinite(userId) || !isValidDateString(startDate) || !isValidDateString(endDate)) {
        return null;
      }

      return {
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
        vacation_type: String(vacation.vacation_type || vacation.vacationType || '休暇').trim() || '休暇',
        user_name: String(vacation.user_name || vacation.userName || '').trim()
      };
    })
    .filter(Boolean);
}

function buildVacationContext(vacations = [], teamMembers = []) {
  const vacationsByUserId = new Map();
  const nameTokenToUserId = new Map();
  const userIdToName = new Map();

  normalizeVacationRows(vacations).forEach((vacation) => {
    const userId = Number(vacation.user_id);
    if (!vacationsByUserId.has(userId)) {
      vacationsByUserId.set(userId, []);
    }
    vacationsByUserId.get(userId).push({
      start_date: vacation.start_date,
      end_date: vacation.end_date,
      vacation_type: vacation.vacation_type
    });
    if (vacation.user_name) {
      userIdToName.set(userId, vacation.user_name);
      const token = normalizeNameToken(vacation.user_name);
      if (token) {
        nameTokenToUserId.set(token, userId);
      }
    }
  });

  (teamMembers || []).forEach((member) => {
    if (!member || typeof member !== 'object') {
      return;
    }
    const userId = Number(member.id);
    if (!Number.isFinite(userId)) {
      return;
    }

    const candidateTokens = [
      normalizeNameToken(member.fullName),
      normalizeNameToken(member.name),
      normalizeNameToken(member.username)
    ];
    if (Array.isArray(member.aliasTokens)) {
      candidateTokens.push(...member.aliasTokens.map((token) => normalizeNameToken(token)));
    }

    candidateTokens.filter(Boolean).forEach((token) => {
      nameTokenToUserId.set(token, userId);
    });

    const displayName = String(member.fullName || member.name || member.username || '').trim();
    if (displayName) {
      userIdToName.set(userId, displayName);
    }
  });

  vacationsByUserId.forEach((ranges) => {
    ranges.sort((a, b) => {
      if (a.start_date === b.start_date) {
        return a.end_date < b.end_date ? -1 : a.end_date > b.end_date ? 1 : 0;
      }
      return a.start_date < b.start_date ? -1 : 1;
    });
  });

  return {
    vacationsByUserId,
    nameTokenToUserId,
    userIdToName
  };
}

function resolveAssigneeUserIdForVacation(assignee, vacationContext) {
  if (!vacationContext) {
    return null;
  }
  if (assignee === null || assignee === undefined || assignee === '') {
    return null;
  }

  if (typeof assignee === 'number' && Number.isFinite(assignee)) {
    return assignee;
  }

  const assigneeText = String(assignee).trim();
  if (!assigneeText) {
    return null;
  }

  if (/^\d+$/.test(assigneeText)) {
    return Number(assigneeText);
  }

  const assigneeToken = normalizeNameToken(assigneeText);
  if (!assigneeToken) {
    return null;
  }

  return vacationContext.nameTokenToUserId.get(assigneeToken) || null;
}

function isAssigneeOnVacation(dateStr, assignee, vacationContext) {
  if (!vacationContext || !isValidDateString(dateStr)) {
    return false;
  }

  const userId = resolveAssigneeUserIdForVacation(assignee, vacationContext);
  if (!Number.isFinite(userId)) {
    return false;
  }

  const vacationRanges = vacationContext.vacationsByUserId.get(Number(userId)) || [];
  return vacationRanges.some((range) => range.start_date <= dateStr && dateStr <= range.end_date);
}

function createCalendarOptions(vacationContext = null) {
  return {
    holidayList: dateCalculator.getHolidays(),
    vacationContext: vacationContext || buildVacationContext([], [])
  };
}

function isWorkingDayForAssignee(dateStr, assignee, calendarOptions = null) {
  if (!isValidDateString(dateStr)) {
    return false;
  }

  const options = calendarOptions || createCalendarOptions();
  const holidayList = Array.isArray(options.holidayList) ? options.holidayList : dateCalculator.getHolidays();

  if (!dateCalculator.isWorkingDay(dateStr, holidayList)) {
    return false;
  }

  return !isAssigneeOnVacation(dateStr, assignee, options.vacationContext);
}

function getWorkingDayOnOrAfter(dateStr, assignee, calendarOptions = null) {
  if (!isValidDateString(dateStr)) {
    return '';
  }

  const options = calendarOptions || createCalendarOptions();
  let currentDate = dateStr;
  for (let i = 0; i < 3660; i += 1) {
    if (isWorkingDayForAssignee(currentDate, assignee, options)) {
      return currentDate;
    }
    currentDate = addDays(currentDate, 1);
    if (!currentDate) {
      break;
    }
  }

  return '';
}

function toWorkingDayForAssignee(dateStr, fallback = '', assignee = null, calendarOptions = null) {
  const base =
    isValidDateString(dateStr) ? dateStr : isValidDateString(fallback) ? fallback : '';
  if (!base) {
    return '';
  }
  return getWorkingDayOnOrAfter(base, assignee, calendarOptions) || base;
}

function calculateEndDateForAssignee(startDate, effortDays, assignee = null, calendarOptions = null) {
  const effort = Number(effortDays);
  if (!Number.isFinite(effort) || effort <= 0) {
    throw new Error('工数は1以上である必要があります');
  }

  const options = calendarOptions || createCalendarOptions();
  const start = toWorkingDayForAssignee(startDate, startDate, assignee, options);
  if (!start) {
    throw new Error('開始日が不正です');
  }

  let remainingDays = Math.max(1, Math.round(effort)) - 1;
  let currentDate = start;
  while (remainingDays > 0) {
    currentDate = addDays(currentDate, 1);
    if (!currentDate) {
      throw new Error('終了日の計算中に日付の加算に失敗しました');
    }
    if (isWorkingDayForAssignee(currentDate, assignee, options)) {
      remainingDays -= 1;
    }
  }

  return currentDate;
}

async function fetchVacationsForSchedule(
  memberIds = [],
  startDate = '',
  endDate = '',
  includeAllWhenNoMember = false
) {
  try {
    const normalizedMemberIds = uniqueNumericIds(memberIds);
    if (normalizedMemberIds.length === 0 && !includeAllWhenNoMember) {
      return [];
    }

    const knex = db.getKnex();
    let query = knex('vacations as v')
      .leftJoin('users as u', 'v.user_id', 'u.id')
      .select(
        'v.user_id',
        'v.start_date',
        'v.end_date',
        'v.vacation_type',
        'u.full_name as user_name'
      )
      .orderBy('v.start_date', 'asc');

    if (normalizedMemberIds.length > 0) {
      query = query.whereIn('v.user_id', normalizedMemberIds);
    }

    if (isValidDateString(startDate)) {
      query = query.where('v.end_date', '>=', startDate);
    }
    if (isValidDateString(endDate)) {
      query = query.where('v.start_date', '<=', endDate);
    }

    const rows = await query;
    return normalizeVacationRows(rows);
  } catch (error) {
    logger.warn(`休暇データの取得に失敗しました: ${error.message}`);
    return [];
  }
}

function formatVacationsForPrompt(vacations = [], teamMembers = []) {
  const normalizedVacations = normalizeVacationRows(vacations);
  if (normalizedVacations.length === 0) {
    return '休暇データなし';
  }

  const memberNameById = new Map();
  (teamMembers || []).forEach((member) => {
    const userId = Number(member?.id);
    if (!Number.isFinite(userId)) {
      return;
    }
    const fullName = String(member.fullName || member.name || member.username || '').trim();
    if (fullName) {
      memberNameById.set(userId, fullName);
    }
  });

  return normalizedVacations
    .map((vacation) => {
      const userId = Number(vacation.user_id);
      const displayName = vacation.user_name || memberNameById.get(userId) || `ユーザー${userId}`;
      return `- ${displayName}: ${vacation.start_date}〜${vacation.end_date} (${vacation.vacation_type})`;
    })
    .join('\n');
}

function normalizeTaskTree(tasks) {
  if (!Array.isArray(tasks)) {
    return;
  }

  tasks.forEach((task, index) => {
    if (!task || typeof task !== 'object') {
      return;
    }

    if (!task.id) {
      task.id = String(index + 1);
    }
    task.id = String(task.id);
    task.name = String(task.name || `タスク${task.id}`);
    task.description = String(task.description || '');
    task.assignee = task.assignee ? String(task.assignee).trim() : '';
    task.assignee_role = task.assignee_role ? String(task.assignee_role).trim() : '';
    task.deliverable = task.deliverable ? String(task.deliverable).trim() : '';

    const effort = Number(task.effort_days);
    task.effort_days = Number.isFinite(effort) && effort > 0 ? Math.max(1, Math.round(effort)) : 1;

    task.dependencies = Array.isArray(task.dependencies)
      ? [...new Set(task.dependencies.map((dep) => String(dep).trim()).filter(Boolean))]
      : [];

    if (task.start_date && !isValidDateString(task.start_date)) {
      task.start_date = '';
    }
    if (task.end_date && !isValidDateString(task.end_date)) {
      task.end_date = '';
    }

    if (!Array.isArray(task.children)) {
      task.children = [];
    }

    normalizeTaskTree(task.children);
  });
}

function collectAllTasks(tasks) {
  const allTasks = [];
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) {
      return;
    }
    nodes.forEach((node) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      allTasks.push(node);
      walk(node.children);
    });
  };
  walk(tasks);
  return allTasks;
}

function collectLeafTasks(tasks) {
  return collectAllTasks(tasks).filter((task) => !Array.isArray(task.children) || task.children.length === 0);
}

function buildTaskIndex(tasks) {
  const index = new Map();
  collectAllTasks(tasks).forEach((task) => {
    if (task.id) {
      index.set(String(task.id), task);
    }
  });
  return index;
}

function buildTaskIdSet(tasks) {
  return new Set(
    collectAllTasks(tasks)
      .map((task) => (task.id ? String(task.id) : ''))
      .filter(Boolean)
  );
}

function createMemberAliasLookup(teamMembers) {
  const aliasLookup = new Map();
  teamMembers.forEach((member) => {
    member.aliasTokens.forEach((token) => aliasLookup.set(token, member));
    aliasLookup.set(normalizeNameToken(member.fullName), member);
  });
  return aliasLookup;
}

function matchMemberByAssignee(assignee, aliasLookup) {
  const token = normalizeNameToken(assignee);
  if (!token) {
    return null;
  }
  return aliasLookup.get(token) || null;
}

function getUniqueChildId(parentId, usedIds) {
  const safeParentId = String(parentId || 'task');
  let counter = 1;
  let candidate = `${safeParentId}.${counter}`;
  while (usedIds.has(candidate)) {
    counter += 1;
    candidate = `${safeParentId}.${counter}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function summarizeCoverage(tasks, teamMembers, aliasLookup) {
  if (!Array.isArray(teamMembers) || teamMembers.length === 0) {
    return {
      totalMembers: 0,
      coveredMembers: 0,
      coverageRate: 1,
      uncoveredMembers: []
    };
  }

  const covered = new Set();
  collectAllTasks(tasks).forEach((task) => {
    const matchedMember = matchMemberByAssignee(task.assignee, aliasLookup);
    if (matchedMember) {
      covered.add(matchedMember.fullName);
    }
  });

  const uncoveredMembers = teamMembers
    .filter((member) => !covered.has(member.fullName))
    .map((member) => member.fullName);

  return {
    totalMembers: teamMembers.length,
    coveredMembers: covered.size,
    coverageRate: teamMembers.length > 0 ? covered.size / teamMembers.length : 1,
    uncoveredMembers
  };
}

function ensureMemberCoverage(tasks, teamMembers, projectStartDate) {
  if (!Array.isArray(teamMembers) || teamMembers.length === 0) {
    return {
      reassignedTasks: 0,
      addedTasks: 0,
      coverage: {
        totalMembers: 0,
        coveredMembers: 0,
        coverageRate: 1,
        uncoveredMembers: []
      }
    };
  }

  const aliasLookup = createMemberAliasLookup(teamMembers);
  const allTasks = collectAllTasks(tasks);
  const leafTasks = collectLeafTasks(tasks);
  const assignableTasks = leafTasks.length > 0 ? leafTasks : allTasks;
  const assignableTaskSet = new Set(assignableTasks);

  // AIが返した担当者名を、プロジェクトメンバーの正式名に寄せる
  allTasks.forEach((task) => {
    const matchedMember = matchMemberByAssignee(task.assignee, aliasLookup);
    if (matchedMember) {
      task.assignee = matchedMember.fullName;
      if (!task.assignee_role) {
        task.assignee_role = matchedMember.role;
      }
    }
  });

  const assignmentMap = new Map(teamMembers.map((member) => [member.fullName, []]));
  allTasks.forEach((task) => {
    const matchedMember = matchMemberByAssignee(task.assignee, aliasLookup);
    if (!matchedMember) {
      return;
    }
    assignmentMap.get(matchedMember.fullName).push(task);
  });

  let reassignedTasks = 0;
  let addedTasks = 0;

  const getUncoveredMembers = () =>
    teamMembers.filter((member) => (assignmentMap.get(member.fullName) || []).length === 0);

  // 1. 未割当タスクがあれば優先して割り当て
  const unassignedTasks = assignableTasks.filter((task) => !normalizeNameToken(task.assignee));
  const uncoveredByUnassigned = getUncoveredMembers();
  while (uncoveredByUnassigned.length > 0 && unassignedTasks.length > 0) {
    const member = uncoveredByUnassigned.shift();
    const task = unassignedTasks.shift();
    task.assignee = member.fullName;
    task.assignee_role = member.role || task.assignee_role || 'member';
    assignmentMap.get(member.fullName).push(task);
    reassignedTasks += 1;
  }

  // 2. 担当が偏っている場合は再割り当て
  let uncoveredMembers = getUncoveredMembers();
  while (uncoveredMembers.length > 0) {
    const targetMember = uncoveredMembers.shift();
    const donorCandidates = teamMembers
      .map((member) => ({
        member,
        count: (assignmentMap.get(member.fullName) || []).length
      }))
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count);

    if (donorCandidates.length === 0) {
      break;
    }

    const donor = donorCandidates[0].member;
    const donorTasks = assignmentMap.get(donor.fullName) || [];
    const donorTask =
      donorTasks.find((task) => assignableTaskSet.has(task)) ||
      donorTasks.find((task) => !Array.isArray(task.children) || task.children.length === 0) ||
      donorTasks[0];

    if (!donorTask) {
      continue;
    }

    assignmentMap.set(
      donor.fullName,
      donorTasks.filter((task) => task !== donorTask)
    );
    donorTask.assignee = targetMember.fullName;
    donorTask.assignee_role = targetMember.role || donorTask.assignee_role || 'member';
    assignmentMap.get(targetMember.fullName).push(donorTask);
    reassignedTasks += 1;
  }

  // 3. それでも不足するメンバーには、並行可能な補助タスクを自動追加
  uncoveredMembers = getUncoveredMembers();
  if (uncoveredMembers.length > 0 && assignableTasks.length > 0) {
    const usedIds = buildTaskIdSet(tasks);
    const sortedBaseTasks = [...assignableTasks].sort(
      (a, b) => (Number(b.effort_days) || 1) - (Number(a.effort_days) || 1)
    );
    let cursor = 0;

    uncoveredMembers.forEach((member) => {
      const baseTask = sortedBaseTasks[cursor % sortedBaseTasks.length];
      cursor += 1;
      if (!baseTask) {
        return;
      }

      if (!Array.isArray(baseTask.children)) {
        baseTask.children = [];
      }

      const splitEffort = Math.max(1, Math.min(2, Math.round((Number(baseTask.effort_days) || 1) / 2)));
      const splitStart = toWorkingDay(baseTask.start_date, projectStartDate) || projectStartDate;
      const splitEnd = dateCalculator.calculateEndDate(splitStart, splitEffort);
      const splitTask = {
        id: getUniqueChildId(baseTask.id, usedIds),
        name: `${baseTask.name} 並行サポート`,
        description: '進行を並行化するための補助タスク',
        assignee_role: member.role || 'member',
        assignee: member.fullName,
        effort_days: splitEffort,
        start_date: splitStart,
        end_date: splitEnd,
        deliverable: `${baseTask.name} サポート成果物`,
        dependencies: Array.isArray(baseTask.dependencies) ? [...baseTask.dependencies] : [],
        children: []
      };

      baseTask.children.push(splitTask);
      assignmentMap.get(member.fullName).push(splitTask);
      addedTasks += 1;
    });
  }

  return {
    reassignedTasks,
    addedTasks,
    coverage: summarizeCoverage(tasks, teamMembers, aliasLookup)
  };
}

function updateParentTaskDates(task, fallbackStartDate, calendarOptions = null) {
  if (!task || typeof task !== 'object') {
    return { start: '', end: '' };
  }

  if (!Array.isArray(task.children) || task.children.length === 0) {
    const startDate =
      toWorkingDayForAssignee(
        task.start_date,
        fallbackStartDate,
        task.assignee || null,
        calendarOptions
      ) || fallbackStartDate;
    const effort = Number(task.effort_days) > 0 ? Math.max(1, Math.round(Number(task.effort_days))) : 1;
    const endDate = isValidDateString(task.end_date)
      ? toWorkingDayForAssignee(task.end_date, startDate, task.assignee || null, calendarOptions) ||
        calculateEndDateForAssignee(startDate, effort, task.assignee || null, calendarOptions)
      : calculateEndDateForAssignee(startDate, effort, task.assignee || null, calendarOptions);

    task.start_date = startDate;
    task.end_date = endDate;
    task.effort_days = effort;
    return { start: startDate, end: endDate };
  }

  let minStartDate = '';
  let maxEndDate = '';

  task.children.forEach((child) => {
    const childRange = updateParentTaskDates(child, fallbackStartDate, calendarOptions);
    if (childRange.start) {
      minStartDate = minDate(minStartDate, childRange.start);
    }
    if (childRange.end) {
      maxEndDate = maxDate(maxEndDate, childRange.end);
    }
  });

  if (minStartDate) {
    task.start_date = minStartDate;
  }
  if (maxEndDate) {
    task.end_date = maxEndDate;
  }

  if (task.start_date && task.end_date) {
    try {
      task.effort_days = Math.max(1, dateCalculator.calculateEffortDays(task.start_date, task.end_date));
    } catch (error) {
      task.effort_days = Number(task.effort_days) > 0 ? Math.round(Number(task.effort_days)) : 1;
    }
  }

  return {
    start: task.start_date || '',
    end: task.end_date || ''
  };
}

function rebalanceLeafSchedule(tasks, projectStartDate, projectEndDate = '', calendarOptions = null) {
  const leafTasks = collectLeafTasks(tasks);
  if (leafTasks.length === 0 || !projectStartDate) {
    return { scheduledLeafTasks: 0, overflowTasks: 0, calendarAdjustedTasks: 0 };
  }

  const taskIndex = buildTaskIndex(tasks);
  const assigneeAvailability = new Map();
  const calendar = calendarOptions || createCalendarOptions();
  let calendarAdjustedTasks = 0;

  const scheduleTask = (task) => {
    const dependencies = Array.isArray(task.dependencies)
      ? task.dependencies.map((dep) => String(dep).trim()).filter(Boolean)
      : [];

    let earliestStart = projectStartDate;

    dependencies.forEach((depId) => {
      const dependencyTask = taskIndex.get(depId);
      if (!dependencyTask || !isValidDateString(dependencyTask.end_date)) {
        return;
      }
      const depNextStart =
        toWorkingDayForAssignee(
          addDays(dependencyTask.end_date, 1),
          projectStartDate,
          task.assignee,
          calendar
        ) || projectStartDate;
      earliestStart = maxDate(earliestStart, depNextStart);
    });

    if (task.assignee && assigneeAvailability.has(task.assignee)) {
      earliestStart = maxDate(earliestStart, assigneeAvailability.get(task.assignee));
    }

    const effort = Number(task.effort_days) > 0 ? Math.max(1, Math.round(Number(task.effort_days))) : 1;
    const fallbackStart =
      toWorkingDayForAssignee(projectStartDate, projectStartDate, task.assignee, calendar) || projectStartDate;
    const startDate =
      toWorkingDayForAssignee(earliestStart, fallbackStart, task.assignee, calendar) || fallbackStart;
    const endDate = calculateEndDateForAssignee(startDate, effort, task.assignee, calendar);
    const originalStart = task.start_date || '';
    const originalEnd = task.end_date || '';

    task.start_date = startDate;
    task.end_date = endDate;
    task.effort_days = effort;
    if (originalStart !== startDate || originalEnd !== endDate) {
      calendarAdjustedTasks += 1;
    }

    if (task.assignee) {
      const nextAvailable = toWorkingDayForAssignee(
        addDays(endDate, 1),
        addDays(endDate, 1),
        task.assignee,
        calendar
      );
      assigneeAvailability.set(task.assignee, nextAvailable || endDate);
    }
  };

  // 依存関係を考慮したトポロジカル順に近い順序でスケジュール
  const pendingTaskIds = new Set(leafTasks.map((task) => String(task.id)));
  let loopGuard = 0;
  while (pendingTaskIds.size > 0 && loopGuard < leafTasks.length * 3) {
    loopGuard += 1;
    let progressed = false;

    leafTasks.forEach((task) => {
      const taskId = String(task.id);
      if (!pendingTaskIds.has(taskId)) {
        return;
      }

      const dependencies = Array.isArray(task.dependencies)
        ? task.dependencies.map((dep) => String(dep).trim()).filter(Boolean)
        : [];
      const hasPendingDependency = dependencies.some((depId) => pendingTaskIds.has(depId));
      if (hasPendingDependency) {
        return;
      }

      scheduleTask(task);
      pendingTaskIds.delete(taskId);
      progressed = true;
    });

    if (!progressed) {
      // 依存関係循環がある場合は残タスクを順次処理
      leafTasks.forEach((task) => {
        const taskId = String(task.id);
        if (!pendingTaskIds.has(taskId)) {
          return;
        }
        scheduleTask(task);
        pendingTaskIds.delete(taskId);
      });
    }
  }

  tasks.forEach((task) => updateParentTaskDates(task, projectStartDate, calendar));

  let overflowTasks = 0;
  if (isValidDateString(projectEndDate)) {
    overflowTasks = leafTasks.filter((task) => task.end_date && task.end_date > projectEndDate).length;
  }

  return {
    scheduledLeafTasks: leafTasks.length,
    overflowTasks,
    calendarAdjustedTasks
  };
}

function resolveMemberFromBuilderAssignee(assignee, teamMembers, aliasLookup, idLookup) {
  if (assignee === null || assignee === undefined || assignee === '') {
    return null;
  }

  if (typeof assignee === 'number' && Number.isFinite(assignee)) {
    return idLookup.get(String(assignee)) || null;
  }

  const assigneeText = String(assignee).trim();
  if (!assigneeText) {
    return null;
  }

  if (/^\d+$/.test(assigneeText)) {
    return idLookup.get(assigneeText) || null;
  }

  return matchMemberByAssignee(assigneeText, aliasLookup) || null;
}

function normalizeBuilderTaskTree(tasks, teamMembers, projectStartDate, depth = 0) {
  if (!Array.isArray(tasks)) {
    return;
  }

  const aliasLookup = createMemberAliasLookup(teamMembers);
  const idLookup = new Map(
    teamMembers
      .filter((member) => member.id !== null && member.id !== undefined && Number.isFinite(Number(member.id)))
      .map((member) => [String(member.id), member])
  );
  const startFallback = projectStartDate || getTodayYmd();

  tasks.forEach((task, index) => {
    if (!task || typeof task !== 'object') {
      return;
    }

    if (!task.id) {
      task.id = String(index + 1);
    }
    task.id = String(task.id);
    task.name = String(task.name || `タスク${task.id}`);
    task.description = String(task.description || '');
    const inferredLevel = depth === 0 ? 'major' : depth === 1 ? 'medium' : 'minor';
    task.level = task.level || inferredLevel;
    task.priority = task.priority || 'medium';
    task.status = task.status || 'not-started';
    task.deliverable = String(task.deliverable || '');

    const effort = Number(task.effortDays);
    task.effortDays = Number.isFinite(effort) && effort > 0 ? Math.max(1, Math.round(effort)) : 1;

    if (!Array.isArray(task.dependencies)) {
      task.dependencies = [];
    }
    task.dependencies = [...new Set(task.dependencies.map((dep) => String(dep).trim()).filter(Boolean))];

    task.startDate = isValidDateString(task.startDate) ? task.startDate : '';
    task.endDate = isValidDateString(task.endDate) ? task.endDate : '';

    const rawAssignee = task.assignee !== undefined ? task.assignee : task.assignedTo;
    const resolvedMember = resolveMemberFromBuilderAssignee(
      rawAssignee,
      teamMembers,
      aliasLookup,
      idLookup
    );
    task.assignee = resolvedMember ? Number(resolvedMember.id) : null;
    task.assignedTo = task.assignee;
    if (!task.assignee_role && resolvedMember) {
      task.assignee_role = resolvedMember.role;
    }

    if (!Array.isArray(task.children)) {
      task.children = [];
    }
    normalizeBuilderTaskTree(task.children, teamMembers, startFallback, depth + 1);
  });
}

function summarizeBuilderCoverage(tasks, teamMembers) {
  if (!Array.isArray(teamMembers) || teamMembers.length === 0) {
    return {
      totalMembers: 0,
      coveredMembers: 0,
      coverageRate: 1,
      uncoveredMembers: []
    };
  }

  const memberIdSet = new Set(teamMembers.map((member) => Number(member.id)));
  const coveredIds = new Set();

  collectAllTasks(tasks).forEach((task) => {
    const assigneeId = Number(task.assignee);
    if (Number.isFinite(assigneeId) && memberIdSet.has(assigneeId)) {
      coveredIds.add(assigneeId);
    }
  });

  const uncoveredMembers = teamMembers
    .filter((member) => !coveredIds.has(Number(member.id)))
    .map((member) => member.fullName);

  return {
    totalMembers: teamMembers.length,
    coveredMembers: coveredIds.size,
    coverageRate: teamMembers.length > 0 ? coveredIds.size / teamMembers.length : 1,
    uncoveredMembers
  };
}

function ensureBuilderMemberCoverage(tasks, teamMembers, projectStartDate) {
  const validMembers = (teamMembers || []).filter(
    (member) => member.id !== null && member.id !== undefined && Number.isFinite(Number(member.id))
  );

  if (validMembers.length === 0) {
    return {
      reassignedTasks: 0,
      addedTasks: 0,
      coverage: {
        totalMembers: 0,
        coveredMembers: 0,
        coverageRate: 1,
        uncoveredMembers: []
      }
    };
  }

  const allTasks = collectAllTasks(tasks);
  const leafTasks = collectLeafTasks(tasks);
  const assignableTasks = leafTasks.length > 0 ? leafTasks : allTasks;
  const assignableTaskSet = new Set(assignableTasks);

  const assignmentMap = new Map(validMembers.map((member) => [Number(member.id), []]));
  allTasks.forEach((task) => {
    const assigneeId = Number(task.assignee);
    if (!Number.isFinite(assigneeId) || !assignmentMap.has(assigneeId)) {
      task.assignee = null;
      task.assignedTo = null;
      return;
    }
    task.assignee = assigneeId;
    task.assignedTo = assigneeId;
    assignmentMap.get(assigneeId).push(task);
  });

  let reassignedTasks = 0;
  let addedTasks = 0;

  const getUncoveredMembers = () =>
    validMembers.filter((member) => (assignmentMap.get(Number(member.id)) || []).length === 0);

  const unassignedTasks = assignableTasks.filter((task) => !Number.isFinite(Number(task.assignee)));
  const uncoveredByUnassigned = getUncoveredMembers();
  while (uncoveredByUnassigned.length > 0 && unassignedTasks.length > 0) {
    const member = uncoveredByUnassigned.shift();
    const task = unassignedTasks.shift();
    const memberId = Number(member.id);
    task.assignee = memberId;
    task.assignedTo = memberId;
    if (!task.assignee_role) {
      task.assignee_role = member.role || 'member';
    }
    assignmentMap.get(memberId).push(task);
    reassignedTasks += 1;
  }

  let uncoveredMembers = getUncoveredMembers();
  while (uncoveredMembers.length > 0) {
    const targetMember = uncoveredMembers.shift();
    const targetId = Number(targetMember.id);

    const donorCandidates = validMembers
      .map((member) => ({
        member,
        count: (assignmentMap.get(Number(member.id)) || []).length
      }))
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count);

    if (donorCandidates.length === 0) {
      break;
    }

    const donor = donorCandidates[0].member;
    const donorId = Number(donor.id);
    const donorTasks = assignmentMap.get(donorId) || [];
    const donorTask =
      donorTasks.find((task) => assignableTaskSet.has(task)) ||
      donorTasks.find((task) => !Array.isArray(task.children) || task.children.length === 0) ||
      donorTasks[0];

    if (!donorTask) {
      continue;
    }

    assignmentMap.set(
      donorId,
      donorTasks.filter((task) => task !== donorTask)
    );
    donorTask.assignee = targetId;
    donorTask.assignedTo = targetId;
    if (!donorTask.assignee_role) {
      donorTask.assignee_role = targetMember.role || 'member';
    }
    assignmentMap.get(targetId).push(donorTask);
    reassignedTasks += 1;
  }

  uncoveredMembers = getUncoveredMembers();
  if (uncoveredMembers.length > 0 && assignableTasks.length > 0) {
    const usedIds = buildTaskIdSet(tasks);
    const sortedBaseTasks = [...assignableTasks].sort(
      (a, b) => (Number(b.effortDays) || 1) - (Number(a.effortDays) || 1)
    );
    let cursor = 0;

    uncoveredMembers.forEach((member) => {
      const baseTask = sortedBaseTasks[cursor % sortedBaseTasks.length];
      cursor += 1;
      if (!baseTask) {
        return;
      }

      if (!Array.isArray(baseTask.children)) {
        baseTask.children = [];
      }

      const splitEffort = Math.max(1, Math.min(2, Math.round((Number(baseTask.effortDays) || 1) / 2)));
      const splitStart = toWorkingDay(baseTask.startDate, projectStartDate) || projectStartDate;
      const splitEnd = dateCalculator.calculateEndDate(splitStart, splitEffort);
      const memberId = Number(member.id);
      const splitTask = {
        id: getUniqueChildId(baseTask.id, usedIds),
        name: `${baseTask.name} 並行サポート`,
        description: '進行を並行化するための補助タスク',
        effortDays: splitEffort,
        assignee: memberId,
        assignedTo: memberId,
        assignee_role: member.role || 'member',
        startDate: splitStart,
        endDate: splitEnd,
        priority: 'medium',
        status: 'not-started',
        deliverable: `${baseTask.name} サポート成果物`,
        dependencies: Array.isArray(baseTask.dependencies) ? [...baseTask.dependencies] : [],
        level: baseTask.level === 'major' ? 'medium' : 'minor',
        children: []
      };

      baseTask.children.push(splitTask);
      assignmentMap.get(memberId).push(splitTask);
      addedTasks += 1;
    });
  }

  return {
    reassignedTasks,
    addedTasks,
    coverage: summarizeBuilderCoverage(tasks, validMembers)
  };
}

function updateBuilderParentTaskDates(task, fallbackStartDate, calendarOptions = null) {
  if (!task || typeof task !== 'object') {
    return { start: '', end: '' };
  }

  if (!Array.isArray(task.children) || task.children.length === 0) {
    const startDate =
      toWorkingDayForAssignee(
        task.startDate,
        fallbackStartDate,
        task.assignee ?? null,
        calendarOptions
      ) || fallbackStartDate;
    const effort = Number(task.effortDays) > 0 ? Math.max(1, Math.round(Number(task.effortDays))) : 1;
    const endDate = isValidDateString(task.endDate)
      ? toWorkingDayForAssignee(task.endDate, startDate, task.assignee ?? null, calendarOptions) ||
        calculateEndDateForAssignee(startDate, effort, task.assignee ?? null, calendarOptions)
      : calculateEndDateForAssignee(startDate, effort, task.assignee ?? null, calendarOptions);

    task.startDate = startDate;
    task.endDate = endDate;
    task.effortDays = effort;
    return { start: startDate, end: endDate };
  }

  let minStartDate = '';
  let maxEndDate = '';

  task.children.forEach((child) => {
    const childRange = updateBuilderParentTaskDates(child, fallbackStartDate, calendarOptions);
    if (childRange.start) {
      minStartDate = minDate(minStartDate, childRange.start);
    }
    if (childRange.end) {
      maxEndDate = maxDate(maxEndDate, childRange.end);
    }
  });

  if (minStartDate) {
    task.startDate = minStartDate;
  }
  if (maxEndDate) {
    task.endDate = maxEndDate;
  }
  if (task.startDate && task.endDate) {
    try {
      task.effortDays = Math.max(1, dateCalculator.calculateEffortDays(task.startDate, task.endDate));
    } catch (error) {
      task.effortDays = Number(task.effortDays) > 0 ? Math.round(Number(task.effortDays)) : 1;
    }
  }

  return {
    start: task.startDate || '',
    end: task.endDate || ''
  };
}

function rebalanceBuilderLeafSchedule(tasks, projectStartDate, projectEndDate = '', calendarOptions = null) {
  const leafTasks = collectLeafTasks(tasks);
  if (leafTasks.length === 0 || !projectStartDate) {
    return { scheduledLeafTasks: 0, overflowTasks: 0, calendarAdjustedTasks: 0 };
  }

  const taskIndex = buildTaskIndex(tasks);
  const assigneeAvailability = new Map();
  const calendar = calendarOptions || createCalendarOptions();
  let calendarAdjustedTasks = 0;

  const scheduleTask = (task) => {
    const dependencies = Array.isArray(task.dependencies)
      ? task.dependencies.map((dep) => String(dep).trim()).filter(Boolean)
      : [];

    let earliestStart = projectStartDate;

    dependencies.forEach((depId) => {
      const dependencyTask = taskIndex.get(depId);
      if (!dependencyTask || !isValidDateString(dependencyTask.endDate)) {
        return;
      }
      const depNextStart =
        toWorkingDayForAssignee(
          addDays(dependencyTask.endDate, 1),
          projectStartDate,
          task.assignee,
          calendar
        ) || projectStartDate;
      earliestStart = maxDate(earliestStart, depNextStart);
    });

    const assigneeKey = Number(task.assignee);
    if (Number.isFinite(assigneeKey) && assigneeAvailability.has(String(assigneeKey))) {
      earliestStart = maxDate(earliestStart, assigneeAvailability.get(String(assigneeKey)));
    }

    const effort = Number(task.effortDays) > 0 ? Math.max(1, Math.round(Number(task.effortDays))) : 1;
    const fallbackStart =
      toWorkingDayForAssignee(projectStartDate, projectStartDate, task.assignee, calendar) || projectStartDate;
    const startDate =
      toWorkingDayForAssignee(earliestStart, fallbackStart, task.assignee, calendar) || fallbackStart;
    const endDate = calculateEndDateForAssignee(startDate, effort, task.assignee, calendar);
    const originalStart = task.startDate || '';
    const originalEnd = task.endDate || '';

    task.startDate = startDate;
    task.endDate = endDate;
    task.effortDays = effort;
    if (originalStart !== startDate || originalEnd !== endDate) {
      calendarAdjustedTasks += 1;
    }

    if (Number.isFinite(assigneeKey)) {
      const nextAvailable = toWorkingDayForAssignee(
        addDays(endDate, 1),
        addDays(endDate, 1),
        assigneeKey,
        calendar
      );
      assigneeAvailability.set(String(assigneeKey), nextAvailable || endDate);
    }
  };

  const pendingTaskIds = new Set(leafTasks.map((task) => String(task.id)));
  let loopGuard = 0;
  while (pendingTaskIds.size > 0 && loopGuard < leafTasks.length * 3) {
    loopGuard += 1;
    let progressed = false;

    leafTasks.forEach((task) => {
      const taskId = String(task.id);
      if (!pendingTaskIds.has(taskId)) {
        return;
      }

      const dependencies = Array.isArray(task.dependencies)
        ? task.dependencies.map((dep) => String(dep).trim()).filter(Boolean)
        : [];
      const hasPendingDependency = dependencies.some((depId) => pendingTaskIds.has(depId));
      if (hasPendingDependency) {
        return;
      }

      scheduleTask(task);
      pendingTaskIds.delete(taskId);
      progressed = true;
    });

    if (!progressed) {
      leafTasks.forEach((task) => {
        const taskId = String(task.id);
        if (!pendingTaskIds.has(taskId)) {
          return;
        }
        scheduleTask(task);
        pendingTaskIds.delete(taskId);
      });
    }
  }

  tasks.forEach((task) => updateBuilderParentTaskDates(task, projectStartDate, calendar));

  let overflowTasks = 0;
  if (isValidDateString(projectEndDate)) {
    overflowTasks = leafTasks.filter((task) => task.endDate && task.endDate > projectEndDate).length;
  }

  return {
    scheduledLeafTasks: leafTasks.length,
    overflowTasks,
    calendarAdjustedTasks
  };
}

async function generateWbs(payload) {
  try {
    const teamMembers = sanitizeTeamMembers(payload.team_members);
    const teamMembersText =
      teamMembers.length > 0
        ? teamMembers
            .map((member) => `- ${member.fullName} (${member.role}): ${member.skillsText}`)
            .join('\n')
        : '（メンバー情報なし）';

    const extractedDates = extractProjectDates(payload);
    const projectStartDate = toWorkingDay(extractedDates.startDate, getTodayYmd()) || getTodayYmd();
    const projectEndDate = extractedDates.endDate || '';
    const vacationRangeEnd =
      isValidDateString(projectEndDate) ? projectEndDate : addDays(projectStartDate, 365) || projectStartDate;

    // 祝日データを取得
    const holidaysText = dateCalculator.getHolidaysText();
    const vacationMemberIds = uniqueNumericIds(teamMembers.map((member) => member.id));
    const vacations = await fetchVacationsForSchedule(vacationMemberIds, projectStartDate, vacationRangeEnd);
    const vacationContext = buildVacationContext(vacations, teamMembers);
    const calendarOptions = createCalendarOptions(vacationContext);
    const vacationsText = formatVacationsForPrompt(vacations, teamMembers);

    // ペイロードのteam_membersを整形済みテキストに置換（テンプレート充填用）
    const formattedPayload = {
      ...payload,
      team_members: teamMembersText,
      team_member_count: String(teamMembers.length),
      start_date: projectStartDate,
      end_date: projectEndDate,
      duration:
        payload.duration ||
        (projectEndDate ? `${projectStartDate} ~ ${projectEndDate}` : projectStartDate),
      holidays: holidaysText,
      vacations: vacationsText
    };

    logger.info('WBS生成プロセス開始: マルチステップ生成');

    // --- Step 1: フェーズ構成（Outline）の生成 ---
    const outlineTemplate = loadPrompt('wbs-phase-outline');
    const outlinePrompt = fillTemplate(outlineTemplate, formattedPayload);
    logger.info('Step 1: フェーズ構成生成リクエスト');

    const outlineResult = await callAI(outlinePrompt, { responseFormat: 'json' });

    if (!outlineResult || !outlineResult.phases || !Array.isArray(outlineResult.phases)) {
      throw new Error('AIが有効なフェーズ構成を生成できませんでした。');
    }

    const phases = outlineResult.phases;
    logger.info(`Step 1 完了: ${phases.length}個のフェーズが定義されました`);

    // --- Step 2 & 3: 詳細タスクの生成（分割実行） ---
    // フェーズを分割してリクエスト（1回あたり最大1フェーズ）
    const CHUNK_SIZE = 1;
    const detailedPhases = [];

    for (let i = 0; i < phases.length; i += CHUNK_SIZE) {
      const chunk = phases.slice(i, i + CHUNK_SIZE);
      logger.info(`Step 2: 詳細生成リクエスト (${i + 1}〜${Math.min(i + CHUNK_SIZE, phases.length)} / ${phases.length}フェーズ)`);

      // 詳細生成用のプロンプト準備
      const detailTemplate = loadPrompt('wbs-phase-detail');
      const detailPrompt = fillTemplate(detailTemplate, {
        ...formattedPayload,
        target_phases_json: JSON.stringify(chunk, null, 2)
      });

      try {
        const detailResult = await callAI(detailPrompt, { responseFormat: 'json' });
        if (detailResult && detailResult.detailed_phases && Array.isArray(detailResult.detailed_phases)) {
          detailedPhases.push(...detailResult.detailed_phases);
        } else {
          logger.warn(`詳細生成の一部が失敗または不正な形式でした。概要フェーズをそのまま使用します。`);
          detailedPhases.push(...chunk); // 詳細化に失敗した場合は概要をそのまま使う
        }
      } catch (err) {
        logger.error(`詳細生成バッチエラー: ${err.message}`);
        detailedPhases.push(...chunk); // エラー時は概要をそのまま使う
      }
    }

    // --- Step 4: 結合と検証 ---
    logger.info('Step 3: 結果の結合と検証');

    // 最終的なWBS構造
    const finalWbs = detailedPhases;
    normalizeTaskTree(finalWbs);

    // --- Step 3.1: 全メンバーに最低1件の担当を保証 ---
    const coverageResult = ensureMemberCoverage(finalWbs, teamMembers, projectStartDate);
    if (coverageResult.reassignedTasks > 0 || coverageResult.addedTasks > 0) {
      logger.info(
        `担当者補正を実行: 再割当=${coverageResult.reassignedTasks}件, 追加タスク=${coverageResult.addedTasks}件`
      );
    }
    if (coverageResult.coverage.uncoveredMembers.length > 0) {
      logger.warn(
        `担当未割当メンバーが残っています: ${coverageResult.coverage.uncoveredMembers.join(', ')}`
      );
    }

    // --- Step 3.2: 依存関係と担当者稼働に基づく並行スケジューリング ---
    const scheduleResult = rebalanceLeafSchedule(finalWbs, projectStartDate, projectEndDate, calendarOptions);
    logger.info(
      `並行スケジューリング完了: 対象葉タスク=${scheduleResult.scheduledLeafTasks}件, 期間超過=${scheduleResult.overflowTasks}件`
    );

    // 簡易検証
    const missingAssignees = [];
    const checkTasks = (tasks, path = '') => {
      tasks.forEach((task, index) => {
        const taskPath = path ? `${path}.${index}` : `タスク${index}`;
        // 詳細タスク（子タスク）がある場合は親タスクの担当者は必須ではない場合もあるが、一応チェック
        if (!task.assignee && (!task.children || task.children.length === 0)) {
          missingAssignees.push({ path: taskPath, name: task.name });
        }
        if (task.children && task.children.length > 0) {
          checkTasks(task.children, taskPath);
        }
      });
    };
    checkTasks(finalWbs);

    if (missingAssignees.length > 0) {
      logger.warn('⚠️ 担当者が欠けているタスク:', JSON.stringify(missingAssignees, null, 2));
    }

    // --- Step 4: 全タスクの期間を検証・調整（土日祝・祝日・担当者休暇を除外） ---
    logger.info('Step 4: 全タスクの期間を検証・調整（休暇考慮）');
    let validatedCalendarAdjustments = 0;
    const validateTaskDates = (task) => {
      if (!task || typeof task !== 'object') {
        return;
      }

      const hasChildren = Array.isArray(task.children) && task.children.length > 0;
      if (hasChildren) {
        task.children.forEach((child) => validateTaskDates(child));
        return;
      }

      try {
        const originalStart = task.start_date || '';
        const originalEnd = task.end_date || '';
        const effort = Number(task.effort_days) > 0 ? Math.max(1, Math.round(Number(task.effort_days))) : 1;
        const fallbackStart =
          toWorkingDayForAssignee(projectStartDate, projectStartDate, task.assignee || null, calendarOptions) ||
          projectStartDate;
        const normalizedStart =
          toWorkingDayForAssignee(task.start_date, fallbackStart, task.assignee || null, calendarOptions) ||
          fallbackStart;
        const normalizedEnd = calculateEndDateForAssignee(
          normalizedStart,
          effort,
          task.assignee || null,
          calendarOptions
        );

        if (originalStart !== normalizedStart || originalEnd !== normalizedEnd) {
          validatedCalendarAdjustments += 1;
          logger.info(
            `タスク「${task.name}」の日程を補正: ${originalStart || '-'}~${originalEnd || '-'} -> ${normalizedStart}~${normalizedEnd}`
          );
        }

        task.start_date = normalizedStart;
        task.end_date = normalizedEnd;
        task.effort_days = effort;
      } catch (error) {
        logger.error(`タスク「${task.name}」の日付検証エラー: ${error.message}`);
      }
    };

    // 全タスクに対して検証を実行
    finalWbs.forEach((phase) => validateTaskDates(phase));
    finalWbs.forEach((phase) => updateParentTaskDates(phase, projectStartDate, calendarOptions));
    logger.info(`全タスクの期間検証が完了しました（追加補正: ${validatedCalendarAdjustments}件）`);

    return {
      wbs: finalWbs,
      diagnostics: {
        memberCoverage: coverageResult.coverage,
        reassignedTasks: coverageResult.reassignedTasks,
        addedTasks: coverageResult.addedTasks,
        scheduledLeafTasks: scheduleResult.scheduledLeafTasks,
        overflowTasks: scheduleResult.overflowTasks,
        calendarAdjustedTasks:
          (scheduleResult.calendarAdjustedTasks || 0) + validatedCalendarAdjustments,
        vacationEntries: vacations.length
      }
    };

  } catch (error) {
    logger.error(`WBS生成エラー: ${error.message}`);
    throw error;
  }
}

async function decomposeTask(payload) {
  const holidaysText = dateCalculator.getHolidaysText();
  const payloadWithHolidays = { ...payload, holidays: holidaysText };
  const template = loadPrompt('wbs-decompose');
  const prompt = fillTemplate(template, payloadWithHolidays);
  return callAI(prompt, { responseFormat: 'json' });
}

async function refineWbsTask(payload) {
  const template = loadPrompt('wbs-task-refine');
  const prompt = fillTemplate(template, payload);
  return callAI(prompt, { responseFormat: 'json' });
}

async function sanityCheckWbs(payload) {
  const template = loadPrompt('wbs-sanity-check');
  const prompt = fillTemplate(template, payload);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * 段階的WBS生成（WBSビルダー専用）
 * フェーズ（major/medium/minor）ごとにタスクを生成する
 */
async function generateWbsBuilder(payload) {
  try {
    const { projectDetails, phase, parentTask, userInstruction, history } = payload;

    // プロジェクト情報の整形
    const project_name = projectDetails.projectName || '';
    const project_goal = projectDetails.goal || '';
    const duration = `${projectDetails.startDate || ''} ~ ${projectDetails.endDate || ''}`;
    const team_structure = projectDetails.teamMembers && projectDetails.teamMembers.length > 0
      ? `${projectDetails.teamMembers.length}名のメンバー`
      : '未定';
    const constraints = projectDetails.constraints || '';

    // 親タスク情報の整形（medium/minorフェーズの場合）
    let parent_task_info = '';
    if (phase === 'medium' || phase === 'minor') {
      if (parentTask && parentTask.name) {
        parent_task_info = `タスク名: ${parentTask.name}\n`;
        if (parentTask.description) {
          parent_task_info += `説明: ${parentTask.description}\n`;
        }
        if (parentTask.effortDays) {
          parent_task_info += `工数: ${parentTask.effortDays}日\n`;
        }
      } else {
        parent_task_info = '（親タスク情報なし）';
      }
    } else {
      parent_task_info = '（このフェーズでは親タスクは不要です）';
    }

    // 対話履歴の整形
    let history_text = '';
    if (history && Array.isArray(history) && history.length > 0) {
      history_text = history.map(h => {
        const role = h.role === 'user' ? 'ユーザー' : 'AI';
        return `${role}: ${h.content}`;
      }).join('\n');
    } else {
      history_text = '（対話履歴なし）';
    }

    // ユーザー指示の整形
    const user_instruction_text = userInstruction || '（特になし）';

    // プロンプトテンプレートの読み込みと充填
    const template = loadPrompt('wbs-builder-generate');
    const prompt = fillTemplate(template, {
      project_name,
      project_goal,
      duration,
      team_structure,
      constraints,
      phase: phase === 'major' ? 'major（大分類）' : phase === 'medium' ? 'medium（中分類）' : 'minor（小分類）',
      parent_task_info,
      history: history_text,
      user_instruction: user_instruction_text
    });

    logger.info(`WBSビルダー生成リクエスト: phase=${phase}, userInstruction=${userInstruction ? 'あり' : 'なし'}`);

    // AI呼び出し（テキストモードで呼び出し、後でJSON解析する）
    // response_format: json_object を使うとAIが不正なJSONを生成した際に
    // API側でjson_validate_failedエラーになるため、テキストで受け取る
    const rawContent = await callAI(prompt, { responseFormat: 'text' });

    // テキストからJSONを解析
    const result = parseJsonFromText(rawContent, 'WBSビルダー');

    if (!result || !result.suggestedTasks || !Array.isArray(result.suggestedTasks)) {
      throw new Error('AIが有効なタスクリストを生成できませんでした。');
    }

    logger.info(`WBSビルダー生成完了: ${result.suggestedTasks.length}件のタスクが生成されました`);

    return result;

  } catch (error) {
    logger.error(`WBSビルダー生成エラー: ${error.message}`);
    throw error;
  }
}

/**
 * テキストからJSONを解析（AIが生成したテキストからJSONを抽出・修復）
 * @param {string} text - AIが生成したテキスト
 * @param {string} context - ログ用のコンテキスト名
 * @returns {object} パースされたJSONオブジェクト
 */
function parseJsonFromText(text, context = 'AI') {
  let jsonStr = text.trim();

  // Markdownコードブロックの除去
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // 最初の { から最後の } までを抽出
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }

  // まずそのままパースを試みる
  try {
    return JSON.parse(jsonStr);
  } catch (parseError) {
    logger.warn(`${context}: 初回JSON解析失敗、修復を試みます: ${parseError.message}`);
  }

  // 修復を試みる
  try {
    const repaired = tryAdvancedJsonRepair(jsonStr);
    if (repaired) {
      logger.info(`${context}: JSON修復に成功しました`);
      return repaired;
    }
  } catch (repairError) {
    logger.warn(`${context}: JSON修復失敗: ${repairError.message}`);
  }

  // 最後の手段：基本的な修復
  try {
    const basicRepaired = tryManualRepair(jsonStr);
    if (basicRepaired) {
      logger.info(`${context}: 基本的なJSON修復に成功しました`);
      return basicRepaired;
    }
  } catch (e) {
    // 無視
  }

  logger.error(`${context}: JSON解析に完全に失敗しました。最初の500文字: ${jsonStr.substring(0, 500)}`);
  throw new Error(`${context}: JSONの解析に失敗しました`);
}

/**
 * より高度なJSON修復を試みる
 * @param {string} jsonStr
 * @returns {object|null}
 */
function tryAdvancedJsonRepair(jsonStr) {
  let fixed = jsonStr;

  // 1. 不正なエスケープシーケンスを修正（\\\\n -> \n, \\n -> \n など）
  fixed = fixed.replace(/\\\\\\\\n/g, '\\n');
  fixed = fixed.replace(/\\\\n/g, '\\n');

  // 2. 不正な二重エスケープを修正
  fixed = fixed.replace(/\\\\\"/g, '\\"');

  // 3. 文字列内の改行を\\nに変換
  fixed = fixed.replace(/(?<!\\)\\n(?!\")/g, '\\n');

  // 4. 末尾の余分なカンマを削除
  fixed = fixed.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

  // 5. 制御文字を除去（改行・タブ以外）
  fixed = fixed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // 6. 不正な引用符パターンを修正
  // 例: "key": "value", "} -> "key": "value" }
  fixed = fixed.replace(/",\s*"\s*}/g, '" }');

  // 7. description内で途切れたクォートを修正（閉じクォート追加）
  // パターン: "description": "xxx で終わっている場合
  fixed = fixed.replace(/"description":\s*"([^"]*?)(?=,\s*"effortDays"|,\s*"id"|,\s*"name"|\s*})/g, (match, content) => {
    // contentが閉じクォートで終わっていない場合は追加
    if (!match.endsWith('"')) {
      return `"description": "${content}"`;
    }
    return match;
  });

  // 8. 閉じ括弧の不足を補完
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    fixed += '}'.repeat(openBraces - closeBraces);
  }

  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;
  if (openBrackets > closeBrackets) {
    fixed += ']'.repeat(openBrackets - closeBrackets);
  }

  try {
    return JSON.parse(fixed);
  } catch (e) {
    return null;
  }
}

async function summarizeProject(payload) {
  const template = loadPrompt('project-summary');
  const prompt = fillTemplate(template, payload);
  return callAI(prompt, { responseFormat: 'json' });
}

async function detectRisk(payload) {
  const template = loadPrompt('risk-detection-json');
  const prompt = fillTemplate(template, payload);

  try {
    const result = await callAI(prompt, { responseFormat: 'json' });

    // AIから正常なアラートが返された場合
    if (result && Array.isArray(result.alerts) && result.alerts.length > 0) {
      return result;
    }

    // スタブ応答またはアラートが空の場合はデモデータを返す
    logger.info('AI応答が空またはスタブです。デモアラートを返します。');
    return getDefaultRiskAlerts();
  } catch (error) {
    logger.error(`リスク検知エラー: ${error.message}`);
    return getDefaultRiskAlerts();
  }
}

/**
 * リスク検知のデフォルトアラートを返す
 */
function getDefaultRiskAlerts() {
  return {
    alerts: [
      {
        projectId: 6,
        severity: 'high',
        message: 'AIチャットボットの意図認識モデル精度が目標値80%に対して70%で停滞しています。トレーニングデータの品質改善と専門家レビューを早急に実施してください。'
      },
      {
        projectId: 4,
        severity: 'medium',
        message: 'CRMシステムのデータベース設計フェーズで遅延が発生しています。クリティカルパスの見直しを推奨します。'
      },
      {
        projectId: 6,
        severity: 'low',
        message: 'チャットボットプロジェクトのFAQ収集が順調に進んでいます。引き続きモニタリングを継続してください。'
      }
    ]
  };
}

async function analyzeSentiment(payload) {
  // コメントデータがpayloadに含まれていない場合、DBから取得
  let commentsJson = payload.comments_json;

  if (!commentsJson || commentsJson === '[]' || commentsJson === '') {
    try {
      const knex = db.getKnex();

      // 最近30日間の日報コメントを取得
      const dailyReportComments = await knex('daily_reports as dr')
        .select('u.full_name as userName', 'dr.comment', 'dr.report_date')
        .join('users as u', 'dr.user_id', 'u.id')
        .whereNotNull('dr.comment')
        .whereNot('dr.comment', '')
        .orderBy('dr.report_date', 'desc')
        .limit(20);

      // 最近30日間のタスクコメントを取得
      const taskComments = await knex('task_comments as tc')
        .select('u.full_name as userName', 'tc.content as comment', 'tc.created_at')
        .join('users as u', 'tc.user_id', 'u.id')
        .whereNotNull('tc.content')
        .whereNot('tc.content', '')
        .orderBy('tc.created_at', 'desc')
        .limit(20);

      // コメントを配列に変換
      const allComments = [];

      dailyReportComments.forEach(row => {
        if (row.comment) {
          allComments.push({
            user: row.userName,
            comment: row.comment,
            type: 'daily_report'
          });
        }
      });

      taskComments.forEach(row => {
        if (row.comment) {
          allComments.push({
            user: row.userName,
            comment: row.comment,
            type: 'task_comment'
          });
        }
      });

      if (allComments.length === 0) {
        logger.warn('センチメント分析: コメントデータがありません。');
        // デモデータを返さず、データがないことを示す
        return {
          overall_score: null,
          summary: '',
          positive_keywords: [],
          negative_keywords: [],
          noData: true
        };
      }

      commentsJson = JSON.stringify(allComments);
      logger.info(`センチメント分析: ${allComments.length}件のコメントをDBから取得しました`);
    } catch (dbError) {
      logger.error(`センチメント分析: DBからのコメント取得に失敗: ${dbError.message}`);
      return {
        overall_score: null,
        summary: '',
        positive_keywords: [],
        negative_keywords: [],
        noData: true
      };
    }
  }

  const template = loadPrompt('sentiment-analysis-json');
  const prompt = fillTemplate(template, { comments_json: commentsJson });

  try {
    const result = await callAI(prompt, { responseFormat: 'json' });

    // AIからの応答がセンチメント形式かどうかをチェック
    if (result && typeof result.overall_score === 'number') {
      return result;
    }

    // 期待される形式でない場合はエラーを返す
    logger.warn('AI応答がセンチメント形式ではありません。');
    return {
      overall_score: null,
      summary: '',
      positive_keywords: [],
      negative_keywords: [],
      error: 'AI応答が不正な形式でした'
    };
  } catch (error) {
    logger.error(`センチメント分析エラー: ${error.message}`);
    return {
      overall_score: null,
      summary: '',
      positive_keywords: [],
      negative_keywords: [],
      error: error.message
    };
  }
}



/**
 * センチメント分析のデフォルトデータを返す
 */
function getDefaultSentimentData() {
  return {
    overall_score: 0.65,
    trend: 'stable',
    summary: 'チーム全体のセンチメントは概ね良好です。多くのメンバーがタスクの進捗に満足しており、協力体制も整っています。一部のメンバーに負荷が集中している可能性があるため、定期的なフォローアップが推奨されます。',
    positive_keywords: ['順調', '完了', '達成感', 'スムーズ', '協力'],
    negative_keywords: ['遅延', '課題', '負荷']
  };
}

async function suggestTasks(payload) {
  const template = loadPrompt('task-suggestion');
  const prompt = fillTemplate(template, payload);
  return callAI(prompt, { responseFormat: 'text' });
}

async function generateDailyReport(payload) {
  const template = loadPrompt('daily-report');
  const normalizedPayload = {
    user_name: payload.user_name || payload.userName || 'チームメンバー',
    report_date: payload.report_date || payload.reportDate || new Date().toISOString().split('T')[0],
    task_list: payload.task_list || payload.taskList || '',
    achievements: payload.achievements || '',
    issues: payload.issues || '',
    learnings: payload.learnings || '',
    next_plan: payload.next_plan || payload.nextPlan || '',
    monitoring_context: payload.monitoring_context || payload.monitoringContext || '',
    three_day_context: payload.three_day_context || payload.threeDayContext || '',
    recent_feedback_context: payload.recent_feedback_context || payload.recentFeedbackContext || ''
  };
  const prompt = fillTemplate(template, normalizedPayload);
  try {
    return await callAI(prompt, { responseFormat: 'json' });
  } catch (error) {
    logger.warn(`日報生成でAI応答が得られなかったためフォールバックを返却します: ${error.message}`);
    return { summary: '日報の生成に失敗しました。後ほど再実行してください。' };
  }
}

/**
 * 作業ログから日報ドラフトを生成する
 */
async function generateDailyReportDraft(payload) {
  const { userId, date } = payload;

  if (!userId || !date) {
    throw new Error('userId and date are required');
  }

  try {
    // DBから作業ログを取得
    const knex = db.getKnex();
    const dbClient = db.getDbClient();

    let query = knex('work_session_summary')
      .where('work_session_summary.user_id', userId)
      .leftJoin('tasks', 'work_session_summary.task_id', 'tasks.id')
      .select(
        'work_session_summary.session_start',
        'work_session_summary.session_end',
        'work_session_summary.work_duration_seconds',
        'work_session_summary.session_notes',
        'tasks.name as task_name'
      )
      .orderBy('work_session_summary.session_start', 'asc');

    // DB互換の日付フィルタ
    if (dbClient === 'better-sqlite3') {
      query = query.whereRaw("date(session_start) = ?", [date]);
    } else if (dbClient === 'pg') {
      query = query.whereRaw("DATE(session_start) = DATE(?)", [date]);
    } else {
      // MySQL etc
      query = query.whereRaw("DATE(session_start) = ?", [date]);
    }

    const sessions = await query;

    if (sessions.length === 0) {
      return {
        summary: '本日の作業ログが見つかりませんでした。',
        achievements: '特になし',
        issues: '特になし',
        learnings: '特になし',
        next_plan: '',
        noData: true
      };
    }

    // ユーザー名取得
    const user = await knex('users').where('id', userId).first();
    const userName = user ? (user.full_name || user.username) : 'ユーザー';

    // 作業ログをテキスト化
    const workLogsText = sessions.map(s => {
      const time = new Date(s.session_start).toLocaleTimeString();
      const duration = Math.round(s.work_duration_seconds / 60) + '分';
      const task = s.task_name || 'タスク未紐付け';
      const note = s.session_notes || '';
      return `- [${time}] (${duration}) ${task}: ${note}`;
    }).join('\n');

    const template = loadPrompt('daily-report-draft');
    const prompt = fillTemplate(template, {
      user_name: userName,
      date: date,
      work_logs: workLogsText
    });

    return await callAI(prompt, { responseFormat: 'json' });
  } catch (error) {
    logger.error(`日報ドラフト生成エラー: ${error.message}`);
    return {
      summary: '日報ドラフトの生成に失敗しました。',
      error: error.message
    };
  }
}

/**
 * タスクの詳細説明を生成（約800文字）
 * @param {Object} payload - タスク情報
 * @returns {Promise<string>} 生成された詳細説明
 */
async function generateTaskDescription(payload) {
  const template = loadPrompt('task-description-generate');
  const prompt = fillTemplate(template, payload);
  return callAI(prompt, { responseFormat: 'text' });
}

/**
 * タスクを子タスクに分割し、それぞれに詳細説明を付与
 * @param {Object} payload - 親タスク情報
 * @returns {Promise<Object>} 子タスク一覧（JSON）
 */
async function subdivideTask(payload) {
  const template = loadPrompt('task-subdivide');
  const prompt = fillTemplate(template, payload);
  return callAI(prompt, { responseFormat: 'json' });
}

function parseDependencies(dependencies) {
  if (Array.isArray(dependencies)) {
    return [...new Set(dependencies.map((dep) => String(dep).trim()).filter(Boolean))];
  }
  if (typeof dependencies === 'string') {
    return [...new Set(
      dependencies
        .split(',')
        .map((dep) => dep.trim())
        .filter(Boolean)
    )];
  }
  return [];
}

function normalizeTaskForScheduling(rawTask) {
  if (!rawTask || typeof rawTask !== 'object') {
    return null;
  }

  const id = String(rawTask.id || rawTask.taskId || '').trim();
  if (!id) {
    return null;
  }

  const startDateRaw = String(rawTask.startDate || rawTask.start_date || '').trim();
  const endDateRaw = String(rawTask.endDate || rawTask.end_date || '').trim();
  const startDate = isValidDateString(startDateRaw) ? startDateRaw : '';
  const endDate = isValidDateString(endDateRaw) ? endDateRaw : '';

  let effortDays = Number(rawTask.effortDays || rawTask.effort_days);
  if (!Number.isFinite(effortDays) || effortDays <= 0) {
    if (startDate && endDate) {
      try {
        effortDays = Math.max(1, dateCalculator.calculateEffortDays(startDate, endDate));
      } catch (error) {
        effortDays = 1;
      }
    } else {
      effortDays = 1;
    }
  } else {
    effortDays = Math.max(1, Math.round(effortDays));
  }

  return {
    id,
    name: String(rawTask.name || rawTask.taskName || `タスク${id}`).trim() || `タスク${id}`,
    assignee: rawTask.assignee ?? rawTask.assignedTo ?? null,
    startDate,
    endDate,
    effortDays,
    dependencies: parseDependencies(rawTask.dependencies),
    children: Array.isArray(rawTask.children) ? rawTask.children : []
  };
}

function flattenTasksForScheduling(rawTasks = []) {
  const flattened = [];

  const walk = (nodes) => {
    if (!Array.isArray(nodes)) {
      return;
    }

    nodes.forEach((node) => {
      const normalized = normalizeTaskForScheduling(node);
      if (!normalized) {
        return;
      }
      flattened.push(normalized);
      walk(normalized.children);
    });
  };

  walk(rawTasks);
  return flattened.map((task) => {
    const { children, ...rest } = task;
    return rest;
  });
}

function parseMembersForScheduling(payload = {}) {
  const memberSources = [];

  const parsedMembers = safeJsonParse(payload.members, null);
  if (Array.isArray(parsedMembers)) {
    memberSources.push(...parsedMembers);
  } else if (Array.isArray(payload.members)) {
    memberSources.push(...payload.members);
  }

  if (Array.isArray(payload.team_members)) {
    memberSources.push(...payload.team_members);
  } else {
    const parsedTeamMembers = safeJsonParse(payload.team_members, null);
    if (Array.isArray(parsedTeamMembers)) {
      memberSources.push(...parsedTeamMembers);
    }
  }

  return sanitizeTeamMembers(
    memberSources.map((member) => ({
      id: member?.id ?? member?.user_id ?? member?.userId ?? null,
      fullName: member?.fullName || member?.name || member?.user_name || member?.username || '',
      username: member?.username || '',
      role: member?.role || 'member',
      skills: member?.skills || []
    }))
  );
}

function inferDateRangeFromTasks(tasks = [], fallbackStart = '', fallbackEnd = '') {
  let minStart = isValidDateString(fallbackStart) ? fallbackStart : '';
  let maxEnd = isValidDateString(fallbackEnd) ? fallbackEnd : '';

  (tasks || []).forEach((task) => {
    if (isValidDateString(task.startDate)) {
      minStart = minDate(minStart, task.startDate);
    }
    if (isValidDateString(task.endDate)) {
      maxEnd = maxDate(maxEnd, task.endDate);
    }
  });

  if (!minStart) {
    minStart = getTodayYmd();
  }

  if (!maxEnd) {
    maxEnd = addDays(minStart, 365) || minStart;
  }

  return {
    startDate: minStart,
    endDate: maxEnd
  };
}

function getAssigneeAvailabilityKey(assignee, vacationContext) {
  const userId = resolveAssigneeUserIdForVacation(assignee, vacationContext);
  if (Number.isFinite(userId)) {
    return `id:${userId}`;
  }
  const token = normalizeNameToken(assignee);
  return token ? `name:${token}` : '';
}

function calculateCalendarDayDiff(startDate, endDate) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return 0;
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeRescheduleChange(change, taskMap) {
  if (!change || typeof change !== 'object') {
    return null;
  }

  const taskId = String(change.taskId || '').trim();
  if (!taskId) {
    return null;
  }

  const originalTask = taskMap.get(taskId);
  const currentStartRaw = String(change.currentStart || originalTask?.startDate || '').trim();
  const currentEndRaw = String(change.currentEnd || originalTask?.endDate || '').trim();
  const proposedStartRaw = String(change.proposedStart || '').trim();
  const proposedEndRaw = String(change.proposedEnd || '').trim();

  return {
    taskId,
    taskName: String(change.taskName || originalTask?.name || `タスク${taskId}`).trim() || `タスク${taskId}`,
    currentStart: isValidDateString(currentStartRaw) ? currentStartRaw : originalTask?.startDate || '',
    currentEnd: isValidDateString(currentEndRaw) ? currentEndRaw : originalTask?.endDate || '',
    proposedStart: isValidDateString(proposedStartRaw) ? proposedStartRaw : '',
    proposedEnd: isValidDateString(proposedEndRaw) ? proposedEndRaw : '',
    reason: String(change.reason || '').trim(),
    impact: change.impact === 'high' || change.impact === 'low' ? change.impact : 'medium'
  };
}

function correctRescheduleProposalResult(aiResult, options) {
  const {
    taskMap,
    today,
    calendarOptions,
    projectStartDate
  } = options;

  const baseChanges = Array.isArray(aiResult?.changes) ? aiResult.changes : [];
  const normalizedChanges = baseChanges
    .map((change) => normalizeRescheduleChange(change, taskMap))
    .filter(Boolean);

  const pendingChangeIds = new Set(normalizedChanges.map((change) => change.taskId));
  const correctedChanges = new Map();
  const assigneeAvailability = new Map();

  const scheduleOne = (change) => {
    const task = taskMap.get(change.taskId);

    if (task && isValidDateString(task.endDate) && task.endDate < today) {
      return;
    }

    const dependencies = task?.dependencies || [];
    let earliestStart =
      change.proposedStart ||
      task?.startDate ||
      projectStartDate ||
      today;

    earliestStart = maxDate(earliestStart, today);

    dependencies.forEach((depId) => {
      if (!depId) {
        return;
      }
      const depChange = correctedChanges.get(depId);
      const depEndDate = depChange?.proposedEnd || taskMap.get(depId)?.endDate || '';
      if (!isValidDateString(depEndDate)) {
        return;
      }
      const depNextDate = addDays(depEndDate, 1);
      if (!depNextDate) {
        return;
      }
      earliestStart = maxDate(earliestStart, depNextDate);
    });

    const assignee = task?.assignee ?? null;
    const assigneeKey = getAssigneeAvailabilityKey(assignee, calendarOptions.vacationContext);
    if (assigneeKey && assigneeAvailability.has(assigneeKey)) {
      earliestStart = maxDate(earliestStart, assigneeAvailability.get(assigneeKey));
    }

    let effortDays = Number(task?.effortDays) > 0
      ? Math.max(1, Math.round(Number(task.effortDays)))
      : 1;
    if (!(Number(task?.effortDays) > 0) && change.proposedStart && change.proposedEnd) {
      try {
        effortDays = Math.max(1, dateCalculator.calculateEffortDays(change.proposedStart, change.proposedEnd));
      } catch (error) {
        effortDays = 1;
      }
    }

    const startDate =
      toWorkingDayForAssignee(earliestStart, today, assignee, calendarOptions) || today;
    const endDate = calculateEndDateForAssignee(startDate, effortDays, assignee, calendarOptions);

    let reason = change.reason || '依存関係と稼働可能日を考慮して日程を補正しました。';
    if (change.proposedStart && change.proposedStart !== startDate) {
      reason += `（開始日を${change.proposedStart}から${startDate}へ補正）`;
    }
    if (change.proposedEnd && change.proposedEnd !== endDate) {
      reason += `（終了日を${change.proposedEnd}から${endDate}へ補正）`;
    }

    const corrected = {
      ...change,
      currentStart: change.currentStart || task?.startDate || '',
      currentEnd: change.currentEnd || task?.endDate || '',
      proposedStart: startDate,
      proposedEnd: endDate,
      reason
    };
    correctedChanges.set(change.taskId, corrected);

    if (assigneeKey) {
      const nextAvailableDate = toWorkingDayForAssignee(
        addDays(endDate, 1),
        addDays(endDate, 1),
        assignee,
        calendarOptions
      );
      assigneeAvailability.set(assigneeKey, nextAvailableDate || endDate);
    }
  };

  let loopGuard = 0;
  while (pendingChangeIds.size > 0 && loopGuard < normalizedChanges.length * 3 + 1) {
    loopGuard += 1;
    let progressed = false;

    normalizedChanges.forEach((change) => {
      if (!pendingChangeIds.has(change.taskId)) {
        return;
      }
      const task = taskMap.get(change.taskId);
      const dependencies = task?.dependencies || [];
      const hasPendingDependency = dependencies.some((depId) => pendingChangeIds.has(depId));
      if (hasPendingDependency) {
        return;
      }

      scheduleOne(change);
      pendingChangeIds.delete(change.taskId);
      progressed = true;
    });

    if (!progressed) {
      normalizedChanges.forEach((change) => {
        if (!pendingChangeIds.has(change.taskId)) {
          return;
        }
        scheduleOne(change);
        pendingChangeIds.delete(change.taskId);
      });
    }
  }

  const changes = normalizedChanges
    .map((change) => correctedChanges.get(change.taskId))
    .filter(Boolean);

  const originalProjectEndDate = Array.from(taskMap.values()).reduce((maxEnd, task) => {
    if (isValidDateString(task.endDate)) {
      return maxDate(maxEnd, task.endDate);
    }
    return maxEnd;
  }, '');

  const newTaskEndDates = new Map(Array.from(taskMap.values()).map((task) => [task.id, task.endDate || '']));
  changes.forEach((change) => {
    newTaskEndDates.set(change.taskId, change.proposedEnd);
  });
  const newProjectEndDate = Array.from(newTaskEndDates.values()).reduce((maxEnd, endDate) => {
    if (isValidDateString(endDate)) {
      return maxDate(maxEnd, endDate);
    }
    return maxEnd;
  }, '');

  const summary = {
    affectedTasks: changes.length,
    delayDays:
      originalProjectEndDate && newProjectEndDate && newProjectEndDate > originalProjectEndDate
        ? calculateCalendarDayDiff(originalProjectEndDate, newProjectEndDate)
        : 0,
    criticalPathChanged:
      typeof aiResult?.summary?.criticalPathChanged === 'boolean'
        ? aiResult.summary.criticalPathChanged
        : changes.length > 0,
    newProjectEndDate: newProjectEndDate || null
  };

  return {
    changes,
    summary,
    diagnostics: {
      originalChanges: normalizedChanges.length,
      correctedChanges: changes.length
    }
  };
}

function normalizeAutoDurationItem(item, taskMap, projectStartDate) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const taskId = String(item.taskId || item.id || '').trim();
  if (!taskId) {
    return null;
  }

  const task = taskMap.get(taskId);
  const startDateRaw = String(item.startDate || task?.startDate || projectStartDate || '').trim();
  const endDateRaw = String(item.endDate || '').trim();
  let effortDays = Number(item.effortDays);
    if (!Number.isFinite(effortDays) || effortDays <= 0) {
      if (Number(task?.effortDays) > 0) {
        effortDays = Math.max(1, Math.round(Number(task.effortDays)));
      } else if (isValidDateString(startDateRaw) && isValidDateString(endDateRaw)) {
        try {
          effortDays = Math.max(1, dateCalculator.calculateEffortDays(startDateRaw, endDateRaw));
        } catch (error) {
          effortDays = 1;
        }
      } else {
        effortDays = 1;
      }
  } else {
    effortDays = Math.max(1, Math.round(effortDays));
  }

  return {
    taskId,
    taskName: String(item.taskName || item.name || task?.name || `タスク${taskId}`).trim() || `タスク${taskId}`,
    startDate: isValidDateString(startDateRaw) ? startDateRaw : projectStartDate,
    endDate: isValidDateString(endDateRaw) ? endDateRaw : '',
    effortDays,
    reasoning: String(item.reasoning || '').trim()
  };
}

function correctAutoDurationResult(aiResult, options) {
  const {
    taskMap,
    projectStartDate,
    calendarOptions
  } = options;

  const sourceDurations = Array.isArray(aiResult?.durations) ? aiResult.durations : [];
  const normalizedDurations = sourceDurations
    .map((item) => normalizeAutoDurationItem(item, taskMap, projectStartDate))
    .filter(Boolean);

  const pendingTaskIds = new Set(normalizedDurations.map((duration) => duration.taskId));
  const scheduledDurations = new Map();
  const assigneeAvailability = new Map();

  const scheduleOne = (duration) => {
    const task = taskMap.get(duration.taskId);
    const dependencies = task?.dependencies || [];
    let earliestStart = duration.startDate || projectStartDate;
    earliestStart = maxDate(earliestStart, projectStartDate);

    dependencies.forEach((depId) => {
      const depScheduled = scheduledDurations.get(depId);
      const depEnd = depScheduled?.endDate || taskMap.get(depId)?.endDate || '';
      if (!isValidDateString(depEnd)) {
        return;
      }
      const depNextDate = addDays(depEnd, 1);
      if (depNextDate) {
        earliestStart = maxDate(earliestStart, depNextDate);
      }
    });

    const assignee = task?.assignee ?? null;
    const assigneeKey = getAssigneeAvailabilityKey(assignee, calendarOptions.vacationContext);
    if (assigneeKey && assigneeAvailability.has(assigneeKey)) {
      earliestStart = maxDate(earliestStart, assigneeAvailability.get(assigneeKey));
    }

    const startDate =
      toWorkingDayForAssignee(earliestStart, projectStartDate, assignee, calendarOptions) || projectStartDate;
    const endDate = calculateEndDateForAssignee(startDate, duration.effortDays, assignee, calendarOptions);
    const changedByCorrection = duration.startDate !== startDate || duration.endDate !== endDate;

    const reasoning = changedByCorrection
      ? `${duration.reasoning ? `${duration.reasoning} ` : ''}（依存関係・土日祝日・担当者休暇を考慮して日程を補正）`
      : duration.reasoning || '依存関係と稼働可能日を考慮して算出しました。';

    const corrected = {
      ...duration,
      startDate,
      endDate,
      reasoning
    };

    scheduledDurations.set(duration.taskId, corrected);

    if (assigneeKey) {
      const nextAvailableDate = toWorkingDayForAssignee(
        addDays(endDate, 1),
        addDays(endDate, 1),
        assignee,
        calendarOptions
      );
      assigneeAvailability.set(assigneeKey, nextAvailableDate || endDate);
    }
  };

  let loopGuard = 0;
  while (pendingTaskIds.size > 0 && loopGuard < normalizedDurations.length * 3 + 1) {
    loopGuard += 1;
    let progressed = false;

    normalizedDurations.forEach((duration) => {
      if (!pendingTaskIds.has(duration.taskId)) {
        return;
      }
      const task = taskMap.get(duration.taskId);
      const dependencies = task?.dependencies || [];
      const hasPendingDependency = dependencies.some((depId) => pendingTaskIds.has(depId));
      if (hasPendingDependency) {
        return;
      }

      scheduleOne(duration);
      pendingTaskIds.delete(duration.taskId);
      progressed = true;
    });

    if (!progressed) {
      normalizedDurations.forEach((duration) => {
        if (!pendingTaskIds.has(duration.taskId)) {
          return;
        }
        scheduleOne(duration);
        pendingTaskIds.delete(duration.taskId);
      });
    }
  }

  const durations = normalizedDurations
    .map((duration) => scheduledDurations.get(duration.taskId))
    .filter(Boolean);

  const projectEndDate = durations.reduce((maxEnd, duration) => {
    if (isValidDateString(duration.endDate)) {
      return maxDate(maxEnd, duration.endDate);
    }
    return maxEnd;
  }, '');

  const criticalPathCandidates = Array.isArray(aiResult?.criticalPath)
    ? aiResult.criticalPath.map((taskId) => String(taskId))
    : [];
  const durationIds = new Set(durations.map((duration) => duration.taskId));
  const criticalPath = criticalPathCandidates.filter((taskId) => durationIds.has(taskId));

  return {
    durations,
    projectEndDate: projectEndDate || null,
    criticalPath,
    diagnostics: {
      originalDurations: normalizedDurations.length,
      correctedDurations: durations.length
    }
  };
}

/**
 * リスケジュール提案を生成
 * @param {Object} payload - リスケジュール要求情報
 * @returns {Promise<Object>} リスケジュール提案（JSON）
 */
async function rescheduleProposal(payload) {
  const holidaysText = dateCalculator.getHolidaysText();
  const today = isValidDateString(payload?.today) ? payload.today : getTodayYmd();

  const rawTaskTree = safeJsonParse(payload?.current_tasks, []);
  const flattenedTasks = flattenTasksForScheduling(Array.isArray(rawTaskTree) ? rawTaskTree : []);
  const taskMap = new Map(flattenedTasks.map((task) => [task.id, task]));

  const schedulingMembers = parseMembersForScheduling(payload);
  const memberLookupContext = buildVacationContext([], schedulingMembers);
  const assigneeIdsFromTasks = flattenedTasks
    .map((task) => resolveAssigneeUserIdForVacation(task.assignee, memberLookupContext))
    .filter((id) => Number.isFinite(Number(id)));
  const memberIds = uniqueNumericIds([
    ...schedulingMembers.map((member) => member.id),
    ...assigneeIdsFromTasks
  ]);

  const dateRange = inferDateRangeFromTasks(flattenedTasks, today, '');
  const vacations = await fetchVacationsForSchedule(memberIds, dateRange.startDate, dateRange.endDate);
  const vacationContext = buildVacationContext(vacations, schedulingMembers);
  const calendarOptions = createCalendarOptions(vacationContext);
  const vacationsText = formatVacationsForPrompt(vacations, schedulingMembers);

  const payloadWithHolidays = {
    ...payload,
    today,
    holidays: holidaysText,
    vacations: vacationsText
  };
  const template = loadPrompt('task-reschedule');
  const prompt = fillTemplate(template, payloadWithHolidays);
  const aiResult = await callAI(prompt, { responseFormat: 'json' });
  return correctRescheduleProposalResult(aiResult, {
    taskMap,
    today,
    calendarOptions,
    projectStartDate: dateRange.startDate
  });
}

/**
 * AIによるタスクの自動割り当て提案
 * @param {Object} payload - タスクとメンバー情報
 * @returns {Promise<Object>} 割り当て提案（JSON）
 */
async function autoAssignTasks(payload) {
  const template = loadPrompt('task-allocation');
  const prompt = fillTemplate(template, payload);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * AIによるタスク期間の自動設定
 * @param {Object} payload - タスクとプロジェクト情報
 * @returns {Promise<Object>} 期間設定提案（JSON）
 */
async function autoDuration(payload) {
  const holidaysText = dateCalculator.getHolidaysText();
  const projectStartDate = toWorkingDay(payload?.startDate || payload?.start_date, getTodayYmd()) || getTodayYmd();
  const parsedTasks = safeJsonParse(payload?.tasks, []);
  const flattenedTasks = flattenTasksForScheduling(Array.isArray(parsedTasks) ? parsedTasks : []);
  const taskMap = new Map(flattenedTasks.map((task) => [task.id, task]));

  const schedulingMembers = parseMembersForScheduling(payload);
  const memberLookupContext = buildVacationContext([], schedulingMembers);
  const assigneeIdsFromTasks = flattenedTasks
    .map((task) => resolveAssigneeUserIdForVacation(task.assignee, memberLookupContext))
    .filter((id) => Number.isFinite(Number(id)));
  const memberIds = uniqueNumericIds([
    ...schedulingMembers.map((member) => member.id),
    ...assigneeIdsFromTasks
  ]);

  const dateRange = inferDateRangeFromTasks(
    flattenedTasks,
    projectStartDate,
    addDays(projectStartDate, 365) || projectStartDate
  );
  const vacations = await fetchVacationsForSchedule(memberIds, dateRange.startDate, dateRange.endDate);
  const vacationContext = buildVacationContext(vacations, schedulingMembers);
  const calendarOptions = createCalendarOptions(vacationContext);
  const vacationsText = formatVacationsForPrompt(vacations, schedulingMembers);

  const payloadWithHolidays = {
    ...payload,
    startDate: projectStartDate,
    holidays: holidaysText,
    vacations: vacationsText
  };
  const template = loadPrompt('task-duration-estimate');
  const prompt = fillTemplate(template, payloadWithHolidays);
  const aiResult = await callAI(prompt, { responseFormat: 'json' });
  return correctAutoDurationResult(aiResult, {
    taskMap,
    projectStartDate,
    calendarOptions
  });
}

/**
 * 新規プロジェクト作成時の未入力フィールドを生成
 * @param {Object} payload - 入力済み/未入力のフィールド情報
 * @returns {Promise<Object>} すべてのフィールドを含むJSON
 */
async function generateProjectFields(payload) {
  const template = loadPrompt('project-field-generation');

  // 入力済みフィールドと未入力フィールドを整理
  const fields = {
    project_name: payload.project_name || '',
    project_goal: payload.project_goal || '',
    description: payload.description || '',
    main_deliverable: payload.main_deliverable || '',
    milestone: payload.milestone || ''
  };

  const filledFields = [];
  const emptyFields = [];

  Object.entries(fields).forEach(([key, value]) => {
    const label = {
      project_name: 'プロジェクト名',
      project_goal: 'プロジェクトの目的',
      description: '説明',
      main_deliverable: '主要成果物',
      milestone: '主要マイルストーン'
    }[key];

    if (value && value.trim()) {
      filledFields.push(`- ${label}: ${value}`);
    } else {
      emptyFields.push(`- ${label}`);
    }
  });

  // 今日の日付をYYYY-MM-DD形式で取得
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // チームメンバー情報を整形
  let teamMembersText = 'なし';
  if (payload.team_members && Array.isArray(payload.team_members) && payload.team_members.length > 0) {
    teamMembersText = payload.team_members
      .map((member, index) => {
        const skills = member.skills && member.skills.length > 0
          ? member.skills.map(s => `${s.name}(${s.level})`).join(', ')
          : 'スキル情報なし';
        return `${index + 1}. ${member.name} (ID: ${member.id})\n   - スキル: ${skills}\n   - 経験: ${member.experience_years || 0}年\n   - 役割: ${member.role || '未設定'}`;
      })
      .join('\n');
  }

  const variables = {
    filled_fields: filledFields.length > 0 ? filledFields.join('\n') : 'なし',
    empty_fields: emptyFields.length > 0 ? emptyFields.join('\n') : 'なし',
    team_structure: payload.team_structure || '未設定',
    constraints: payload.constraints || '特になし',
    today_date: todayStr,
    team_members: teamMembersText
  };

  const prompt = fillTemplate(template, variables);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * プロジェクトインポートファイルを解析
 * @param {Object} payload - ファイル情報
 * @returns {Promise<Object>} プロジェクトとタスクのJSON構造
 */
async function analyzeProjectImport(payload) {
  const template = loadPrompt('project-import-analysis');
  const variables = {
    file_type: payload.file_type || 'text',
    file_content: payload.file_content || '',
    additional_instructions: payload.additional_instructions || ''
  };
  const prompt = fillTemplate(template, variables);
  logger.info('プロジェクトインポート解析リクエスト - file_type:', variables.file_type);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * メンタルヘルスアドバイスを生成
 * @param {Object} payload - メンタルヘルス情報
 * @returns {Promise<Object>} AIアドバイス（JSON）
 */
async function generateMentalHealthAdvice(payload) {
  let template = loadPrompt('mental-health-advice');

  // 条件付きセクションを処理（has_blockerブロック）
  const hasBlockerRegex = /\{\{#if has_blocker\}\}([\s\S]*?)\{\{\/if\}\}/g;
  if (payload.has_blocker) {
    // has_blocker が true の場合は {{#if}} と {{/if}} タグのみを削除
    template = template.replace(hasBlockerRegex, '$1');
  } else {
    // has_blocker が false の場合はセクション全体を削除
    template = template.replace(hasBlockerRegex, '');
  }

  // 条件付きセクションを処理（need_supportブロック）
  const needSupportRegex = /\{\{#if need_support\}\}([\s\S]*?)\{\{\/if\}\}/g;
  if (payload.need_support) {
    // need_support が true の場合は {{#if}} と {{/if}} タグのみを削除
    template = template.replace(needSupportRegex, '$1');
  } else {
    // need_support が false の場合はセクション全体を削除
    template = template.replace(needSupportRegex, '');
  }

  // プレースホルダーを値で置換
  const variables = {
    mood: payload.mood || 3,
    stress_level: payload.stress_level || 3,
    has_blocker: payload.has_blocker ? 'あり' : 'なし',
    blocker_details: payload.blocker_details || '',
    need_support: payload.need_support ? 'あり' : 'なし',
    support_details: payload.support_details || '',
    'recent_activity.avg_activity_score': payload.recent_activity?.avg_activity_score?.toFixed(1) || '0.0',
    'recent_activity.total_logs': payload.recent_activity?.total_logs || 0
  };

  const prompt = fillTemplate(template, variables);
  logger.info('メンタルヘルスアドバイス生成リクエスト - mood:', payload.mood, 'stress:', payload.stress_level);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * 進捗改善提案を生成
 * @param {Object} payload - タスクと進捗情報
 * @returns {Promise<Object>} AI提案（JSON）
 */
async function generateProgressSuggestion(payload) {
  const template = loadPrompt('progress-suggestion');

  const variables = {
    task_name: payload.task_name || '',
    assignee_name: payload.assignee_name || '未割当',
    status: payload.status || 'unknown',
    priority: payload.priority || 'medium',
    current_progress: payload.current_progress || 0,
    estimated_hours: payload.estimated_hours || 0,
    actual_hours: payload.actual_hours || 0,
    start_date: payload.start_date || '未設定',
    due_date: payload.due_date || '未設定',
    predicted_completion_date: payload.predicted_completion_date || '計算中',
    completion_probability: payload.completion_probability || 0,
    risk_level: payload.risk_level || 'unknown',
    is_on_track: payload.is_on_track ? '予定通り' : '遅延',
    avg_activity_score: payload.avg_activity_score?.toFixed(1) || '0.0',
    total_work_hours: payload.total_work_hours?.toFixed(1) || '0.0',
    daily_progress_rate: payload.daily_progress_rate?.toFixed(2) || '0.00',
    recent_activity_logs: payload.recent_activity_logs || 0,
    recent_mood: payload.recent_mood || '不明',
    stress_level: payload.stress_level || '不明',
    has_blocker: payload.has_blocker ? 'あり' : 'なし'
  };

  const prompt = fillTemplate(template, variables);
  logger.info('進捗改善提案生成リクエスト - task:', payload.task_name, 'progress:', payload.current_progress);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * 納期予測分析を生成
 * @param {Object} payload - プロジェクトと進捗情報
 * @returns {Promise<Object>} 納期分析（JSON）
 */
async function analyzeDeadlinePrediction(payload) {
  const template = loadPrompt('deadline-prediction');

  const variables = {
    project_name: payload.project_name || '',
    project_deadline: payload.project_deadline || '未設定',
    current_date: new Date().toISOString().split('T')[0],
    days_remaining: payload.days_remaining || 0,
    total_tasks: payload.total_tasks || 0,
    completed_tasks: payload.completed_tasks || 0,
    in_progress_tasks: payload.in_progress_tasks || 0,
    todo_tasks: payload.todo_tasks || 0,
    avg_progress: payload.avg_progress?.toFixed(1) || '0.0',
    high_risk_tasks: payload.high_risk_tasks || 0,
    medium_risk_tasks: payload.medium_risk_tasks || 0,
    low_risk_tasks: payload.low_risk_tasks || 0,
    delayed_tasks: payload.delayed_tasks || 0,
    critical_path_info: payload.critical_path_info || '情報なし',
    team_size: payload.team_size || 0,
    team_avg_activity: payload.team_avg_activity?.toFixed(1) || '0.0',
    mental_health_concerns: payload.mental_health_concerns || 0
  };

  const prompt = fillTemplate(template, variables);
  logger.info('納期予測分析リクエスト - project:', payload.project_name, 'deadline:', payload.project_deadline);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * プロジェクト健全性スコア計算（AI分析）
 * @param {Object} payload - プロジェクトメトリクス情報
 * @returns {Promise<Object>} 健全性スコアと分析（JSON）
 */
async function calculateProjectHealthScoreAI(payload) {
  const template = loadPrompt('project-health-score');

  const variables = {
    projectName: payload.projectName || '',
    startDate: payload.startDate || '',
    deadline: payload.deadline || '',
    currentProgress: payload.currentProgress || 0,
    status: payload.status || 'active',
    totalTasks: payload.totalTasks || 0,
    completedTasks: payload.completedTasks || 0,
    inProgressTasks: payload.inProgressTasks || 0,
    notStartedTasks: payload.notStartedTasks || 0,
    delayedTasks: payload.delayedTasks || 0,
    blockedTasks: payload.blockedTasks || 0,
    teamSize: payload.teamSize || 0,
    avgWorkHours: payload.avgWorkHours?.toFixed(1) || '0.0',
    avgActivityScore: payload.avgActivityScore?.toFixed(1) || '0.0',
    avgMood: payload.avgMood?.toFixed(1) || '0.0',
    avgStress: payload.avgStress?.toFixed(1) || '0.0',
    dailyProgressRate: payload.dailyProgressRate?.toFixed(2) || '0.00',
    predictedCompletionDate: payload.predictedCompletionDate || '未算出',
    daysUntilDeadline: payload.daysUntilDeadline || 0
  };

  const prompt = fillTemplate(template, variables);
  logger.info('プロジェクト健全性スコア分析リクエスト - project:', payload.projectName);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * クリティカルパス分析（AI）
 * @param {Object} payload - タスク依存関係情報
 * @returns {Promise<Object>} クリティカルパス分析（JSON）
 */
async function analyzeCriticalPathAI(payload) {
  const template = loadPrompt('critical-path-analysis');

  // タスクリストを整形
  let tasksText = '';
  if (payload.tasks && Array.isArray(payload.tasks)) {
    tasksText = payload.tasks.map((task, index) => {
      return `\n### タスク${index + 1}: ${task.name}
- タスクID: ${task.id}
- 担当者: ${task.assignedTo || '未割当'}
- 予定工数: ${task.estimatedHours || 0}時間
- 進捗: ${task.progress || 0}%
- ステータス: ${task.status || 'pending'}
- 開始日: ${task.startDate || '未設定'}
- 期限: ${task.dueDate || '未設定'}
- 依存先タスク: ${task.dependencies || 'なし'}
- ブロック中のタスク: ${task.blockedTasks || 'なし'}
- 優先度: ${task.priority || 'medium'}`;
    }).join('\n');
  }

  // {{#each}} ブロックを削除してタスクテキストに置き換え
  let processedTemplate = template.replace(
    /\{\{#each tasks\}\}[\s\S]*?\{\{\/each\}\}/g,
    tasksText
  );

  const variables = {
    projectName: payload.projectName || '',
    deadline: payload.deadline || '',
    currentDate: new Date().toISOString().split('T')[0],
    remainingDays: payload.remainingDays || 0
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('クリティカルパス分析リクエスト - project:', payload.projectName, 'tasks:', payload.tasks?.length || 0);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * チーム作業負荷評価（AI）
 * @param {Object} payload - チームメンバー負荷情報
 * @returns {Promise<Object>} 作業負荷評価（JSON）
 */
async function assessTeamWorkloadAI(payload) {
  const template = loadPrompt('team-workload-assessment');

  // メンバー情報を整形
  let membersText = '';
  if (payload.members && Array.isArray(payload.members)) {
    membersText = payload.members.map((member) => {
      let tasksText = '';
      if (member.tasks && Array.isArray(member.tasks)) {
        tasksText = member.tasks.map(task =>
          `- ${task.taskName} (${task.priority}) - 進捗${task.progress}% - 工数${task.estimatedHours}h`
        ).join('\n');
      }

      return `\n### ${member.fullName} (@${member.username})
- 割り当てタスク数: ${member.assignedTaskCount || 0}
- 進行中タスク数: ${member.inProgressTaskCount || 0}
- 完了タスク数: ${member.completedTaskCount || 0}
- 総予定工数: ${member.totalEstimatedHours || 0}時間
- 平均進捗率: ${member.avgProgress || 0}%
- 平均アクティビティスコア: ${member.avgActivityScore?.toFixed(1) || '0.0'}
- 直近の気分: ${member.recentMood || 'N/A'} (1-5)
- 直近のストレス: ${member.recentStress || 'N/A'} (1-5)
- スキルタグ: ${member.skills || 'なし'}

### タスク詳細
${tasksText || 'タスクなし'}`;
    }).join('\n');
  }

  // {{#each}} ブロックを削除してメンバーテキストに置き換え
  let processedTemplate = template.replace(
    /\{\{#each members\}\}[\s\S]*?\{\{\/each\}\}/g,
    membersText
  );

  const variables = {
    projectName: payload.projectName || '',
    teamSize: payload.teamSize || 0,
    projectDuration: payload.projectDuration || 0
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('チーム作業負荷評価リクエスト - project:', payload.projectName, 'members:', payload.members?.length || 0);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * スプリント目標達成可能性分析（AI）
 * @param {Object} payload - スプリント情報
 * @returns {Promise<Object>} 達成可能性分析（JSON）
 */
async function analyzeSprintGoalAI(payload) {
  let template = loadPrompt('sprint-goal-analysis');

  // タスクリストを整形
  let tasksText = '';
  if (payload.tasks && Array.isArray(payload.tasks)) {
    tasksText = payload.tasks.map(task =>
      `- ${task.name} (${task.storyPoints || 0}pt) - ${task.status} - 担当: ${task.assignedTo || '未割当'} - 進捗${task.progress || 0}%`
    ).join('\n');
  }

  // 過去スプリント実績を整形
  let pastSprintsText = '';
  if (payload.pastSprints && Array.isArray(payload.pastSprints) && payload.pastSprints.length > 0) {
    pastSprintsText = payload.pastSprints.map(sprint =>
      `- Sprint ${sprint.number}: 目標${sprint.targetPoints}pt → 実績${sprint.completedPoints}pt (達成率${sprint.achievementRate}%)`
    ).join('\n');
  }

  // {{#each}} と {{#if}} ブロックを処理
  let processedTemplate = template
    .replace(/\{\{#each tasks\}\}[\s\S]*?\{\{\/each\}\}/g, tasksText)
    .replace(/\{\{#if pastSprints\}\}[\s\S]*?\{\{\/if\}\}/g, pastSprintsText ? `## 過去スプリント実績（参考）\n${pastSprintsText}` : '');

  // {{#each}} が pastSprints の中にもあるので、もう一度処理
  if (pastSprintsText) {
    processedTemplate = processedTemplate.replace(/\{\{#each pastSprints\}\}[\s\S]*?\{\{\/each\}\}/g, pastSprintsText);
  }

  const variables = {
    sprintName: payload.sprintName || '',
    sprintNumber: payload.sprintNumber || 0,
    startDate: payload.startDate || '',
    endDate: payload.endDate || '',
    remainingDays: payload.remainingDays || 0,
    elapsedDays: payload.elapsedDays || 0,
    totalDays: payload.totalDays || 0,
    goalDescription: payload.goalDescription || '',
    targetStoryPoints: payload.targetStoryPoints || 0,
    targetTaskCount: payload.targetTaskCount || 0,
    completedStoryPoints: payload.completedStoryPoints || 0,
    completedTaskCount: payload.completedTaskCount || 0,
    inProgressStoryPoints: payload.inProgressStoryPoints || 0,
    inProgressTaskCount: payload.inProgressTaskCount || 0,
    remainingStoryPoints: payload.remainingStoryPoints || 0,
    remainingTaskCount: payload.remainingTaskCount || 0,
    teamSize: payload.teamSize || 0,
    avgDailyVelocity: payload.avgDailyVelocity?.toFixed(2) || '0.00',
    currentMomentum: payload.currentMomentum || 'unknown',
    avgActivityScore: payload.avgActivityScore?.toFixed(1) || '0.0',
    avgMood: payload.avgMood?.toFixed(1) || '0.0',
    avgStress: payload.avgStress?.toFixed(1) || '0.0'
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('スプリント目標分析リクエスト - sprint:', payload.sprintName);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * チーム貢献度分析（AI）
 * @param {Object} payload - スプリント期間中のメンバー実績
 * @returns {Promise<Object>} 貢献度分析（JSON）
 */
async function analyzeTeamContributionAI(payload) {
  let template = loadPrompt('team-contribution-analysis');

  // メンバー情報を整形
  let membersText = '';
  if (payload.members && Array.isArray(payload.members)) {
    membersText = payload.members.map((member) => {
      let completedTasksText = '';
      if (member.completedTasksList && Array.isArray(member.completedTasksList)) {
        completedTasksText = member.completedTasksList.map(task =>
          `- ${task.taskName} (${task.storyPoints || 0}pt) - 完了日: ${task.completedDate || '不明'}`
        ).join('\n');
      }

      return `\n### ${member.fullName} (@${member.username})
- 完了タスク数: ${member.completedTasks || 0}
- 完了ストーリーポイント: ${member.completedStoryPoints || 0}
- 総作業時間: ${member.totalWorkHours || 0}時間
- 平均タスク完了時間: ${member.avgTaskCompletionTime || 0}時間
- 再オープンされたタスク: ${member.reopenedTasks || 0}
- ブロックされたタスク: ${member.blockedTasks || 0}
- 平均アクティビティスコア: ${member.avgActivityScore?.toFixed(1) || '0.0'}
- 平均気分: ${member.avgMood?.toFixed(1) || '0.0'}
- 平均ストレス: ${member.avgStress?.toFixed(1) || '0.0'}

### 完了タスク詳細
${completedTasksText || 'なし'}`;
    }).join('\n');
  }

  // {{#each}} ブロックを処理
  let processedTemplate = template.replace(/\{\{#each members\}\}[\s\S]*?\{\{\/each\}\}/g, membersText);

  const variables = {
    sprintName: payload.sprintName || '',
    startDate: payload.startDate || '',
    endDate: payload.endDate || '',
    totalDays: payload.totalDays || 0,
    targetStoryPoints: payload.targetStoryPoints || 0,
    totalCompletedPoints: payload.totalCompletedPoints || 0,
    totalCompletedTasks: payload.totalCompletedTasks || 0,
    teamVelocity: payload.teamVelocity?.toFixed(2) || '0.00'
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('チーム貢献度分析リクエスト - sprint:', payload.sprintName, 'members:', payload.members?.length || 0);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * ヘルプリクエストコンテキスト生成（AI）
 * @param {Object} payload - タスクと作業履歴情報
 * @returns {Promise<Object>} コンテキスト要約（JSON）
 */
async function generateHelpRequestContextAI(payload) {
  let template = loadPrompt('help-request-context-summary');

  // 依存関係を整形
  let dependenciesText = '';
  if (payload.dependencies && Array.isArray(payload.dependencies) && payload.dependencies.length > 0) {
    dependenciesText = payload.dependencies.map(dep =>
      `- ${dep.name} (${dep.status}) - 担当: ${dep.assignedTo || '未割当'}`
    ).join('\n');
  }

  let blockedTasksText = '';
  if (payload.blockedTasks && Array.isArray(payload.blockedTasks) && payload.blockedTasks.length > 0) {
    blockedTasksText = payload.blockedTasks.map(task =>
      `- ${task.name} - 担当: ${task.assignedTo || '未割当'}`
    ).join('\n');
  }

  // 作業ログを整形
  let workLogsText = '';
  if (payload.workLogs && Array.isArray(payload.workLogs)) {
    workLogsText = payload.workLogs.map(log => {
      let blockerInfo = log.blocker ? `\n- ブロッカー: ${log.blocker}` : '';
      return `\n### ${log.date}
- 作業時間: ${log.hours}時間
- 内容: ${log.description || '記録なし'}
- 進捗変化: ${log.progressChange || 0}%
- 気分: ${log.mood || 'N/A'} / ストレス: ${log.stress || 'N/A'}${blockerInfo}`;
    }).join('\n');
  }

  // コメントを整形
  let commentsText = '';
  if (payload.comments && Array.isArray(payload.comments) && payload.comments.length > 0) {
    commentsText = payload.comments.map(comment =>
      `- [${comment.createdAt}] ${comment.authorName}: ${comment.content}`
    ).join('\n');
  }

  // {{#if}} と {{#each}} ブロックを処理
  let processedTemplate = template
    .replace(/\{\{#if dependencies\}\}[\s\S]*?\{\{\/if\}\}/g, dependenciesText ? `## 依存関係\n### 依存先タスク\n${dependenciesText}` : '')
    .replace(/\{\{#if blockedTasks\}\}[\s\S]*?\{\{\/if\}\}/g, blockedTasksText ? `### このタスクがブロックしているタスク\n${blockedTasksText}` : '')
    .replace(/\{\{#each workLogs\}\}[\s\S]*?\{\{\/each\}\}/g, workLogsText)
    .replace(/\{\{#if comments\}\}[\s\S]*?\{\{\/if\}\}/g, commentsText ? `## 最近のコメント\n${commentsText}` : '');

  const variables = {
    taskName: payload.taskName || '',
    taskId: payload.taskId || 0,
    projectName: payload.projectName || '',
    assignedTo: payload.assignedTo || '未割当',
    startDate: payload.startDate || '未設定',
    dueDate: payload.dueDate || '未設定',
    progress: payload.progress || 0,
    status: payload.status || 'unknown',
    priority: payload.priority || 'medium',
    description: payload.description || '',
    tags: payload.tags || '',
    totalActivityHours: payload.totalActivityHours || 0,
    avgActivityScore: payload.avgActivityScore?.toFixed(1) || '0.0',
    activityTrend: payload.activityTrend || 'unknown',
    requestTitle: payload.requestTitle || '',
    requestDescription: payload.requestDescription || '',
    urgency: payload.urgency || 'medium'
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('ヘルプリクエストコンテキスト生成リクエスト - task:', payload.taskName);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * ヘルパー推奨生成（AI）
 * @param {Object} payload - ヘルプリクエストと候補者情報
 * @returns {Promise<Object>} ヘルパー推奨（JSON）
 */
async function suggestHelpersAI(payload) {
  let template = loadPrompt('help-request-helper-suggestion');

  // 候補者情報を整形
  let candidatesText = '';
  if (payload.candidates && Array.isArray(payload.candidates)) {
    candidatesText = payload.candidates.map((candidate) => {
      let relatedTasksText = '';
      if (candidate.relatedTasks && Array.isArray(candidate.relatedTasks) && candidate.relatedTasks.length > 0) {
        relatedTasksText = `\n#### 関連経験\n以下の類似タスク経験あり:\n` +
          candidate.relatedTasks.map(task =>
            `- ${task.taskName} (${task.completionDate}) - ${task.outcome}`
          ).join('\n');
      }

      return `\n### ${candidate.fullName} (@${candidate.username})
- ユーザーID: ${candidate.id}
- ロール: ${candidate.role || '不明'}
- スキルタグ: ${candidate.skills || 'なし'}
- 経験年数: ${candidate.experienceYears || 0}年

#### 現在の作業負荷
- 進行中タスク数: ${candidate.inProgressTaskCount || 0}
- 総予定工数: ${candidate.totalEstimatedHours || 0}時間
- 今週の作業時間: ${candidate.weeklyWorkHours || 0}時間

#### 最近のアクティビティ（過去7日間）
- 平均アクティビティスコア: ${candidate.avgActivityScore?.toFixed(1) || '0.0'}
- 総作業時間: ${candidate.totalWorkHours || 0}時間
- 平均気分: ${candidate.avgMood?.toFixed(1) || 'N/A'}
- 平均ストレス: ${candidate.avgStress?.toFixed(1) || 'N/A'}

#### 過去の実績
- 完了タスク数（過去30日）: ${candidate.recentCompletedTasks || 0}
- 平均タスク完了時間: ${candidate.avgTaskCompletionTime || 0}時間
- ヘルプ提供実績: ${candidate.helpProvidedCount || 0}回
- ヘルプ成功率: ${candidate.helpSuccessRate || 0}%
${relatedTasksText}`;
    }).join('\n');
  }

  // {{#each}} ブロックを処理
  let processedTemplate = template.replace(/\{\{#each candidates\}\}[\s\S]*?\{\{\/each\}\}/g, candidatesText);

  const variables = {
    requestId: payload.requestId || 0,
    taskName: payload.taskName || '',
    requesterName: payload.requesterName || '',
    requesterUsername: payload.requesterUsername || '',
    problemType: payload.problemType || 'other',
    urgency: payload.urgency || 'medium',
    contextSummary: payload.contextSummary || '',
    requiredSkills: payload.requiredSkills || 'なし',
    estimatedHelpDuration: payload.estimatedHelpDuration || '不明',
    technicalArea: payload.technicalArea || '不明'
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('ヘルパー推奨生成リクエスト - request:', payload.requestId, 'candidates:', payload.candidates?.length || 0);

  try {
    const result = await callAI(prompt, { responseFormat: 'json' });
    const normalizedHelpers = normalizeHelperSuggestions(result?.suggestedHelpers, payload.candidates, payload);

    // Validate result structure
    if (normalizedHelpers.length > 0) {
      return {
        ...result,
        suggestedHelpers: normalizedHelpers
      };
    }

    // Fallback if result is valid but empty (or stub)
    // Stub usually returns { stub: true } which doesn't have suggestedHelpers
    logger.info('AI応答がスタブまたは空のため、フォールバック（候補者ベースの簡易推奨）を使用します。');
    return generateFallbackSuggestions(payload.candidates);

  } catch (error) {
    logger.warn(`ヘルパー推奨生成エラー: ${error.message}。フォールバックを使用します。`);
    return generateFallbackSuggestions(payload.candidates);
  }
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clampScore(value) {
  const num = toFiniteNumber(value);
  if (num === null) {
    return null;
  }
  return Math.max(0, Math.min(100, num));
}

function normalizeSkillToken(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/\(lv\d+\)/g, '')
    .replace(/[^\wぁ-んァ-ヶ一-龯+#.-]/g, '')
    .trim();
}

function extractCandidateSkillTokens(skillsText) {
  const raw = String(skillsText || '');
  return [...new Set(
    raw
      .split(/[,\n、]/)
      .map((part) => normalizeSkillToken(part))
      .filter((part) => part && part !== 'スキル情報なし')
  )];
}

function estimateSkillScore(candidate, payload = {}) {
  const requiredText = [
    payload.requiredSkills,
    payload.technicalArea,
    payload.taskName,
    payload.contextSummary,
    payload.requestTitle,
    payload.requestDescription
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const skillTokens = extractCandidateSkillTokens(candidate?.skills);
  if (skillTokens.length === 0) {
    return 55;
  }

  const overlapCount = skillTokens
    .filter((token) => token.length >= 2 && requiredText.includes(token))
    .length;

  let score = 58 + Math.min(skillTokens.length, 6) * 3 + Math.min(overlapCount, 3) * 12;
  if (!requiredText) {
    score += 6;
  }
  return clampScore(score) ?? 55;
}

function estimateAvailabilityScore(candidate) {
  const taskCount = toFiniteNumber(candidate?.inProgressTaskCount) ?? 0;
  const weeklyHours = toFiniteNumber(candidate?.weeklyWorkHours) ?? 0;
  const avgActivity = toFiniteNumber(candidate?.avgActivityScore) ?? 0;
  const avgStress = toFiniteNumber(candidate?.avgStress);
  const avgMood = toFiniteNumber(candidate?.avgMood);

  let score = 100
    - (taskCount * 12)
    - (Math.max(0, weeklyHours - 25) * 1.2);

  if (avgActivity >= 85) {
    score -= 10;
  } else if (avgActivity > 0 && avgActivity < 50) {
    score += 5;
  }

  if (avgStress !== null && avgStress >= 4) {
    score -= 20;
  }
  if (avgMood !== null && avgMood <= 2) {
    score -= 10;
  }

  return clampScore(score) ?? 60;
}

function estimateExperienceScore(candidate) {
  const recentCompletedTasks = toFiniteNumber(candidate?.recentCompletedTasks) ?? 0;
  const hasSkillInfo = String(candidate?.skills || '').trim() && String(candidate?.skills || '').includes('なし') === false;

  let score = 45 + Math.min(recentCompletedTasks * 10, 35);
  if (hasSkillInfo) {
    score += 10;
  }

  return clampScore(score) ?? 55;
}

function buildCandidateBasedScores(candidate, payload = {}) {
  const skillMatchScore = estimateSkillScore(candidate, payload);
  const availabilityScore = estimateAvailabilityScore(candidate);
  const experienceScore = estimateExperienceScore(candidate);
  const totalMatchScore = Math.round(
    ((skillMatchScore * 0.45) + (availabilityScore * 0.35) + (experienceScore * 0.20)) * 10
  ) / 10;

  return {
    skillMatchScore,
    availabilityScore,
    experienceScore,
    totalMatchScore
  };
}

function rescoreSuggestionsIfUniform(normalizedSuggestions, candidateById, payload = {}) {
  if (!Array.isArray(normalizedSuggestions) || normalizedSuggestions.length < 2) {
    return normalizedSuggestions;
  }

  const totals = normalizedSuggestions.map((s) => toFiniteNumber(s?.matchScores?.totalMatchScore ?? s?.totalMatchScore) ?? 0);
  const first = totals[0];
  const allSameScore = totals.every((v) => Math.abs(v - first) < 0.01);

  if (!allSameScore) {
    return normalizedSuggestions;
  }

  const rescored = normalizedSuggestions.map((s) => {
    const candidate = candidateById.get(Number(s.userId));
    if (!candidate) {
      return s;
    }

    const scores = buildCandidateBasedScores(candidate, payload);
    return {
      ...s,
      matchScores: scores,
      skillMatchScore: scores.skillMatchScore,
      availabilityScore: scores.availabilityScore,
      experienceScore: scores.experienceScore,
      totalMatchScore: scores.totalMatchScore
    };
  });

  rescored.sort((a, b) => {
    const totalDiff = (b.matchScores?.totalMatchScore ?? 0) - (a.matchScores?.totalMatchScore ?? 0);
    if (totalDiff !== 0) return totalDiff;
    const availabilityDiff = (b.matchScores?.availabilityScore ?? 0) - (a.matchScores?.availabilityScore ?? 0);
    if (availabilityDiff !== 0) return availabilityDiff;
    return (a.userId ?? 0) - (b.userId ?? 0);
  });

  return rescored.map((s, index) => ({
    ...s,
    suggestionRank: index + 1
  }));
}

function normalizeHelperSuggestions(rawSuggestions, candidates = [], payload = {}) {
  if (!Array.isArray(rawSuggestions) || rawSuggestions.length === 0) {
    return [];
  }

  const candidateById = new Map(
    (Array.isArray(candidates) ? candidates : [])
      .filter((c) => c && c.id !== undefined && c.id !== null)
      .map((c) => [Number(c.id), c])
  );

  const normalized = rawSuggestions
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        return null;
      }

      const userId = toFiniteNumber(raw.userId ?? raw.memberId ?? raw.id);
      if (userId === null) {
        return null;
      }

      const candidate = candidateById.get(Number(userId));
      const scoreSource = raw.matchScores || {};

      const skillMatchScore = clampScore(
        scoreSource.skillMatchScore
        ?? scoreSource.skill_match_score
        ?? raw.skillMatchScore
        ?? raw.skill_match_score
        ?? raw.skillMatch
      );
      const availabilityScore = clampScore(
        scoreSource.availabilityScore
        ?? scoreSource.availability_score
        ?? raw.availabilityScore
        ?? raw.availability_score
        ?? raw.availability
      );
      const experienceScore = clampScore(
        scoreSource.experienceScore
        ?? scoreSource.experience_score
        ?? raw.experienceScore
        ?? raw.experience_score
        ?? raw.experience
      );
      let totalMatchScore = clampScore(
        scoreSource.totalMatchScore
        ?? scoreSource.total_match_score
        ?? raw.totalMatchScore
        ?? raw.total_match_score
        ?? raw.overallScore
      );

      if (totalMatchScore === null) {
        const weighted = ((skillMatchScore ?? 0) * 0.45)
          + ((availabilityScore ?? 0) * 0.35)
          + ((experienceScore ?? 0) * 0.20);
        totalMatchScore = Math.round(weighted * 10) / 10;
      }

      return {
        userId: Number(userId),
        fullName: raw.fullName || raw.memberName || candidate?.fullName || candidate?.username || '',
        username: raw.username || candidate?.username || '',
        matchScores: {
          skillMatchScore: skillMatchScore ?? 0,
          availabilityScore: availabilityScore ?? 0,
          experienceScore: experienceScore ?? 0,
          totalMatchScore: totalMatchScore ?? 0
        },
        // Keep top-level score fields for backward compatibility.
        skillMatchScore: skillMatchScore ?? 0,
        availabilityScore: availabilityScore ?? 0,
        experienceScore: experienceScore ?? 0,
        totalMatchScore: totalMatchScore ?? 0,
        suggestionRank: Number(raw.suggestionRank) || (index + 1),
        reasoning: raw.reasoning || raw.reason || '',
        recommendedApproach: raw.recommendedApproach || raw.recommendation || '',
        strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
        potentialConcerns: Array.isArray(raw.potentialConcerns) ? raw.potentialConcerns : [],
        recommendationLevel: raw.recommendationLevel || 'recommended'
      };
    })
    .filter(Boolean);

  return rescoreSuggestionsIfUniform(normalized, candidateById, payload);
}

function generateFallbackSuggestions(candidates) {
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return { suggestedHelpers: [] };
  }

  // Simple heuristic: sort by workload (ascending) and return top 3
  // Assuming candidates have 'inProgressTaskCount' or similar
  const sorted = [...candidates].sort((a, b) => (a.inProgressTaskCount || 0) - (b.inProgressTaskCount || 0));
  const topCandidates = sorted.slice(0, 3);

  const suggestions = topCandidates.map((c, index) => {
    const skillMatchScore = 70; // dummy
    const availabilityScore = 80 - (index * 10); // dummy descending
    const experienceScore = 60; // dummy
    const totalMatchScore = 75 - (index * 5);

    return {
      userId: c.id,
      fullName: c.fullName || c.username,
      username: c.username,
      reasoning: '現在の作業負荷が比較的低く、対応可能と判断されます。',
      recommendedApproach: 'チャットで状況を確認し、空き時間に相談を依頼してください。',
      suggestionRank: index + 1,
      matchScores: {
        skillMatchScore,
        availabilityScore,
        experienceScore,
        totalMatchScore
      },
      skillMatchScore,
      availabilityScore,
      experienceScore,
      totalMatchScore
    };
  });

  return { suggestedHelpers: suggestions };
}

/**
 * ヘルプリクエストの推敲（AI）
 * @param {Object} payload - 現在の入力内容とタスク情報
 * @returns {Promise<Object>} 推敲結果（JSON）
 */
async function refineHelpRequestTextAI(payload) {
  let template = loadPrompt('help-request-refinement');

  // 作業ログを整形
  let workLogsText = '';
  if (payload.workLogs && Array.isArray(payload.workLogs)) {
    workLogsText = payload.workLogs.map(log => {
      return `  - [${log.date}] ${log.hours}h: ${log.description || '記録なし'} (進捗: ${log.progressChange || 0}%)`;
    }).join('\n');
  }

  // {{#each}} ブロックを処理
  let processedTemplate = template.replace(/\{\{#each workLogs\}\}[\s\S]*?\{\{\/each\}\}/g, workLogsText);

  const variables = {
    requestTitle: payload.requestTitle || '',
    requestDescription: payload.requestDescription || '',
    taskName: payload.taskName || '',
    contextSummary: payload.contextSummary || payload.aiContextSummary || '', // 既存のAI分析があれば参考にする
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('ヘルプリクエスト推敲リクエスト - title:', payload.requestTitle);

  try {
    return await callAI(prompt, { responseFormat: 'json' });
  } catch (error) {
    logger.warn(`ヘルプリクエスト推敲エラー: ${error.message}`);
    // エラー時は入力をそのまま返す
    return {
      contextSummary: payload.requestDescription,
      refinedTitle: payload.requestTitle,
      improvementPoints: []
    };
  }
}

/**
 * ヘルプ問題検出（AI）
 * @param {Object} payload - タスク状況情報
 * @returns {Promise<Object>} 問題検出結果（JSON）
 */
async function detectHelpProblemsAI(payload) {
  let template = loadPrompt('help-problem-detection');

  // 作業ログを整形
  let workLogsText = '';
  if (payload.recentWorkLogs && Array.isArray(payload.recentWorkLogs)) {
    workLogsText = payload.recentWorkLogs.map(log => {
      let blockerInfo = log.blocker ? `\n  ブロッカー: ${log.blocker}` : '';
      return `- [${log.date}] ${log.hours}時間 - 進捗: ${log.progressBefore}% → ${log.progressAfter}%
  内容: ${log.description || '記録なし'}
  気分: ${log.mood || 'N/A'}, ストレス: ${log.stress || 'N/A'}${blockerInfo}`;
    }).join('\n');
  }

  // 現在のブロッカーを整形
  let blockersText = '';
  if (payload.currentBlockers && Array.isArray(payload.currentBlockers) && payload.currentBlockers.length > 0) {
    blockersText = `## ブロッカー情報\n現在のブロッカー:\n` +
      payload.currentBlockers.map(blocker =>
        `- ${blocker.description} (報告日: ${blocker.reportedDate}, 継続日数: ${blocker.duration}日)`
      ).join('\n');
  }

  // 依存関係を整形
  let dependenciesText = '';
  if (payload.dependencies && Array.isArray(payload.dependencies) && payload.dependencies.length > 0) {
    dependenciesText = `## 依存関係\n依存先タスク:\n` +
      payload.dependencies.map(dep =>
        `- ${dep.name} (${dep.status}) - 進捗: ${dep.progress}%`
      ).join('\n');
  }

  // {{#if}} ブロックを処理
  let processedTemplate = template
    .replace(/\{\{#if currentBlockers\}\}[\s\S]*?\{\{\/if\}\}/g, blockersText)
    .replace(/\{\{#if dependencies\}\}[\s\S]*?\{\{\/if\}\}/g, dependenciesText)
    .replace(/\{\{#each recentWorkLogs\}\}[\s\S]*?\{\{\/each\}\}/g, workLogsText);

  const variables = {
    taskName: payload.taskName || '',
    taskId: payload.taskId || 0,
    assignedTo: payload.assignedTo || '未割当',
    startDate: payload.startDate || '未設定',
    dueDate: payload.dueDate || '未設定',
    progress: payload.progress || 0,
    status: payload.status || 'unknown',
    priority: payload.priority || 'medium',
    elapsedDays: payload.elapsedDays || 0,
    remainingDays: payload.remainingDays || 0,
    expectedProgress: payload.expectedProgress || 0,
    progressGap: payload.progressGap || 0,
    totalWorkHours: payload.totalWorkHours || 0,
    avgActivityScore: payload.avgActivityScore?.toFixed(1) || '0.0',
    activityTrend: payload.activityTrend || 'unknown',
    lastActivityDate: payload.lastActivityDate || '不明',
    totalWorkLogs: payload.totalWorkLogs || 0,
    avgWorkHours: payload.avgWorkHours || 0,
    progressUpdateFrequency: payload.progressUpdateFrequency || 'rare',
    recentAvgMood: payload.recentAvgMood?.toFixed(1) || '0.0',
    recentAvgStress: payload.recentAvgStress?.toFixed(1) || '0.0',
    moodTrend: payload.moodTrend || 'stable',
    stressTrend: payload.stressTrend || 'stable'
  };

  const prompt = fillTemplate(processedTemplate, variables);
  logger.info('ヘルプ問題検出リクエスト - task:', payload.taskName);
  return callAI(prompt, { responseFormat: 'json' });
}

/**
 * 時間単位活動データをAI分析する（desktop-app AI監視機能用）
 * @param {number} summaryId - HourlyActivitySummaryのID
 * @returns {Promise<object>} AI分析結果
 */
async function analyzeHourlyActivity(summaryId) {
  const knex = db.getKnex();

  try {
    // 1. データベースから hourly_activity_summary を取得
    const summary = await knex('hourly_activity_summary')
      .where('summary_id', summaryId)
      .first();

    if (!summary) {
      throw new Error(`HourlyActivitySummary not found: ${summaryId}`);
    }

    // 2. top_windows を JSON パース
    let topWindows = [];
    try {
      topWindows = JSON.parse(summary.top_windows || '[]');
    } catch (e) {
      logger.warn('top_windows JSON parse failed:', e.message);
    }

    // 3. トップウィンドウをテキスト化
    const windowsText = topWindows
      .map((w, i) => `${i + 1}. ${w.WindowTitle} (${w.ProcessName}) - ${w.DurationSeconds}秒`)
      .join('\n');

    // 4. プロンプトテンプレートをロード
    const template = loadPrompt('hourly-activity-analysis');

    // 5. 変数を設定
    const variables = {
      hourStart: summary.hour_start,
      hourEnd: summary.hour_end,
      mouseClicks: summary.mouse_clicks,
      keyPresses: summary.key_presses,
      mouseWheelScrolls: summary.mouse_wheel_scrolls,
      totalActiveSeconds: summary.total_active_seconds,
      topWindows: windowsText || 'なし',
      fileChangesCount: summary.file_changes_count,
      linesAdded: summary.lines_added,
      linesRemoved: summary.lines_removed,
      avgCpuUsage: summary.avg_cpu_usage?.toFixed(1) || '0.0',
      avgMemoryMb: summary.avg_memory_mb || 0,
      activityIntensity: summary.activity_intensity || 'low'
    };

    // 6. プロンプトを生成
    const prompt = fillTemplate(template, variables);

    // 7. AI に分析を依頼（JSON形式で返す）
    logger.info(`時間単位活動分析リクエスト - summaryId: ${summaryId}`);
    const aiResult = await callAI(prompt, { responseFormat: 'json' });

    // 8. AI分析結果をデータベースに保存
    await knex('hourly_activity_summary')
      .where('summary_id', summaryId)
      .update({
        ai_analysis_result: JSON.stringify(aiResult),
        ai_analysis_status: 'completed'
      });

    logger.info(`時間単位活動分析完了 - summaryId: ${summaryId}`);
    return aiResult;
  } catch (error) {
    logger.error(`時間単位活動分析エラー (summaryId: ${summaryId}):`, error.message);

    // エラー状態を保存
    await knex('hourly_activity_summary')
      .where('summary_id', summaryId)
      .update({ ai_analysis_status: 'failed' });

    throw error;
  }
}

/**
 * AIによるプロジェクトアラート生成
 * @param {object} payload - プロジェクト情報
 * @returns {Promise<Array>} アラート配列
 */
async function generateProjectAlerts(payload) {
  const prompt = `あなたはプロジェクト管理の専門家です。必ず日本語で分析し、日本語でアラートを生成してください。

# プロジェクト情報
${payload.projectsJson}

# 指示
各プロジェクトについて、以下の観点からアラートを生成してください：
1. **スケジュール管理**: 終了日の遅延、期限切れ、残り日数が少ない
2. **プロジェクトステータス**: リスク状態、保留状態、進捗の遅れ
3. **データ品質**: 説明が空、必須情報の欠落
4. **リソース**: メンバーの負荷、割り当ての偏り

# 出力形式（JSON）
以下の形式でJSONを返してください。
{
  "alerts": [
    {
      "projectId": <プロジェクトID>,
      "projectName": "<プロジェクト名>",
      "severity": "<high|medium|low>",
      "category": "<schedule|status|data|resource>",
      "message": "<具体的な日本語のアラートメッセージ>"
    }
  ]
}

重要度の基準：
- high: 早急な対応が必要（遅延、リスク状態、期限切れなど）
- medium: 近い将来対応が必要（期限まで1週間以内、軽度の遅れなど）
- low: 改善推奨（データ品質、最適化の余地など）`;

  const result = await callAI(prompt, { responseFormat: 'json' });
  return result.alerts || [];
}

/**
 * 見積もり用AIチャット
 * @param {Object} options - チャットオプション
 * @param {string} options.systemPrompt - システムプロンプト
 * @param {Array} options.history - 会話履歴
 * @param {string} options.userMessage - ユーザーメッセージ
 * @returns {Promise<string>} AI応答
 */
async function chatWithAi({ systemPrompt, history, userMessage }) {
  try {
    // 設定サービスからAI API設定を取得
    const aiConfig = await settingsService.getAIConfig();

    if (providerNeedsApiKey(aiConfig.provider) && !aiConfig.apiKey) {
      logger.warn('AI API key が設定されていません。');
      return 'AIサービスは現在利用できません。環境変数または設定画面でAPIキーを設定してください。';
    }

    // プロキシエージェントを初期化
    if (!proxyAgent) {
      proxyAgent = await initializeProxyAgent();
    }

    // LLMアダプターを生成（温度は見積もり用に高めに設定）
    const adapter = LLMAdapterFactory.create(aiConfig.provider, {
      apiKey: aiConfig.apiKey,
      endpoint: aiConfig.endpoint,
      model: aiConfig.model,
      temperature: 0.7, // 見積もりは少し創造性を持たせる
      maxTokens: 4096,
      proxyAgent
    });

    logger.info(`チャット: provider=${aiConfig.provider}, model=${aiConfig.model}`);

    // アダプター経由でチャット
    const result = await adapter.chat({
      systemPrompt,
      history,
      userMessage
    });

    return result.message || result;
  } catch (error) {
    logger.error(`AI チャット中にエラーが発生しました: ${error.message}`);
    return 'AIサービス呼び出し中にエラーが発生しました。詳細はログを確認してください。';
  }
}

/**
 * WBSビルダーの最終段階で詳細情報を生成
 * @param {Object} payload - プロジェクト情報、WBS構造、チームメンバー
 * @returns {Promise<Object>} 詳細情報が追加されたWBS構造
 */
async function finalizeWbsBuilder(payload) {
  try {
    const { projectDetails, wbs, teamMembers } = payload;

    // プロジェクト情報の整形
    const project_name = projectDetails.projectName || '';
    const project_goal = projectDetails.goal || '';
    const main_deliverable = projectDetails.mainDeliverable || '';
    const milestone = projectDetails.milestone || '';
    const start_date = projectDetails.startDate || '';
    const end_date = projectDetails.endDate || '';
    const constraints = projectDetails.constraints || '';
    const projectStartDate = toWorkingDay(start_date, getTodayYmd()) || getTodayYmd();
    const projectEndDate = isValidDateString(end_date) ? end_date : '';
    const vacationRangeEnd =
      isValidDateString(projectEndDate) ? projectEndDate : addDays(projectStartDate, 365) || projectStartDate;

    const normalizedMembers = sanitizeTeamMembers(teamMembers).filter(
      (member) => member.id !== null && member.id !== undefined && Number.isFinite(Number(member.id))
    );

    // チームメンバー情報の整形
    let team_members_text = '';
    if (normalizedMembers.length > 0) {
      team_members_text = normalizedMembers.map(member => {
        return `- ${member.fullName} (ID: ${member.id}, ロール: ${member.role || '未設定'}): ${member.skillsText}`;
      }).join('\n');
    } else {
      team_members_text = '（メンバー情報なし）';
    }

    // 祝日情報を取得
    const holidaysText = dateCalculator.getHolidaysText();
    const vacationMemberIds = uniqueNumericIds(normalizedMembers.map((member) => member.id));
    const vacations = await fetchVacationsForSchedule(vacationMemberIds, projectStartDate, vacationRangeEnd);
    const vacationContext = buildVacationContext(vacations, normalizedMembers);
    const calendarOptions = createCalendarOptions(vacationContext);
    const vacationsText = formatVacationsForPrompt(vacations, normalizedMembers);

    // WBS構造をJSON文字列に変換
    const wbs_json = JSON.stringify(wbs, null, 2);

    // プロンプトテンプレートの読み込みと充填
    const template = loadPrompt('wbs-builder-finalize');
    const prompt = fillTemplate(template, {
      project_name,
      project_goal,
      main_deliverable,
      milestone,
      start_date,
      end_date,
      constraints,
      team_members: team_members_text,
      holidays: holidaysText,
      vacations: vacationsText,
      wbs_json
    });

    logger.info(`WBSビルダー詳細情報生成リクエスト: project=${project_name}`);

    // AI呼び出し（テキストモードで呼び出し、後でJSON解析する）
    const rawContent = await callAI(prompt, { responseFormat: 'text' });

    // テキストからJSONを解析
    const result = parseJsonFromText(rawContent, 'WBSビルダー詳細生成');

    if (!result || !result.tasks || !Array.isArray(result.tasks)) {
      throw new Error('AIが有効なタスクリストを生成できませんでした。');
    }

    normalizeBuilderTaskTree(result.tasks, normalizedMembers, projectStartDate);

    const coverageResult = ensureBuilderMemberCoverage(result.tasks, normalizedMembers, projectStartDate);
    if (coverageResult.reassignedTasks > 0 || coverageResult.addedTasks > 0) {
      logger.info(
        `WBSビルダー担当者補正を実行: 再割当=${coverageResult.reassignedTasks}件, 追加タスク=${coverageResult.addedTasks}件`
      );
    }
    if (coverageResult.coverage.uncoveredMembers.length > 0) {
      logger.warn(
        `WBSビルダー担当未割当メンバー: ${coverageResult.coverage.uncoveredMembers.join(', ')}`
      );
    }

    const scheduleResult = rebalanceBuilderLeafSchedule(
      result.tasks,
      projectStartDate,
      projectEndDate,
      calendarOptions
    );
    logger.info(
      `WBSビルダー並行スケジューリング完了: 葉タスク=${scheduleResult.scheduledLeafTasks}件, 期間超過=${scheduleResult.overflowTasks}件`
    );

    result.diagnostics = {
      memberCoverage: coverageResult.coverage,
      reassignedTasks: coverageResult.reassignedTasks,
      addedTasks: coverageResult.addedTasks,
      scheduledLeafTasks: scheduleResult.scheduledLeafTasks,
      overflowTasks: scheduleResult.overflowTasks,
      calendarAdjustedTasks: scheduleResult.calendarAdjustedTasks || 0,
      vacationEntries: vacations.length
    };

    logger.info(`WBSビルダー詳細情報生成完了: ${result.tasks.length}件のタスクが更新されました`);

    return result;

  } catch (error) {
    logger.error(`WBSビルダー詳細情報生成エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 日報のトレンド分析を行い、異変があれば管理者に通知する
 * @param {number} userId - 対象ユーザーID
 * @param {Object} currentReport - 最新の日報データ
 */
async function analyzeDailyReportTrends(userId, currentReport) {
  try {
    // 過去7日間の日報を取得
    const reports = await reportService.findDailyReports({
      userId: userId,
      limit: 7
    });

    // データが少なすぎる場合は分析スキップ
    if (reports.length < 3) return;

    // 時系列順（古い順）に並べ替え
    const history = reports.sort((a, b) => new Date(a.report_date) - new Date(b.report_date));

    // 最新の日報がリストに含まれていなければ追加（作成直後なら含まれているはずだが念のため）
    if (!history.find(r => r.report_date === currentReport.report_date)) {
      history.push(currentReport);
    }

    // 最新3日間の満足度チェック
    const recentReports = history.slice(-3);
    const lowSatisfaction = recentReports.every(r => r.satisfaction_level <= 2); // 1:VeryBad, 2:Bad

    // 満足度が急激に低下したかチェック (直近 vs その前)
    const latest = history[history.length - 1];
    const prev = history.length > 1 ? history[history.length - 2] : null;
    const dropDetected = prev && (prev.satisfaction_level - latest.satisfaction_level >= 2);

    let alertTitle = '';
    let alertMessage = '';

    if (lowSatisfaction) {
      alertTitle = '⚠️ 低い満足度が続いています';
      alertMessage = `${currentReport.member_name || 'ユーザー'}さんの満足度が3日間連続で低迷しています。フォローアップが必要かもしれません。`;
    } else if (dropDetected) {
      alertTitle = '📉 満足度が急低下しました';
      alertMessage = `${currentReport.member_name || 'ユーザー'}さんの満足度が前回から急激に低下しました。何か問題が発生している可能性があります。`;
    }

    // アラート条件に該当すれば通知
    if (alertTitle) {
      // 全管理者向けに通知すべきだが、ここでは簡易的にシステム通知として記録
      // notificationService.send の仕様に合わせて送信
      // type: 'system_alert', relatedEntityType: 'daily_report', relatedEntityId: currentReport.id

      // 管理者ユーザーIDを特定するのが理想だが、一旦ログとして残すか、特定の管理者ID(例:1)に送る
      // 今回は通知テーブルに保存する形をとる

      // TODO: 管理者IDを動的に取得するロジックが必要
      const adminUserId = 1; // 仮: adminユーザー

      await notificationService.send(
        adminUserId,
        'alert',
        alertTitle,
        alertMessage,
        'daily_report',
        currentReport.id
      );

      logger.info(`日報トレンド分析: アラート生成 - User:${userId} ${alertTitle}`);
    }

  } catch (error) {
    logger.error(`日報トレンド分析エラー: ${error.message}`);
  }
}

/**
 * AIを使った日報トレンド分析（詳細版）
 * @param {number} userId - 対象ユーザーID
 * @returns {Object} AI分析結果
 */
async function analyzeDailyReportTrendsAI(userId) {
  try {
    // 過去7日間の日報を取得
    const reports = await reportService.findDailyReports({
      userId: userId,
      limit: 7
    });

    // データが少なすぎる場合はエラー
    if (reports.length < 3) {
      return {
        success: false,
        error: '分析に必要な日報データが不足しています（最低3日分必要）'
      };
    }

    // 時系列順（古い順）に並べ替え
    const history = reports.sort((a, b) => new Date(a.report_date) - new Date(b.report_date));

    // プロンプトテンプレートを読み込み
    const template = loadPrompt('daily-report-trend-analysis');

    // テンプレート変数を準備
    const variables = {
      member_name: history[0].member_name || 'Unknown',
      user_id: userId.toString(),
      reports: history.map(r => ({
        report_date: r.report_date,
        satisfaction_level: r.satisfaction_level || 'N/A',
        achievement_rate: r.achievement_rate || 'N/A',
        focus_level: r.focus_level || 'N/A',
        difficulty_level: r.difficulty_level || 'N/A',
        learning_level: r.learning_level || 'N/A',
        comment: r.comment || '記載なし'
      }))
    };

    // Handlebars風のテンプレートを手動で処理
    let prompt = template;

    // シンプルな変数置換
    prompt = prompt.replace(/\{\{member_name\}\}/g, variables.member_name);
    prompt = prompt.replace(/\{\{user_id\}\}/g, variables.user_id);

    // each ループの処理
    const eachMatch = prompt.match(/\{\{#each reports\}\}([\s\S]*?)\{\{\/each\}\}/); if (eachMatch) {
      const itemTemplate = eachMatch[1];
      const itemsHtml = variables.reports.map(report => {
        return itemTemplate
          .replace(/\{\{report_date\}\}/g, report.report_date)
          .replace(/\{\{satisfaction_level\}\}/g, report.satisfaction_level)
          .replace(/\{\{achievement_rate\}\}/g, report.achievement_rate)
          .replace(/\{\{focus_level\}\}/g, report.focus_level)
          .replace(/\{\{difficulty_level\}\}/g, report.difficulty_level)
          .replace(/\{\{learning_level\}\}/g, report.learning_level)
          .replace(/\{\{comment\}\}/g, report.comment);
      }).join('\n');

      prompt = prompt.replace(eachMatch[0], itemsHtml);
    }

    // AIに分析を依頼
    const result = await callAI(prompt, { responseFormat: 'json' });

    logger.info(`日報トレンドAI分析完了: User:${userId}`);

    return {
      success: true,
      analysis: result,
      reportCount: history.length
    };

  } catch (error) {
    logger.error(`日報トレンドAI分析エラー: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  generateWbs,
  generateWbsBuilder, // 段階的WBS生成（WBSビルダー専用）
  finalizeWbsBuilder, // WBSビルダー詳細情報生成
  decomposeTask,
  refineWbsTask,
  sanityCheckWbs,
  summarizeProject,
  detectRisk,
  analyzeSentiment,
  suggestTasks,
  generateDailyReport,
  generateDailyReportDraft,
  generateTaskDescription,
  subdivideTask,
  rescheduleProposal,
  autoAssignTasks,
  autoDuration,
  generateProjectFields,
  analyzeProjectImport,
  generateMentalHealthAdvice,
  generateProgressSuggestion,
  analyzeDeadlinePrediction,
  // New dashboard features
  calculateProjectHealthScoreAI,
  analyzeCriticalPathAI,
  assessTeamWorkloadAI,
  analyzeSprintGoalAI,
  analyzeTeamContributionAI,
  generateProjectAlerts,
  // AI monitoring features
  analyzeHourlyActivity,
  analyzeDailyReportTrends,
  analyzeDailyReportTrendsAI,
  // Help Request AI
  generateHelpRequestContextAI,
  suggestHelpersAI,
  detectHelpProblemsAI,
  refineHelpRequestTextAI,
  analyzeHourlyActivity,
  // Estimate chat
  chatWithAi,
  callAI,
  async testConnection(config) {
    const pAgent = await initializeProxyAgent();
    const adapter = LLMAdapterFactory.create(config.provider, {
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      model: config.model,
      temperature: config.temperature || 0.3,
      maxTokens: config.maxTokens || 100,
      proxyAgent: pAgent
    });
    return await adapter.call('こんにちは。接続テストです。短く返信してください。', { responseFormat: 'text' });
  }
};
