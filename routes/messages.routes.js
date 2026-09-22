const express = require('express');
const router = express.Router();

const Message = process.env.DISABLE_MONGO ? null : require('../models/Message');
const { authMiddleware } = require('../middleware/auth');
const { getIsDbConnected } = require('../config/db');
const { memMessages } = require('../config/storage');

// GET /api/messages?targetUserId=xxx
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { targetUserId } = req.query;
        const currentUid = String(req.user.userId);

        if (getIsDbConnected()) {
            let query = {};
            if (targetUserId) {
                query = {
                    isPrivate: true,
                    $or: [
                        { sender: currentUid, receiver: String(targetUserId) },
                        { sender: String(targetUserId), receiver: currentUid }
                    ]
                };
            } else {
                query = { isPrivate: false };
            }

            const messages = await Message.find(query).sort({ createdAt: 1 }).limit(100);

            const formatted = messages.map(msg => ({
                _id: msg._id.toString(),
                id: msg._id.toString(),
                sender: msg.sender ? msg.sender.toString() : '',
                senderUserId: msg.sender ? msg.sender.toString() : '',
                senderName: msg.senderName,
                receiver: msg.receiver ? msg.receiver.toString() : null,
                text: msg.isDeleted ? 'Tin nhắn đã bị thu hồi' : msg.text,
                isPrivate: msg.isPrivate,
                isPinned: !!msg.isPinned,
                isDeleted: !!msg.isDeleted,
                replyTo: msg.replyTo || null,
                createdAt: msg.createdAt
            }));

            return res.json(formatted);
        }

        // Fallback: In-Memory / File Store
        let messages = [];
        if (targetUserId) {
            const targetUidStr = String(targetUserId);
            messages = memMessages.filter(m =>
                m.isPrivate &&
                ((String(m.sender) === currentUid && String(m.receiver) === targetUidStr) ||
                 (String(m.sender) === targetUidStr && String(m.receiver) === currentUid))
            );
        } else {
            messages = memMessages.filter(m => !m.isPrivate);
        }

        const formatted = messages.map(msg => ({
            ...msg,
            id: String(msg.id || msg._id),
            senderUserId: String(msg.sender || msg.senderUserId),
            receiver: msg.receiver ? String(msg.receiver) : null,
            text: msg.isDeleted ? 'Tin nhắn đã bị thu hồi' : msg.text
        }));

        return res.json(formatted.slice(-100));
    } catch (err) {
        console.error('[Messages] Lỗi lấy tin nhắn:', err);
        res.status(500).json({ error: 'Không thể lấy lịch sử tin nhắn.' });
    }
});

module.exports = router;
