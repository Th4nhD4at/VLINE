const mongoose = process.env.DISABLE_MONGO ? null : require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chat-app';

let isDbConnected = false;

async function connectDB() {
    if (process.env.DISABLE_MONGO) return;
    mongoose.set('bufferCommands', false);

    try {
        // Không để quá trình khởi động bị treo vô hạn nếu MongoDB không khả dụng.
        const connectPromise = mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('MongoDB connection timeout')), 4000);
        });
        await Promise.race([connectPromise, timeoutPromise]);
        isDbConnected = true;
        console.log('[MongoDB] Kết nối cơ sở dữ liệu MongoDB thành công!');
    } catch (err) {
        isDbConnected = false;
        console.warn(`[MongoDB Warning] Chưa kết nối được MongoDB (${err.message}). Đang lưu trữ dữ liệu vĩnh viễn vào file JSON!`);
    }

    mongoose.connection.on('connected', () => { isDbConnected = true; });
    mongoose.connection.on('disconnected', () => { isDbConnected = false; });
}

function getIsDbConnected() {
    return isDbConnected;
}

module.exports = { connectDB, getIsDbConnected };
