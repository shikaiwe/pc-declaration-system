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
                    <div class="assign-order-header">
                        <h3>选择维修人员</h3>
                    </div>
                    <div class="assign-order-body">
                        <select id="workerSelect">
                            <option value="">加载中...</option>
                        </select>
                    </div>
                    <div class="assign-order-footer">
                        <button class="assign-order-cancel">取消</button>
                        <button class="assign-order-confirm">确认</button>
                    </div>
                </div>
            </div>
            <div class="assign-order-message"></div>
        `;

        this.loadOrders();
        this.bindEvents();
    }

    async loadOrders() {
        try {
            const response = await fetch(API_URLS.GET_REPORT_OF_SAME_DAY, {
                credentials: 'include'
            });
            const data = await response.json();

            if (data.message === 'Success') {
                this.displayOrders(data.report_info);
            } else if (data.message === 'No report') {
                this.showNoOrders();
            } else {
                this.handleSessionError(data.message);
            }
        } catch (error) {
            console.error('加载订单失败:', error);
            this.showError();
        }
    }

    displayOrders(orders) {
        const orderList = this.container.querySelector('#assignOrderList');
        if (!orders || orders.length === 0) {
            this.showNoOrders();
            return;
        }

        const ordersHTML = orders.map(order => `
            <div class="order-item">
                <div class="order-info">
                    <div class="order-id">订单编号: ${order.reportId}</div>
                    <div class="order-details">
                        <div class="order-details-item">
                            <span class="order-details-label">联系电话:</span>
                            <span>${order.userPhoneNumber}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">地址:</span>
                            <span>${order.address}</span>
                        </div>
                        <div class="order-details-item">
                            <span class="order-details-label">问题:</span>
                            <span>${order.issue}</span>
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
            const response = await fetch('/api/dashboard/get_worker_list/', {
                credentials: 'include'
            });
            const data = await response.json();
            const select = this.container.querySelector('#workerSelect');

            if (data.message === 'Success' && data.worker_list && data.worker_list.length > 0) {
                const options = data.worker_list.map(worker =>
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

                // 显示选择框前先加载维修人员列表
                await this.loadWorkers();

                overlay.classList.add('active');
                selection.classList.add('active');

                // 存储当前选中的订单ID
                this.currentReportId = reportId;
            }
        });

        // 取消按钮点击事件
        const cancelBtn = this.container.querySelector('.assign-order-cancel');
        cancelBtn.addEventListener('click', () => {
            this.closeWorkerSelection();
        });

        // 确认按钮点击事件
        const confirmBtn = this.container.querySelector('.assign-order-confirm');
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
            const response = await fetch('/api/dashboard/assign_report/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reportId: reportId,
                    workerName: workerName
                }),
                credentials: 'include'
            });

            const data = await response.json();

            if (data.message === 'Success') {
                this.showMessage('分配成功', 'success');
                this.closeWorkerSelection();
                // 重新加载订单列表
                await this.loadOrders();
            } else {
                this.showMessage(data.message || '分配失败', 'error');
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