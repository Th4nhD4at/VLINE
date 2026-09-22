const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Dữ liệu in-memory (load từ file lúc khởi động)
let memUsers = [];
let memMessages = [];

try {
    if (fs.existsSync(USERS_FILE)) {
        memUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
    if (fs.existsSync(MESSAGES_FILE)) {
        memMessages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    }
    console.log(`[Storage] Đã tải ${memUsers.length} users và ${memMessages.length} tin nhắn từ file.`);
} catch (err) {
    console.error('[Storage] Lỗi đọc file JSON vĩnh viễn:', err.message);
}

function saveUsersToFile() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(memUsers, null, 2), 'utf8');
    } catch (err) {
        console.error('[Storage] Lỗi ghi file users.json:', err.message);
    }
}

function saveMessagesToFile() {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(memMessages, null, 2), 'utf8');
    } catch (err) {
        console.error('[Storage] Lỗi ghi file messages.json:', err.message);
    }
}

module.exports = {
    memUsers,
    memMessages,
    saveUsersToFile,
    saveMessagesToFile
};
