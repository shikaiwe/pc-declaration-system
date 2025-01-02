// API端点配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
};

class AssignOrder {
    constructor(container) {
        this.container = container;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="assign-order-list" id="assignOrderList">
                <!-- 订单列表将在这里动态生成 -->
            </div>
            <div class="assign-order-modal-overlay" id="assignOrderModalOverlay">
                <div class="assign-order-worker-selection">
                    <div class="assign-order-modal-header">
                        <h3 class="assign-order-modal-title">选择维修人员</h3>
                        <p class="assign-order-modal-subtitle">请为此订单分配一名维修人员</p>
                    </div>
                    <div class="assign-order-modal-body">
                        <div class="assign-order-select-wrapper">
                            <label class="assign-order-select-label" for="workerSelect">维修人员列表</label>
                            <select id="workerSelect" class="assign-order-select">
                                <option value="">加载中...</option>
                            </select>
                            <div class="assign-order-select-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        </div>
                    </div>
                    <div class="assign-order-modal-footer">
                        <button class="assign-order-btn assign-order-btn-cancel">取消</button>
                        <button class="assign-order-btn assign-order-btn-confirm">确认分配</button>
                    </div>
                </div>
            </div>
            <style>
                .assign-order-modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background-color: rgba(0, 0, 0, 0);
                    z-index: 1010;
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
                    position: relative;
                    width: 90%;
                    max-width: 420px;
                    background-color: white;
                    border-radius: 20px;
                    padding: 28px;
                    z-index: 1011;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
                    transform: scale(0.95) translateY(20px);
                    opacity: 0;
                    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .assign-order-modal-overlay.active .assign-order-worker-selection {
                    transform: scale(1) translateY(0);
                    opacity: 1;
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

                .assign-order-modal-subtitle {
                    margin: 8px 0 0;
                    color: #666;
                    font-size: 14px;
                }

                .assign-order-modal-body {
                    margin-bottom: 28px;
                }

                .assign-order-select-wrapper {
                    position: relative;
                }

                .assign-order-select-label {
                    display: block;
                    margin-bottom: 8px;
                    color: #555;
                    font-size: 14px;
                    font-weight: 500;
                }

                .assign-order-select {
                    width: 100%;
                    padding: 14px 16px;
                    border: 2px solid #e0e0e0;
                    border-radius: 12px;
                    font-size: 16px;
                    color: #333;
                    background-color: #fff;
                    transition: all 0.3s ease;
                    cursor: pointer;
                    appearance: none;
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

                .assign-order-select-icon {
                    position: absolute;
                    right: 14px;
                    top: 50%;
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
                    padding: 12px 24px;
                    border: none;
                    border-radius: 12px;
                    font-size: 15px;
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
                    padding-left: 32px !important;
                    padding-right: 32px !important;
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

                @media (max-width: 480px) {
                    .assign-order-worker-selection {
                        width: 95%;
                        padding: 24px;
                    }

                    .assign-order-modal-title {
                        font-size: 20px;
                    }

                    .assign-order-btn {
                        padding: 10px 20px;
                        font-size: 14px;
                    }
                }
            </style>
            <div class="assign-order-message"></div>
        `;

        this.bindEvents();
        // 初始化后立即加载订单
        this.loadOrders();
    }

    async loadOrders() {
        try {
            const orderList = this.container.querySelector('#assignOrderList');
            if (!orderList) {
                console.error('找不到订单列表容器');
                return;
            }

            orderList.innerHTML = '<div class="loading">加载中...</div>';

            $.ajax({
                    url: API_URLS.GET_REPORT_OF_SAME_DAY,
                    method: 'GET',
                    xhrFields: {
                        withCredentials: true
                    }
                })
                .done((data) => {
                    console.log('获取到的订单数据:', data);

                    if (data.message === 'Success' && Array.isArray(data.reports)) {
                        console.log('订单信息:', data.reports);
                        this.displayOrders(data.reports);
                    } else if (data.message === 'No report' || !Array.isArray(data.reports) || data.reports.length === 0) {
                        console.log('没有订单信息');
                        this.showNoOrders();
                    } else {
                        console.log('API响应消息:', data.message);
                        this.handleSessionError(data.message);
                    }
                })
                .fail((error) => {
                    console.error('加载订单失败:', error);
                    this.showError();
                });
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
        try {
            const select = this.container.querySelector('#workerSelect');
            select.innerHTML = '<option value="">加载中...</option>';

            const response = await $.ajax({
                url: API_URLS.TODAY_WORKERS,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                }
            });

            if (response.message === 'Success' && response.worker_list && response.worker_list.length > 0) {
                const options = response.worker_list.map(worker =>
                    `<option value="${worker.username}">${worker.username}</option>`
                ).join('');
                select.innerHTML = options;
            } else {
                select.innerHTML = '<option value="">暂无可用维修人员</option>';
            }
        } catch (error) {
            console.error('加载维修人员列表失败:', error);
            const select = this.container.querySelector('#workerSelect');
            select.innerHTML = '<option value="">加载失败，请重试</option>';
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
    }
}

export default AssignOrder;