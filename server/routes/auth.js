const express = require('express');
const router = express.Router();
const https = require('https');

const ALLOWED_ROLES = ['SPV_IT', 'STAFF_IT', 'STAFF_IT_HELPER'];

// ─────────────────────────────────────────────
// POST /api/auth/login (SSO Proxy via Native HTTP)
// ─────────────────────────────────────────────
router.post('/login', (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'ID dan Password wajib diisi' });
    }

    const trimmedId = String(identifier).trim();
    const trimmedPw = String(password);

    console.log(`[SSO Proxy] Menghubungi SSO container untuk ID: ${trimmedId}`);

    // Data yang akan dikirim ke SSO port 4000
    const postData = JSON.stringify({
        employee_id: trimmedId,
        password: trimmedPw
    });

    const options = {
        hostname: 'sso-auth.sahabatsakinah.id',
        port: 443,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Accept': 'application/json'
        }
    };

    const ssoReq = https.request(options, (ssoRes) => {
        let responseBody = '';
        ssoRes.on('data', (chunk) => { responseBody += chunk; });
        ssoRes.on('end', () => {
            try {
                const data = JSON.parse(responseBody);

                if (ssoRes.statusCode !== 200) {
                    const errMsg = data.error || data.message || 'Gagal login di SSO';
                    return res.status(ssoRes.statusCode).json({ error: errMsg });
                }

                // HAK AKSES: Khusus Tim IT Saja
                if (!data.user || !ALLOWED_ROLES.includes(data.user.role)) {
                    return res.status(403).json({ 
                        error: `Akses Ditolak. Jabatan Anda (${data.user?.role}) tidak diizinkan mengakses Admin Dashboard.` 
                    });
                }

                // Sukses
                res.json({
                    auth: true,
                    token: data.token,
                    user: data.user
                });

            } catch (e) {
                res.status(500).json({ error: 'Gagal memproses respon dari SSO' });
            }
        });
    });

    ssoReq.on('error', (err) => {
        console.error('[SSO Error]', err.message);
        res.status(503).json({ error: 'Layanan SSO pusat tidak dapat dihubungi' });
    });

    // Kirim data
    ssoReq.write(postData);
    ssoReq.end();
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────
const ssoAuth = require('../middleware/ssoAuth');
router.get('/me', ssoAuth.protect, (req, res) => {
    res.json(req.user);
});

module.exports = router;
