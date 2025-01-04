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
            }

            /* 通用样式继续 */
            .assign-order-modal-header {
                margin-bottom: 20px;
                text-align: left;
            }

            .assign-order-modal-title {
                font-size: 18px;
                margin: 0 0 8px 0;
                color: #333;
            }

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

            /* 状态标签样式 */
            .status-badge {
                display: inline-block;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 500;
                text-align: center;
            }

            .status-badge.status-pending {
                background-color: #fff3e0;
                color: #ef6c00;
            }

            .status-badge.status-allocated {
                background-color: #e8f5e9;
                color: #2e7d32;
            }

            .status-badge.status-completed {
                background-color: #e3f2fd;
                color: #1976d2;
            }

            .status-badge.status-cancelled {
                background-color: #ffebee;
                color: #d32f2f;
            }

            .status-badge.status-unknown {
                background-color: #f5f5f5;
                color: #757575;
            }

            /* 订单卡片中的状态样式 */
            .order-info p .status-badge {
                margin-left: auto;
                font-size: 0.9em;
            }

            /* 订单详情中的状态样式 */
            .detail-value .status-badge {
                padding: 4px 12px;
                font-size: 12px;
            }

            /* 深色模式适配 */
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

                .status-badge.status-pending {
                    background-color: rgba(239, 108, 0, 0.15);
                    color: #ffb74d;
                }
                
                .status-badge.status-allocated {
                    background-color: rgba(46, 125, 50, 0.15);
                    color: #81c784;
                }
                
                .status-badge.status-completed {
                    background-color: rgba(25, 118, 210, 0.15);
                    color: #64b5f6;
                }
                
                .status-badge.status-cancelled {
                    background-color: rgba(211, 47, 47, 0.15);
                    color: #e57373;
                }
                
                .status-badge.status-unknown {
                    background-color: rgba(117, 117, 117, 0.15);
                    color: #bdbdbd;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 渲染订单列表
    renderOrders(orders) {
        const listContainer = this.container.querySelector('#assignOrderList');
        if (!orders || orders.length === 0) {
            listContainer.innerHTML = `
                <div class="no-orders">
                    <i>📝</i>
                    <p>暂无待分配订单</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = orders.map(order => {
            const statusInfo = ORDER_STATUS[order.status] || ORDER_STATUS['0'];
            return `
                <div class="order-card">
                    <div class="order-info">
                        <p>
                            <strong>订单编号：</strong>
                            ${order.reportId}
                        </p>
                        <p>
                            <strong>手机号码：</strong>
                            ${order.userPhoneNumber}
                        </p>
                        <p>
                            <strong>状态：</strong>
                            <span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>
                        </p>
                        <p>
                            <strong>地址：</strong>
                            ${order.address}
                        </p>
                        <p>
                            <strong>问题：</strong>
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
                    </div>
                    ${order.status === '0' ? `
                        <button class="assign-btn" onclick="window.assignOrderInstance.showAssignModal('${order.reportId}')">
                            分配订单
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // ... existing code ...
}