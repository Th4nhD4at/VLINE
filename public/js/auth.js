// ============================================================
// auth.js — Đăng nhập / Đăng ký / Đăng xuất
// ============================================================

// ── Chuyển tab Login ↔ Register ────────────────────────────
function switchAuthTab(mode) {
    currentAuthMode = mode;
    hideAuthError();

    const loginTab = document.getElementById('tabLoginBtn');
    const registerTab = document.getElementById('tabRegisterBtn');
    const title = document.getElementById('authTitle');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (mode === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        title.innerText = 'Đăng Nhập Chat';
        submitBtn.innerText = 'Đăng Nhập';
    } else {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        title.innerText = 'Đăng Ký Tài Khoản';
        submitBtn.innerText = 'Tạo Tài Khoản';
    }
}

function showAuthError(msg) {
    const errorEl = document.getElementById('authErrorMsg');
    errorEl.innerText = msg;
    errorEl.style.display = 'block';
}

function hideAuthError() {
    const errorEl = document.getElementById('authErrorMsg');
    errorEl.style.display = 'none';
}

// ── Gửi form đăng nhập / đăng ký ────────────────────────────
async function submitAuth() {
    hideAuthError();
    const usernameInput = document.getElementById('usernameInput').value.trim();
    const passwordInput = document.getElementById('passwordInput').value;

    if (!usernameInput || !passwordInput) {
        showAuthError('Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.');
        return;
    }

    const endpoint = currentAuthMode === 'register' ? '/api/auth/register' : '/api/auth/login';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });

        const data = await response.json();

        if (!response.ok) {
            showAuthError(data.error || 'Thao tác thất bại.');
            return;
        }

        token = data.token;
        localStorage.setItem('chat_jwt_token', token);
        setCurrentUser(data.user);
        initChatSession();
    } catch (err) {
        console.error('[Auth] Lỗi xác thực:', err);
        showAuthError('Không thể kết nối tới server.');
    }
}

// ── Tự động đăng nhập (kiểm tra token đã lưu) ───────────────
async function verifyStoredToken() {
    try {
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            logoutUser();
            return;
        }

        const data = await response.json();
        setCurrentUser(data.user);
        initChatSession();
    } catch (err) {
        console.error('[Auth] Lỗi kiểm tra token:', err);
        logoutUser();
    }
}

// ── Khởi động phiên chat sau khi đăng nhập ──────────────────
function initChatSession() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('chatScreen').style.display = 'flex';
    connectSocket();
    loadMessageHistory();
}

// ── Đăng xuất ────────────────────────────────────────────────
function logoutUser() {
    token = null;
    currentUser = null;
    selectedSocketId = null;
    selectedUserId = null;
    activeContextMessage = null;
    replyingToMessage = null;
    pinnedMessageRef = null;
    localStorage.removeItem('chat_jwt_token');

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    document.getElementById('usernameInput').value = '';
    document.getElementById('passwordInput').value = '';
    hideAuthError();
    switchAuthTab('login');

    document.getElementById('messagesContainer').innerHTML = '';
    document.getElementById('chatScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
}
