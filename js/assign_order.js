// API端点配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
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
            <div class="assign-order-list" id="assignOrderList">
                <div class="loading">加载中...</div>
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

        // 过滤出待分配的订单（status = '0'）
        console.log('所有订单:', orders);
        const pendingOrders = orders.filter(order => order && order.status === '0');
        console.log('待分配订单:', pendingOrders);

        if (!pendingOrders || pendingOrders.length === 0) {
            this.showNoOrders();
            return;
        }

        const ordersHTML = pendingOrders.map(order => `
            <div class="order-item">
                <div class="order-info">
                    <div class="order-id">订单编号: ${order.reportId || '未知'}</div>
                    <div class="order-details">
                        <div class="order-details-item">
                            <span class="order-details-label">联系电话:</span>
                            <span>${order.userPhoneNumber || '未知'}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">地址:</span>
                            <span>${order.address || '未知'}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">问题:</span>
                            <span>${order.issue || '未知'}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">预约时间:</span>
                            <span>${this.formatDate(order.date)}</span>
                        </div>
                    </div>
                </div>
                <button class="assign-btn" data-report-id="${order.reportId}">分配订单</button>
            </div>
        `).join('');

        orderList.innerHTML = ordersHTML;
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
                <button class="retry-button" onclick="this.loadOrders()">重试</button>
            </div>
        `;
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

            if (response.message === 'Success' && Array.isArray(response.worker_list) && response.worker_list.length > 0) {
                // 清空现有选项
                select.innerHTML = '';

                // 添加默认选项
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = '请选择维修人员';
                select.appendChild(defaultOption);

                // 添加维修人员选项
                response.worker_list.forEach(worker => {
                    const option = document.createElement('option');
                    option.value = worker.username;
                    option.textContent = worker.username;
                    select.appendChild(option);
                });

                this.workersLoaded = true;
            } else if (response.message === 'Success' && (!response.worker_list || response.worker_list.length === 0)) {
                select.innerHTML = '<option value="">暂无可用维修人员</option>';
                select.disabled = true;
            } else {
                this.handleSessionError(response.message);
            }
        } catch (error) {
            console.error('加载维修人员列表失败:', error);
            const select = this.container.querySelector('#workerSelect');
            if (select) {
                select.classList.remove('loading');
                select.disabled = true;
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
            $.ajax({
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
                })
                .done((data) => {
                    if (data.message === 'Success') {
                        this.showMessage('分配成功', 'success');
                        this.closeWorkerSelection();
                        this.loadOrders();
                    } else {
                        this.showMessage(data.message || '分配失败', 'error');
                    }
                })
                .fail((error) => {
                    console.error('分配订单失败:', error);
                    this.showMessage('分配失败，请重试', 'error');
                });
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
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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