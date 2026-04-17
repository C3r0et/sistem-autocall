require('dotenv').config();
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.EMPLOYEE_DB_HOST,
    user: process.env.EMPLOYEE_DB_USER,
    password: process.env.EMPLOYEE_DB_PASSWORD,
    database: process.env.EMPLOYEE_DB_NAME,
});
async function describeUsers() {
    const [rows] = await pool.execute('DESCRIBE users');
    console.log(rows.map(r => r.Field).join(', '));
    process.exit(0);
}
describeUsers().catch(console.error);
