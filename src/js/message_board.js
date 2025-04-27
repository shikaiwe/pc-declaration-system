// API端点配置
const API_URLS = {
    GET_USER_INFO: 'https://8.138.207.95/api/dashboard/get_user_info/',
    GET_HISTORY: 'https://8.138.207.95/api/dashboard/user_get_history_report/',
    GET_WORKER_REPORTS: 'https://8.138.207.95/api/dashboard/worker_get_report_list/',
    GET_REPORT_OF_SAME_DAY: 'https://8.138.207.95/api/dashboard/get_report_of_same_day/',
    GET_MESSAGE_RECORD: 'https://8.138.207.95/api/message_board/get_message_record/'
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

// 消息存储
const messageStorage = {
    // 存储所有订单的消息记录
    messages: new Map(),

    // 添加消息到存储
    addMessage(reportId, message) {
        if (!this.messages.has(reportId)) {
            this.messages.set(reportId, []);
        }
        this.messages.get(reportId).push(message);
    },

    // 获取订单的所有消息
    getMessages(reportId) {
        return this.messages.get(reportId) || [];
    },

    // 清空订单的消息
    clearMessages(reportId) {
        this.messages.delete(reportId);
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
    messageList.innerHTML = '';
    if (currentReportId) {
        messageStorage.clearMessages(currentReportId);
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
            console.log('已存在连接，无需重新建立');
            return;
        } else if (existingWs.readyState === WebSocket.CONNECTING) {
            console.log('连接正在建立中，请稍候');
            return;
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
            console.log(`订单 ${reportId} 的WebSocket连接已建立`);
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message">已连接到聊天室</div>';
            wsConnections.set(reportId, ws);

            // 加载历史消息
            try {
                const historyMessages = await fetchMessageHistory(reportId);
                console.log('准备显示的历史消息:', historyMessages); // 添加调试日志
                
                if (historyMessages && historyMessages.length > 0) {
                    messageList.innerHTML += '<div class="system-message">正在加载历史消息...</div>';
                    // 清空现有消息
                    messageList.innerHTML = '';
                    
                    // 历史消息按从旧到新顺序排列，直接按数组顺序展示
                    historyMessages.forEach(message => {
                        console.log('正在显示消息:', message); // 添加调试日志
                        if (message.username && message.message) {
                            appendMessage(message);
                        }
                    });
                    
                    messageList.innerHTML += '<div class="system-message">历史消息加载完成</div>';
                } else {
                    messageList.innerHTML += '<div class="system-message">暂无历史消息</div>';
                }
            } catch (error) {
                console.error('加载历史消息失败:', error);
                messageList.innerHTML += '<div class="system-message error">加载历史消息失败</div>';
            }
        };

        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                var message = data.message;
                console.log('接收到WebSocket消息:', message);
                
                // 确保时间字段使用原始时间或当前时间
                if (!message.time) {
                    message.time = new Date().toLocaleTimeString();
                }
                appendMessage(message);
            } catch (error) {
                console.error('处理消息失败:', error);
            }
        };

        ws.onclose = function() {
            clearTimeout(connectionTimeout);
            console.log(`订单 ${reportId} 的WebSocket连接已关闭`);
            const messageList = document.getElementById('messageList');
            messageList.innerHTML += '<div class="system-message">连接已断开</div>';
            wsConnections.delete(reportId);
        };

        ws.onerror = function(error) {
            clearTimeout(connectionTimeout);
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
    console.log('appendMessage收到的消息:', message); // 添加调试日志
    
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
        timeDiv.textContent = messageTime || now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        timeDiv.setAttribute('data-time', message.originalTime || now.toISOString());
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
            message: message
        };

        // 发送消息
        ws.send(JSON.stringify(messageObj));

        // // 立即在本地显示消息
        // appendMessage({
        //     username: currentUser,
        //     message: message,
        //     time: new Date().toLocaleTimeString()
        // });
        // console.log({
        //     username: currentUser,
        //     message: message,
        // })

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
            clearMessageList();
            // 先加载历史消息
            try {
                const historyMessages = await fetchMessageHistory(selectedReportId);
                if (historyMessages.length > 0) {
                    const messageList = document.getElementById('messageList');
                    messageList.innerHTML += '<div class="system-message">正在加载历史消息...</div>';
                    
                    // 历史消息按从旧到新顺序排列，直接按数组顺序展示
                    historyMessages.forEach(message => {
                        appendMessage(message);
                    });
                    
                    messageList.innerHTML += '<div class="system-message">历史消息加载完成</div>';
                }
            } catch (error) {
                console.error('加载历史消息失败:', error);
                const messageList = document.getElementById('messageList');
                messageList.innerHTML += '<div class="system-message error">加载历史消息失败</div>';
            }
            // 然后建立WebSocket连接
            initWebSocket(selectedReportId);
            // 定期清理无效连接
            cleanupConnections();
        } else {
            // 如果没有选择订单，清空消息列表并关闭所有连接
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

// 获取历史消息记录
async function fetchMessageHistory(reportId) {
    try {
        console.log(`正在获取订单 ${reportId} 的历史消息...`);
        const response = await $.ajax({
            url: API_URLS.GET_MESSAGE_RECORD,
            method: 'POST',
            data: JSON.stringify({ reportId: reportId }),
            contentType: 'application/json',
            xhrFields: {
                withCredentials: true
            }
        });

        console.log('原始API响应:', JSON.stringify(response, null, 2)); // 更详细的日志

        if (response.message === 'Success') {
            // 检查并处理不同的响应格式
            let messages = [];
            
            if (Array.isArray(response.message_record)) {
                console.log('数组类型的message_record:', JSON.stringify(response.message_record, null, 2));
                messages = response.message_record.map(item => {
                    console.log('处理消息项:', JSON.stringify(item, null, 2));
                    
                    // 默认消息对象
                    let msgObj = {
                        username: item.username,
                        message: '',
                        time: null // 初始化为null
                    };
                    
                    // 处理嵌套的消息结构
                    const processNestedMessage = (data) => {
                        console.log('处理嵌套消息:', typeof data, data);
                        try {
                            // 如果是字符串，尝试解析为对象
                            if (typeof data === 'string') {
                                // 替换单引号为双引号以便 JSON.parse
                                const jsonStr = data.replace(/'/g, '"');
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    console.log('解析JSON字符串成功:', parsed);
                                    return processNestedMessage(parsed);
                                } catch (e) {
                                    console.error('解析JSON字符串失败:', e, data);
                                    return { message: data };
                                }
                            }
                            
                            // 如果已经是对象
                            if (data && typeof data === 'object') {
                                console.log('处理对象类型消息:', data);
                                
                                // 检查是否有message字段且是对象
                                if (data.message && typeof data.message === 'object') {
                                    // 递归处理嵌套的message对象
                                    console.log('发现嵌套message对象:', data.message);
                                    const nestedResult = processNestedMessage(data.message);
                                    const result = {
                                        username: data.username || nestedResult.username,
                                        message: nestedResult.message,
                                        time: data.time || nestedResult.time
                                    };
                                    console.log('处理嵌套message结果:', result);
                                    return result;
                                } else {
                                    // 直接返回对象字段
                                    const result = {
                                        username: data.username || '',
                                        message: data.message || '',
                                        time: data.time || ''
                                    };
                                    console.log('直接使用对象字段:', result);
                                    return result;
                                }
                            }
                            
                            // 默认情况下返回原始数据
                            return { message: String(data) };
                        } catch (error) {
                            console.error('处理嵌套消息失败:', error, data);
                            return { message: '无法解析的消息内容' };
                        }
                    };
                    
                    // 检查是否存在messageg字段（可能是拼写错误）
                    if (item.messageg) {
                        try {
                            console.log('处理messageg字段:', item.messageg);
                            const result = processNestedMessage(item.messageg);
                            console.log('messageg处理结果:', result);
                            
                            msgObj.username = result.username || item.username;
                            msgObj.message = result.message || '无法解析的消息';
                            if (result.time) {
                                msgObj.time = result.time;
                                console.log('从messageg提取到时间:', result.time);
                            }
                        } catch (parseError) {
                            console.error('处理消息时出错:', parseError);
                            msgObj.message = '无法解析的消息内容';
                        }
                    } else if (item.message) {
                        // 正常的message字段
                        try {
                            console.log('处理message字段:', item.message);
                            const result = processNestedMessage(item.message);
                            console.log('message处理结果:', result);
                            
                            msgObj.message = result.message || item.message;
                            if (result.time) {
                                msgObj.time = result.time;
                                console.log('从message提取到时间:', result.time);
                            }
                        } catch (error) {
                            msgObj.message = item.message;
                        }
                    } else {
                        console.warn('消息缺少必要字段:', item);
                        return null;
                    }
                    
                    // 尝试从item直接获取时间
                    if (!msgObj.time && item.time) {
                        msgObj.time = item.time;
                        console.log('从item直接获取时间:', item.time);
                    }
                    
                    // 尝试从item.createTime获取时间
                    if (!msgObj.time && item.createTime) {
                        msgObj.time = item.createTime;
                        console.log('从createTime获取时间:', item.createTime);
                    }
                    
                    // 尝试从item.timestamp获取时间
                    if (!msgObj.time && item.timestamp) {
                        msgObj.time = new Date(item.timestamp).toISOString();
                        console.log('从timestamp获取时间:', item.timestamp);
                    }
                    
                    // 如果没有时间信息，不设置时间（不使用当前时间）
                    if (!msgObj.time) {
                        console.log('未找到时间信息');
                    }
                    
                    // 格式化时间
                    if (msgObj.time) {
                        try {
                            console.log('格式化时间前:', msgObj.time);
                            // 如果是ISO格式时间，保留原始格式但提取可读部分
                            if (msgObj.time.includes('T')) {
                                // 从ISO格式中提取日期和时间部分
                                const date = new Date(msgObj.time);
                                if (!isNaN(date)) {
                                    // 显示完整的日期和时间
                                    msgObj.displayTime = date.toLocaleString('zh-CN', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: false
                                    });
                                    console.log('格式化显示时间:', msgObj.displayTime);
                                    // 保留原始时间用于排序和比较
                                    msgObj.originalTime = msgObj.time;
                                } else {
                                    console.warn('无效的日期格式:', msgObj.time);
                                }
                            } else {
                                // 如果不是ISO格式，直接使用
                                msgObj.displayTime = msgObj.time;
                                msgObj.originalTime = msgObj.time;
                            }
                        } catch (e) {
                            console.warn('时间格式化失败:', e);
                            msgObj.displayTime = msgObj.time;
                        }
                    }
                    
                    console.log('最终处理结果:', msgObj);
                    return msgObj;
                }).filter(msg => msg !== null);
            } else if (response.message_record && response.message_record.record) {
                console.log('包含record字段的message_record:', response.message_record.record);
                messages = response.message_record.record.map(item => {
                    console.log('处理record项:', item);
                    const msg = { ...item };
                    
                    // 格式化时间
                    if (msg.time) {
                        try {
                            console.log('record项原始时间:', msg.time);
                            if (msg.time.includes('T')) {
                                const date = new Date(msg.time);
                                if (!isNaN(date)) {
                                    // 显示完整的日期和时间
                                    msg.displayTime = date.toLocaleString('zh-CN', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: false
                                    });
                                    console.log('record项格式化后显示时间:', msg.displayTime);
                                    // 保留原始时间
                                    msg.originalTime = msg.time;
                                }
                            } else {
                                msg.displayTime = msg.time;
                                msg.originalTime = msg.time;
                            }
                        } catch (e) {
                            console.warn('时间格式化失败:', e);
                            msg.displayTime = msg.time;
                        }
                    }
                    
                    return msg;
                });
            } else {
                console.warn('未知的消息记录格式:', response.message_record);
            }
            
            // 按原始时间排序（较早的消息在前）
            messages.sort((a, b) => {
                if (a.originalTime && b.originalTime) {
                    return new Date(a.originalTime) - new Date(b.originalTime);
                }
                return 0;
            });
            
            console.log('最终处理后的消息数组:', messages);
            return messages;
        } else {
            console.log('没有历史消息记录');
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

// 导出模块
export default {
    initMessageBoard,
    initWebSocket,
    sendMessage,
    fetchOrders,
    fetchMessageHistory,
    isInitialized: false
};