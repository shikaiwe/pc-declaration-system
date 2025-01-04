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
        this.orderListContainer = null;
        this.workerSelect = null;
        this.initialize();
    }

    handleError(error, message) {
        console.error(message, error);
        this.showMessage(message, 'error');
    }

    async initialize() {
        try {
            this.orderListContainer = this.container.querySelector('.orders-container');
            this.workerSelect = this.container.querySelector('#workerSelect');
            
            if (!this.orderListContainer) {
                throw new Error('订单列表容器未找到');
            }
            
            if (!this.workerSelect) {
                throw new Error('维修人员选择框未找到');
            }

            await this.loadOrders();
                await this.loadWorkers();
        } catch (error) {
            this.handleError(error, '页面初始化失败');
        }
    }

    formatDate(dateString) {
        try {
            if (!dateString) return '时间未知';
            const date = new Date(dateString.replace(/-/g, '/'));
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
            this.handleError(error, '日期格式化失败');
            return '时间格式错误';
        }
    }

    // ... 其他现有方法保持不变 ...
}

export default AssignOrder;