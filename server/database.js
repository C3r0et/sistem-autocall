const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'autocall.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initTables();
  }
});

function initTables() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    employee_id TEXT UNIQUE,
    password TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    trialEndsAt DATETIME,
    isSubscribed BOOLEAN DEFAULT 0,
    role TEXT DEFAULT 'user',
    api_token TEXT
  )`, (err) => {
      // Migrations: tambah kolom jika belum ada (aman untuk data existing)
      db.run("ALTER TABLE users ADD COLUMN api_token TEXT", (err) => {
          if (err && !err.message.includes('duplicate column name')) {
              console.error("Migration error adding api_token:", err.message);
          }
      });
      db.run("ALTER TABLE users ADD COLUMN employee_id TEXT", (err) => {
          if (err && !err.message.includes('duplicate column name')) {
              console.error("Migration error adding employee_id:", err.message);
          }
      });
  });

  db.run(`CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT,
    status TEXT,
    error_message TEXT,
    duration INTEGER,
    ringing_duration INTEGER DEFAULT 0,
    talk_duration INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    agent_extension TEXT,
    type TEXT,
    user_id INTEGER,
    employee_id TEXT
  )`, (err) => {
      // Migrations for existing tables
      db.run("ALTER TABLE call_logs ADD COLUMN ringing_duration INTEGER DEFAULT 0", () => {});
      db.run("ALTER TABLE call_logs ADD COLUMN talk_duration INTEGER DEFAULT 0", () => {});
      db.run("ALTER TABLE call_logs ADD COLUMN user_id INTEGER", (e) => {
          if (e && !e.message.includes('duplicate column name')) console.error('Migration user_id:', e.message);
      });
      db.run("ALTER TABLE call_logs ADD COLUMN employee_id TEXT", (e) => {
          if (e && !e.message.includes('duplicate column name')) console.error('Migration employee_id:', e.message);
      });
  });

  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT DEFAULT 'disconnected',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sip_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extension TEXT UNIQUE,
    password TEXT,
    serverIp TEXT,
    domain TEXT,
    active BOOLEAN DEFAULT 1
  )`, (err) => {
    if (!err) {
        // Seed initial extensions if table is empty
        db.get("SELECT count(*) as count FROM sip_accounts", (err, row) => {
            if (row && row.count === 0) {
                console.log("Seeding initial SIP extensions (1001-1010)...");
                const stmt = db.prepare("INSERT INTO sip_accounts (extension, password, serverIp, domain) VALUES (?, ?, ?, ?)");
                for (let i = 1001; i <= 1010; i++) {
                    stmt.run(i.toString(), 'Telesave_2023', '119.47.90.37', 'sakinah.telesave.voip');
                }
                stmt.finalize();
            }
        });
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`, (err) => {
      if (!err) {
          db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('global_vendor', 'telesave')");
      }
  });

  db.run(`CREATE TABLE IF NOT EXISTS employee_settings (
    employee_id TEXT PRIMARY KEY,
    daily_limit INTEGER DEFAULT -1,
    assigned_agent TEXT,
    is_blocked BOOLEAN DEFAULT 0
  )`);
}

module.exports = db;
