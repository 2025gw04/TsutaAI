const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', '..', 'database', 'tsutaai.db');
const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');
const migrationPath = path.resolve(__dirname, '..', '..', 'database', 'migrations', '001_asana_features.sql');

console.log('Creating new database from schema...\n');

// 新しいデータベースを作成
const db = new Database(dbPath);

// スキーマを読み込んで実行
console.log('Loading schema.sql...');
const schema = fs.readFileSync(schemaPath, 'utf-8');

// コメント行を除外してSQL文を分割
const sqlStatements = schema
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
  .join('\n')
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt.length > 0);

console.log(`Executing ${sqlStatements.length} statements from schema.sql...`);

let successCount = 0;
let errorCount = 0;

sqlStatements.forEach((stmt, index) => {
  try {
    db.exec(stmt);
    successCount++;
  } catch (error) {
    console.error(`Error in statement ${index + 1}:`, error.message);
    console.error(`Statement: ${stmt.substring(0, 100)}...`);
    errorCount++;
  }
});

console.log(`\nSchema creation completed: ${successCount} succeeded, ${errorCount} failed`);

// マイグレーションを実行（存在する場合）
if (fs.existsSync(migrationPath)) {
  console.log('\nLoading 001_asana_features.sql...');
  const migration = fs.readFileSync(migrationPath, 'utf-8');

  const migrationStatements = migration
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  console.log(`Executing ${migrationStatements.length} statements from migration...`);

  let migrationSuccessCount = 0;
  let migrationErrorCount = 0;

  migrationStatements.forEach((stmt, index) => {
    try {
      db.exec(stmt);
      migrationSuccessCount++;
    } catch (error) {
      // ALTERで既存カラムを追加しようとするエラーはスキップ
      if (error.message.includes('duplicate column name')) {
        console.log(`  Skipping statement ${index + 1} (column already exists)`);
        migrationSuccessCount++;
      } else if (error.message.includes('already exists')) {
        console.log(`  Skipping statement ${index + 1} (already exists)`);
        migrationSuccessCount++;
      } else {
        console.error(`Error in migration statement ${index + 1}:`, error.message);
        console.error(`Statement: ${stmt.substring(0, 100)}...`);
        migrationErrorCount++;
      }
    }
  });

  console.log(`\nMigration completed: ${migrationSuccessCount} succeeded, ${migrationErrorCount} failed`);
}

// 整合性チェック
console.log('\nRunning integrity check...');
const integrityResult = db.pragma('integrity_check');
console.log('Integrity check:', integrityResult);

// tasksテーブルのスキーマを確認
console.log('\nTasks table schema:');
const tasksSchema = db.prepare("PRAGMA table_info(tasks)").all();
tasksSchema.forEach(col => {
  console.log(`  - ${col.name} (${col.type})`);
});

db.close();
console.log('\nDatabase recreation completed successfully!');
