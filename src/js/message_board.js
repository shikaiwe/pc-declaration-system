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

// 消息状态常量
const MESSAGE_STATUS = {
    SENDING: 'sending', // 发送中
    SENT: 'sent', // 已发送到服务器
    DELIVERED: 'delivered', // 已送达（服务器确认）
    FAILED: 'failed' // 发送失败
};

// 消息管理器
const messageManager = {
    // 生成唯一消息ID
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // 创建新消息对象
    createMessage(content, sender, reportId) {
        const now = new Date();
        return {
            id: this.generateMessageId(),
            message: content,
            username: sender,
            time: now.toISOString(),
            originalTime: now.toISOString(),
            displayTime: now.toISOString(),
            status: MESSAGE_STATUS.SENDING,
            reportId: reportId,
            isSending: true
        };
    },

    // 更新消息状态
    updateMessageStatus(messageId, reportId, status) {
        if (!messageStorage.messages.has(reportId)) return null;

        // 获取消息集合
        const messagesMap = messageStorage.messages.get(reportId);

        // 查找指定ID的消息
        for (const [key, msg] of messagesMap.entries()) {
            if (msg.id === messageId) {
                // 更新状态
                msg.status = status;
                msg.isSending = false;
                messagesMap.set(key, msg);

                // 更新UI中的消息状态
                this.updateMessageUI(messageId, status);
                return msg;
            }
        }
        return null;
    },

    // 更新消息UI
    updateMessageUI(messageId, status) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;

        // 移除所有状态类
        messageElement.classList.remove('sending', 'sent', 'delivered', 'failed');
        messageElement.classList.add(status);

        // 移除旧的状态图标
        const oldStatusIcon = messageElement.querySelector('.message-status-icon');
        if (oldStatusIcon) oldStatusIcon.remove();

        // 只对自己发送的消息处理
        if (!messageElement.classList.contains('sent')) return;

        // 重新创建状态图标（只在发送中和失败时显示）
        let showStatus = (status === MESSAGE_STATUS.SENDING || status === MESSAGE_STATUS.FAILED);
        if (showStatus) {
            let statusIconDiv = document.createElement('div');
            statusIconDiv.className = 'message-status-icon';
            if (status === MESSAGE_STATUS.SENDING) {
                const icon = document.createElement('span');
                icon.className = 'icon-sending';
                statusIconDiv.appendChild(icon);
            } else if (status === MESSAGE_STATUS.FAILED) {
                const icon = document.createElement('span');
                icon.className = 'icon-failed';
                icon.innerHTML = '&#9888;';
                statusIconDiv.appendChild(icon);
                // 重试按钮
                const retryBtn = document.createElement('button');
                retryBtn.className = 'retry-button-icon';
                retryBtn.title = '重试';
                retryBtn.innerHTML = '&#8635;';
                retryBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var msgObj = messageStorage.findMessageById(messageId);
                    messageManager.retryMessage(messageId, msgObj ? msgObj.reportId : undefined);
                };
                statusIconDiv.appendChild(retryBtn);
            }
            // 插入到头像前
            const children = messageElement.children;
            if (children.length >= 2) {
                messageElement.insertBefore(statusIconDiv, children[children.length - 1]);
            } else {
                messageElement.appendChild(statusIconDiv);
            }
        }
    },

    // 重试发送失败的消息
    retryMessage(messageId, reportId) {
        if (!messageStorage.messages.has(reportId)) return false;

        // 获取消息集合
        const messagesMap = messageStorage.messages.get(reportId);

        // 查找指定ID的消息
        for (const [key, msg] of messagesMap.entries()) {
            if (msg.id === messageId && msg.status === MESSAGE_STATUS.FAILED) {
                // 更新状态为发送中
                msg.status = MESSAGE_STATUS.SENDING;
                msg.isSending = true;
                messagesMap.set(key, msg);

                // 更新UI
                this.updateMessageUI(messageId, MESSAGE_STATUS.SENDING);

                // 重新发送消息
                const ws = wsConnections.get(reportId);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    const messageObj = {
                        type: 'chat_message',
                        message: msg.message,
                        time: msg.time,
                        messageId: msg.id
                    };

                    try {
                        ws.send(JSON.stringify(messageObj));
                        return true;
                    } catch (error) {
                        console.error('重试发送消息失败:', error);
                        this.updateMessageStatus(messageId, reportId, MESSAGE_STATUS.FAILED);
                        return false;
                    }
                } else {
                    console.error('WebSocket连接不可用');
                    this.updateMessageStatus(messageId, reportId, MESSAGE_STATUS.FAILED);
                    return false;
                }
            }
        }
        return false;
    }
};

// 消息存储
const messageStorage = {
    // 存储所有订单的消息记录
    messages: new Map(),

    // 消息缓存 - 用于快速查找
    messageCache: new Map(),

    // 添加消息到存储
    addMessage(reportId, message) {
        if (!this.messages.has(reportId)) {
            this.messages.set(reportId, new Map());
        }

        // 确保消息有ID
        if (!message.id) {
            message.id = messageManager.generateMessageId();
        }

        // 使用唯一ID作为键
        const messageKey = message.id || `${message.message}-${message.time}`;
        this.messages.get(reportId).set(messageKey, message);

        // 更新缓存
        this.messageCache.set(message.id, {
            reportId: reportId,
            key: messageKey
        });

        return message;
    },

    // 获取订单的所有消息
    getMessages(reportId) {
        if (!this.messages.has(reportId)) {
            return [];
        }
        return Array.from(this.messages.get(reportId).values());
    },

    // 通过ID查找消息
    findMessageById(messageId) {
        const cacheInfo = this.messageCache.get(messageId);
        if (!cacheInfo) return null;

        const { reportId, key } = cacheInfo;
        if (!this.messages.has(reportId)) return null;

        return this.messages.get(reportId).get(key) || null;
    },

    // 更新消息
    updateMessage(messageId, updatedProps) {
        const cacheInfo = this.messageCache.get(messageId);
        if (!cacheInfo) return false;

        const { reportId, key } = cacheInfo;
        if (!this.messages.has(reportId)) return false;

        const message = this.messages.get(reportId).get(key);
        if (!message) return false;

        // 更新属性
        Object.assign(message, updatedProps);
        this.messages.get(reportId).set(key, message);
        return true;
    },

    // 清空订单的消息
    clearMessages(reportId) {
        if (this.messages.has(reportId)) {
            // 清除缓存
            for (const message of this.messages.get(reportId).values()) {
                if (message.id) {
                    this.messageCache.delete(message.id);
                }
            }
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

        // 直接遍历显示消息
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
                    displayTime: item.date,
                    originalTime: item.date // 保存原始时间戳用于排序和比较
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
                const currentTime = new Date().toISOString();
                if (!message.time) {
                    message.time = currentTime;
                }
                message.originalTime = message.time; // 保存原始时间用于排序和比较
                message.displayTime = message.time; // 保存用于显示的时间

                // 处理服务器确认消息
                if (data.type === 'ack' && data.messageId) {
                    // 更新消息状态为已送达
                    messageManager.updateMessageStatus(data.messageId, reportId, MESSAGE_STATUS.DELIVERED);
                    return;
                }

                // 设置消息的报告ID，用于后续查找
                message.reportId = reportId;

                // 添加到存储
                messageStorage.addMessage(reportId, message);

                // 检查是否是自己发送的消息，如果是则更新状态而不重复显示
                if (message.username === currentUser) {
                    // 查找本地是否已有此消息（通过ID或内容时间匹配）
                    if (message.id) {
                        messageManager.updateMessageStatus(message.id, reportId, MESSAGE_STATUS.DELIVERED);
                    }
                } else {
                    // 显示他人发送的新消息
                    appendMessage(message);
                }
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

    // 格式化消息时间的函数
    function formatMessageTime(time) {
        if (!time) return '';

        const msgDate = new Date(time);
        if (isNaN(msgDate.getTime())) return '';

        const currentDate = new Date();

        // 计算日期差异
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();
        const currentDay = currentDate.getDate();

        const msgYear = msgDate.getFullYear();
        const msgMonth = msgDate.getMonth();
        const msgDay = msgDate.getDate();

        // 计算相差的天数
        const dayDiff = Math.floor((currentDate - msgDate) / (24 * 60 * 60 * 1000));

        // 显示时间部分的格式
        const timeFormat = msgDate.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // 根据天数差异返回不同的格式
        if (currentYear === msgYear && currentMonth === msgMonth && currentDay === msgDay) {
            // 当天消息
            return timeFormat;
        } else if (dayDiff === 1) {
            // 昨天消息
            return `昨天 ${timeFormat}`;
        } else if (dayDiff > 1 && dayDiff < 7) {
            // 一周内消息
            const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            return `${weekdays[msgDate.getDay()]} ${timeFormat}`;
        } else if (currentYear === msgYear) {
            // 今年内消息
            return `${msgDate.getMonth() + 1}月${msgDate.getDate()}日 ${timeFormat}`;
        } else {
            // 往年消息
            return `${msgYear}年${msgDate.getMonth() + 1}月${msgDate.getDate()}日 ${timeFormat}`;
        }
    }

    // 每5分钟显示一次时间戳，或者是新的一天
    if (!lastMessageTime || now - new Date(lastMessageTime) > 5 * 60 * 1000) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';

        // 格式化为适合显示的时间格式
        const formattedTime = formatMessageTime(messageTime);
        timeDiv.textContent = formattedTime;

        // 保存完整的时间戳到data-time属性
        timeDiv.setAttribute('data-time', message.originalTime || message.time || now.toISOString());
        messageList.appendChild(timeDiv);
    }

    // 创建消息项
    const messageItem = document.createElement('div');
    const isSentMessage = message.username === currentUser;
    messageItem.className = `message-item ${isSentMessage ? 'sent' : 'received'}`;

    // 设置消息ID，用于状态更新
    if (message.id) {
        messageItem.id = message.id;
    }

    // 如果消息有状态，添加对应的样式类
    if (message.status) {
        messageItem.classList.add(message.status);
    }

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
    avatar.textContent = message.username.charAt(0).toUpperCase();

    // 创建消息气泡
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message.message;

    // 组装消息项
    if (isSentMessage) {
        // 顺序：头像 → 气泡 → 状态图标，整体靠右
        messageItem.appendChild(avatar);
        messageItem.appendChild(bubble);
    } else {
        // 左侧：头像 → 气泡（目前接收消息不显示状态图标）
        messageItem.appendChild(avatar);
        messageItem.appendChild(bubble);
    }

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
    const messageContent = messageInput.value.trim();
    const selectedReportId = orderSelector.value;

    // 检查是否选择了订单
    if (!selectedReportId) {
        alert('请先选择一个订单');
        return;
    }

    // 检查消息是否为空
    if (!messageContent) {
        alert('请输入消息内容');
        return;
    }

    // 提前清空输入框，防止重复发送
    messageInput.value = '';

    // 获取当前选中订单的WebSocket连接
    const ws = wsConnections.get(selectedReportId);

    // 检查WebSocket连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        // 创建消息对象（失败状态）
        const failedMessage = messageManager.createMessage(messageContent, currentUser, selectedReportId);
        failedMessage.status = MESSAGE_STATUS.FAILED;
        failedMessage.isSending = false;

        // 存储并显示失败的消息
        messageStorage.addMessage(selectedReportId, failedMessage);
        appendMessage(failedMessage);

        // 尝试重新连接
        alert('连接已断开，正在重新连接...');
        const newWs = initWebSocket(selectedReportId);

        return;
    }

    try {
        // 创建消息对象（发送中状态）
        const newMessage = messageManager.createMessage(messageContent, currentUser, selectedReportId);

        // 存储并显示消息
        messageStorage.addMessage(selectedReportId, newMessage);
        appendMessage(newMessage);

        // 构造要发送的消息对象
        const messageObj = {
            type: 'chat_message',
            message: messageContent,
            time: newMessage.time,
            messageId: newMessage.id
        };

        // 设置发送超时
        const sendTimeout = setTimeout(() => {
            // 检查消息是否仍在发送中
            const message = messageStorage.findMessageById(newMessage.id);
            if (message && message.status === MESSAGE_STATUS.SENDING) {
                // 更新为发送失败状态
                messageManager.updateMessageStatus(newMessage.id, selectedReportId, MESSAGE_STATUS.FAILED);
            }
        }, 10000); // 10秒超时

        // 发送消息
        ws.send(JSON.stringify(messageObj));

        // 发送成功后更新状态为"已发送"
        setTimeout(() => {
            clearTimeout(sendTimeout);
            messageManager.updateMessageStatus(newMessage.id, selectedReportId, MESSAGE_STATUS.SENT);
        }, 500);

    } catch (error) {
        console.error('发送消息失败:', error);

        // 查找消息并标记为失败
        const message = messageStorage.findMessageById(newMessage.id);
        if (message) {
            messageManager.updateMessageStatus(newMessage.id, selectedReportId, MESSAGE_STATUS.FAILED);
        }

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
        console.log('留言板已初始化，跳过重复初始化');
        return;
    }

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendMessage');
    const orderSelector = document.getElementById('orderSelector');

    // 清除可能存在的旧事件监听器
    sendButton.removeEventListener('click', sendMessage);
    messageInput.removeEventListener('keypress', handleKeyPress);

    // 获取当前用户信息
    try {
        const userInfo = await $.ajax({
            url: API_URLS.GET_USER_INFO,
            method: 'GET',
            xhrFields: {
                withCredentials: true
            }
        });

        if (userInfo.message === 'Success') {
            currentUser = userInfo.username;
            console.log('当前用户:', currentUser);
        } else {
            console.error('获取用户信息失败:', userInfo.message);
            if (userInfo.message === 'Session has expired' ||
                userInfo.message === 'Invalid session' ||
                userInfo.message === 'No sessionid cookie') {
                window.location.href = '../html/login.html';
                return;
            }
        }
    } catch (error) {
        console.error('获取用户信息请求失败:', error);
        return;
    }

    // 获取订单列表并更新选择器
    const orders = await fetchOrders();
    updateOrderSelector(orders);

    // 订单选择器变化事件
    orderSelector.removeEventListener('change', handleOrderChange);
    orderSelector.addEventListener('change', handleOrderChange);

    // 发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);

    // 输入框回车发送
    function handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }
    messageInput.addEventListener('keypress', handleKeyPress);

    // 页面关闭时清理所有连接
    window.removeEventListener('beforeunload', closeAllConnections);
    window.addEventListener('beforeunload', closeAllConnections);

    // 标记为已初始化
    this.isInitialized = true;
    console.log('留言板初始化完成');
}

// 处理订单选择器变化
async function handleOrderChange() {
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