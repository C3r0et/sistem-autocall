const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

// Buka koneksi ke 'audit_logs' terlepas dari DB utama RCS
const pool = mysql.createPool({
    host: process.env.EMPLOYEE_DB_HOST,
    user: process.env.EMPLOYEE_DB_USER,
    password: process.env.EMPLOYEE_DB_PASSWORD,
    database: 'audit_logs', 
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});

exports.protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });

    try {
        // Cek Daftar Hitam
        const [blacklisted] = await pool.query('SELECT * FROM token_blacklist WHERE token = ?', [token]);
        if (blacklisted.length > 0) {
             return res.status(401).json({ success: false, message: 'Sesi akun telah diakhiri (Revoked). Silakan login ulang.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ success: false, message: 'Access denied. No role found.' });
        }

        const userRole = req.user.role.toUpperCase();
        
        // Cek apakah user adalah Tim IT (SPV_IT, STAFF_IT, IT_HELPER, dll) atau Admin
        const isIT = userRole.includes('IT') || userRole.includes('ADMIN');
        
        // Jika route ini butuh role spesifik lainnya, cek juga
        const hasSpecificRole = roles.length > 0 && roles.some(r => userRole === r.toUpperCase());

        if (isIT || hasSpecificRole) {
            return next();
        }

        res.status(403).json({ success: false, message: 'Akses Ditolak. Khusus Tim IT Saja.' });
    };
};
