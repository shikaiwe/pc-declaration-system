// WebSocket连接
let ws = null;
let currentReportId = null;
let currentUser = null;

// 初始化WebSocket连接
function initWebSocket(reportId) {
    if (ws) {
        ws.close();
    }

    currentReportId = reportId;
    ws = new WebSocket(`ws://8.138.207.95:8000/ws/message/?report_id=${reportId}`);

    ws.onopen = function() {
        console.log('WebSocket连接已建立');
    };

    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_message') {
            appendMessage(data.message);
        }
    };

    ws.onclose = function() {
        console.log('WebSocket连接已关闭');
    };

    ws.onerror = function(error) {
        console.error('WebSocket错误:', error);
    };
}

// 添加消息到聊天界面
function appendMessage(message) {
    const messageList = document.getElementById('messageList');
    const messageItem = document.createElement('div');
    messageItem.className = `message-item ${message.username === currentUser ? 'sent' : 'received'}`;

    messageItem.innerHTML = `
        <div class="message-username">${message.username}</div>
        <div class="message-content">${message.message}</div>
        <div class="message-time">${new Date().toLocaleTimeString()}</div>
    `;

    messageList.appendChild(messageItem);
    messageList.scrollTop = messageList.scrollHeight;
}

// 发送消息
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (message && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chat_message',
            message: message
        }));

        messageInput.value = '';
    }
}

// 获取当前订单ID
function getCurrentReportId() {
    // 尝试从URL参数获取
    const urlParams = new URLSearchParams(window.location.search);
    const urlReportId = urlParams.get('report_id');
    if (urlReportId) {
        return urlReportId;
    }

    // 尝试从当前显示的订单详情中获取
    const orderDetailCard = document.getElementById('orderDetailCard');
    if (orderDetailCard && orderDetailCard.style.display !== 'none') {
        const orderInfo = orderDetailCard.querySelector('.order-info');
        if (orderInfo) {
            const reportIdElement = orderInfo.querySelector('p:first-child');
            if (reportIdElement) {
                const reportId = reportIdElement.textContent.replace('订单编号：', '').trim();
                if (reportId) {
                    return reportId;
                }
            }
        }
    }

    // 尝试从当前选中的订单卡片中获取
    const selectedOrderCard = document.querySelector('.order-card.selected');
    if (selectedOrderCard) {
        const reportId = selectedOrderCard.getAttribute('data-report-id');
        if (reportId) {
            return reportId;
        }
    }

    // 如果都没有找到，显示提示信息
    utils.ui.showMessage('请先选择一个订单');
    return null;
}

// 初始化留言板
function initMessageBoard() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendMessage');

    // 获取当前用户信息
    $.ajax({
        url: API_URLS.GET_USER_INFO,
        method: 'GET',
        xhrFields: {
            withCredentials: true
        }
    }).done(function(data) {
        if (data.message === 'Success') {
            currentUser = data.username;
        }
    });

    // 发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);

    // 输入框回车发送
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 当切换到留言板时初始化WebSocket
    document.getElementById('dataStatistics').addEventListener('click', function() {
        const reportId = getCurrentReportId();
        if (reportId) {
            initWebSocket(reportId);
        }
    });
}

// 导出模块
export default {
    initMessageBoard,
    initWebSocket,
    sendMessage
};