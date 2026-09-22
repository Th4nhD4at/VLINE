require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { connectDB } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const messagesRoutes = require('./routes/messages.routes');
const { initSocketHandlers } = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messagesRoutes);

// Socket.IO
initSocketHandlers(io);

// Khởi động HTTP server ngay để ứng dụng dùng được với JSON fallback.
server.listen(PORT, () => {
    console.log(`✅ VLINE Server đang chạy tại: http://localhost:${PORT}`);
});
