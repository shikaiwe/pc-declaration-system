// 常量配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
};

// 订单状态配置
const ORDER_STATUS = {
    '0': { text: '待分配', class: 'status-pending', color: '#ef6c00', bgColor: '#fff3e0' },
    '1': { text: '已分配', class: 'status-allocated', color: '#2e7d32', bgColor: '#e8f5e9' },
    '2': { text: '已完成', class: 'status-completed', color: '#1976d2', bgColor: '#e3f2fd' },
    '3': { text: '已撤单', class: 'status-cancelled', color: '#d32f2f', bgColor: '#ffebee' }
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
            <div class="assign-order-wrapper" style="height: calc(100vh - 120px); overflow-y: auto; padding: 20px;">
                <div class="orders-container">
                    <div class="assign-order-list" id="assignOrderList">
                        <div class="loading">加载中...</div>
                    </div>
                </div>
                <div class="assign-order-modal-overlay" id="assignOrderModalOverlay">
                    <div class="assign-order-worker-selection">
                        <div class="pull-indicator"></div>
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
            </div>
        `;

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            /* 通用样式 */
            .assign-order-wrapper {
                background-color: #f5f7fa;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .assign-order-wrapper::-webkit-scrollbar {
                width: 8px;
            }

            .assign-order-wrapper::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
            }

            .assign-order-wrapper::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 4px;
            }

            .assign-order-wrapper::-webkit-scrollbar-thumb:hover {
                background: #555;
            }

            /* 桌面端样式 */
            @media (min-width: 769px) {
                .assign-order-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }

                .assign-order-modal-overlay.active {
                    display: flex;
                }

                .assign-order-worker-selection {
                    background: white;
                    padding: 25px;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                    width: 100%;
                    max-width: 420px;
                    margin: 20px;
                }

                .pull-indicator {
                    display: none;
                }

                .assign-order-modal-header {
                    margin-bottom: 20px;
                    text-align: left;
                }

                .assign-order-modal-title {
                    font-size: 18px;
                    margin: 0 0 8px 0;
                    color: #333;
                }

                .assign-order-select {
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                }

                .assign-order-btn {
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-size: 14px;
                }
            }

            /* 移动端样式 */
            @media (max-width: 768px) {
                .assign-order-modal-overlay {
                    background-color: rgba(0, 0, 0, 0);
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    backdrop-filter: blur(0);
                    -webkit-backdrop-filter: blur(0);
                }

                .assign-order-modal-overlay.active {
                    opacity: 1;
                    visibility: visible;
                    background-color: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                }

                .assign-order-worker-selection {
                    position: fixed;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%) scale(0.95);
                    padding: 28px;
                    border-radius: 20px;
                    opacity: 0;
                    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                    z-index: 1011;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
                }

                .assign-order-modal-overlay.active .assign-order-worker-selection {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }

                .pull-indicator {
                    width: 40px;
                    height: 4px;
                    background: #ddd;
                    border-radius: 2px;
                    margin: 0 auto 15px;
                }

                .assign-order-modal-header {
                    text-align: center;
                    margin-bottom: 28px;
                }

                .assign-order-modal-title {
                    margin: 0;
                    font-size: 22px;
                    color: #333;
                    font-weight: 600;
                }

                .assign-order-select {
                    padding: 14px 16px;
                    border: 2px solid #e0e0e0;
                    border-radius: 12px;
                    font-size: 16px;
                }

                .assign-order-btn {
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-size: 15px;
                }
            }

            /* 通用样式继续 */
            .assign-order-modal-subtitle {
                color: #666;
                font-size: 14px;
            }

            .assign-order-select-wrapper {
                position: relative;
            }

            .assign-order-select-label {
                display: block;
                margin-bottom: 8px;
                color: #555;
                font-weight: 500;
            }

            .assign-order-select {
                width: 100%;
                color: #333;
                background-color: white;
                transition: all 0.3s ease;
                cursor: pointer;
                appearance: none;
                -webkit-appearance: none;
                -moz-appearance: none;
                padding-right: 40px;
            }

            .assign-order-select:hover {
                border-color: #2196F3;
            }

            .assign-order-select:focus {
                outline: none;
                border-color: #2196F3;
                box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
            }

            .assign-order-select:disabled {
                background-color: #f5f5f5;
                cursor: not-allowed;
                opacity: 0.7;
            }

            .assign-order-select-icon {
                position: absolute;
                right: 14px;
                top: calc(50% + 12px);
                transform: translateY(-50%);
                color: #666;
                pointer-events: none;
                transition: transform 0.3s ease;
            }

            .assign-order-select:focus + .assign-order-select-icon {
                color: #2196F3;
                transform: translateY(-50%) rotate(180deg);
            }

            .assign-order-modal-footer {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                margin-top: 20px;
            }

            .assign-order-btn {
                border: none;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .assign-order-btn-cancel {
                background-color: #f5f5f5;
                color: #666;
            }

            .assign-order-btn-confirm {
                background-color: #2196F3;
                color: white;
            }

            .assign-order-btn-cancel:hover {
                background-color: #eeeeee;
                transform: translateY(-2px);
            }

            .assign-order-btn-confirm:hover {
                background-color: #1976D2;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(33, 150, 243, 0.2);
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
                z-index: 1012;
                font-size: 16px;
                text-align: center;
                min-width: 200px;
                max-width: 80%;
                display: none;
            }

            .assign-order-message.error {
                background-color: rgba(244, 67, 54, 0.9);
            }

            .assign-order-message.success {
                background-color: rgba(76, 175, 80, 0.9);
            }

            /* 深色模式 */
            @media (prefers-color-scheme: dark) {
                .assign-order-worker-selection {
                    background-color: #333;
                }
                .assign-order-modal-title {
                    color: #fff;
                }
                .assign-order-modal-subtitle {
                    color: #aaa;
                }
                .assign-order-select-label {
                    color: #ccc;
                }
                .assign-order-select {
                    background-color: #444;
                    border-color: #555;
                    color: #fff;
                }
                .assign-order-select:hover {
                    border-color: #2196F3;
                }
                .assign-order-btn-cancel {
                    background-color: #444;
                    color: #fff;
                }
                .assign-order-btn-cancel:hover {
                    background-color: #555;
                }
                .assign-order-select.loading {
                    background-image: url('data:image/svg+xml;charset=utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" fill="none" stroke="%23fff" stroke-width="8" r="40" stroke-dasharray="180 100"/></svg>');
                }
            }

            @keyframes rotate {
                from {
                    transform: rotate(0deg);
                }
                to {
                    transform: rotate(360deg);
                }
            }

            /* 状态标签样式 */
            .status-badge {
                display: inline-block;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 500;
                text-align: center;
            }

            /* 待分配状态 */
            .status-badge.pending,
            .status-pending {
                background-color: #fff3e0;
                color: #ef6c00;
            }

            /* 已分配状态 */
            .status-badge.allocated,
            .status-allocated {
                background-color: #e8f5e9;
                color: #2e7d32;
            }

            /* 已完成状态 */
            .status-badge.completed,
            .status-completed {
                background-color: #e3f2fd;
                color: #1976d2;
            }

            /* 已撤单状态 */
            .status-badge.cancelled,
            .status-cancelled {
                background-color: #ffebee;
                color: #d32f2f;
            }

            /* 未知状态 */
            .status-badge.unknown,
            .status-unknown {
                background-color: #f5f5f5;
                color: #757575;
            }

            /* 订单卡片中的状态样式 */
            .order-info p .status-badge {
                margin-left: 4px;
                font-size: 0.9em;
            }

            /* 订单详情中的状态样式 */
            .detail-value .status-badge {
                padding: 4px 12px;
                font-size: 12px;
            }

            /* 深色模式适配 */
            @media (prefers-color-scheme: dark) {
                .status-badge.pending,
                .status-pending {
                    background-color: rgba(239, 108, 0, 0.15);
                    color: #ffb74d;
                }
                
                .status-badge.allocated,
                .status-allocated {
                    background-color: rgba(46, 125, 50, 0.15);
                    color: #81c784;
                }
                
                .status-badge.completed,
                .status-completed {
                    background-color: rgba(25, 118, 210, 0.15);
                    color: #64b5f6;
                }
                
                .status-badge.cancelled,
                .status-cancelled {
                    background-color: rgba(211, 47, 47, 0.15);
                    color: #e57373;
                }
                
                .status-badge.unknown,
                .status-unknown {
                    background-color: rgba(117, 117, 117, 0.15);
                    color: #bdbdbd;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 绑定事件处理
     * @private  
     */
    _bindEvents() {
        // 使用事件委托处理分配按钮点击
        this.container.addEventListener('click', (e) => {
            const assignBtn = e.target.closest('.assign-btn');
            if (assignBtn) {
                e.preventDefault();
                this._handleAssignButtonClick(assignBtn);
            }
        });

        // 取消按钮点击事件
        const cancelBtn = this.container.querySelector('.assign-order-btn-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeWorkerSelection();
            });
        }

        // 确认按钮点击事件  
        const confirmBtn = this.container.querySelector('.assign-order-btn-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async(e) => {
                e.preventDefault();
                await this._handleConfirmAssign();
            });
        }

        // 点击遮罩层关闭
        const overlay = this.container.querySelector('#assignOrderModalOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    e.preventDefault();
                    this.closeWorkerSelection();
                }
            });
        }

        // 添加触摸滑动关闭功能
        const selection = this.container.querySelector('.assign-order-worker-selection');
        if (selection) {
            let touchStartY = 0;
            let touchEndY = 0;

            selection.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            });

            selection.addEventListener('touchmove', (e) => {
                touchEndY = e.touches[0].clientY;
                const deltaY = touchEndY - touchStartY;

                if (deltaY > 0) {
                    selection.style.transform = `translateY(${deltaY}px)`;
                }
            });

            selection.addEventListener('touchend', () => {
                const deltaY = touchEndY - touchStartY;
                if (deltaY > 100) {
                    this.closeWorkerSelection();
                } else {
                    selection.style.transform = '';
                }
            });
        }
    }

    /**
     * 处理分配按钮点击
     * @private
     */
    async _handleAssignButtonClick(assignBtn) {
        try {
            const reportId = assignBtn.dataset.reportId;
            if (!reportId) {
                console.error('未找到订单ID');
                return;
            }

            const overlay = this.container.querySelector('#assignOrderModalOverlay');
            const selection = this.container.querySelector('.assign-order-worker-selection');
            const select = this.container.querySelector('#workerSelect');

            if (!overlay || !selection || !select) {
                console.error('未找到必要的DOM元素');
                return;
            }

            this.currentReportId = reportId;

            // 显示遮罩层和选择框
            overlay.style.display = 'flex';
            overlay.classList.add('active');
            selection.style.display = 'block';

            // 如果还没有加载维修人员列表，则加载
            if (!this.workersLoaded || !select.options.length || (select.options.length === 1 && select.options[0].value === '')) {
                await this.loadWorkers();
            }
        } catch (error) {
            console.error('处理分配按钮点击失败:', error);
            this.showMessage('操作失败，请重试', 'error');
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
                <strong>状态：</strong><span class="status-badge ${statusClass}">${statusText}</span>
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
            data: JSON.stringify({
                reportId: reportId,
                workerName: workerName
            }),
            contentType: 'application/json',
            xhrFields: {
                withCredentials: true
            }
        });
    }

    /**
     * 处理分配订单响应
     * @private
     */
    async _handleAssignResponse(response, reportId, workerName) {
        if (response.message === 'Success') {
            await this._updateOrderStatus(reportId, workerName);
            this.showMessage('订单分配成功', 'success');
            this.closeWorkerSelection();
            await this.refreshOrders();
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
     * @param {string} message 消息内容
     * @param {string} type 消息类型 (success/error/info)
     */
    showMessage(message, type = 'info') {
        const messageElement = this.container.querySelector('.assign-order-message');
        if (!messageElement) return;

        messageElement.textContent = message;
        messageElement.className = `assign-order-message ${type}`;
        messageElement.style.display = 'block';

        // 3秒后自动隐藏
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 3000);
    }

    /**
     * 处理会话错误
     * @param {string} message 错误消息
     */
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

        // 2秒后跳转到登录页
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    }

    /**
     * 格式化日期
     * @param {string} dateString 日期字符串
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(dateString) {
        try {
            if (!dateString) return '未知时间';
            
            // 处理包含时间的日期
            if (dateString.includes(' ')) {
                const [datePart, timePart] = dateString.split(' ');
                const [year, month, day] = datePart.replace(/-/g, '/').split('/');
                return `${year}-${String(parseInt(month)).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')} ${timePart}`;
            }
            
            // 处理只有日期的情况
            if (dateString.includes('/') || dateString.includes('-')) {
                const [year, month, day] = dateString.replace(/-/g, '/').split('/');
                return `${year}-${String(parseInt(month)).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
            }
            
            // 处理其他格式
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                throw new Error('无效的日期格式');
            }
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        } catch (error) {
            console.error('日期格式化错误:', error, '原始日期:', dateString);
            return '时间格式错误';
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

    /**
     * 关闭维修人员选择框
     */
    closeWorkerSelection() {
        const overlay = this.container.querySelector('#assignOrderModalOverlay');
        const selection = this.container.querySelector('.assign-order-worker-selection');
        
        if (overlay && selection) {
            if (window.innerWidth <= 768) {
                selection.style.transform = 'translate(-50%, -50%) scale(0.95)';
                selection.style.opacity = '0';
            }
            overlay.classList.remove('active');
            overlay.style.display = 'none';
            selection.style.display = 'none';
            
            setTimeout(() => {
                selection.style.transform = '';
                selection.style.opacity = '';
                this.currentReportId = null;
            }, 300);
        }
    }

    /**
     * 刷新订单列表
     */
    async refreshOrders() {
        this.ordersLoaded = false;
        await this.loadOrders();
    }
}

// 导出 AssignOrder 类
export default AssignOrder;