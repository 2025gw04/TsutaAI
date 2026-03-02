# =================================
# TsutaAI Backend API Dockerfile
# =================================

# ベースイメージ（Node.js 18 Alpine）
FROM node:18-alpine AS base

# 作業ディレクトリ
WORKDIR /app

# メタデータ
LABEL maintainer="TsutaAI Team"
LABEL version="1.0.0"
LABEL description="TsutaAI Backend API Server"

# =================================
# 依存関係インストールステージ
# =================================
FROM base AS dependencies

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 本番依存関係のみインストール
RUN npm ci --only=production --ignore-scripts

# 開発依存関係も含めてインストール（ビルド用）
RUN npm ci --ignore-scripts

# =================================
# 本番用ビルドステージ
# =================================
FROM base AS production

# 本番環境フラグ
ENV NODE_ENV=production

# 必要な依存関係のみコピー
COPY --from=dependencies /app/node_modules ./node_modules

# ソースコードをコピー
COPY . .

# ログディレクトリの作成
RUN mkdir -p logs && chmod 755 logs

# SSL証明書ディレクトリの作成（オプション）
RUN mkdir -p ssl && chmod 700 ssl

# 非rootユーザーを作成
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# ファイルの所有権を変更
RUN chown -R nodejs:nodejs /app

# ユーザーを切り替え
USER nodejs

# ポートを公開
EXPOSE 3443

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT:-3443}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 起動コマンド
CMD ["node", "src/app.js"]

# =================================
# 開発用ステージ
# =================================
FROM base AS development

# 開発環境フラグ
ENV NODE_ENV=development

# 全依存関係をコピー（devDependenciesも含む）
COPY --from=dependencies /app/node_modules ./node_modules

# ソースコードをコピー
COPY . .

# ログディレクトリの作成
RUN mkdir -p logs && chmod 755 logs

# ポートを公開
EXPOSE 3001

# 開発用起動コマンド（nodemonを使用）
CMD ["npm", "run", "dev"]

# =================================
# テスト用ステージ
# =================================
FROM base AS test

# テスト環境フラグ
ENV NODE_ENV=test

# 全依存関係をコピー
COPY --from=dependencies /app/node_modules ./node_modules

# ソースコードとテストをコピー
COPY . .

# テストログディレクトリの作成
RUN mkdir -p logs/test && chmod 755 logs/test

# テスト実行コマンド
CMD ["npm", "test"]
