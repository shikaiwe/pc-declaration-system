/**
 * 订单评价模块
 * 实现订单评价功能，包括星级评分和评价提交
 */

// 配置常量
const CONFIG = {
    baseUrl: 'https://gznfpc.cn/api',
    ratingDescriptions: {
        1: '非常不满意',
        2: '不满意',
        3: '一般',
        4: '满意',
        5: '非常满意'
    }
};

// API 端点
const API_URLS = {
    SUBMIT_RATING: `${CONFIG.baseUrl}/dashboard/submit_rating/`
};

/**
 * 订单评价类
 */
class OrderRating {
    constructor() {
        this.reportId = null;
        this.rating = 0;
        this.comment = '';
        this.callbackFn = null;
        this.overlayElement = null;
        this.initialized = false;
        this.retryLimit = 3;
        this.retryCount = 0;
        this.eventListenersAdded = false;
    }

    /**
     * 初始化评价组件
     */
    init() {
        if (this.initialized) return;

        // 创建DOM元素
        this.createRatingDOM();

        // 添加事件监听
        this.addEventListeners();

        this.initialized = true;
    }

    /**
     * 创建评价组件的DOM结构
     */
    createRatingDOM() {
        // 创建评价弹窗的容器
        const overlay = document.createElement('div');
        overlay.className = 'rating-overlay';
        overlay.id = 'ratingOverlay';

        overlay.innerHTML = `
            <div class="rating-container">
                <div class="rating-close" id="ratingClose"></div>
                <div class="rating-header">
                    <h3>订单评价</h3>
                </div>
                <div class="rating-stars" id="ratingStars">
                    <div class="star" data-value="1">★</div>
                    <div class="star" data-value="2">★</div>
                    <div class="star" data-value="3">★</div>
                    <div class="star" data-value="4">★</div>
                    <div class="star" data-value="5">★</div>
                </div>
                <div class="rating-description" id="ratingDescription"></div>
                <div class="rating-comment">
                    <textarea id="ratingComment" placeholder="请输入您的评价内容（可选）"></textarea>
                </div>
                <div class="rating-footer">
                    <button class="rating-button rating-button-cancel" id="ratingCancel">取消</button>
                    <button class="rating-button rating-button-submit" id="ratingSubmit" disabled>提交评价</button>
                </div>
            </div>
        `;

        // 添加到文档
        document.body.appendChild(overlay);
        this.overlayElement = overlay;
    }

    /**
     * 添加事件监听
     */
    addEventListeners() {
        // 如果已经添加过事件监听器，则不再重复添加
        if (this.eventListenersAdded) {
            return;
        }
        
        const stars = document.querySelectorAll('#ratingStars .star');
        const starsContainer = document.getElementById('ratingStars');
        const description = document.getElementById('ratingDescription');
        const commentInput = document.getElementById('ratingComment');
        const submitButton = document.getElementById('ratingSubmit');
        const cancelButton = document.getElementById('ratingCancel');
        const closeButton = document.getElementById('ratingClose');

        // 星星悬浮效果
        stars.forEach(star => {
            star.addEventListener('mouseover', (e) => {
                const value = parseInt(star.getAttribute('data-value'));
                starsContainer.className = 'rating-stars hover-' + value;
                description.textContent = CONFIG.ratingDescriptions[value];
            });
        });

        // 鼠标移出星星容器时，恢复已选择的评分
        starsContainer.addEventListener('mouseleave', (e) => {
            starsContainer.className = 'rating-stars' + (this.rating ? ` selected-${this.rating}` : '');
            description.textContent = this.rating ? CONFIG.ratingDescriptions[this.rating] : '';
        });

        // 点击选择评分
        stars.forEach(star => {
            star.addEventListener('click', (e) => {
                const value = parseInt(star.getAttribute('data-value'));
                this.setRating(value);
                submitButton.disabled = false;
            });
        });

        // 评论输入
        commentInput.addEventListener('input', (e) => {
            this.comment = e.target.value.trim();
        });

        // 提交评价
        submitButton.addEventListener('click', (e) => {
            this.submitRating();
        });

        // 取消按钮
        cancelButton.addEventListener('click', (e) => {
            this.hideRating();
        });

        // 关闭按钮
        closeButton.addEventListener('click', (e) => {
            this.hideRating();
        });

        // 点击遮罩层关闭
        this.overlayElement.addEventListener('click', (e) => {
            if (e.target === this.overlayElement) {
                this.hideRating();
            }
        });
        
        // 标记事件监听器已添加
        this.eventListenersAdded = true;
    }

    /**
     * 设置评分值
     * @param {number} value 评分值（1-5）
     */
    setRating(value) {
        this.rating = value;
        const starsContainer = document.getElementById('ratingStars');
        const description = document.getElementById('ratingDescription');

        starsContainer.className = 'rating-stars selected-' + value;
        description.textContent = CONFIG.ratingDescriptions[value];
    }

    /**
     * 显示评价弹窗
     * @param {string} reportId 订单ID
     * @param {function} callback 评价提交后的回调函数
     */
    showRating(reportId, callback) {
        if (!this.initialized) {
            this.init();
        }

        // 记录订单ID和回调函数
        this.reportId = reportId;
        this.callbackFn = callback;

        // 重置表单状态
        this.resetForm();

        // 显示弹窗
        this.overlayElement.classList.add('active');
    }

    /**
     * 隐藏评价弹窗
     */
    hideRating() {
        if (this.overlayElement) {
            this.overlayElement.classList.remove('active');
        }
    }

    /**
     * 重置表单
     */
    resetForm() {
        this.rating = 0;
        this.comment = '';

        const starsContainer = document.getElementById('ratingStars');
        const description = document.getElementById('ratingDescription');
        const commentInput = document.getElementById('ratingComment');
        const submitButton = document.getElementById('ratingSubmit');

        starsContainer.className = 'rating-stars';
        description.textContent = '';
        commentInput.value = '';
        submitButton.disabled = true;

        this.retryCount = 0;
    }

    /**
     * 提交评价
     */
    submitRating() {
        if (!this.reportId || !this.rating) {
            this.showMessage('请选择评分');
            return;
        }

        const submitButton = document.getElementById('ratingSubmit');
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';

        // 评价数据
        const ratingData = {
            reportId: this.reportId,
            rating: this.rating,
            comment: this.comment
        };

        // 发送评价请求
        fetch(API_URLS.SUBMIT_RATING, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(ratingData),
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === 'Success') {
                    this.showMessage('评价提交成功');
                    this.hideRating();

                    // 执行回调函数，完成结单操作
                    if (typeof this.callbackFn === 'function') {
                        this.callbackFn();
                    }
                } else {
                    // 处理失败情况，可能是会话过期
                    if (data.message === 'Session has expired' ||
                        data.message === 'Invalid session' ||
                        data.message === 'No sessionid cookie') {
                        this.handleSessionError(data.message);
                    } else {
                        throw new Error(data.message || '提交失败');
                    }
                }
            })
            .catch(error => {
                console.error('提交评价失败:', error);

                // 重试逻辑
                if (this.retryCount < this.retryLimit) {
                    this.retryCount++;
                    this.showMessage(`提交失败，正在重试 (${this.retryCount}/${this.retryLimit})...`);
                    setTimeout(() => this.submitRating(), 1000);
                } else {
                    this.showMessage('评价提交失败，请稍后再试');
                    submitButton.textContent = '提交评价';
                    submitButton.disabled = false;
                }
            });
    }

    /**
     * 显示消息
     * @param {string} message 消息内容
     */
    showMessage(message) {
        // 如果系统中有消息展示组件，使用它
        if (window.utils && window.utils.ui && typeof window.utils.ui.showMessage === 'function') {
            window.utils.ui.showMessage(message);
        } else {
            alert(message);
        }
    }

    /**
     * 处理会话错误
     * @param {string} message 错误消息
     */
    handleSessionError(message) {
        // 如果系统中有会话错误处理，使用它
        if (window.auth && typeof window.auth.handleSessionError === 'function') {
            window.auth.handleSessionError(message);
        } else {
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
                    errorMessage = message || '发生未知错误，请重新登录';
            }
            this.showMessage(errorMessage);
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    }
}

// 将OrderRating类导出为默认导出
export default OrderRating;

// 同时将其添加到全局对象，方便非模块脚本访问
window.OrderRating = OrderRating;