const mongoose = process.env.DISABLE_MONGO ? null : require('mongoose');
const Message = process.env.DISABLE_MONGO ? null : require('../models/Message');
const { verifySocketToken } = require('../middleware/auth');
const { getIsDbConnected } = require('../config/db');
const { memMessages, saveMessagesToFile } = require('../config/storage');

// Lấy danh sách user đang online
function getOnlineUsers(io) {
    const onlineUsers = {};
    for (let [id, socket] of io.sockets.sockets) {
        if (socket.user) {
            onlineUsers[id] = {
                userId: String(socket.user.userId),
                username: socket.user.username
            };
        }
    }
    return onlineUsers;
}

function initSocketHandlers(io) {
    // Middleware xác thực JWT cho Socket
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        const decoded = verifySocketToken(token);
        if (!decoded) {
            return next(new Error('Xác thực Socket thất bại: Token không hợp lệ'));
        }
        socket.user = decoded;
        next();
    });

    io.on('connection', (socket) => {
        console.log(`[Online] ${socket.user.username} kết nối (Socket: ${socket.id})`);
        io.emit('updateUserList', getOnlineUsers(io));

        // ── 1. Gửi tin nhắn ──────────────────────────────────────────
        socket.on('sendMessage', async (data) => {
            try {
                const { text, toSocketId, targetUserId, isPrivate, replyTo } = data;
                if (!text || text.trim() === '') return;

                let messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                let createdAt = new Date();
                const senderUidStr = String(socket.user.userId);
                const targetUidStr = targetUserId ? String(targetUserId) : null;

                if (getIsDbConnected()) {
                    try {
                        const messageDoc = new Message({
                            sender: senderUidStr,
                            senderName: socket.user.username,
                            receiver: isPrivate && targetUidStr ? targetUidStr : null,
                            text: text.trim(),
                            isPrivate: !!isPrivate,
                            replyTo: replyTo || null,
                            createdAt
                        });
                        await messageDoc.save();
                        messageId = messageDoc._id.toString();
                        createdAt = messageDoc.createdAt;
                    } catch (dbErr) {
                        console.error('[Socket] Lỗi lưu tin nhắn MongoDB:', dbErr.message);
                    }
                }

                const newMsgObj = {
                    id: String(messageId),
                    sender: senderUidStr,
                    senderUserId: senderUidStr,
                    senderName: socket.user.username,
                    receiver: isPrivate && targetUidStr ? targetUidStr : null,
                    text: text.trim(),
                    isPrivate: !!isPrivate,
                    isPinned: false,
                    isDeleted: false,
                    replyTo: replyTo || null,
                    createdAt
                };

                memMessages.push(newMsgObj);
                saveMessagesToFile();

                const messageData = { ...newMsgObj, senderId: socket.id };

                if (toSocketId) {
                    io.to(toSocketId).emit('receiveMessage', messageData);
                    socket.emit('receiveMessage', messageData);
                } else {
                    io.emit('receiveMessage', messageData);
                }
            } catch (err) {
                console.error('[Socket] Lỗi khi gửi/lưu tin nhắn:', err);
            }
        });

        // ── 2. Thu hồi / Xóa tin nhắn ────────────────────────────────
        socket.on('deleteMessage', async (data) => {
            try {
                const { messageId } = data;
                if (!messageId) return;
                const targetStr = String(messageId);

                if (getIsDbConnected() && mongoose.Types.ObjectId.isValid(targetStr)) {
                    try {
                        await Message.findByIdAndUpdate(targetStr, {
                            isDeleted: true,
                            text: 'Tin nhắn đã bị thu hồi'
                        });
                    } catch (dbErr) {
                        console.error('[Socket] Lỗi xóa tin nhắn MongoDB:', dbErr.message);
                    }
                }

                const memMsg = memMessages.find(m => String(m.id) === targetStr || String(m._id) === targetStr);
                if (memMsg) {
                    memMsg.isDeleted = true;
                    memMsg.text = 'Tin nhắn đã bị thu hồi';
                    saveMessagesToFile();
                }

                io.emit('messageDeleted', { messageId: targetStr });
            } catch (err) {
                console.error('[Socket] Lỗi khi xóa tin nhắn:', err);
            }
        });

        // ── 3. Ghim tin nhắn ─────────────────────────────────────────
        socket.on('pinMessage', async (data) => {
            try {
                const { messageId } = data;
                if (!messageId) return;
                const targetStr = String(messageId);
                let targetMsg = null;

                if (getIsDbConnected() && mongoose.Types.ObjectId.isValid(targetStr)) {
                    try {
                        const doc = await Message.findByIdAndUpdate(targetStr, { isPinned: true }, { new: true });
                        if (doc) {
                            targetMsg = {
                                id: doc._id.toString(),
                                senderUserId: doc.sender ? doc.sender.toString() : '',
                                senderName: doc.senderName,
                                text: doc.text,
                                isPinned: true,
                                createdAt: doc.createdAt
                            };
                        }
                    } catch (dbErr) {
                        console.error('[Socket] Lỗi ghim tin nhắn MongoDB:', dbErr.message);
                    }
                }

                const memMsg = memMessages.find(m => String(m.id) === targetStr || String(m._id) === targetStr);
                if (memMsg) {
                    memMsg.isPinned = true;
                    saveMessagesToFile();
                    if (!targetMsg) targetMsg = memMsg;
                }

                if (targetMsg) {
                    io.emit('messagePinned', { messageId: targetStr, message: targetMsg });
                }
            } catch (err) {
                console.error('[Socket] Lỗi khi ghim tin nhắn:', err);
            }
        });

        // ── 4. Bỏ ghim tin nhắn ──────────────────────────────────────
        socket.on('unpinMessage', async (data) => {
            try {
                const { messageId } = data;
                if (!messageId) return;
                const targetStr = String(messageId);

                if (getIsDbConnected() && mongoose.Types.ObjectId.isValid(targetStr)) {
                    try {
                        await Message.findByIdAndUpdate(targetStr, { isPinned: false });
                    } catch (dbErr) {
                        console.error('[Socket] Lỗi bỏ ghim tin nhắn MongoDB:', dbErr.message);
                    }
                }

                const memMsg = memMessages.find(m => String(m.id) === targetStr || String(m._id) === targetStr);
                if (memMsg) {
                    memMsg.isPinned = false;
                    saveMessagesToFile();
                }

                io.emit('messageUnpinned', { messageId: targetStr });
            } catch (err) {
                console.error('[Socket] Lỗi khi bỏ ghim tin nhắn:', err);
            }
        });

        // ── Disconnect ────────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`[Offline] ${socket.user ? socket.user.username : socket.id} ngắt kết nối`);
            io.emit('updateUserList', getOnlineUsers(io));
        });
    });
}

module.exports = { initSocketHandlers };
