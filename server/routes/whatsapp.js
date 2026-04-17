const express = require('express');
const router = express.Router();
const whatsappService = require('../whatsapp-service');
const { v4: uuidv4 } = require('uuid');

// LIST SESSIONS
router.get('/sessions', async (req, res) => {
    try {
        const sessions = await whatsappService.getAllSessions();
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE SESSION
router.post('/session', async (req, res) => {
    const sessionId = req.body.sessionId || uuidv4(); 
    const sessionName = req.body.name || `Session ${sessionId.substring(0,6)}`;
    try {
        await whatsappService.createSession(sessionId);
        // Update name if provided
        // We can do this in createSession but simpler to update here or just basic create
        res.json({ sessionId, message: 'Session created' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// LOGOUT SESSION
router.post('/session/:id/logout', async (req, res) => {
    try {
        await whatsappService.logoutSession(req.params.id);
        res.json({ message: 'Session logged out' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE SESSION
router.delete('/session/:id', async (req, res) => {
    try {
        await whatsappService.deleteSession(req.params.id);
        res.json({ message: 'Session deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET STATUS (of specific session)
router.get('/:id/status', (req, res) => {
    const status = whatsappService.getStatus(req.params.id);
    res.json(status);
});

// SEND MESSAGE
router.post('/:id/send', async (req, res) => {
    const { number, message } = req.body;
    try {
        const response = await whatsappService.sendMessage(req.params.id, number, message);
        res.json({ success: true, response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CHECK NUMBER
router.post('/:id/check', async (req, res) => {
    const { number } = req.body;
    try {
        const result = await whatsappService.checkNumber(req.params.id, number);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CHECK BULK
router.post('/:id/check-bulk', async (req, res) => {
    const { numbers } = req.body; // Expects array of strings
    if (!Array.isArray(numbers)) return res.status(400).json({ error: "numbers must be an array" });
    
    try {
        const results = await whatsappService.checkNumbers(req.params.id, numbers);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// SEND BULK
router.post('/:id/send-bulk', async (req, res) => {
    const { recipients, delay } = req.body; // recipients: [{number, message}, ...], delay: ms
    if (!Array.isArray(recipients)) return res.status(400).json({ error: "recipients must be an array" });

    try {
        const results = await whatsappService.sendBatch(req.params.id, recipients, delay);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
