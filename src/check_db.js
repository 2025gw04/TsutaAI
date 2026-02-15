const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'backend-api/database/tsutaai.db');
console.log('Opening DB at:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  
  const user = db.prepare("SELECT id, username FROM users WHERE username = 'dev_matsumoto'").get();
  console.log('User:', user);
  
  if (user) {
    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ?").all(user.id);
    console.log('Notifications Count:', notifs.length);
    console.log('Notifications:', notifs);
  }
} catch (err) {
  console.error('Error:', err);
}
