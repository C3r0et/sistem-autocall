const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.EMPLOYEE_DB_HOST,
    user: process.env.EMPLOYEE_DB_USER,
    password: process.env.EMPLOYEE_DB_PASSWORD,
    database: process.env.EMPLOYEE_DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});

/**
 * Memeriksa apakah employee_id terdaftar sebagai karyawan PT Sahabat Sakinah Senter.
 * @param {string} employeeId
 * @returns {Promise<{found: boolean, employee: object|null}>}
 */
async function checkEmployeeExists(employeeId) {
    try {
        const [rows] = await pool.execute(
            'SELECT employee_id FROM users WHERE employee_id = ? LIMIT 1',
            [employeeId]
        );
        if (rows.length > 0) {
            return { found: true, employee: rows[0] };
        }
        return { found: false, employee: null };
    } catch (err) {
        console.error('[EmployeeDB] Query error:', err.message);
        throw new Error('Gagal menghubungi database karyawan');
    }
}

module.exports = { checkEmployeeExists };
