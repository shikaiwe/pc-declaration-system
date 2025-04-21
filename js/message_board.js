// WebSocket连接
let ws = null;
let currentReportId = null;
let currentUser = null;
let currentOrders = []; // 存储当前订单列表

// 获取历史订单
async function fetchOrders() {
    try {
        const response = await $.ajax({
            url: API_URLS.GET_HISTORY,
            method: 'GET',
            xhrFields: {
                withCredentials: true
            }
        });

        if (response.message === 'Success' && response.report_info) {
            currentOrders = response.report_info;
            return currentOrders;
        }
        return [];
    } catch (error) {
        console.error('获取订单列表失败:', error);
        return [];
    }
}

// 更新订单选择器
function updateOrderSelector(orders) {
    const orderSelector = document.getElementById('orderSelector');
    orderSelector.innerHTML = '<option value="">请选择订单</option>';

    orders.forEach(order => {
        const option = document.createElement('option');
        option.value = order.reportId;
        option.textContent = `订单 ${order.reportId} - ${order.issue.substring(0, 20)}${order.issue.length > 20 ? '...' : ''}`;
        orderSelector.appendChild(option);
    });
}

// 清空消息列表
function clearMessageList() {
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = '';
}

// 初始化WebSocket连接
function initWebSocket(reportId) {
    if (!reportId) {
        console.error('reportId不能为空');
        return;
    }

    if (ws) {
        ws.close();
        ws = null;
    }

    try {
        currentReportId = reportId;
        ws = new WebSocket(`wss://8.138.207.95/ws/message/?report_id=${reportId}`);

        ws.onopen = function() {
            console.log('WebSocket连接已建立');
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message">已连接到聊天室</div>';
        };

        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'chat_message') {
                    appendMessage(data.message);
                }
            } catch (error) {
                console.error('处理消息失败:', error);
            }
        };

        ws.onclose = function() {
            console.log('WebSocket连接已关闭');
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message">连接已断开</div>';
            ws = null;
        };

        ws.onerror = function(error) {
            console.error('WebSocket错误:', error);
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message error">连接发生错误</div>';
            ws = null;
        };
    } catch (error) {
        console.error('创建WebSocket连接失败:', error);
        const messageList = document.getElementById('messageList');
        messageList.innerHTML += '<div class="system-message error">创建连接失败</div>';
    }
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
    const orderSelector = document.getElementById('orderSelector');
    const message = messageInput.value.trim();

    // 检查是否选择了订单
    if (!orderSelector.value) {
        alert('请先选择一个订单');
        return;
    }

    // 检查消息是否为空
    if (!message) {
        alert('请输入消息内容');
        return;
    }

    // 检查WebSocket连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('连接已断开，请重新选择订单');
        return;
    }

    try {
        // 构造消息对象
        const messageObj = {
            type: 'chat_message',
            message: message
        };

        // 发送消息
        ws.send(JSON.stringify(messageObj));

        // 立即在本地显示消息
        appendMessage({
            username: currentUser,
            message: message,
            time: new Date().toLocaleTimeString()
        });

        // 清空输入框
        messageInput.value = '';
    } catch (error) {
        console.error('发送消息失败:', error);
        alert('发送消息失败，请重试');
    }
}

// 初始化留言板
async function initMessageBoard() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendMessage');
    const orderSelector = document.getElementById('orderSelector');

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

    // 获取订单列表并更新选择器
    const orders = await fetchOrders();
    updateOrderSelector(orders);

    // 订单选择器变化事件
    orderSelector.addEventListener('change', function() {
        const selectedReportId = this.value;
        if (selectedReportId) {
            clearMessageList();
            initWebSocket(selectedReportId);
        } else {
            if (ws) {
                ws.close();
                ws = null;
            }
            clearMessageList();
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
}

// 导出模块
export default {
    initMessageBoard,
    initWebSocket,
    sendMessage,
    fetchOrders
};