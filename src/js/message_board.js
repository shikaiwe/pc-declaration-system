// API端点配置
const API_URLS = {
    GET_USER_INFO: 'https://8.138.207.95/api/dashboard/get_user_info/',
    GET_HISTORY: 'https://8.138.207.95/api/dashboard/user_get_history_report/',
    GET_WORKER_REPORTS: 'https://8.138.207.95/api/dashboard/worker_get_report_list/',
    GET_REPORT_OF_SAME_DAY: 'https://8.138.207.95/api/dashboard/get_report_of_same_day/'
};

// WebSocket配置
const WS_CONFIG = {
    BASE_URL: 'wss://8.138.207.95/ws/message/'
};

// WebSocket连接
let wsConnections = new Map(); // 存储所有WebSocket连接
let currentReportId = null;
let currentUser = null;
let currentUserRole = null; // 存储用户角色
let currentOrders = []; // 存储当前订单列表

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

            // 根据用户角色选择不同的API端点
            let apiUrl;
            switch (currentUserRole) {
                case 'worker':
                    // 维修人员只看到分配给自己的订单
                    apiUrl = API_URLS.GET_WORKER_REPORTS;
                    break;
                case 'admin':
                    // 管理员可以看到当天的所有订单
                    apiUrl = API_URLS.GET_REPORT_OF_SAME_DAY;
                    break;
                case 'customer':
                default:
                    // 普通用户只看到自己的订单
                    apiUrl = API_URLS.GET_HISTORY;
                    break;
            }

            // 获取订单列表
            const response = await $.ajax({
                url: apiUrl,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                }
            });

            if (response.message === 'Success') {
                // 根据不同的API响应格式处理数据
                if (currentUserRole === 'admin') {
                    // 处理管理员API返回的数据格式
                    currentOrders = response.reports.map(report => ({
                        reportId: report.reportId,
                        username: report.userPhoneNumber, // 使用电话号码作为用户名
                        address: report.address,
                        issue: report.issue,
                        status: report.status,
                        date: report.date,
                        call_date: report.call_date,
                        workerName: report.workerName
                    }));
                } else if (currentUserRole === 'customer') {
                    // 处理普通用户API返回的数据格式
                    currentOrders = response.report_info.filter(order => 
                        order.username === currentUser
                    );
                } else {
                    // 处理维修人员API返回的数据格式
                    currentOrders = response.report_info;
                }
                return currentOrders;
            }
            return [];
        } else {
            // 处理用户信息获取失败的情况
            console.error('获取用户信息失败:', userInfo.message);
            if (userInfo.message === 'Session has expired' || 
                userInfo.message === 'Invalid session' || 
                userInfo.message === 'No sessionid cookie') {
                window.location.href = 'login.html';
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
                window.location.href = 'login.html';
            } else {
                alert('会话无效，请重新登录');
                window.location.href = 'login.html';
            }
        } else if (error.status === 400 && error.responseJSON && error.responseJSON.message === 'No sessionid cookie') {
            alert('未找到会话信息，请重新登录');
            window.location.href = 'login.html';
        } else {
            alert('获取订单列表失败，请稍后重试');
        }
        return [];
    }
}

// 更新订单选择器
function updateOrderSelector(orders) {
    const orderSelector = document.getElementById('orderSelector');
    orderSelector.innerHTML = '<option value="">请选择订单</option>';

    if (orders.length === 0) {
        orderSelector.innerHTML = '<option value="">暂无可用订单</option>';
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
    messageList.innerHTML = '';
}

// 初始化WebSocket连接
function initWebSocket(reportId) {
    if (!reportId) {
        console.error('reportId不能为空');
        return;
    }

    // 如果已经存在此订单的连接，直接返回
    if (wsConnections.has(reportId)) {
        const existingWs = wsConnections.get(reportId);
        if (existingWs.readyState === WebSocket.OPEN) {
            console.log('已存在连接，无需重新建立');
            return;
        }
    }

    try {
        currentReportId = reportId;
        const ws = new WebSocket(`${WS_CONFIG.BASE_URL}?report_id=${reportId}`);

        ws.onopen = function() {
            console.log(`订单 ${reportId} 的WebSocket连接已建立`);
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message">已连接到聊天室</div>';
            wsConnections.set(reportId, ws);
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
            console.log(`订单 ${reportId} 的WebSocket连接已关闭`);
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message">连接已断开</div>';
            wsConnections.delete(reportId);
        };

        ws.onerror = function(error) {
            console.error(`订单 ${reportId} 的WebSocket错误:`, error);
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message error">连接发生错误</div>';
            wsConnections.delete(reportId);
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
    
    // 添加时间戳
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    messageList.appendChild(timeDiv);

    // 创建消息项
    const messageItem = document.createElement('div');
    messageItem.className = `message-item ${message.username === currentUser ? 'sent' : 'received'}`;

    // 创建头像容器
    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-container';

    // 如果是接收到的消息，显示用户名
    if (message.username !== currentUser) {
        const username = document.createElement('div');
        username.className = 'message-username';
        username.textContent = message.username;
        avatarContainer.appendChild(username);
    }

    // 创建头像
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = message.username.charAt(0).toUpperCase();
    avatarContainer.appendChild(avatar);

    // 创建消息内容包装器
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    // 创建消息气泡
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // 添加消息内容
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message.message;
    bubble.appendChild(content);
    contentWrapper.appendChild(bubble);

    // 根据消息方向添加组件
    if (message.username === currentUser) {
        messageItem.appendChild(contentWrapper);
        messageItem.appendChild(avatarContainer);
    } else {
        messageItem.appendChild(avatarContainer);
        messageItem.appendChild(contentWrapper);
    }

    messageList.appendChild(messageItem);
    messageList.scrollTop = messageList.scrollHeight;
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
            // 定期清理无效连接
            cleanupConnections();
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
        for (const ws of wsConnections.values()) {
            ws.close();
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