// 添加样式
const style = document.createElement('style');
style.textContent = `
    .modal-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
    }

    .modal-overlay.active {
        display: block;
        opacity: 1;
    }

    .worker-selection {
        position: fixed;
        bottom: -100%;
        left: 0;
        width: 100%;
        background-color: white;
        border-radius: 20px 20px 0 0;
        padding: 20px;
        z-index: 1001;
        transition: transform 0.3s ease;
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    }

    .worker-selection.active {
        transform: translateY(-100%);
    }

    .worker-selection-header {
        text-align: center;
        margin-bottom: 20px;
    }

    .worker-selection-header h3 {
        margin: 0;
        font-size: 18px;
        color: #333;
    }

    .worker-selection-body {
        margin-bottom: 20px;
    }

    .worker-selection-body select {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 16px;
        color: #333;
    }

    .worker-selection-footer {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
    }

    .worker-selection-footer button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        transition: background-color 0.3s ease;
    }

    #cancelAssign {
        background-color: #f5f5f5;
        color: #666;
    }

    #confirmAssign {
        background-color: #2196F3;
        color: white;
    }

    #cancelAssign:hover {
        background-color: #e0e0e0;
    }

    #confirmAssign:hover {
        background-color: #1976D2;
    }

    .assign-order-message {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 1002;
        font-size: 16px;
        text-align: center;
        min-width: 200px;
        max-width: 80%;
        animation: messagePopup 0.3s ease;
    }

    .assign-order-message.error {
        background-color: rgba(244, 67, 54, 0.9);
    }

    .assign-order-message.success {
        background-color: rgba(76, 175, 80, 0.9);
    }

    @keyframes messagePopup {
        from {
            opacity: 0;
            transform: translate(-50%, -60%);
        }
        to {
            opacity: 1;
            transform: translate(-50%, -50%);
        }
    }
`;
document.head.appendChild(style);

// API端点配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
};

// 样式定义
const styles = `
    .assign-order-container {
        padding: 15px;
        max-width: 100%;
        margin: 0 auto;
        background: transparent;
    }
    
    .assign-order-title {
        text-align: center;
        color: #2196F3;
        margin-bottom: 20px;
        font-size: 1.5em;
        font-weight: 600;
    }
    
    .order-list {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }
    
    .order-item {
        background: #fff;
        border-radius: 12px;
        padding: 15px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    
    .order-info {
        flex: 1;
    }
    
    .order-id {
        font-weight: bold;
        color: #2196F3;
        font-size: 1.1em;
        margin-bottom: 8px;
    }
    
    .order-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
        color: #666;
        font-size: 0.9em;
    }
    
    .order-details-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }
    
    .order-details-label {
        color: #999;
        min-width: 60px;
    }
    
    .assign-btn {
        width: 100%;
        padding: 12px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.3s ease;
        margin-top: 8px;
    }
    
    .assign-btn:hover {
        background-color: #1976D2;
    }
    
    .assign-btn:active {
        transform: scale(0.98);
    }
    
    .worker-selection {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: white;
        padding: 20px;
        border-radius: 20px 20px 0 0;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
        transform: translateY(100%);
        transition: transform 0.3s ease-out;
        z-index: 1000;
    }
    
    .worker-selection.active {
        transform: translateY(0);
    }
    
    .worker-selection h2 {
        text-align: center;
        color: #333;
        font-size: 1.2em;
        margin-bottom: 20px;
    }
    
    .worker-selection select {
        width: 100%;
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        font-size: 16px;
        margin-bottom: 20px;
        background-color: #f8f9fa;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        background-size: 16px;
    }
    
    .worker-selection-buttons {
        display: flex;
        gap: 10px;
    }
    
    .worker-selection-buttons button {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .cancel-assign {
        background-color: #f5f5f5;
        color: #666;
    }
    
    .confirm-assign {
        background-color: #2196F3;
        color: white;
    }
    
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 999;
    }
    
    .modal-overlay.active {
        opacity: 1;
        visibility: visible;
    }
    
    .assign-order-message {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1001;
        display: none;
    }
    
    .no-orders {
        text-align: center;
        padding: 40px 20px;
        color: #666;
        background: #fff;
        border-radius: 12px;
        margin: 20px 0;
    }
    
    .pull-indicator {
        width: 40px;
        height: 4px;
        background: #ddd;
        border-radius: 2px;
        margin: 0 auto 15px;
    }
    
    @media (prefers-color-scheme: dark) {
        .order-item {
            background: #333;
        }
        
        .order-id {
            color: #64B5F6;
        }
        
        .order-details {
            color: #ccc;
        }
        
        .order-details-label {
            color: #888;
        }
        
        .worker-selection {
            background: #333;
        }
        
        .worker-selection h2 {
            color: #fff;
        }
        
        .worker-selection select {
            background-color: #444;
            border-color: #555;
            color: #fff;
        }
        
        .cancel-assign {
            background-color: #444;
            color: #fff;
        }
        
        .no-orders {
            background: #333;
            color: #ccc;
        }
        
        .pull-indicator {
            background: #666;
        }
    }
`;

// HTML模板
const template = `
    <div class="assign-order-container">
        <h1 class="assign-order-title">今日待分配订单</h1>
        <div id="assignOrderMessage" class="assign-order-message"></div>
        <div id="orderList" class="order-list">
            <!-- 订单列表将在这里动态生成 -->
        </div>
    </div>
    
    <div class="modal-overlay" id="modalOverlay"></div>
    <div class="worker-selection" id="workerSelection">
        <div class="pull-indicator"></div>
        <h2>选择工作人员</h2>
        <select id="workerName" name="workerName" required>
            <option value="">请选择工作人员</option>
        </select>
        <div class="worker-selection-buttons">
            <button class="cancel-assign" id="cancelAssign">取消</button>
            <button class="confirm-assign" id="confirmAssign">确认分配</button>
        </div>
    </div>
`;

class AssignOrder {
    constructor(container) {
        this.container = container;
        this.currentReportId = null;
        this.startY = 0;
        this.currentY = 0;
        this.modalOverlay = null;
        this.workerSelection = null;
        this.workerSelect = null;
        this.cancelAssign = null;
        this.confirmAssign = null;
        this.messageDiv = null;

        this.init();
    }

    async init() {
        try {
            // 创建必要的 DOM 元素
            this.createElements();
            // 绑定事件处理器到实例
            this.bindMethods();
            // 绑定事件监听器
            this.bindEvents();
            // 加载今日订单
            await this.loadTodayOrders();
        } catch (error) {
            console.error('初始化失败:', error);
            this.showMessage('初始化失败，请刷新页面重试', 'error');
        }
    }

    createElements() {
        try {
            // 创建遮罩层
            this.modalOverlay = document.createElement('div');
            this.modalOverlay.className = 'modal-overlay';
            this.container.appendChild(this.modalOverlay);

            // 创建消息提示div
            this.messageDiv = document.createElement('div');
            this.messageDiv.className = 'assign-order-message';
            this.messageDiv.style.display = 'none';
            this.container.appendChild(this.messageDiv);

            // 创建工作人员选择面板
            this.workerSelection = document.createElement('div');
            this.workerSelection.className = 'worker-selection';
            this.workerSelection.innerHTML = `
                <div class="worker-selection-header">
                    <h3>选择工作人员</h3>
                </div>
                <div class="worker-selection-body">
                    <select id="workerSelect"></select>
                </div>
                <div class="worker-selection-footer">
                    <button id="cancelAssign">取消</button>
                    <button id="confirmAssign">确认</button>
                </div>
            `;
            this.container.appendChild(this.workerSelection);

            // 获取相关元素引用
            this.workerSelect = this.workerSelection.querySelector('#workerSelect');
            this.cancelAssign = this.workerSelection.querySelector('#cancelAssign');
            this.confirmAssign = this.workerSelection.querySelector('#confirmAssign');

            if (!this.workerSelect || !this.cancelAssign || !this.confirmAssign) {
                throw new Error('无法获取必要的DOM元素');
            }
        } catch (error) {
            console.error('创建元素失败:', error);
            throw error;
        }
    }

    bindMethods() {
        // 绑定事件处理器到实例
        this.handleClick = this.handleClick.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleOverlayClick = this.handleOverlayClick.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleConfirm = this.handleConfirm.bind(this);
    }

    async loadTodayOrders() {
        try {
            const response = await $.ajax({
                url: API_URLS.TODAY_ORDERS,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                }
            });

            const orderList = this.container.querySelector('.order-list') || document.createElement('div');
            orderList.className = 'order-list';

            if (response.message === 'Success' && Array.isArray(response.reports)) {
                const todayOrders = response.reports.filter(order =>
                    order.status === '0' || order.status === 0
                );

                if (todayOrders.length === 0) {
                    orderList.innerHTML = '<div class="no-orders">今日没有待分配的订单</div>';
                    return;
                }

                todayOrders.forEach(order => {
                    const orderDiv = document.createElement('div');
                    orderDiv.className = 'order-item';
                    orderDiv.innerHTML = `
                        <div class="order-info">
                            <div class="order-id">订单号: ${order.reportId}</div>
                            <div class="order-details">
                                <div class="order-details-item">
                                    <span class="order-details-label">电话</span>
                                    <span>${order.userPhoneNumber}</span>
                                </div>
                                <div class="order-details-item">
                                    <span class="order-details-label">地址</span>
                                    <span>${order.address}</span>
                                </div>
                                <div class="order-details-item">
                                    <span class="order-details-label">问题</span>
                                    <span>${order.issue}</span>
                                </div>
                                <div class="order-details-item">
                                    <span class="order-details-label">预约时间</span>
                                    <span>${this.formatDate(order.date)}</span>
                                </div>
                            </div>
                            <button class="assign-btn" data-report-id="${order.reportId}">分配订单</button>
                        </div>
                    `;
                    orderList.appendChild(orderDiv);
                });

                if (!this.container.contains(orderList)) {
                    this.container.appendChild(orderList);
                }
            } else {
                this.handleSessionError(response.message);
            }
        } catch (error) {
            console.error('加载订单失败:', error);
            this.showMessage('加载订单失败，请刷新页面重试', 'error');
        }
    }

    async loadTodayWorkers() {
        try {
            const response = await $.ajax({
                url: API_URLS.TODAY_WORKERS,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                }
            });

            if (response.message === 'Success' && Array.isArray(response.workers)) {
                this.workerSelect.innerHTML = '<option value="">请选择志愿者</option>';
                response.workers.forEach(worker => {
                    const option = document.createElement('option');
                    option.value = worker.username;
                    option.textContent = worker.username;
                    this.workerSelect.appendChild(option);
                });
            } else {
                this.handleSessionError(response.message);
            }
        } catch (error) {
            console.error('加载值班人员失败:', error);
            this.showMessage('加载值班人员失败，请刷新页面重试', 'error');
        }
    }

    bindEvents() {
        try {
            // 移除旧的事件监听器
            this.container.removeEventListener('click', this.handleClick);
            this.workerSelection.removeEventListener('touchstart', this.handleTouchStart);
            this.workerSelection.removeEventListener('touchmove', this.handleTouchMove);
            this.workerSelection.removeEventListener('touchend', this.handleTouchEnd);
            this.cancelAssign.removeEventListener('click', this.handleCancel);
            this.confirmAssign.removeEventListener('click', this.handleConfirm);
            this.modalOverlay.removeEventListener('click', this.handleOverlayClick);
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);

            // 添加新的事件监听器
            this.container.addEventListener('click', async(e) => {
                if (e.target.classList.contains('assign-btn')) {
                    // 防止重复点击
                    if (this.currentReportId) {
                        this.hideWorkerSelection();
                        return;
                    }

                    this.currentReportId = e.target.dataset.reportId;
                    // 先加载工作人员列表
                    await this.loadTodayWorkers();
                    // 再显示选择面板
                    this.modalOverlay.classList.add('active');
                    this.workerSelection.classList.add('active');
                }
            });

            this.workerSelection.addEventListener('touchstart', this.handleTouchStart);
            this.workerSelection.addEventListener('touchmove', this.handleTouchMove);
            this.workerSelection.addEventListener('touchend', this.handleTouchEnd);
            this.cancelAssign.addEventListener('click', this.handleCancel);
            this.confirmAssign.addEventListener('click', this.handleConfirm);
            this.modalOverlay.addEventListener('click', this.handleOverlayClick);
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        } catch (error) {
            console.error('绑定事件失败:', error);
            throw error;
        }
    }

    handleTouchStart(e) {
        if (!this.currentReportId) return;
        this.startY = e.touches[0].clientY;
        this.currentY = this.startY;
    }

    handleTouchMove(e) {
        if (!this.currentReportId) return;
        this.currentY = e.touches[0].clientY;
        const deltaY = this.currentY - this.startY;

        if (deltaY > 0) {
            e.preventDefault();
            this.workerSelection.style.transform = `translateY(${deltaY}px)`;
        }
    }

    handleTouchEnd() {
        if (!this.currentReportId) return;
        const deltaY = this.currentY - this.startY;
        if (deltaY > 100) {
            this.hideWorkerSelection();
        } else {
            this.workerSelection.style.transform = '';
        }
    }

    handleCancel() {
        this.hideWorkerSelection();
    }

    handleOverlayClick() {
        this.hideWorkerSelection();
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'visible' && this.container.isConnected) {
            // 如果选择界面打开，先关闭它
            if (this.currentReportId) {
                this.hideWorkerSelection();
            }
            this.loadTodayOrders();
        }
    }

    handleConfirm = async() => {
        const workerName = this.workerSelect.value;

        if (!workerName) {
            this.showMessage('请选择工作人员');
            return;
        }

        try {
            const response = await $.ajax({
                url: API_URLS.ASSIGN_ORDER,
                method: 'POST',
                data: JSON.stringify({
                    reportId: this.currentReportId,
                    workerName
                }),
                contentType: 'application/json',
                xhrFields: {
                    withCredentials: true
                }
            });

            if (response.message === 'Success') {
                this.showMessage('订单分配成功');
                this.hideWorkerSelection();
                await this.loadTodayOrders();
            } else {
                this.handleSessionError(response.message);
            }
        } catch (error) {
            console.error('分配订单失败:', error);
            this.showMessage('分配订单失败，请重试');
        }
    };

    hideWorkerSelection() {
        try {
            if (!this.modalOverlay || !this.workerSelection) return;

            this.modalOverlay.classList.remove('active');
            this.workerSelection.classList.remove('active');
            this.workerSelection.style.transform = '';
            this.currentReportId = null;

            // 清空选择框
            if (this.workerSelect) {
                this.workerSelect.value = '';
            }
        } catch (error) {
            console.error('隐藏选择面板失败:', error);
        }
    }

    // 添加日期格式化方法
    formatDate(dateString) {
        try {
            const date = new Date(dateString.replace(/-/g, '/'));
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${month}月${day}日 ${hours}:${minutes}`;
        } catch (error) {
            console.error('日期格式化错误:', error);
            return dateString;
        }
    }

    destroy() {
        try {
            // 移除所有事件监听器
            this.container.removeEventListener('click', this.handleClick);
            this.workerSelection.removeEventListener('touchstart', this.handleTouchStart);
            this.workerSelection.removeEventListener('touchmove', this.handleTouchMove);
            this.workerSelection.removeEventListener('touchend', this.handleTouchEnd);
            this.cancelAssign.removeEventListener('click', this.handleCancel);
            this.confirmAssign.removeEventListener('click', this.handleConfirm);
            this.modalOverlay.removeEventListener('click', this.handleOverlayClick);
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);

            // 隐藏选择面板
            this.hideWorkerSelection();

            // 移除所有创建的元素
            if (this.modalOverlay && this.modalOverlay.parentNode) {
                this.modalOverlay.parentNode.removeChild(this.modalOverlay);
            }
            if (this.workerSelection && this.workerSelection.parentNode) {
                this.workerSelection.parentNode.removeChild(this.workerSelection);
            }
            if (this.messageDiv && this.messageDiv.parentNode) {
                this.messageDiv.parentNode.removeChild(this.messageDiv);
            }

            // 清除状态
            this.currentReportId = null;
            this.startY = 0;
            this.currentY = 0;
            this.modalOverlay = null;
            this.workerSelection = null;
            this.workerSelect = null;
            this.cancelAssign = null;
            this.confirmAssign = null;
            this.messageDiv = null;
        } catch (error) {
            console.error('销毁实例失败:', error);
        }
    }

    showMessage(text, type = 'info') {
        if (!this.messageDiv) {
            this.messageDiv = document.createElement('div');
            this.messageDiv.className = 'assign-order-message';
            this.container.appendChild(this.messageDiv);
        }

        this.messageDiv.textContent = text;
        this.messageDiv.className = `assign-order-message ${type}`;
        this.messageDiv.style.display = 'block';

        // 自动隐藏消息
        setTimeout(() => {
            if (this.messageDiv) {
                this.messageDiv.style.display = 'none';
            }
        }, 3000);
    }

    handleSessionError(message) {
        let errorMessage;
        switch (message) {
            case 'Session has expired':
                errorMessage = '会话已过期，请重新登录';
                break;
            case 'Invalid session':
                errorMessage = '无效会话，请重新登录';
                break;
            case 'No sessionid cookie':
                errorMessage = '未找到会话信息，请重新登录';
                break;
            default:
                errorMessage = '发生未知错误，请重新登录';
        }
        this.showMessage(errorMessage, 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    }
}

// 导出模块
export default AssignOrder;