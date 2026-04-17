const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

// Helper to check if user is admin
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'SPV_IT' || req.user.role === 'STAFF_IT' || req.user.role === 'STAFF_IT_HELPER') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Admin only.' });
    }
};

// Apply auth and admin check to all routes
router.use(authMiddleware);
router.use(adminOnly);

// GET /api/users - List all users
router.get('/', (req, res) => {
    const sql = "SELECT id, email, phone, role, isSubscribed, trialEndsAt, createdAt FROM users ORDER BY createdAt DESC";
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ users: rows });
    });
});

// POST /api/users - Create new user
router.post('/', (req, res) => {
    const { email, phone, password, role } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Email and Password are required" });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);
    const userRole = role || 'user';
    
    // Default trial 30 days
    const now = new Date();
    const trialEndsAt = new Date(now.setDate(now.getDate() + 30)).toISOString();

    const sql = `INSERT INTO users (email, phone, password, role, trialEndsAt) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(sql, [email, phone, hashedPassword, userRole, trialEndsAt], function(err) {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        res.status(201).json({ 
            message: "User created successfully", 
            user: { id: this.lastID, email, phone, role: userRole } 
        });
    });
});

// PUT /api/users/:id - Update user
router.put('/:id', (req, res) => {
    const { email, phone, role, password } = req.body;
    const userId = req.params.id;

    // Build query dynamically
    let updates = [];
    let params = [];

    if (email) { updates.push("email = ?"); params.push(email); }
    if (phone) { updates.push("phone = ?"); params.push(phone); }
    if (role) { updates.push("role = ?"); params.push(role); }
    if (password) { 
        updates.push("password = ?"); 
        params.push(bcrypt.hashSync(password, 8)); 
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    params.push(userId);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        res.json({ message: "User updated successfully", changes: this.changes });
    });
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', (req, res) => {
    const userId = req.params.id;
    
    // Prevent deleting self (optional but good practice)
    if (parseInt(userId) === req.userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
    }

    db.run("DELETE FROM users WHERE id = ?", [userId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "User deleted successfully", changes: this.changes });
    });
});

// POST /api/users/:id/generate-token - Generate API Key
router.post('/:id/generate-token', (req, res) => {
    const userId = req.params.id;
    
    // Check if user exists first
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: "User not found" });

        // Generate Long-Lived Token (1 Year)
        // We import JWT_SECRET from middleware/auth normally, but here we need to require it.
        // Let's modify imports first to include JWT_SECRET.
        const { JWT_SECRET } = require('../middleware/auth');
        const token = require('jsonwebtoken').sign({ id: user.id }, JWT_SECRET, { expiresIn: '365d' });

        // Store Token in DB so we can show it again
        db.run("UPDATE users SET api_token = ? WHERE id = ?", [token, userId], (err) => {
            if (err) console.error("Failed to save token to DB", err);
        });

        res.json({ 
            message: "API Token generated successfully", 
            token: token,
            note: "This token is valid for 1 year. Keep it safe."
        });
    });
});

// GET /api/users/:id/token - Retrieve existing token
router.get('/:id/token', (req, res) => {
    const userId = req.params.id;
    
    // Check if admin or self
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
        return res.status(403).json({ error: "Access denied" });
    }

    db.get("SELECT api_token FROM users WHERE id = ?", [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "User not found" });
        
        res.json({ token: row.api_token });
    });
});

module.exports = router;
