// API端点配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
};

class AssignOrder {
    constructor(container) {
        if (!container) {
            throw new Error('Container element is required');
        }
        this.container = container;
        this.selectedOrderId = null;
        this.workers = [];
        this.touchStartY = 0;
        this.init();
    }

    async init() {
        try {
            this.createElements();
            this.bindMethods();
            this.bindEvents();
            await this.loadTodayOrders();
            await this.loadTodayWorkers();
        } catch (error) {
            console.error('初始化失败:', error);
            this.showMessage('初始化失败，请刷新页面重试', 'error');
        }
    }

    createElements() {
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
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
                display: none;
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

        // 创建主容器
        this.container.innerHTML = `
            <div class="assign-order-container">
                <h2 class="assign-order-title">分配订单</h2>
                <div class="order-list"></div>
            </div>
            <div class="modal-overlay">
                <div class="worker-selection">
                    <div class="worker-selection-header">
                        <h3>选择维修工</h3>
                    </div>
                    <div class="worker-selection-body">
                        <select id="workerSelect"></select>
                    </div>
                    <div class="worker-selection-footer">
                        <button id="cancelAssign">取消</button>
                        <button id="confirmAssign">确认</button>
                    </div>
                </div>
            </div>
            <div class="assign-order-message"></div>
        `;

        // 获取元素引用
        this.orderList = this.container.querySelector('.order-list');
        this.modalOverlay = this.container.querySelector('.modal-overlay');
        this.workerSelection = this.container.querySelector('.worker-selection');
        this.workerSelect = this.container.querySelector('#workerSelect');
        this.cancelButton = this.container.querySelector('#cancelAssign');
        this.confirmButton = this.container.querySelector('#confirmAssign');
        this.messageElement = this.container.querySelector('.assign-order-message');
    }

    bindMethods() {
        // 绑定方法到实例
        this.handleAssignClick = this.handleAssignClick.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleConfirm = this.handleConfirm.bind(this);
        this.handleOverlayClick = this.handleOverlayClick.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    }

    bindEvents() {
        // 绑定事件监听器
        this.cancelButton.addEventListener('click', this.handleCancel);
        this.confirmButton.addEventListener('click', this.handleConfirm);
        this.modalOverlay.addEventListener('click', this.handleOverlayClick);
        this.workerSelection.addEventListener('touchstart', this.handleTouchStart);
        this.workerSelection.addEventListener('touchmove', this.handleTouchMove);
        this.workerSelection.addEventListener('touchend', this.handleTouchEnd);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    async loadTodayOrders() {
        try {
            const response = await fetch(API_URLS.GET_REPORT_OF_SAME_DAY, {
                credentials: 'include'
            });
            const data = await response.json();

            if (data.message === 'Success') {
                this.renderOrders(data.report_info);
            } else if (data.message === 'No report') {
                this.orderList.innerHTML = '<p style="text-align: center; color: #666;">今日暂无待分配订单</p>';
            } else {
                this.handleSessionError(data.message);
            }
        } catch (error) {
            console.error('加载订单失败:', error);
            this.showMessage('加载订单失败，请刷新重试', 'error');
        }
    }

    async loadTodayWorkers() {
        try {
            const response = await fetch(API_URLS.TODAY_WORKERS, {
                credentials: 'include'
            });
            const data = await response.json();

            if (data.message === 'Success') {
                this.workers = data.worker_info;
                this.updateWorkerSelect();
            } else {
                this.handleSessionError(data.message);
            }
        } catch (error) {
            console.error('加载维修工列表失败:', error);
            this.showMessage('加载维修工列表失败', 'error');
        }
    }

    updateWorkerSelect() {
        this.workerSelect.innerHTML = this.workers.map(worker => 
            `<option value="${worker.username}">${worker.username}</option>`
        ).join('');
    }

    renderOrders(orders) {
        if (!Array.isArray(orders) || orders.length === 0) {
            this.orderList.innerHTML = '<p style="text-align: center; color: #666;">今日暂无待分配订单</p>';
            return;
        }

        this.orderList.innerHTML = orders.map(order => `
            <div class="order-item">
                <div class="order-info">
                    <div class="order-id">订单号：${order.reportId}</div>
                    <div class="order-details">
                        <div class="order-details-item">
                            <span class="order-details-label">手机号：</span>
                            <span>${order.userPhoneNumber}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">地址：</span>
                            <span>${order.address}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">问题：</span>
                            <span>${order.issue}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">时间：</span>
                            <span>${this.formatDate(order.date)}</span>
                        </div>
                    </div>
                </div>
                <button class="assign-btn" data-report-id="${order.reportId}">分配订单</button>
            </div>
        `).join('');

        // 为每个分配按钮添加点击事件
        this.orderList.querySelectorAll('.assign-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleAssignClick(btn.dataset.reportId));
        });
    }

    handleAssignClick(reportId) {
        this.selectedOrderId = reportId;
        this.modalOverlay.classList.add('active');
        this.workerSelection.classList.add('active');
    }

    handleCancel() {
        this.hideWorkerSelection();
    }

    handleOverlayClick(event) {
        if (event.target === this.modalOverlay) {
            this.hideWorkerSelection();
        }
    }

    async handleConfirm() {
        if (!this.selectedOrderId || !this.workerSelect.value) {
            this.showMessage('请选择维修工', 'error');
            return;
        }

        try {
            const response = await fetch(API_URLS.ASSIGN_ORDER, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reportId: this.selectedOrderId,
                    worker: this.workerSelect.value
                }),
                credentials: 'include'
            });

            const data = await response.json();

            if (data.message === 'Success') {
                this.showMessage('分配成功', 'success');
                this.hideWorkerSelection();
                await this.loadTodayOrders();
            } else {
                this.handleSessionError(data.message);
            }
        } catch (error) {
            console.error('分配订单失败:', error);
            this.showMessage('分配失败，请重试', 'error');
        }
    }

    hideWorkerSelection() {
        this.modalOverlay.classList.remove('active');
        this.workerSelection.classList.remove('active');
        this.selectedOrderId = null;
    }

    handleTouchStart(e) {
        this.touchStartY = e.touches[0].clientY;
    }

    handleTouchMove(e) {
        const touchY = e.touches[0].clientY;
        const deltaY = touchY - this.touchStartY;

        if (deltaY > 0) {
            e.preventDefault();
            this.workerSelection.style.transform = `translateY(${deltaY}px)`;
        }
    }

    handleTouchEnd() {
        const currentTransform = getComputedStyle(this.workerSelection).transform;
        const matrix = new DOMMatrix(currentTransform);
        const translateY = matrix.m42;

        if (translateY > 100) {
            this.hideWorkerSelection();
        } else {
            this.workerSelection.style.transform = '';
        }
    }

    handleVisibilityChange() {
        if (!document.hidden) {
            this.loadTodayOrders();
            this.loadTodayWorkers();
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString.replace(/-/g, '/'));
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}年${month}月${day}日 ${hours}:${minutes}`;
    }

    showMessage(text, type = 'info') {
        this.messageElement.textContent = text;
        this.messageElement.className = 'assign-order-message';
        if (type) {
            this.messageElement.classList.add(type);
        }
        this.messageElement.style.display = 'block';

        setTimeout(() => {
            this.messageElement.style.display = 'none';
        }, 3000);
    }

    handleSessionError(message) {
        switch (message) {
            case 'Session has expired':
                this.showMessage('会话已过期，请重新登录', 'error');
                break;
            case 'Invalid session':
                this.showMessage('无效的会话，请重新登录', 'error');
                break;
            case 'No sessionid cookie':
                this.showMessage('未找到会话信息，请重新登录', 'error');
                break;
            default:
                this.showMessage('发生未知错误，请重新登录', 'error');
        }

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    }

    destroy() {
        // 移除事件监听器
        this.cancelButton.removeEventListener('click', this.handleCancel);
        this.confirmButton.removeEventListener('click', this.handleConfirm);
        this.modalOverlay.removeEventListener('click', this.handleOverlayClick);
        this.workerSelection.removeEventListener('touchstart', this.handleTouchStart);
        this.workerSelection.removeEventListener('touchmove', this.handleTouchMove);
        this.workerSelection.removeEventListener('touchend', this.handleTouchEnd);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);

        // 清空容器
        this.container.innerHTML = '';
    }
}

// 导出模块
export default AssignOrder;