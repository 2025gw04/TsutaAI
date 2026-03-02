<script lang="ts">
	import { apiClient } from '$lib/api/client';

	export let projectId: number | null = null;
	export let userId: number | null = null;
	export let reportType: 'project' | 'all-projects' | 'user' = 'project';
	export let reportTemplate: string = '';

	let isGenerating = false;
	let isExportingCsv = false;
	let generatedReport: any = null;
	let errorMessage = '';

	// レポートオプション
	let includeTasks = true;
	let includeWorkLogs = true;
	let includeAiInsights = true;
	let includeTeamMetrics = true;
	let includeRiskAssessment = true;
	let includeMetrics = true;
	let includeAlerts = true;
	let includeTaskDetails = true;

	// 日付フィルター
	let startDate = '';
	let endDate = '';

	// レポートフォーマット
	let format: 'json' | 'markdown' | 'html' = 'json';

	function extractReportPayload(response: any) {
		if (response && typeof response === 'object' && 'success' in response) {
			if (response.success === false) {
				throw new Error('レポートの生成に失敗しました');
			}
			return response.data;
		}
		return response;
	}

	$: if (reportTemplate) {
		applyTemplate(reportTemplate);
	}

	function resetTemplateOptions() {
		includeTasks = true;
		includeWorkLogs = true;
		includeAiInsights = true;
		includeTeamMetrics = true;
		includeRiskAssessment = true;
		includeMetrics = true;
		includeAlerts = true;
		includeTaskDetails = true;
	}

	function applyTemplate(template: string) {
		resetTemplateOptions();

		switch (template) {
			case 'project_summary':
				includeTasks = false;
				includeWorkLogs = false;
				includeAiInsights = true;
				includeTeamMetrics = true;
				includeRiskAssessment = true;
				break;
			case 'project_progress':
				includeTasks = true;
				includeWorkLogs = false;
				includeAiInsights = true;
				includeTeamMetrics = true;
				includeRiskAssessment = false;
				break;
			case 'project_effort':
				includeTasks = true;
				includeWorkLogs = true;
				includeAiInsights = false;
				includeTeamMetrics = true;
				includeRiskAssessment = false;
				break;
			case 'all_projects_summary':
				includeMetrics = true;
				includeAlerts = true;
				break;
			case 'user_work':
				includeTaskDetails = true;
				break;
		}
	}

	/**
	 * レポートを生成します
	 */
	async function generateReport() {
		if (isGenerating) return;

		try {
			isGenerating = true;
			errorMessage = '';
			generatedReport = null;

			if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
				errorMessage = '終了日は開始日以降を指定してください';
				return;
			}

			if (reportType === 'project' && projectId) {
				const response = await apiClient.generateProjectReport(projectId, {
					includeTasks,
					includeWorkLogs,
					includeAiInsights,
					includeTeamMetrics,
					includeRiskAssessment,
					startDate: startDate || undefined,
					endDate: endDate || undefined,
					format
				});
				generatedReport = extractReportPayload(response);
			} else if (reportType === 'all-projects') {
				const response = await apiClient.generateAllProjectsReport({
					includeMetrics,
					includeAlerts,
					format
				});
				generatedReport = extractReportPayload(response);
			} else if (reportType === 'user' && userId) {
				const response = await apiClient.generateUserWorkReport(userId, {
					startDate: startDate || undefined,
					endDate: endDate || undefined,
					includeTaskDetails,
					format
				});
				generatedReport = extractReportPayload(response);
			}
		} catch (error: any) {
			errorMessage = error.message || 'レポートの生成に失敗しました';
			console.error('レポート生成エラー:', error);
		} finally {
			isGenerating = false;
		}
	}

	/**
	 * CSVエクスポート
	 */
	function exportCSV() {
		if (!projectId || isExportingCsv) return;

		isExportingCsv = true;
		apiClient.exportProjectReportCSV(projectId).catch((error) => {
			errorMessage = error?.message || 'CSVのエクスポートに失敗しました';
		}).finally(() => {
			isExportingCsv = false;
		});
	}

	/**
	 * Markdownダウンロード
	 */
	function downloadMarkdown() {
		if (!generatedReport || isGenerating) return;

		const markdown = typeof generatedReport === 'string' ? generatedReport : String(generatedReport ?? '');
		const blob = new Blob([markdown], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `report_${Date.now()}.md`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	/**
	 * JSONダウンロード
	 */
	function downloadJSON() {
		if (!generatedReport || isGenerating) return;

		const json = JSON.stringify(generatedReport, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `report_${Date.now()}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	/**
	 * HTMLダウンロード
	 */
	function downloadHTML() {
		if (!generatedReport || isGenerating) return;

		const html = typeof generatedReport === 'string' ? generatedReport : String(generatedReport ?? '');
		const blob = new Blob([html], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `report_${Date.now()}.html`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<div class="report-generator">
	<div class="header">
		<h2>
			<i class="bi bi-file-earmark-text"></i>
			{#if reportType === 'project'}
				プロジェクトレポート生成
			{:else if reportType === 'all-projects'}
				全プロジェクトレポート生成
			{:else}
				作業レポート生成
			{/if}
		</h2>
		<p>詳細なレポートを生成してプロジェクトの進捗を分析できます。</p>
	</div>

	<div class="options-panel">
		<h3>
			<i class="bi bi-gear"></i>
			レポートオプション
		</h3>

		{#if reportType === 'project'}
			<div class="options-grid">
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeTasks} />
					<span>タスク情報を含める</span>
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeWorkLogs} />
					<span>作業ログを含める</span>
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeAiInsights} />
					<span>AIインサイトを含める</span>
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeTeamMetrics} />
					<span>チームメトリクスを含める</span>
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeRiskAssessment} />
					<span>リスク評価を含める</span>
				</label>
			</div>
		{:else if reportType === 'all-projects'}
			<div class="options-grid">
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeMetrics} />
					<span>メトリクスを含める</span>
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeAlerts} />
					<span>アラートを含める</span>
				</label>
			</div>
		{:else if reportType === 'user'}
			<div class="options-grid">
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={includeTaskDetails} />
					<span>タスク詳細を含める</span>
				</label>
			</div>
		{/if}

		<div class="date-range">
			<div class="form-group">
				<label for="startDate">開始日</label>
				<input type="date" id="startDate" bind:value={startDate} />
			</div>
			<div class="form-group">
				<label for="endDate">終了日</label>
				<input type="date" id="endDate" bind:value={endDate} />
			</div>
		</div>

		<div class="format-selector">
			<label>出力フォーマット:</label>
			<div class="radio-group">
				<label>
					<input type="radio" bind:group={format} value="json" />
					JSON
				</label>
				<label>
					<input type="radio" bind:group={format} value="markdown" />
					Markdown
				</label>
				<label>
					<input type="radio" bind:group={format} value="html" />
					HTML
				</label>
			</div>
		</div>
	</div>

	<div class="action-buttons">
		<button type="button" class="btn-generate" on:click={generateReport} disabled={isGenerating}>
			{#if isGenerating}
				<i class="bi bi-hourglass-split"></i>
				生成中...
			{:else}
				<i class="bi bi-play-circle"></i>
				レポート生成
			{/if}
		</button>

		{#if reportType === 'project' && projectId}
			<button type="button" class="btn-export" on:click={exportCSV} disabled={isExportingCsv}>
				<i class="bi bi-file-earmark-spreadsheet"></i>
				{isExportingCsv ? 'エクスポート中...' : 'CSV エクスポート'}
			</button>
		{/if}

		{#if generatedReport && format === 'markdown'}
			<button type="button" class="btn-download" on:click={downloadMarkdown}>
				<i class="bi bi-download"></i>
				Markdown ダウンロード
			</button>
		{/if}

		{#if generatedReport && format === 'html'}
			<button type="button" class="btn-download" on:click={downloadHTML}>
				<i class="bi bi-download"></i>
				HTML ダウンロード
			</button>
		{/if}

		{#if generatedReport && format === 'json'}
			<button type="button" class="btn-download" on:click={downloadJSON}>
				<i class="bi bi-download"></i>
				JSON ダウンロード
			</button>
		{/if}
	</div>

	{#if errorMessage}
		<div class="error-message">
			<i class="bi bi-exclamation-triangle"></i>
			{errorMessage}
		</div>
	{/if}

	{#if generatedReport}
		<div class="report-preview">
			<h3>
				<i class="bi bi-eye"></i>
				レポートプレビュー
			</h3>

			{#if format === 'json'}
				<div class="json-preview">
					<pre>{JSON.stringify(generatedReport, null, 2)}</pre>
				</div>
			{:else if format === 'markdown'}
				<div class="markdown-preview">
					<pre>{generatedReport}</pre>
				</div>
			{:else if format === 'html'}
				<div class="html-preview">
					{@html generatedReport}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.report-generator {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 24px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
	}

	.header h2 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 8px 0;
		font-size: 20px;
		font-weight: 700;
		color: #111827;
	}

	.header p {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
	}

	.options-panel {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 20px;
		background: #f9fafb;
		border-radius: 8px;
	}

	.options-panel h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #374151;
	}

	.options-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}

	.checkbox-option {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: 14px;
		color: #374151;
	}

	.checkbox-option input[type='checkbox'] {
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.date-range {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.form-group input[type='date'] {
		padding: 8px 12px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 14px;
	}

	.format-selector {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.format-selector > label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.radio-group {
		display: flex;
		gap: 16px;
	}

	.radio-group label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		font-size: 14px;
		color: #374151;
	}

	.radio-group input[type='radio'] {
		cursor: pointer;
	}

	.action-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.btn-generate {
		background: linear-gradient(135deg, #3b82f6, #2563eb);
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
	}

	.btn-generate:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
	}

	.btn-generate:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-export {
		background: #10b981;
		color: #ffffff;
		box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
	}

	.btn-export:hover {
		background: #059669;
		transform: translateY(-1px);
	}

	.btn-download {
		background: #8b5cf6;
		color: #ffffff;
		box-shadow: 0 2px 8px rgba(139, 92, 246, 0.2);
	}

	.btn-download:hover {
		background: #7c3aed;
		transform: translateY(-1px);
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 18px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #dc2626;
		font-size: 14px;
	}

	.report-preview {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.report-preview h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #374151;
	}

	.json-preview,
	.markdown-preview {
		max-height: 600px;
		overflow: auto;
		padding: 16px;
		background: #1f2937;
		border-radius: 8px;
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 13px;
	}

	.json-preview pre,
	.markdown-preview pre {
		margin: 0;
		color: #e5e7eb;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.html-preview {
		padding: 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		max-height: 600px;
		overflow: auto;
	}

	@media (max-width: 768px) {
		.options-grid {
			grid-template-columns: 1fr;
		}

		.date-range {
			grid-template-columns: 1fr;
		}

		.action-buttons {
			flex-direction: column;
		}

		button {
			width: 100%;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.report-generator {
			padding: 16px;
			gap: 20px;
		}

		.header h2 {
			font-size: 18px;
			gap: 8px;
		}

		.header h2 i {
			font-size: 18px;
		}

		.header p {
			font-size: 13px;
		}

		.options-panel {
			padding: 16px;
			gap: 16px;
		}

		.options-panel h3 {
			font-size: 15px;
		}

		.checkbox-option {
			padding: 8px 0;
			min-height: 40px;
		}

		.checkbox-option input[type='checkbox'] {
			width: 20px;
			height: 20px;
		}

		.checkbox-option span {
			font-size: 14px;
		}

		.form-group input[type='date'] {
			padding: 10px 12px;
			font-size: 14px;
			min-height: 44px;
		}

		.radio-group {
			flex-direction: column;
			gap: 12px;
		}

		.radio-group label {
			padding: 8px 0;
			min-height: 40px;
		}

		button {
			padding: 14px 18px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
		}

		.error-message {
			padding: 12px 14px;
			font-size: 13px;
		}

		.report-preview h3 {
			font-size: 15px;
		}

		.json-preview,
		.markdown-preview {
			max-height: 400px;
			padding: 12px;
			font-size: 12px;
		}

		.html-preview {
			padding: 16px;
			max-height: 400px;
		}
	}
</style>
