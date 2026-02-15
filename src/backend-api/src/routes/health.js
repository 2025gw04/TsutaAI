const express = require('express');
const router = express.Router();
const db = require('../services/database');
const os = require('os');
const logger = require('../utils/logger');

// アプリケーションの起動時刻
const startTime = Date.now();

// メトリクスデータ
const metrics = {
  requests: {
    total: 0,
    success: 0,
    errors: 0
  },
  responseTime: {
    count: 0,
    total: 0,
    min: Infinity,
    max: 0
  }
};

/**
 * メトリクスを更新するミドルウェア
 */
function updateMetrics(duration, success) {
  metrics.requests.total++;
  if (success) {
    metrics.requests.success++;
  } else {
    metrics.requests.errors++;
  }

  if (duration !== undefined) {
    metrics.responseTime.count++;
    metrics.responseTime.total += duration;
    metrics.responseTime.min = Math.min(metrics.responseTime.min, duration);
    metrics.responseTime.max = Math.max(metrics.responseTime.max, duration);
  }
}

/**
 * 基本的なヘルスチェック
 * GET /health
 */
router.get('/', (req, res) => {
  try {
    // データベース接続を確認
    const connection = db.getConnection();
    const result = connection.prepare('SELECT 1 as health').get();

    if (result && result.health === 1) {
      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        uptime: Math.floor((Date.now() - startTime) / 1000)
      });
    } else {
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'error'
      });
    }
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

/**
 * Readiness チェック（リクエストを受け付ける準備ができているか）
 * GET /health/readiness
 */
router.get('/readiness', (req, res) => {
  try {
    // データベース接続確認
    const connection = db.getConnection();
    connection.prepare('SELECT 1').get();

    // すべてのチェックが成功
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok'
      }
    });
  } catch (error) {
    logger.warn('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'failed'
      }
    });
  }
});

/**
 * Liveness チェック（アプリケーションが生きているか）
 * GET /health/liveness
 */
router.get('/liveness', (req, res) => {
  // プロセスが応答できる状態であることを確認
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
});

/**
 * 詳細なステータス情報
 * GET /health/status
 */
router.get('/status', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // データベース接続確認
    const connection = db.getConnection();
    connection.prepare('SELECT 1').get();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpuCount: os.cpus().length
      },
      process: {
        pid: process.pid,
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      },
      database: {
        status: 'connected',
        type: process.env.DB_CLIENT || 'better-sqlite3'
      },
      metrics: {
        requests: metrics.requests,
        averageResponseTime: metrics.responseTime.count > 0
          ? Math.round(metrics.responseTime.total / metrics.responseTime.count)
          : 0,
        minResponseTime: metrics.responseTime.min === Infinity ? 0 : metrics.responseTime.min,
        maxResponseTime: metrics.responseTime.max
      }
    });
  } catch (error) {
    logger.error('Status check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

/**
 * Prometheus形式のメトリクス
 * GET /health/metrics
 */
router.get('/metrics', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const avgResponseTime = metrics.responseTime.count > 0
      ? Math.round(metrics.responseTime.total / metrics.responseTime.count)
      : 0;

    // Prometheus形式でメトリクスを出力
    const prometheusMetrics = `
# HELP tsutaai_uptime_seconds Application uptime in seconds
# TYPE tsutaai_uptime_seconds gauge
tsutaai_uptime_seconds ${uptime}

# HELP tsutaai_requests_total Total number of requests
# TYPE tsutaai_requests_total counter
tsutaai_requests_total{status="success"} ${metrics.requests.success}
tsutaai_requests_total{status="error"} ${metrics.requests.errors}
tsutaai_requests_total{status="total"} ${metrics.requests.total}

# HELP tsutaai_response_time_ms Response time in milliseconds
# TYPE tsutaai_response_time_ms summary
tsutaai_response_time_ms{quantile="min"} ${metrics.responseTime.min === Infinity ? 0 : metrics.responseTime.min}
tsutaai_response_time_ms{quantile="max"} ${metrics.responseTime.max}
tsutaai_response_time_ms{quantile="avg"} ${avgResponseTime}

# HELP tsutaai_memory_usage_bytes Memory usage in bytes
# TYPE tsutaai_memory_usage_bytes gauge
tsutaai_memory_usage_bytes{type="rss"} ${memUsage.rss}
tsutaai_memory_usage_bytes{type="heap_total"} ${memUsage.heapTotal}
tsutaai_memory_usage_bytes{type="heap_used"} ${memUsage.heapUsed}
tsutaai_memory_usage_bytes{type="external"} ${memUsage.external}

# HELP tsutaai_system_memory_bytes System memory in bytes
# TYPE tsutaai_system_memory_bytes gauge
tsutaai_system_memory_bytes{type="total"} ${os.totalmem()}
tsutaai_system_memory_bytes{type="free"} ${os.freemem()}

# HELP tsutaai_cpu_count Number of CPUs
# TYPE tsutaai_cpu_count gauge
tsutaai_cpu_count ${os.cpus().length}
`;

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(prometheusMetrics.trim());
  } catch (error) {
    logger.error('Metrics endpoint failed:', error);
    res.status(500).send('# Error generating metrics');
  }
});

module.exports = router;
module.exports.updateMetrics = updateMetrics;
