# Backend API

TsutaAIのバックエンドAPIサーバー

## セットアップ

1. 依存パッケージのインストール:
```bash
npm install
```

2. 環境変数の設定:
```bash
cp .env.example .env
```

`.env`ファイルを編集して、必要な環境変数を設定してください。

3. データベースの初期化（**初回起動時のみ**）:

**重要**: backend-apiは起動時に必要なテーブルを自動的に作成します。**既存のデータは保持されます**。

初回起動時にサンプルデータも含めて完全に初期化したい場合のみ、以下のスクリプトを実行してください:

```bash
# プロジェクトルートから実行（初回のみ）
node backend-api/scripts/init-database.js
```

このスクリプトは以下を実行します:
- `database/schema.sql`を読み込んでテーブルを作成
- `database/seed.sql`を読み込んでサンプルデータを投入

**注意**:
- このスクリプトは既存のテーブルがある場合はエラーで停止します（データを保護）
- 通常の起動では、backend-apiが自動的にテーブルを作成するため、このスクリプトは不要です
- **既存のデータを削除したい場合のみ**、データベースファイルを削除してから実行してください

## 起動方法

### 開発モード（nodemon）
```bash
npm run dev
```

### 本番モード
```bash
npm start
```

### カスタムポートで起動
デフォルトではポート3000で起動します。別のポートを使用する場合は以下のいずれかの方法で変更できます:

#### 方法1: .envファイルで設定
```
PORT=3001
```

#### 方法2: コマンドラインで指定
```bash
PORT=3001 npm start
```

## トラブルシューティング

### ポート使用中エラー（EADDRINUSE）

```
Error: listen EADDRINUSE: address already in use :::3000
```

このエラーが発生した場合は、ポート3000が既に使用されています。以下の方法で解決できます:

1. ポート3000を使用しているプロセスを終了する
2. .envファイルでPORT環境変数を設定して別のポートを使用する
3. コマンドラインでポートを指定する（例: `PORT=3001 npm start`）

### データベースエラー（no such table: projects など）

```
{"message":"サーバーエラーが発生しました。","detail":"no such table: projects"}
```

このエラーが発生した場合、データベースが正しく初期化されていません。以下のいずれかの方法で解決できます:

#### 方法1: backend-apiを再起動（自動テーブル作成）

backend-apiは起動時に必要なテーブルを自動的に作成します。サーバーを再起動してください:

```bash
npm start
```

起動ログで以下のようなメッセージが表示されることを確認してください:
```
projectsテーブルを作成しました
tasksテーブルを作成しました
```

#### 方法2: 初期化スクリプトを実行（サンプルデータ付き）

サンプルデータも含めてデータベースを初期化したい場合:

```bash
# プロジェクトルートから実行
node backend-api/scripts/init-database.js
```

**注意**: このスクリプトは既存のテーブルがある場合はエラーになります。完全にリセットしたい場合は、データベースファイルを削除してから実行してください。

### データベース破損エラー（malformed database schema）

```
SqliteError: malformed database schema (idx_tasks_actual_end_date) - invalid rootpage
```

このエラーが発生した場合、データベースのインデックスが破損しています。修復スクリプトを実行してください:

```bash
# プロジェクトルートから実行
node backend-api/scripts/repair-database.js
```

このスクリプトは以下を実行します:
- 破損したインデックスを削除
- インデックスを再作成
- データベースの整合性をチェック

### データベースの状態確認

データベースの現在の状態を確認したい場合:

```bash
# プロジェクトルートから実行
node backend-api/scripts/check-database.js
```

このスクリプトは以下を表示します:
- 存在するテーブルの一覧とレコード数
- projectsテーブルの構造

## 環境変数

| 変数名 | 説明 | デフォルト値 |
|--------|------|------------|
| PORT | サーバーポート番号 | 3000 |
| DATABASE_PATH | SQLiteデータベースファイルのパス | ../database/tsutaai.db |
| GROQ_API_KEY | Groq APIキー | - |
| GROQ_ENDPOINT | Groqエンドポイント | https://api.groq.com/openai/v1/chat/completions |
| PROXY_ENABLED | プロキシを有効にする | false |
| PROXY_URL | プロキシサーバーURL | - |
| PROXY_USERNAME | プロキシ認証ユーザー名 | - |
| PROXY_PASSWORD | プロキシ認証パスワード | - |
