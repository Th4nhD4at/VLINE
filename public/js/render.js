// ============================================================
// render.js — Vẽ danh sách user, tin nhắn, banner ghim
// ============================================================

// ── Render danh sách người dùng trong sidebar ────────────────
function renderUserList(users, filterText = '') {
    if (selectedSocketId !== null && !users[selectedSocketId]) {
        selectChatTarget(null, null, 'Phòng Chat Chung', null);
    }

    const userListElement = document.getElementById('userList');
    userListElement.innerHTML = '';

    // Phòng chat chung
    if ('phòng chat chung'.includes(filterText.toLowerCase())) {
        const groupLi = document.createElement('li');
        groupLi.className = `chat-item ${selectedSocketId === null ? 'active' : ''}`;
        groupLi.onclick = function () { selectChatTarget(null, null, 'Phòng Chat Chung', this); };
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

    // Danh sách user online (trừ chính mình)
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
            userLi.onclick = function () { selectChatTarget(socketId, userObjId, userObj.username, this); };
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

// Hàm chuyển đổi văn bản: Vừa chống XSS vừa tự động nhận diện Link
function formatMessageText(text) {
    if (!text) return '';
    // Escape HTML để chống XSS
    const safeText = String(text).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
    // Nhận diện URL (http, https, www)
    const urlPattern = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return safeText.replace(urlPattern, (match) => {
        let href = match.toLowerCase().startsWith('www.') ? 'http://' + match : match;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-link">${match}</a>`;
    });
}

// ── Render một tin nhắn vào khung chat ──────────────────────
function renderSingleMessage(data) {
    const messagesContainer = document.getElementById('messagesContainer');
    const msgId = String(data.id || data._id);

    // Nếu đã tồn tại (update), xóa và vẽ lại
    const existingEl = document.getElementById(`msg-${msgId}`);
    if (existingEl) existingEl.remove();

    const messageElement = document.createElement('div');
    messageElement.id = `msg-${msgId}`;
    messageElement._msgData = data; // Gắn data cho context menu

    // Xác định tin nhắn có phải của mình không
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

    const timeStr = data.createdAt
        ? new Date(data.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
    const statusText = isMe && !data.isDeleted ? `<span class="status-check">✓ Đã gửi</span>` : '';
    const pinnedTag = data.isPinned ? `<span class="pinned-tag" title="Tin nhắn đã ghim">📌</span>` : '';

    let replyQuoteHTML = '';
    if (data.replyTo && !data.isDeleted) {
        replyQuoteHTML = `
            <div class="reply-quote-box">
                <div class="reply-quote-sender">${escapeHtml(data.replyTo.senderName)}</div>
                <div class="reply-quote-text">${formatMessageText(data.replyTo.text)}</div>
            </div>
        `;
    }

    messageElement.innerHTML = `
        <div class="sender-name">${isMe ? 'Tôi' : escapeHtml(data.senderName)}</div>
        ${replyQuoteHTML}
        <div class="msg-text-content">${data.isDeleted ? '<i>Tin nhắn đã bị thu hồi</i>' : formatMessageText(data.text)}</div>
        <div class="message-meta">
            ${pinnedTag}
            <span>${timeStr}</span>
            ${statusText}
        </div>
    `;

    // Backup listener (phòng trường hợp event delegation không bắt được)
    messageElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, data);
    });

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ── Banner tin nhắn ghim ─────────────────────────────────────
function updatePinnedBanner(pinnedMsg) {
    const banner = document.getElementById('pinnedBanner');
    const textEl = document.getElementById('pinnedText');

    if (pinnedMsg && !pinnedMsg.isDeleted) {
        textEl.innerText = `${pinnedMsg.senderName}: "${pinnedMsg.text}"`;
        banner.style.display = 'flex';
        pinnedMessageRef = pinnedMsg; // KHÔNG ghi đè activeContextMessage
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

