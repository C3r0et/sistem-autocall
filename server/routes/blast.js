const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');
const db = require('../database');

// ─────────────────────────────────────────────────────────────────────────────
// Blast State (Per-User Isolation)
// ─────────────────────────────────────────────────────────────────────────────

let blastQueue = [];
let activeBlastCalls = 0;
const lastBlastResults = new Map();
const userMaxConcurrent = new Map();

/** Emit event ke semua admin yang sedang online */
function emitToAdmin(io, event, data) {
    io.to('admin-room').emit(event, data);
}

/** Rangkum jumlah antrian per employee (atau userId) → [{employeeId, count}] */
function groupQueueByUser(queue) {
    const map = {};
    queue.forEach(item => {
        const id = item.employee_id || item.userId || 'Unknown';
        map[id] = (map[id] || 0) + 1;
    });
    return Object.entries(map).map(([employeeId, count]) => ({ employeeId, count }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Update result status
// ─────────────────────────────────────────────────────────────────────────────
function updateBlastResult(userId, resultId, updateData) {
    if (!lastBlastResults.has(userId)) return;
    const results = lastBlastResults.get(userId);
    const idx = results.findIndex(r => r.id === resultId);
    if (idx > -1) {
        results[idx] = { ...results[idx], ...updateData };
        lastBlastResults.set(userId, results);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Process Blast Queue
// Dipanggil oleh routes (POST /blast-call) dan watchdog setInterval
// ─────────────────────────────────────────────────────────────────────────────

function isAgentCompatible(agent, vendorPref) {
    if (!vendorPref || vendorPref === 'all') return true;
    if (vendorPref === 'telesave' && agent.serverIp === '119.47.90.37') return true;
    if (vendorPref === 'dankom' && agent.serverIp === '10.9.7.95') return true;
    return false;
}

function processBlastQueue(sipAgents, io) {
    if (blastQueue.length === 0 && activeBlastCalls === 0) return;
    if (blastQueue.length === 0) return;

    const freeAgents = sipAgents.filter(agent => !agent.isBusy && agent.registered);
    if (freeAgents.length === 0) return;

    for (const agent of freeAgents) {
        if (blastQueue.length === 0) break;

        // Find the first compatible item for this agent
        const compatibleItemIdx = blastQueue.findIndex(i => {
             if (!isAgentCompatible(agent, i.vendor)) return false;
             
             // Enforce Direct Agent Routing
             if (i.assignedAgent && agent.extension !== i.assignedAgent) return false;
             
             const limit = userMaxConcurrent.get(i.userId) || sipAgents.length;
             const active = sipAgents.filter(a => a.isBusy && a.currentUserId === i.userId).length;
             return active < limit;
        });

        if (compatibleItemIdx > -1) {
            const removedItems = blastQueue.splice(compatibleItemIdx, 1);
            const nextItem = removedItems[0];
            processItem(nextItem, agent, sipAgents, io);
        }
    }
}

function processItem(item, agent, sipAgents, io) {
    activeBlastCalls++;
    agent.currentUserId = item.userId;

    console.log(`[Queue] Assigning ${item.number} (User ${item.userId}) → Agent ${agent.extension}`);

    // Notifikasi admin: item mulai diproses
    emitToAdmin(io, 'admin-activity', {
        type: 'blast_calling',
        userId: item.userId,
        number: item.number,
        agent: agent.extension,
        queueRemaining: blastQueue.length,
        queueByUser: groupQueueByUser(blastQueue),
        activeBlastCalls,
        timestamp: new Date()
    });

    agent.makeCall(item, (item.duration || 10)).then((result) => {
        activeBlastCalls--;

        if (result && result.success) {
            updateBlastResult(item.userId, item.id, {
                status: 'COMPLETED',
                agent: agent.extension,
                completedAt: new Date()
            });

            const answeredTime = result.answeredTime || Date.now();
            const ringingTime = result.ringingTime || answeredTime;
            const ringingDuration = Math.max(0, Math.round((answeredTime - ringingTime) / 1000));
            const talkDuration = Math.max(0, Math.round((Date.now() - answeredTime) / 1000));
            const totalDuration = ringingDuration + talkDuration;

            // Simpan log ke DB
            // Gunakan item.employee_id langsung — sudah di-set saat queue dari JWT SSO
            // (Tidak perlu query tabel users lokal karena user login via SSO external)
            db.run(
                "INSERT INTO call_logs (number, status, duration, agent_extension, type, user_id, employee_id, ringing_duration, talk_duration) VALUES (?, 'ANSWERED', ?, ?, 'blast', ?, ?, ?, ?)",
                [item.number, totalDuration, agent.extension, item.userId, item.employee_id || null, ringingDuration, talkDuration]
            );

            io.to(`user_${item.userId}`).emit('blast-update', { id: item.id, status: 'COMPLETED', agent: agent.extension });
            emitToAdmin(io, 'admin-activity', {
                type: 'blast_result',
                userId: item.userId,
                number: item.number,
                status: 'COMPLETED',
                agent: agent.extension,
                queueRemaining: blastQueue.length,
                queueByUser: groupQueueByUser(blastQueue),
                activeBlastCalls,
                timestamp: new Date()
            });
        } else {
            const errorMsg = (result && result.error) ? result.error : 'Panggilan gagal';
            const sipStatus = (result && result.sipStatus) ? result.sipStatus : null;
            
            let dbFinalStatus = 'FAILED';
            if (sipStatus === 486 || String(errorMsg).includes('Sibuk') || String(errorMsg).includes('486')) dbFinalStatus = 'BUSY';
            else if (sipStatus === 'TIMEOUT' || sipStatus === 408 || String(errorMsg).includes('Timeout') || String(errorMsg).includes('Habis')) dbFinalStatus = 'TIMEOUT';
            else if (sipStatus === 480 || sipStatus === 487 || String(errorMsg).includes('Tidak Tersedia')) dbFinalStatus = 'NO ANSWER';

            updateBlastResult(item.userId, item.id, {
                status: 'FAILED',
                error: errorMsg,
                agent: agent.extension,
                completedAt: new Date()
            });

            // Simpan log ke DB
            // Gunakan item.employee_id langsung — sudah di-set saat queue dari JWT SSO
            db.run(
                "INSERT INTO call_logs (number, status, error_message, duration, agent_extension, type, user_id, employee_id) VALUES (?, ?, ?, 0, ?, 'blast', ?, ?)",
                [item.number, dbFinalStatus, errorMsg, agent.extension, item.userId, item.employee_id || null]
            );

            io.to(`user_${item.userId}`).emit('blast-update', { id: item.id, status: 'FAILED', error: errorMsg, agent: agent.extension });
            emitToAdmin(io, 'admin-activity', {
                type: 'blast_result',
                userId: item.userId,
                number: item.number,
                status: 'FAILED',
                error: errorMsg,
                agent: agent.extension,
                queueRemaining: blastQueue.length,
                queueByUser: groupQueueByUser(blastQueue),
                activeBlastCalls,
                timestamp: new Date()
            });
        }

        // Cek apakah user ini masih ada item di queue
        const userStillHasItems = blastQueue.some(i => i.userId === item.userId);
        const userStillHasActive = sipAgents.some(a => a.isBusy && a.currentUserId === item.userId);
        if (!userStillHasItems && !userStillHasActive) {
            io.to(`user_${item.userId}`).emit('blast-complete');
        }

        processBlastQueue(sipAgents, io);
    }).catch(err => {
        activeBlastCalls--;

        updateBlastResult(item.userId, item.id, {
            status: 'FAILED',
            error: err.message,
            agent: agent.extension,
            completedAt: new Date()
        });
        io.to(`user_${item.userId}`).emit('blast-update', { id: item.id, status: 'FAILED', error: err.message, agent: agent.extension });

        const userStillHasItems = blastQueue.some(i => i.userId === item.userId);
        const userStillHasActive = sipAgents.some(a => a.isBusy && a.currentUserId === item.userId);
        if (!userStillHasItems && !userStillHasActive) {
            io.to(`user_${item.userId}`).emit('blast-complete');
        }

        processBlastQueue(sipAgents, io);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blast-call
// Mulai blast call campaign — setiap user memiliki limit concurrency sendiri
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, subscriptionMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sipAgents = req.app.locals.sipAgents;
    const io = req.app.locals.io;
    const { numbers, duration, maxConcurrent, vendor } = req.body;

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'Daftar nomor tidak valid atau kosong' });
    }

    if (!sipAgents || sipAgents.length === 0) {
        return res.status(503).json({ error: 'Tidak ada SIP agent aktif' });
    }

    // Ambil global settings dari DB
    const settings = await new Promise((resolve) => {
        db.all("SELECT key, value FROM settings", [], (err, rows) => {
            const s = {};
            if (!err && rows) {
                rows.forEach(r => s[r.key] = r.value);
            }
            resolve(s);
        });
    });

    // ── Global Setting Overrides ──
    const maxConcurrentGlobal = settings.maxConcurrent ? parseInt(settings.maxConcurrent) : sipAgents.length;
    const callDurationGlobal = settings.callDuration ? parseInt(settings.callDuration) : 10;
    const globalVendorLimit = vendor || settings.global_vendor || 'telesave';

    // ── Guard: pastikan ada agent yang kompatibel dengan vendor yang dipilih ──
    const compatibleAgents = sipAgents.filter(a => isAgentCompatible(a, globalVendorLimit));
    if (compatibleAgents.length === 0) {
        const vendorLabel = globalVendorLimit === 'dankom' ? 'Dankom' : globalVendorLimit === 'telesave' ? 'Telesave' : globalVendorLimit;
        return res.status(503).json({
            error: `Tidak ada SIP agent aktif untuk vendor "${vendorLabel}". Pastikan extension ${vendorLabel} sudah didaftarkan dan terhubung.`,
            vendor: globalVendorLimit
        });
    }

    // Set per-user concurrent limit forced from Admin Global settings
    const limit = Math.min(maxConcurrentGlobal, sipAgents.length);
    userMaxConcurrent.set(userId, limit);
    console.log(`[Queue] User ${userId} maxConcurrent enforced to globally configured: ${limit}`);

    // Check Employee Settings (Block, Daily Limit, Assigned Agent)
    const employeeId = req.user.employee_id || String(userId);
    
    db.get("SELECT * FROM employee_settings WHERE employee_id = ?", [employeeId], (err, empSettings) => {
        if (err) {
            console.error("Error checking employee_settings:", err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        
        if (empSettings) {
            // Evaluasi Blocklist
            if (empSettings.is_blocked) {
                return res.status(403).json({ error: 'Akses Anda diblokir oleh Admin. Tidak dapat memulai panggilan.' });
            }
            // Evaluasi limit harian jika di-set (!= -1)
            if (empSettings.daily_limit !== -1) {
                const today = new Date().toISOString().split('T')[0];
                // Cari total blast call YANG ANSWERED/FAILED (bukan sekadar submit) oleh user ini hari ini
                db.get("SELECT count(*) as count FROM call_logs WHERE (employee_id = ? OR user_id = ?) AND date(timestamp) = ?", [employeeId, userId, today], (err, row) => {
                    if (err) return res.status(500).json({ error: 'Database error counting logs' });
                    const todayCalls = row ? row.count : 0;
                    if (todayCalls + numbers.length > empSettings.daily_limit) {
                        return res.status(429).json({ 
                            error: `Melebihi batas harian. Limit: ${empSettings.daily_limit}. Telah digunakan: ${todayCalls}. Anda mencoba memanggil: ${numbers.length} nomor.` 
                        });
                    }
                    // Valid lewati pengecekan
                    queueBlastBatch(empSettings);
                });
                return; // Tunggu async DB
            }
        }
        
        queueBlastBatch(empSettings);
    });
    
    function queueBlastBatch(empSettings) {
        const specificAgent = empSettings?.assigned_agent || null;
        
        const scopedNumbers = numbers.map(n => {
            const number = typeof n === 'string' ? n.trim() : (n.number || '').trim();
            return {
                id: (typeof n === 'object' && n.id) ? n.id : uuidv4(),
                number,
                userId,
                duration: callDurationGlobal,
                vendor: globalVendorLimit,
                assignedAgent: specificAgent,
                employee_id: employeeId
            };
        }).filter(n => n.number);

        if (scopedNumbers.length === 0) {
            return res.status(400).json({ error: 'Tidak ada nomor valid setelah diproses' });
        }

        // Inisialisasi report untuk user ini (batch baru = reset)
        const initialResults = scopedNumbers.map(n => ({
            ...n,
            status: 'PENDING',
            timestamp: new Date()
        }));
        lastBlastResults.set(userId, initialResults);

        blastQueue.push(...scopedNumbers);

        console.log(`[Blast] User ${userId}: +${scopedNumbers.length} nomor. Queue total: ${blastQueue.length}`);
        if (specificAgent) console.log(`[Blast] User ${userId} is locked to Agent: ${specificAgent}`);

        // Notifikasi admin: blast dimulai
        emitToAdmin(io, 'admin-activity', {
            type: 'blast_started',
            userId,
            count: scopedNumbers.length,
            callDuration: callDurationGlobal,
            maxConcurrent: limit,
            queueTotal: blastQueue.length,
            queueByUser: groupQueueByUser(blastQueue),
            timestamp: new Date()
        });

        processBlastQueue(sipAgents, io);

        res.json({
            message: 'Blast call dimulai/diantrekan',
            queueLength: blastQueue.length,
            yourQueueSize: scopedNumbers.length,
            callDuration: callDurationGlobal,
            maxConcurrent: limit,
            totalAgents: sipAgents.length,
            assignedAgent: specificAgent
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blast-call/stop
// Hentikan blast call milik user yang sedang login (tidak pengaruhi user lain)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/stop', authMiddleware, (req, res) => {
    const userId = req.user.id;
    const sipAgents = req.app.locals.sipAgents;

    // Hapus item milik user dari queue
    const before = blastQueue.length;
    blastQueue = blastQueue.filter(item => item.userId !== userId);
    const removedFromQueue = before - blastQueue.length;

    // Tandai item PENDING milik user sebagai CANCELED
    if (lastBlastResults.has(userId)) {
        const updated = lastBlastResults.get(userId).map(r =>
            r.status === 'PENDING' ? { ...r, status: 'CANCELED' } : r
        );
        lastBlastResults.set(userId, updated);
    }

    // Hangup panggilan aktif milik user ini
    let stoppedActive = 0;
    if (sipAgents) {
        sipAgents.forEach(agent => {
            if (agent.currentUserId === userId && agent.isBusy) {
                agent.hangup();
                stoppedActive++;
            }
        });
    }

    console.log(`[Blast] User ${userId} stop: queue -${removedFromQueue}, active stopped: ${stoppedActive}`);

    res.json({
        message: 'Blast call dihentikan',
        removedFromQueue,
        stoppedActive
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blast-call/report
// Ambil laporan blast call milik user yang sedang login
// ─────────────────────────────────────────────────────────────────────────────
router.get('/report', authMiddleware, (req, res) => {
    const userId = req.user.id;
    const results = lastBlastResults.get(userId) || [];
    res.json(results);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blast-call/status
// Status ringkasan blast saat ini untuk user yang sedang login
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', authMiddleware, (req, res) => {
    const userId = req.user.id;
    const sipAgents = req.app.locals.sipAgents || [];

    const results = lastBlastResults.get(userId) || [];
    const userQueueSize = blastQueue.filter(i => i.userId === userId).length;
    const userActiveAgents = sipAgents.filter(a => a.isBusy && a.currentUserId === userId).length;

    const summary = {
        pending: results.filter(r => r.status === 'PENDING').length,
        completed: results.filter(r => r.status === 'COMPLETED').length,
        failed: results.filter(r => r.status === 'FAILED').length,
        canceled: results.filter(r => r.status === 'CANCELED').length,
    };

    res.json({
        inQueue: userQueueSize,
        activeAgents: userActiveAgents,
        maxConcurrent: userMaxConcurrent.get(userId) || sipAgents.length,
        summary
    });
});

// Export helper agar bisa diakses dari index.js untuk watchdog
function clearBlastQueue() {
    blastQueue = [];
}

module.exports = { router, processBlastQueue, blastQueue: () => blastQueue, clearBlastQueue };
