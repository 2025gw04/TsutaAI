/**
 * データベース操作のヘルパー関数
 * Knex.js移行時のDB間差異を吸収するユーティリティ
 */

/**
 * INSERT後のIDを取得するヘルパー関数
 * データベースごとに戻り値形式が異なるため統一化
 *
 * @param {any} result - Knex.jsのinsert結果
 * @param {string} dbClient - DBクライアント種別 ('better-sqlite3', 'sqlite3', 'mysql2', 'pg', 'mssql')
 * @returns {number|null} 挿入されたID
 */
function getInsertedId(result, dbClient) {
  if (!result) return null;

  // PostgreSQLは.returning('id')を使用した場合、オブジェクト配列を返す
  if (dbClient === 'pg') {
    if (Array.isArray(result) && result.length > 0) {
      return result[0]?.id ?? result[0];
    }
    return result.id ?? result;
  }

  // SQLite, MySQL, SQL Serverは配列でIDを返す
  if (Array.isArray(result)) {
    return result[0];
  }

  return result;
}

/**
 * 現在日時を取得（DB非依存）
 * ISO 8601形式の文字列を返す
 *
 * @returns {string} 'YYYY-MM-DD HH:mm:ss' 形式の日時文字列
 */
function getCurrentTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 現在日時を取得（ISO形式）
 *
 * @returns {string} ISO 8601形式の日時文字列
 */
function getCurrentTimestampISO() {
  return new Date().toISOString();
}

/**
 * 現在の日付を取得
 *
 * @returns {string} 'YYYY-MM-DD' 形式の日付文字列
 */
function getCurrentDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 重複キーエラーかどうかを判定
 *
 * @param {Error} error - エラーオブジェクト
 * @returns {boolean} 重複キーエラーの場合true
 */
function isDuplicateKeyError(error) {
  const code = error.code || error.errno;
  const message = error.message || '';

  return (
    // SQLite
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT' ||
    message.includes('UNIQUE constraint failed') ||
    // MySQL
    code === 1062 ||
    code === 'ER_DUP_ENTRY' ||
    // PostgreSQL
    code === '23505' ||
    // SQL Server
    code === 2627 ||
    code === 2601
  );
}

/**
 * 外部キー制約エラーかどうかを判定
 *
 * @param {Error} error - エラーオブジェクト
 * @returns {boolean} 外部キー制約エラーの場合true
 */
function isForeignKeyError(error) {
  const code = error.code || error.errno;
  const message = error.message || '';

  return (
    // SQLite
    code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    message.includes('FOREIGN KEY constraint failed') ||
    // MySQL
    code === 1451 ||
    code === 1452 ||
    code === 'ER_ROW_IS_REFERENCED' ||
    code === 'ER_NO_REFERENCED_ROW' ||
    // PostgreSQL
    code === '23503' ||
    // SQL Server
    code === 547
  );
}

/**
 * NULLチェック制約エラーかどうかを判定
 *
 * @param {Error} error - エラーオブジェクト
 * @returns {boolean} NULLチェック制約エラーの場合true
 */
function isNullConstraintError(error) {
  const code = error.code || error.errno;
  const message = error.message || '';

  return (
    // SQLite
    code === 'SQLITE_CONSTRAINT_NOTNULL' ||
    message.includes('NOT NULL constraint failed') ||
    // MySQL
    code === 1048 ||
    code === 'ER_BAD_NULL_ERROR' ||
    // PostgreSQL
    code === '23502' ||
    // SQL Server
    code === 515
  );
}

/**
 * LIKE検索用のパターンを生成（大文字小文字を区別しない）
 *
 * @param {string} keyword - 検索キーワード
 * @returns {string} LIKE用パターン
 */
function getLikePattern(keyword) {
  // SQLインジェクション対策: %と_をエスケープ
  const escaped = keyword.replace(/[%_]/g, '\\$&');
  return `%${escaped.toLowerCase()}%`;
}

/**
 * NULL値を最後にソートするためのORDER BY句を生成
 *
 * @param {string} column - カラム名
 * @param {string} direction - ソート方向 ('asc' または 'desc')
 * @param {string} dbClient - DBクライアント種別
 * @returns {string} ORDER BY句の文字列
 */
function getNullsLastOrderBy(column, direction = 'asc', dbClient) {
  const dir = direction.toUpperCase();

  if (dbClient === 'pg') {
    return `${column} ${dir} NULLS LAST`;
  }

  // SQLite, MySQL, SQL Server用
  return `CASE WHEN ${column} IS NULL THEN 1 ELSE 0 END, ${column} ${dir}`;
}

/**
 * ブール値をデータベース用の値に変換
 *
 * @param {boolean} value - ブール値
 * @param {string} dbClient - DBクライアント種別
 * @returns {any} データベース用の値
 */
function toBooleanValue(value, dbClient) {
  if (dbClient === 'pg') {
    return value;
  }
  // SQLite, MySQL, SQL Serverは0/1
  return value ? 1 : 0;
}

/**
 * データベースから取得したブール値をJavaScriptのbooleanに変換
 *
 * @param {any} value - データベースから取得した値
 * @returns {boolean} ブール値
 */
function fromBooleanValue(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  return value === 1 || value === '1' || value === true;
}

/**
 * ページネーション用のoffset/limitを計算
 *
 * @param {number} page - ページ番号（1始まり）
 * @param {number} pageSize - ページサイズ
 * @returns {{ offset: number, limit: number }} offset/limit値
 */
function getPagination(page = 1, pageSize = 20) {
  const validPage = Math.max(1, parseInt(page) || 1);
  const validPageSize = Math.max(1, Math.min(100, parseInt(pageSize) || 20));

  return {
    offset: (validPage - 1) * validPageSize,
    limit: validPageSize
  };
}

module.exports = {
  getInsertedId,
  getCurrentTimestamp,
  getCurrentTimestampISO,
  getCurrentDate,
  isDuplicateKeyError,
  isForeignKeyError,
  isNullConstraintError,
  getLikePattern,
  getNullsLastOrderBy,
  toBooleanValue,
  fromBooleanValue,
  getPagination
};
