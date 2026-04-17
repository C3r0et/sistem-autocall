const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const SipAgent = require('./sip-agent');

// ─── Routes ──────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const statsRoutes = require('./routes/stats');
const usersRoutes = require('./routes/users');
const extensionsRoutes = require('./routes/extensions');
const dashboardRoutes = require('./routes/dashboard');
const whatsappRoutes = require('./routes/whatsapp');
const { router: blastRoutes, processBlastQueue, blastQueue, clearBlastQueue } = require('./routes/blast');
const recordingsRoutes = require('./routes/recordings');

// ─── Middleware ───────────────────────────────────────────────────────────────
const { authMiddleware } = require('./middleware/auth');
// Import pelindung SSO yang keren itu
const ssoAuth = require('./middleware/ssoAuth'); 
// ─── Services ─────────────────────────────────────────────────────────────────
const whatsappService = require('./whatsapp-service');
const db = require('./database');

// ─────────────────────────────────────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(bodyParser.json());

app.locals.settings = { global_vendor: 'telesave' };
db.all("SELECT * FROM settings", [], (err, rows) => {
    if (!err && rows) {
        rows.forEach(r => app.locals.settings[r.key] = r.value);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Register Routes
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', ssoAuth.protect, whatsappRoutes);

app.use('/api/stats', ssoAuth.protect, statsRoutes);
app.use('/api/users', ssoAuth.protect, usersRoutes);
app.use('/api/extensions', ssoAuth.protect, extensionsRoutes);
app.use('/api/dashboard', ssoAuth.protect, dashboardRoutes);
app.use('/api/blast-call', ssoAuth.protect, blastRoutes);
app.use('/api/recordings', ssoAuth.protect, recordingsRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server & Socket.IO
// ─────────────────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Expose io ke routes via app.locals
app.locals.io = io;

io.on('connection', (socket) => {
    // User biasa bergabung ke room mereka sendiri
    socket.on('join-user', (userId) => {
        if (userId) {
            const roomName = `user_${userId}`;
            socket.join(roomName);
            console.log(`Socket ${socket.id} joined room ${roomName}`);
        }
    });

    // Admin bergabung ke admin-room untuk mendapat semua aktivitas
    socket.on('join-admin', () => {
        socket.join('admin-room');
        console.log(`Admin socket ${socket.id} joined admin-room`);

        // Kirim snapshot status awal saat admin connect
        const currentQueue = blastQueue();
        const queueByUserMap = {};
        currentQueue.forEach(item => {
            queueByUserMap[item.userId] = (queueByUserMap[item.userId] || 0) + 1;
        });
        const snapshot = {
            agents: sipAgents.map(a => a.getStatus()),
            queueLength: currentQueue.length,
            queueByUser: Object.entries(queueByUserMap).map(([userId, count]) => ({ userId, count })),
            timestamp: new Date()
        };
        socket.emit('admin-snapshot', snapshot);
    });

    socket.on('disconnect', () => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// SIP Agent Pool
// ─────────────────────────────────────────────────────────────────────────────
const sipAgents = [];
app.locals.sipAgents = sipAgents;

/**
 * Reload SIP agents dari database.
 * Agen baru distart, agen yang sudah dihapus dari DB di-destroy dengan benar.
 */
async function reloadAgents() {
    console.log('[Agents] Reloading SIP agents from DB...');

    db.all("SELECT * FROM sip_accounts WHERE active = 1", [], (err, rows) => {
        if (err) {
            console.error('[Agents] Failed to load extensions from DB:', err);
            return;
        }

        const dbExtensions = rows;
        const currentExtensions = sipAgents.map(a => a.extension);
        const dbExtensionNumbers = dbExtensions.map(acc => acc.extension);

        // 1. Hentikan & destroy agent yang sudah tidak ada di DB
        const agentsToRemove = sipAgents.filter(a => !dbExtensionNumbers.includes(a.extension));
        agentsToRemove.forEach(agent => {
            try {
                agent.destroy(); // Tutup socket & clear interval dengan benar
            } catch (e) {
                console.error(`[Agents] Error destroying ${agent.extension}:`, e.message);
            }
            const idx = sipAgents.indexOf(agent);
            if (idx > -1) sipAgents.splice(idx, 1);
        });

        // 2. Start agent baru yang ada di DB tapi belum ada di pool
        const newAccounts = dbExtensions.filter(acc => !currentExtensions.includes(acc.extension));
        newAccounts.forEach(acc => {
            console.log(`[Agents] Starting agent ${acc.extension}...`);
            const agent = new SipAgent({
                serverIp: acc.serverIp,
                domain: acc.domain,
                extension: acc.extension,
                password: acc.password,
                io
            });
            agent.start();
            sipAgents.push(agent);
        });

        console.log(`[Agents] Active agents: ${sipAgents.length}`);

        // Langsung proses queue jika ada item menunggu
        if (blastQueue().length > 0) {
            processBlastQueue(sipAgents, io);
        }
    });
}

// Register fungsi reload agar bisa dipanggil dari routes (extensions, dll)
app.set('reloadAgents', reloadAgents);

// ─────────────────────────────────────────────────────────────────────────────
// Watchdog: Pastikan queue terus berjalan jika ada agent bebas
// ─────────────────────────────────────────────────────────────────────────────
setInterval(() => {
    if (blastQueue().length > 0) {
        const freeAgents = sipAgents.filter(a => !a.isBusy && a.registered);
        if (freeAgents.length > 0) {
            processBlastQueue(sipAgents, io);
        }
    }
}, 3000);

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint Legacy untuk SIP Check (non-blast, kompatibilitas frontend lama)
// ─────────────────────────────────────────────────────────────────────────────
const { v4: uuidv4 } = require('uuid');
const { subscriptionMiddleware } = require('./middleware/auth');

app.post('/api/check', ssoAuth.protect, subscriptionMiddleware, async (req, res) => {
    const { numbers } = req.body;
    if (!numbers || !Array.isArray(numbers)) {
        return res.status(400).json({ error: 'Daftar nomor tidak valid' });
    }
    if (sipAgents.length === 0) {
        return res.status(503).json({ error: 'Tidak ada SIP agent aktif' });
    }

    const chunkMap = new Map();
    numbers.forEach((num, index) => {
        const agentIndex = index % sipAgents.length;
        if (!chunkMap.has(agentIndex)) chunkMap.set(agentIndex, []);
        chunkMap.get(agentIndex).push(num);
    });

    chunkMap.forEach((nums, agentIndex) => {
        sipAgents[agentIndex].addToQueue(nums);
    });

    res.json({ message: 'Nomor ditambahkan ke antrian pengecekan', count: numbers.length, agentsActive: chunkMap.size });
});

app.post('/api/stop', ssoAuth.protect, (req, res) => {
    // Hentikan antrian legacy per-agent
    sipAgents.forEach(agent => agent.stopQueue());
    // Hentikan juga blast queue global
    clearBlastQueue();
    res.json({ message: 'Semua antrian pengecekan dan blast dihentikan' });
});


// ─────────────────────────────────────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
});

// Inisialisasi agent dan WhatsApp setelah server siap (beri waktu DB selesai seed)
setTimeout(() => {
    reloadAgents();
    whatsappService.initialize();
}, 1000);
