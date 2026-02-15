const db = require('../services/database');
const logger = require('./logger');

/**
 * 日付計算ユーティリティ
 * 土日祝日を除外した営業日ベースの期間計算を提供
 */

/**
 * データベースから祝日リストを取得（キャッシュ付き）
 * @param {number} year - 年（省略時は今年と来年）
 * @returns {Array<string>} 祝日の配列（YYYY-MM-DD形式）
 */
let holidaysCache = null;
let holidaysCacheYear = null;

function getHolidays(year = null) {
    const currentYear = new Date().getFullYear();
    const targetYear = year || currentYear;

    // キャッシュが有効な場合は再利用
    if (holidaysCache && holidaysCacheYear === targetYear) {
        return holidaysCache;
    }

    try {
        const connection = db.getConnection();

        // 指定年の祝日を取得（年が指定されていない場合は今年と来年）
        let query;
        let params;

        if (year) {
            query = `
        SELECT holiday_date 
        FROM holidays 
        WHERE strftime('%Y', holiday_date) = ?
        ORDER BY holiday_date
      `;
            params = [String(targetYear)];
        } else {
            // 年が指定されていない場合は、今年と来年の祝日を取得
            query = `
        SELECT holiday_date 
        FROM holidays 
        WHERE strftime('%Y', holiday_date) IN (?, ?)
        ORDER BY holiday_date
      `;
            params = [String(currentYear), String(currentYear + 1)];
        }

        const holidays = connection.prepare(query).all(...params);
        const holidayDates = holidays.map(h => h.holiday_date);

        // キャッシュに保存
        holidaysCache = holidayDates;
        holidaysCacheYear = targetYear;

        logger.info(`祝日データを取得しました: ${holidayDates.length}件`);
        return holidayDates;
    } catch (error) {
        logger.error('祝日データの取得に失敗しました:', error);
        return [];
    }
}

/**
 * 祝日キャッシュを無効化
 */
function invalidateHolidaysCache() {
    holidaysCache = null;
    holidaysCacheYear = null;
    logger.info('祝日キャッシュを無効化しました');
}

/**
 * 指定された日付が営業日かどうかを判定
 * @param {string|Date} date - 判定する日付（YYYY-MM-DD形式またはDateオブジェクト）
 * @param {Array<string>} holidays - 祝日の配列（省略時はDBから取得）
 * @returns {boolean} 営業日の場合true
 */
function isWorkingDay(date, holidays = null) {
    const dateObj = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
    const dayOfWeek = dateObj.getDay(); // 0=日曜, 6=土曜

    // 土日チェック
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false;
    }

    // 祝日チェック
    const dateStr = formatDate(dateObj);
    const holidayList = holidays || getHolidays();

    return !holidayList.includes(dateStr);
}

/**
 * 次の営業日を取得
 * @param {string|Date} date - 基準日
 * @param {Array<string>} holidays - 祝日の配列（省略時はDBから取得）
 * @returns {string} 次の営業日（YYYY-MM-DD形式）
 */
function getNextWorkingDay(date, holidays = null) {
    let currentDate = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
    const holidayList = holidays || getHolidays();

    // 最大365日先まで検索（無限ループ防止）
    for (let i = 0; i < 365; i++) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (isWorkingDay(currentDate, holidayList)) {
            return formatDate(currentDate);
        }
    }

    // 見つからない場合はエラー
    throw new Error('次の営業日が見つかりませんでした（365日以内）');
}

/**
 * 前の営業日を取得
 * @param {string|Date} date - 基準日
 * @param {Array<string>} holidays - 祝日の配列（省略時はDBから取得）
 * @returns {string} 前の営業日（YYYY-MM-DD形式）
 */
function getPreviousWorkingDay(date, holidays = null) {
    let currentDate = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
    const holidayList = holidays || getHolidays();

    // 最大365日前まで検索（無限ループ防止）
    for (let i = 0; i < 365; i++) {
        currentDate.setDate(currentDate.getDate() - 1);
        if (isWorkingDay(currentDate, holidayList)) {
            return formatDate(currentDate);
        }
    }

    // 見つからない場合はエラー
    throw new Error('前の営業日が見つかりませんでした（365日以内）');
}

/**
 * 開始日と工数から終了日を計算（土日祝を除外）
 * @param {string|Date} startDate - 開始日（YYYY-MM-DD形式またはDateオブジェクト）
 * @param {number} effortDays - 工数（営業日数）
 * @param {Array<string>} holidays - 祝日の配列（省略時はDBから取得）
 * @returns {string} 終了日（YYYY-MM-DD形式）
 */
function calculateEndDate(startDate, effortDays, holidays = null) {
    if (effortDays <= 0) {
        throw new Error('工数は1以上である必要があります');
    }

    let currentDate = typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : new Date(startDate);
    const holidayList = holidays || getHolidays();

    // 開始日が営業日でない場合は、次の営業日から開始
    if (!isWorkingDay(currentDate, holidayList)) {
        currentDate = new Date(getNextWorkingDay(currentDate, holidayList) + 'T00:00:00');
    }

    let remainingDays = effortDays - 1; // 開始日を1日目としてカウント

    // 残りの営業日をカウント
    while (remainingDays > 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (isWorkingDay(currentDate, holidayList)) {
            remainingDays--;
        }
    }

    return formatDate(currentDate);
}

/**
 * 開始日と終了日から工数を計算（土日祝を除外）
 * @param {string|Date} startDate - 開始日（YYYY-MM-DD形式またはDateオブジェクト）
 * @param {string|Date} endDate - 終了日（YYYY-MM-DD形式またはDateオブジェクト）
 * @param {Array<string>} holidays - 祝日の配列（省略時はDBから取得）
 * @returns {number} 工数（営業日数）
 */
function calculateEffortDays(startDate, endDate, holidays = null) {
    let start = typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : new Date(startDate);
    let end = typeof endDate === 'string' ? new Date(endDate + 'T00:00:00') : new Date(endDate);
    const holidayList = holidays || getHolidays();

    if (start > end) {
        throw new Error('開始日は終了日より前である必要があります');
    }

    let workingDays = 0;
    const currentDate = new Date(start);

    while (currentDate <= end) {
        if (isWorkingDay(currentDate, holidayList)) {
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
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 2つの日付の間の営業日数を取得
 * @param {string|Date} startDate - 開始日
 * @param {string|Date} endDate - 終了日
 * @param {Array<string>} holidays - 祝日の配列（省略時はDBから取得）
 * @returns {number} 営業日数
 */
function getWorkingDaysBetween(startDate, endDate, holidays = null) {
    return calculateEffortDays(startDate, endDate, holidays);
}

/**
 * 指定期間内の営業日リストを取得
 * @param {string|Date} startDate - 開始日
 * @param {string|Date} endDate - 終了日
 * @param {Array<string>} holidays - 祝日の配列（省略時はDBから取得）
 * @returns {Array<string>} 営業日の配列（YYYY-MM-DD形式）
 */
function getWorkingDaysList(startDate, endDate, holidays = null) {
    let start = typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : new Date(startDate);
    let end = typeof endDate === 'string' ? new Date(endDate + 'T00:00:00') : new Date(endDate);
    const holidayList = holidays || getHolidays();

    const workingDays = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
        if (isWorkingDay(currentDate, holidayList)) {
            workingDays.push(formatDate(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDays;
}

/**
 * 祝日リストをテキスト形式で取得（AIプロンプト用）
 * @param {number} year - 年（省略時は今年と来年）
 * @returns {string} 祝日リストのテキスト
 */
function getHolidaysText(year = null) {
    const holidays = getHolidays(year);

    if (holidays.length === 0) {
        return '祝日データなし';
    }

    return holidays.map(date => {
        // データベースから祝日名も取得
        try {
            const connection = db.getConnection();
            const holiday = connection.prepare('SELECT holiday_name, holiday_type FROM holidays WHERE holiday_date = ?').get(date);
            if (holiday) {
                return `- ${date} (${holiday.holiday_name})`;
            }
            return `- ${date}`;
        } catch (error) {
            return `- ${date}`;
        }
    }).join('\n');
}

module.exports = {
    getHolidays,
    invalidateHolidaysCache,
    isWorkingDay,
    getNextWorkingDay,
    getPreviousWorkingDay,
    calculateEndDate,
    calculateEffortDays,
    formatDate,
    getWorkingDaysBetween,
    getWorkingDaysList,
    getHolidaysText
};
