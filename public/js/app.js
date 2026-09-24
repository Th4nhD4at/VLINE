// ============================================================
// app.js — Global State & DOMContentLoaded Bootstrap
// ============================================================

// Biến trạng thái toàn cục (dùng chung cho tất cả module)
let token = localStorage.getItem('chat_jwt_token') || null;
let socket = null;
let currentUser = null; // { id, userId, username }
let selectedSocketId = null;
let selectedUserId = null;
let currentAuthMode = 'login';
let allUsersMap = {};

let activeContextMessage = null; // Tin nhắn đang được chuột phải
let replyingToMessage = null;    // Tin nhắn đang được trả lời
let pinnedMessageRef = null;     // Tin nhắn ghim (cho banner, KHÔNG dùng chung với activeContextMessage)

// ── Khởi tạo ứng dụng ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Tự động đăng nhập nếu đã có token
    if (token) {
        verifyStoredToken();
    }

    // Event Delegation: context menu (chuột phải) trong khung tin nhắn
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.addEventListener('contextmenu', (e) => {
            const msgEl = e.target.closest('.message');
            if (msgEl && msgEl._msgData) {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e, msgEl._msgData);
            }
        });
    }

    // Ẩn context menu khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#contextMenu')) {
            hideContextMenu();
        }
    });

    // Ẩn context menu khi nhấn Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            cancelReply();
        }
    });
});

// ── Helper chuẩn hóa currentUser ───────────────────────────
function setCurrentUser(user) {
    if (!user) {
        currentUser = null;
        return;
    }
    const uid = String(user.userId || user.id || user._id);
    currentUser = {
        id: uid,
        userId: uid,
        username: user.username
    };

    const initialEl = document.getElementById('navUserInitial');
    if (initialEl) {
        initialEl.innerText = user.username ? user.username.charAt(0).toUpperCase() : 'V';
    }
}

// ── Hàm tiện ích escape HTML ────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text || '';
    return div.innerHTML;
}

// Hàm bật/tắt khung danh sách chat (Hỗ trợ cả PC & Mobile)
function toggleSidebar(e) {
    if (e) e.preventDefault(); // Ngăn ngừa trễ sự kiện cảm ứng trên điện thoại
    
    const sidebar = document.querySelector('.sidebar-panel');
    const msgBtn = document.getElementById('navMessageBtn');
    
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        
        if (msgBtn) {
            if (sidebar.classList.contains('collapsed')) {
                msgBtn.classList.remove('active');
            } else {
                msgBtn.classList.add('active');
            }
        }
    }
}