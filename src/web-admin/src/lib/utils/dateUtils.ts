/**
 * 日付ユーティリティ関数
 */

import { apiClient } from '$lib/api/client';

// 祝日キャッシュ（日付文字列をキーとするSet）
let holidayCache = new Set<string>();
let cacheLoadedYears = new Set<number>();

/**
 * 祝日データをAPIから取得してキャッシュ
 */
export async function loadHolidays(year?: number): Promise<void> {
	const targetYear = year ?? new Date().getFullYear();

	// 既にキャッシュ済みの場合はスキップ
	if (cacheLoadedYears.has(targetYear)) {
		return;
	}

	try {
		const response = await apiClient.fetchHolidays(String(targetYear));
		if (response.success) {
			response.data.forEach((holiday: any) => {
				holidayCache.add(holiday.holiday_date);
			});
			cacheLoadedYears.add(targetYear);
		}
	} catch (error) {
		console.error('Failed to load holidays:', error);
		// エラーの場合はフォールバック（デフォルト祝日を使用）
		loadFallbackHolidays(targetYear);
	}
}

/**
 * フォールバック用のデフォルト祝日を読み込む
 */
function loadFallbackHolidays(year: number): void {
	const fallbackHolidays = [
		`${year}-01-01`, // 元日
		`${year}-02-11`, // 建国記念の日
		`${year}-04-29`, // 昭和の日
		`${year}-05-03`, // 憲法記念日
		`${year}-05-04`, // みどりの日
		`${year}-05-05`, // こどもの日
		`${year}-08-11`, // 山の日
		`${year}-11-03`, // 文化の日
		`${year}-11-23` // 勤労感謝の日
	];

	fallbackHolidays.forEach((date) => holidayCache.add(date));
	cacheLoadedYears.add(year);
}

/**
 * 祝日キャッシュをクリア（設定変更時に使用）
 */
export function clearHolidayCache(): void {
	holidayCache.clear();
	cacheLoadedYears.clear();
}

/**
 * 日本の祝日を判定する（キャッシュベース）
 */
export function isJapaneseHoliday(date: Date): boolean {
	const dateStr = formatDate(date);
	return holidayCache.has(dateStr);
}

/**
 * 土日または祝日かどうかを判定
 */
export function isWeekendOrHoliday(date: Date): boolean {
	const dayOfWeek = date.getDay();
	return dayOfWeek === 0 || dayOfWeek === 6 || isJapaneseHoliday(date);
}

/**
 * 営業日数を計算（土日祝日を除外）
 */
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
	let count = 0;
	const current = new Date(startDate);

	while (current <= endDate) {
		if (!isWeekendOrHoliday(current)) {
			count++;
		}
		current.setDate(current.getDate() + 1);
	}

	return count;
}

/**
 * 日付を YYYY-MM-DD 形式にフォーマット
 */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * 日付を YYYY/MM 形式にフォーマット
 */
export function formatYearMonth(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${year}/${month}`;
}
