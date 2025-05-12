// API端点配置
const API_URLS = {
    GET_USER_INFO: 'https://gznfpc.cn/api/dashboard/get_user_info/',
    GET_HISTORY: 'https://gznfpc.cn/api/dashboard/user_get_history_report/',
    GET_WORKER_REPORTS: 'https://gznfpc.cn/api/dashboard/worker_get_report_list/',
    GET_REPORT_OF_SAME_DAY: 'https://gznfpc.cn/api/dashboard/get_report_of_same_day/',
    GET_MESSAGE_RECORD: 'https://gznfpc.cn/api/message_board/get_message_record/'
};

// WebSocket配置
const WS_CONFIG = {
    BASE_URL: 'wss://gznfpc.cn/ws/message/'
};

// WebSocket连接
let wsConnections = new Map(); // 存储所有WebSocket连接
let currentReportId = null;
let currentUser = null;
let currentUserRole = null; // 存储用户角色
let currentOrders = []; // 存储当前订单列表

// 消息存储
const messageStorage = {
    // 存储所有订单的消息记录
    messages: new Map(),

    // 添加消息到存储
    addMessage(reportId, message) {
        if (!this.messages.has(reportId)) {
            this.messages.set(reportId, new Map());
        }
        // 使用消息内容和时间创建唯一标识
        const messageId = `${message.message}-${message.time}`;
        if (!this.messages.get(reportId).has(messageId)) {
            this.messages.get(reportId).set(messageId, message);
        }
    },

    // 获取订单的所有消息
    getMessages(reportId) {
        if (!this.messages.has(reportId)) {
            return [];
        }
        return Array.from(this.messages.get(reportId).values());
    },

    // 清空订单的消息
    clearMessages(reportId) {
        if (this.messages.has(reportId)) {
            this.messages.get(reportId).clear();
        }
    },

    // 获取所有订单的消息
    getAllMessages() {
        return this.messages;
    },

    // 检查订单是否有消息
    hasMessages(reportId) {
        return this.messages.has(reportId) && this.messages.get(reportId).size > 0;
    }
};

// 获取历史订单
async function fetchOrders() {
    try {
        // 首先获取用户身份信息
        const userInfo = await $.ajax({
            url: API_URLS.GET_USER_INFO,
            method: 'GET',
            xhrFields: {
                withCredentials: true
            }
        });

        if (userInfo.message === 'Success') {
            currentUser = userInfo.username;
            currentUserRole = userInfo.label;

            // 根据用户角色获取订单
            let orders = [];

            if (currentUserRole === 'admin') {
                // 管理员可以看到当天的所有订单
                const response = await $.ajax({
                    url: API_URLS.GET_REPORT_OF_SAME_DAY,
                    method: 'GET',
                    xhrFields: {
                        withCredentials: true
                    }
                });

                if (response.message === 'Success') {
                    orders = response.reports.map(report => ({
                        reportId: report.reportId,
                        username: report.userPhoneNumber,
                        address: report.address,
                        issue: report.issue,
                        status: report.status,
                        date: report.date,
                        call_date: report.call_date,
                        workerName: report.workerName
                    }));
                }
            } else if (currentUserRole === 'worker') {
                // 工作人员可以看到自己报的单和被分配的单
                try {
                    // 获取被分配的订单
                    const workerResponse = await $.ajax({
                        url: API_URLS.GET_WORKER_REPORTS,
                        method: 'GET',
                        xhrFields: {
                            withCredentials: true
                        }
                    });

                    if (workerResponse.message === 'Success') {
                        orders = orders.concat(workerResponse.report_info);
                    }

                    // 获取自己报的订单
                    const userResponse = await $.ajax({
                        url: API_URLS.GET_HISTORY,
                        method: 'GET',
                        xhrFields: {
                            withCredentials: true
                        }
                    });

                    if (userResponse.message === 'Success') {
                        orders = orders.concat(userResponse.report_info);
                    }

                    // 去重（可能有重复的订单）
                    orders = Array.from(new Map(orders.map(order => [order.reportId, order])).values());
                } catch (error) {
                    console.error('获取工作人员订单失败:', error);
                }
            } else {
                // 普通用户只看到自己的订单
                const response = await $.ajax({
                    url: API_URLS.GET_HISTORY,
                    method: 'GET',
                    xhrFields: {
                        withCredentials: true
                    }
                });

                if (response.message === 'Success') {
                    orders = response.report_info;
                }
            }

            currentOrders = orders;
            return orders;
        } else {
            // 处理用户信息获取失败的情况
            console.error('获取用户信息失败:', userInfo.message);
            if (userInfo.message === 'Session has expired' ||
                userInfo.message === 'Invalid session' ||
                userInfo.message === 'No sessionid cookie') {
                window.location.href = '../html/login.html';
            }
            return [];
        }
    } catch (error) {
        console.error('获取订单列表失败:', error);
        // 处理API错误响应
        if (error.status === 403) {
            alert('权限错误：您没有访问此资源的权限');
        } else if (error.status === 401) {
            if (error.responseJSON && error.responseJSON.message === 'Session has expired') {
                window.location.href = '../html/login.html';
            } else {
                alert('会话无效，请重新登录');
                window.location.href = '../html/login.html';
            }
        } else if (error.status === 400 && error.responseJSON && error.responseJSON.message === 'No sessionid cookie') {
            alert('未找到会话信息，请重新登录');
            window.location.href = '../html/login.html';
        } else {
            alert('获取订单列表失败，请稍后重试');
        }
        return [];
    }
}

// 更新订单选择器
function updateOrderSelector(orders) {
    const orderSelector = document.getElementById('orderSelector');
    orderSelector.innerHTML = ''; // 清空选择器

    // 添加默认选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '请选择订单';
    orderSelector.appendChild(defaultOption);

    if (orders.length === 0) {
        return;
    }

    // 根据用户角色显示不同的订单标题
    orders.forEach(order => {
        const option = document.createElement('option');
        option.value = order.reportId;

        let orderTitle = '';
        switch (currentUserRole) {
            case 'admin':
                // 管理员看到用户名和问题
                orderTitle = `订单 ${order.reportId} - ${order.username} - ${order.issue.substring(0, 20)}`;
                break;
            case 'worker':
                // 维修人员看到订单号和问题
                orderTitle = `订单 ${order.reportId} - ${order.issue.substring(0, 20)}`;
                break;
            case 'customer':
            default:
                // 普通用户看到订单号和问题
                orderTitle = `订单 ${order.reportId} - ${order.issue.substring(0, 20)}`;
                break;
        }

        option.textContent = orderTitle + (order.issue.length > 20 ? '...' : '');
        orderSelector.appendChild(option);
    });
}

// 清空消息列表
function clearMessageList() {
    const messageList = document.getElementById('messageList');
    if (messageList) {
        messageList.innerHTML = '';
    }
}

// 显示订单消息
function displayOrderMessages(reportId) {
    const messageList = document.getElementById('messageList');
    clearMessageList(); // 清空显示

    // 如果没有选择订单，直接返回
    if (!reportId) {
        return;
    }

    const messages = messageStorage.getMessages(reportId);
    if (messages && messages.length > 0) {
        // 按时间排序
        const sortedMessages = [...messages].sort((a, b) => {
            return new Date(a.time) - new Date(b.time);
        });

        // 直接遍历显示消息，不在这里添加时间戳
        sortedMessages.forEach(message => {
            appendMessage(message);
        });
    }
}

// 获取历史消息记录
async function fetchMessageHistory(reportId) {
    try {
        const response = await $.ajax({
            url: API_URLS.GET_MESSAGE_RECORD,
            method: 'POST',
            data: JSON.stringify({ reportId: reportId }),
            contentType: 'application/json',
            xhrFields: {
                withCredentials: true
            }
        });

        if (response.message === 'Success') {
            let messages = [];

            if (Array.isArray(response.message_record)) {
                messages = response.message_record.map(item => ({
                    username: item.username,
                    message: item.message,
                    time: item.date,
                    displayTime: item.date
                }));
            }

            // 按时间排序
            messages.sort((a, b) => {
                if (a.time && b.time) {
                    return new Date(a.time) - new Date(b.time);
                }
                return 0;
            });

            // 将历史消息添加到存储中
            messages.forEach(message => {
                messageStorage.addMessage(reportId, message);
            });

            return messages;
        } else {
            return [];
        }
    } catch (error) {
        console.error('获取历史消息记录失败:', error);
        if (error.status === 401) {
            if (error.responseJSON && error.responseJSON.message === 'Session has expired') {
                window.location.href = '../html/login.html';
            } else {
                alert('会话无效，请重新登录');
                window.location.href = '../html/login.html';
            }
        } else if (error.status === 400 && error.responseJSON && error.responseJSON.message === 'No sessionid cookie') {
            alert('未找到会话信息，请重新登录');
            window.location.href = '../html/login.html';
        } else {
            alert('获取历史消息记录失败，请稍后重试');
        }
        return [];
    }
}

// 初始化WebSocket连接
async function initWebSocket(reportId) {
    if (!reportId) {
        console.error('reportId不能为空');
        return;
    }

    // 如果已经存在此订单的连接，检查状态
    if (wsConnections.has(reportId)) {
        const existingWs = wsConnections.get(reportId);
        if (existingWs.readyState === WebSocket.OPEN) {
            return existingWs;
        } else if (existingWs.readyState === WebSocket.CONNECTING) {
            return existingWs;
        } else {
            // 如果连接已关闭或正在关闭，则删除旧连接
            wsConnections.delete(reportId);
        }
    }

    try {
        currentReportId = reportId;
        const ws = new WebSocket(`${WS_CONFIG.BASE_URL}?report_id=${reportId}`);

        // 设置连接超时
        const connectionTimeout = setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                console.error('WebSocket连接超时');
                ws.close();
                const messageList = document.getElementById('messageList');
                messageList.innerHTML += '<div class="system-message error">连接超时，请重试</div>';
            }
        }, 10000); // 10秒超时

        ws.onopen = async function() {
            clearTimeout(connectionTimeout);
            wsConnections.set(reportId, ws);
        };

        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                var message = data.message;

                // 确保时间字段使用原始时间或当前时间
                if (!message.time) {
                    message.time = new Date().toISOString();
                }

                // 添加到存储并显示
                messageStorage.addMessage(reportId, message);
                displayOrderMessages(reportId);
            } catch (error) {
                console.error('处理消息失败:', error);
            }
        };

        ws.onclose = function() {
            clearTimeout(connectionTimeout);
            wsConnections.delete(reportId);
        };

        ws.onerror = function(error) {
            clearTimeout(connectionTimeout);
            console.error(`订单 ${reportId} 的WebSocket错误:`, error);
            wsConnections.delete(reportId);
        };

        return ws;
    } catch (error) {
        console.error('创建WebSocket连接失败:', error);
        const messageList = document.getElementById('messageList');
        messageList.innerHTML += '<div class="system-message error">创建连接失败</div>';
    }
}

// 添加消息到聊天界面
function appendMessage(message) {
    if (!message || !message.username || !message.message) {
        console.error('消息格式不正确:', message);
        return;
    }

    const messageList = document.getElementById('messageList');
    const now = new Date();

    // 使用displayTime或time显示时间
    const messageTime = message.displayTime || message.time || '';

    // 检查是否需要添加新的时间戳
    const lastTimeDiv = messageList.querySelector('.message-time:last-of-type');
    const lastMessageTime = lastTimeDiv ? lastTimeDiv.getAttribute('data-time') : null;

    if (!lastMessageTime || now - new Date(lastMessageTime) > 5 * 60 * 1000) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';

        // 格式化时间为小时:分钟
        let formattedTime = '';
        if (messageTime) {
            const date = new Date(messageTime);
            if (!isNaN(date.getTime())) {
                formattedTime = date.toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            }
        }

        timeDiv.textContent = formattedTime || now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        // 保存完整的时间戳到data-time属性
        timeDiv.setAttribute('data-time', message.originalTime || message.time || now.toISOString());
        messageList.appendChild(timeDiv);
    }

    // 创建消息项
    const messageItem = document.createElement('div');
    const isSentMessage = message.username === currentUser;
    messageItem.className = `message-item ${isSentMessage ? 'sent' : 'received'}`;

    // 如果是接收到的消息，检查是否需要显示用户名
    if (!isSentMessage) {
        const lastMessage = messageList.querySelector('.message-item:last-of-type');
        const lastMessageUsername = lastMessage && lastMessage.querySelector('.message-username');
        const lastMessageTime = lastTimeDiv && lastTimeDiv.getAttribute('data-time');

        const shouldShowUsername = !lastMessage ||
            (lastMessageUsername && lastMessageUsername.textContent !== message.username) ||
            (now - new Date(lastMessageTime || 0) > 5 * 60 * 1000);

        if (shouldShowUsername) {
            const username = document.createElement('div');
            username.className = 'message-username';
            username.textContent = message.username;
            messageItem.appendChild(username);
        }
    }

    // 创建头像
    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    // 生成固定的头像背景色（基于用户名）
    const colors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#f56a00', '#7265e6', '#ffbf00'];
    const colorIndex = Math.abs(message.username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
    avatar.style.backgroundColor = colors[colorIndex];

    // 设置头像文本（用户名首字母）
    avatar.textContent = message.username.charAt(0).toUpperCase();

    // 创建消息气泡
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message.message;

    // 添加头像和气泡到消息项
    messageItem.appendChild(avatar);
    messageItem.appendChild(bubble);

    messageList.appendChild(messageItem);

    // 平滑滚动到底部
    messageList.scrollTo({
        top: messageList.scrollHeight,
        behavior: 'smooth'
    });
}

// 发送消息
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const orderSelector = document.getElementById('orderSelector');
    const message = messageInput.value.trim();
    const selectedReportId = orderSelector.value;

    // 检查是否选择了订单
    if (!selectedReportId) {
        alert('请先选择一个订单');
        return;
    }

    // 检查消息是否为空
    if (!message) {
        alert('请输入消息内容');
        return;
    }

    // 获取当前选中订单的WebSocket连接
    const ws = wsConnections.get(selectedReportId);

    // 检查WebSocket连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('连接已断开，正在重新连接...');
        initWebSocket(selectedReportId);
        return;
    }

    try {
        // 构造消息对象
        const messageObj = {
            type: 'chat_message',
            message: message,
            time: new Date().toISOString(), // 保存完整的时间戳
            originalTime: new Date().toISOString() // 保存原始时间戳
        };

        // 发送消息
        ws.send(JSON.stringify(messageObj));

        // 清空输入框
        messageInput.value = '';
    } catch (error) {
        console.error('发送消息失败:', error);
        alert('发送消息失败，请重试');
    }
}

// 清理无效的WebSocket连接
function cleanupConnections() {
    for (const [reportId, ws] of wsConnections.entries()) {
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            wsConnections.delete(reportId);
        }
    }
}

// 初始化留言板
async function initMessageBoard() {
    // 如果已经初始化过，则直接返回
    if (this.isInitialized) {
        return;
    }

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
    orderSelector.addEventListener('change', async function() {
        const selectedReportId = this.value;
        if (selectedReportId) {
            // 先清空消息列表
            clearMessageList();

            // 如果该订单没有历史消息，则获取
            if (!messageStorage.hasMessages(selectedReportId)) {
                try {
                    const messages = await fetchMessageHistory(selectedReportId);
                    // 显示消息
                    displayOrderMessages(selectedReportId);
                } catch (error) {
                    console.error('加载历史消息失败:', error);
                    const messageList = document.getElementById('messageList');
                    messageList.innerHTML = '<div class="system-message error">加载历史消息失败</div>';
                }
            } else {
                // 如果已有消息，直接显示
                displayOrderMessages(selectedReportId);
            }

            // 建立WebSocket连接
            initWebSocket(selectedReportId);
            // 定期清理无效连接
            cleanupConnections();
        } else {
            // 如果没有选择订单，清空显示
            clearMessageList();
            closeAllConnections();
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

    // 页面关闭时清理所有连接
    window.addEventListener('beforeunload', function() {
        closeAllConnections();
    });

    // 标记为已初始化
    this.isInitialized = true;
}

// 关闭所有WebSocket连接
function closeAllConnections() {
    for (const [reportId, ws] of wsConnections.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        wsConnections.delete(reportId);
    }
    currentReportId = null;
}

// 导出模块
export default {
    initMessageBoard,
    initWebSocket,
    sendMessage,
    fetchOrders,
    fetchMessageHistory,
    isInitialized: false
};