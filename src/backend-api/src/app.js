// Expressアプリケーションのエントリーポイント
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const config = require('./config/env');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const websocketService = require('./services/websocketService');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const personalTaskRoutes = require('./routes/personal-tasks');
const reportRoutes = require('./routes/reports');
const worklogRoutes = require('./routes/worklogs');
const aiRoutes = require('./routes/ai');
const vacationRoutes = require('./routes/vacations');
const dashboardRoutes = require('./routes/dashboards');
const userSkillRoutes = require('./routes/userSkills');
const healthRoutes = require('./routes/health');
const reportGeneratorRoutes = require('./routes/reportGenerator');
const growthRoutes = require('./routes/growth');
const activityLogRoutes = require('./routes/activity-logs');
const mentalHealthRoutes = require('./routes/mental-health');
const progressPredictionRoutes = require('./routes/progress-predictions');
const projectDashboardRoutes = require('./routes/project-dashboard');
const helpRequestRoutes = require('./routes/help-requests');
const sprintRoutes = require('./routes/sprints');
const settingsRoutes = require('./routes/settings');
const holidayRoutes = require('./routes/holidays');
const estimateRoutes = require('./routes/estimates');
const wbsAiChatRoutes = require('./routes/wbs-ai-chat');
const promptRoutes = require('./routes/prompts');
const versionRoutes = require('./routes/version');
const hourlyActivityRoutes = require('./routes/hourly-activity');
const reportAssistantRoutes = require('./routes/reportAssistant');
const notificationRoutes = require('./routes/notifications');
const workSessionRoutes = require('./routes/work-session');


// 設定サービスをインポート
const settingsService = require('./services/settingsService');

const app = express();
let server;

// Nginxなどのリバースプロキシの背後で動作する場合の設定
// X-Forwarded-Forヘッダーを信頼し、express-rate-limitが正しくクライアントIPを識別できるようにする
// これがないと、すべてのリクエストがプロキシのIPアドレスから来ているように見え、
// レート制限が正常に機能しません（ERR_ERL_UNEXPECTED_X_FORWARDED_FORエラーが発生）
app.set('trust proxy', 1);

const PORT = config.port;

// HTTPSサーバーの設定
if (config.https.enabled) {
  try {
    // SSL証明書のパスを解決
    const keyPath = path.resolve(config.https.keyPath);
    const certPath = path.resolve(config.https.certPath);

    // SSL証明書の存在確認
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      logger.warn('SSL証明書が見つかりません。HTTPSを無効にしてHTTPで起動します。');
      logger.warn(`キーパス: ${keyPath}`);
      logger.warn(`証明書パス: ${certPath}`);
      logger.warn('証明書を生成するには、以下のコマンドを実行してください:');
      logger.warn('  mkdir -p ssl');
      logger.warn('  openssl req -x509 -newkey rsa:4096 -keyout ssl/server.key -out ssl/server.cert -days 365 -nodes');
      server = http.createServer(app);
    } else {
      // SSL証明書の読み込み
      const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      server = https.createServer(options, app);
      logger.info('HTTPSサーバーを起動します。');
    }
  } catch (error) {
    logger.error('HTTPS設定エラー:', error);
    logger.warn('HTTPサーバーで起動します。');
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
  if (config.nodeEnv === 'production') {
    logger.warn('本番環境ではHTTPSを有効にすることを強く推奨します。');
  }
}

// 非同期起動処理
const initPromise = (async () => {
  try {
    // サーバー起動時に設定を事前にロードして復号化・キャッシュ
    if (process.env.NODE_ENV !== 'test') {
      logger.info('設定をデータベースから読み込み中...');
      await settingsService.loadSettings();
      logger.info('設定の読み込みが完了しました。');
    }

    // セキュリティミドルウェアのインポート
    const setupSecurityHeaders = require('./middleware/securityHeaders');
    const { enforceHttps, setHstsHeader } = require('./middleware/httpsRedirect');
    const { globalLimiter, apiLimiter, loginLimiter, aiLimiter } = require('./middleware/rateLimit');

    // HTTPSリダイレクト（本番環境）
    app.use(enforceHttps);

    // セキュリティヘッダーの設定
    setupSecurityHeaders(app);

    // HSTSヘッダーの設定
    app.use(setHstsHeader);

    // グローバルレート制限（全エンドポイント）
    app.use(globalLimiter);

    // 共通ミドルウェアを設定
    app.use(express.json());

    // リクエストロギングミドルウェア
    app.use((req, res, next) => {
      const startTime = Date.now();

      // リクエスト開始時にもログ出力（デバッグ用）
      logger.info(`Incoming Request: ${req.method} ${req.url}`);

      // レスポンス終了時にログを記録
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.logHttpRequest(req, res, duration);
        logger.info(`Response Sent: ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
      });

      next();
    });

    // ヘルスチェックルート
    app.use('/health', healthRoutes);

    // OpenAPI/Swagger ドキュメント
    const swaggerUi = require('swagger-ui-express');
    const YAML = require('yamljs');
    const swaggerDocument = YAML.load(path.join(__dirname, '../openapi.yaml'));

    // Swagger UIをマウント（認証不要）
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'TsutaAI API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true
      }
    }));

    // API仕様書のJSONエンドポイント
    app.get('/openapi.json', (req, res) => {
      res.json(swaggerDocument);
    });

    logger.info('API仕様書: /api-docs でSwagger UIを起動しました。');

    // 各種ルートをマウント（/api プレフィックス付き）
    app.use('/api/auth', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/projects', projectRoutes);
    app.use('/api/tasks', taskRoutes);
    app.use('/api/personal-tasks', personalTaskRoutes);
    app.use('/api/reports', reportRoutes);
    app.use('/api/worklogs', worklogRoutes);
    app.use('/api/ai', aiRoutes);
    app.use('/api/vacations', vacationRoutes);
    app.use('/api/dashboards', dashboardRoutes);
    app.use('/api/user-skills', userSkillRoutes);
    app.use('/api/report-generator', reportGeneratorRoutes);
    app.use('/api/growth', growthRoutes);
    app.use('/api/activity-logs', activityLogRoutes);
    app.use('/api/mental-health', mentalHealthRoutes);
    app.use('/api/progress-predictions', progressPredictionRoutes);
    app.use('/api/project-dashboard', projectDashboardRoutes);
    app.use('/api/help-requests', helpRequestRoutes);
    app.use('/api/sprints', sprintRoutes);
    app.use('/api/settings', settingsRoutes);
    app.use('/api/holidays', holidayRoutes);
    app.use('/api/estimates', estimateRoutes);
    app.use('/api/wbs-ai-chat', wbsAiChatRoutes);
    app.use('/api/prompts', promptRoutes);
    app.use('/api/version', versionRoutes);
    app.use('/api/hourly-activity', hourlyActivityRoutes);
    app.use('/api/report-assistant', reportAssistantRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/work-session', workSessionRoutes);


    // エラーハンドラー
    app.use(errorHandler);

    // WebSocketサーバーを初期化
    websocketService.initialize(server);

    // サーバーを起動
    if (process.env.NODE_ENV !== 'test') {
      server.listen(PORT, () => {
        const msg = `バックエンドAPIをポート${config.port}で起動しました。`;
        logger.info(msg);
        console.log(msg);
      });
    }

    // ポート使用中エラーのハンドリング
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`ポート${PORT}は既に使用されています。`);
        logger.error('以下の方法で解決できます:');
        logger.error(`1. ポート${PORT}を使用しているプロセスを終了する`);
        logger.error('2. .envファイルでPORT環境変数を設定して別のポートを使用する (例: PORT=3001)');
        logger.error('3. コマンドラインでポートを指定する (例: PORT=3001 npm start)');
        process.exit(1);
      } else {
        logger.error('サーバー起動エラー:', error);
        process.exit(1);
      }
    });

    // グレースフルシャットダウン
    process.on('SIGTERM', () => {
      logger.info('SIGTERMシグナルを受信しました。サーバーをシャットダウンします。');
      websocketService.shutdown();
      server.close(() => {
        logger.info('サーバーをシャットダウンしました。');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('サーバー起動中にエラーが発生しました:', error);
    process.exit(1);
  }
})();

app.initPromise = initPromise;

module.exports = app;
