// ============================================================
// socket.js — Kết nối Socket.IO & xử lý sự kiện realtime
// ============================================================

function connectSocket() {
    if (socket) {
        socket.disconnect();
    }

    socket = io({ auth: { token: token } });

    // Lỗi kết nối (token hết hạn,...)
    socket.on('connect_error', (err) => {
        console.error('[Socket] Lỗi kết nối:', err.message);
        showAuthError('Phiên làm việc hết hạn, vui lòng đăng nhập lại.');
        logoutUser();
    });

    // Cập nhật danh sách user online
    socket.on('updateUserList', (users) => {
        allUsersMap = users;
        renderUserList(users);
    });

    // Nhận tin nhắn mới realtime
    socket.on('receiveMessage', (messageData) => {
        const senderUid = String(messageData.senderUserId || messageData.sender || '');
        const receiverUid = messageData.receiver ? String(messageData.receiver) : null;
        const targetUid = selectedUserId ? String(selectedUserId) : null;
        const myUid = String(currentUser?.userId || currentUser?.id || '');

        let isCurrentChat = false;
        if (messageData.isPrivate) {
            isCurrentChat = Boolean(
                targetUid && (
                    senderUid === targetUid ||
                    receiverUid === targetUid ||
                    (senderUid === myUid && receiverUid === targetUid)
                )
            );
        } else {
            isCurrentChat = (targetUid === null);
        }

        if (isCurrentChat) {
            renderSingleMessage(messageData);
        }
    });

    // Tin nhắn bị thu hồi
    socket.on('messageDeleted', (data) => {
        const targetId = String(data.messageId);
        const msgEl = document.getElementById(`msg-${targetId}`);
        if (msgEl) {
            msgEl.classList.add('deleted-msg');
            const textContentEl = msgEl.querySelector('.msg-text-content');
            if (textContentEl) textContentEl.innerHTML = '<i>Tin nhắn đã bị thu hồi</i>';
            // Cập nhật _msgData để context menu phản ánh đúng trạng thái
            if (msgEl._msgData) msgEl._msgData.isDeleted = true;
        }
        loadMessageHistory();
    });

    // Tin nhắn được ghim / bỏ ghim → reload để cập nhật banner
    socket.on('messagePinned', () => {
        loadMessageHistory();
    });

    socket.on('messageUnpinned', () => {
        loadMessageHistory();
    });
}
