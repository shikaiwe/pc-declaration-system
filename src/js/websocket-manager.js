/**
 * WebSocket连接管理器
 * 提供连接池、心跳、重连等高级功能
 */

class WebSocketManager {
    /**
     * 构造函数
     * @param {number} maxConnections 最大连接数，默认4
     * @param {number} heartbeatInterval 心跳间隔(ms)，默认30000
     * @param {number} heartbeatTimeout 心跳超时(ms)，默认60000
     */
    constructor(maxConnections = 4, heartbeatInterval = 30000, heartbeatTimeout = 60000) {
        // 配置参数
        this.maxConnections = maxConnections;
        this.heartbeatInterval = heartbeatInterval;
        this.heartbeatTimeout = heartbeatTimeout;
        
        // 连接管理
        this.connections = new Map(); // reportId -> WebSocket连接
        this.connectionPool = new Map(); // 连接池
        this.connectionStates = new Map(); // 连接状态
        
        // 心跳管理
        this.heartbeatTimers = new Map();
        this.lastHeartbeatTimes = new Map();
        
        // 重连管理
        this.reconnectionTimers = new Map();
        this.reconnectionAttempts = new Map();
        
        // 状态监控
        this.statusListeners = new Set();
        
        // 启动心跳超时检查
        this.startHeartbeatCheck();
    }
    
    /**
     * 获取WebSocket连接
     * @param {string} reportId 订单ID
     * @returns {Promise<WebSocket>} WebSocket连接
     */
    async getConnection(reportId) {
        // 如果已有活跃连接，直接返回
        if (this.connections.has(reportId)) {
            const ws = this.connections.get(reportId);
            if (ws.readyState === WebSocket.OPEN) {
                return ws;
            }
            // 连接已关闭，清理并重新创建
            this.cleanupConnection(reportId);
        }
        
        // 从连接池获取或创建新连接
        let ws = this.getFromPool();
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            // 创建新连接
            ws = await this.createNewConnection(reportId);
        } else {
            // 复用连接，更新映射关系
            this.connections.set(reportId, ws);
            this.updateConnectionState(reportId, 'connected');
        }
        
        return ws;
    }
    
    /**
     * 释放连接（返回连接池）
     * @param {string} reportId 订单ID
     */
    releaseConnection(reportId) {
        if (this.connections.has(reportId)) {
            const ws = this.connections.get(reportId);
            
            // 如果连接仍然开放，返回连接池
            if (ws.readyState === WebSocket.OPEN) {
                this.returnToPool(ws);
            }
            
            // 清理连接相关资源
            this.cleanupConnectionResources(reportId);
            this.connections.delete(reportId);
            this.updateConnectionState(reportId, 'released');
        }
    }
    
    /**
     * 创建新的WebSocket连接
     * @param {string} reportId 订单ID
     * @returns {Promise<WebSocket>} 
     */
    async createNewConnection(reportId) {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = `wss://gznfpc.cn/ws/message/?report_id=${reportId}`;
                const ws = new WebSocket(wsUrl);
                
                // 设置连接超时
                const connectionTimeout = setTimeout(() => {
                    if (ws.readyState === WebSocket.CONNECTING) {
                        ws.close();
                        reject(new Error('WebSocket连接超时'));
                    }
                }, 10000);
                
                ws.onopen = () => {
                    clearTimeout(connectionTimeout);
                    this.connections.set(reportId, ws);
                    this.setupConnectionHandlers(ws, reportId);
                    this.startHeartbeat(ws, reportId);
                    this.updateConnectionState(reportId, 'connected');
                    resolve(ws);
                };
                
                ws.onerror = (error) => {
                    clearTimeout(connectionTimeout);
                    this.handleConnectionError(reportId, error);
                    reject(error);
                };
                
                ws.onclose = (event) => {
                    clearTimeout(connectionTimeout);
                    this.handleConnectionClose(reportId, event);
                };
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * 设置连接事件处理器
     */
    setupConnectionHandlers(ws, reportId) {
        const originalOnMessage = ws.onmessage;
        
        ws.onmessage = (event) => {
            // 处理心跳响应
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'pong') {
                    this.lastHeartbeatTimes.set(reportId, Date.now());
                    return;
                }
            } catch (error) {
                // 非JSON消息，继续处理
            }
            
            // 调用原始消息处理器
            if (typeof originalOnMessage === 'function') {
                originalOnMessage.call(ws, event);
            }
        };
        
        // 保存原始处理器以便后续调用
        ws._originalHandlers = {
            onmessage: originalOnMessage
        };
    }
    
    /**
     * 开始心跳检测
     */
    startHeartbeat(ws, reportId) {
        // 清除现有定时器
        this.stopHeartbeat(reportId);
        
        // 记录最后一次心跳时间
        this.lastHeartbeatTimes.set(reportId, Date.now());
        
        // 创建新的心跳定时器
        const timer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    const heartbeatMsg = JSON.stringify({
                        type: 'ping',
                        timestamp: Date.now()
                    });
                    ws.send(heartbeatMsg);
                } catch (error) {
                    console.error('发送心跳失败:', error);
                }
            }
        }, this.heartbeatInterval);
        
        this.heartbeatTimers.set(reportId, timer);
    }
    
    /**
     * 停止心跳检测
     */
    stopHeartbeat(reportId) {
        if (this.heartbeatTimers.has(reportId)) {
            clearInterval(this.heartbeatTimers.get(reportId));
            this.heartbeatTimers.delete(reportId);
        }
        this.lastHeartbeatTimes.delete(reportId);
    }
    
    /**
     * 启动心跳超时检查
     */
    startHeartbeatCheck() {
        setInterval(() => {
            this.checkHeartbeatTimeouts();
        }, 5000); // 每5秒检查一次
    }
    
    /**
     * 检查心跳超时
     */
    checkHeartbeatTimeouts() {
        const now = Date.now();
        for (const [reportId, lastTime] of this.lastHeartbeatTimes.entries()) {
            if (now - lastTime > this.heartbeatTimeout) {
                console.warn(`连接 ${reportId} 心跳超时`);
                this.handleConnectionTimeout(reportId);
            }
        }
    }
    
    /**
     * 处理连接超时
     */
    handleConnectionTimeout(reportId) {
        this.updateConnectionState(reportId, 'timeout');
        this.scheduleReconnection(reportId);
    }
    
    /**
     * 处理连接错误
     */
    handleConnectionError(reportId, error) {
        console.error(`连接 ${reportId} 错误:`, error);
        this.updateConnectionState(reportId, 'error');
        this.scheduleReconnection(reportId);
    }
    
    /**
     * 处理连接关闭
     */
    handleConnectionClose(reportId, event) {
        console.log(`连接 ${reportId} 关闭:`, event.code, event.reason);
        this.cleanupConnectionResources(reportId);
        
        if (event.code !== 1000) { // 非正常关闭
            this.updateConnectionState(reportId, 'disconnected');
            this.scheduleReconnection(reportId);
        } else {
            this.updateConnectionState(reportId, 'closed');
        }
    }
    
    /**
     * 调度重连
     */
    scheduleReconnection(reportId) {
        // 清除现有重连定时器
        this.cancelReconnection(reportId);
        
        const attempt = (this.reconnectionAttempts.get(reportId) || 0) + 1;
        this.reconnectionAttempts.set(reportId, attempt);
        
        if (attempt > 5) {
            console.error(`连接 ${reportId} 重连次数超过限制`);
            this.updateConnectionState(reportId, 'failed');
            return;
        }
        
        // 指数退避算法
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        
        const timer = setTimeout(() => {
            this.attemptReconnection(reportId);
        }, delay);
        
        this.reconnectionTimers.set(reportId, timer);
        this.updateConnectionState(reportId, 'reconnecting');
        
        console.log(`将在 ${delay}ms 后尝试重连连接 ${reportId}，第 ${attempt} 次尝试`);
    }
    
    /**
     * 尝试重连
     */
    async attemptReconnection(reportId) {
        try {
            this.updateConnectionState(reportId, 'connecting');
            await this.getConnection(reportId);
            this.reconnectionAttempts.delete(reportId);
            console.log(`连接 ${reportId} 重连成功`);
        } catch (error) {
            console.error(`连接 ${reportId} 重连失败:`, error);
            this.scheduleReconnection(reportId);
        }
    }
    
    /**
     * 取消重连
     */
    cancelReconnection(reportId) {
        if (this.reconnectionTimers.has(reportId)) {
            clearTimeout(this.reconnectionTimers.get(reportId));
            this.reconnectionTimers.delete(reportId);
        }
    }
    
    /**
     * 从连接池获取连接
     */
    getFromPool() {
        // 简单的LRU策略：获取最早未使用的连接
        if (this.connectionPool.size > 0) {
            const firstEntry = this.connectionPool.entries().next().value;
            if (firstEntry) {
                const [ws, timestamp] = firstEntry;
                this.connectionPool.delete(ws);
                return ws;
            }
        }
        return null;
    }
    
    /**
     * 返回连接到池中
     */
    returnToPool(ws) {
        if (this.connectionPool.size < this.maxConnections) {
            this.connectionPool.set(ws, Date.now());
        } else {
            // 连接池已满，关闭连接
            ws.close();
        }
    }
    
    /**
     * 清理连接资源
     */
    cleanupConnectionResources(reportId) {
        this.stopHeartbeat(reportId);
        this.cancelReconnection(reportId);
        this.reconnectionAttempts.delete(reportId);
    }
    
    /**
     * 清理所有连接
     */
    cleanupAllConnections() {
        for (const [reportId, ws] of this.connections.entries()) {
            this.cleanupConnectionResources(reportId);
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
        this.connections.clear();
        
        for (const [ws, timestamp] of this.connectionPool.entries()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
        this.connectionPool.clear();
        
        // 清理所有定时器
        for (const timer of this.heartbeatTimers.values()) {
            clearInterval(timer);
        }
        this.heartbeatTimers.clear();
        
        for (const timer of this.reconnectionTimers.values()) {
            clearTimeout(timer);
        }
        this.reconnectionTimers.clear();
        
        this.lastHeartbeatTimes.clear();
        this.reconnectionAttempts.clear();
        this.connectionStates.clear();
    }
    
    /**
     * 更新连接状态
     */
    updateConnectionState(reportId, state) {
        this.connectionStates.set(reportId, {
            state,
            timestamp: Date.now(),
            attempt: this.reconnectionAttempts.get(reportId) || 0
        });
        
        // 通知状态监听器
        this.notifyStatusChange(reportId, state);
    }
    
    /**
     * 获取连接状态
     */
    getConnectionStatus(reportId) {
        return this.connectionStates.get(reportId) || { state: 'unknown' };
    }
    
    /**
     * 获取所有连接状态
     */
    getAllConnectionStatus() {
        return Array.from(this.connectionStates.entries()).map(([reportId, status]) => ({
            reportId,
            ...status
        }));
    }
    
    /**
     * 添加状态监听器
     */
    addStatusListener(callback) {
        this.statusListeners.add(callback);
    }
    
    /**
     * 移除状态监听器
     */
    removeStatusListener(callback) {
        this.statusListeners.delete(callback);
    }
    
    /**
     * 通知状态变化
     */
    notifyStatusChange(reportId, state) {
        for (const listener of this.statusListeners) {
            try {
                listener(reportId, state);
            } catch (error) {
                console.error('状态监听器错误:', error);
            }
        }
    }
    
    /**
     * 关闭所有连接
     */
    closeAll() {
        this.cleanupAllConnections();
    }
}

// 导出单例实例
export const webSocketManager = new WebSocketManager();

export default WebSocketManager;