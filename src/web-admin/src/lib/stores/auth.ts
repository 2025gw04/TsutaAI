import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type AuthUser = {
	id: number;
	username: string;
	fullName: string;
	role: string;
	token: string;
};

const initialState: AuthUser | null = browser
	? (() => {
			const json = window.localStorage.getItem('tsutaai.auth');
			return json ? (JSON.parse(json) as AuthUser) : null;
		})()
	: null;

export const authStore = writable<AuthUser | null>(initialState);

if (browser) {
	authStore.subscribe((value) => {
		if (value) {
			window.localStorage.setItem('tsutaai.auth', JSON.stringify(value));
		} else {
			window.localStorage.removeItem('tsutaai.auth');
		}
	});
}

/**
 * ログアウト処理
 * authStoreをnullに設定し、localStorageからトークンを削除します
 */
export function logout() {
	authStore.set(null);
}
