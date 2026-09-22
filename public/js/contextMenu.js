// ============================================================
// contextMenu.js — Menu chuột phải (Trả lời / Sao chép / Ghim / Xóa)
// ============================================================

function showContextMenu(e, messageData) {
    activeContextMessage = messageData;
    const menu = document.getElementById('contextMenu');

    // Hiện/ẩn nút Ghim / Bỏ ghim tùy trạng thái
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

    // Clamping: đảm bảo menu không bị ra ngoài viewport
    const menuWidth = menu.offsetWidth || 190;
    const menuHeight = menu.offsetHeight || 200;

    let left = e.clientX;
    let top = e.clientY;

    if (left + menuWidth > window.innerWidth - 12) left = window.innerWidth - menuWidth - 12;
    if (top + menuHeight > window.innerHeight - 12) top = window.innerHeight - menuHeight - 12;
    if (left < 12) left = 12;
    if (top < 12) top = 12;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
}

// ── Trả lời tin nhắn ─────────────────────────────────────────
function handleMenuReply() {
    hideContextMenu();
    if (!activeContextMessage || activeContextMessage.isDeleted) return;

    replyingToMessage = activeContextMessage;
    document.getElementById('replySenderName').innerText = activeContextMessage.senderName;
    document.getElementById('replyTextSnippet').innerText = `"${activeContextMessage.text}"`;
    document.getElementById('replyPreviewBar').style.display = 'flex';
    document.getElementById('messageInput').focus();
}

// ── Sao chép nội dung ────────────────────────────────────────
function handleMenuCopy() {
    hideContextMenu();
    if (!activeContextMessage || !activeContextMessage.text || activeContextMessage.isDeleted) return;
    navigator.clipboard.writeText(activeContextMessage.text).catch(err => {
        console.error('[ContextMenu] Lỗi sao chép:', err);
    });
}

// ── Ghim tin nhắn ────────────────────────────────────────────
function handleMenuPin() {
    hideContextMenu();
    if (!activeContextMessage || !socket) return;
    const msgId = String(activeContextMessage.id || activeContextMessage._id);
    socket.emit('pinMessage', { messageId: msgId });
}

// ── Bỏ ghim tin nhắn (từ context menu) ──────────────────────
function handleMenuUnpin() {
    hideContextMenu();
    if (!activeContextMessage || !socket) return;
    const msgId = String(activeContextMessage.id || activeContextMessage._id);
    socket.emit('unpinMessage', { messageId: msgId });
}

// ── Bỏ ghim (từ nút X trên banner) ──────────────────────────
function unpinCurrentMessage() {
    if (pinnedMessageRef && socket) {
        const msgId = String(pinnedMessageRef.id || pinnedMessageRef._id);
        socket.emit('unpinMessage', { messageId: msgId });
    }
}

// ── Thu hồi / Xóa tin nhắn ──────────────────────────────────
function handleMenuDelete() {
    hideContextMenu();
    if (!activeContextMessage || !socket) return;
    const msgId = String(activeContextMessage.id || activeContextMessage._id);
    socket.emit('deleteMessage', { messageId: msgId });
}
