# TsutaAI 簡易マニュアル（開発・検証向け）

このドキュメントは、初めて触る人向けの最短セットアップ手順です。  
（詳細は `README.md` を参照）

---

## 1) 全体構成（概要）

- `src/TsutaAI/backend-api/`  
  Node.js + Express の API サーバー。DB・認証・業務ロジックを担当。
- `src/TsutaAI/web-admin/`  
  SvelteKit の管理画面（ブラウザ）。
- `src/TsutaAI/desktop-app/`  
  C# WPF のデスクトップアプリ（Windows）。
- `src/TsutaAI/database/`  
  SQLite DB ファイルや SQL を配置。

---

## 2) 前提環境

- Git
- Node.js 18 以上 / npm
- Windows + Visual Studio 2019 以上（desktop-app 実行時）

---

## 3) 初期セットアップ

```bash
git clone <REPOSITORY_URL>
cd TsutaAI/src/TsutaAI
```

依存関係をインストール:

```bash
cd backend-api
npm install

cd ../web-admin
npm install
```

---

## 4) `.env` 作成（backend-api）

```bash
# ここから先は src/TsutaAI 配下で実行
cd backend-api
cp .env.example .env
```

ローカル起動時は、`.env` を最低限以下に合わせるのを推奨します。

```env
NODE_ENV=development
PORT=3000
ENABLE_HTTPS=false
DB_CLIENT=development
DATABASE_PATH=../database/tsutaai.db
```

補足:
- `GROQ_API_KEY` は AI 機能利用時に必要です。
- セキュリティ上、`JWT_SECRET` / `ENCRYPTION_KEY` は本番で必ず変更してください。

---

## 5) データベース初期化

`backend-api` には用途別で2種類あります。

```bash
cd backend-api
```

### 開発・デモ用（サンプルデータあり）
`src/TsutaAI/backend-api/scripts/init-database.js`

```bash
npm run db:init
```

### 最小構成（管理者のみ）
`src/TsutaAI/backend-api/scripts/init-production.js`

```bash
npm run db:init:prod
```

どちらも実行後、API を起動します:

```bash
npm run dev
```

---

## 6) システム起動方法

### backend-api

```bash
cd backend-api
npm run dev
```

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/api-docs`

### web-admin（別ターミナル）

```bash
cd web-admin
npm run dev
```

- Web UI: `http://localhost:5173`
- 既定の API 接続先: `http://localhost:3000/api`

---

## 7) desktop-app 起動方法（API設定を含む）

1. `src/TsutaAI/desktop-app/TsutaAI.sln` を Visual Studio で開く  
2. `TsutaAI` をスタートアッププロジェクトにして実行（F5）  
3. ログイン画面の **「API設定」** を開く  
4. API URL に `http://localhost:3000` を設定（`/api` は不要）  
5. **接続テスト** → **保存**  
6. ログイン

ログイン例:
- `npm run db:init` 実行後: `admin / demo_password`（サンプルユーザーも利用可能）
- `npm run db:init:prod` 実行後: `admin / demo_password` のみ

---

## 8) よく使うコマンド

```bash
# backend
cd backend-api
npm run dev
npm run db:init
npm run db:init:prod

# web
cd web-admin
npm run dev
```
