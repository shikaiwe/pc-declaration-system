/**
 * 虚拟书架模块
 * 提供虚拟滚动、分页加载和内存管理功能
 * 
 * @module VirtualBookshelf
 * @version 1.0.0
 */

/**
 * 虚拟书架类
 */
class VirtualBookshelf {
    /**
     * 创建虚拟书架实例
     * @param {HTMLElement} container - 容器元素
     * @param {Object} options - 配置选项
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            itemWidth: options.itemWidth || 180,
            itemHeight: options.itemHeight || 280,
            gap: options.gap || 20,
            buffer: options.buffer || 5,
            pageSize: options.pageSize || 20,
            ...options
        };
        
        this.books = [];
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.scrollTop = 0;
        this.columns = 4;
        this.totalHeight = 0;
        
        this.viewport = null;
        this.content = null;
        this.sentinel = null;
        this.observer = null;
        
        this.loading = false;
        this.hasMore = true;
        this.currentPage = 0;
        
        this.onLoadMore = null;
        this.onBookClick = null;
        this.onBookDelete = null;
        
        this.init();
    }

    /**
     * 初始化虚拟书架
     */
    init() {
        this.createViewport();
        this.bindEvents();
        this.setupIntersectionObserver();
    }

    /**
     * 创建视口容器
     * @private
     */
    createViewport() {
        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-bookshelf-viewport';
        this.viewport.style.cssText = `
            overflow-y: auto;
            height: 100%;
            position: relative;
            -webkit-overflow-scrolling: touch;
        `;
        
        this.content = document.createElement('div');
        this.content.className = 'virtual-bookshelf-content';
        this.content.style.cssText = `
            position: relative;
            min-height: 100%;
        `;
        
        // 创建加载指示器
        this.loader = document.createElement('div');
        this.loader.className = 'bookshelf-loader';
        this.loader.innerHTML = `
            <div class="loader-spinner"></div>
            <span>加载中...</span>
        `;
        this.loader.style.display = 'none';
        
        // 创建空状态
        this.emptyState = document.createElement('div');
        this.emptyState.className = 'bookshelf-empty';
        this.emptyState.innerHTML = `
            <div class="empty-icon">📚</div>
            <div class="empty-text">书架空空如也</div>
            <div class="empty-hint">添加一些书籍开始阅读吧</div>
        `;
        this.emptyState.style.display = 'none';
        
        // 创建滚动哨兵
        this.sentinel = document.createElement('div');
        this.sentinel.className = 'scroll-sentinel';
        this.sentinel.style.cssText = `
            height: 1px;
            width: 100%;
            position: absolute;
            bottom: 0;
        `;
        
        this.content.appendChild(this.emptyState);
        this.content.appendChild(this.sentinel);
        this.viewport.appendChild(this.content);
        this.viewport.appendChild(this.loader);
        this.container.appendChild(this.viewport);
    }

    /**
     * 绑定事件
     * @private
     */
    bindEvents() {
        // 滚动事件
        this.viewport.addEventListener('scroll', () => {
            this.onScroll();
        });
        
        // 窗口大小变化
        window.addEventListener('resize', () => {
            this.onResize();
        });
    }

    /**
     * 设置交叉观察器
     * @private
     */
    setupIntersectionObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.hasMore && !this.loading) {
                    this.loadMore();
                }
            });
        }, {
            root: this.viewport,
            rootMargin: '200px'
        });
        
        this.observer.observe(this.sentinel);
    }

    /**
     * 设置书籍数据
     * @param {Array} books - 书籍数组
     */
    setBooks(books) {
        this.books = books;
        this.hasMore = false;
        this.calculateLayout();
        this.render();
    }

    /**
     * 添加书籍
     * @param {Array} newBooks - 新书籍数组
     */
    addBooks(newBooks) {
        this.books = [...this.books, ...newBooks];
        this.calculateLayout();
        this.render();
    }

    /**
     * 计算布局
     * @private
     */
    calculateLayout() {
        const viewportWidth = this.viewport.clientWidth;
        
        // 计算列数
        this.columns = Math.floor(
            (viewportWidth + this.options.gap) / 
            (this.options.itemWidth + this.options.gap)
        );
        this.columns = Math.max(1, this.columns);
        
        // 计算总高度
        const rows = Math.ceil(this.books.length / this.columns);
        this.totalHeight = rows * (this.options.itemHeight + this.options.gap) + 100;
        
        this.content.style.height = `${this.totalHeight}px`;
    }

    /**
     * 滚动处理
     * @private
     */
    onScroll() {
        this.scrollTop = this.viewport.scrollTop;
        this.render();
    }

    /**
     * 大小变化处理
     * @private
     */
    onResize() {
        this.calculateLayout();
        this.render();
    }

    /**
     * 渲染可见项
     * @private
     */
    render() {
        if (this.books.length === 0) {
            this.emptyState.style.display = 'flex';
            return;
        }
        
        this.emptyState.style.display = 'none';
        
        const viewportHeight = this.viewport.clientHeight;
        const scrollTop = this.scrollTop;
        
        // 计算可见行范围
        const startRow = Math.floor(scrollTop / (this.options.itemHeight + this.options.gap));
        const endRow = Math.ceil((scrollTop + viewportHeight) / (this.options.itemHeight + this.options.gap));
        
        // 添加缓冲区
        const bufferedStartRow = Math.max(0, startRow - this.options.buffer);
        const bufferedEndRow = endRow + this.options.buffer;
        
        // 计算索引范围
        const start = bufferedStartRow * this.columns;
        const end = Math.min(this.books.length, bufferedEndRow * this.columns);
        
        // 检查是否需要更新
        if (start !== this.visibleStart || end !== this.visibleEnd) {
            this.visibleStart = start;
            this.visibleEnd = end;
            this.renderItems();
        }
    }

    /**
     * 渲染书籍卡片
     * @private
     */
    renderItems() {
        // 移除旧卡片
        const oldCards = this.content.querySelectorAll('.book-card');
        oldCards.forEach(card => card.remove());
        
        // 创建文档片段
        const fragment = document.createDocumentFragment();
        
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const book = this.books[i];
            const card = this.createBookCard(book, i);
            fragment.appendChild(card);
        }
        
        this.content.insertBefore(fragment, this.sentinel);
    }

    /**
     * 创建书籍卡片
     * @param {Object} book - 书籍数据
     * @param {number} index - 索引
     * @returns {HTMLElement}
     * @private
     */
    createBookCard(book, index) {
        const card = document.createElement('div');
        card.className = 'book-card';
        card.dataset.index = index;
        card.dataset.key = book.key;
        
        // 计算位置
        const row = Math.floor(index / this.columns);
        const col = index % this.columns;
        
        const x = col * (this.options.itemWidth + this.options.gap);
        const y = row * (this.options.itemHeight + this.options.gap);
        
        card.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${this.options.itemWidth}px;
            height: ${this.options.itemHeight}px;
            transition: transform 0.2s ease;
        `;
        
        // 计算进度
        const progress = book.progress || 0;
        
        // 卡片内容
        card.innerHTML = `
            <div class="book-cover">
                ${book.cover ? 
                    `<img src="${book.cover}" alt="${book.title}" loading="lazy">` :
                    `<div class="book-cover-placeholder">
                        <span class="book-cover-title">${book.title}</span>
                    </div>`
                }
                ${progress > 0 ? `<div class="book-progress-bar" style="width: ${progress}%"></div>` : ''}
            </div>
            <div class="book-info">
                <div class="book-title" title="${book.title}">${book.title}</div>
                <div class="book-author" title="${book.author || ''}">${book.author || ''}</div>
            </div>
            ${progress > 0 ? `<div class="book-progress">${progress}%</div>` : ''}
            <button class="book-delete-btn" title="删除">×</button>
        `;
        
        // 点击事件
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('book-delete-btn')) {
                this.onBookClick?.(book, index);
            }
        });
        
        // 删除按钮
        card.querySelector('.book-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.onBookDelete?.(book, index);
        });
        
        // 悬停效果
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-5px)';
            card.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        });
        
        return card;
    }

    /**
     * 加载更多
     */
    async loadMore() {
        if (this.loading || !this.hasMore) return;
        
        this.loading = true;
        this.showLoader();
        
        try {
            const newBooks = await this.onLoadMore?.({
                page: this.currentPage,
                size: this.options.pageSize
            });
            
            if (newBooks && newBooks.length > 0) {
                this.books = [...this.books, ...newBooks];
                this.currentPage++;
                
                if (newBooks.length < this.options.pageSize) {
                    this.hasMore = false;
                }
                
                this.calculateLayout();
                this.render();
            } else {
                this.hasMore = false;
            }
        } catch (e) {
            console.error('加载更多失败:', e);
        } finally {
            this.loading = false;
            this.hideLoader();
        }
    }

    /**
     * 显示加载指示器
     */
    showLoader() {
        this.loader.style.display = 'flex';
    }

    /**
     * 隐藏加载指示器
     */
    hideLoader() {
        this.loader.style.display = 'none';
    }

    /**
     * 显示空状态
     */
    showEmpty() {
        this.emptyState.style.display = 'flex';
    }

    /**
     * 隐藏空状态
     */
    hideEmpty() {
        this.emptyState.style.display = 'none';
    }

    /**
     * 刷新书架
     */
    refresh() {
        this.calculateLayout();
        this.render();
    }

    /**
     * 重置书架
     */
    reset() {
        this.books = [];
        this.currentPage = 0;
        this.hasMore = true;
        this.loading = false;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.scrollTop = 0;
        
        this.content.querySelectorAll('.book-card').forEach(card => card.remove());
        this.calculateLayout();
        this.showEmpty();
    }

    /**
     * 删除书籍
     * @param {number} index - 书籍索引
     */
    removeBook(index) {
        this.books.splice(index, 1);
        this.calculateLayout();
        this.render();
    }

    /**
     * 更新书籍
     * @param {number} index - 书籍索引
     * @param {Object} updates - 更新内容
     */
    updateBook(index, updates) {
        this.books[index] = { ...this.books[index], ...updates };
        this.render();
    }

    /**
     * 滚动到指定书籍
     * @param {number} index - 书籍索引
     */
    scrollToBook(index) {
        const row = Math.floor(index / this.columns);
        const y = row * (this.options.itemHeight + this.options.gap);
        
        this.viewport.scrollTo({
            top: y,
            behavior: 'smooth'
        });
    }

    /**
     * 获取书籍数量
     * @returns {number}
     */
    getCount() {
        return this.books.length;
    }

    /**
     * 获取所有书籍
     * @returns {Array}
     */
    getBooks() {
        return [...this.books];
    }

    /**
     * 销毁
     */
    destroy() {
        this.observer?.disconnect();
        window.removeEventListener('resize', this.onResize);
        
        if (this.viewport && this.viewport.parentNode) {
            this.viewport.parentNode.removeChild(this.viewport);
        }
    }
}

/**
 * 书架内存管理器
 */
class BookshelfMemoryManager {
    /**
     * 创建内存管理器实例
     * @param {number} maxCacheSize - 最大缓存数量
     */
    constructor(maxCacheSize = 50) {
        this.coverCache = new Map();
        this.bookCache = new Map();
        this.maxCacheSize = maxCacheSize;
    }

    /**
     * 获取封面（带缓存）
     * @param {string} bookKey - 书籍标识
     * @param {string} coverUrl - 封面 URL
     * @returns {Promise<string>}
     */
    async getCover(bookKey, coverUrl) {
        if (this.coverCache.has(bookKey)) {
            // LRU: 移到最后
            const value = this.coverCache.get(bookKey);
            this.coverCache.delete(bookKey);
            this.coverCache.set(bookKey, value);
            return value;
        }
        
        // 加载封面
        const response = await fetch(coverUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // 检查缓存大小
        if (this.coverCache.size >= this.maxCacheSize) {
            // 删除最旧的
            const firstKey = this.coverCache.keys().next().value;
            const oldUrl = this.coverCache.get(firstKey);
            URL.revokeObjectURL(oldUrl);
            this.coverCache.delete(firstKey);
        }
        
        this.coverCache.set(bookKey, url);
        return url;
    }

    /**
     * 清理缓存
     */
    clearCache() {
        for (const url of this.coverCache.values()) {
            URL.revokeObjectURL(url);
        }
        this.coverCache.clear();
        this.bookCache.clear();
    }

    /**
     * 获取内存使用情况
     * @returns {Object}
     */
    getMemoryUsage() {
        return {
            coverCacheSize: this.coverCache.size,
            bookCacheSize: this.bookCache.size,
            estimatedMemory: this.coverCache.size * 100 * 1024
        };
    }
}

export {
    VirtualBookshelf,
    BookshelfMemoryManager
};

export default VirtualBookshelf;
