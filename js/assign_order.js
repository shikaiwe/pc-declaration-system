// API端点配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
};

// 订单状态映射
const ORDER_STATUS = {
    '0': {
        text: '待分配',
        class: 'status-pending'
    },
    '1': {
        text: '已分配',
        class: 'status-allocated'
    },
    '2': {
        text: '已完成',
        class: 'status-completed'
    },
    '3': {
        text: '已撤单',
        class: 'status-cancelled'
    }
};

class AssignOrder {
    constructor(container) {
        this.container = container;
        this.workersLoaded = false;
        this.ordersLoaded = false;
        this.currentReportId = null;
        this.init();
    }

    init() {
        // 创建基本DOM结构
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

        this.bindEvents();

        // 只在首次初始化时加载订单
        if (!this.ordersLoaded) {
            this.loadOrders();
        }
    }

    async loadOrders() {
        if (this.ordersLoaded) return;

        try {
            const orderList = this.container.querySelector('#assignOrderList');
            if (!orderList) {
                console.error('找不到订单列表容器');
                return;
            }

            orderList.innerHTML = '<div class="loading">加载中...</div>';

            const response = await $.ajax({
                url: API_URLS.GET_REPORT_OF_SAME_DAY,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                }
            });

            if (response.message === 'Success' && Array.isArray(response.reports)) {
                this.ordersLoaded = true;
                this.displayOrders(response.reports);
            } else if (response.message === 'No report' || !Array.isArray(response.reports) || response.reports.length === 0) {
                this.showNoOrders();
            } else {
                this.handleSessionError(response.message);
            }
        } catch (error) {
            console.error('加载订单失败:', error);
            this.showError();
        }
    }

    displayOrders(orders) {
            const orderList = this.container.querySelector('#assignOrderList');
            if (!orderList) {
                console.error('找不到订单列表容器');
                return;
            }

            if (!orders || orders.length === 0) {
                this.showNoOrders();
                return;
            }

            const ordersHTML = orders.map(order => {
                        const { text: statusText, class: statusClass } = ORDER_STATUS[order.status] || ORDER_STATUS['0'];
                        const isAssigned = order.status !== '0';

                        return `
                <div class="order-card">
                    <div class="order-info">
                        ${order.reportId ? `
                            <p>
                                <strong>订单编号：</strong>
                                ${order.reportId}
                            </p>
                        ` : ''}
                        <p>
                            <strong>手机号码：</strong>
                            ${order.userPhoneNumber}
                        </p>
                        <p>
                            <strong>状态：</strong>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </p>
                        <p>
                            <strong>地址：</strong>
                            ${order.address}
                        </p>
                        <p>
                            <strong>问题描述：</strong>
                            ${order.issue}
                        </p>
                        <p>
                            <strong>预约时间：</strong>
                            ${this.formatDate(order.date)}
                        </p>
                        <p>
                            <strong>提交时间：</strong>
                            ${this.formatDate(order.call_date)}
                        </p>
                        ${isAssigned ? `
                            <div class="assigned-info">
                                <span class="assigned-text">已分配给: ${order.workerName || '未知'}</span>
                            </div>
                        ` : `
                            <div class="order-buttons">
                                <button class="assign-btn" data-report-id="${order.reportId}">
                                    分配订单
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');

        orderList.innerHTML = `
            <div class="orders-container" style="opacity: 1;">
                ${ordersHTML}
            </div>
        `;
    }

    showNoOrders() {
        const orderList = this.container.querySelector('#assignOrderList');
        orderList.innerHTML = `
            <div class="no-orders">
                <i class="no-orders-icon">📋</i>
                <p>暂无待分配订单</p>
            </div>
        `;
    }

    showError() {
        const orderList = this.container.querySelector('#assignOrderList');
        orderList.innerHTML = `
            <div class="error-message">
                <i class="error-icon">❌</i>
                <p>加载失败，请重试</p>
                <button class="retry-button">重试</button>
            </div>
        `;
        
        // 正确绑定重试按钮的点击事件
        const retryButton = orderList.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                this.loadOrders();
            });
        }
    }

    async loadWorkers() {
        if (this.workersLoaded) {
            return; // 如果已经加载过，直接返回
        }

        try {
            const select = this.container.querySelector('#workerSelect');
            if (!select) {
                console.error('找不到维修人员选择下拉框');
                return;
            }

            // 设置加载状态
            select.classList.add('loading');
            select.innerHTML = '<option value="">加载中...</option>';
            select.disabled = true;

            const response = await $.ajax({
                url: API_URLS.TODAY_WORKERS,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                }
            });

            // 移除加载状态
            select.classList.remove('loading');
            select.disabled = false;

            if (response.message === 'Success' && Array.isArray(response.workers) && response.workers.length > 0) {
                // 清空现有选项
                select.innerHTML = '';

                // 添加默认选项
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = '请选择维修人员';
                select.appendChild(defaultOption);

                // 添加维修人员选项
                response.workers.forEach(worker => {
                    const option = document.createElement('option');
                    option.value = worker.username;
                    option.textContent = worker.username;
                    select.appendChild(option);
                });

                this.workersLoaded = true;
            } else if (response.message === 'Success' && (!response.workers || response.workers.length === 0)) {
                select.innerHTML = '<option value="">暂无可用维修人员</option>';
            } else {
                this.handleSessionError(response.message);
            }
        } catch (error) {
            console.error('加载维修人员列表失败:', error);
            const select = this.container.querySelector('#workerSelect');
            if (select) {
                select.classList.remove('loading');
                select.innerHTML = '<option value="">加载失败，请重试</option>';
            }
        }
    }

    bindEvents() {
        // 分配按钮点击事件
        this.container.addEventListener('click', async(e) => {
            if (e.target.classList.contains('assign-btn')) {
                const reportId = e.target.dataset.reportId;
                const overlay = this.container.querySelector('#assignOrderModalOverlay');
                const selection = overlay.querySelector('.assign-order-worker-selection');
                const select = this.container.querySelector('#workerSelect');

                // 存储当前选中的订单ID
                this.currentReportId = reportId;

                // 显示选择框
                overlay.classList.add('active');
                selection.classList.add('active');

                // 如果下拉框为空或只有加载中选项，则加载维修人员列表
                if (!select.options.length || (select.options.length === 1 && select.options[0].value === '')) {
                    await this.loadWorkers();
                }
            }
        });

        // 取消按钮点击事件
        const cancelBtn = this.container.querySelector('.assign-order-btn-cancel');
        cancelBtn.addEventListener('click', () => {
            this.closeWorkerSelection();
        });

        // 确认按钮点击事件
        const confirmBtn = this.container.querySelector('.assign-order-btn-confirm');
        confirmBtn.addEventListener('click', async() => {
            const select = this.container.querySelector('#workerSelect');
            const selectedWorker = select.value;

            if (!selectedWorker) {
                this.showMessage('请选择维修人员', 'error');
                return;
            }

            await this.assignOrder(this.currentReportId, selectedWorker);
        });

        // 点击遮罩层关闭
        const overlay = this.container.querySelector('#assignOrderModalOverlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeWorkerSelection();
            }
        });
    }

    closeWorkerSelection() {
        const overlay = this.container.querySelector('#assignOrderModalOverlay');
        const selection = overlay.querySelector('.assign-order-worker-selection');
        overlay.classList.remove('active');
        selection.classList.remove('active');
        this.currentReportId = null;
    }

    async assignOrder(reportId, workerName) {
        try {
            // 显示加载状态
            this.showMessage('正在分配...', 'info');
            
            const response = await $.ajax({
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

            if (response.message === 'Success') {
                // 分配成功后的处理
                this.showMessage('分配成功', 'success');
                
                // 关闭选择框
                this.closeWorkerSelection();

                // 更新订单状态
                const orderCard = this.container.querySelector(`[data-report-id="${reportId}"]`)?.closest('.order-card');
                if (orderCard) {
                    const orderInfo = orderCard.querySelector('.order-info');
                    if (orderInfo) {
                        // 更新状态标签
                        const statusElement = orderInfo.querySelector('.status-badge');
                        if (statusElement) {
                            statusElement.className = 'status-badge status-allocated';
                            statusElement.textContent = '已分配';
                        }

                        // 替换分配按钮为已分配信息
                        const buttonContainer = orderInfo.querySelector('.order-buttons');
                        if (buttonContainer) {
                            buttonContainer.outerHTML = `
                                <div class="assigned-info">
                                    <span class="assigned-text">已分配给: ${workerName}</span>
                                </div>
                            `;
                        }
                    }
                } else {
                    // 如果找不到对应的订单卡片，则重新加载所有订单
                    this.loadOrders();
                }
            } else {
                // 处理错误响应
                if (response.message === 'Worker is not available') {
                    this.showMessage('该维修人员不可用', 'error');
                } else if (response.message === 'Report is already assigned') {
                    this.showMessage('该订单已被分配', 'error');
                    // 重新加载订单列表以显示最新状态
                    this.loadOrders();
                } else {
                    this.handleSessionError(response.message);
                }
            }
        } catch (error) {
            console.error('分配订单失败:', error);
            this.showMessage('分配失败，请重试', 'error');
        }
    }

    showMessage(text, type = 'info') {
        const messageEl = this.container.querySelector('.assign-order-message');
        messageEl.textContent = text;
        messageEl.className = `assign-order-message ${type}`;
        messageEl.style.display = 'block';

        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString.replace(/-/g, '/'));
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } catch (error) {
            console.error('日期格式化失败:', error);
            return dateString;
        }
    }

    handleSessionError(message) {
        if (['Session has expired', 'Invalid session', 'No sessionid cookie'].includes(message)) {
            this.showMessage('会话已过期，请重新登录', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    }

    destroy() {
        // 清理事件监听器和DOM
        this.container.innerHTML = '';
        this.workersLoaded = false;
        this.ordersLoaded = false;
        this.currentReportId = null;
    }
}

export default AssignOrder;