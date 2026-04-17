const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const recordingService = require('../recording-service');

// GET /api/recordings/stream
// Fetch and stream the recording audio file from vendor Server
router.get('/stream', authMiddleware, async (req, res) => {
    const { number, date } = req.query; 
    
    if (!number || !date) {
        return res.status(400).send('Missing number or date');
    }
    
    try {
        await recordingService.streamRecording(number, date, req, res);
    } catch (err) {
        console.error('Recording stream error:', err.message);
        res.status(404).send('Recording not found or unavailable');
    }
});

module.exports = router;
