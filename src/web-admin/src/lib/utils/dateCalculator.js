/**
 * 日付計算ユーティリティ（フロントエンド用）
 * 土日祝日を除外した営業日ベースの期間計算を提供
 */

/**
 * 祝日リストをAPIから取得してキャッシュ
 * @type {Array<string>|null}
 */
let holidaysCache = /** @type {Array<string>|null} */ (null);
/** @type {number|null} */
let holidaysCacheTime = /** @type {number|null} */ (null);
const CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ

/**
 * 祝日リストを取得
 * @param {{ get: (url: string, config?: { params?: Record<string, unknown> }) => Promise<{ data: { success: boolean; data: Array<{ holiday_date: string }> } }> }} apiClient - APIクライアント
 * @returns {Promise<Array<string>>} 祝日の配列（YYYY-MM-DD形式）
 */
export async function getHolidays(apiClient) {
	const now = Date.now();

	// キャッシュが有効な場合は再利用
	if (holidaysCache && holidaysCacheTime && now - holidaysCacheTime < CACHE_TTL) {
		return holidaysCache;
	}

	try {
		const currentYear = new Date().getFullYear();
		const response = await apiClient.get('/holidays', {
			params: { year: currentYear }
		});

		if (response.data && response.data.success) {
			/** @type {Array<string>} */
			const holidays = response.data.data.map(
				(/** @type {{ holiday_date: string }} */ h) => h.holiday_date
			);
			holidaysCache = holidays;
			holidaysCacheTime = now;
			return holidays;
		}

		return [];
	} catch (error) {
		console.error('祝日の取得に失敗しました:', error);
		return [];
	}
}

/**
 * 祝日キャッシュを無効化
 */
export function invalidateHolidaysCache() {
	holidaysCache = null;
	holidaysCacheTime = null;
}

/**
 * 指定された日付が営業日かどうかを判定
 * @param {string|Date} date - 判定する日付
 * @param {Array<string>} holidays - 祝日の配列
 * @returns {boolean} 営業日の場合true
 */
export function isWorkingDay(date, holidays = []) {
	const dateObj = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
	const dayOfWeek = dateObj.getDay(); // 0=日曜, 6=土曜

	// 土日チェック
	if (dayOfWeek === 0 || dayOfWeek === 6) {
		return false;
	}

	// 祝日チェック
	const dateStr = formatDate(dateObj);
	return !holidays.includes(dateStr);
}

/**
 * 次の営業日を取得
 * @param {string|Date} date - 基準日
 * @param {Array<string>} holidays - 祝日の配列
 * @returns {string} 次の営業日（YYYY-MM-DD形式）
 */
export function getNextWorkingDay(date, holidays = []) {
	let currentDate = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);

	// 最大365日先まで検索
	for (let i = 0; i < 365; i++) {
		currentDate.setDate(currentDate.getDate() + 1);
		if (isWorkingDay(currentDate, holidays)) {
			return formatDate(currentDate);
		}
	}

	throw new Error('次の営業日が見つかりませんでした');
}

/**
 * 開始日と工数から終了日を計算（土日祝を除外）
 * @param {string|Date} startDate - 開始日
 * @param {number} effortDays - 工数（営業日数）
 * @param {Array<string>} holidays - 祝日の配列
 * @returns {string} 終了日（YYYY-MM-DD形式）
 */
export function calculateEndDate(startDate, effortDays, holidays = []) {
	if (effortDays <= 0) {
		throw new Error('工数は1以上である必要があります');
	}

	let currentDate =
		typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : new Date(startDate);

	// 開始日が営業日でない場合は、次の営業日から開始
	if (!isWorkingDay(currentDate, holidays)) {
		currentDate = new Date(getNextWorkingDay(currentDate, holidays) + 'T00:00:00');
	}

	let remainingDays = effortDays - 1; // 開始日を1日目としてカウント

	// 残りの営業日をカウント
	while (remainingDays > 0) {
		currentDate.setDate(currentDate.getDate() + 1);
		if (isWorkingDay(currentDate, holidays)) {
			remainingDays--;
		}
	}

	return formatDate(currentDate);
}

/**
 * 開始日と終了日から工数を計算（土日祝を除外）
 * @param {string|Date} startDate - 開始日
 * @param {string|Date} endDate - 終了日
 * @param {Array<string>} holidays - 祝日の配列
 * @returns {number} 工数（営業日数）
 */
export function calculateEffortDays(startDate, endDate, holidays = []) {
	let start =
		typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : new Date(startDate);
	let end = typeof endDate === 'string' ? new Date(endDate + 'T00:00:00') : new Date(endDate);

	if (start > end) {
		throw new Error('開始日は終了日より前である必要があります');
	}

	let workingDays = 0;
	const currentDate = new Date(start);

	while (currentDate <= end) {
		if (isWorkingDay(currentDate, holidays)) {
			workingDays++;
		}
		currentDate.setDate(currentDate.getDate() + 1);
	}

	return workingDays;
}

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 * @param {Date} date - Dateオブジェクト
 * @returns {string} YYYY-MM-DD形式の文字列
 */
export function formatDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 * @returns {string} 今日の日付
 */
export function getToday() {
	return formatDate(new Date());
}

/**
 * 指定期間内の営業日リストを取得
 * @param {string|Date} startDate - 開始日
 * @param {string|Date} endDate - 終了日
 * @param {Array<string>} holidays - 祝日の配列
 * @returns {Array<string>} 営業日の配列（YYYY-MM-DD形式）
 */
export function getWorkingDaysList(startDate, endDate, holidays = []) {
	let start =
		typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : new Date(startDate);
	let end = typeof endDate === 'string' ? new Date(endDate + 'T00:00:00') : new Date(endDate);

	const workingDays = [];
	const currentDate = new Date(start);

	while (currentDate <= end) {
		if (isWorkingDay(currentDate, holidays)) {
			workingDays.push(formatDate(currentDate));
		}
		currentDate.setDate(currentDate.getDate() + 1);
	}

	return workingDays;
}

/**
 * 日付が有効かどうかをチェック
 * @param {string} dateStr - 日付文字列（YYYY-MM-DD形式）
 * @returns {boolean} 有効な日付の場合true
 */
export function isValidDate(dateStr) {
	if (!dateStr || typeof dateStr !== 'string') {
		return false;
	}

	const date = new Date(dateStr + 'T00:00:00');
	return !isNaN(date.getTime());
}

/**
 * 2つの日付を比較
 * @param {string} date1 - 日付1
 * @param {string} date2 - 日付2
 * @returns {number} date1 < date2 なら負、date1 > date2 なら正、同じなら0
 */
export function compareDates(date1, date2) {
	const d1 = new Date(date1 + 'T00:00:00');
	const d2 = new Date(date2 + 'T00:00:00');
	return d1.getTime() - d2.getTime();
}
