const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

// GET Dashboard Summary (with Pagination)
router.get('/dashboard', authMiddleware, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const filterStatus = req.query.status && req.query.status !== 'ALL' ? req.query.status : null;

    const conditions = [];
    const params = [];

    // 1. Role-based isolation (Hanya admin yang bisa lihat semua)
    if (req.user.role !== 'admin') {
        const empId = req.user.employee_id || String(req.user.id);
        conditions.push('(cl.employee_id = ? OR cl.user_id = ?)');
        params.push(empId, req.user.id);
    }

    // 2. Search & Filter
    if (search) {
        conditions.push('(cl.number LIKE ? OR cl.employee_id LIKE ? OR cl.agent_extension LIKE ?)');
        params.push(search, search, search);
    }
    if (filterStatus) {
        conditions.push('cl.status = ?');
        params.push(filterStatus);
    }
    
    // Build final WHERE clause for logs (using cl alias)
    const whereCL = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    
    // Build final WHERE clause for KPIs (without cl alias, because simple count queries don't use JOIN)
    const kpiConditions = conditions.map(c => c.replace(/cl\./g, ''));
    const whereKPI = kpiConditions.length ? 'WHERE ' + kpiConditions.join(' AND ') : '';

    const queries = [
        new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count FROM call_logs ${whereKPI}`, params, (err, row) => {
                if (err) reject(err); else resolve(row.count);
            });
        }),
        new Promise((resolve, reject) => {
            const todayCond = kpiConditions.length ? `AND date(timestamp) = ?` : `WHERE date(timestamp) = ?`;
            db.get(`SELECT COUNT(*) as count FROM call_logs ${whereKPI} ${todayCond}`, [...params, today], (err, row) => {
                if (err) reject(err); else resolve(row.count);
            });
        }),
        new Promise((resolve, reject) => {
            const ansCond = kpiConditions.length ? `AND (status = 'ANSWERED' OR status = 'COMPLETED')` : `WHERE (status = 'ANSWERED' OR status = 'COMPLETED')`;
            db.get(`SELECT COUNT(*) as count FROM call_logs ${whereKPI} ${ansCond}`, params, (err, row) => {
                if (err) reject(err); else resolve(row.count);
            });
        }),
        // Paginated logs with search/filter
        new Promise((resolve, reject) => {
            const q = `SELECT cl.*, cl.timestamp || 'Z' as timestamp, u.email as user_email FROM call_logs cl LEFT JOIN users u ON cl.user_id = u.id ${whereCL} ORDER BY cl.timestamp DESC LIMIT ? OFFSET ?`;
            db.all(q, [...params, limit, offset], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        }),
        // Total count WITH filter (for pagination)
        new Promise((resolve, reject) => {
            const q = `SELECT COUNT(*) as count FROM call_logs cl ${whereCL}`;
            db.get(q, params, (err, row) => {
                if (err) reject(err); else resolve(row.count);
            });
        })
    ];

    Promise.all(queries)
        .then(([totalCalls, todayCalls, answeredCalls, recentLogs, totalLogs]) => {
            const successRate = totalCalls > 0 ? ((answeredCalls / totalCalls) * 100).toFixed(1) : 0;
            res.json({
                stats: {
                    totalCalls, todayCalls,
                    successRate: parseFloat(successRate),
                    activeAgents: req.app.locals.activeAgentsCount || 0
                },
                logs: recentLogs,
                pagination: {
                    totalLogs,
                    totalPages: Math.ceil(totalLogs / limit),
                    currentPage: page,
                    limit
                }
            });
        })
        .catch(err => {
            console.error('Stats Error:', err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        });
});

router.get('/export', authMiddleware, (req, res) => {
    const search = req.query.search ? `%${req.query.search}%` : null;
    const filterStatus = req.query.status && req.query.status !== 'ALL' ? req.query.status : null;

    const conditions = [];
    const params = [];

    // Role-based isolation (sama seperti Dashboard)
    if (req.user.role !== 'admin') {
        const empId = req.user.employee_id || String(req.user.id);
        conditions.push('(cl.employee_id = ? OR cl.user_id = ?)');
        params.push(empId, req.user.id);
    }

    if (search) {
        conditions.push('(cl.number LIKE ? OR cl.employee_id LIKE ? OR cl.agent_extension LIKE ?)');
        params.push(search, search, search);
    }
    if (filterStatus) {
        conditions.push('cl.status = ?');
        params.push(filterStatus);
    }

    const whereCL = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const q = `SELECT cl.*, cl.timestamp || 'Z' as timestamp, u.email as user_email FROM call_logs cl LEFT JOIN users u ON cl.user_id = u.id ${whereCL} ORDER BY cl.timestamp DESC`;

    db.all(q, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET Employee Activity Chart (Admin Only)
router.get('/employee-activity', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.json([]);
    }
    const q = `
        SELECT employee_id, COUNT(*) as total_calls, 
               SUM(CASE WHEN status = 'ANSWERED' OR status = 'COMPLETED' THEN 1 ELSE 0 END) as answered_calls
        FROM call_logs 
        WHERE employee_id IS NOT NULL AND employee_id != ''
        GROUP BY employee_id 
        ORDER BY total_calls DESC 
        LIMIT 10
    `;
    db.all(q, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
