const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const ssoAuth = require('../middleware/ssoAuth'); 

const IT_ROLES = ['SPV_IT', 'STAFF_IT', 'STAFF_IT_HELPER'];
const adminOnly = ssoAuth.authorize(...IT_ROLES);

function getNumberType(number) {
    if (!number) return 'Unknown';
    if (number.startsWith('08') || number.startsWith('628')) return 'Mobile';
    if (number.startsWith('021') || number.startsWith('031') || number.startsWith('02')) return 'Landline';
    return 'Unknown';
}

router.get('/stats', (req, res) => {
    const stats = {
        totalCalls: 0,
        successCount: 0,
        failCount: 0,
        answeredCount: 0,
        busyCount: 0,
        noAnswerCount: 0,
        failedCount: 0,
        topNumbers: [],
        typeDistribution: { 'Mobile': 0, 'Landline': 0, 'Unknown': 0 }
    };

    const conditions = [];
    const params = [];
    if (req.user.role !== 'admin') {
        const empId = req.user.employee_id || String(req.user.id);
        conditions.push('(employee_id = ? OR user_id = ?)');
        params.push(empId, req.user.id);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // 1. General Stats
    db.all(`SELECT status, count(*) as count FROM call_logs ${whereClause} GROUP BY status`, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        rows.forEach(row => {
            stats.totalCalls += row.count;
            if (row.status === 'ANSWERED') {
                stats.successCount += row.count;
                stats.answeredCount = row.count;
            } else {
                stats.failCount += row.count;
                if (row.status === 'BUSY') stats.busyCount = row.count;
                else if (row.status === 'NO ANSWER' || row.status === 'TIMEOUT') stats.noAnswerCount = row.count;
                else stats.failedCount += row.count; 
            }
        });

        // 2. Top Numbers & Type Distribution
        db.all(`SELECT number, count(*) as count FROM call_logs ${whereClause} GROUP BY number ORDER BY count DESC LIMIT 5`, params, (err, topRows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            stats.topNumbers = topRows.map(r => ({
                number: r.number,
                count: r.count,
                type: getNumberType(r.number)
            }));

            // 3. Type Distribution
            db.all(`SELECT number FROM call_logs ${whereClause}`, params, (err, allRows) => {
                 if (err) return res.status(500).json({ error: err.message });
                 
                 allRows.forEach(row => {
                     const type = getNumberType(row.number);
                     if (stats.typeDistribution[type] !== undefined) {
                         stats.typeDistribution[type]++;
                     } else {
                         stats.typeDistribution['Unknown']++;
                     }
                 });
                 res.json(stats);
            }); 
        }); 
    });
}); // Closing router.get

// Settings API
router.get('/settings', ssoAuth.protect, (req, res) => {
    res.json(req.app.locals.settings || { global_vendor: 'telesave' });
});

router.post('/settings', ssoAuth.protect, (req, res) => {
    const { key, value } = req.body;
    if (!key || !value) return res.status(400).json({ error: 'Missing key or value' });
    
    db.run("REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!req.app.locals.settings) req.app.locals.settings = {};
        req.app.locals.settings[key] = value;
        res.json({ message: 'Settings updated', key, value });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/employee-settings
// ─────────────────────────────────────────────────────────────────────────────
router.get('/employee-settings', ssoAuth.protect, adminOnly, (req, res) => {
    db.all("SELECT * FROM employee_settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dashboard/employee-settings
// ─────────────────────────────────────────────────────────────────────────────
router.post('/employee-settings', ssoAuth.protect, adminOnly, (req, res) => {
    const { employee_id, daily_limit, assigned_agent, is_blocked } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'Missing employee_id' });
    
    // SQLite REPLACE INTO requires all non-null fields or it inserts defaults if omitting them
    db.run(
        "REPLACE INTO employee_settings (employee_id, daily_limit, assigned_agent, is_blocked) VALUES (?, ?, ?, ?)",
        [employee_id, daily_limit !== undefined ? daily_limit : -1, assigned_agent || null, is_blocked ? 1 : 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Settings saved', employee_id });
        }
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dashboard/employee-settings/bulk
// ─────────────────────────────────────────────────────────────────────────────
router.post('/employee-settings/bulk', ssoAuth.protect, adminOnly, (req, res) => {
    const { settings } = req.body;
    if (!Array.isArray(settings)) return res.status(400).json({ error: 'Expected array of settings' });

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare("REPLACE INTO employee_settings (employee_id, daily_limit, assigned_agent, is_blocked) VALUES (?, ?, ?, ?)");
        settings.forEach(s => {
            if (s.employee_id) {
                stmt.run(
                    s.employee_id, 
                    s.daily_limit !== undefined && s.daily_limit !== '' ? parseInt(s.daily_limit) : -1, 
                    s.assigned_agent || null, 
                    s.is_blocked ? 1 : 0
                );
            }
        });
        stmt.finalize();
        db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: `${settings.length} rules imported` });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/dashboard/employee-settings/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/employee-settings/:id', ssoAuth.protect, adminOnly, (req, res) => {
    const employee_id = req.params.id;
    db.run("DELETE FROM employee_settings WHERE employee_id = ?", [employee_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Settings removed' });
    });
});

module.exports = router;
