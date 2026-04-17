const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/extensions/status — status live dari SIP agent pool di memori
// HARUS diletakkan sebelum route /:extension agar tidak terkena overlap
router.get('/status', (req, res) => {
    const sipAgents = req.app.locals.sipAgents || [];
    const statuses = sipAgents.map(agent => agent.getStatus());
    res.json(statuses);
});

// GET all extensions
router.get('/', (req, res) => {
    db.all("SELECT * FROM sip_accounts ORDER BY extension ASC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ extensions: rows });
    });
});

// POST new extension (Bulk or Single)
router.post('/', (req, res) => {
    // Check if it's a bulk request
    let list = [];
    if (req.body.extensions && Array.isArray(req.body.extensions)) {
        list = req.body.extensions;
    } else {
        // Legacy/Single Fallback
        const { extension, password, serverIp, domain } = req.body;
        if (extension) {
            list.push({ extension, password, serverIp, domain });
        }
    }

    if (list.length === 0) {
        return res.status(400).json({ error: "Missing required fields or empty list" });
    }

    const sql = "INSERT INTO sip_accounts (extension, password, serverIp, domain) VALUES (?, ?, ?, ?)";
    const stmt = db.prepare(sql);
    
    let errors = 0;
    let success = 0;

    // We can't use transaction easily with sqlite3 helper in loop without serialize
    db.serialize(() => {
        list.forEach(item => {
            let pwd = 'Telesave_2023';
            let sipIp = '119.47.90.37';
            let sipDomain = 'sakinah.telesave.voip';

            if (item.vendor === 'dankom') {
                 pwd = item.password || 'd4nk0mptsss1234!'; // Gunakan password dari request, fallback ke default Dankom
                 sipIp = '10.9.7.95';
                 sipDomain = '10.9.7.95';
            } else if (item.password && item.serverIp) { // Fallback for legacy calls
                 pwd = item.password;
                 sipIp = item.serverIp;
                 sipDomain = item.domain || item.serverIp;
            }

             const params = [
                item.extension, 
                pwd, 
                sipIp, 
                sipDomain
            ];
             stmt.run(params, function(err) {
                 if (err) {
                    console.error(`Failed to add ${item.extension}:`, err.message);
                    errors++;
                 } else {
                    success++;
                 }
             });
        });
        
        stmt.finalize(() => {
            // This runs after all statements in serialize are queued/done (mostly)
            // But db.run is async, so we might return early.
            // For simple use case, we just respond OK.
            // A better way with sqlite3 is standard iteration.
            
            res.json({ message: `Processed ${list.length} items`, success, errors });

            if (req.app.get('reloadAgents')) {
                // Wait a bit for DB commits
                setTimeout(() => req.app.get('reloadAgents')(), 500);
            }
        });
    });
});

// DELETE extension
router.delete('/:id', (req, res) => {
    db.run("DELETE FROM sip_accounts WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({ message: "Extension deleted", rows: this.changes });
        
        if (req.app.get('reloadAgents')) {
            req.app.get('reloadAgents')();
        }
    });
});

// Disconnect an extension
router.post('/:extension/disconnect', (req, res) => {
    const { extension } = req.params;
    const sipAgents = req.app.locals.sipAgents;
    
    if (!sipAgents) {
        return res.status(500).json({ error: "SIP Agents list not available" });
    }

    const agent = sipAgents.find(a => a.extension == extension);
    
    if (agent) {
        agent.stop();
        res.json({ message: `Extension ${extension} disconnected` });
    } else {
        // If not in memory but in DB, it's effectively offline
        res.json({ message: `Extension ${extension} already offline or not found` });
    }
});

// Connect (Start) an extension
router.post('/:extension/connect', (req, res) => {
    const { extension } = req.params;
    const sipAgents = req.app.locals.sipAgents;
    
    if (!sipAgents) {
        return res.status(500).json({ error: "SIP Agents list not available" });
    }

    const agent = sipAgents.find(a => a.extension == extension);
    
    if (agent) {
        if (!agent.registered && !agent.socket) { // strictly check if stopped
            agent.start();
            res.json({ message: `Extension ${extension} starting...` });
        } else {
             // It might be running but unregistered, just trigger register
             if (!agent.registered) agent.register();
             res.json({ message: `Extension ${extension} already running, retrying registration...` });
        }
    } else {
        res.status(404).json({ error: `Extension ${extension} not found` });
    }
});

module.exports = router;
