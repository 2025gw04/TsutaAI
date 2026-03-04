<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import { getHolidaysOf } from 'japanese-holidays';

	let activeTab: 'llm' | 'holidays' | 'users' | 'ai' | 'version' = 'llm';
	let isLoading = true;
	let error = '';
	let successMessage = '';

	// LLM設定（統合版：すべてのLLM関連設定を含む）
	let llmSettings = {
		llmProvider: 'groq',
		llmApiKey: '',
		llmEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
		llmModel: 'openai/gpt-oss-20b',
		temperature: 0.3,
		maxTokens: 40960,
		proxyEnabled: false,
		proxyUrl: '',
		proxyUsername: '',
		proxyPassword: ''
	};

	let isTestingLlm = false;
	let isSavingLlm = false;
	let testResponse = '';
	let testDuration = 0;

	// 利用可能なLLMプロバイダー一覧（モデルリストを含む）
	const availableProviders = [
		{
			id: 'groq',
			label: 'Groq (高速推論)',
			defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
			defaultModel: 'openai/gpt-oss-20b',
			defaultMaxTokens: 65536,
			requiresApiKey: true,
			models: [
				{ value: 'openai/gpt-oss-20b', label: 'gpt-oss-20b', maxTokens: 65536 },
				{ value: 'openai/gpt-oss-120b', label: 'gpt-oss-120b', maxTokens: 65536 },
				{ value: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b', maxTokens: 32768 },
				{ value: 'llama-3.1-8b-instant', label: 'llama-3.1-8b', maxTokens: 8192 },
				{ value: 'qwen/qwen3-32b', label: 'qwen3-32b', maxTokens: 40960 }
			]
		},
		{
			id: 'openai',
			label: 'OpenAI (GPT-5.2)',
			defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
			defaultModel: 'gpt-5.2',
			defaultMaxTokens: 16384,
			requiresApiKey: true,
			models: [
				{ value: 'gpt-5.2', label: 'GPT-5.2', maxTokens: 16384 },
				{ value: 'gpt-5-mini', label: 'GPT-5 mini', maxTokens: 16384 },
				{ value: 'gpt-5-nano', label: 'GPT-5 nano', maxTokens: 16384 },
				{ value: 'gpt-5', label: 'GPT-5', maxTokens: 16384 }
			]
		},
		{
			id: 'claude',
			label: 'Claude (Anthropic)',
			defaultEndpoint: 'https://api.anthropic.com/v1/messages',
			defaultModel: 'claude-opus-4-6',
			defaultMaxTokens: 8192,
			requiresApiKey: true,
			models: [
				{ value: 'claude-opus-4-6', label: 'Claude Opus 4.6', maxTokens: 8192 },
				{ value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', maxTokens: 8192 },
				{ value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', maxTokens: 8192 }
			]
		},
		{
			id: 'gemini',
			label: 'Gemini (Google)',
			defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
			defaultModel: 'gemini-3-flash-preview',
			defaultMaxTokens: 8192,
			requiresApiKey: true,
			models: [
				{ value: 'gemini-3-1-pro-preview', label: 'Gemini 3.1 Pro Preview', maxTokens: 8192 },
				{ value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', maxTokens: 8192 },
				{
					value: 'gemini-3-1-flash-lite-preview',
					label: 'Gemini 3.1 Flash Lite Preview',
					maxTokens: 8192
				},
				{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', maxTokens: 8192 },
				{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', maxTokens: 8192 }
			]
		},
		{
			id: 'ollama',
			label: 'Ollama (ローカルLLM)',
			defaultEndpoint: 'http://localhost:11434/v1/chat/completions',
			defaultModel: 'llama3.2',
			defaultMaxTokens: 8192,
			requiresApiKey: false,
			models: [
				{ value: 'llama3.2', label: 'Llama 3.2', maxTokens: 8192 },
				{ value: 'llama3.1', label: 'Llama 3.1', maxTokens: 8192 },
				{ value: 'mistral', label: 'Mistral', maxTokens: 8192 },
				{ value: 'codellama', label: 'Code Llama', maxTokens: 8192 },
				{ value: 'gemma2', label: 'Gemma 2', maxTokens: 8192 }
			]
		},
		{
			id: 'custom',
			label: 'カスタム (OpenAI互溛)',
			defaultEndpoint: '',
			defaultModel: '',
			defaultMaxTokens: 8192,
			requiresApiKey: true,
			models: [] // カスタムの場合はテキスト入力
		}
	];

	// プロバイダー変更時にデフォルト値を設定
	function handleProviderChange() {
		const provider = availableProviders.find((p) => p.id === llmSettings.llmProvider);
		if (provider) {
			llmSettings.llmEndpoint = provider.defaultEndpoint;
			llmSettings.llmModel = provider.defaultModel;
			llmSettings.maxTokens = provider.defaultMaxTokens ?? 8192;
		}
	}

	// モデル変更時にmaxTokensを自動設定
	function handleModelChange() {
		const provider = availableProviders.find((p) => p.id === llmSettings.llmProvider);
		const model = provider?.models.find((m) => m.value === llmSettings.llmModel);
		if (model?.maxTokens) {
			llmSettings.maxTokens = model.maxTokens;
		}
	}

	// 現在のプロバイダーのモデルリストを取得（リアクティブ）
	$: currentProviderModels =
		availableProviders.find((p) => p.id === llmSettings.llmProvider)?.models || [];

	// 現在のモデルのmaxTokens上限値（リアクティブ）
	$: currentModelMaxTokens = (() => {
		const provider = availableProviders.find((p) => p.id === llmSettings.llmProvider);
		const model = provider?.models.find((m) => m.value === llmSettings.llmModel);
		return model?.maxTokens ?? provider?.defaultMaxTokens ?? 8192;
	})();

	// プロンプト管理
	let prompts: any[] = [];
	let selectedPrompt: any = null;
	let showPromptModal = false;
	let promptContent = '';
	let promptName = '';
	let isSavingPrompt = false;
	let isResettingPrompt = false;

	// 祝日設定
	let holidays: any[] = [];
	let selectedYear = new Date().getFullYear();
	let showAddHolidayModal = false;
	let showImportHolidayModal = false;
	let importYearStart = new Date().getFullYear();
	let importYearEnd = new Date().getFullYear() + 5;
	let newHoliday = {
		holiday_date: '',
		holiday_name: '',
		holiday_type: 'national' as 'national' | 'company' | 'other',
		is_recurring: false,
		notes: ''
	};
	let isAddingHoliday = false;
	let isDeletingHoliday = false;
	let isImportingHolidays = false;

	// ユーザー管理
	let users: any[] = [];
	let showUserModal = false;
	let editingUser: any = null;
	let userForm = {
		username: '',
		email: '',
		fullName: '',
		role: 'member' as 'admin' | 'member',
		password: ''
	};
	let isSavingUser = false;
	let isDeletingUser = false;
	let isTogglingUserRole = false;

	// バージョン情報
	let versionInfo: any = {
		currentVersion: '1.0.0',
		name: 'TsutaAI Web Admin',
		description: '',
		changelog: '',
		versions: []
	};

	let isInitializing = false;
	let isFixingLogin = false;

	$: isSavingOrTestingLlm = isSavingLlm || isTestingLlm;
	$: isHolidayActionInFlight = isAddingHoliday || isDeletingHoliday || isImportingHolidays;
	$: isUserActionInFlight = isSavingUser || isDeletingUser || isTogglingUserRole;
	$: isPromptActionInFlight = isSavingPrompt || isResettingPrompt;

	function closeAddHolidayModal() {
		if (isAddingHoliday) {
			return;
		}
		showAddHolidayModal = false;
	}

	function closeImportHolidayModal() {
		if (isImportingHolidays) {
			return;
		}
		showImportHolidayModal = false;
	}

	function closeUserModal() {
		if (isSavingUser) {
			return;
		}
		showUserModal = false;
		editingUser = null;
		userForm = {
			username: '',
			email: '',
			fullName: '',
			role: 'member',
			password: ''
		};
	}

	function closePromptModal(force = false) {
		if (!force && isPromptActionInFlight) {
			return;
		}
		showPromptModal = false;
		selectedPrompt = null;
		promptName = '';
		promptContent = '';
	}

	async function initializeDatabase() {
		if (isInitializing) {
			return;
		}

		if (
			!confirm(
				'本当にデータベースを初期化しますか？\n現在のすべてのデータが削除され、デモ用データで上書きされます。\nこの操作は取り消せません。'
			)
		) {
			return;
		}

		try {
			isInitializing = true;
			error = '';
			successMessage = '';

			// 長い処理になる可能性があるため、タイムアウトを長めに設定するか、完了を待つメッセージを表示
			const response = (await apiClient.post('/settings/init-database', {})) as any;

			if (response.success) {
				successMessage = 'データベースが正常に初期化されました。';
				// データを再読み込み
				await loadSettings();
				await loadHolidays();
				await loadUsers();
				await loadPrompts();
				await loadVersionInfo();
			} else {
				error = response.message || response.error || response.details || '初期化に失敗しました。';
				if (response.details && !error.includes(response.details)) {
					error = `${error}\n詳細: ${response.details}`;
				}
			}
		} catch (e: any) {
			error = e.message || '初期化中にエラーが発生しました。';
		} finally {
			isInitializing = false;
		}
	}

	async function requestLoginFix() {
		if (isFixingLogin) {
			return;
		}

		if (
			!confirm(
				'ログイン不具合の解消処理を実行しますか？\nレート制限のリセットと一時ファイルの削除を行います。'
			)
		) {
			return;
		}

		try {
			isFixingLogin = true;
			error = '';
			successMessage = '';

			const response = (await apiClient.post('/settings/fix-login', {})) as any;

			if (response.success) {
				successMessage = 'ログイン不具合の解消処理が完了しました。';
			} else {
				error = response.error || '処理に失敗しました。';
			}
		} catch (e: any) {
			error = e.message || '処理中にエラーが発生しました。';
		} finally {
			isFixingLogin = false;
		}
	}

	onMount(async () => {
		await loadSettings();
		await loadHolidays();
		await loadUsers();
		await loadPrompts();
		await loadVersionInfo();
		isLoading = false;
	});

	async function loadSettings() {
		try {
			const response = await apiClient.fetchSettings();
			if (response.success && response.data) {
				// 新しいLLM設定を優先的に読み込み
				if (response.data.llm_provider) {
					llmSettings.llmProvider = response.data.llm_provider.value ?? 'groq';
				}
				if (response.data.llm_api_key) {
					llmSettings.llmApiKey = response.data.llm_api_key.value ?? '';
				} else if (response.data.groq_api_key) {
					// 後方互換性: 旧設定から読み込み
					llmSettings.llmApiKey = response.data.groq_api_key.value ?? '';
				}
				if (response.data.llm_endpoint) {
					llmSettings.llmEndpoint =
						response.data.llm_endpoint.value ?? 'https://api.groq.com/openai/v1/chat/completions';
				} else if (response.data.groq_endpoint) {
					llmSettings.llmEndpoint =
						response.data.groq_endpoint.value ?? 'https://api.groq.com/openai/v1/chat/completions';
				}
				if (response.data.llm_model) {
					llmSettings.llmModel = response.data.llm_model.value ?? 'openai/gpt-oss-20b';
				}
				// Temperature と MaxTokens も読み込み
				if (response.data.ai_temperature) {
					const loadedTemperature = parseFloat(String(response.data.ai_temperature.value));
					if (!Number.isNaN(loadedTemperature)) {
						llmSettings.temperature = loadedTemperature;
					}
				}
				if (response.data.ai_max_tokens) {
					const loadedMaxTokens = parseInt(String(response.data.ai_max_tokens.value), 10);
					if (!Number.isNaN(loadedMaxTokens)) {
						llmSettings.maxTokens = loadedMaxTokens;
					}
				}
				// プロキシ設定
				if (response.data.proxy_enabled) {
					llmSettings.proxyEnabled = response.data.proxy_enabled.value ?? false;
				}
				if (response.data.proxy_url) {
					llmSettings.proxyUrl = response.data.proxy_url.value ?? '';
				}
				if (response.data.proxy_username) {
					llmSettings.proxyUsername = response.data.proxy_username.value ?? '';
				}
				if (response.data.proxy_password) {
					llmSettings.proxyPassword = response.data.proxy_password.value ?? '';
				}
			}
		} catch (e: any) {
			error = e.message;
		}
	}

	async function loadPrompts() {
		try {
			const response = await apiClient.get('/prompts');
			if (response.success) {
				prompts = Array.isArray(response.data) ? response.data : [];
			}
		} catch (e: any) {
			console.error('プロンプト読み込みエラー:', e.message);
			// プロンプト読み込みエラーは致命的ではないので、エラーメッセージは表示しない
		}
	}

	async function loadVersionInfo() {
		try {
			const response = await apiClient.get('/version');
			if (response.success && response.data) {
				const versions = Array.isArray(response.data.versions)
					? response.data.versions.map((version: any) => ({
							...version,
							added: Array.isArray(version?.added) ? version.added : [],
							changed: Array.isArray(version?.changed) ? version.changed : [],
							fixed: Array.isArray(version?.fixed) ? version.fixed : [],
							removed: Array.isArray(version?.removed) ? version.removed : []
						}))
					: [];
				versionInfo = {
					...versionInfo,
					...response.data,
					versions
				};
			}
		} catch (e: any) {
			console.error('バージョン情報読み込みエラー:', e.message);
			// バージョン情報読み込みエラーは致命的ではないので、エラーメッセージは表示しない
		}
	}

	async function loadHolidays() {
		try {
			const response = await apiClient.fetchHolidays(String(selectedYear));
			if (response.success) {
				holidays = Array.isArray(response.data) ? response.data : [];
			}
		} catch (e: any) {
			error = e.message;
		}
	}

	async function saveLLMSettings() {
		if (isSavingOrTestingLlm) {
			return;
		}

		try {
			isSavingLlm = true;
			error = '';
			successMessage = '';

			const settings = {
				llm_provider: {
					value: llmSettings.llmProvider,
					type: 'string',
					description: 'LLMプロバイダー'
				},
				llm_api_key: {
					value: llmSettings.llmApiKey,
					type: 'string',
					description: 'LLM APIキー'
				},
				llm_endpoint: {
					value: llmSettings.llmEndpoint,
					type: 'string',
					description: 'LLM APIエンドポイント'
				},
				llm_model: {
					value: llmSettings.llmModel,
					type: 'string',
					description: 'LLMモデル名'
				},
				ai_temperature: {
					value: String(llmSettings.temperature),
					type: 'number',
					description: 'AI温度設定'
				},
				ai_max_tokens: {
					value: String(llmSettings.maxTokens),
					type: 'number',
					description: 'AI最大トークン数'
				},
				proxy_enabled: {
					value: llmSettings.proxyEnabled,
					type: 'boolean',
					description: 'プロキシを有効にする'
				},
				proxy_url: {
					value: llmSettings.proxyUrl,
					type: 'string',
					description: 'プロキシURL'
				},
				proxy_username: {
					value: llmSettings.proxyUsername,
					type: 'string',
					description: 'プロキシユーザー名'
				},
				proxy_password: {
					value: llmSettings.proxyPassword,
					type: 'string',
					description: 'プロキシパスワード'
				}
			};

			await apiClient.bulkUpdateSettings(settings);
			successMessage =
				'LLM設定を保存しました。変更を反映するにはバックエンドAPIを再起動してください。';
		} catch (e: any) {
			error = e.message;
		} finally {
			isSavingLlm = false;
		}
	}

	async function testLLMConnection() {
		if (isSavingOrTestingLlm) {
			return;
		}

		try {
			error = '';
			testResponse = '';
			isTestingLlm = true;

			const response = (await apiClient.post('/settings/test-llm', {
				provider: llmSettings.llmProvider,
				apiKey: llmSettings.llmApiKey,
				endpoint: llmSettings.llmEndpoint,
				model: llmSettings.llmModel
			})) as any;

			if (response.success) {
				testResponse = response.response;
				testDuration = response.duration;
			} else {
				error = response.error || '接続テストに失敗しました。';
			}
		} catch (e: any) {
			error = e.response?.data?.details || e.message || '接続テスト中にエラーが発生しました。';
		} finally {
			isTestingLlm = false;
		}
	}
	function openAddHolidayModal() {
		newHoliday = {
			holiday_date: '',
			holiday_name: '',
			holiday_type: 'national',
			is_recurring: false,
			notes: ''
		};
		showAddHolidayModal = true;
	}

	async function addHoliday() {
		if (isHolidayActionInFlight) {
			return;
		}

		try {
			isAddingHoliday = true;
			error = '';
			successMessage = '';

			if (!newHoliday.holiday_date || !newHoliday.holiday_name) {
				error = '日付と祝日名は必須です';
				return;
			}

			await apiClient.createHoliday({
				...newHoliday,
				is_recurring: newHoliday.is_recurring ? 1 : 0
			});
			successMessage = '祝日を追加しました';
			showAddHolidayModal = false;
			await loadHolidays();
		} catch (e: any) {
			error = e.message;
		} finally {
			isAddingHoliday = false;
		}
	}

	async function deleteHoliday(id: number) {
		if (isHolidayActionInFlight) {
			return;
		}

		if (!confirm('この祝日を削除してもよろしいですか?')) {
			return;
		}

		try {
			isDeletingHoliday = true;
			error = '';
			successMessage = '';
			await apiClient.deleteHoliday(id);
			successMessage = '祝日を削除しました';
			await loadHolidays();
		} catch (e: any) {
			error = e.message;
		} finally {
			isDeletingHoliday = false;
		}
	}

	/**
	 * 指定年の日本の祝日を生成（japanese-holidaysライブラリを使用）
	 * 内閣府の公式データに基づいており、振替休日も含まれます
	 */
	function generateJapaneseHolidays(year: number): any[] {
		try {
			const holidays = getHolidaysOf(year);

			// japanese-holidaysのデータをDBフォーマットに変換
			// データ形式: { month: number, date: number, name: string }
			return holidays.map((holiday: any) => {
				const month = String(holiday.month).padStart(2, '0');
				const day = String(holiday.date).padStart(2, '0');
				const dateStr = `${year}-${month}-${day}`;

				return {
					holiday_date: dateStr,
					holiday_name: holiday.name,
					holiday_type: 'national',
					is_recurring: 0, // japanese-holidaysは年ごとの祝日を返すため
					notes: ''
				};
			});
		} catch (e) {
			console.error(`Failed to generate holidays for year ${year}:`, e);
			return [];
		}
	}

	/**
	 * インポートモーダルを開く
	 */
	function openImportHolidayModal() {
		importYearStart = new Date().getFullYear();
		importYearEnd = new Date().getFullYear() + 5;
		showImportHolidayModal = true;
	}

	/**
	 * 年度範囲を指定して祝日をインポート
	 */
	async function importHolidaysInRange() {
		if (isHolidayActionInFlight) {
			return;
		}

		if (importYearStart > importYearEnd) {
			error = '開始年は終了年より前である必要があります';
			return;
		}

		if (importYearEnd - importYearStart > 20) {
			error = 'インポート可能な年数は最大20年です';
			return;
		}

		try {
			isImportingHolidays = true;
			error = '';
			successMessage = '';

			let allHolidays: any[] = [];
			for (let year = importYearStart; year <= importYearEnd; year++) {
				const yearHolidays = generateJapaneseHolidays(year);
				allHolidays = allHolidays.concat(yearHolidays);
			}

			await apiClient.bulkCreateHolidays(allHolidays);
			successMessage = `${importYearStart}年～${importYearEnd}年の日本の祝日をインポートしました（${allHolidays.length}件）`;
			showImportHolidayModal = false;
			await loadHolidays();
		} catch (e: any) {
			error = e.message;
		} finally {
			isImportingHolidays = false;
		}
	}

	function changeYear(delta: number) {
		selectedYear += delta;
		loadHolidays();
	}

	// ユーザー管理関数
	async function loadUsers() {
		try {
			const response = await apiClient.fetchUsers();
			if (response.success) {
				users = Array.isArray(response.data) ? response.data : [];
			}
		} catch (e: any) {
			error = e.message;
		}
	}

	function openCreateUserModal() {
		editingUser = null;
		userForm = {
			username: '',
			email: '',
			fullName: '',
			role: 'member',
			password: ''
		};
		showUserModal = true;
	}

	function openEditUserModal(user: any) {
		editingUser = user;
		userForm = {
			username: user.username,
			email: user.email,
			fullName: user.fullName,
			role: user.role,
			password: '' // パスワードは空にする
		};
		showUserModal = true;
	}

	async function saveUser() {
		if (isUserActionInFlight) {
			return;
		}

		try {
			isSavingUser = true;
			error = '';
			successMessage = '';

			if (!userForm.username || !userForm.email || !userForm.fullName) {
				error = 'ユーザー名、メールアドレス、氏名は必須です';
				return;
			}

			if (!editingUser && !userForm.password) {
				error = '新規ユーザーの場合、パスワードは必須です';
				return;
			}

			if (editingUser) {
				// 更新
				const updateData: any = {
					email: userForm.email,
					fullName: userForm.fullName,
					role: userForm.role
				};

				// パスワードが入力されている場合のみ更新
				if (userForm.password) {
					updateData.password = userForm.password;
				}

				await apiClient.put(`/users/${editingUser.id}`, updateData);
				successMessage = 'ユーザー情報を更新しました';
			} else {
				// 新規作成
				await apiClient.post('/users', {
					username: userForm.username,
					email: userForm.email,
					fullName: userForm.fullName,
					role: userForm.role,
					password: userForm.password
				});
				successMessage = 'ユーザーを作成しました';
			}

			showUserModal = false;
			await loadUsers();
		} catch (e: any) {
			error = e.message;
		} finally {
			isSavingUser = false;
		}
	}

	async function deleteUser(userId: number, username: string) {
		if (isUserActionInFlight) {
			return;
		}

		if (!confirm(`ユーザー「${username}」を削除してもよろしいですか?`)) {
			return;
		}

		try {
			isDeletingUser = true;
			error = '';
			successMessage = '';
			await apiClient.delete(`/users/${userId}`);
			successMessage = 'ユーザーを削除しました';
			await loadUsers();
		} catch (e: any) {
			error = e.message;
		} finally {
			isDeletingUser = false;
		}
	}

	async function toggleUserRole(user: any) {
		if (isUserActionInFlight) {
			return;
		}

		const newRole = user.role === 'admin' ? 'member' : 'admin';
		if (
			!confirm(
				`${user.fullName}の権限を「${newRole === 'admin' ? '管理者' : 'メンバー'}」に変更しますか?`
			)
		) {
			return;
		}

		try {
			isTogglingUserRole = true;
			error = '';
			successMessage = '';
			await apiClient.put(`/users/${user.id}`, {
				email: user.email,
				fullName: user.fullName,
				role: newRole
			});
			successMessage = `権限を変更しました`;
			await loadUsers();
		} catch (e: any) {
			error = e.message;
		} finally {
			isTogglingUserRole = false;
		}
	}

	// プロンプト編集モーダルを開く
	function openPromptModal(prompt: any) {
		if (isPromptActionInFlight) {
			return;
		}
		selectedPrompt = prompt;
		promptName = prompt.name;
		promptContent = prompt.content || '';
		showPromptModal = true;
	}

	// プロンプトを保存
	async function savePrompt() {
		if (isPromptActionInFlight) {
			return;
		}

		try {
			isSavingPrompt = true;
			error = '';
			successMessage = '';

			if (!selectedPrompt || !promptName || !promptContent) {
				error = 'プロンプト名と内容は必須です';
				return;
			}

			await apiClient.put(`/prompts/${selectedPrompt.name}`, {
				content: promptContent
			});

			successMessage = 'プロンプトを保存しました';
			closePromptModal(true);
			await loadPrompts();
		} catch (e: any) {
			error = e.message;
		} finally {
			isSavingPrompt = false;
		}
	}

	// プロンプトをデフォルトに戻す
	async function resetPrompt() {
		if (isPromptActionInFlight) {
			return;
		}

		if (!selectedPrompt) {
			error = '対象プロンプトが見つかりません';
			return;
		}

		if (!confirm('このプロンプトをデフォルトに戻しますか?')) {
			return;
		}

		try {
			isResettingPrompt = true;
			error = '';
			successMessage = '';

			await apiClient.delete(`/prompts/${selectedPrompt.name}`);
			successMessage = 'プロンプトをデフォルトに戻しました';
			closePromptModal(true);
			await loadPrompts();
		} catch (e: any) {
			error = e.message;
		} finally {
			isResettingPrompt = false;
		}
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-gear"></i>
				システム設定
			</h1>
			<p>システム全般の管理</p>
		</div>
	</header>
</div>

<div class="settings-page">
	{#if error}
		<div class="alert alert-danger" role="alert">
			<i class="bi bi-exclamation-triangle-fill me-2"></i>
			{error}
		</div>
	{/if}

	{#if successMessage}
		<div class="alert alert-success" role="alert">
			<i class="bi bi-check-circle-fill me-2"></i>
			{successMessage}
		</div>
	{/if}

	{#if isLoading}
		<div class="text-center py-5">
			<div class="spinner-border" role="status">
				<span class="visually-hidden">読み込み中...</span>
			</div>
		</div>
	{:else}
		<div class="settings-tabs">
			<ul class="nav nav-tabs">
				<li class="nav-item">
					<button
						class="nav-link {activeTab === 'llm' ? 'active' : ''}"
						on:click={() => (activeTab = 'llm')}
					>
						<i class="bi bi-robot me-2"></i>
						LLM API設定
					</button>
				</li>
				<li class="nav-item">
					<button
						class="nav-link {activeTab === 'holidays' ? 'active' : ''}"
						on:click={() => (activeTab = 'holidays')}
					>
						<i class="bi bi-calendar-event me-2"></i>
						祝日設定
					</button>
				</li>
				<li class="nav-item">
					<button
						class="nav-link {activeTab === 'users' ? 'active' : ''}"
						on:click={() => (activeTab = 'users')}
					>
						<i class="bi bi-people me-2"></i>
						ユーザー管理
					</button>
				</li>
				<li class="nav-item">
					<button
						class="nav-link {activeTab === 'ai' ? 'active' : ''}"
						on:click={() => (activeTab = 'ai')}
					>
						<i class="bi bi-chat-text me-2"></i>
						プロンプト管理
					</button>
				</li>
				<li class="nav-item">
					<button
						class="nav-link {activeTab === 'version' ? 'active' : ''}"
						on:click={() => (activeTab = 'version')}
					>
						<i class="bi bi-info-circle me-2"></i>
						バージョン情報
					</button>
				</li>
			</ul>

			<div class="tab-content">
				{#if activeTab === 'llm'}
					<div class="tab-pane active">
						<div class="card">
							<div class="card-body">
								<h5 class="card-title">LLM API設定</h5>
								<form on:submit|preventDefault={saveLLMSettings}>
									<div class="mb-3">
										<label for="llmProvider" class="form-label">LLMプロバイダー</label>
										<select
											class="form-select"
											id="llmProvider"
											bind:value={llmSettings.llmProvider}
											on:change={handleProviderChange}
										>
											{#each availableProviders as provider}
												<option value={provider.id}>{provider.label}</option>
											{/each}
										</select>
										<small class="text-muted"> 使用するLLMプロバイダーを選択してください </small>
									</div>

									{#if availableProviders.find((p) => p.id === llmSettings.llmProvider)?.requiresApiKey}
										<div class="mb-3">
											<label for="llmApiKey" class="form-label">APIキー</label>
											<input
												type="password"
												class="form-control"
												id="llmApiKey"
												bind:value={llmSettings.llmApiKey}
												placeholder="APIキーを入力"
											/>
											{#if llmSettings.llmProvider === 'claude'}
												<small class="text-muted">
													Anthropic ConsoleからAPIキーを取得してください
												</small>
											{:else if llmSettings.llmProvider === 'openai'}
												<small class="text-muted">
													OpenAI PlatformからAPIキーを取得してください
												</small>
											{:else if llmSettings.llmProvider === 'gemini'}
												<small class="text-muted">
													Google AI Studio からAPIキーを取得してください
												</small>
											{:else if llmSettings.llmProvider === 'groq'}
												<small class="text-muted">
													Groq ConsoleからAPIキーを取得してください
												</small>
											{/if}
										</div>
									{/if}

									<div class="mb-3">
										<label for="llmEndpoint" class="form-label">エンドポイント</label>
										<input
											type="text"
											class="form-control"
											id="llmEndpoint"
											bind:value={llmSettings.llmEndpoint}
											placeholder="https://api.example.com/v1/chat/completions"
										/>
										<small class="text-muted">
											{#if llmSettings.llmProvider === 'ollama'}
												Ollamaがローカルで起動している必要があります（デフォルト:
												http://localhost:11434）
											{:else if llmSettings.llmProvider === 'custom'}
												OpenAI互換のカスタムエンドポイントを指定してください
											{:else}
												通常はデフォルト値のままで問題ありません
											{/if}
										</small>
									</div>

									<div class="mb-3">
										<label for="llmModel" class="form-label">モデル</label>
										{#if llmSettings.llmProvider === 'custom'}
											<input
												type="text"
												class="form-control"
												id="llmModel"
												bind:value={llmSettings.llmModel}
												placeholder="モデル名を入力"
											/>
											<small class="text-muted"> 使用するモデルの名前を指定してください </small>
										{:else}
											<select
												class="form-select"
												id="llmModel"
												bind:value={llmSettings.llmModel}
												on:change={handleModelChange}
											>
												{#each currentProviderModels as model}
													<option value={model.value}>{model.label}</option>
												{/each}
											</select>
											<small class="text-muted"> 使用するモデルを選択してください </small>
										{/if}
									</div>

									<div class="mb-3">
										<label for="temperature" class="form-label">
											Temperature: {llmSettings.temperature}
										</label>
										<input
											type="range"
											class="form-range"
											id="temperature"
											min="0"
											max="1"
											step="0.1"
											bind:value={llmSettings.temperature}
										/>
										<small class="text-muted">
											低い値(0.0-0.3): より決定論的で一貫性のある応答<br />
											高い値(0.7-1.0): より創造的で多様な応答
										</small>
									</div>

									<div class="mb-3">
										<label for="maxTokens" class="form-label">最大トークン数</label>
										<input
											type="number"
											class="form-control"
											id="maxTokens"
											bind:value={llmSettings.maxTokens}
											min="1024"
											max={currentModelMaxTokens}
											step="1024"
										/>
										<small class="text-muted"
											>AI応答の最大長（1024-{currentModelMaxTokens.toLocaleString()}）</small
										>
									</div>

									<hr class="my-4" />

									<h5 class="card-title">プロキシ設定</h5>

									<div class="mb-3 form-check">
										<input
											type="checkbox"
											class="form-check-input"
											id="proxyEnabled"
											bind:checked={llmSettings.proxyEnabled}
										/>
										<label class="form-check-label" for="proxyEnabled"> プロキシを使用する </label>
									</div>

									{#if llmSettings.proxyEnabled}
										<div class="mb-3">
											<label for="proxyUrl" class="form-label">プロキシURL</label>
											<input
												type="text"
												class="form-control"
												id="proxyUrl"
												bind:value={llmSettings.proxyUrl}
												placeholder="http://proxy.example.com:8080"
											/>
										</div>

										<div class="mb-3">
											<label for="proxyUsername" class="form-label">ユーザー名</label>
											<input
												type="text"
												class="form-control"
												id="proxyUsername"
												bind:value={llmSettings.proxyUsername}
											/>
										</div>

										<div class="mb-3">
											<label for="proxyPassword" class="form-label">パスワード</label>
											<input
												type="password"
												class="form-control"
												id="proxyPassword"
												bind:value={llmSettings.proxyPassword}
											/>
										</div>
									{/if}

									<div class="d-flex gap-2">
										<button type="submit" class="btn btn-primary" disabled={isSavingOrTestingLlm}>
											{#if isSavingLlm}
												<span
													class="spinner-border spinner-border-sm me-2"
													role="status"
													aria-hidden="true"
												></span>
												保存中...
											{:else}
												<i class="bi bi-save me-2"></i>
												保存
											{/if}
										</button>

										<button
											type="button"
											class="btn btn-outline-info"
											on:click={testLLMConnection}
											disabled={isSavingOrTestingLlm}
										>
											{#if isTestingLlm}
												<span
													class="spinner-border spinner-border-sm me-2"
													role="status"
													aria-hidden="true"
												></span>
												テスト中...
											{:else}
												<i class="bi bi-lightning-charge me-2"></i>
												接続テスト
											{/if}
										</button>
									</div>

									{#if testResponse}
										<div class="alert alert-success mt-3">
											<div class="d-flex justify-content-between align-items-center mb-1">
												<strong>
													<i class="bi bi-check-circle me-2"></i>
													接続テスト結果
												</strong>
												<span
													class="badge bg-success-subtle text-success border border-success-subtle"
												>
													{testDuration}ms
												</span>
											</div>
											<div class="mt-1 small text-break p-2 bg-white bg-opacity-50 rounded">
												{testResponse}
											</div>
										</div>
									{/if}
								</form>

								<div class="alert alert-info mt-3">
									<i class="bi bi-info-circle me-2"></i>
									<strong>注意:</strong> 設定変更後、反映するにはバックエンドAPIを再起動する必要があります。
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'holidays'}
					<div class="tab-pane active">
						<div class="card">
							<div class="card-body">
								<div class="d-flex justify-content-between align-items-center mb-3">
									<h5 class="card-title mb-0">祝日一覧</h5>
									<div class="btn-toolbar gap-2">
										<button
											type="button"
											class="btn btn-sm btn-outline-secondary"
											on:click={openImportHolidayModal}
											disabled={isHolidayActionInFlight}
										>
											<i class="bi bi-download me-1"></i>
											デフォルト祝日をインポート
										</button>
										<button
											type="button"
											class="btn btn-sm btn-primary"
											on:click={openAddHolidayModal}
											disabled={isHolidayActionInFlight}
										>
											<i class="bi bi-plus-lg me-1"></i>
											祝日を追加
										</button>
									</div>
								</div>

								<div class="d-flex align-items-center gap-2 mb-3 year-selector">
									<button
										type="button"
										class="btn btn-sm btn-outline-secondary"
										on:click={() => changeYear(-1)}
										disabled={isHolidayActionInFlight}
									>
										<i class="bi bi-chevron-left"></i>
										<span class="btn-text">前年</span>
									</button>
									<span class="fw-bold year-display">{selectedYear}年</span>
									<button
										type="button"
										class="btn btn-sm btn-outline-secondary"
										on:click={() => changeYear(1)}
										disabled={isHolidayActionInFlight}
									>
										<span class="btn-text">翌年</span>
										<i class="bi bi-chevron-right"></i>
									</button>
								</div>

								{#if holidays.length === 0}
									<p class="text-muted">祝日が登録されていません。</p>
								{:else}
									<div class="table-responsive">
										<table class="table table-hover">
											<thead>
												<tr>
													<th>日付</th>
													<th>祝日名</th>
													<th>種類</th>
													<th>備考</th>
													<th>操作</th>
												</tr>
											</thead>
											<tbody>
												{#each holidays as holiday}
													<tr>
														<td data-label="日付">{holiday.holiday_date}</td>
														<td data-label="祝日名">{holiday.holiday_name}</td>
														<td data-label="種類">
															{#if holiday.holiday_type === 'national'}
																<span class="badge bg-primary">国民の祝日</span>
															{:else if holiday.holiday_type === 'company'}
																<span class="badge bg-secondary">会社休日</span>
															{:else}
																<span class="badge bg-info">その他</span>
															{/if}
														</td>
														<td data-label="備考">{holiday.notes || '-'}</td>
														<td data-label="操作">
															<button
																type="button"
																class="btn btn-sm btn-outline-danger"
																on:click={() => deleteHoliday(holiday.id)}
																disabled={isHolidayActionInFlight}
															>
																<i class="bi bi-trash"></i>
																{isDeletingHoliday ? '削除中...' : '削除'}
															</button>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{:else if activeTab === 'users'}
					<div class="tab-pane active">
						<div class="card">
							<div class="card-body">
								<div class="d-flex justify-content-between align-items-center mb-3">
									<h5 class="card-title mb-0">ユーザー一覧</h5>
									<button
										type="button"
										class="btn btn-primary"
										on:click={openCreateUserModal}
										disabled={isUserActionInFlight}
									>
										<i class="bi bi-plus-lg me-1"></i>
										ユーザーを追加
									</button>
								</div>

								{#if users.length === 0}
									<p class="text-muted">ユーザーが登録されていません。</p>
								{:else}
									<div class="table-responsive">
										<table class="table table-hover">
											<thead>
												<tr>
													<th>ID</th>
													<th>ユーザー名</th>
													<th>氏名</th>
													<th>メールアドレス</th>
													<th>権限</th>
													<th>操作</th>
												</tr>
											</thead>
											<tbody>
												{#each users as user}
													<tr>
														<td data-label="ID">{user.id}</td>
														<td data-label="ユーザー名">{user.username}</td>
														<td data-label="氏名">{user.fullName}</td>
														<td data-label="メールアドレス">{user.email}</td>
														<td data-label="権限">
															<button
																type="button"
																class="btn btn-sm {user.role === 'admin'
																	? 'btn-danger'
																	: 'btn-secondary'}"
																on:click={() => toggleUserRole(user)}
																title="クリックして権限を変更"
																disabled={isUserActionInFlight}
															>
																{user.role === 'admin' ? '管理者' : 'メンバー'}
															</button>
														</td>
														<td data-label="操作">
															<div class="btn-group" role="group">
																<button
																	type="button"
																	class="btn btn-sm btn-outline-primary"
																	on:click={() => openEditUserModal(user)}
																	title="編集"
																	disabled={isUserActionInFlight}
																>
																	<i class="bi bi-pencil"></i>
																	編集
																</button>
																<button
																	type="button"
																	class="btn btn-sm btn-outline-danger"
																	on:click={() => deleteUser(user.id, user.username)}
																	title="削除"
																	disabled={isUserActionInFlight}
																>
																	<i class="bi bi-trash"></i>
																	削除
																</button>
															</div>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}

								<div class="alert alert-info mt-3">
									<i class="bi bi-info-circle me-2"></i>
									<strong>注意:</strong> ユーザーを削除すると、そのユーザーに関連するデータも削除される可能性があります。
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'ai'}
					<div class="tab-pane active">
						<div class="card">
							<div class="card-body">
								<div class="d-flex justify-content-between align-items-center mb-3">
									<h5 class="card-title mb-0">AIプロンプト管理</h5>
									<span class="badge bg-secondary">{prompts.length}個のプロンプト</span>
								</div>

								<p class="text-muted">
									各AI機能で使用されるプロンプトをカスタマイズできます。 プロンプト内の変数（例: {'{project_name}'}）は実行時に実際の値に置き換えられます。
								</p>

								{#if prompts.length === 0}
									<div class="alert alert-warning">
										<i class="bi bi-exclamation-triangle me-2"></i>
										プロンプトが読み込まれていません。バックエンドAPIが起動しているか確認してください。
									</div>
								{:else}
									<div class="table-responsive">
										<table class="table table-hover">
											<thead>
												<tr>
													<th>プロンプト名</th>
													<th>説明</th>
													<th>サイズ</th>
													<th>操作</th>
												</tr>
											</thead>
											<tbody>
												{#each prompts as prompt}
													<tr>
														<td data-label="プロンプト名">
															<code class="text-primary">{prompt.name}</code>
														</td>
														<td data-label="説明">
															{#if prompt.description}
																{#if prompt.description.length > 30}
																	<span title={prompt.description}>
																		{prompt.description.substring(0, 30)}...
																	</span>
																{:else}
																	{prompt.description}
																{/if}
															{:else}
																<span class="text-muted">-</span>
															{/if}
														</td>
														<td data-label="サイズ">
															<span class="badge bg-light text-dark">
																{prompt.size ? `${Math.round(prompt.size / 1024)}KB` : '-'}
															</span>
														</td>
														<td data-label="操作">
															<button
																type="button"
																class="btn btn-sm btn-outline-primary"
																on:click={() => openPromptModal(prompt)}
																title="編集"
																disabled={isPromptActionInFlight}
															>
																<i class="bi bi-pencil"></i>
																編集
															</button>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}

								<div class="alert alert-warning mt-3">
									<i class="bi bi-exclamation-triangle me-2"></i>
									<strong>警告:</strong> プロンプトの変更は慎重に行ってください。不適切な変更はAI機能の動作に影響を与える可能性があります。
								</div>
							</div>
						</div>
					</div>
				{:else if activeTab === 'version'}
					<div class="tab-pane active">
						<div class="card mb-4">
							<div class="card-body text-center py-5">
								<h2 class="display-4 fw-bold text-primary mb-2">v{versionInfo.currentVersion}</h2>
								<p class="lead text-muted">{versionInfo.name}</p>
								{#if Array.isArray(versionInfo.versions) && versionInfo.versions.length > 0}
									<p class="text-muted">最新リリース: {versionInfo.versions[0].date}</p>
								{/if}
							</div>
						</div>

						<div class="card mb-4">
							<div class="card-header bg-white">
								<h5 class="mb-0"><i class="bi bi-download me-2"></i>デスクトップアプリ</h5>
							</div>
							<div class="card-body">
								<p class="text-muted mb-3">
									Windows用のデスクトップアプリケーションをダウンロードできます。
								</p>
								<a href="/DesktopApp.zip" class="btn btn-primary btn-lg" download>
									<i class="bi bi-download me-2"></i>
									デスクトップアプリをダウンロード
								</a>
								<div class="alert alert-info mt-3 mb-0">
									<i class="bi bi-info-circle me-2"></i>
									<strong>案内:</strong> ダウンロード後、ZIPファイルを解凍して実行してください。
								</div>
							</div>
						</div>

						<div class="card mb-4">
							<div class="card-header bg-white">
								<h5 class="mb-0">変更履歴 (CHANGELOG)</h5>
							</div>
							<div class="card-body p-0">
								<div class="list-group list-group-flush">
									{#each Array.isArray(versionInfo.versions) ? versionInfo.versions : [] as version}
										<div class="list-group-item p-4">
											<div class="d-flex justify-content-between align-items-center mb-3">
												<h4 class="mb-0">v{version.version}</h4>
												<span class="badge bg-light text-dark border">{version.date}</span>
											</div>

											{#if version.added && version.added.length > 0}
												<div class="mb-3">
													<h6 class="text-success fw-bold">
														<i class="bi bi-plus-circle me-2"></i>追加
													</h6>
													<ul class="mb-0 text-muted">
														{#each version.added as item}
															<li>{item}</li>
														{/each}
													</ul>
												</div>
											{/if}

											{#if version.changed && version.changed.length > 0}
												<div class="mb-3">
													<h6 class="text-warning fw-bold">
														<i class="bi bi-exclamation-circle me-2"></i>変更
													</h6>
													<ul class="mb-0 text-muted">
														{#each version.changed as item}
															<li>{item}</li>
														{/each}
													</ul>
												</div>
											{/if}

											{#if version.fixed && version.fixed.length > 0}
												<div class="mb-3">
													<h6 class="text-info fw-bold"><i class="bi bi-bug me-2"></i>修正</h6>
													<ul class="mb-0 text-muted">
														{#each version.fixed as item}
															<li>{item}</li>
														{/each}
													</ul>
												</div>
											{/if}

											{#if version.removed && version.removed.length > 0}
												<div class="mb-3">
													<h6 class="text-danger fw-bold">
														<i class="bi bi-x-circle me-2"></i>削除
													</h6>
													<ul class="mb-0 text-muted">
														{#each version.removed as item}
															<li>{item}</li>
														{/each}
													</ul>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						</div>

						<div class="card mb-4 border-danger">
							<div class="card-header bg-danger text-white">
								<h5 class="mb-0">
									<i class="bi bi-exclamation-triangle-fill me-2"></i>デモ環境用リセット
								</h5>
							</div>
							<div class="card-body">
								<p class="card-text">
									データベースを初期化し、デモ用のサンプルデータを再生成します。<br />
									<strong>注意: これにより現在のすべてのデータが削除されます。</strong>
								</p>
								<button
									class="btn btn-danger"
									on:click={initializeDatabase}
									disabled={isInitializing}
								>
									{#if isInitializing}
										<span
											class="spinner-border spinner-border-sm me-2"
											role="status"
											aria-hidden="true"
										></span>
										初期化中...
									{:else}
										<i class="bi bi-database-fill-gear me-2"></i>
										データベースを初期化
									{/if}
								</button>
							</div>
						</div>

						<div class="card mb-4 border-warning">
							<div class="card-header bg-warning text-dark">
								<h5 class="mb-0">
									<i class="bi bi-tools me-2"></i>ログイン不具合の解消
								</h5>
							</div>
							<div class="card-body">
								<p class="card-text">
									デスクトップアプリなどで、強制終了などが原因でログインできなくなった場合に実行してください。<br
									/>
									APIのレート制限をリセットし、一時ファイルを削除します。
								</p>
								<button class="btn btn-warning" on:click={requestLoginFix} disabled={isFixingLogin}>
									{#if isFixingLogin}
										<span
											class="spinner-border spinner-border-sm me-2"
											role="status"
											aria-hidden="true"
										></span>
										処理中...
									{:else}
										<i class="bi bi-wrench-adjustable me-2"></i>
										ログイン不具合を解消
									{/if}
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

{#if showAddHolidayModal}
	<div class="modal show d-block" tabindex="-1">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h5 class="modal-title">祝日を追加</h5>
					<button
						type="button"
						class="btn-close"
						on:click={closeAddHolidayModal}
						disabled={isAddingHoliday}
						aria-label="閉じる"
					></button>
				</div>
				<div class="modal-body">
					<form on:submit|preventDefault={addHoliday}>
						<div class="mb-3">
							<label for="holidayDate" class="form-label"
								>日付 <span class="text-danger">*</span></label
							>
							<input
								type="date"
								class="form-control"
								id="holidayDate"
								bind:value={newHoliday.holiday_date}
								disabled={isAddingHoliday}
								required
							/>
						</div>

						<div class="mb-3">
							<label for="holidayName" class="form-label"
								>祝日名 <span class="text-danger">*</span></label
							>
							<input
								type="text"
								class="form-control"
								id="holidayName"
								bind:value={newHoliday.holiday_name}
								placeholder="例: 元日"
								disabled={isAddingHoliday}
								required
							/>
						</div>

						<div class="mb-3">
							<label for="holidayType" class="form-label">種類</label>
							<select
								class="form-select"
								id="holidayType"
								bind:value={newHoliday.holiday_type}
								disabled={isAddingHoliday}
							>
								<option value="national">国民の祝日</option>
								<option value="company">会社休日</option>
								<option value="other">その他</option>
							</select>
						</div>

						<div class="mb-3 form-check">
							<input
								type="checkbox"
								class="form-check-input"
								id="isRecurring"
								bind:checked={newHoliday.is_recurring}
								disabled={isAddingHoliday}
							/>
							<label class="form-check-label" for="isRecurring"> 毎年繰り返す </label>
						</div>

						<div class="mb-3">
							<label for="holidayNotes" class="form-label">備考</label>
							<textarea
								class="form-control"
								id="holidayNotes"
								rows="2"
								bind:value={newHoliday.notes}
								disabled={isAddingHoliday}
							></textarea>
						</div>
					</form>
				</div>
				<div class="modal-footer">
					<button
						type="button"
						class="btn btn-secondary"
						on:click={closeAddHolidayModal}
						disabled={isAddingHoliday}
					>
						キャンセル
					</button>
					<button
						type="button"
						class="btn btn-primary"
						on:click={addHoliday}
						disabled={isAddingHoliday}
					>
						{isAddingHoliday ? '追加中...' : '追加'}
					</button>
				</div>
			</div>
		</div>
	</div>
	<div class="modal-backdrop show"></div>
{/if}

{#if showImportHolidayModal}
	<div class="modal show d-block" tabindex="-1">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h5 class="modal-title">日本の祝日をインポート</h5>
					<button
						type="button"
						class="btn-close"
						on:click={closeImportHolidayModal}
						disabled={isImportingHolidays}
						aria-label="閉じる"
					></button>
				</div>
				<div class="modal-body">
					<p class="text-muted mb-3">
						インポートする年度範囲を選択してください。選択した期間の日本の国民の祝日が自動的に生成されます。
					</p>

					<form on:submit|preventDefault={importHolidaysInRange}>
						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="importYearStart" class="form-label"
									>開始年 <span class="text-danger">*</span></label
								>
								<input
									type="number"
									class="form-control"
									id="importYearStart"
									bind:value={importYearStart}
									min="1955"
									max="2099"
									disabled={isImportingHolidays}
									required
								/>
							</div>
							<div class="col-md-6 mb-3">
								<label for="importYearEnd" class="form-label"
									>終了年 <span class="text-danger">*</span></label
								>
								<input
									type="number"
									class="form-control"
									id="importYearEnd"
									bind:value={importYearEnd}
									min="1955"
									max="2099"
									disabled={isImportingHolidays}
									required
								/>
							</div>
						</div>

						<div class="alert alert-success">
							<i class="bi bi-check-circle me-2"></i>
							<strong>信頼できるデータソース:</strong>
							<p class="mb-2">
								内閣府の公式データに基づいた <code>japanese-holidays</code> ライブラリを使用しています。
							</p>
							<ul class="mb-0 mt-2">
								<li>すべての国民の祝日（元日、建国記念の日、天皇誕生日など）</li>
								<li>ハッピーマンデー（成人の日、海の日、敬老の日、スポーツの日）</li>
								<li>天文計算に基づく春分の日・秋分の日</li>
								<li><strong>振替休日も自動的に含まれます</strong></li>
							</ul>
							<small class="text-muted">※ 既に登録されている祝日はスキップされます</small>
						</div>
					</form>
				</div>
				<div class="modal-footer">
					<button
						type="button"
						class="btn btn-secondary"
						on:click={closeImportHolidayModal}
						disabled={isImportingHolidays}
					>
						キャンセル
					</button>
					<button
						type="button"
						class="btn btn-primary"
						on:click={importHolidaysInRange}
						disabled={isImportingHolidays}
					>
						<i class="bi bi-download me-1"></i>
						{isImportingHolidays ? 'インポート中...' : 'インポート'}
					</button>
				</div>
			</div>
		</div>
	</div>
	<div class="modal-backdrop show"></div>
{/if}

{#if showUserModal}
	<div class="modal show d-block" tabindex="-1">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h5 class="modal-title">{editingUser ? 'ユーザーを編集' : 'ユーザーを追加'}</h5>
					<button
						type="button"
						class="btn-close"
						on:click={closeUserModal}
						disabled={isSavingUser}
						aria-label="閉じる"
					></button>
				</div>
				<div class="modal-body">
					<form on:submit|preventDefault={saveUser}>
						<div class="mb-3">
							<label for="username" class="form-label"
								>ユーザー名 <span class="text-danger">*</span></label
							>
							<input
								type="text"
								class="form-control"
								id="username"
								bind:value={userForm.username}
								placeholder="例: yamada_taro"
								required
								disabled={!!editingUser || isSavingUser}
							/>
							{#if editingUser}
								<small class="text-muted">ユーザー名は変更できません</small>
							{/if}
						</div>

						<div class="mb-3">
							<label for="fullName" class="form-label"
								>氏名 <span class="text-danger">*</span></label
							>
							<input
								type="text"
								class="form-control"
								id="fullName"
								bind:value={userForm.fullName}
								placeholder="例: 山田 太郎"
								required
								disabled={isSavingUser}
							/>
						</div>

						<div class="mb-3">
							<label for="email" class="form-label"
								>メールアドレス <span class="text-danger">*</span></label
							>
							<input
								type="email"
								class="form-control"
								id="email"
								bind:value={userForm.email}
								placeholder="例: yamada@example.com"
								required
								disabled={isSavingUser}
							/>
						</div>

						<div class="mb-3">
							<label for="role" class="form-label">権限</label>
							<select
								class="form-select"
								id="role"
								bind:value={userForm.role}
								disabled={isSavingUser}
							>
								<option value="member">メンバー</option>
								<option value="admin">管理者</option>
							</select>
						</div>

						<div class="mb-3">
							<label for="password" class="form-label">
								パスワード
								{#if !editingUser}
									<span class="text-danger">*</span>
								{:else}
									<small class="text-muted">(変更する場合のみ入力)</small>
								{/if}
							</label>
							<input
								type="password"
								class="form-control"
								id="password"
								bind:value={userForm.password}
								placeholder="パスワードを入力"
								required={!editingUser}
								disabled={isSavingUser}
							/>
						</div>
					</form>
				</div>
				<div class="modal-footer">
					<button
						type="button"
						class="btn btn-secondary"
						on:click={closeUserModal}
						disabled={isSavingUser}
					>
						キャンセル
					</button>
					<button type="button" class="btn btn-primary" on:click={saveUser} disabled={isSavingUser}>
						{isSavingUser
							? editingUser
								? '更新中...'
								: '作成中...'
							: editingUser
								? '更新'
								: '作成'}
					</button>
				</div>
			</div>
		</div>
	</div>
	<div class="modal-backdrop show"></div>
{/if}

{#if showPromptModal}
	<div class="modal show d-block" tabindex="-1">
		<div class="modal-dialog modal-lg">
			<div class="modal-content">
				<div class="modal-header">
					<h5 class="modal-title">プロンプト編集: {promptName}</h5>
					<button
						type="button"
						class="btn-close"
						on:click={() => closePromptModal()}
						disabled={isPromptActionInFlight}
						aria-label="閉じる"
					></button>
				</div>
				<div class="modal-body">
					<form on:submit|preventDefault={savePrompt}>
						<div class="mb-3">
							<label for="promptName" class="form-label">プロンプト名</label>
							<input
								type="text"
								class="form-control"
								id="promptName"
								bind:value={promptName}
								disabled
							/>
						</div>

						<div class="mb-3">
							<label for="promptContent" class="form-label">プロンプト内容</label>
							<textarea
								class="form-control font-monospace"
								id="promptContent"
								rows="20"
								bind:value={promptContent}
								placeholder="プロンプトの内容を入力してください"
								disabled={isPromptActionInFlight}
							></textarea>
							<small class="text-muted">
								変数は {'{'}変数名{'}'} の形式で記述します（例: {'{project_name}'}）
							</small>
						</div>

						<div class="alert alert-info">
							<i class="bi bi-info-circle me-2"></i>
							<strong>ヒント:</strong> プロンプトを変更すると、AI機能の動作が変わります。 変更前にバックアップを取ることをお勧めします。
						</div>
					</form>
				</div>
				<div class="modal-footer">
					<button
						type="button"
						class="btn btn-warning me-auto"
						on:click={resetPrompt}
						disabled={isPromptActionInFlight}
					>
						<i class="bi bi-arrow-counterclockwise me-1"></i>
						{isResettingPrompt ? 'リセット中...' : 'デフォルトに戻す'}
					</button>
					<button
						type="button"
						class="btn btn-secondary"
						on:click={() => closePromptModal()}
						disabled={isPromptActionInFlight}
					>
						キャンセル
					</button>
					<button
						type="button"
						class="btn btn-primary"
						on:click={savePrompt}
						disabled={isPromptActionInFlight}
					>
						<i class="bi bi-save me-1"></i>
						{isSavingPrompt ? '保存中...' : '保存'}
					</button>
				</div>
			</div>
		</div>
	</div>
	<div class="modal-backdrop show"></div>
{/if}

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.settings-page {
		padding: 24px;
		max-width: 1200px;
		margin: 0 auto;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	/* Mobile/Tablet Styles (<960px) */
	@media (max-width: 960px) {
		.page-header-wrapper {
			display: block; /* Show header */
			margin: 0;
			background: #1c2638;
			color: #ffffff;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}

		.page-header {
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: flex-start;
			align-items: center;
			padding: 0 24px;
			box-sizing: border-box;
		}

		.header-content {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 4px; /* Ensure 4px gap */
			height: 100%;
		}

		.header-content h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
			line-height: 1.2;
		}

		.header-content p {
			margin: 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
			line-height: 1.4;
		}

		.settings-page {
			padding: 16px;
		}
	}

	.settings-tabs {
		margin-top: 1rem;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.settings-tabs .nav-tabs {
		border-bottom: 1px solid #dee2e6;
		flex-wrap: nowrap;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		scroll-behavior: smooth;
		scrollbar-width: thin;
		scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
	}

	.settings-tabs .nav-tabs::-webkit-scrollbar {
		height: 6px;
	}

	.settings-tabs .nav-tabs::-webkit-scrollbar-track {
		background: transparent;
	}

	.settings-tabs .nav-tabs::-webkit-scrollbar-thumb {
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 3px;
	}

	.settings-tabs .nav-tabs::-webkit-scrollbar-thumb:hover {
		background-color: rgba(0, 0, 0, 0.3);
	}

	.settings-tabs .nav-item {
		flex-shrink: 0;
	}

	.settings-tabs .nav-link {
		white-space: nowrap;
		display: flex;
		align-items: center;
		transition: all 0.2s ease;
	}

	.settings-tabs .nav-link:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}

	.settings-tabs .nav-link.active {
		font-weight: 600;
	}

	.tab-content {
		padding-top: 1.5rem;
	}

	.card {
		border: 1px solid #dee2e6;
		border-radius: 0.5rem;
	}

	.card-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.btn-toolbar {
		display: flex;
		flex-wrap: wrap;
	}

	.modal.show {
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 2000;
	}

	.modal-backdrop {
		z-index: 1999;
	}

	.table th {
		background-color: #f8f9fa;
		font-weight: 600;
	}

	.year-selector {
		flex-wrap: wrap;
	}

	.year-selector .btn-text {
		margin-left: 4px;
		margin-right: 4px;
	}

	.year-display {
		font-size: 18px;
	}

	/* タブレット・モバイル対応 */
	@media (max-width: 768px) {
		.settings-page {
			padding: 1rem;
		}

		.settings-tabs .nav-tabs {
			/* 横スクロール可能に */
			flex-wrap: nowrap;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: thin;
			gap: 4px;
		}

		.settings-tabs .nav-tabs::-webkit-scrollbar {
			height: 4px;
		}

		.settings-tabs .nav-tabs::-webkit-scrollbar-thumb {
			background-color: rgba(0, 0, 0, 0.2);
			border-radius: 2px;
		}

		.settings-tabs .nav-item {
			flex-shrink: 0;
			min-width: auto;
		}

		.settings-tabs .nav-link {
			justify-content: center;
			padding: 10px 16px;
			font-size: 13px;
			white-space: nowrap;
			gap: 6px;
		}

		.settings-tabs .nav-link i {
			font-size: 16px;
		}

		.btn-toolbar {
			flex-direction: column;
			gap: 10px;
		}

		.btn-toolbar .btn {
			width: 100%;
		}

		.d-flex.justify-content-between {
			flex-direction: column;
			align-items: flex-start !important;
			gap: 12px;
		}

		.d-flex.align-items-center {
			flex-wrap: wrap;
		}

		/* テーブルをカードレイアウトに変換 */
		.table thead {
			display: none;
		}

		.table,
		.table tbody,
		.table tr,
		.table td {
			display: block;
			width: 100%;
		}

		.table tr {
			margin-bottom: 1rem;
			border: 1px solid #dee2e6;
			border-radius: 8px;
			padding: 0.75rem;
			background: #f8f9fa;
		}

		.table td {
			text-align: left;
			padding: 0.5rem 0;
			border: none;
			position: relative;
			padding-left: 50%;
		}

		.table td::before {
			content: attr(data-label);
			position: absolute;
			left: 0;
			width: 45%;
			padding-right: 10px;
			font-weight: 600;
			text-align: left;
			font-size: 12px;
			color: #6b7280;
		}

		.btn-group {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		}

		.btn-group .btn {
			flex: 1;
		}

		.card {
			max-width: 100%;
			overflow-x: hidden;
		}

		.card-body {
			max-width: 100%;
			overflow-x: hidden;
		}

		.table-responsive {
			max-width: 100%;
			overflow-x: hidden;
		}
	}

	/* 中間画面サイズ（600px以下） */
	@media (max-width: 600px) {
		.settings-tabs .nav-link {
			padding: 10px 12px;
			font-size: 12px;
			gap: 4px;
		}

		.settings-tabs .nav-link i {
			font-size: 14px;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.settings-page {
			padding: 12px;
			max-width: 100%;
			overflow-x: hidden;
		}

		.settings-tabs .nav-tabs {
			border-bottom: 2px solid #dee2e6;
			margin-bottom: 0;
			padding-bottom: 0;
		}

		.settings-tabs .nav-item {
			flex-shrink: 0;
		}

		.settings-tabs .nav-link {
			padding: 10px 14px;
			font-size: 11px;
			min-height: 44px;
			gap: 3px;
			border-radius: 8px 8px 0 0;
		}

		.settings-tabs .nav-link.active {
			border-bottom: 2px solid #0d6efd;
			font-weight: 600;
		}

		.settings-tabs .nav-link i {
			font-size: 16px;
		}

		.tab-content {
			padding-top: 16px;
		}

		.card {
			margin-bottom: 16px;
			border-radius: 12px;
		}

		.card-body {
			padding: 16px;
		}

		.card-title {
			font-size: 18px;
		}

		.form-label {
			font-size: 13px;
			font-weight: 600;
		}

		.form-control,
		.form-select {
			padding: 10px 12px;
			font-size: 14px;
			min-height: 44px;
		}

		textarea.form-control {
			min-height: 120px;
		}

		.btn {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
		}

		.table tr {
			padding: 12px;
			margin-bottom: 12px;
			border-radius: 10px;
		}

		.table td {
			padding: 8px 0;
			padding-left: 50%;
			font-size: 13px;
		}

		.table td::before {
			font-size: 11px;
		}

		.btn-group {
			flex-direction: column;
			width: 100%;
		}

		.btn-group .btn {
			width: 100%;
		}

		.modal-dialog {
			margin: 0;
			max-width: 100%;
			height: 100%;
		}

		.modal-content {
			height: 100%;
			border-radius: 0;
		}

		.modal-header {
			padding: 14px 16px;
		}

		.modal-title {
			font-size: 18px;
		}

		.modal-body {
			padding: 16px;
			overflow-y: auto;
		}

		.modal-footer {
			padding: 12px 16px;
			flex-direction: column;
			gap: 8px;
		}

		.modal-footer .btn {
			width: 100%;
			margin: 0 !important;
		}

		.modal-footer .me-auto {
			margin: 0 !important;
		}

		.alert {
			padding: 12px;
			font-size: 13px;
		}
	}

	/* 390px以下での最適化 */
	@media (max-width: 390px) {
		.settings-page {
			padding: 10px;
			max-width: 100vw;
			overflow-x: hidden;
		}

		.settings-tabs .nav-tabs {
			gap: 2px;
		}

		.settings-tabs .nav-link {
			padding: 8px 10px;
			font-size: 10px;
			min-height: 44px;
			gap: 2px;
		}

		.settings-tabs .nav-link i {
			font-size: 14px;
		}

		.tab-content {
			padding-top: 12px;
		}

		.card {
			margin-bottom: 12px;
			border-radius: 10px;
		}

		.card-body {
			padding: 12px;
		}

		.card-title {
			font-size: 16px;
		}

		.form-label {
			font-size: 12px;
		}

		.form-control,
		.form-select {
			padding: 8px 10px;
			font-size: 13px;
			min-height: 40px;
		}

		textarea.form-control {
			min-height: 100px;
		}

		.btn {
			padding: 10px 14px;
			font-size: 13px;
			min-height: 44px;
		}

		.btn-sm {
			padding: 8px 12px;
			font-size: 12px;
			min-height: 40px;
		}

		.table tr {
			padding: 10px;
			margin-bottom: 10px;
			border-radius: 8px;
		}

		.table td {
			padding: 6px 0;
			padding-left: 48%;
			font-size: 12px;
		}

		.table td::before {
			font-size: 10px;
			width: 44%;
		}

		.badge {
			font-size: 10px;
			padding: 4px 8px;
		}

		.modal-dialog {
			margin: 0;
			width: 100%;
			max-width: 100%;
			height: 100%;
		}

		.modal-header {
			padding: 12px;
		}

		.modal-title {
			font-size: 16px;
		}

		.modal-body {
			padding: 12px;
		}

		.modal-footer {
			padding: 10px 12px;
		}

		.alert {
			padding: 10px;
			font-size: 12px;
			border-radius: 8px;
		}

		.d-flex.justify-content-between .card-title {
			margin-bottom: 8px;
		}

		.btn-toolbar {
			gap: 8px;
		}

		.year-selector .btn-text {
			display: none;
		}

		.year-display {
			font-size: 16px;
		}
	}
</style>
