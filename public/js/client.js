let token = localStorage.getItem('chat_jwt_token') || null;
let socket = null;
let currentUser = null; // { id, userId, username }
let selectedSocketId = null;
let selectedUserId = null;
let currentAuthMode = 'login';
let allUsersMap = {};

let activeContextMessage = null; // Message right-clicked
let replyingToMessage = null;    // Message currently being replied to
let pinnedMessageRef = null;     // Pinned message for banner (separate from context menu)

document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        verifyStoredToken();
    }

    // Event Delegation cho Context Menu khi chuột phải trong khung tin nhắn
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

    // Hide context menu on click anywhere else or Escape key
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#contextMenu')) {
            hideContextMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            cancelReply();
        }
    });
});

// Helper chuẩn hóa object currentUser
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

// 1. Chuyển đổi Tab Auth
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

// 2. Submit Auth API
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
        console.error('Lỗi xác thực:', err);
        showAuthError('Không thể kết nối tới server.');
    }
}

// 3. Auto Login Verification
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
        console.error('Lỗi kiểm tra token:', err);
        logoutUser();
    }
}

function initChatSession() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('chatScreen').style.display = 'flex';

    connectSocket();
    loadMessageHistory();
}

// 4. Socket.IO Realtime Connect & Event Handlers
function connectSocket() {
    if (socket) {
        socket.disconnect();
    }

    socket = io({
        auth: { token: token }
    });

    socket.on('connect_error', (err) => {
        console.error('Lỗi kết nối Socket:', err.message);
        showAuthError('Phiên làm việc hết hạn, vui lòng đăng nhập lại.');
        logoutUser();
    });

    socket.on('updateUserList', (users) => {
        allUsersMap = users;
        renderUserList(users);
    });

    socket.on('receiveMessage', (messageData) => {
        const senderUid = String(messageData.senderUserId || messageData.sender || '');
        const receiverUid = messageData.receiver ? String(messageData.receiver) : null;
        const targetUid = selectedUserId ? String(selectedUserId) : null;
        const myUid = String(currentUser?.userId || currentUser?.id || '');

        let isCurrentChat = false;
        if (messageData.isPrivate) {
            isCurrentChat = Boolean(
                targetUid && (senderUid === targetUid || receiverUid === targetUid || (senderUid === myUid && receiverUid === targetUid))
            );
        } else {
            isCurrentChat = (targetUid === null);
        }

        if (isCurrentChat) {
            renderSingleMessage(messageData);
        }
    });

    // Realtime events
    socket.on('messageDeleted', (data) => {
        const targetId = String(data.messageId);
        const msgEl = document.getElementById(`msg-${targetId}`);
        if (msgEl) {
            msgEl.classList.add('deleted-msg');
            const textContentEl = msgEl.querySelector('.msg-text-content');
            if (textContentEl) textContentEl.innerHTML = '<i>Tin nhắn đã bị thu hồi</i>';
        }
        loadMessageHistory();
    });

    socket.on('messagePinned', (data) => {
        loadMessageHistory();
    });

    socket.on('messageUnpinned', (data) => {
        loadMessageHistory();
    });
}

// 5. User list rendering
function renderUserList(users, filterText = '') {
    if (selectedSocketId !== null && !users[selectedSocketId]) {
        selectChatTarget(null, null, 'Phòng Chat Chung', null);
    }

    const userListElement = document.getElementById('userList');
    userListElement.innerHTML = '';

    if ('phòng chat chung'.includes(filterText.toLowerCase())) {
        const groupLi = document.createElement('li');
        groupLi.className = `chat-item ${selectedSocketId === null ? 'active' : ''}`;
        groupLi.onclick = function() { selectChatTarget(null, null, 'Phòng Chat Chung', this); };
        groupLi.innerHTML = `
            <div class="chat-item-avatar" style="background:#0084ff;">G</div>
            <div class="chat-item-info">
                <div class="chat-item-top">
                    <span class="chat-item-name">Phòng Chat Chung</span>
                    <span class="chat-item-time">Tất cả</span>
                </div>
                <div class="chat-item-preview">Kênh trò chuyện nhóm công khai</div>
            </div>
        `;
        userListElement.appendChild(groupLi);
    }

    for (let socketId in users) {
        const userObj = users[socketId];
        const userObjId = String(userObj.userId);
        const myUid = String(currentUser?.userId || currentUser?.id || '');

        if (socketId !== socket?.id && userObjId !== myUid) {
            if (filterText && !userObj.username.toLowerCase().includes(filterText.toLowerCase())) {
                continue;
            }

            const initial = userObj.username ? userObj.username.charAt(0).toUpperCase() : 'U';
            const userLi = document.createElement('li');
            userLi.className = `chat-item ${selectedSocketId === socketId ? 'active' : ''}`;
            userLi.onclick = function() { selectChatTarget(socketId, userObjId, userObj.username, this); };
            userLi.innerHTML = `
                <div class="chat-item-avatar" style="background:#166fe5;">
                    ${initial}
                    <span class="online-indicator"></span>
                </div>
                <div class="chat-item-info">
                    <div class="chat-item-top">
                        <span class="chat-item-name">${escapeHtml(userObj.username)}</span>
                        <span class="chat-item-time">Online</span>
                    </div>
                    <div class="chat-item-preview">Nhấp để trò chuyện riêng</div>
                </div>
            `;
            userListElement.appendChild(userLi);
        }
    }
}

function filterUserList() {
    const inputVal = document.getElementById('searchInput').value.trim();
    renderUserList(allUsersMap, inputVal);
}

// 6. Select Chat Target
function selectChatTarget(socketId, userId, name, element) {
    selectedSocketId = socketId;
    selectedUserId = userId ? String(userId) : null;
    cancelReply();

    document.getElementById('currentChatTitle').innerText = socketId ? name : 'Phòng Chat Chung';
    document.getElementById('currentChatSubtitle').innerText = socketId ? `Trò chuyện riêng với ${name}` : 'Lưu và đồng bộ dữ liệu giữa các thiết bị';
    document.getElementById('headerAvatar').innerText = name ? name.charAt(0).toUpperCase() : 'G';

    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }

    loadMessageHistory();
}

// 7. Load Message History from Backend
async function loadMessageHistory() {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    
    updatePinnedBanner(null);

    try {
        let url = '/api/messages';
        if (selectedUserId) {
            url += `?targetUserId=${encodeURIComponent(selectedUserId)}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const messages = await response.json();
            let pinnedMsg = null;

            messages.forEach(msg => {
                const messageData = {
                    id: String(msg.id || msg._id),
                    senderUserId: String(msg.sender || msg.senderUserId),
                    senderName: msg.senderName,
                    receiver: msg.receiver ? String(msg.receiver) : null,
                    text: msg.text,
                    isPrivate: msg.isPrivate,
                    isPinned: !!msg.isPinned,
                    isDeleted: !!msg.isDeleted,
                    replyTo: msg.replyTo || null,
                    createdAt: msg.createdAt
                };

                if (messageData.isPinned && !messageData.isDeleted) {
                    pinnedMsg = messageData;
                }

                renderSingleMessage(messageData);
            });

            updatePinnedBanner(pinnedMsg);
        }
    } catch (err) {
        console.error('Lỗi tải lịch sử tin nhắn:', err);
    }
}

// 8. Render Single Message
function renderSingleMessage(data) {
    const messagesContainer = document.getElementById('messagesContainer');
    const msgId = String(data.id || data._id);
    
    const existingEl = document.getElementById(`msg-${msgId}`);
    if (existingEl) {
        existingEl.remove();
    }

    const messageElement = document.createElement('div');
    messageElement.id = `msg-${msgId}`;
    messageElement._msgData = data; // Lưu tham chiếu dữ liệu cho context menu

    const senderUid = String(data.senderUserId || data.sender || '');
    const myUid = String(currentUser?.userId || currentUser?.id || '');

    const isMe = Boolean(
        (senderUid && myUid && senderUid === myUid) ||
        (data.senderName && currentUser && data.senderName === currentUser.username) ||
        (data.senderId && socket && data.senderId === socket.id)
    );

    let classNames = `message ${isMe ? 'my-message' : 'other-message'} ${data.isPrivate ? 'private-message' : ''}`;
    if (data.isDeleted) classNames += ' deleted-msg';
    messageElement.className = classNames;

    const timeStr = data.createdAt ? new Date(data.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const statusText = isMe && !data.isDeleted ? `<span class="status-check">✓ Đã gửi</span>` : '';
    const pinnedTag = data.isPinned ? `<span class="pinned-tag" title="Tin nhắn đã ghim">📌</span>` : '';

    let replyQuoteHTML = '';
    if (data.replyTo && !data.isDeleted) {
        replyQuoteHTML = `
            <div class="reply-quote-box">
                <div class="reply-quote-sender">${escapeHtml(data.replyTo.senderName)}</div>
                <div class="reply-quote-text">${escapeHtml(data.replyTo.text)}</div>
            </div>
        `;
    }

    messageElement.innerHTML = `
        <div class="sender-name">${isMe ? 'Tôi' : escapeHtml(data.senderName)}</div>
        ${replyQuoteHTML}
        <div class="msg-text-content">${data.isDeleted ? '<i>Tin nhắn đã bị thu hồi</i>' : escapeHtml(data.text)}</div>
        <div class="message-meta">
            ${pinnedTag}
            <span>${timeStr}</span>
            ${statusText}
        </div>
    `;

    messageElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, data);
    });

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 9. Context Menu Controller (Menu Chuột Phải nắn 100% trong viewport)
function showContextMenu(e, messageData) {
    activeContextMessage = messageData;
    const menu = document.getElementById('contextMenu');

    const pinItem = document.getElementById('menuPinItem');
    const unpinItem = document.getElementById('menuUnpinItem');

    if (messageData.isPinned) {
        pinItem.style.display = 'none';
        unpinItem.style.display = 'flex';
    } else {
        pinItem.style.display = 'flex';
        unpinItem.style.display = 'none';
    }

    menu.style.display = 'block';

    const menuWidth = menu.offsetWidth || 190;
    const menuHeight = menu.offsetHeight || 190;
    
    let left = e.clientX;
    let top = e.clientY;

    if (left + menuWidth > window.innerWidth - 12) {
        left = window.innerWidth - menuWidth - 12;
    }
    if (top + menuHeight > window.innerHeight - 12) {
        top = window.innerHeight - menuHeight - 12;
    }
    if (left < 12) left = 12;
    if (top < 12) top = 12;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
}

function handleMenuReply() {
    hideContextMenu();
    if (!activeContextMessage || activeContextMessage.isDeleted) return;

    replyingToMessage = activeContextMessage;

    document.getElementById('replySenderName').innerText = activeContextMessage.senderName;
    document.getElementById('replyTextSnippet').innerText = `"${activeContextMessage.text}"`;
    document.getElementById('replyPreviewBar').style.display = 'flex';

    const input = document.getElementById('messageInput');
    input.focus();
}

function handleMenuCopy() {
    hideContextMenu();
    if (!activeContextMessage || !activeContextMessage.text || activeContextMessage.isDeleted) return;
    navigator.clipboard.writeText(activeContextMessage.text).catch(err => {
        console.error('Lỗi sao chép:', err);
    });
}

function handleMenuPin() {
    hideContextMenu();
    if (!activeContextMessage || !socket) return;
    const msgId = String(activeContextMessage.id || activeContextMessage._id);
    socket.emit('pinMessage', { messageId: msgId });
}

function handleMenuUnpin() {
    hideContextMenu();
    if (!activeContextMessage || !socket) return;
    const msgId = String(activeContextMessage.id || activeContextMessage._id);
    socket.emit('unpinMessage', { messageId: msgId });
}

function unpinCurrentMessage() {
    if (pinnedMessageRef && socket) {
        const msgId = String(pinnedMessageRef.id || pinnedMessageRef._id);
        socket.emit('unpinMessage', { messageId: msgId });
    }
}

function handleMenuDelete() {
    hideContextMenu();
    if (!activeContextMessage || !socket) return;
    const msgId = String(activeContextMessage.id || activeContextMessage._id);
    socket.emit('deleteMessage', { messageId: msgId });
}

function cancelReply() {
    replyingToMessage = null;
    const previewBar = document.getElementById('replyPreviewBar');
    if (previewBar) previewBar.style.display = 'none';
}

function updatePinnedBanner(pinnedMsg) {
    const banner = document.getElementById('pinnedBanner');
    const textEl = document.getElementById('pinnedText');

    if (pinnedMsg && !pinnedMsg.isDeleted) {
        textEl.innerText = `${pinnedMsg.senderName}: "${pinnedMsg.text}"`;
        banner.style.display = 'flex';
        pinnedMessageRef = pinnedMsg; // Use separate ref, do NOT touch activeContextMessage
    } else {
        banner.style.display = 'none';
        pinnedMessageRef = null;
    }
}

function scrollToPinnedMessage() {
    if (pinnedMessageRef) {
        const msgId = String(pinnedMessageRef.id || pinnedMessageRef._id);
        const msgEl = document.getElementById(`msg-${msgId}`);
        if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            msgEl.style.transform = 'scale(1.05)';
            setTimeout(() => { msgEl.style.transform = 'scale(1)'; }, 500);
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// 10. Gửi tin nhắn
function sendMessage() {
    const messageInputElement = document.getElementById('messageInput');
    const text = messageInputElement.value.trim();

    if (socket) {
        const msgText = text !== '' ? text : '👍';
        
        let replyPayload = null;
        if (replyingToMessage) {
            replyPayload = {
                id: String(replyingToMessage.id || replyingToMessage._id),
                senderName: replyingToMessage.senderName,
                text: replyingToMessage.text
            };
        }

        socket.emit('sendMessage', {
            text: msgText,
            toSocketId: selectedSocketId,
            targetUserId: selectedUserId ? String(selectedUserId) : null,
            isPrivate: selectedSocketId !== null,
            replyTo: replyPayload
        });

        messageInputElement.value = '';
        cancelReply();
        updateSendBtnState();
    }
}

function insertEmoji(emoji) {
    const input = document.getElementById('messageInput');
    input.value += emoji;
    input.focus();
    updateSendBtnState();
}

function updateSendBtnState() {
    const inputVal = document.getElementById('messageInput').value.trim();
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.innerText = inputVal.length > 0 ? '🚀' : '👍';
    }
}

// 11. Đăng xuất
function logoutUser() {
    token = null;
    currentUser = null;
    selectedSocketId = null;
    selectedUserId = null;
    activeContextMessage = null;
    replyingToMessage = null;
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