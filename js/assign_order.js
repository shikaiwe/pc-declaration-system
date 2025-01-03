// 常量配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
};

// 订单状态配置
const ORDER_STATUS = {
    '0': { text: '待分配', class: 'status-pending' },
    '1': { text: '已分配', class: 'status-allocated' },
    '2': { text: '已完成', class: 'status-completed' },
    '3': { text: '已撤单', class: 'status-cancelled' }
};

// 错误信息配置  
const ERROR_MESSAGES = {
    SESSION_EXPIRED: '会话已过期，请重新登录',
    WORKER_UNAVAILABLE: '该维修人员不可用',
    REPORT_ASSIGNED: '该订单已被分配',
    LOAD_FAILED: '加载失败，请重试',
    ASSIGN_FAILED: '分配失败，请重试'
};

/**
 * 订单分配管理类
 */
class AssignOrder {
    constructor(container) {
        this.container = container;
        this.workersLoaded = false;
        this.ordersLoaded = false;
        this.currentReportId = null;
        this.init();
    }

    /**
     * 初始化方法
     */
    init() {
        this._createDOMStructure();
        this._bindEvents();

        if (!this.ordersLoaded) {
            this.loadOrders();
        }
    }

    /**
     * 创建DOM结构
     * @private
     */
    _createDOMStructure() {
        this.container.innerHTML = `
            <div class="orders-container">
                <div class="assign-order-list" id="assignOrderList">
                    <div class="loading">加载中...</div>
                </div>
            </div>
            <div class="assign-order-modal-overlay" id="assignOrderModalOverlay">
                <div class="assign-order-worker-selection">
                    <div class="assign-order-modal-header">
                        <h3 class="assign-order-modal-title">选择维修人员</h3>
                        <p class="assign-order-modal-subtitle">请为此订单选择一位维修人员</p>
                    </div>
                    <div class="assign-order-modal-body">
                        <div class="assign-order-select-wrapper">
                            <label class="assign-order-select-label">维修人员</label>
                            <select id="workerSelect" class="assign-order-select">
                                <option value="">请选择维修人员</option>
                            </select>
                            <span class="assign-order-select-icon">▼</span>
                        </div>
                    </div>
                    <div class="assign-order-modal-footer">
                        <button class="assign-order-btn assign-order-btn-cancel">取消</button>
                        <button class="assign-order-btn assign-order-btn-confirm">确认分配</button>
                    </div>
                </div>
            </div>
            <div class="assign-order-message"></div>
        `;
    }

    /**
     * 绑定事件处理
     * @private  
     */
    _bindEvents() {
        // 分配按钮点击事件
        this.container.addEventListener('click', async(e) => {
            if (e.target.classList.contains('assign-btn')) {
                await this._handleAssignButtonClick(e);
            }
        });

        // 取消按钮点击事件
        const cancelBtn = this.container.querySelector('.assign-order-btn-cancel');
        cancelBtn.addEventListener('click', () => this.closeWorkerSelection());

        // 确认按钮点击事件  
        const confirmBtn = this.container.querySelector('.assign-order-btn-confirm');
        confirmBtn.addEventListener('click', async() => {
            await this._handleConfirmAssign();
        });

        // 点击遮罩层关闭
        const overlay = this.container.querySelector('#assignOrderModalOverlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeWorkerSelection();
            }
        });
    }

    /**
     * 处理分配按钮点击
     * @private
     */
    async _handleAssignButtonClick(e) {
        const reportId = e.target.dataset.reportId;
        const overlay = this.container.querySelector('#assignOrderModalOverlay');
        const selection = overlay.querySelector('.assign-order-worker-selection');
        const select = this.container.querySelector('#workerSelect');

        this.currentReportId = reportId;
        overlay.classList.add('active');
        selection.classList.add('active');

        if (!select.options.length || (select.options.length === 1 && select.options[0].value === '')) {
            await this.loadWorkers();
        }
    }

    /**
     * 处理确认分配
     * @private
     */
    async _handleConfirmAssign() {
        const select = this.container.querySelector('#workerSelect');
        const selectedWorker = select.value;

        if (!selectedWorker) {
            this.showMessage('请选择维修人员', 'error');
            return;
        }

        await this.assignOrder(this.currentReportId, selectedWorker);
    }

    /**
     * 加载订单列表
     */
    async loadOrders() {
        if (this.ordersLoaded) return;

        try {
            const orderList = this._getOrderListElement();
            if (!orderList) return;

            orderList.innerHTML = '<div class="loading">加载中...</div>';

            const response = await this._fetchOrders();
            this._handleOrdersResponse(response);
        } catch (error) {
            console.error('加载订单失败:', error);
            this.showError();
        }
    }

    /**
     * 获取订单列表元素
     * @private
     */
    _getOrderListElement() {
        const orderList = this.container.querySelector('#assignOrderList');
        if (!orderList) {
            console.error('找不到订单列表容器');
            return null;
        }
        return orderList;
    }

    /**
     * 获取订单数据
     * @private
     */
    async _fetchOrders() {
        return await $.ajax({
            url: API_URLS.GET_REPORT_OF_SAME_DAY,
            method: 'GET',
            xhrFields: { withCredentials: true }
        });
    }

    /**
     * 处理订单响应数据
     * @private
     */
    _handleOrdersResponse(response) {
        if (response.message === 'Success' && Array.isArray(response.reports)) {
            this.ordersLoaded = true;
            this.displayOrders(response.reports);
        } else if (response.message === 'No report' || !Array.isArray(response.reports) || response.reports.length === 0) {
            this.showNoOrders();
        } else {
            this.handleSessionError(response.message);
        }
    }

    /**
     * 显示订单列表
     * @param {Array} orders 订单数据
     */
    displayOrders(orders) {
        const orderList = this._getOrderListElement();
        if (!orderList) return;

        if (!orders || orders.length === 0) {
            this.showNoOrders();
            return;
        }

        const ordersHTML = orders.map(order => this._createOrderHTML(order)).join('');

        orderList.innerHTML = `
            <div class="orders-container" style="opacity: 1;">
                ${ordersHTML}
            </div>
        `;
    }

    /**
     * 创建单个订单的HTML
     * @private
     * @param {Object} order 订单数据
     * @returns {string} 订单HTML
     */
    _createOrderHTML(order) {
        const { text: statusText, class: statusClass } = ORDER_STATUS[order.status] || ORDER_STATUS['0'];
        const isAssigned = order.status !== '0';

        return `
            <div class="order-card">
                <div class="order-info">
                    ${this._createOrderInfoHTML(order, statusText, statusClass)}
                    ${this._createOrderActionHTML(order, isAssigned)}
                </div>
            </div>
        `;
    }

    /**
     * 创建订单信息HTML
     * @private
     */
    _createOrderInfoHTML(order, statusText, statusClass) {
            return `
            ${order.reportId ? `
                <p><strong>订单编号：</strong>${order.reportId}</p>
            ` : ''}
            <p><strong>手机号码：</strong>${order.userPhoneNumber}</p>
            <p>
                <strong>状态：</strong>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </p>
            <p><strong>地址：</strong>${order.address}</p>
            <p><strong>问题描述：</strong>${order.issue}</p>
            <p><strong>预约时间：</strong>${this.formatDate(order.date)}</p>
            <p><strong>提交时间：</strong>${this.formatDate(order.call_date)}</p>
        `;
    }

    /**
     * 创建订单操作HTML
     * @private
     */
    _createOrderActionHTML(order, isAssigned) {
        if (isAssigned) {
            return `
                <div class="assigned-info">
                    <span class="assigned-text">已分配给: ${order.workerName || '未知'}</span>
                </div>
            `;
        }
        return `
            <div class="order-buttons">
                <button class="assign-btn" data-report-id="${order.reportId}">
                    分配订单
                </button>
            </div>
        `;
    }

    /**
     * 显示无订单状态
     */
    showNoOrders() {
        const orderList = this._getOrderListElement();
        if (!orderList) return;

        orderList.innerHTML = `
            <div class="no-orders">
                <i class="no-orders-icon">📋</i>
                <p>暂无待分配订单</p>
            </div>
        `;
    }

    /**
     * 显示错误状态
     */
    showError() {
        const orderList = this._getOrderListElement();
        if (!orderList) return;

        orderList.innerHTML = `
            <div class="error-message">
                <i class="error-icon">❌</i>
                <p>${ERROR_MESSAGES.LOAD_FAILED}</p>
                <button class="retry-button">重试</button>
            </div>
        `;
        
        const retryButton = orderList.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => this.loadOrders());
        }
    }

    /**
     * 加载维修人员列表
     */
    async loadWorkers() {
        if (this.workersLoaded) return;

        const select = this.container.querySelector('#workerSelect');
        if (!select) {
            console.error('找不到维修人员选择下拉框');
            return;
        }

        try {
            await this._setWorkerSelectLoading(select, true);
            const response = await this._fetchWorkers();
            await this._handleWorkersResponse(response, select);
        } catch (error) {
            console.error('加载维修人员列表失败:', error);
            this._handleWorkerLoadError(select);
        }
    }

    /**
     * 设置维修人员选择框加载状态
     * @private
     */
    _setWorkerSelectLoading(select, isLoading) {
        if (isLoading) {
            select.classList.add('loading');
            select.innerHTML = '<option value="">加载中...</option>';
            select.disabled = true;
        } else {
            select.classList.remove('loading');
            select.disabled = false;
        }
    }

    /**
     * 获取维修人员数据
     * @private
     */
    async _fetchWorkers() {
        return await $.ajax({
            url: API_URLS.TODAY_WORKERS,
            method: 'GET',
            xhrFields: { withCredentials: true }
        });
    }

    /**
     * 处理维修人员响应数据
     * @private
     */
    async _handleWorkersResponse(response, select) {
        this._setWorkerSelectLoading(select, false);

        if (response.message === 'Success' && Array.isArray(response.workers) && response.workers.length > 0) {
            this._populateWorkerSelect(select, response.workers);
            this.workersLoaded = true;
        } else if (response.message === 'Success') {
            select.innerHTML = '<option value="">暂无可用维修人员</option>';
        } else {
            this.handleSessionError(response.message);
        }
    }

    /**
     * 填充维修人员选择框
     * @private
     */
    _populateWorkerSelect(select, workers) {
        select.innerHTML = '<option value="">请选择维修人员</option>';
        workers.forEach(worker => {
            const option = document.createElement('option');
            option.value = worker.username;
            option.textContent = worker.username;
            select.appendChild(option);
        });
    }

    /**
     * 处理维修人员加载错误
     * @private
     */
    _handleWorkerLoadError(select) {
        this._setWorkerSelectLoading(select, false);
        select.innerHTML = '<option value="">加载失败，请重试</option>';
    }

    /**
     * 分配订单
     */
    async assignOrder(reportId, workerName) {
        try {
            this.showMessage('正在分配...', 'info');
            
            const response = await this._assignOrderRequest(reportId, workerName);
            await this._handleAssignResponse(response, reportId, workerName);
        } catch (error) {
            console.error('分配订单失败:', error);
            this.showMessage(ERROR_MESSAGES.ASSIGN_FAILED, 'error');
        }
    }

    /**
     * 发送分配订单请求
     * @private
     */
    async _assignOrderRequest(reportId, workerName) {
        return await $.ajax({
            url: API_URLS.ASSIGN_ORDER,
            method: 'POST',
            data: JSON.stringify({ reportId, workerName }),
            contentType: 'application/json',
            xhrFields: { withCredentials: true }
        });
    }

    /**
     * 处理分配订单响应
     * @private
     */
    async _handleAssignResponse(response, reportId, workerName) {
        if (response.message === 'Success') {
            this.showMessage('分配成功', 'success');
            this.closeWorkerSelection();
            await this._updateOrderStatus(reportId, workerName);
        } else {
            this._handleAssignError(response.message);
        }
    }

    /**
     * 更新订单状态
     * @private
     */
    async _updateOrderStatus(reportId, workerName) {
        const orderCard = this.container.querySelector(`[data-report-id="${reportId}"]`)?.closest('.order-card');
        if (orderCard) {
            this._updateOrderCardStatus(orderCard, workerName);
        } else {
            await this.loadOrders();
        }
    }

    /**
     * 更新订单卡片状态
     * @private
     */
    _updateOrderCardStatus(orderCard, workerName) {
        const orderInfo = orderCard.querySelector('.order-info');
        if (!orderInfo) return;

        const statusElement = orderInfo.querySelector('.status-badge');
        if (statusElement) {
            statusElement.className = 'status-badge status-allocated';
            statusElement.textContent = '已分配';
        }

        const buttonContainer = orderInfo.querySelector('.order-buttons');
        if (buttonContainer) {
            buttonContainer.outerHTML = `
                <div class="assigned-info">
                    <span class="assigned-text">已分配给: ${workerName}</span>
                </div>
            `;
        }
    }

    /**
     * 处理分配错误
     * @private
     */
    _handleAssignError(message) {
        switch (message) {
            case 'Worker is not available':
                this.showMessage(ERROR_MESSAGES.WORKER_UNAVAILABLE, 'error');
                break;
            case 'Report is already assigned':
                this.showMessage(ERROR_MESSAGES.REPORT_ASSIGNED, 'error');
                this.loadOrders();
                break;
            default:
                this.handleSessionError(message);
        }
    }

    /**
     * 显示消息提示
     */
    showMessage(text, type = 'info') {
        const messageEl = this.container.querySelector('.assign-order-message');
        if (!messageEl) return;

        messageEl.textContent = text;
        messageEl.className = `assign-order-message ${type}`;
        messageEl.style.display = 'block';

        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    }

    /**
     * 格式化日期
     */
    formatDate(dateString) {
        try {
            const date = new Date(dateString.replace(/-/g, '/'));
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } catch (error) {
            console.error('日期格式化失败:', error);
            return dateString;
        }
    }

    /**
     * 处理会话错误
     */
    handleSessionError(message) {
        if (['Session has expired', 'Invalid session', 'No sessionid cookie'].includes(message)) {
            this.showMessage(ERROR_MESSAGES.SESSION_EXPIRED, 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    }

    /**
     * 销毁实例
     */
    destroy() {
        this.container.innerHTML = '';
        this.workersLoaded = false;
        this.ordersLoaded = false;
        this.currentReportId = null;
    }
}

export default AssignOrder;