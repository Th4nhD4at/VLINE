const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const User = process.env.DISABLE_MONGO ? null : require('../models/User');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const { getIsDbConnected } = require('../config/db');
const { memUsers, saveUsersToFile } = require('../config/storage');

// Helper tìm user theo username (tìm DB trước, fallback in-memory)
async function findUserByUsername(username) {
    const normalized = username.toLowerCase();
    if (getIsDbConnected()) {
        try {
            const mongoUser = await User.findOne({ username: new RegExp('^' + normalized + '$', 'i') });
            if (mongoUser) return mongoUser;
        } catch (err) {
            console.error('[Auth] Lỗi truy vấn Mongo User:', err.message);
        }
    }
    return memUsers.find(u => u.username.toLowerCase() === normalized) || null;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || username.trim().length < 3 || password.length < 4) {
            return res.status(400).json({ error: 'Tên đăng nhập phải ít nhất 3 ký tự và mật khẩu ít nhất 4 ký tự.' });
        }

        const normalizedUsername = username.trim();
        const existingUser = await findUserByUsername(normalizedUsername);
        if (existingUser) {
            return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại trong hệ thống.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        let userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        if (getIsDbConnected()) {
            try {
                const newUser = new User({ username: normalizedUsername, password: hashedPassword });
                await newUser.save();
                userId = newUser._id.toString();
            } catch (dbErr) {
                console.error('[Auth] Lỗi lưu Mongo User:', dbErr.message);
            }
        }

        memUsers.push({
            id: String(userId),
            username: normalizedUsername,
            password: hashedPassword,
            createdAt: new Date()
        });
        saveUsersToFile();

        const token = jwt.sign(
            { userId: String(userId), username: normalizedUsername },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Đăng ký tài khoản thành công!',
            token,
            user: { id: String(userId), userId: String(userId), username: normalizedUsername }
        });
    } catch (err) {
        console.error('[Auth] Lỗi đăng ký:', err);
        res.status(500).json({ error: 'Có lỗi xảy ra trên server khi đăng ký: ' + err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
        }

        const normalizedUsername = username.trim();
        const user = await findUserByUsername(normalizedUsername);
        if (!user) {
            return res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không chính xác.' });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không chính xác.' });
        }

        const userId = String(user._id ? user._id.toString() : user.id);
        const token = jwt.sign(
            { userId, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Đăng nhập thành công!',
            token,
            user: { id: userId, userId, username: user.username }
        });
    } catch (err) {
        console.error('[Auth] Lỗi đăng nhập:', err);
        res.status(500).json({ error: 'Có lỗi xảy ra trên server khi đăng nhập.' });
    }
});

// GET /api/auth/me — kiểm tra token (Auto Login)
router.get('/me', authMiddleware, (req, res) => {
    res.json({
        user: {
            id: String(req.user.userId),
            userId: String(req.user.userId),
            username: req.user.username
        }
    });
});

module.exports = router;
