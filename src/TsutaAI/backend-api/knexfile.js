const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// DB_CLIENTに基づいて環境を決定
const dbClient = process.env.DB_CLIENT || 'better-sqlite3';
let defaultEnv = 'sqlite';

if (dbClient === 'mysql2' || dbClient === 'mysql') {
  defaultEnv = 'mysql';
} else if (dbClient === 'pg' || dbClient === 'postgresql') {
  defaultEnv = 'postgresql';
} else if (dbClient === 'mssql' || dbClient === 'tedious') {
  defaultEnv = 'mssql';
}

const configs = {
  // SQLite (開発環境・デフォルト)
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(__dirname, '../database/tsutaai.db')
    },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn, done) => {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done();
      }
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    }
  },

  // Test Environment
  test: {
    client: 'better-sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    }
  },

  // SQLite (本番環境でもSQLiteを使用する場合)
  sqlite: {
    client: 'better-sqlite3',
    connection: {
      filename: process.env.DATABASE_PATH || path.resolve(__dirname, '../database/tsutaai.db')
    },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn, done) => {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done();
      }
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    }
  },

  // MySQL
  mysql: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tsutaai'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    }
  },

  // PostgreSQL
  postgresql: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tsutaai'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    }
  },

  // SQL Server
  mssql: {
    client: 'mssql',
    connection: {
      server: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 1433,
      user: process.env.DB_USER || 'sa',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tsutaai',
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true'
      }
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    }
  }
};

// デフォルト環境を設定（DB_CLIENTに基づく）
// developmentとproductionの両方をdefaultEnvに基づいて設定
configs.development = configs[defaultEnv];
configs.production = configs[defaultEnv];

module.exports = configs;
