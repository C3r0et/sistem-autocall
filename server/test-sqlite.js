const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'autocall.db');
const db = new sqlite3.Database(dbPath);

console.log("Checking DB schema...");
db.get('SELECT * FROM users WHERE employee_id = ?', ['123'], (err, row) => {
    if (err) {
        console.error("Error running query:", err.message);
    } else {
        console.log("Query successful, row:", row);
    }
});
