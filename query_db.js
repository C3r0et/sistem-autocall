const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'server', 'autocall.db');
const db = new sqlite3.Database(dbPath);

console.log('Querying latest 10 timestamps from call_logs...');
db.all("SELECT timestamp, number, status FROM call_logs ORDER BY timestamp DESC LIMIT 10", (err, rows) => {
    if (err) {
        console.error('Database Error:', err.message);
    } else if (rows.length === 0) {
        console.log('No logs found in call_logs table.');
    } else {
        rows.forEach(row => {
            console.log(`${row.timestamp} | ${row.number} | ${row.status}`);
        });
    }
    db.close();
});
