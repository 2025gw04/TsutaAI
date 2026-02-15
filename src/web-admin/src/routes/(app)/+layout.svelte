<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { derived } from 'svelte/store';
	import { authStore, logout } from '$lib/stores/auth';
	import { websocketClient } from '$lib/services/websocket';
	import { onMount, onDestroy } from 'svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import { browser } from '$app/environment';

	interface NavItem {
		path: string;
		icon: string;
		label: string;
		description: string;
		allowedRoles?: string[];
	}

	interface NavCategory {
		id: string;
		label: string;
		icon: string;
		expanded: boolean;
		items: NavItem[];
		allowedRoles?: string[];
	}

	/** 現在ログイン中の利用者情報を保持する派生ストア */
	const currentUser = derived(authStore, ($auth) => $auth);

	// WebSocket接続状態を管理
	let wsConnected = false;
	const unsubscribe = websocketClient.status.subscribe((status) => {
		wsConnected = status === 'connected';
	});

	onMount(() => {
		// ログイン中であればWebSocket接続を確立
		if ($currentUser && $currentUser.id) {
			websocketClient.connect($currentUser.id);
		}
	});

	onDestroy(() => {
		unsubscribe();
		websocketClient.disconnect();
	});

	/** サイドナビゲーションに表示するカテゴリー別メニュー設定 */
	const navCategories: NavCategory[] = [
		{
			id: 'overview',
			label: '概要・分析',
			icon: 'bar-chart-line',
			expanded: true,
			items: [
				{
					path: '/dashboard',
					icon: 'speedometer2',
					label: 'ダッシュボード',
					description: '進捗とAIインサイト'
				},
				{
					path: '/reports',
					icon: 'file-earmark-text',
					label: 'レポート出力',
					description: '各種レポート生成'
				},
				{
					path: '/alerts',
					icon: 'exclamation-triangle',
					label: 'AIアラート',
					description: 'リスクと提案履歴'
				}
			]
		},
		{
			id: 'projects',
			label: 'プロジェクト管理',
			icon: 'folder',
			expanded: true,
			items: [
				{
					path: '/projects',
					icon: 'diagram-3',
					label: 'プロジェクト一覧',
					description: '案件の計画と配下タスク'
				},
				{
					path: '/estimates',
					icon: 'calculator',
					label: '見積もり',
					description: 'AI効率化見積もり',
					allowedRoles: ['admin']
				},
				{
					path: '/sprints',
					icon: 'calendar-check',
					label: 'スプリント管理',
					description: 'スプリント目標と進捗'
				},
				{
					path: '/project-health',
					icon: 'heart-pulse-fill',
					label: 'プロジェクト健全性',
					description: '健全性スコアとクリティカルパス'
				}
			]
		},
		{
			id: 'tasks',
			label: '進捗・タスク管理',
			icon: 'list-check',
			expanded: true,
			items: [
				{
					path: '/progress-tracking',
					icon: 'graph-up-arrow',
					label: '進捗トラッキング',
					description: 'AI進捗予測と分析'
				},
				{
					path: '/daily-reports',
					icon: 'journal-text',
					label: '日報一覧',
					description: '自己評価とAI分析',
					allowedRoles: ['admin']
				},
				{
					path: '/work-reports',
					icon: 'clipboard-data',
					label: '作業報告',
					description: '日報と作業ログ',
					allowedRoles: ['admin']
				},
				{
					path: '/hourly-activity',
					icon: 'clock-history',
					label: '1時間ごとの活動',
					description: 'デスクトップ活動記録',
					allowedRoles: ['admin']
				}
			]
		},
		{
			id: 'team',
			label: 'チーム管理',
			icon: 'people',
			expanded: true,
			items: [
				{
					path: '/members',
					icon: 'people',
					label: 'メンバー',
					description: '体制・稼働状況',
					allowedRoles: ['admin']
				},
				{
					path: '/vacations',
					icon: 'calendar-event',
					label: '休暇管理',
					description: '休暇予定と影響分析'
				},
				{
					path: '/mental-health',
					icon: 'heart-pulse',
					label: 'メンタルヘルス',
					description: 'チームの心理的安全性',
					allowedRoles: ['admin']
				},
				{
					path: '/help-requests',
					icon: 'question-circle',
					label: 'ヘルプリクエスト',
					description: 'コンテキスト付きヘルプ'
				}
			]
		},
		{
			id: 'system',
			label: 'システム',
			icon: 'gear',
			expanded: true,
			allowedRoles: ['admin'],
			items: [{ path: '/settings', icon: 'gear', label: '設定', description: 'システム設定' }]
		}
	];

	// カテゴリーの展開状態を管理
	let categoryStates = navCategories.reduce(
		(acc, cat) => {
			acc[cat.id] = cat.expanded;
			return acc;
		},
		{} as Record<string, boolean>
	);

	function toggleCategory(categoryId: string) {
		categoryStates[categoryId] = !categoryStates[categoryId];
	}

	/** 左カラムに表示するショートカットアクションの一覧 */
	const quickActions = [
		{ label: 'WBSを生成', icon: 'robot', href: '/projects?action=generate-wbs' }
	];

	/** 現在のページ情報を取得 */
	const pageInfo = derived(page, ($page) => {
		const pathname = $page.url.pathname;
		// カテゴリーから全アイテムをフラット化
		const allItems = navCategories.flatMap((cat) => cat.items);
		const navItem = allItems.find((item) => pathname.startsWith(item.path.split('?')[0]));
		return navItem || { label: '', description: '' };
	});

	/**
	 * ロールベースのフィルタリング
	 * 現在のユーザーのロールに基づいて、表示すべきカテゴリーをフィルタリングします
	 */
	$: filteredCategories = navCategories
		.map((group) => {
			// カテゴリー自体に制限がある場合
			if (
				group.allowedRoles &&
				(!$currentUser?.role || !group.allowedRoles.includes($currentUser.role))
			) {
				return null;
			}

			// アイテムのフィルタリング
			const filteredItems = group.items.filter((item) => {
				if (
					item.allowedRoles &&
					(!$currentUser?.role || !item.allowedRoles.includes($currentUser.role))
				) {
					return false;
				}
				return true;
			});

			if (filteredItems.length === 0) return null;

			return {
				...group,
				items: filteredItems
			};
		})
		.filter((c): c is NavCategory => c !== null); // 型ガードでnull除去

	/**
	 * ルート保護
	 * URL直叩きなどで権限のないページにアクセスした場合にリダイレクトします
	 */
	$: if (browser && $currentUser && ($page.url.pathname as string) !== '/login') {
		const currentPath = $page.url.pathname;

		// すべてのメニュー項目を検索
		let targetItem = null;
		let targetCategory = null;

		for (const cat of navCategories) {
			const item = cat.items.find((i) => currentPath.startsWith(i.path));
			if (item) {
				targetItem = item;
				targetCategory = cat;
				break;
			}
		}

		// 権限チェック
		if (targetCategory && targetItem) {
			const isCategoryAllowed =
				!targetCategory.allowedRoles || targetCategory.allowedRoles.includes($currentUser.role);
			const isItemAllowed =
				!targetItem.allowedRoles || targetItem.allowedRoles.includes($currentUser.role);

			if (!isCategoryAllowed || !isItemAllowed) {
				console.warn(`Access denied to ${currentPath}. Redirecting to dashboard.`);
				goto('/dashboard');
			}
		}
	}

	/**
	 * ログアウト処理
	 * 認証情報をクリアしてログインページにリダイレクト
	 */
	function handleLogout() {
		// WebSocket接続を切断
		websocketClient.disconnect();
		// 認証情報をクリア
		logout();
		// ログインページにリダイレクト
		goto('/');
	}

	// UI state for collapse/expand
	let isSidebarCollapsed = false;
	let isHeaderCollapsed = false;
	let isMobileMenuOpen = false;

	function toggleSidebar() {
		isSidebarCollapsed = !isSidebarCollapsed;
	}

	function toggleHeader() {
		isHeaderCollapsed = !isHeaderCollapsed;
	}

	function toggleMobileMenu() {
		isMobileMenuOpen = !isMobileMenuOpen;
	}

	function closeMobileMenu() {
		isMobileMenuOpen = false;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main class="app-shell" class:sidebar-collapsed={isSidebarCollapsed}>
	<!-- モバイルハンバーガーメニューボタン -->
	<button class="mobile-menu-toggle" on:click={toggleMobileMenu} aria-label="メニュー">
		<i class="bi bi-{isMobileMenuOpen ? 'x' : 'list'}"></i>
	</button>

	<!-- モバイルメニューオーバーレイ -->
	{#if isMobileMenuOpen}
		<button
			class="mobile-menu-overlay"
			on:click={closeMobileMenu}
			on:keydown={(e) => e.key === 'Escape' && closeMobileMenu()}
			aria-label="メニューを閉じる"
		></button>
	{/if}

	<aside class="sidebar" aria-label="メインナビゲーション" class:mobile-open={isMobileMenuOpen}>
		<div class="sidebar-header">
			<div class="brand" class:hidden={isSidebarCollapsed}>
				<div class="logo-block">
					<img src="/logo.png" alt="TsutaAI Logo" class="sidebar-logo" />
					<div class="brand-text">
						<span class="logo-text">ツタAI</span>
						<span class="version-pill">Hub</span>
					</div>
				</div>
				<!-- <p class="tagline">AI戦略とPMO業務を統合する指揮所</p> -->
			</div>
			<button
				class="toggle-sidebar-btn"
				on:click={toggleSidebar}
				title={isSidebarCollapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
			>
				<i class="bi bi-{isSidebarCollapsed ? 'layout-sidebar' : 'layout-sidebar-inset'}"></i>
			</button>
		</div>

		{#if $currentUser}
			<nav class="nav-list">
				{#each filteredCategories as category}
					<div class="nav-category">
						<button
							class="category-header"
							class:collapsed={!categoryStates[category.id]}
							class:hidden={isSidebarCollapsed}
							on:click={() => toggleCategory(category.id)}
						>
							<div class="category-title">
								<i class={`bi bi-${category.icon}`}></i>
								<span>{category.label}</span>
							</div>
							<i class={`bi bi-chevron-${categoryStates[category.id] ? 'down' : 'right'}`}></i>
						</button>

						{#if categoryStates[category.id] || isSidebarCollapsed}
							<div class="category-items" class:sidebar-collapsed={isSidebarCollapsed}>
								{#each category.items as item}
									<a
										class:selected={$page.url.pathname.startsWith(item.path.split('?')[0])}
										href={item.path}
										aria-label={item.label}
										title={isSidebarCollapsed ? item.label : ''}
										on:click={closeMobileMenu}
									>
										<span class="nav-icon">
											<i class={`bi bi-${item.icon}`}></i>
										</span>
										<div class="nav-labels" class:hidden={isSidebarCollapsed}>
											<span class="primary">{item.label}</span>
											<span class="secondary">{item.description}</span>
										</div>
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</nav>

			<section class="quick-actions" aria-label="ショートカット" class:hidden={isSidebarCollapsed}>
				<h2>クイック操作</h2>
				<div class="action-grid">
					{#each quickActions as action}
						<a href={action.href} class="action-chip">
							<i class={`bi bi-${action.icon}`}></i>
							<span>{action.label}</span>
						</a>
					{/each}
				</div>
			</section>

			<footer
				class="user-card"
				class:ws-disconnected={!wsConnected}
				class:collapsed={isSidebarCollapsed}
			>
				<div class="notification-wrapper">
					<NotificationBell />
				</div>
				<div class="user-info" class:hidden={isSidebarCollapsed}>
					<div class="user-meta">
						<p class="name">{$currentUser.fullName}</p>
						<p class="role">{$currentUser.role}</p>
					</div>
					<div class="status-pill">
						<span class="indicator"></span>
						<span>{wsConnected ? 'オンライン' : '切断'}</span>
					</div>
				</div>
				<button
					class="logout-btn"
					on:click={handleLogout}
					title="ログアウト"
					class:full-width={!isSidebarCollapsed}
				>
					<i class="bi bi-box-arrow-right"></i>
					{#if !isSidebarCollapsed}
						<span>ログアウト</span>
					{/if}
				</button>
			</footer>
		{:else}
			<p class="login-message" class:hidden={isSidebarCollapsed}>
				ログイン後にツールへアクセスしてください。
			</p>
		{/if}
	</aside>

	<section class="main-area">
		<div class="content-surface">
			<slot />
		</div>
	</section>
</main>

<style>
	:global(body) {
		font-family: 'Noto Sans JP', 'Inter', sans-serif;
		background-color: #f8f9fa;
	}

	.app-shell {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		min-height: 100vh;
		background:
			radial-gradient(circle at left 20% top 20%, rgba(59, 130, 246, 0.04), transparent 60%),
			radial-gradient(circle at right 5% bottom 30%, rgba(124, 58, 237, 0.03), transparent 65%),
			#ffffff;
		color: #1f2937;
		transition: grid-template-columns 0.3s ease;
	}

	.app-shell.sidebar-collapsed {
		grid-template-columns: 80px minmax(0, 1fr);
	}

	.sidebar {
		padding: 24px 16px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		background: linear-gradient(160deg, #1e293b, #0f172a);
		border-right: 1px solid #334155;
		box-shadow: 2px 0 12px rgba(0, 0, 0, 0.3);
		transition: padding 0.3s ease;
	}

	.sidebar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 40px;
	}

	.toggle-sidebar-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		font-size: 20px;
		padding: 4px;
		border-radius: 4px;
		transition:
			color 0.2s,
			background 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-left: auto;
	}

	.toggle-sidebar-btn:hover {
		color: #f8fafc;
		background: rgba(255, 255, 255, 0.1);
	}

	.app-shell.sidebar-collapsed .toggle-sidebar-btn {
		margin: 0 auto;
	}

	.brand {
		display: flex;
		flex-direction: column;
		gap: 8px;
		white-space: nowrap;
		opacity: 1;
		transition: opacity 0.2s ease;
	}

	.brand.hidden,
	.nav-labels.hidden,
	.quick-actions.hidden,
	.user-info.hidden,
	.login-message.hidden {
		display: none;
		opacity: 0;
	}

	.logo-block {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.sidebar-logo {
		width: 48px;
		height: 48px;
		object-fit: contain;
	}

	.brand-text {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.logo-text {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #f8fafc;
	}

	.version-pill {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: #60a5fa;
		border: 1px solid #1e3a8a;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(59, 130, 246, 0.15);
	}

	.tagline {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: #94a3b8;
	}

	.nav-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* カスタムスクロールバー - 削除（スクロール不要のため） */

	/* カテゴリー全体のコンテナ */
	.nav-category {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* カテゴリーヘッダー */
	.category-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: transparent;
		border: none;
		border-radius: 10px;
		color: #94a3b8;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s ease;
		width: 100%;
		text-align: left;
	}

	.category-header:hover {
		background: rgba(148, 163, 184, 0.1);
		color: #cbd5e1;
	}

	.category-header.hidden {
		display: none;
	}

	.category-title {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.category-title i {
		font-size: 14px;
	}

	.category-header i:last-child {
		font-size: 12px;
		transition: transform 0.2s ease;
	}

	/* カテゴリーアイテムのコンテナ */
	.category-items {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-left: 0;
		animation: slideDown 0.3s ease;
	}

	.category-items.sidebar-collapsed {
		padding-left: 0;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ナビゲーションアイテム */
	.category-items a {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 16px;
		border-radius: 12px;
		text-decoration: none;
		background: rgba(51, 65, 85, 0.3);
		border: 1px solid rgba(71, 85, 105, 0.4);
		transition: all 0.2s ease;
		color: #e2e8f0;
		white-space: nowrap;
		position: relative;
		overflow: hidden;
	}

	/* ホバー時のグラデーション効果 */
	.category-items a::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.1), transparent);
		transition: left 0.5s ease;
	}

	.category-items a:hover::before {
		left: 100%;
	}

	.app-shell.sidebar-collapsed .category-items a {
		padding: 12px;
		justify-content: center;
		border-radius: 12px;
	}

	.category-items a .nav-icon {
		display: inline-flex;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		justify-content: center;
		align-items: center;
		background: rgba(59, 130, 246, 0.15);
		color: #60a5fa;
		font-size: 15px;
		flex-shrink: 0;
		transition: all 0.2s ease;
	}

	.nav-labels {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.nav-labels .primary {
		font-weight: 600;
		font-size: 14px;
		line-height: 1.3;
	}

	.nav-labels .secondary {
		font-size: 11px;
		color: #64748b;
		line-height: 1.4;
	}

	.category-items a:hover {
		transform: translateX(4px);
		border: 1px solid rgba(59, 130, 246, 0.5);
		background: rgba(59, 130, 246, 0.12);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
	}

	.category-items a:hover .nav-icon {
		background: rgba(59, 130, 246, 0.25);
		color: #93c5fd;
		transform: scale(1.1);
	}

	.app-shell.sidebar-collapsed .category-items a:hover {
		transform: translateY(-2px);
	}

	.category-items a.selected {
		border: 1px solid #3b82f6;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(99, 102, 241, 0.2));
		box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
	}

	.category-items a.selected .nav-icon {
		background: rgba(59, 130, 246, 0.3);
		color: #93c5fd;
		box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
	}

	.quick-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.quick-actions h2 {
		font-size: 13px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #64748b;
	}

	.action-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.action-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-radius: 999px;
		background: rgba(59, 130, 246, 0.2);
		color: #93c5fd;
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
		transition:
			background 0.2s ease,
			transform 0.2s ease;
		white-space: nowrap;
	}

	.action-chip:hover {
		background: rgba(59, 130, 246, 0.35);
		transform: translateY(-2px);
	}

	.user-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 18px;
		border-radius: 16px;
		background: rgba(51, 65, 85, 0.5);
		border: 1px solid rgba(71, 85, 105, 0.6);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		white-space: nowrap;
		position: relative;
	}

	.user-card.collapsed {
		align-items: center;
		justify-content: center;
		padding: 8px;
		border-radius: 12px;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
	}

	.user-meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.user-meta .name {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: #f1f5f9;
	}

	.user-meta .role {
		margin: 0;
		font-size: 12px;
		color: #94a3b8;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #047857;
		background: #d1fae5;
		border-radius: 999px;
		padding: 6px 12px;
		width: fit-content;
	}

	.status-pill .indicator {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #34d399;
		box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.24);
	}

	/* WebSocket接続状態が切断時は赤色に変更 */
	:global(.ws-disconnected) .status-pill .indicator {
		background: #ef4444;
		box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.24);
	}

	.logout-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 12px;
		background: rgba(239, 68, 68, 0.2);
		color: #fca5a5;
		font-size: 18px;
		cursor: pointer;
		transition:
			background 0.2s ease,
			transform 0.2s ease,
			color 0.2s ease,
			width 0.2s ease;
		flex-shrink: 0;
	}

	.logout-btn.full-width {
		width: 100%;
		padding: 12px;
		font-size: 15px;
		font-weight: 600;
	}

	.logout-btn:hover {
		background: rgba(239, 68, 68, 0.35);
		color: #fecaca;
		transform: scale(1.05);
	}

	.logout-btn:active {
		transform: scale(0.95);
	}

	.login-message {
		padding: 16px;
		border-radius: 12px;
		background: rgba(51, 65, 85, 0.4);
		border: 1px solid rgba(71, 85, 105, 0.5);
		font-size: 13px;
		color: #94a3b8;
	}

	.main-area {
		position: relative;
		display: flex;
		flex-direction: column;
		/* gap: 24px;  これはcontent-surface内の要素間のギャップとして扱う*/
		padding: 0 !important;
		background: #f9fafb;
		transition: padding 0.3s ease;
	}

	/* NotificationBell adjustments for sidebar */
	.notification-wrapper {
		position: absolute;
		top: 8px;
		right: 18px;
		z-index: 10;
	}

	.user-card.collapsed .notification-wrapper {
		position: static;
	}

	:global(.user-card .notification-bell .bell-button) {
		width: 100%; /* Match width in expanded mode? No, bell is icon */
		background: rgba(255, 255, 255, 0.1);
		color: #94a3b8;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	:global(.user-card .notification-bell .bell-button:hover) {
		background: rgba(255, 255, 255, 0.2);
		color: #f1f5f9;
	}

	/* Expand button width in expanded mode if desired, but bell is usually square. 
     Let's keep it square or auto. If square, centered. */

	:global(.user-card .notification-bell .notification-dropdown) {
		top: auto;
		bottom: calc(100% + 12px);
		right: auto; /* Default was right:0 */
		left: 0;
		transform-origin: bottom left;
	}

	.content-surface {
		flex: 1;
		display: flex;
		flex-direction: column;
		/* gap: 24px; */
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.content-surface :global(.dashboard-container),
	.content-surface :global(.page-container) {
		margin: 0;
	}

	/* モバイルメニュー用のスタイル */
	.mobile-menu-toggle {
		display: none;
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 1001;
		background: linear-gradient(160deg, #1e293b, #0f172a);
		border: 1px solid #334155;
		color: #f8fafc;
		width: 48px;
		height: 48px;
		border-radius: 12px;
		font-size: 24px;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: all 0.3s ease;
	}

	.mobile-menu-toggle:hover {
		background: linear-gradient(160deg, #334155, #1e293b);
		transform: scale(1.05);
	}

	.mobile-menu-overlay {
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 999;
	}

	@media (max-width: 1200px) {
		.app-shell {
			grid-template-columns: 280px 1fr;
		}
		.app-shell.sidebar-collapsed {
			grid-template-columns: 80px minmax(0, 1fr);
		}
	}

	@media (max-width: 960px) {
		.mobile-menu-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.mobile-menu-overlay {
			display: block;
		}

		.app-shell,
		.app-shell.sidebar-collapsed {
			grid-template-columns: 1fr;
		}

		.sidebar {
			position: fixed;
			top: 0;
			left: -100%;
			width: 320px;
			height: 100vh;
			z-index: 1000;
			padding: 24px 16px;
			transition: left 0.3s ease;
			overflow-y: auto;
		}

		.sidebar.mobile-open {
			left: 0;
		}

		.sidebar-header {
			display: flex;
		}

		.toggle-sidebar-btn {
			display: none;
		}

		.brand.hidden,
		.nav-labels.hidden,
		.quick-actions.hidden,
		.user-info.hidden {
			display: flex;
			opacity: 1;
		}

		.nav-list {
			flex-direction: column;
		}

		.nav-category {
			flex-direction: column;
		}

		.category-header {
			display: flex;
		}

		.category-header.hidden {
			display: flex;
		}

		.category-items {
			flex-direction: column;
			padding-left: 0;
		}

		.category-items.sidebar-collapsed {
			padding-left: 0;
		}

		.category-items a {
			padding: 12px 16px;
			justify-content: flex-start;
		}

		.nav-labels {
			display: flex;
		}

		.quick-actions {
			display: flex;
		}

		.user-info {
			display: flex;
		}

		.user-card.collapsed {
			align-items: flex-start;
			padding: 16px 18px;
		}

		.logout-btn {
			width: 100%;
			padding: 12px;
			font-size: 15px;
			font-weight: 600;
		}

		.main-area {
			padding: 80px 24px 24px;
		}

		.workspace-header {
			flex-direction: column;
			align-items: flex-start;
			padding-top: 24px;
		}

		.header-right {
			padding-right: 0;
		}

		.user-summary {
			text-align: left;
		}

		.toggle-header-btn {
			display: none;
		}
	}

	@media (max-width: 768px) {
		.sidebar {
			width: 280px;
		}
	}

	/* 極小画面（480px以下）の追加対応 */
	@media (max-width: 480px) {
		.main-area {
			padding: 80px 16px 16px;
			max-width: 100vw;
			overflow-x: hidden;
			box-sizing: border-box;
		}

		.mobile-menu-toggle {
			width: 44px;
			height: 44px;
			font-size: 20px;
		}

		.sidebar {
			width: 100%;
			max-width: 280px;
		}

		.workspace-header {
			padding-top: 16px;
		}

		.user-summary {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}

		.user-text {
			text-align: left;
		}

		.content-surface {
			max-width: 100%;
			overflow-x: hidden;
		}
	}
</style>
