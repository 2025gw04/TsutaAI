/**
 * マイグレーション: LLMプロバイダー設定の追加
 * Groq固有の設定名を汎用的なLLM設定に変更し、プロバイダー選択機能を追加
 */
exports.up = async function (knex) {
  // 既存のGroq設定をチェック
  const existingGroqKey = await knex('system_settings')
    .where('setting_key', 'groq_api_key')
    .first();

  const existingGroqEndpoint = await knex('system_settings')
    .where('setting_key', 'groq_endpoint')
    .first();

  // LLMプロバイダー設定を追加
  const settingsToInsert = [
    {
      setting_key: 'llm_provider',
      setting_value: 'groq',
      setting_type: 'string',
      description: 'LLMプロバイダー (groq, openai, claude, ollama, custom)'
    }
  ];

  // 既存のgroq_api_keyがある場合はllm_api_keyとして移行
  if (existingGroqKey) {
    settingsToInsert.push({
      setting_key: 'llm_api_key',
      setting_value: existingGroqKey.setting_value,
      setting_type: 'string',
      description: 'LLM API Key (暗号化)'
    });
  } else {
    settingsToInsert.push({
      setting_key: 'llm_api_key',
      setting_value: '',
      setting_type: 'string',
      description: 'LLM API Key (暗号化)'
    });
  }

  // 既存のgroq_endpointがある場合はllm_endpointとして移行
  if (existingGroqEndpoint) {
    settingsToInsert.push({
      setting_key: 'llm_endpoint',
      setting_value: existingGroqEndpoint.setting_value,
      setting_type: 'string',
      description: 'LLM API Endpoint'
    });
  } else {
    settingsToInsert.push({
      setting_key: 'llm_endpoint',
      setting_value: 'https://api.groq.com/openai/v1/chat/completions',
      setting_type: 'string',
      description: 'LLM API Endpoint'
    });
  }

  // 新規設定を追加
  settingsToInsert.push({
    setting_key: 'llm_model',
    setting_value: 'openai/gpt-oss-20b',
    setting_type: 'string',
    description: 'LLMモデル名'
  });

  // 既存のai_modelはそのまま保持（UI表示用）
  // 既存のai_temperature、ai_max_tokensもそのまま保持

  // 重複チェックをしながら挿入
  for (const setting of settingsToInsert) {
    const exists = await knex('system_settings')
      .where('setting_key', setting.setting_key)
      .first();

    if (!exists) {
      await knex('system_settings').insert(setting);
    }
  }

  console.log('LLMプロバイダー設定を追加しました');
};

exports.down = async function (knex) {
  // ロールバック: 新規追加した設定を削除
  await knex('system_settings')
    .whereIn('setting_key', ['llm_provider', 'llm_api_key', 'llm_endpoint', 'llm_model'])
    .delete();

  console.log('LLMプロバイダー設定を削除しました');
};
