const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'autocall.db');
const db = new sqlite3.Database(dbPath);

console.log("Adding employee_id column...");
db.run('ALTER TABLE users ADD COLUMN employee_id TEXT', (err) => {
    if (err) {
        console.error("Migration error:", err.message);
    } else {
        console.log("Successfully added column employee_id to users table.");
    }
});
