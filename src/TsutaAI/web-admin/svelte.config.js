import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// 静的サイト生成用のadapter-staticを使用（Nginx等での配信用）
		// adapter-autoは一部の環境でのみ動作するため、本番環境では明示的に指定
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: 'index.html', // SPAモード: すべてのルートをindex.htmlにフォールバック
			precompress: false,
			strict: true
		})
	}
};

export default config;
