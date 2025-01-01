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
        max-width: 600px;
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
    
    .assign-order-form-group {
        margin-bottom: 20px;
    }
    
    .assign-order-label {
        display: block;
        margin-bottom: 8px;
        color: #333;
        font-weight: 500;
        font-size: 0.95em;
    }
    
    .assign-order-select {
        width: 100%;
        padding: 10px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        font-size: 14px;
        background-color: white;
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        background-size: 16px;
    }
    
    .assign-order-select:focus {
        outline: none;
        border-color: #2196F3;
        box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
    }
    
    .assign-order-button {
        width: 100%;
        padding: 12px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.3s;
    }
    
    .assign-order-button:hover {
        background-color: #1976D2;
    }
    
    .assign-order-button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
    
    .assign-order-message {
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 15px;
        display: none;
    }
    
    .assign-order-message.success {
        background-color: rgba(76, 175, 80, 0.1);
        color: #4CAF50;
        border: 1px solid rgba(76, 175, 80, 0.2);
    }
    
    .assign-order-message.error {
        background-color: rgba(244, 67, 54, 0.1);
        color: #f44336;
        border: 1px solid rgba(244, 67, 54, 0.2);
    }
    
    .assign-order-loading {
        display: none;
        text-align: center;
        margin: 10px 0;
    }
    
    .assign-order-loading::after {
        content: '';
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 2px solid #2196F3;
        border-radius: 50%;
        border-top-color: transparent;
        animation: assign-order-spin 0.8s linear infinite;
    }
    
    @keyframes assign-order-spin {
        to {
            transform: rotate(360deg);
        }
    }
    
    @media (max-width: 480px) {
        .assign-order-container {
            padding: 15px;
        }
        .assign-order-title {
            font-size: 1.5em;
            margin-bottom: 15px;
        }
        .assign-order-select {
            font-size: 13px;
            padding: 8px;
        }
        .assign-order-button {
            padding: 10px;
            font-size: 14px;
        }
    }
`;

// HTML模板
const template = `
    <div class="assign-order-container">
        <h1 class="assign-order-title">分配订单</h1>
        <div id="assignOrderMessage" class="assign-order-message"></div>
        <form id="assignOrderForm">
            <div class="assign-order-form-group">
                <label class="assign-order-label" for="reportId">选择订单</label>
                <select class="assign-order-select" id="reportId" name="reportId" required>
                    <option value="">请选择订单</option>
                </select>
            </div>
            <div class="assign-order-form-group">
                <label class="assign-order-label" for="workerName">选择志愿者</label>
                <select class="assign-order-select" id="workerName" name="workerName" required>
                    <option value="">请选择志愿者</option>
                </select>
            </div>
            <div class="assign-order-loading" id="assignOrderLoading"></div>
            <button type="submit" id="assignOrderSubmitBtn" class="assign-order-button">分配订单</button>
        </form>
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
                console.log('获取到的所有订单:', response.reports);
                this.reportSelect.innerHTML = '<option value="">请选择订单</option>';

                const todayOrders = response.reports.filter(order => {
                    console.log('订单状态:', order.reportId, '状态:', order.status, '类型:', typeof order.status);
                    return order.status === '0' || order.status === 0;
                });

                console.log('过滤后的待分配订单:', todayOrders);

                if (todayOrders.length === 0) {
                    const option = document.createElement('option');
                    option.value = "";
                    option.textContent = "今日没有待分配的订单";
                    option.disabled = true;
                    this.reportSelect.appendChild(option);
                } else {
                    todayOrders.forEach(order => {
                        const option = document.createElement('option');
                        option.value = order.reportId;
                        option.textContent = `订单号: ${order.reportId} - 电话: ${order.userPhoneNumber} - 地址: ${order.address} - 问题: ${order.issue}`;
                        this.reportSelect.appendChild(option);
                    });
                }
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
        // 表单提交处理
        this.form.addEventListener('submit', async(e) => {
            e.preventDefault();

            const reportId = this.reportSelect.value.trim();
            const workerName = this.workerSelect.value.trim();

            if (!reportId || !workerName) {
                this.showMessage('请填写所有必填字段', 'error');
                return;
            }

            this.loadingDiv.style.display = 'block';
            this.submitBtn.disabled = true;

            try {
                const response = await $.ajax({
                    url: API_URLS.ASSIGN_ORDER,
                    method: 'POST',
                    data: JSON.stringify({
                        reportId,
                        workerName
                    }),
                    contentType: 'application/json',
                    xhrFields: {
                        withCredentials: true
                    }
                });

                if (response.message === 'Success') {
                    this.showMessage('订单分配成功', 'success');
                    this.form.reset();
                    // 重新加载订单列表
                    await this.loadTodayOrders();
                } else {
                    switch (response.message) {
                        case 'Permission error':
                            this.showMessage('权限错误，无法分配订单', 'error');
                            break;
                        case 'This worker is no exist':
                            this.showMessage('指定的志愿者不存在', 'error');
                            break;
                        case 'This report is allocated':
                            this.showMessage('该订单已被分配', 'error');
                            break;
                        case 'This report is no exist':
                            this.showMessage('该订单不存在', 'error');
                            break;
                        default:
                            this.handleSessionError(response.message);
                    }
                }
            } catch (error) {
                console.error('分配订单失败:', error);
                this.showMessage('分配订单失败，请重试', 'error');
            } finally {
                this.loadingDiv.style.display = 'none';
                this.submitBtn.disabled = false;
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