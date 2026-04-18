let Client, LocalAuth;
try {
    const wa = require('whatsapp-web.js');
    Client = wa.Client;
    LocalAuth = wa.LocalAuth;
} catch (e) {
    console.warn("⚠️ [WhatsApp] Module 'whatsapp-web.js' not found. WhatsApp features will be disabled.");
}

const db = require('./database');

class WhatsAppService {
    constructor() {
        this.sessions = new Map(); // sessionId -> Client
        this.qrCodes = new Map(); // sessionId -> qrCode
        this.loadingStats = new Map(); // sessionId -> { percent, message }
    }

    async initialize() {
        // Load sessions from DB
        db.all("SELECT * FROM whatsapp_sessions", [], async (err, rows) => {
            if (err) {
                console.error("Failed to load WA sessions:", err);
                return;
            }
            if (rows.length === 0) {
                console.log("No WhatsApp sessions found.");
                return;
            }
            console.log(`Loading ${rows.length} WhatsApp sessions...`);
            for (const row of rows) {
                await this.createSession(row.id, false);
            }
        });
    }

    async createSession(sessionId, isNew = true) {
        if (this.sessions.has(sessionId)) return;

        console.log(`Initializing WA Session: ${sessionId}`);
        
        if (!Client) {
            console.error(`✗ [${sessionId}] Cannot create session: whatsapp-web.js not installed.`);
            return;
        }

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: sessionId }),
            puppeteer: {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                headless: true
            }
        });

        // Event Handlers
        client.on('loading_screen', (percent, message) => {
            this.loadingStats.set(sessionId, { percent, message });
            this.updateStatus(sessionId, `syncing ${percent}%`);
        });

        client.on('qr', (qr) => {
            console.log(`[${sessionId}] QR Received`);
            this.qrCodes.set(sessionId, qr);
            this.loadingStats.delete(sessionId);
            this.updateStatus(sessionId, 'scanning');
        });

        client.on('ready', () => {
            console.log(`[${sessionId}] Ready`);
            this.qrCodes.delete(sessionId);
            this.loadingStats.delete(sessionId);
            this.updateStatus(sessionId, 'connected');
        });

        client.on('authenticated', () => {
            console.log(`[${sessionId}] Authenticated`);
            this.qrCodes.delete(sessionId);
        });

        client.on('auth_failure', () => {
             console.error(`[${sessionId}] Auth Failure`);
             this.updateStatus(sessionId, 'disconnected');
        });

        client.on('disconnected', () => {
            console.log(`[${sessionId}] Disconnected`);
            this.updateStatus(sessionId, 'disconnected');
            this.qrCodes.delete(sessionId);
            // Optionally re-init or just leave disconnected until user action
             client.initialize(); 
        });
        
        client.initialize().catch(err => console.error(`[${sessionId}] Init Error:`, err));
        
        this.sessions.set(sessionId, client);
        
        if (isNew) {
             const stmt = db.prepare("INSERT OR IGNORE INTO whatsapp_sessions (id, name, status) VALUES (?, ?, ?)");
             stmt.run(sessionId, `Session ${sessionId}`, 'initializing');
             stmt.finalize();
        }
    }

    async logoutSession(sessionId) {
        const client = this.sessions.get(sessionId);
        if (client) {
            try {
                await client.logout();
                console.log(`[${sessionId}] Logged out manually`);
            } catch (e) { 
                console.error('Error logging out client:', e); 
            }
            // We don't destroy the client here, just logout. 
            // The 'disconnected' event will handle status update and cleanup.
        }
    }

    async deleteSession(sessionId) {
        const client = this.sessions.get(sessionId);
        if (client) {
            try {
                await client.destroy();
            } catch (e) { console.error('Error destroying client:', e); }
            this.sessions.delete(sessionId);
            this.qrCodes.delete(sessionId);
        }
        
        return new Promise((resolve, reject) => {
             db.run("DELETE FROM whatsapp_sessions WHERE id = ?", [sessionId], (err) => {
                 if (err) reject(err);
                 else resolve();
             });
        });
    }

    updateStatus(sessionId, status) {
        db.run("UPDATE whatsapp_sessions SET status = ? WHERE id = ?", [status, sessionId]);
    }

    getQR(sessionId) {
        return this.qrCodes.get(sessionId);
    }
    
    getStatus(sessionId) {
        const client = this.sessions.get(sessionId);
        if (!client) return { status: 'not_found' };
        
        const qr = this.qrCodes.get(sessionId);
        const info = (client.info && client.info.wid) ? client.info : undefined;
        const loading = this.loadingStats.get(sessionId);
        
        return {
            isReady: !!info,
            isAuthenticated: !!info,
            qrCode: qr,
            status: qr ? 'scanning' : (info ? 'connected' : (loading ? 'syncing' : 'initializing')),
            info: info,
            loading: loading
        };
    }
    
    getAllSessions() {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM whatsapp_sessions", [], (err, rows) => {
                if (err) return reject(err);
                const results = rows.map(r => {
                    const status = this.getStatus(r.id);
                    return { ...r, ...status };
                });
                resolve(results);
            });
        });
    }

    async sendMessage(sessionId, number, message) {
        const client = this.sessions.get(sessionId);
        if (!client) throw new Error('Session not found');

        let formattedNumber = number.replace(/\D/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.slice(1);
        }
        if (!formattedNumber.endsWith('@c.us')) {
            formattedNumber += '@c.us';
        }

        try {
            const response = await client.sendMessage(formattedNumber, message);
            return response;
        } catch (error) {
            console.error(`[${sessionId}] Send Error:`, error);
            throw error;
        }
    }

    async checkNumber(sessionId, number) {
        const client = this.sessions.get(sessionId);
        if (!client) throw new Error('Session not found');

        let formattedNumber = number.replace(/\D/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.slice(1);
        }
         const checkId = formattedNumber + '@c.us';

        try {
            const isRegistered = await client.isRegisteredUser(checkId);
            return {
                number: number,
                formatted: formattedNumber,
                isRegistered: isRegistered
            };
        } catch (error) {
            return { number, isRegistered: false, error: error.message };
        }
    }

    async checkNumbers(sessionId, numbers) {
        const results = [];
        for (const number of numbers) {
            results.push(await this.checkNumber(sessionId, number));
        }
        return results;
    }

    async sendBatch(sessionId, recipients, delay = 1000) {
        const client = this.sessions.get(sessionId);
        if (!client) throw new Error('Session not found');

        const results = {
            total: recipients.length,
            success: 0,
            failed: 0,
            details: []
        };

        for (const recipient of recipients) {
            try {
                await this.sendMessage(sessionId, recipient.number, recipient.message);
                results.success++;
                results.details.push({ number: recipient.number, status: 'sent' });
            } catch (error) {
                results.failed++;
                results.details.push({ number: recipient.number, status: 'failed', error: error.message });
            }
            
            // Wait for delay
            if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        }
        return results;
    }
}

module.exports = new WhatsAppService();
