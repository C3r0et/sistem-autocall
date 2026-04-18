const dgram = require('dgram');
const sip = require('sip');
const md5 = require('md5');
const { v4: uuidv4 } = require('uuid');

function randomString() {
    return Math.floor(Math.random() * 1e16).toString(16);
}

const os = require('os');
const db = require('./database');

class SipAgent {
    constructor({ serverIp, domain, extension, password, io }) {
        this.serverIp = serverIp;
        this.domain = domain || serverIp; // Use domain if provided, fallback to serverIp
        this.serverPort = 5060;
        this.extension = extension;
        this.password = password;
        this.io = io;
        this.socket = dgram.createSocket('udp4');
        this.activeCalls = new Map();
        this.queue = [];
        this.isRunning = false;
        this.tag = randomString();
        this.registered = false;
        this.isBlasting = false; // Keep for legacy
        this.blastQueue = [];
        this.isBusy = false; // New busy state for worker pool
        this.callStatus = 'IDLE'; // IDLE, DIALING, RINGING, ANSWERED, FAILED
        this.handledCalls = 0;
        this.localIp = this.getIp(); // Cache the IP on initialization
    }

    start() {
        if (!this.socket) {
            this.socket = dgram.createSocket('udp4');
        }
        // Regenerate tag for new session to avoid 482 Request Merged (server sees duplicate Call-ID)
        this.tag = randomString();
        this.registered = false; // Reset status just in case
        
        this.socket.bind();
        this.socket.on('listening', () => {
             console.log(`SIP Client listening on ${this.getIp()}:${this.socket.address().port}`);
             this.register();
             // Re-register setiap 60 detik jika sudah terdaftar
             this._reregisterInterval = setInterval(() => {
                 if (this.registered) {
                     this.register();
                 }
             }, 60000);
        });
        
        this.socket.on('message', (msg, rinfo) => {
            try {
                if (msg.length < 10) return;
                
                const msgStr = msg.toString();
                
                // Reduced logging in production
                // console.log(`\n>>> Extension ${this.extension}: Received from ${rinfo.address}:${rinfo.port}`);
                // console.log(msgStr.substring(0, 150) + '...');
                
                // Manual parsing for all responses to avoid library bugs
                // Manual parsing removed - using sip.parse for everything
                // if (msgStr.startsWith('SIP/2.0')) {
                //    this.handleManualResponse(msgStr);
                //    return;
                // }
                
                // For requests, try library parser
                const message = sip.parse(msgStr);
                if (message) {
                    this.handleMessage(message, rinfo);
                }
            } catch (e) {
                // Silently ignore parse errors
            }
        });
        
        this.socket.on('error', (err) => {
            console.error('Socket error:', err);
        });
    }

    
    // Legacy manual parsing removed


    register(authData = null) {
        const register = {
             method: 'REGISTER',
             uri: `sip:${this.domain}`,
             headers: {
                 to: { uri: `sip:${this.extension}@${this.domain}` },
                 from: { uri: `sip:${this.extension}@${this.domain}`, params: { tag: this.tag } },
                 'call-id': `reg-${this.tag}`, 
                 cseq: { method: 'REGISTER', seq: authData ? 2 : 1 },
                 'content-length': 0,
                 contact: [{ uri: `sip:${this.extension}@${this.getIp()}:${this.socket.address().port}` }],
                 'max-forwards': 70,
                 'user-agent': 'MicroSIP/3.21.3',
                 via: [{
                     version: '2.0',
                     protocol: 'UDP',
                     host: this.getIp(),
                     port: this.socket.address().port,
                     params: { 
                         branch: 'z9hG4bK' + Math.floor(Math.random() * 1e16),
                         rport: null
                     }
                 }]
             }
         };
 
         if (authData) {
             // Build authorization string manually to avoid library bug
             register.headers.authorization = `Digest username="${authData.username}", realm="${authData.realm}", nonce="${authData.nonce}", uri="${authData.uri}", response="${authData.response}", algorithm=MD5`;
             console.log(`Extension ${this.extension}: Sending authenticated REGISTER`);
             console.log(`  Authorization: ${register.headers.authorization}`);
         } else {
             console.log(`Extension ${this.extension}: Sending initial REGISTER to ${this.serverIp}:${this.serverPort}`);
         }
 
         const buffer = Buffer.from(sip.stringify(register));
         this.socket.send(buffer, 0, buffer.length, this.serverPort, this.serverIp, (err) => {
             if (err) console.error(`Extension ${this.extension}: Failed to send REGISTER:`, err);
         });
    }

    getIp() {
        if (this.localIp) return this.localIp; // Always return cached IP if available
        
        if (process.env.LOCAL_IP) {
            console.log(`Using LOCAL_IP from env: ${process.env.LOCAL_IP}`);
            return process.env.LOCAL_IP;
        }

        const interfaces = os.networkInterfaces();
        let fallbackIp = '';
        let preferredIp = '';

        console.log('Scanning network interfaces for IP:');
        
        // Scan ALL interfaces first to find the best one
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip internal and non-IPv4
                if (iface.internal || iface.family !== 'IPv4') continue;

                // Skip common virtual adapters (VirtualBox, etc.)
                if (iface.address.startsWith('192.168.56.')) continue;
                
                console.log(`  - ${name}: ${iface.address}`);
                
                // Prioritize 10.x.x.x (corporate LAN) over 192.168.x.x (home WiFi)
                if (iface.address.startsWith('10.')) {
                    preferredIp = iface.address;
                    // Don't break, continue scanning to log all interfaces
                } else if (iface.address.startsWith('192.168.') && !fallbackIp) {
                    fallbackIp = iface.address; // Keep as fallback
                }
            }
        }
        
        const selectedIp = preferredIp || fallbackIp || '127.0.0.1';
        console.log(`Selected IP: ${selectedIp} (preferred: ${preferredIp}, fallback: ${fallbackIp})`);
        return selectedIp;
    }
    
    // ... (same as before)

    addToQueue(numbers) {
        this.queue.push(...numbers);
        this.processQueue();
    }

    stopQueue() {
        this.queue = [];
        this.isRunning = false;
    }

    async processQueue() {
        if (this.isRunning || this.queue.length === 0) return;
        this.isRunning = true;

        while (this.queue.length > 0) {
            const number = this.queue.shift();
            this.broadcastUpdate(number, 'DIALING');
            try {
                await this.checkNumber(number);
                await new Promise(r => setTimeout(r, 2000)); // 2s delay to avoid rate limits
            } catch (error) {
                console.error(`Error checking ${number}:`, error);
                this.broadcastUpdate(number, 'ERROR', error.message);
            }
        }
        
        this.isRunning = false;
        this.io.emit('check-complete'); // Notify frontend that checking is done
        console.log('✓ Number validation completed');
    }

    broadcastUpdate(number, status, details = '') {
        this.io.emit('status-update', { number, status, details });
    }

    logCallToDb(number, status, error, duration, type, ringingDuration = 0, talkDuration = 0) {
        // Use a slight delay to ensure we don't block critical SIP loops, though sqlite is async
        setTimeout(() => {
            const query = `INSERT INTO call_logs (number, status, error_message, duration, agent_extension, type, ringing_duration, talk_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            db.run(query, [number, status, error, duration, this.extension, type, ringingDuration, talkDuration], (err) => {
                if (err) console.error(`Extension ${this.extension}: Failed to log call to DB`, err.message);
            });
        }, 100);
    }

    // Single Call Execution for Central Queue
    // Single Call Execution for Central Queue with Retry Logic
    // Single Call Execution for Central Queue with Retry Logic
    // Single Call Execution for Central Queue with Retry Logic
    async makeCall(item, duration = 3) {
        // Handle both string (legacy/single) and object (blast with ID) inputs
        const number = typeof item === 'object' ? item.number : item;
        const id = typeof item === 'object' ? item.id : null;
        
        console.log(`[DEBUG] Agent ${this.extension} makeCall requested for:`, item);
        console.log(`[DEBUG] Extracted Number: ${number}, ID: ${id}`);

        if (!number) {
            console.error(`[ERROR] Agent ${this.extension} makeCall called with NULL number! Item:`, item);
            return { success: false, error: 'Invalid number (null/undefined)' };
        }

        if (this.isBusy) {
            return { success: false, error: 'Agent is busy' };
        }

        this.isBusy = true;
        this.callStatus = 'DIALING';
        this.currentCallNumber = number;
        this.currentUserId = typeof item === 'object' ? item.userId : null; // Track who owns this call
        this.emitStatusUpdate();
        
        // Determine type
        const isScreening = typeof item === 'object' && item.isScreening;
        const type = isScreening ? 'VALIDATION' : 'BLAST';
        const startTime = Date.now();
        
        // Wait for registration if needed
        if (!this.registered) {
            console.log(`Extension ${this.extension}: Waiting for SIP registration...`);
             const maxWait = 5000;
             const startWait = Date.now();
             while (!this.registered && (Date.now() - startWait) < maxWait) {
                 await new Promise(r => setTimeout(r, 100));
             }
             if (!this.registered) {
                 this.isBusy = false;
                 return { success: false, error: 'Registration timeout' };
             }
        }

        const maxRetries = 1;
        let attempt = 1;
        let lastError = null;
        let lastStatus = null;

        // Indonesian Status Mapping
        const SIP_STATUS_MAP = {
            408: 'Request Timeout (Waktu Habis)',
            480: 'Nomor Tidak Tersedia Sementara (480)',
            486: 'Nomor Sedang Sibuk (486)',
            487: 'Request Terminated (487)',
            503: 'Layanan Tidak Tersedia (503)',
            404: 'Nomor Tidak Ditemukan (404)',
            403: 'Akses Ditolak (403)',
            603: 'Panggilan Ditolak (603)',
            'TIMEOUT': 'Tidak Ada Jawaban (Batas Waktu Habis)'
        };

        const getStatusText = (status) => SIP_STATUS_MAP[status] || `Error SIP ${status}`;

        let lastResult = null;
        while (attempt <= maxRetries) {
            console.log(`Agent ${this.extension}: Processing call to ${number} (Attempt ${attempt}/${maxRetries}) [ID: ${id}]`);
            
            // Only emit 'CALLING' on first attempt to avoid UI flickering, or emit 'RETRYING'
            if (attempt === 1) {
                this.io.emit('blast-update', { id, number, status: 'CALLING', agent: this.extension });
            } else {
                 this.io.emit('blast-update', { id, number, status: 'RETRYING', agent: this.extension, details: `Mencoba lagi (${attempt})...` });
            }

            try {
                const result = await this._executeCall({ number, id }, duration);
                lastResult = result; // Keep reference for duration logging in final block
                
                if (result.success) {
                    this.io.emit('blast-update', { id, number, status: 'COMPLETED', agent: this.extension });
                    this.currentCallNumber = null;
                    this.callStatus = 'IDLE';
                    this.emitStatusUpdate();
                    
                    const talkDuration = result.answeredTime ? 
                        Math.round((Date.now() - result.answeredTime) / 1000) : 0;

                    this.handledCalls++; // Increment counter
                    this.isBusy = false; // MUST reset isBusy
                    return { success: true, ringingTime: result.ringingTime, answeredTime: result.answeredTime, sipStatus: 200 };
                }

                // If we get here, it's a "handled" failure (like 486 Busy) that might be retryable
                lastStatus = result.status;
                lastError = getStatusText(lastStatus);

                // Check for retryable statuses
                // 408: Request Timeout
                // 480: Temporarily Unavailable
                // 486: Busy Here
                // 503: Service Unavailable
                // TIMEOUT: Internal timeout (Removed from retryable to respect rate limits)
                const retryable = [408, 480, 486, 503];
                
                if (retryable.includes(lastStatus)) {
                    console.log(`Agent ${this.extension}: Call to ${number} failed with ${lastStatus}. Retrying...`);
                    
                    if (attempt < maxRetries) {
                        // Wait before retrying (e.g., 3 seconds)
                        await new Promise(r => setTimeout(r, 3000));
                        attempt++;
                        continue;
                    }
                } else {
                    // Non-retryable error (e.g., 404 Not Found, 403 Forbidden, 603 Decline)
                    console.log(`Agent ${this.extension}: Call to ${number} failed with non-retryable status ${lastStatus}.`);
                    break;
                }

            } catch (error) {
                // Unexpected errors (network issues, internal errors)
                console.error(`Agent ${this.extension}: Unexpected error for ${number}:`, error.message);
                lastError = error.message;
                lastStatus = 'ERROR';
                
                // Retry specific internal errors if needed, otherwise break
                if (error.message === 'Timeout') {
                     if (attempt < maxRetries) {
                        await new Promise(r => setTimeout(r, 3000));
                        attempt++;
                        continue;
                    }
                }
                break;
            }
        }
        
        // Final failure after retries
        this.io.emit('blast-update', { 
            id,
            number, 
            status: 'FAILED', 
            error: lastError, // Send the translated error message
            agent: this.extension 
        });

        this.isBusy = false;
        this.currentCallNumber = null; // Clear call number on failure
        this.callStatus = 'IDLE';
        this.emitStatusUpdate(); // Ensure status update matches idle state
        
        this.handledCalls++; // Increment counter
        return { success: false, error: lastError, sipStatus: lastStatus };
    }

    _executeCall(numberOrItem, duration) {
        let actualNumber = numberOrItem;
        let actualId = null;
        let isScreening = false;

        if (typeof numberOrItem === 'object') {
            actualNumber = numberOrItem.number;
            actualId = numberOrItem.id;
            isScreening = numberOrItem.isScreening;
        }

        return new Promise((resolve, reject) => {
            const callId = uuidv4() + '@' + this.getIp();
            this.currentCallId = callId; // Store for hangup

            
            const context = {
                number: actualNumber,
                id: actualId, // Store ID
                resolve,
                reject,
                status: 'INIT',
                cseq: 1,
                lastInvite: null,
                isBlastCall: !isScreening,
                isScreening: isScreening,
                duration,
                // New: explicit retry handling support in context
                onComplete: (success, status, error, times = {}) => {
                    resolve({ 
                        success, 
                        status, 
                        error, 
                        ringingTime: times.ringingTime || context.ringingTime, 
                        answeredTime: times.answeredTime || context.answeredTime 
                    });
                }
            };
            
            this.activeCalls.set(callId, context);
            console.log(`Extension ${this.extension}: Created context for ${actualNumber} [ID: ${actualId}], Call-ID: ${callId}`);
            
            this.sendInvite(callId, actualNumber);
            
            // Timeout if no response/answer within specified duration
            // Default to 10s if not specified, user wants strict limits
            // Timeout if no response/answer within specified duration
            // Default to 10s if not specified
            const timeoutMs = (duration || 10) * 1000;
            const timeoutId = setTimeout(() => {
                if (this.activeCalls.has(callId)) {
                    const ctx = this.activeCalls.get(callId);
                    console.log(`✗ Extension ${this.extension}: ${actualNumber} - Duration limit reached (${duration || 10}s)`);
                    
                    if (ctx.answered) {
                        this.sendBye(callId);
                    } else {
                        this.sendCancel(callId); 
                    }
                    
                    this.activeCalls.delete(callId);
                        resolve({ 
                            success: ctx.answered ? true : false, 
                            status: ctx.answered ? 'COMPLETED' : 'TIMEOUT', 
                            error: ctx.answered ? null : 'Duration limit exceeded',
                            ringingTime: ctx.ringingTime,
                            answeredTime: ctx.answeredTime
                        });
                }
            }, timeoutMs);

            context.timeoutId = timeoutId;
        });
    }

    // Helper to broadcast updates via Socket.IO
    broadcastUpdate(number, status, error = null, id = null) {
        const payload = { number, status, agent: this.extension };
        if (error) payload.error = error;
        if (id) payload.id = id; // Include ID if available
        
        this.io.emit('update', payload); // For single check
        
        // For blast, we emit 'blast-update' usually from makeCall, but intermediate updates
        // (like RINGING or ANSWERED) should also be emitted if we want real-time feedback
        // However, the current requirement mostly cares about the final result or "Retrying".
        // The frontend 'blast-update' listener in App.jsx handles {id, number, status, ...}.
        // So we should emit 'blast-update' here too if it's a blast call?
        
        // But wait, the blast tab only shows status sent from makeCall loop?
        // Let's check App.jsx... it listens to 'blast-update'.
        // makeCall emits 'CALLING', 'RETRYING', 'COMPLETED', 'FAILED'.
        // It DOES NOT emit 'RINGING' or 'ANSWERED' explicitly unless we do it here.
        // If the user wants to see 'RINGING', we should emit it.
        
        if (id) {
             this.io.emit('blast-update', { id, number, status, error, agent: this.extension });
        }
    }

    async checkNumber(number) {
        console.log(`Extension ${this.extension}: Checking number ${number}`);
        // Use isScreening flag to hangup immediately on ringing
        // Using 10s duration as sufficient for a check (though it will hangup early)
        return this.makeCall({ number, isScreening: true }, 10);
    }

    sendInvite(callId, number, authData = null) {
        console.log(`Extension ${this.extension}: sendInvite called for ${number}, Call-ID: ${callId}, Auth: ${!!authData}`);
        const context = this.activeCalls.get(callId);
        if (!context) {
            console.log(`Extension ${this.extension}: sendInvite - Context not found for Call-ID: ${callId}, cannot send INVITE`);
            return;
        }
        
        // Sanitize number: remove non-digits
        let targetNumber = number.replace(/\D/g, '');
        
        // Auto-convert 08... to 628... ONLY if SIP_NO_AUTO_62 is not set
        if (!process.env.SIP_NO_AUTO_62 && targetNumber.startsWith('08')) {
            targetNumber = '62' + targetNumber.substring(1);
        }
        
        console.log(`Extension ${this.extension}: targetNumber set to ${targetNumber} (Original: ${number})`);

        const invite = {
            method: 'INVITE',
            uri: `sip:${targetNumber}@${this.domain}`,
            headers: {
                to: { uri: `sip:${targetNumber}@${this.domain}` },
                from: { uri: `sip:${this.extension}@${this.domain}`, params: { tag: this.tag } },
                'call-id': callId,
                cseq: { method: 'INVITE', seq: context.cseq },
                'content-type': 'application/sdp',
                contact: [{ uri: `sip:${this.extension}@${this.getIp()}:${this.socket.address().port}` }],
                'max-forwards': 70,
                'user-agent': 'MicroSIP/3.21.3',
                'allow': 'INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, NOTIFY, MESSAGE, SUBSCRIBE, INFO, PUBLISH',
                via: [{
                    version: '2.0',
                    protocol: 'UDP',
                    host: this.getIp(),
                    port: this.socket.address().port,
                    params: { 
                        branch: 'z9hG4bK' + Math.floor(Math.random() * 1e16),
                        rport: null
                    }
                }]
            },
            content: `v=0\r\no=- 20002 20002 IN IP4 ${this.getIp()}\r\ns=Session\r\nc=IN IP4 ${this.getIp()}\r\nt=0 0\r\nm=audio ${10000 + Math.floor(Math.random() * 20000)} RTP/AVP 0 8 101\r\na=rtpmap:0 PCMU/8000\r\na=rtpmap:8 PCMA/8000\r\na=rtpmap:101 telephone-event/8000\r\n`
        };

        // Store Request-URI for ACK construction (needed for 4xx responses)
        context.lastInviteUri = invite.uri;

        if (authData) {
            // Build authorization string manually to avoid library bug
            let authString = `Digest username="${authData.username}", realm="${authData.realm}", nonce="${authData.nonce}", uri="${authData.uri}", response="${authData.response}", algorithm=MD5`;
            
            if (authData.qop) {
                authString += `, qop=${authData.qop}, nc=${authData.nc}, cnonce="${authData.cnonce}"`;
            }
            
            if (authData.isProxy) {
                console.log(`Extension ${this.extension}: Adding Proxy-Authorization header (407 context)`);
                console.log(`  Header Value: ${authString}`);
                invite.headers['proxy-authorization'] = authString;
            } else {
                console.log(`Extension ${this.extension}: Adding Authorization header (401 context)`);
                console.log(`  Header Value: ${authString}`);
                invite.headers.authorization = authString;
            }
        }

        context.lastInvite = invite; // Save for CANCEL

        const buffer = Buffer.from(sip.stringify(invite));
        this.socket.send(buffer, 0, buffer.length, this.serverPort, this.serverIp);
    }

    handleMessage(msg, rinfo) {
        // Handle REGISTER responses separately from calls
        if (msg.headers.cseq.method === 'REGISTER') {
             if (msg.status === 200) {
                 console.log('SIP Registration Successful (Connected)');
                 this.registered = true;
                 this.emitStatusUpdate();
                 this.io.emit('connection-status', { status: 'CONNECTED', ip: this.serverIp });
             } else if (msg.status === 401 || msg.status === 407) {
                 // Needs auth for Register — support both www-authenticate (401) dan proxy-authenticate (407)
                const authHeader = msg.headers['www-authenticate'] || msg.headers['proxy-authenticate'];
                if (!authHeader || !authHeader[0]) {
                    console.error(`Extension ${this.extension}: No auth header in REGISTER ${msg.status} response`);
                    return;
                }
                const realm = authHeader[0].realm.replace(/"/g, '');
                const nonce = authHeader[0].nonce.replace(/"/g, '');
                
                const ha1 = md5(`${this.extension}:${realm}:${this.password}`);
                const ha2 = md5(`REGISTER:sip:${this.serverIp}`);
                const response = md5(`${ha1}:${nonce}:${ha2}`);

                const authData = {
                    username: this.extension,
                    realm,
                    nonce,
                    uri: `sip:${this.serverIp}`,
                    response
                };
                
                this.register(authData);
             }
             return;
        }

        const callId = msg.headers['call-id'];
        const context = this.activeCalls.get(callId);
        
        // DEBUG: Log every non-register message
        if (msg.headers.cseq.method !== 'REGISTER') {
        // console.log(`[SIP-DEBUG] Ext ${this.extension} Rx: ${msg.status || msg.method} ${msg.headers.cseq.method} (CallID: ${callId.substring(0,8)}...)`);
             if (!context) console.log(`[SIP-DEBUG] -> No active context found for this CallID!`);
        }

        if (!context) return;
        
        // ... (rest of handleMessage)
        if (msg.status) {
            // Response
            if (msg.status >= 100 && msg.status < 200) {
                if (msg.status === 180 || msg.status === 183) {
                    // RINGING
                    console.log(`Extension ${this.extension}: Call ${context.number} RINGING (180/183)`);
                    
                    // Update Agent Status
                    this.callStatus = 'RINGING'; 
                    this.emitStatusUpdate();

                    // Update Blast UI
                    this.broadcastUpdate(context.number, 'ACTIVE', 'Ringing', context.id);

                    // Record ringing start if not already set
                    if (!context.ringingTime) {
                        context.ringingTime = Date.now();
                    }

                    if (context.isScreening) {
                        // For validation, we just needed to know it rings.
                        // We terminate IMMEDIATELY to minimize ring duration.
                        console.log(`Extension ${this.extension}: [Screening] Number ${context.number} REACHABLE (Ringing) - Hanging up now.`);
                        this.sendCancel(callId);
                        this.activeCalls.delete(callId);
                        if (context.onComplete) context.onComplete(true, msg.status, null, { ringingTime: context.ringingTime });
                        else context.resolve({ success: true, status: 'ACTIVE', ringingTime: context.ringingTime }); 
                    } else {
                        // For Blast, we emit RINGING progress so the UI reflects current state
                        this.io.emit('blast-update', { 
                            id: context.id, 
                            number: context.number, 
                            status: 'RINGING', 
                            agent: this.extension 
                        });
                    }
                    // For Blast, we continue waiting for answer
                }
            } else if (msg.status === 401 || msg.status === 407) {
                // Auth required for INVITE
                console.log(`Extension ${this.extension}: Handling ${msg.status} for Call-ID: ${callId}`);
                
                // ALWAYS ACK the 401/407 response
                this.sendAck(msg);

                const wwwAuth = msg.headers['www-authenticate'] || msg.headers['proxy-authenticate'];
                 if (!wwwAuth || !wwwAuth[0]) {
                    console.log(`Extension ${this.extension}: No auth header in 401/407 response`);
                    return;
                }

                // Sanitize quotes from realm and nonce
                const realm = wwwAuth[0].realm.replace(/"/g, '');
                const nonce = wwwAuth[0].nonce.replace(/"/g, '');
                const qop = wwwAuth[0].qop ? wwwAuth[0].qop.replace(/"/g, '') : null;

                console.log(`Extension ${this.extension}: Auth Challenge - Realm: ${realm}, Nonce: ${nonce}`);

                // Check for retransmissions or loops
                const msgCseq = msg.headers.cseq ? parseInt(msg.headers.cseq.seq) : 0;
                if (msgCseq < context.cseq) return; // Ignore old
                
                if (context.lastNonce === nonce) {
                    console.log(`✗ ${context.number}: Authentication failed (Nonce reuse)`);
                    this.broadcastUpdate(context.number, 'ERROR', 'Auth failed', context.id);
                    this.activeCalls.delete(callId);
                    if (context.onComplete) context.onComplete(false, 401, 'Authentication failed', { ringingTime: context.ringingTime });
                    else context.resolve({ ringingTime: context.ringingTime });
                    return;
                }
                context.lastNonce = nonce;
                
                // Normalisasi nomor untuk Auth URI mismatch fix
                let authNumber = context.number.replace(/\D/g, '');
                if (authNumber.startsWith('08')) {
                    authNumber = '62' + authNumber.substring(1);
                }
                
                const ha1 = md5(`${this.extension}:${realm}:${this.password}`);
                const ha2 = md5(`INVITE:sip:${authNumber}@${this.domain}`);
                
                let response;
                let nc = null;
                let cnonce = null;

                if (qop) {
                    nc = '00000001'; 
                    cnonce = this.tag; 
                    response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
                } else {
                    response = md5(`${ha1}:${nonce}:${ha2}`);
                }
                
                const authData = {
                    username: this.extension,
                    realm,
                    nonce,
                    uri: `sip:${authNumber}@${this.domain}`,
                    response,
                    qop,
                    nc,
                    cnonce,
                    isProxy: msg.status === 407
                };
                
                context.cseq++;
                this.sendInvite(callId, context.number, authData);

            } else if (msg.status >= 400) {
                // Request Failure
                
                // Update Agent Status
                this.callStatus = 'FAILED';
                this.emitStatusUpdate();

                // If 404 -> Inactive?
                if (msg.status === 404 || msg.status === 480 || msg.status === 486) {
                     this.broadcastUpdate(context.number, 'INACTIVE', `Code ${msg.status}`, context.id);
                } else {
                     this.broadcastUpdate(context.number, 'ERROR', `Code ${msg.status}`, context.id);
                }
                
                this.activeCalls.delete(callId);
                this.sendAck(msg); // ACK failure
                if (context.onComplete) context.onComplete(false, msg.status, `Request failed with ${msg.status}`, { ringingTime: context.ringingTime });
                else context.resolve({ ringingTime: context.ringingTime });

            } else if (msg.status === 200 && msg.headers.cseq.method === 'INVITE') {
                // ANSWERED
                console.log(`Extension ${this.extension}: Call ${context.number} ANSWERED (200 OK)`);

                // Update Agent Status
                this.callStatus = 'ANSWERED';
                this.emitStatusUpdate();

                this.broadcastUpdate(context.number, 'ACTIVE', 'Answered', context.id);
                
                // ALWAYS Send ACK for 200 OK
                this.sendAck(msg);

                if (context.isScreening) {
                    // For validation, done. Even if they answer, we hang up instantly.
                    console.log(`Extension ${this.extension}: [Screening] Number ${context.number} REACHABLE (Answered) - Hanging up now.`);
                    this.sendBye(callId); // Use callId directly
                    this.activeCalls.delete(callId);
                    if (context.onComplete) context.onComplete(true, 200);
                    else context.resolve({ success: true, status: 'ACTIVE' });
                } else {
                    // For Blast, hold the call for duration
                    // Only start timer if not already started (retransmissions)
                    if (!context.answered) {
                        context.answered = true;
                        context.status = 'ANSWERED';
                        context.answeredTime = Date.now();

                        // Gunakan duration dari context (parameter yang dikirim user via API)
                        const talkDuration = context.duration || 10;
                        console.log(`Extension ${this.extension}: Call ${context.number} answered, hangup in ${talkDuration}s.`);

                        // Clear timeout lama dari _executeCall agar tidak overlap
                        if (context.timeoutId) clearTimeout(context.timeoutId);

                        context.timeoutId = setTimeout(() => {
                             if (this.activeCalls.has(callId)) {
                                 console.log(`Extension ${this.extension}: Ending call after ${talkDuration}s of talk time.`);
                                 this.sendBye(callId);
                                 this.activeCalls.delete(callId);
                                 this.callStatus = 'IDLE';
                                 this.currentCallNumber = null;
                                 this.emitStatusUpdate();
                                 if (context.onComplete) context.onComplete(true, 200, null, { ringingTime: context.ringingTime, answeredTime: context.answeredTime });
                             }
                        }, talkDuration * 1000);
                    }
                }
            }
        } else {
            // Request from server (e.g. BYE, OPTIONS)
            if (msg.method === 'BYE') {
                console.log(`Extension ${this.extension}: Received BYE from server for ${context.number}`);
                this.sendAck(msg); // Send 200 OK or ACK depending on what the library/server expects, usually SIP requires 200 OK for BYE
                
                // Technically we should send a 200 OK for a BYE request
                const response = sip.makeResponse(msg, 200, 'OK');
                const buffer = Buffer.from(sip.stringify(response));
                this.socket.send(buffer, 0, buffer.length, rinfo.port, rinfo.address);

                this.activeCalls.delete(callId);
                this.callStatus = 'IDLE';
                this.currentCallNumber = null;
                this.emitStatusUpdate();
                
                if (context.onComplete) {
                     clearTimeout(context.timeoutId);
                     context.onComplete(true, 200, null, { ringingTime: context.ringingTime, answeredTime: context.answeredTime });
                } else if (context.resolve) {
                     clearTimeout(context.timeoutId);
                     context.resolve({ success: true, status: 'COMPLETED', ringingTime: context.ringingTime, answeredTime: context.answeredTime });
                }
            } else if (msg.method === 'OPTIONS') {
                const response = sip.makeResponse(msg, 200, 'OK');
                const buffer = Buffer.from(sip.stringify(response));
                this.socket.send(buffer, 0, buffer.length, rinfo.port, rinfo.address);
            }
        }
    }

    sendAck(msg) {
        try {
            const callId = msg.headers['call-id'];
            const context = this.activeCalls.get(callId);
            
            let via = msg.headers.via;
            if (context && context.lastInvite && context.lastInvite.headers && context.lastInvite.headers.via) {
                 via = context.lastInvite.headers.via;
            }

            const ackUri = (context && context.lastInviteUri) ? context.lastInviteUri : (msg.headers.contact ? msg.headers.contact[0].uri : `sip:${this.serverIp}`);
            
            console.log(`Extension ${this.extension}: Sending ACK to ${ackUri}`);

            const ack = {
                method: 'ACK',
                uri: ackUri,
                headers: {
                    to: msg.headers.to,
                    from: msg.headers.from,
                    'call-id': callId,
                    cseq: { method: 'ACK', seq: msg.headers.cseq.seq },
                    via: via,
                    'max-forwards': 70
                }
            };
            
            // console.log('Constructed ACK:', JSON.stringify(ack, null, 2));

            const buffer = Buffer.from(sip.stringify(ack));
            this.socket.send(buffer, 0, buffer.length, this.serverPort, this.serverIp);
        } catch (error) {
            console.error(`Extension ${this.extension}: Error sending ACK:`, error);
        }
    }

    sendCancel(callId) {
        const context = this.activeCalls.get(callId);
        if (!context || !context.lastInvite) return;
        
        // CANCEL needs same Branch ID as the INVITE it cancels
        const lastVia = context.lastInvite.headers.via[0];
        
        const cancel = {
            method: 'CANCEL',
            uri: context.lastInvite.uri,
            headers: {
                to: context.lastInvite.headers.to,
                from: context.lastInvite.headers.from,
                'call-id': callId,
                cseq: { method: 'CANCEL', seq: context.lastInvite.headers.cseq.seq },
                via: [lastVia],
                'max-forwards': 70
            }
        };
        
        const buffer = Buffer.from(sip.stringify(cancel));
        this.socket.send(buffer, 0, buffer.length, this.serverPort, this.serverIp);
    }

    sendBye(callId) {
        const context = this.activeCalls.get(callId);
        if (!context || !context.lastInvite) return;
        
        const bye = {
            method: 'BYE',
            uri: `sip:${context.number}@${this.domain}`,
            headers: {
                to: context.lastInvite.headers.to,
                from: context.lastInvite.headers.from,
                'call-id': callId,
                cseq: { method: 'BYE', seq: context.cseq + 1 },
                via: context.lastInvite.headers.via,
                'max-forwards': 70
            }
        };
        const buffer = Buffer.from(sip.stringify(bye));
        this.socket.send(buffer, 0, buffer.length, this.serverPort, this.serverIp);
    }

    stop() {
        console.log(`Stopping agent ${this.extension}...`);
        
        // Try to hangup active call first if any
        if (this.isBusy && this.currentCallId) {
             try {
                this.hangup();
             } catch (e) {
                console.error(`Error hanging up during stop:`, e);
             }
        }

        this.registered = false;
        this.isRunning = false; // Stop queue
        this.queue = [];
        
        try {
            if (this.socket) {
                this.socket.close();
                this.socket = null; // Ensure we know it's closed
            }
            console.log(`Extension ${this.extension}: Socket closed`);
        } catch (e) {
            // Ignore if already closed
        }
        
        this.emitStatusUpdate();
    }

    getStatus() {
        const data = {
            extension: this.extension,
            serverIp: this.serverIp,
            registered: this.registered,
            isBusy: this.isBusy,
            status: this.registered ? (this.isBusy ? 'BUSY' : 'ONLINE') : 'OFFLINE',
            callStatus: this.callStatus || 'IDLE',
            currentCall: this.currentCallNumber || null,
            handledCalls: this.handledCalls || 0
        };
        console.log(`[DEBUG] Agent ${this.extension} Status: Busy=${this.isBusy}, Call=${this.currentCallNumber}`);
        return data;
    }

    emitStatusUpdate() {
        if (this.io) {
            this.io.emit('extension-update', this.getStatus());
        }
    }

    hangup() {
        if (!this.currentCallId || !this.activeCalls.has(this.currentCallId)) {
            console.log(`Agent ${this.extension}: No active call to hangup.`);
            return;
        }

        const context = this.activeCalls.get(this.currentCallId);
        console.log(`Agent ${this.extension}: Force hangup for ${context.number} (Status: ${context.status})`);

        if (context.status === 'ANSWERED') {
            this.sendBye(this.currentCallId);
        } else {
            this.sendCancel(this.currentCallId);
        }
        
        // Optimistically clear state
        // Optimistically clear state
        this.isBusy = false;
        this.currentCallNumber = null;
        this.currentCallId = null;
        this.callStatus = 'IDLE';
        this.emitStatusUpdate();
    }

    /**
     * Destroy agent sepenuhnya: hangup panggilan aktif, clear semua interval,
     * tutup socket UDP. Dipanggil saat agent dilepas dari pool (reloadAgents).
     */
    destroy() {
        console.log(`[SipAgent] Destroying agent ${this.extension}...`);

        // Hangup panggilan aktif jika ada
        if (this.isBusy && this.currentCallId) {
            try { this.hangup(); } catch (e) {}
        }

        // Clear interval re-register
        if (this._reregisterInterval) {
            clearInterval(this._reregisterInterval);
            this._reregisterInterval = null;
        }

        this.registered = false;
        this.isRunning = false;
        this.queue = [];
        this.isBusy = false;

        // Tutup socket UDP
        try {
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }
        } catch (e) {
            // Ignore jika sudah tertutup
        }

        console.log(`[SipAgent] Agent ${this.extension} destroyed.`);
    }
}

module.exports = SipAgent;
