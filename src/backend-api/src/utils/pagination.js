/**
 * ページネーション用ユーティリティ
 */

/**
 * クエリパラメータからページネーション設定を解析
 * @param {Object} query - リクエストクエリオブジェクト
 * @param {Object} options - オプション設定
 * @param {number} options.defaultLimit - デフォルトのページサイズ
 * @param {number} options.maxLimit - 最大ページサイズ
 * @returns {Object} ページネーション設定 { page, limit, offset }
 */
function parsePaginationParams(query, options = {}) {
  const defaultLimit = options.defaultLimit || 20;
  const maxLimit = options.maxLimit || 100;

  // ページ番号（1始まり）
  let page = parseInt(query.page) || 1;
  if (page < 1) page = 1;

  // 1ページあたりの件数
  let limit = parseInt(query.limit) || defaultLimit;
  if (limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  // オフセット（0始まり）
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * ページネーション情報を含むレスポンスを生成
 * @param {Array} data - データ配列
 * @param {number} total - 総件数
 * @param {number} page - 現在のページ番号
 * @param {number} limit - 1ページあたりの件数
 * @returns {Object} ページネーション情報を含むレスポンスオブジェクト
 */
function createPaginatedResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Knexクエリにページネーションを適用
 * @param {Object} query - Knexクエリビルダー
 * @param {Object} pagination - ページネーション設定 { limit, offset }
 * @returns {Object} ページネーションが適用されたクエリ
 */
function applyPagination(query, { limit, offset }) {
  return query.limit(limit).offset(offset);
}

/**
 * ソート順序を解析してKnexクエリに適用
 * @param {Object} query - Knexクエリビルダー
 * @param {string} sortBy - ソートフィールド（例: "createdAt", "-updatedAt"）
 * @param {string} defaultSort - デフォルトのソートフィールド
 * @param {Array} allowedFields - 許可されたソートフィールドのリスト
 * @returns {Object} ソートが適用されたクエリ
 */
function applySorting(query, sortBy, defaultSort = 'createdAt', allowedFields = []) {
  let field = sortBy || defaultSort;
  let direction = 'asc';

  // "-fieldName" 形式の場合は降順
  if (field.startsWith('-')) {
    field = field.substring(1);
    direction = 'desc';
  }

  // セキュリティ: 許可されたフィールドのみソート可能
  if (allowedFields.length > 0 && !allowedFields.includes(field)) {
    field = defaultSort;
    direction = 'desc';
  }

  return query.orderBy(field, direction);
}

/**
 * 検索フィルタを適用
 * @param {Object} query - Knexクエリビルダー
 * @param {string} searchTerm - 検索キーワード
 * @param {Array} searchFields - 検索対象フィールドのリスト
 * @returns {Object} 検索フィルタが適用されたクエリ
 */
function applySearch(query, searchTerm, searchFields = []) {
  if (!searchTerm || searchFields.length === 0) {
    return query;
  }

  return query.where((builder) => {
    searchFields.forEach((field, index) => {
      if (index === 0) {
        builder.where(field, 'like', `%${searchTerm}%`);
      } else {
        builder.orWhere(field, 'like', `%${searchTerm}%`);
      }
    });
  });
}

module.exports = {
  parsePaginationParams,
  createPaginatedResponse,
  applyPagination,
  applySorting,
  applySearch
};
