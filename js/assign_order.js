// API端点配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://8.134.178.71/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://8.134.178.71/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://8.134.178.71/api/dashboard/assign_order/'
};

// 样式定义
const styles = `
    .assign-order-container {
        width: 100%;
        max-width: 800px;
        background: #fff;
        padding: 20px;
        border-radius: 8px;
        margin: 0 auto;
    }
    
    .assign-order-title {
        text-align: center;
        color: #2196F3;
        margin-bottom: 20px;
        font-size: 1.8em;
        font-weight: 600;
    }
    
    .order-list {
        margin-bottom: 20px;
    }
    
    .order-item {
        padding: 15px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #f8f9fa;
    }
    
    .order-info {
        flex: 1;
    }
    
    .order-id {
        font-weight: bold;
        color: #2196F3;
    }
    
    .order-details {
        margin-top: 5px;
        color: #666;
        font-size: 0.9em;
    }
    
    .assign-btn {
        padding: 8px 15px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 15px;
    }
    
    .assign-btn:hover {
        background-color: #1976D2;
    }
    
    .worker-selection {
        display: none;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
        width: 90%;
        max-width: 400px;
    }
    
    .worker-selection.active {
        display: block;
    }
    
    .modal-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 999;
    }
    
    .modal-overlay.active {
        display: block;
    }
    
    .worker-selection select {
        width: 100%;
        padding: 10px;
        margin-bottom: 15px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
    }
    
    .worker-selection-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .worker-selection-buttons button {
        padding: 8px 15px;
        border-radius: 4px;
        border: none;
        cursor: pointer;
    }
    
    .confirm-assign {
        background-color: #2196F3;
        color: white;
    }
    
    .cancel-assign {
        background-color: #e0e0e0;
    }
    
    .no-orders {
        text-align: center;
        padding: 20px;
        color: #666;
        font-style: italic;
    }
`;

// HTML模板
const template = `
    <div class="assign-order-container">
        <h1 class="assign-order-title">今日订单分配</h1>
        <div id="assignOrderMessage" class="assign-order-message"></div>
        <div id="orderList" class="order-list">
            <!-- 订单列表将在这里动态生成 -->
        </div>
    </div>
    
    <div class="modal-overlay" id="modalOverlay"></div>
    <div class="worker-selection" id="workerSelection">
        <h2 style="margin-bottom: 15px;">选择工作人员</h2>
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
        this.init();
    }

    init() {
        // 添加样式
        if (!document.getElementById('assign-order-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'assign-order-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }

        // 添加HTML
        this.container.innerHTML = template;

        // 获取元素引用
        this.form = document.getElementById('assignOrderForm');
        this.reportSelect = document.getElementById('reportId');
        this.workerSelect = document.getElementById('workerName');
        this.messageDiv = document.getElementById('assignOrderMessage');
        this.loadingDiv = document.getElementById('assignOrderLoading');
        this.submitBtn = document.querySelector('button[type="submit"]');

        // 绑定事件
        this.bindEvents();

        // 初始加载数据
        this.loadTodayOrders();
        this.loadTodayWorkers();
    }

    showMessage(text, type) {
        this.messageDiv.textContent = text;
        this.messageDiv.className = `assign-order-message ${type}`;
        this.messageDiv.style.display = 'block';
        setTimeout(() => {
            this.messageDiv.style.display = 'none';
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

    async loadTodayOrders() {
        try {
            const response = await $.ajax({
                url: API_URLS.GET_REPORT_OF_SAME_DAY,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                }
            });

            if (response.message === 'Success' && Array.isArray(response.reports)) {
                const orderList = document.getElementById('orderList');
                orderList.innerHTML = '';

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
                                电话: ${order.userPhoneNumber} | 地址: ${order.address} | 问题: ${order.issue}
                            </div>
                        </div>
                        <button class="assign-btn" data-report-id="${order.reportId}">分配订单</button>
                    `;
                    orderList.appendChild(orderDiv);
                });
            } else if (response.message === 'Permission error') {
                this.showMessage('权限错误，无法获取订单信息', 'error');
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
        const modalOverlay = document.getElementById('modalOverlay');
        const workerSelection = document.getElementById('workerSelection');
        const cancelAssign = document.getElementById('cancelAssign');
        const confirmAssign = document.getElementById('confirmAssign');
        let currentReportId = null;

        // 订单分配按钮点击事件
        document.addEventListener('click', async(e) => {
            if (e.target.classList.contains('assign-btn')) {
                currentReportId = e.target.dataset.reportId;
                modalOverlay.classList.add('active');
                workerSelection.classList.add('active');
                await this.loadTodayWorkers(); // 加载工作人员列表
            }
        });

        // 取消分配
        cancelAssign.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
            workerSelection.classList.remove('active');
            currentReportId = null;
        });

        // 确认分配
        confirmAssign.addEventListener('click', async() => {
            const workerName = document.getElementById('workerName').value;

            if (!workerName) {
                this.showMessage('请选择工作人员', 'error');
                return;
            }

            try {
                const response = await $.ajax({
                    url: API_URLS.ASSIGN_ORDER,
                    method: 'POST',
                    data: JSON.stringify({
                        reportId: currentReportId,
                        workerName
                    }),
                    contentType: 'application/json',
                    xhrFields: {
                        withCredentials: true
                    }
                });

                if (response.message === 'Success') {
                    this.showMessage('订单分配成功', 'success');
                    modalOverlay.classList.remove('active');
                    workerSelection.classList.remove('active');
                    await this.loadTodayOrders(); // 重新加载订单列表
                } else {
                    this.handleSessionError(response.message);
                }
            } catch (error) {
                console.error('分配订单失败:', error);
                this.showMessage('分配订单失败，请重试', 'error');
            }
        });

        // 页面可见性变化时重新加载订单
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.loadTodayOrders();
            }
        });
    }
}

// 导出模块
export default AssignOrder;