// ============================================================
// chat.js — Chọn cuộc trò chuyện, Tải lịch sử, Gửi tin nhắn
// ============================================================

// ── Chọn cuộc trò chuyện ─────────────────────────────────────
function selectChatTarget(socketId, userId, name, element) {
    selectedSocketId = socketId;
    selectedUserId = userId ? String(userId) : null;
    cancelReply();

    document.getElementById('currentChatTitle').innerText = socketId ? name : 'Phòng Chat Chung';
    document.getElementById('currentChatSubtitle').innerText = socketId
        ? `Trò chuyện riêng với ${name}`
        : 'Lưu và đồng bộ dữ liệu giữa các thiết bị';
    document.getElementById('headerAvatar').innerText = name ? name.charAt(0).toUpperCase() : 'G';

    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    loadMessageHistory();
}

// ── Lọc danh sách user theo ô tìm kiếm ───────────────────────
function filterUserList() {
    const inputVal = document.getElementById('searchInput').value.trim();
    renderUserList(allUsersMap, inputVal);
}

// ── Tải lịch sử tin nhắn từ server ───────────────────────────
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
        console.error('[Chat] Lỗi tải lịch sử tin nhắn:', err);
    }
}

// ── Gửi tin nhắn ─────────────────────────────────────────────
function sendMessage() {
    const messageInputElement = document.getElementById('messageInput');
    const text = messageInputElement.value.trim();

    if (!socket) return;

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

// ── Hủy trả lời ──────────────────────────────────────────────
function cancelReply() {
    replyingToMessage = null;
    const previewBar = document.getElementById('replyPreviewBar');
    if (previewBar) previewBar.style.display = 'none';
}

// ── Emoji & trạng thái nút gửi ───────────────────────────────
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
