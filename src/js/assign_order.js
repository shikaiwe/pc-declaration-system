// 常量配置
const API_URLS = {
    GET_REPORT_OF_SAME_DAY: 'https://gznfpc.cn/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://gznfpc.cn/api/dashboard/today_workers/',
    ASSIGN_ORDER: 'https://gznfpc.cn/api/dashboard/assign_order/'
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
    ASSIGN_FAILED: '分配失败，请重试',
    NO_WORKER_SELECTED: '请至少选择一名维修人员',
    MAX_WORKERS_EXCEEDED: '单个订单最多分配5名维修人员',
    DUPLICATE_ASSIGNMENT: '存在重复分配的维修人员'
};

// 业务规则配置
const BUSINESS_RULES = {
    MAX_WORKERS_PER_ORDER: 5
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
        this.selectedWorkers = new Set();
        this.workersData = [];
        this.init();
    }

    /**
     * 初始化方法
     */
    async init() {
        // 确保 CSRF Token 已加载
        if (typeof CSRF !== 'undefined') {
            await CSRF.ensureToken();
        }

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
                            <p class="assign-order-modal-subtitle">请为此订单选择维修人员（可多选，最多5人）</p>
                            <div class="selected-count" id="selectedCount">已选择: 0 人</div>
                        </div>
                        <div class="assign-order-modal-body">
                            <div class="worker-search-container">
                                <input type="text" class="worker-search-input" id="workerSearchInput" placeholder="搜索维修人员...">
                                <span class="worker-search-icon">
                                    <span class="iconify" data-icon="mdi:magnify"></span>
                                </span>
                            </div>
                            <div class="worker-batch-actions">
                                <button class="batch-action-btn" id="selectAllBtn">全选</button>
                                <button class="batch-action-btn" id="deselectAllBtn">清空</button>
                            </div>
                            <div class="selected-workers-container" id="selectedWorkersContainer">
                                <div class="selected-workers-label">已选人员：</div>
                                <div class="selected-workers-tags" id="selectedWorkersTags"></div>
                            </div>
                            <div class="assign-order-workers-list" id="workersList">
                                <div class="loading-workers">加载中...</div>
                            </div>
                        </div>
                        <div class="assign-order-modal-footer">
                            <button class="assign-order-btn assign-order-btn-cancel">取消</button>
                            <button class="assign-order-btn assign-order-btn-confirm" id="confirmAssignBtn" disabled>确认分配</button>
                        </div>
                    </div>
                </div>
                <div class="assign-order-message"></div>
                <div class="confirm-dialog-overlay" id="confirmDialogOverlay">
                    <div class="confirm-dialog">
                        <div class="confirm-dialog-header">
                            <h4 class="confirm-dialog-title">确认分配</h4>
                        </div>
                        <div class="confirm-dialog-body">
                            <div class="confirm-dialog-order-info" id="confirmOrderInfo"></div>
                            <div class="confirm-dialog-workers-info" id="confirmWorkersInfo"></div>
                        </div>
                        <div class="confirm-dialog-footer">
                            <button class="confirm-dialog-btn cancel" id="confirmDialogCancel">取消</button>
                            <button class="confirm-dialog-btn confirm" id="confirmDialogConfirm">确认分配</button>
                        </div>
                    </div>
                </div>
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

            /* 多选维修人员列表样式 */
            .assign-order-workers-list {
                max-height: 400px;
                overflow-y: auto;
                padding: 10px;
            }

            .assign-order-workers-list::-webkit-scrollbar {
                width: 6px;
            }

            .assign-order-workers-list::-webkit-scrollbar-thumb {
                background: #ccc;
                border-radius: 3px;
            }

            .worker-item {
                display: flex;
                align-items: center;
                padding: 12px 15px;
                margin-bottom: 8px;
                background: white;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .worker-item:hover {
                border-color: #2196F3;
                background: #f5f9ff;
            }

            .worker-item.selected {
                border-color: #2196F3;
                background: #e3f2fd;
            }

            .worker-checkbox {
                width: 20px;
                height: 20px;
                border: 2px solid #999;
                border-radius: 4px;
                margin-right: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }

            .worker-item.selected .worker-checkbox {
                background: #2196F3;
                border-color: #2196F3;
            }

            .worker-checkbox::after {
                content: '✓';
                color: white;
                font-size: 14px;
                opacity: 0;
            }

            .worker-item.selected .worker-checkbox::after {
                opacity: 1;
            }

            .worker-name {
                flex: 1;
                font-size: 15px;
                color: #333;
                font-weight: 500;
            }

            .worker-assignments {
                font-size: 12px;
                color: #999;
                margin-left: 8px;
            }

            /* 搜索框样式 */
            .worker-search-container {
                position: relative;
                margin-bottom: 12px;
            }

            .worker-search-input {
                width: 100%;
                padding: 10px 12px 10px 36px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 14px;
                transition: all 0.2s ease;
                box-sizing: border-box;
            }

            .worker-search-input:focus {
                outline: none;
                border-color: #2196F3;
                box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
            }

            .worker-search-icon {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: #999;
                font-size: 18px;
            }

            /* 批量操作按钮 */
            .worker-batch-actions {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
            }

            .batch-action-btn {
                flex: 1;
                padding: 8px 12px;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                background: #f5f5f5;
                color: #666;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .batch-action-btn:hover {
                background: #e0e0e0;
                border-color: #ccc;
            }

            .batch-action-btn:active {
                transform: scale(0.98);
            }

            /* 已选人员展示 */
            .selected-workers-container {
                display: none;
                margin-bottom: 12px;
                padding: 10px;
                background: #f5f9ff;
                border-radius: 8px;
                border: 1px solid #bbdefb;
            }

            .selected-workers-container.has-selected {
                display: block;
            }

            .selected-workers-label {
                font-size: 12px;
                color: #1976D2;
                margin-bottom: 8px;
                font-weight: 500;
            }

            .selected-workers-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }

            .worker-tag {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 10px;
                background: #2196F3;
                color: white;
                border-radius: 16px;
                font-size: 12px;
                font-weight: 500;
            }

            .worker-tag-remove {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 14px;
                height: 14px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                cursor: pointer;
                transition: background 0.2s ease;
            }

            .worker-tag-remove:hover {
                background: rgba(255, 255, 255, 0.5);
            }

            /* 确认对话框 */
            .confirm-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 1100;
            }

            .confirm-dialog-overlay.active {
                display: flex;
            }

            .confirm-dialog {
                background: white;
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            }

            .confirm-dialog-header {
                margin-bottom: 16px;
            }

            .confirm-dialog-title {
                font-size: 18px;
                color: #333;
                margin: 0;
            }

            .confirm-dialog-body {
                margin-bottom: 20px;
            }

            .confirm-dialog-order-info {
                background: #f5f5f5;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 12px;
                font-size: 13px;
                color: #666;
            }

            .confirm-dialog-order-info p {
                margin: 4px 0;
            }

            .confirm-dialog-workers-info {
                padding: 12px;
                background: #e3f2fd;
                border-radius: 8px;
                border: 1px solid #bbdefb;
            }

            .confirm-dialog-workers-title {
                font-size: 13px;
                color: #1976D2;
                margin-bottom: 8px;
                font-weight: 500;
            }

            .confirm-dialog-workers-list {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }

            .confirm-dialog-worker-tag {
                padding: 4px 12px;
                background: #2196F3;
                color: white;
                border-radius: 16px;
                font-size: 13px;
            }

            .confirm-dialog-footer {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }

            .confirm-dialog-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .confirm-dialog-btn.cancel {
                background: #f5f5f5;
                color: #666;
            }

            .confirm-dialog-btn.cancel:hover {
                background: #e0e0e0;
            }

            .confirm-dialog-btn.confirm {
                background: #2196F3;
                color: white;
            }

            .confirm-dialog-btn.confirm:hover {
                background: #1976D2;
            }

            .selected-count {
                text-align: center;
                margin-top: 10px;
                padding: 8px;
                background: #f0f0f0;
                border-radius: 6px;
                font-size: 14px;
                color: #666;
                font-weight: 500;
            }

            .loading-workers {
                text-align: center;
                padding: 40px;
                color: #999;
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
                    max-width: 480px;
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

                .assign-order-btn {
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-size: 15px;
                }

                .worker-item {
                    padding: 14px 16px;
                }

                .worker-name {
                    font-size: 16px;
                }
            }

            /* 通用样式继续 */
            .assign-order-modal-subtitle {
                color: #666;
                font-size: 14px;
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

            .assign-order-btn-confirm:disabled {
                background-color: #bdbdbd;
                color: #9e9e9e;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
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
                .worker-item {
                    background: #444;
                    border-color: #555;
                }
                .worker-item:hover {
                    background: #3a3a3a;
                    border-color: #2196F3;
                }
                .worker-item.selected {
                    background: #1a3a5f;
                    border-color: #2196F3;
                }
                .worker-name {
                    color: #fff;
                }
                .worker-checkbox {
                    border-color: #777;
                }
                .selected-count {
                    background: #444;
                    color: #ccc;
                }
                .assign-order-btn-cancel {
                    background-color: #444;
                    color: #fff;
                }
                .assign-order-btn-cancel:hover {
                    background-color: #555;
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

        // 维修人员列表点击事件（多选）
        this.container.addEventListener('click', (e) => {
            const workerItem = e.target.closest('.worker-item');
            if (workerItem) {
                e.preventDefault();
                this._handleWorkerItemClick(workerItem);
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
                this._showConfirmDialog();
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

        // 搜索功能
        const searchInput = this.container.querySelector('#workerSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this._handleWorkerSearch(e.target.value);
            });
        }

        // 全选按钮
        const selectAllBtn = this.container.querySelector('#selectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                this._handleSelectAll();
            });
        }

        // 清空按钮
        const deselectAllBtn = this.container.querySelector('#deselectAllBtn');
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => {
                this._handleDeselectAll();
            });
        }

        // 确认对话框事件
        this._bindConfirmDialogEvents();

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
     * 绑定确认对话框事件
     * @private
     */
    _bindConfirmDialogEvents() {
        const confirmDialogOverlay = this.container.querySelector('#confirmDialogOverlay');
        const confirmDialogCancel = this.container.querySelector('#confirmDialogCancel');
        const confirmDialogConfirm = this.container.querySelector('#confirmDialogConfirm');

        if (confirmDialogCancel) {
            confirmDialogCancel.addEventListener('click', () => {
                this._hideConfirmDialog();
            });
        }

        if (confirmDialogConfirm) {
            confirmDialogConfirm.addEventListener('click', async() => {
                this._hideConfirmDialog();
                await this._handleConfirmAssign();
            });
        }

        if (confirmDialogOverlay) {
            confirmDialogOverlay.addEventListener('click', (e) => {
                if (e.target === confirmDialogOverlay) {
                    this._hideConfirmDialog();
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
                this.handleError(new Error('订单ID缺失'), '无法处理订单');
                return;
            }

            const overlay = this.container.querySelector('#assignOrderModalOverlay');
            const selection = this.container.querySelector('.assign-order-worker-selection');
            const workersList = this.container.querySelector('#workersList');

            if (!overlay || !selection || !workersList) {
                this.handleError(new Error('DOM元素缺失'), '页面初始化失败');
                return;
            }

            this.currentReportId = reportId;
            this.selectedWorkers.clear();
            this._updateSelectedCount();
            
            overlay.style.display = 'flex';
            overlay.classList.add('active');
            selection.style.display = 'block';

            if (!this.workersLoaded || this.workersData.length === 0) {
                await this.loadWorkers();
            } else {
                this._renderWorkersList();
            }
        } catch (error) {
            this.handleError(error, '处理分配按钮点击失败');
        }
    }

    /**
     * 处理维修人员项点击（多选）
     * @private
     */
    _handleWorkerItemClick(workerItem) {
        const workerName = workerItem.dataset.workerName;
        if (!workerName) return;

        if (this.selectedWorkers.has(workerName)) {
            this.selectedWorkers.delete(workerName);
            workerItem.classList.remove('selected');
        } else {
            if (this.selectedWorkers.size >= BUSINESS_RULES.MAX_WORKERS_PER_ORDER) {
                this.showMessage(ERROR_MESSAGES.MAX_WORKERS_EXCEEDED, 'error');
                return;
            }
            this.selectedWorkers.add(workerName);
            workerItem.classList.add('selected');
        }

        this._updateSelectedCount();
    }

    /**
     * 更新已选择数量显示
     * @private
     */
    _updateSelectedCount() {
        const countElement = this.container.querySelector('#selectedCount');
        if (countElement) {
            countElement.textContent = `已选择: ${this.selectedWorkers.size} 人`;
        }

        // 更新确认按钮的禁用状态
        const confirmBtn = this.container.querySelector('.assign-order-btn-confirm');
        if (confirmBtn) {
            confirmBtn.disabled = this.selectedWorkers.size === 0;
        }

        // 更新已选人员展示
        this._updateSelectedWorkersDisplay();
    }

    /**
     * 更新已选人员展示
     * @private
     */
    _updateSelectedWorkersDisplay() {
        const container = this.container.querySelector('#selectedWorkersContainer');
        const tagsContainer = this.container.querySelector('#selectedWorkersTags');
        
        if (!container || !tagsContainer) return;

        if (this.selectedWorkers.size === 0) {
            container.classList.remove('has-selected');
            tagsContainer.innerHTML = '';
            return;
        }

        container.classList.add('has-selected');
        
        const tagsHTML = Array.from(this.selectedWorkers).map(name => `
            <div class="worker-tag" data-worker-name="${name}">
                <span>${name}</span>
                <div class="worker-tag-remove" data-worker-name="${name}">×</div>
            </div>
        `).join('');
        
        tagsContainer.innerHTML = tagsHTML;

        // 绑定移除事件
        tagsContainer.querySelectorAll('.worker-tag-remove').forEach(removeBtn => {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const workerName = removeBtn.dataset.workerName;
                this._removeSelectedWorker(workerName);
            });
        });
    }

    /**
     * 移除已选人员
     * @private
     * @param {string} workerName - 人员名称
     */
    _removeSelectedWorker(workerName) {
        this.selectedWorkers.delete(workerName);
        
        // 更新列表中的选中状态
        const workerItem = this.container.querySelector(`.worker-item[data-worker-name="${workerName}"]`);
        if (workerItem) {
            workerItem.classList.remove('selected');
        }
        
        this._updateSelectedCount();
    }

    /**
     * 处理搜索过滤
     * @private
     * @param {string} keyword - 搜索关键词
     */
    _handleWorkerSearch(keyword) {
        const workersList = this.container.querySelector('#workersList');
        if (!workersList) return;

        const workerItems = workersList.querySelectorAll('.worker-item');
        const normalizedKeyword = keyword.toLowerCase().trim();

        workerItems.forEach(item => {
            const workerName = item.dataset.workerName?.toLowerCase() || '';
            if (workerName.includes(normalizedKeyword)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /**
     * 处理全选
     * @private
     */
    _handleSelectAll() {
        const workersList = this.container.querySelector('#workersList');
        if (!workersList) return;

        const visibleItems = Array.from(workersList.querySelectorAll('.worker-item')).filter(
            item => item.style.display !== 'none'
        );

        // 计算可选数量
        const remainingSlots = BUSINESS_RULES.MAX_WORKERS_PER_ORDER - this.selectedWorkers.size;
        
        if (remainingSlots <= 0) {
            this.showMessage(ERROR_MESSAGES.MAX_WORKERS_EXCEEDED, 'error');
            return;
        }

        // 选择未选中的可见项，最多选择 remainingSlots 个
        let selected = 0;
        visibleItems.forEach(item => {
            if (selected >= remainingSlots) return;
            
            const workerName = item.dataset.workerName;
            if (workerName && !this.selectedWorkers.has(workerName)) {
                this.selectedWorkers.add(workerName);
                item.classList.add('selected');
                selected++;
            }
        });

        this._updateSelectedCount();
        
        if (selected > 0 && this.selectedWorkers.size === BUSINESS_RULES.MAX_WORKERS_PER_ORDER) {
            this.showMessage(`已选择最大人数限制（${BUSINESS_RULES.MAX_WORKERS_PER_ORDER}人）`, 'info');
        }
    }

    /**
     * 处理清空选择
     * @private
     */
    _handleDeselectAll() {
        this.selectedWorkers.clear();
        
        // 清除所有选中状态
        const workerItems = this.container.querySelectorAll('.worker-item.selected');
        workerItems.forEach(item => {
            item.classList.remove('selected');
        });
        
        this._updateSelectedCount();
    }

    /**
     * 显示确认对话框
     * @private
     */
    _showConfirmDialog() {
        if (this.selectedWorkers.size === 0) {
            this.showMessage(ERROR_MESSAGES.NO_WORKER_SELECTED, 'error');
            return;
        }

        const overlay = this.container.querySelector('#confirmDialogOverlay');
        const orderInfoContainer = this.container.querySelector('#confirmOrderInfo');
        const workersInfoContainer = this.container.querySelector('#confirmWorkersInfo');

        if (!overlay || !orderInfoContainer || !workersInfoContainer) return;

        // 获取当前订单信息
        const orderCard = this.container.querySelector(`[data-report-id="${this.currentReportId}"]`)?.closest('.order-card');
        
        if (orderCard) {
            const orderInfo = orderCard.querySelector('.order-info');
            if (orderInfo) {
                const address = orderInfo.querySelector('p:nth-child(5)')?.textContent || '';
                const issue = orderInfo.querySelector('p:nth-child(6)')?.textContent || '';
                
                orderInfoContainer.innerHTML = `
                    <p><strong>订单编号：</strong>${this.currentReportId}</p>
                    <p>${address}</p>
                    <p>${issue}</p>
                `;
            }
        } else {
            orderInfoContainer.innerHTML = `<p><strong>订单编号：</strong>${this.currentReportId}</p>`;
        }

        // 显示已选人员
        const workersList = Array.from(this.selectedWorkers);
        workersInfoContainer.innerHTML = `
            <div class="confirm-dialog-workers-title">将分配给以下 ${workersList.length} 名维修人员：</div>
            <div class="confirm-dialog-workers-list">
                ${workersList.map(name => `<span class="confirm-dialog-worker-tag">${name}</span>`).join('')}
            </div>
        `;

        overlay.classList.add('active');
    }

    /**
     * 隐藏确认对话框
     * @private
     */
    _hideConfirmDialog() {
        const overlay = this.container.querySelector('#confirmDialogOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    /**
     * 处理确认分配
     * @private
     */
    async _handleConfirmAssign() {
        if (this.selectedWorkers.size === 0) {
            this.showMessage(ERROR_MESSAGES.NO_WORKER_SELECTED, 'error');
            return;
        }

        // 防御性验证：确保不超过最大人数限制
        if (this.selectedWorkers.size > BUSINESS_RULES.MAX_WORKERS_PER_ORDER) {
            this.showMessage(ERROR_MESSAGES.MAX_WORKERS_EXCEEDED, 'error');
            return;
        }

        const workerNames = Array.from(this.selectedWorkers);
        await this.assignOrder(this.currentReportId, workerNames);
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
            this.handleError(error, '加载订单失败');
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
            this.handleError(new Error('订单列表容器未找到'), '页面初始化失败');
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
            const workerNames = this._parseWorkerNames(order);
            const displayText = workerNames.length > 0 
                ? `已分配给: ${workerNames.join(', ')}` 
                : '无分配人员';
            
            return `
                <div class="assigned-info">
                    <span class="assigned-text">${displayText}</span>
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
     * 解析维修人员姓名（支持数组和字符串）
     * @private
     */
    _parseWorkerNames(order) {
        if (order.workerNames && Array.isArray(order.workerNames)) {
            return order.workerNames.filter(name => name && name !== 'None');
        }
        
        if (order.workerName && order.workerName !== 'None') {
            return order.workerName.split(',').map(name => name.trim()).filter(name => name);
        }
        
        return [];
    }

    /**
     * 显示无订单状态
     */
    showNoOrders() {
        const orderList = this._getOrderListElement();
        if (!orderList) return;

        orderList.innerHTML = `
            <div class="no-orders">
                <i class="no-orders-icon"><span class="iconify" data-icon="mdi:clipboard-list-outline"></span></i>
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
                <i class="error-icon"><span class="iconify" data-icon="mdi:alert-circle-outline"></span></i>
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

        const workersList = this.container.querySelector('#workersList');
        if (!workersList) {
            this.handleError(new Error('维修人员列表容器未找到'), '页面初始化失败');
            return;
        }

        try {
            workersList.innerHTML = '<div class="loading-workers">加载中...</div>';
            const response = await this._fetchWorkers();
            await this._handleWorkersResponse(response, workersList);
        } catch (error) {
            this.handleError(error, '加载维修人员列表失败');
            this._handleWorkerLoadError(workersList);
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
    async _handleWorkersResponse(response, workersList) {
        if (response.message === 'Success' && Array.isArray(response.workers) && response.workers.length > 0) {
            this.workersData = response.workers;
            this._renderWorkersList();
            this.workersLoaded = true;
        } else if (response.message === 'Success') {
            workersList.innerHTML = '<div class="loading-workers">暂无可用维修人员</div>';
        } else {
            this.handleSessionError(response.message);
        }
    }

    /**
     * 渲染维修人员列表（多选）
     * @private
     */
    _renderWorkersList() {
        const workersList = this.container.querySelector('#workersList');
        if (!workersList || this.workersData.length === 0) return;

        const workersHTML = this.workersData.map(worker => {
            const assignments = worker.currentAssignments || 0;
            const assignmentText = assignments > 0 ? `(${assignments}个订单)` : '';
            
            return `
                <div class="worker-item" data-worker-name="${worker.username}">
                    <div class="worker-checkbox"></div>
                    <span class="worker-name">${worker.username}</span>
                    <span class="worker-assignments">${assignmentText}</span>
                </div>
            `;
        }).join('');

        workersList.innerHTML = workersHTML;
    }

    /**
     * 处理维修人员加载错误
     * @private
     */
    _handleWorkerLoadError(workersList) {
        workersList.innerHTML = '<div class="loading-workers">加载失败，请重试</div>';
    }

    /**
     * 分配订单（支持多人员）
     * @param {string} reportId 订单ID
     * @param {Array|string} workerNames 维修人员姓名数组或单个姓名
     */
    async assignOrder(reportId, workerNames) {
        try {
            this.showMessage('正在分配...', 'info');
            
            const response = await this._assignOrderRequest(reportId, workerNames);
            await this._handleAssignResponse(response, reportId, workerNames);
        } catch (error) {
            this.handleError(error, ERROR_MESSAGES.ASSIGN_FAILED);
        }
    }

    /**
     * 发送分配订单请求（支持多人员）
     * @private
     */
    async _assignOrderRequest(reportId, workerNames) {
        const csrfToken = CSRF.getToken();
        
        const requestData = {
            reportId: reportId
        };
        
        // 统一使用 workerNames 字段，单个人员也使用数组格式
        requestData.workerNames = Array.isArray(workerNames) ? workerNames : [workerNames];
        
        return await $.ajax({
            url: API_URLS.ASSIGN_ORDER,
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            data: JSON.stringify(requestData),
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
    async _handleAssignResponse(response, reportId, workerNames) {
        if (response.message === 'Success') {
            const displayNames = Array.isArray(workerNames) ? workerNames : [workerNames];
            await this._updateOrderStatus(reportId, displayNames);
            this.showMessage(`订单已成功分配给 ${displayNames.length} 名维修人员`, 'success');
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
    async _updateOrderStatus(reportId, workerNames) {
        const orderCard = this.container.querySelector(`[data-report-id="${reportId}"]`)?.closest('.order-card');
        if (orderCard) {
            this._updateOrderCardStatus(orderCard, workerNames);
        } else {
            await this.loadOrders();
        }
    }

    /**
     * 更新订单卡片状态
     * @private
     */
    _updateOrderCardStatus(orderCard, workerNames) {
        const orderInfo = orderCard.querySelector('.order-info');
        if (!orderInfo) return;

        const statusElement = orderInfo.querySelector('.status-badge');
        if (statusElement) {
            statusElement.className = 'status-badge status-allocated';
            statusElement.textContent = '已分配';
        }

        const buttonContainer = orderInfo.querySelector('.order-buttons');
        if (buttonContainer) {
            const displayText = workerNames.length > 0 
                ? `已分配给: ${workerNames.join(', ')}` 
                : '无分配人员';
                
            buttonContainer.outerHTML = `
                <div class="assigned-info">
                    <span class="assigned-text">${displayText}</span>
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
            case 'Invalid worker':
                this.showMessage(ERROR_MESSAGES.WORKER_UNAVAILABLE, 'error');
                break;
            case 'Report is already assigned':
                this.showMessage(ERROR_MESSAGES.REPORT_ASSIGNED, 'error');
                this.loadOrders();
                break;
            case 'Duplicate assignment':
                this.showMessage(ERROR_MESSAGES.DUPLICATE_ASSIGNMENT, 'error');
                break;
            case 'Max workers exceeded':
                this.showMessage(ERROR_MESSAGES.MAX_WORKERS_EXCEEDED, 'error');
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
            this.handleError(error, '日期格式化失败');
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
        this.selectedWorkers.clear();
        this.workersData = [];
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