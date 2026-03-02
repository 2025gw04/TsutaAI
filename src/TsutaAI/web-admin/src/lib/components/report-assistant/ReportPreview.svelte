<script lang="ts">
	export let report: {
		title: string;
		summary: string;
		sections: Array<{
			title: string;
			type: string;
			content: string;
		}>;
		insights: string[];
		metadata: any;
	};

	// Markdownを簡易的にHTMLに変換
	function renderMarkdown(text: string): string {
		return text
			.replace(/^## (.+)$/gm, '<h3>$1</h3>')
			.replace(/^- (.+)$/gm, '<li>$1</li>')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\n\n/g, '<br><br>');
	}

	// ダウンロード機能
	function downloadReport(format: 'markdown' | 'html') {
		let content = '';
		let filename = '';
		let mimeType = '';

		if (format === 'markdown') {
			// Markdown形式
			content = `# ${report.title}\n\n${report.summary}\n\n`;
			report.sections.forEach((section) => {
				content += `${section.content}\n\n`;
			});
			if (report.insights.length > 0) {
				content += `## AI洞察\n\n`;
				report.insights.forEach((insight, i) => {
					content += `${i + 1}. ${insight}\n`;
				});
			}
			filename = `${report.title}.md`;
			mimeType = 'text/markdown';
		} else {
			// HTML形式
			content = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    h2, h3 {
      color: #34495e;
      margin-top: 30px;
    }
    .summary {
      background: #ecf0f1;
      padding: 15px;
      border-left: 4px solid #3498db;
      margin: 20px 0;
    }
    .section {
      margin: 30px 0;
    }
    .insights {
      background: #e8f5e9;
      padding: 15px;
      border-left: 4px solid #4caf50;
      margin: 20px 0;
    }
    ul, ol {
      padding-left: 25px;
    }
    li {
      margin: 8px 0;
    }
    .metadata {
      font-size: 0.9em;
      color: #7f8c8d;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #bdc3c7;
    }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <div class="summary">
    <strong>概要:</strong> ${report.summary}
  </div>
  ${report.sections
		.map(
			(section) => `
    <div class="section">
      ${renderMarkdown(section.content)}
    </div>
  `
		)
		.join('')}
  ${
		report.insights.length > 0
			? `
    <div class="insights">
      <h2>💡 AI洞察</h2>
      <ol>
        ${report.insights.map((insight) => `<li>${insight}</li>`).join('')}
      </ol>
    </div>
  `
			: ''
	}
  <div class="metadata">
    <p>生成日時: ${new Date(report.metadata.generatedAt).toLocaleString('ja-JP')}</p>
  </div>
</body>
</html>
`;
			filename = `${report.title}.html`;
			mimeType = 'text/html';
		}

		// ダウンロード
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="report-preview">
	<div class="preview-header">
		<h2>{report.title}</h2>
		<div class="preview-actions">
			<button class="btn-download" on:click={() => downloadReport('markdown')}>
				<i class="bi bi-file-earmark-text"></i>
				Markdown
			</button>
			<button class="btn-download" on:click={() => downloadReport('html')}>
				<i class="bi bi-file-earmark-code"></i>
				HTML
			</button>
		</div>
	</div>

	<div class="preview-content">
		<div class="summary-box">
			<h3>📋 概要</h3>
			<p>{report.summary}</p>
		</div>

		{#each report.sections as section}
			<div class="section">
				{@html renderMarkdown(section.content)}
			</div>
		{/each}

		{#if report.insights && report.insights.length > 0}
			<div class="insights-box">
				<h3>💡 AI洞察</h3>
				<ol>
					{#each report.insights as insight}
						<li>{insight}</li>
					{/each}
				</ol>
			</div>
		{/if}

		<div class="metadata">
			<small>生成日時: {new Date(report.metadata.generatedAt).toLocaleString('ja-JP')}</small>
		</div>
	</div>
</div>

<style>
	.report-preview {
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px 24px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.preview-header h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
	}

	.preview-actions {
		display: flex;
		gap: 8px;
	}

	.btn-download {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: rgba(255, 255, 255, 0.2);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-download:hover {
		background: rgba(255, 255, 255, 0.3);
		transform: translateY(-1px);
	}

	.preview-content {
		padding: 24px;
		max-height: 600px;
		overflow-y: auto;
	}

	.summary-box {
		background: #f0f4ff;
		padding: 16px;
		border-left: 4px solid #667eea;
		border-radius: 8px;
		margin-bottom: 24px;
	}

	.summary-box h3 {
		margin: 0 0 12px 0;
		font-size: 16px;
		color: #667eea;
	}

	.summary-box p {
		margin: 0;
		line-height: 1.6;
		color: #374151;
	}

	.section {
		margin: 24px 0;
		line-height: 1.8;
	}

	.section :global(h3) {
		color: #1f2937;
		font-size: 18px;
		margin: 20px 0 12px 0;
		font-weight: 600;
	}

	.section :global(li) {
		margin: 8px 0;
		color: #4b5563;
	}

	.section :global(strong) {
		color: #1f2937;
		font-weight: 600;
	}

	.insights-box {
		background: #f0fdf4;
		padding: 16px;
		border-left: 4px solid #10b981;
		border-radius: 8px;
		margin: 24px 0;
	}

	.insights-box h3 {
		margin: 0 0 12px 0;
		font-size: 16px;
		color: #10b981;
	}

	.insights-box ol {
		margin: 0;
		padding-left: 24px;
	}

	.insights-box li {
		margin: 8px 0;
		color: #374151;
		line-height: 1.6;
	}

	.metadata {
		margin-top: 32px;
		padding-top: 16px;
		border-top: 1px solid #e5e7eb;
		text-align: right;
	}

	.metadata small {
		color: #9ca3af;
		font-size: 13px;
	}

	/* スクロールバーのスタイル */
	.preview-content::-webkit-scrollbar {
		width: 8px;
	}

	.preview-content::-webkit-scrollbar-track {
		background: #f1f1f1;
	}

	.preview-content::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 4px;
	}

	.preview-content::-webkit-scrollbar-thumb:hover {
		background: #555;
	}
</style>
