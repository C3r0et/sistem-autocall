const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware dasar untuk validasi JWT lama (jika masih ada token lokal).
 * Namun ke depannya akan menggunakan ssoAuth.protect.
 */
const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const bearerToken = token.startsWith('Bearer ') ? token.slice(7) : token;

  jwt.verify(bearerToken, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Failed to authenticate token' });
    }

    req.userId = decoded.id;

    // DEBUG: Tampilkan isi token sekali agar bisa verifikasi field nama
    console.log('[JWT Decoded]', JSON.stringify(decoded));

    // Coba semua kemungkinan field employee_id dari berbagai versi SSO
    const employeeId = decoded.employee_id
        || decoded.emp_id
        || decoded.employeeId
        || decoded.username
        || decoded.email
        || null;
    
    // Anggap selalu tersubskripsi (Trial logic removed)
    req.user = {
        id: decoded.id,
        employee_id: employeeId,
        role: decoded.role || 'user',
        isSubscribed: true,
        trialEndsAt: null
    };
    next();
  });
};

/**
 * Middleware untuk mengecek subskripsi. 
 * DIHAPUS LOGIKANYA: Selalu lolos (next()).
 */
const subscriptionMiddleware = (req, res, next) => {
    // Karena sistem trial dihilangkan, semua user dianggap berhak akses.
    next();
};

module.exports = { authMiddleware, subscriptionMiddleware, JWT_SECRET };
