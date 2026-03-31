/**
 * EPUB电子书阅读器模块
 * 提供完整的电子书阅读功能，包括书架管理、阅读控制、进度追踪等
 * 直接从服务器静态目录读取EPUB文件
 */

// 数据库模块引用（延迟加载）
let dbManager = null;
let DatabaseError = null;
let DBErrorType = null;

// 搜索模块引用（延迟加载）
let SearchManager = null;
let ShortcutManager = null;

class EpubReader {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.currentBookKey = null;
        this.books = [];
        this.settings = {
            fontSize: 150,
            theme: 'sepia'
        };
        this.readingProgress = {};
        this.saveProgressTimeout = null;
        // EPUB静态文件目录URL
        this.EPUB_DIR = '/book/';
        // 书籍配置文件URL
        this.BOOKS_CONFIG_URL = '/book/books.json';
        // 日文竖排模式状态
        this.isVerticalMode = false;
        // 书籍元数据缓存
        this.bookMetadata = null;
        // 初始化状态
        this._initialized = false;
        this._initPromise = null;
        // 数据库可用状态
        this._dbAvailable = false;
        // 搜索管理器
        this.searchManager = null;
        // 快捷键管理器
        this.shortcutManager = null;
        // 当前筛选的分类
        this.currentShortcutCategory = 'all';
        // 当前搜索关键词
        this.currentShortcutSearch = '';
        // 搜索高亮相关
        this.searchHighlights = []; // 存储所有高亮标记
        this.currentSearchQuery = ''; // 当前搜索关键词
    }

    /**
     * 加载数据库模块
     * @private
     */
    async _loadDatabaseModule() {
        if (dbManager) return true;
        
        try {
            const module = await import('./database.js');
            dbManager = module.default;
            DatabaseError = module.DatabaseError;
            DBErrorType = module.DBErrorType;
            this._dbAvailable = true;
            return true;
        } catch (e) {
            console.error('数据库模块加载失败，使用 localStorage 降级方案:', e);
            this._dbAvailable = false;
            return false;
        }
    }

    /**
     * 初始化阅读器（异步）
     * 必须在使用阅读器之前调用此方法
     * 使用 Promise 链确保原子性，避免竞态条件
     * @returns {Promise<void>}
     */
    async init() {
        // 如果已经初始化，直接返回
        if (this._initialized) {
            return;
        }
        
        // 如果正在初始化，返回现有的 Promise
        if (!this._initPromise) {
            this._initPromise = this._doInit()
                .then(() => {
                    this._initialized = true;
                })
                .catch((error) => {
                    // 初始化失败，重置状态以便重试
                    this._initialized = false;
                    console.error('阅读器初始化失败:', error);
                    throw error;
                })
                .finally(() => {
                    // 无论成功或失败，都重置 Promise 引用
                    this._initPromise = null;
                });
        }
        
        return this._initPromise;
    }

    /**
     * 执行实际的初始化逻辑
     * @private
     */
    async _doInit() {
        // 加载数据库模块
        await this._loadDatabaseModule();
        
        // 初始化数据库
        await this.initDatabase();
        
        // 加载设置和进度
        await this.loadSettings();
        await this.loadReadingProgress();
        
        // 绑定事件和加载书籍
        this.bindEvents();
        await this.loadBooks();
        this.applyTheme(this.settings.theme);
        
        // 初始化快捷键管理器
        await this.initShortcutManager();
    }

    /**
     * 确保阅读器已初始化
     * @private
     */
    async _ensureInitialized() {
        if (!this._initialized) {
            await this.init();
        }
    }

    /**
     * 初始化数据库
     */
    async initDatabase() {
        // 检查数据库模块是否可用
        if (!this._dbAvailable || !dbManager) {
            console.warn('数据库模块不可用，使用 localStorage');
            return;
        }
        
        try {
            await dbManager.init();
            // 迁移旧数据
            await this.migrateFromLocalStorage();
        } catch (e) {
            console.error('数据库初始化失败，使用 localStorage:', e);
            this._dbAvailable = false;
        }
    }

    /**
     * 从 localStorage 迁移数据到 IndexedDB
     * 使用时间戳优先策略解决冲突
     */
    async migrateFromLocalStorage() {
        try {
            // 迁移设置
            await this.migrateSettings();
            
            // 迁移进度
            await this.migrateProgress();
            
        } catch (e) {
            console.error('数据迁移失败:', e);
        }
    }

    /**
     * 迁移设置数据
     * @private
     */
    async migrateSettings() {
        const savedSettings = localStorage.getItem('epub-reader-settings');
        if (!savedSettings) return;
        
        const localSettings = JSON.parse(savedSettings);
        const existingSettings = await dbManager.get('settings', 'user-settings');
        
        if (!existingSettings) {
            // 直接迁移
            await dbManager.put('settings', {
                id: 'user-settings',
                ...localSettings,
                migratedAt: Date.now()
            });
        } else {
            // 冲突解决：合并设置，localStorage 优先
            const mergedSettings = {
                ...existingSettings,
                ...localSettings,
                migratedAt: Date.now(),
                conflictResolved: true
            };
            await dbManager.put('settings', mergedSettings);
        }
    }

    /**
     * 迁移进度数据
     * 使用时间戳优先策略解决冲突
     * @private
     */
    async migrateProgress() {
        const savedProgress = localStorage.getItem('epub-reader-progress');
        if (!savedProgress) return;
        
        const localProgress = JSON.parse(savedProgress);
        
        for (const [bookKey, percentage] of Object.entries(localProgress)) {
            const existing = await dbManager.get('progress', bookKey);
            
            // 确保 percentage 是有效的 0-100 数字
            let normalizedPercentage = this.normalizePercentage(percentage);
            
            if (!existing) {
                await dbManager.put('progress', {
                    bookKey,
                    percentage: normalizedPercentage,
                    timestamp: Date.now(),
                    source: 'migration'
                });
            } else {
                const localTimestamp = this.extractTimestampFromProgress(localProgress, bookKey);
                const existingTimestamp = existing.timestamp || 0;
                
                if (localTimestamp > existingTimestamp) {
                    await dbManager.put('progress', {
                        ...existing,
                        percentage: normalizedPercentage,
                        timestamp: localTimestamp,
                        source: 'migration-merged',
                        previousPercentage: existing.percentage
                    });
                }
            }
        }
        
    }

    /**
     * 标准化百分比值为 0-100 范围
     * @param {*} value - 原始值
     * @returns {number} 0-100 范围的数字
     */
    normalizePercentage(value) {
        // 转换为数字
        let num = parseFloat(value);
        
        // 无效值返回 0
        if (isNaN(num) || !isFinite(num)) {
            return 0;
        }
        
        // 负数返回 0
        if (num < 0) {
            return 0;
        }
        
        // 0-1 范围，转换为 0-100
        if (num >= 0 && num <= 1) {
            return Math.round(num * 100);
        }
        
        // 大于 100，限制为 100
        if (num > 100) {
            return 100;
        }
        
        // 已经是 0-100 范围
        return Math.round(num);
    }

    /**
     * 从进度数据中提取时间戳
     * @private
     * @param {Object} progress - 进度数据对象
     * @param {string} bookKey - 书籍键
     * @returns {number} 时间戳
     */
    extractTimestampFromProgress(progress, bookKey) {
        // 检查是否有时间戳字段
        const timestampKey = bookKey + '_timestamp';
        if (progress[timestampKey]) {
            return progress[timestampKey];
        }
        // 如果没有时间戳，使用当前时间
        return Date.now();
    }

    /**
     * 加载用户设置
     */
    async loadSettings() {
        try {
            // 优先从 IndexedDB 加载
            const saved = await dbManager.get('settings', 'user-settings');
            if (saved) {
                this.settings = { ...this.settings, ...saved };
            } else {
                // 降级到 localStorage
                const localSaved = localStorage.getItem('epub-reader-settings');
                if (localSaved) {
                    this.settings = JSON.parse(localSaved);
                }
            }
        } catch (e) {
            console.error('加载设置失败:', e);
            // 降级到 localStorage
            try {
                const saved = localStorage.getItem('epub-reader-settings');
                if (saved) {
                    this.settings = JSON.parse(saved);
                }
            } catch (e2) {
                console.error('localStorage 加载也失败:', e2);
            }
        }
        this.updateFontSizeDisplay();
    }

    /**
     * 加载阅读进度
     */
    async loadReadingProgress() {
        try {
            // 优先从 IndexedDB 加载所有进度
            const allProgress = await dbManager.getAll('progress');
            for (const progress of allProgress) {
                this.readingProgress[progress.bookKey + '_percentage'] = progress.percentage;
                if (progress.cfi) {
                    this.readingProgress[progress.bookKey + '_location'] = progress.cfi;
                }
            }
        } catch (e) {
            console.error('从 IndexedDB 加载进度失败:', e);
            // 降级到 localStorage
            try {
                const saved = localStorage.getItem('epub-reader-progress');
                if (saved) {
                    this.readingProgress = JSON.parse(saved);
                }
            } catch (e2) {
                console.error('localStorage 加载进度也失败:', e2);
            }
        }
    }

    /**
     * 保存用户设置
     */
    async saveSettings() {
        try {
            // 保存到 IndexedDB
            await dbManager.put('settings', {
                id: 'user-settings',
                ...this.settings,
                updatedAt: Date.now()
            });
        } catch (e) {
            console.error('保存设置到 IndexedDB 失败:', e);
        }
        
        // 同时保存到 localStorage 作为备份
        try {
            localStorage.setItem('epub-reader-settings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('保存设置到 localStorage 失败:', e);
        }
    }

    /**
     * 保存阅读进度
     */
    async saveReadingProgress() {
        // 保存当前书籍进度到 IndexedDB
        if (this.currentBookKey && this.rendition) {
            try {
                const location = this.rendition.currentLocation();
                if (location && location.start && location.start.cfi) {
                    await dbManager.put('progress', {
                        bookKey: this.currentBookKey,
                        cfi: location.start.cfi,
                        percentage: this.readingProgress[this.currentBookKey + '_percentage'] || 0,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                console.error('保存进度到 IndexedDB 失败:', e);
            }
        }
        
        // 同时保存到 localStorage 作为备份
        try {
            localStorage.setItem('epub-reader-progress', JSON.stringify(this.readingProgress));
        } catch (e) {
            console.error('保存进度到 localStorage 失败:', e);
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        const backBtn = document.getElementById('backBtn');
        const tocBtn = document.getElementById('tocBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const searchBtn = document.getElementById('searchBtn');
        const closeTocBtn = document.getElementById('closeTocBtn');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        const closeSearchBtn = document.getElementById('closeSearchBtn');
        const overlay = document.getElementById('overlay');
        const decreaseFont = document.getElementById('decreaseFont');
        const increaseFont = document.getElementById('increaseFont');
        const themeBtns = document.querySelectorAll('.theme-btn');
        const searchInput = document.getElementById('searchInput');
        const searchSubmitBtn = document.getElementById('searchSubmitBtn');

        backBtn.addEventListener('click', () => this.showBookshelf());
        tocBtn.addEventListener('click', () => this.toggleToc());
        settingsBtn.addEventListener('click', () => this.toggleSettings());
        searchBtn.addEventListener('click', () => this.toggleSearch());
        closeTocBtn.addEventListener('click', () => this.closeToc());
        closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        closeSearchBtn.addEventListener('click', () => this.closeSearch());
        overlay.addEventListener('click', () => this.closeSidebars());
        decreaseFont.addEventListener('click', () => {
            this.changeFontSize(-10);
            this.focusMainContent();
        });
        increaseFont.addEventListener('click', () => {
            this.changeFontSize(10);
            this.focusMainContent();
        });

        themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                this.applyTheme(theme);
                themeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusMainContent();
            });
        });
        
        searchSubmitBtn.addEventListener('click', () => {
            this.performSearch();
            this.focusMainContent();
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        window.addEventListener('beforeunload', () => {
            if (this.book) {
                this.book.destroy();
            }
        });

        window.addEventListener('resize', () => this.onResized());
        
        this.bindMainContentClick();
    }

    /**
     * 加载书籍列表
     */
    async loadBooks() {
        try {
            const response = await fetch(this.BOOKS_CONFIG_URL);
            if (response.ok) {
                const data = await response.json();
                this.books = data.books || [];
            } else {
                console.error('加载书籍配置失败，使用默认配置');
                this.books = this.getDefaultBooks();
            }
        } catch (e) {
            console.error('加载书籍配置失败:', e);
            this.books = this.getDefaultBooks();
        }
        
        this.renderBookshelf();
    }

    /**
     * 获取默认书籍列表
     */
    getDefaultBooks() {
        return [];
    }

    /**
     * 渲染书架
     */
    renderBookshelf() {
        const bookGrid = document.getElementById('bookGrid');
        bookGrid.innerHTML = '';

        if (this.books.length === 0) {
            this.showEmptyShelf();
            return;
        }

        this.books.forEach((book, index) => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.dataset.index = index;

            const progress = this.readingProgress[book.key];
            const progressBadge = progress ? `<div class="book-progress-badge">${progress}%</div>` : '';

            if (book.cover) {
                card.innerHTML = `
                    <div class="book-cover">
                        <img src="${book.cover}" alt="${this.escapeHtml(book.name)}" class="book-cover-img">
                    </div>
                    <div class="book-info">
                        <div class="book-name">${this.escapeHtml(book.name)}</div>
                        <div class="book-author">${this.escapeHtml(book.author || '未知作者')}</div>
                    </div>
                    ${progressBadge}
                `;
            } else {
                card.innerHTML = `
                    <div class="book-cover">
                        <span class="iconify book-cover-icon" data-icon="mdi:book-open-variant"></span>
                    </div>
                    <div class="book-info">
                        <div class="book-name">${this.escapeHtml(book.name)}</div>
                        <div class="book-author">${this.escapeHtml(book.author || '未知作者')}</div>
                    </div>
                    ${progressBadge}
                `;
            }

            card.addEventListener('click', () => this.openBook(index));
            bookGrid.appendChild(card);
        });
    }

    /**
     * 显示空书架提示
     */
    showEmptyShelf() {
        const bookGrid = document.getElementById('bookGrid');
        bookGrid.innerHTML = `
            <div class="empty-shelf">
                <span class="iconify empty-icon" data-icon="mdi:book-open-page-variant-outline"></span>
                <p class="empty-text">书架空空如也</p>
                <p class="empty-hint">请将EPUB文件上传到服务器书籍目录</p>
                <p class="empty-hint">并配置 books.json 文件</p>
            </div>
        `;
    }

    /**
     * 打开指定书籍
     * @param {number} index - 书籍索引
     */
    async openBook(index) {
        const bookData = this.books[index];
        if (!bookData) return;

        this.currentBookKey = bookData.key;
        
        try {
            this.showLoading('正在打开...');
            
            const bookUrl = bookData.url || `${this.EPUB_DIR}${bookData.key}.epub`;
            this.book = ePub(bookUrl);
            
            await this.book.ready;
            
            // 检测书籍是否为日文竖排模式
            this.isVerticalMode = this.detectVerticalMode(bookData);
            this.bookMetadata = bookData;
            
            document.getElementById('bookTitle').textContent = bookData.name;
            document.getElementById('bookshelf').style.display = 'none';
            document.getElementById('readerViewer').style.display = 'flex';
            document.getElementById('progressInfo').style.display = 'block';
            document.getElementById('backBtn').style.display = 'flex';
            document.getElementById('tocBtn').style.display = 'flex';
            document.getElementById('settingsBtn').style.display = 'flex';
            document.getElementById('searchBtn').style.display = 'flex';

            this.initRendition();
            this.loadToc();
            this.initSearchManager();
            
            // 先显示书籍内容，不阻塞阅读
            this.hideLoading();
            this.optimizeImages();
            
            // 应用日文竖排样式
            if (this.isVerticalMode) {
                this.applyVerticalTextStyles();
            }
            
            // 尝试恢复阅读进度，如果失败则从开头开始
            const savedLocation = this.readingProgress[bookData.key + '_location'];
            try {
                await this.rendition.display(savedLocation || undefined);
            } catch (e) {
                console.warn('恢复阅读进度失败，从开头开始:', e);
                await this.rendition.display();
            }
            
            // 将焦点设置到主内容区域，确保键盘事件正常工作
            this.focusMainContent();
            
            // 后台静默生成位置信息，不显示加载提示
            this.generateLocationsInBackground();
            
        } catch (e) {
            console.error('打开书籍失败:', e);
            this.hideLoading();
            this.showError('打开书籍失败，请检查文件是否存在');
        }
    }

    /**
     * 显示加载提示
     * @param {string} message - 加载消息
     */
    showLoading(message) {
        let loadingEl = document.getElementById('loadingOverlay');
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'loadingOverlay';
            loadingEl.className = 'loading-overlay';
            loadingEl.innerHTML = `
                <div class="loading-box">
                    <div class="loading-spinner"></div>
                    <span class="loading-text">${message}</span>
                </div>
            `;
            document.body.appendChild(loadingEl);
        } else {
            loadingEl.querySelector('.loading-text').textContent = message;
            loadingEl.style.display = 'flex';
        }
    }

    /**
     * 隐藏加载提示
     */
    hideLoading() {
        const loadingEl = document.getElementById('loadingOverlay');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    /**
     * 显示错误提示
     * @param {string} message - 错误消息
     */
    showError(message) {
        const existing = document.getElementById('errorToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'errorToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--text);
            color: var(--bg);
            padding: 14px 24px;
            border-radius: var(--radius);
            font-size: 0.95rem;
            z-index: 10000;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 优化图片加载
     */
    optimizeImages() {
        if (!this.rendition) return;

        this.rendition.hooks.content.register((contents) => {
            const images = contents.document.querySelectorAll('img');
            images.forEach((img) => {
                img.loading = 'lazy';
                img.decoding = 'async';
                
                if (!img.style.maxWidth) {
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                }
            });

            const style = contents.document.createElement('style');
            style.textContent = `
                html, body {
                    overflow-anchor: none !important;
                }
            `;
            contents.document.head.appendChild(style);
        });
    }

    /**
     * 初始化渲染器
     */
    initRendition() {
        const viewer = document.getElementById('epubViewer');
        const viewerRect = viewer.getBoundingClientRect();

        // 根据是否为日文竖排模式配置不同的渲染参数
        const renderOptions = {
            width: viewerRect.width,
            height: viewerRect.height,
            spread: 'none',
            flow: this.isVerticalMode ? 'paginated' : 'scrolled',
            manager: this.isVerticalMode ? 'default' : 'continuous',
            infinite: !this.isVerticalMode,
            offset: this.isVerticalMode ? 0 : 800,
            snap: this.isVerticalMode,
            defaultDirection: this.isVerticalMode ? 'rtl' : 'ltr',
            allowScriptedContent: false,
            minSpreadWidth: 1200
        };

        this.rendition = this.book.renderTo('epubViewer', renderOptions);

        this.rendition.themes.fontSize(`${this.settings.fontSize}%`);
        this.applyRenditionTheme();

        // 如果是日文竖排模式，设置书写模式
        if (this.isVerticalMode) {
            this.rendition.themes.override('writing-mode', 'vertical-rl');
            this.rendition.themes.override('-webkit-writing-mode', 'vertical-rl');
            this.rendition.themes.override('-epub-writing-mode', 'vertical-rl');
        }

        // 监听渲染错误
        this.rendition.on('error', (e) => {
            console.warn('渲染错误:', e);
            // 静默处理渲染错误，不影响其他章节
        });

        this.rendition.on('relocated', (location) => this.onRelocated(location));
        this.rendition.on('rendered', (section) => this.onRendered(section));

        this.rendition.display();
    }

    /**
     * 应用渲染器主题
     */
    applyRenditionTheme() {
        if (!this.rendition) return;

        const japaneseFontFamily = '"Hiragino Mincho ProN", "YuMincho", "Noto Serif JP", "IPAexMincho", serif';
        const defaultFontFamily = '"Noto Serif SC", "Songti SC", serif';

        const themes = {
            light: { 
                background: '#FDFBF8', 
                color: '#3D3632',
                'line-height': this.isVerticalMode ? '1.7' : '1.8',
                'font-family': this.isVerticalMode ? japaneseFontFamily : defaultFontFamily,
                'letter-spacing': this.isVerticalMode ? '0.05em' : 'normal'
            },
            sepia: { 
                background: '#F5EDE0', 
                color: '#4A3F32',
                'line-height': this.isVerticalMode ? '1.7' : '1.8',
                'font-family': this.isVerticalMode ? japaneseFontFamily : defaultFontFamily,
                'letter-spacing': this.isVerticalMode ? '0.05em' : 'normal'
            },
            dark: { 
                background: '#1E1B17', 
                color: '#D8D2CC',
                'line-height': this.isVerticalMode ? '1.7' : '1.8',
                'font-family': this.isVerticalMode ? japaneseFontFamily : defaultFontFamily,
                'letter-spacing': this.isVerticalMode ? '0.05em' : 'normal'
            }
        };

        const theme = themes[this.settings.theme] || themes.light;
        Object.entries(theme).forEach(([key, value]) => {
            this.rendition.themes.override(key, value);
        });

        // 日文竖排模式额外样式
        if (this.isVerticalMode) {
            this.rendition.themes.override('writing-mode', 'vertical-rl');
            this.rendition.themes.override('-webkit-writing-mode', 'vertical-rl');
            this.rendition.themes.override('-epub-writing-mode', 'vertical-rl');
            this.rendition.themes.override('text-orientation', 'mixed');
            this.rendition.themes.override('-webkit-text-orientation', 'mixed');
        }
    }

    /**
     * 加载目录
     */
    async loadToc() {
        const tocContent = document.getElementById('tocContent');
        tocContent.innerHTML = '<div class="toc-empty"><p>加载中...</p></div>';

        try {
            const navigation = await this.book.loaded.navigation;
            const toc = navigation.toc;

            if (!toc || toc.length === 0) {
                tocContent.innerHTML = '<div class="toc-empty"><p>这本书没有目录</p></div>';
                return;
            }

            tocContent.innerHTML = '';
            this.renderTocItems(toc, tocContent, 1);
        } catch (e) {
            console.error('加载目录失败:', e);
            tocContent.innerHTML = '<div class="toc-empty"><p>加载失败</p></div>';
        }
    }

    /**
     * 渲染目录项
     * @param {Array} items - 目录项数组
     * @param {HTMLElement} container - 容器元素
     * @param {number} level - 层级
     */
    renderTocItems(items, container, level) {
        items.forEach(item => {
            const tocItem = document.createElement('div');
            tocItem.className = `toc-item toc-item-level-${level}`;
            tocItem.textContent = item.label;
            tocItem.dataset.href = item.href;

            tocItem.addEventListener('click', () => {
                this.goToChapter(item.href);
                document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
                tocItem.classList.add('active');
            });

            container.appendChild(tocItem);

            if (item.subitems && item.subitems.length > 0) {
                this.renderTocItems(item.subitems, container, level + 1);
            }
        });
    }

    /**
     * 跳转到指定章节
     * @param {string} href - 章节链接
     */
    async goToChapter(href) {
        if (this.rendition) {
            try {
                await this.rendition.display(href);
            } catch (e) {
                console.warn('跳转到章节失败:', e);
                this.showError('跳转失败，该章节可能不存在');
            }
            this.closeSidebars();
        }
    }

    /**
     * 位置变化回调
     * @param {Object} location - 位置信息
     */
    onRelocated(location) {
        if (!location || !this.book) return;

        let progress = 0;
        
        if (location.start.percentage !== undefined && location.start.percentage !== null) {
            progress = Math.round(location.start.percentage * 100);
        } else if (this.book.locations && location.start.cfi) {
            try {
                const percentage = this.book.locations.percentageFromCfi(location.start.cfi);
                if (percentage !== undefined && percentage !== null && !isNaN(percentage)) {
                    progress = Math.round(percentage * 100);
                }
            } catch (e) {
                console.error('计算进度失败:', e);
            }
        }
        
        progress = Math.max(0, Math.min(100, progress));
        
        document.getElementById('progressText').textContent = `${progress}%`;
        document.getElementById('progressFill').style.width = `${progress}%`;
        document.getElementById('progressLabel').textContent = `${progress}%`;

        if (this.currentBookKey) {
            this.readingProgress[this.currentBookKey] = progress;
            this.readingProgress[this.currentBookKey + '_location'] = location.start.cfi;
            this.debouncedSaveProgress();
        }
    }

    /**
     * 防抖保存进度
     */
    debouncedSaveProgress() {
        if (this.saveProgressTimeout) {
            clearTimeout(this.saveProgressTimeout);
        }
        this.saveProgressTimeout = setTimeout(() => {
            this.saveReadingProgress();
        }, 500);
    }

    /**
     * 渲染完成回调
     * @param {Object} section - 章节对象
     */
    onRendered(section) {
        this.applyRenditionTheme();
        
        // 在 iframe 内添加点击事件处理，确保点击后焦点回到主内容
        if (this.rendition) {
            try {
                // 获取当前章节的内容文档
                const contents = this.rendition.getContents();
                if (contents && contents.length > 0) {
                    const doc = contents[0].document || contents[0].contentDocument;
                    if (doc) {
                        // 为 iframe 内的文档添加点击事件
                        doc.addEventListener('click', () => {
                            this.focusMainContent();
                        });
                        
                        // 如果有当前搜索关键词，重新高亮新章节
                        if (this.currentSearchQuery) {
                            this.highlightTextInDocument(doc, this.currentSearchQuery);
                        }
                    }
                }
            } catch (e) {
                // 静默处理错误
            }
        }
    }

    /**
     * 窗口大小变化回调
     */
    onResized() {
        const viewer = document.getElementById('epubViewer');
        const viewerRect = viewer.getBoundingClientRect();
        
        if (this.rendition) {
            this.rendition.resize(viewerRect.width, viewerRect.height);
        }
    }

    /**
     * 显示书架
     */
    showBookshelf() {
        if (this.saveProgressTimeout) {
            clearTimeout(this.saveProgressTimeout);
            this.saveProgressTimeout = null;
        }
        
        if (this.book) {
            if (this.rendition) {
                try {
                    this.rendition.destroy();
                } catch (e) {
                    console.error('销毁渲染实例失败:', e);
                }
                this.rendition = null;
            }
            
            try {
                this.book.destroy();
            } catch (e) {
                console.error('销毁书籍实例失败:', e);
            }
            this.book = null;
        }

        // 重置日文竖排模式状态
        this.isVerticalMode = false;
        this.bookMetadata = null;

        document.getElementById('bookTitle').textContent = '书架';
        document.getElementById('bookshelf').style.display = 'block';
        document.getElementById('readerViewer').style.display = 'none';
        document.getElementById('progressInfo').style.display = 'none';
        document.getElementById('backBtn').style.display = 'none';
        document.getElementById('tocBtn').style.display = 'none';
        document.getElementById('settingsBtn').style.display = 'none';
        
        this.closeSidebars();
        this.loadBooks();
        this.focusMainContent();
    }

    /**
     * 键盘事件处理（keydown）
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeydown(e) {
        // 竖排模式下的方向键翻页优先处理
        if (this.isVerticalMode && this.rendition) {
            if (this.handleVerticalModeKeydown(e)) {
                return;
            }
        }
        
        // 输入框和文本框中不处理快捷键（除了 Escape）
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape') {
                this.closeSidebars();
            }
            return;
        }
        
        // 翻页按键处理（非竖排模式）
        if (!this.isVerticalMode && this.rendition) {
            // PageDown / Space - 下一页
            if (e.key === 'PageDown' || e.keyCode === 34 || 
                (e.key === ' ' && !e.shiftKey)) {
                e.preventDefault();
                this.rendition.next();
                return;
            }
            
            // PageUp / Shift+Space - 上一页
            if (e.key === 'PageUp' || e.keyCode === 33 || 
                (e.key === ' ' && e.shiftKey)) {
                e.preventDefault();
                this.rendition.prev();
                return;
            }
            
            // ArrowRight / ArrowDown - 下一页（横排模式）
            if (e.key === 'ArrowRight' || e.keyCode === 39 ||
                e.key === 'ArrowDown' || e.keyCode === 40) {
                e.preventDefault();
                this.rendition.next();
                return;
            }
            
            // ArrowLeft / ArrowUp - 上一页（横排模式）
            if (e.key === 'ArrowLeft' || e.keyCode === 37 ||
                e.key === 'ArrowUp' || e.keyCode === 38) {
                e.preventDefault();
                this.rendition.prev();
                return;
            }
            
            // Home - 跳到开头
            if (e.key === 'Home' || e.keyCode === 36) {
                e.preventDefault();
                this.rendition.display(0);
                return;
            }
            
            // End - 跳到结尾
            if (e.key === 'End' || e.keyCode === 35) {
                e.preventDefault();
                if (this.book.locations) {
                    const total = this.book.locations.length();
                    this.rendition.display(total - 1);
                }
                return;
            }
        }
        
        // Ctrl/Cmd 组合快捷键 - 阻止浏览器默认行为
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    this.toggleSearch();
                    break;
                case 't':
                    e.preventDefault();
                    this.toggleToc();
                    break;
            }
        }
        
        // Escape 键关闭面板
        if (e.key === 'Escape') {
            e.preventDefault();
            this.closeSidebars();
        }
    }

    /**
     * 处理竖排模式下的键盘事件
     * @param {KeyboardEvent} e - 键盘事件
     * @returns {boolean} 是否处理了事件
     */
    handleVerticalModeKeydown(e) {
        const isArrowKey = e.key === 'ArrowLeft' || e.keyCode === 37 ||
                           e.key === 'ArrowRight' || e.keyCode === 39 ||
                           e.key === 'ArrowUp' || e.keyCode === 38 ||
                           e.key === 'ArrowDown' || e.keyCode === 40;
        
        if (!isArrowKey) {
            return false;
        }
        
        // 阻止方向键的默认行为
        e.preventDefault();
        
        if (e.key === 'ArrowLeft' || e.keyCode === 37) {
            this.rendition.next();
            return true;
        } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
            this.rendition.prev();
            return true;
        } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
            this.scrollVertical(-50);
            return true;
        } else if (e.key === 'ArrowDown' || e.keyCode === 40) {
            this.scrollVertical(50);
            return true;
        }
        return false;
    }

    /**
     * 竖排模式下的垂直滚动
     * @param {number} delta - 滚动距离
     */
    scrollVertical(delta) {
        const viewer = document.getElementById('epubViewer');
        if (viewer) {
            const iframe = viewer.querySelector('iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.scrollBy({
                    top: delta,
                    behavior: 'smooth'
                });
            }
        }
    }

    /**
     * 将焦点设置到主内容区域
     */
    focusMainContent() {
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.focus();
        }
    }

    /**
     * 绑定主内容区域的点击事件，确保点击后焦点回到主内容
     */
    bindMainContentClick() {
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.addEventListener('click', () => {
                this.focusMainContent();
            });
        }
    }

    /**
     * 切换目录侧边栏
     */
    toggleToc() {
        const sidebar = document.getElementById('tocSidebar');
        const overlay = document.getElementById('overlay');
        
        this.closeOtherSidebars('tocSidebar');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active', sidebar.classList.contains('active'));
        this.focusMainContent();
    }

    /**
     * 切换设置侧边栏
     */
    toggleSettings() {
        const sidebar = document.getElementById('settingsSidebar');
        const overlay = document.getElementById('overlay');
        
        this.closeOtherSidebars('settingsSidebar');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active', sidebar.classList.contains('active'));
        this.focusMainContent();
    }

    /**
     * 切换搜索侧边栏
     */
    toggleSearch() {
        const sidebar = document.getElementById('searchSidebar');
        const overlay = document.getElementById('overlay');
        
        this.closeOtherSidebars('searchSidebar');
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active', sidebar.classList.contains('open'));
        
        if (sidebar.classList.contains('open')) {
            document.getElementById('searchInput').focus();
        } else {
            this.focusMainContent();
        }
    }

    /**
     * 关闭其他侧边栏
     * @param {string} except - 排除的侧边栏 ID
     */
    closeOtherSidebars(except) {
        const sidebars = ['tocSidebar', 'settingsSidebar', 'searchSidebar'];
        sidebars.forEach(id => {
            if (id !== except) {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('active', 'open');
                }
            }
        });
    }

    /**
     * 关闭目录侧边栏
     */
    closeToc() {
        document.getElementById('tocSidebar').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
        this.focusMainContent();
    }

    /**
     * 关闭设置侧边栏
     */
    closeSettings() {
        document.getElementById('settingsSidebar').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
        this.focusMainContent();
    }

    /**
     * 关闭搜索侧边栏
     */
    closeSearch() {
        document.getElementById('searchSidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('active');
        // 清除搜索高亮
        this.clearSearchHighlights();
        this.currentSearchQuery = '';
        this.focusMainContent();
    }

    /**
     * 关闭所有侧边栏
     */
    closeSidebars() {
        document.getElementById('tocSidebar').classList.remove('active');
        document.getElementById('settingsSidebar').classList.remove('active');
        document.getElementById('searchSidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('active');
        // 清除搜索高亮
        this.clearSearchHighlights();
        this.currentSearchQuery = '';
        this.focusMainContent();
    }

    /**
     * 改变字体大小
     * @param {number} delta - 变化量
     */
    changeFontSize(delta) {
        this.settings.fontSize = Math.max(50, Math.min(200, this.settings.fontSize + delta));
        this.updateFontSizeDisplay();
        this.saveSettings();

        if (this.rendition) {
            this.rendition.themes.fontSize(`${this.settings.fontSize}%`);
        }
    }

    /**
     * 更新字体大小显示
     */
    updateFontSizeDisplay() {
        document.getElementById('fontSizeDisplay').textContent = `${this.settings.fontSize}%`;
    }

    /**
     * 应用主题
     * @param {string} theme - 主题名称
     */
    applyTheme(theme) {
        this.settings.theme = theme;
        document.body.dataset.theme = theme;
        this.saveSettings();
        this.applyRenditionTheme();
        
        // 更新主题按钮选中状态
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    /**
     * HTML 转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 后台静默生成位置信息
     */
    async generateLocationsInBackground() {
        if (!this.book) return;

        try {
            // 使用较小的分段数以加快生成速度
            await this.book.locations.generate(2048);
        } catch (e) {
            console.error('生成位置信息失败:', e);
        }
    }

    /**
     * 检测书籍是否需要日文竖排模式
     * @param {Object} bookData - 书籍数据
     * @returns {boolean} 是否为日文竖排模式
     */
    detectVerticalMode(bookData) {
        // 1. 检查书籍配置中是否明确指定了竖排模式
        if (bookData.verticalMode === true) {
            return true;
        }

        // 2. 检查书籍元数据中的页面方向
        if (this.book && this.book.package && this.book.package.metadata) {
            const metadata = this.book.package.metadata;
            
            // 检查 page-progression-direction
            if (metadata.direction === 'rtl' || metadata.pageProgressionDirection === 'rtl') {
                // 进一步检查语言是否为日语
                const language = metadata.language || '';
                if (language.toLowerCase().startsWith('ja')) {
                    return true;
                }
            }
        }

        // 3. 检查书籍配置中的语言设置
        if (bookData.language) {
            const lang = bookData.language.toLowerCase();
            if (lang === 'ja' || lang === 'japanese' || lang.startsWith('ja-')) {
                // 如果是日语书籍，检查是否指定了竖排
                if (bookData.writingMode === 'vertical' || bookData.writingMode === 'vertical-rl') {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 应用日文竖排文本样式
     * 通过 hooks 注入 CSS 来实现日文排版规则
     */
    applyVerticalTextStyles() {
        if (!this.rendition) return;

        this.rendition.hooks.content.register((contents) => {
            const verticalStyle = contents.document.createElement('style');
            verticalStyle.id = 'japanese-vertical-style';
            verticalStyle.textContent = `
                /* 日文竖排核心样式 */
                html {
                    writing-mode: vertical-rl;
                    -webkit-writing-mode: vertical-rl;
                    -epub-writing-mode: vertical-rl;
                    text-orientation: mixed;
                    -webkit-text-orientation: mixed;
                    -epub-text-orientation: mixed;
                }
                
                body {
                    writing-mode: vertical-rl;
                    -webkit-writing-mode: vertical-rl;
                    -epub-writing-mode: vertical-rl;
                    text-orientation: mixed;
                    -webkit-text-orientation: mixed;
                    -epub-text-orientation: mixed;
                    line-break: normal;
                    -webkit-line-break: normal;
                    -epub-line-break: normal;
                    word-break: break-all;
                    overflow-wrap: break-word;
                }
                
                /* 字符方向处理 */
                * {
                    text-orientation: mixed;
                    -webkit-text-orientation: mixed;
                }
                
                /* 纵中横处理 - 数字和短英文横向显示 */
                .tcy, 
                .tate-chu-yoko,
                span[style*="text-combine"] {
                    text-combine-upright: all;
                    -webkit-text-combine: horizontal;
                }
                
                /* 数字处理 - 2位数字使用纵中横 */
                .num {
                    text-combine-upright: digits 2;
                    -webkit-text-combine: horizontal;
                }
                
                /* 行距优化 */
                p, div, section, article {
                    line-height: 1.7;
                    letter-spacing: 0.05em;
                }
                
                /* 标点符号处理 */
                kbd, code, samp {
                    text-orientation: sideways;
                    -webkit-text-orientation: sideways;
                }
                
                /* 图片处理 */
                img {
                    max-width: 100%;
                    height: auto;
                    max-height: 80vh;
                }
                
                /* 表格处理 */
                table {
                    writing-mode: horizontal-tb;
                    -webkit-writing-mode: horizontal-tb;
                }
                
                /* 注音处理 */
                ruby {
                    ruby-align: center;
                }
                
                /* 强调点处理 */
                em {
                    font-style: normal;
                    text-emphasis: filled circle;
                    -webkit-text-emphasis: filled circle;
                    text-emphasis-position: over right;
                    -webkit-text-emphasis-position: over right;
                }
                
                /* 避免分页断行 */
                p {
                    break-inside: avoid;
                    page-break-inside: avoid;
                }
                
                /* 悬挂标点 */
                body {
                    hanging-punctuation: allow-end;
                    -webkit-hanging-punctuation: allow-end;
                }
                
                /* 禁则处理 */
                p {
                    line-break: strict;
                    -webkit-line-break: strict;
                    word-break: keep-all;
                }
            `;
            
            contents.document.head.appendChild(verticalStyle);

            this.processTateChuYoko(contents.document);

            this.processPunctuation(contents.document);
        });
    }

    /**
     * 处理纵中横（数字横向显示）
     * @param {Document} doc - 内容文档
     */
    processTateChuYoko(doc) {
        // 查找所有2位数字并应用纵中横
        const walker = doc.createTreeWalker(
            doc.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }

        textNodes.forEach(node => {
            const text = node.textContent;
            // 匹配2位数字（适合纵中横）
            const pattern = /(\d{2})/g;
            
            if (pattern.test(text)) {
                const span = doc.createElement('span');
                span.style.cssText = 'text-combine-upright: all; -webkit-text-combine: horizontal;';
                span.textContent = RegExp.$1;
                
                const newText = text.replace(pattern, span.outerHTML);
                const temp = doc.createElement('div');
                temp.innerHTML = newText;
                node.parentNode.replaceChild(temp.firstChild, node);
            }
        });
    }

    /**
     * 处理日文标点符号
     * @param {Document} doc - 内容文档
     */
    processPunctuation(doc) {
        // 添加标点符号处理样式
        const punctStyle = doc.createElement('style');
        punctStyle.textContent = `
            /* 标点符号避头尾处理 */
            body {
                hanging-punctuation: allow-end;
                -webkit-hanging-punctuation: allow-end;
            }
            
            /* 禁则处理 */
            p {
                line-break: strict;
                -webkit-line-break: strict;
                word-break: keep-all;
            }
        `;
        doc.head.appendChild(punctStyle);
    }

    /**
     * 获取当前书籍的书写模式
     * @returns {string} 书写模式
     */
    getWritingMode() {
        return this.isVerticalMode ? 'vertical-rl' : 'horizontal-tb';
    }

    /**
     * 初始化搜索管理器
     */
    async initSearchManager() {
        if (!this.book) return;
        
        try {
            if (!SearchManager) {
                const module = await import('./search-manager.js');
                SearchManager = module.default;
            }
            
            this.searchManager = new SearchManager(this.book);
            
            this.searchManager.onProgress = (progress) => {
                const statusText = document.getElementById('searchStatusText');
                if (statusText) {
                    statusText.textContent = `正在建立索引... ${progress.percentage.toFixed(0)}%`;
                }
            };
            
        } catch (e) {
            console.error('初始化搜索管理器失败:', e);
        }
    }



    /**
     * 初始化快捷键管理器
     */
    async initShortcutManager() {
        try {
            if (!ShortcutManager) {
                const module = await import('./shortcut-manager.js');
                ShortcutManager = module.default;
            }
            
            this.shortcutManager = new ShortcutManager();
            
            this.shortcutManager.addListener(() => {
                this.refreshShortcutsList();
            });
            
            this.bindShortcutEvents();
            this.refreshShortcutsList();
            
        } catch (e) {
            console.error('初始化快捷键管理器失败:', e);
        }
    }

    /**
     * 绑定快捷键面板事件
     */
    bindShortcutEvents() {
        const searchInput = document.getElementById('shortcutsSearch');
        const filterBtns = document.querySelectorAll('.filter-btn');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentShortcutSearch = e.target.value.trim();
                this.refreshShortcutsList();
            });
        }
        
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentShortcutCategory = btn.dataset.category;
                this.refreshShortcutsList();
            });
        });
    }

    /**
     * 刷新快捷键列表显示
     */
    refreshShortcutsList() {
        if (!this.shortcutManager) return;
        
        const listContainer = document.getElementById('shortcutsList');
        if (!listContainer) return;
        
        const context = { verticalMode: this.isVerticalMode };
        
        let shortcuts = this.shortcutManager.searchShortcuts(
            this.currentShortcutSearch,
            context
        );
        
        if (this.currentShortcutCategory !== 'all') {
            shortcuts = shortcuts.filter(s => s.category === this.currentShortcutCategory);
        }
        
        if (shortcuts.length === 0) {
            listContainer.innerHTML = '<div class="shortcuts-empty">未找到匹配的快捷键</div>';
            return;
        }
        
        listContainer.innerHTML = shortcuts.map(shortcut => {
            // 判断是否为翻页快捷键（多个按键表示"或"的关系）
            const isNavigationKeys = shortcut.keys.length > 1 && !shortcut.keys.includes('Ctrl') && !shortcut.keys.includes('Shift') && !shortcut.keys.includes('Alt');
            
            let keysHTML;
            if (isNavigationKeys) {
                // 翻页快捷键：用 + 连接表示"或"
                keysHTML = shortcut.keys.map(key => `<kbd>${this.escapeHtml(key)}</kbd>`).join('<span class="key-separator"> + </span>');
            } else {
                // 组合快捷键：用 + 连接表示组合
                keysHTML = shortcut.keys.map((key, index) => {
                    const separator = index < shortcut.keys.length - 1 
                        ? '<span class="key-separator">+</span>' 
                        : '';
                    return `<kbd>${this.escapeHtml(key)}</kbd>${separator}`;
                }).join('');
            }
            
            const conditionText = shortcut.condition ? '（竖排模式）' : '';
            
            return `
                <div class="shortcut-item" data-id="${shortcut.id}">
                    <div class="shortcut-info">
                        <div class="shortcut-desc">${this.escapeHtml(shortcut.description)}${conditionText}</div>
                        <div class="shortcut-category">${this.getCategoryDisplayName(shortcut.category)}</div>
                    </div>
                    <div class="shortcut-keys">${keysHTML}</div>
                </div>
            `;
        }).join('');
        
        this.updateShortcutFilters();
    }

    /**
     * 获取分类显示名称
     * @param {string} category - 分类ID
     * @returns {string} 显示名称
     */
    getCategoryDisplayName(category) {
        const names = {
            'navigation': '导航操作',
            'reading': '阅读控制',
            'annotation': '笔记标注',
            'search': '搜索功能',
            'system': '系统操作'
        };
        return names[category] || category;
    }

    /**
     * 更新快捷键筛选按钮
     */
    updateShortcutFilters() {
        if (!this.shortcutManager) return;
        
        const filterContainer = document.getElementById('shortcutsFilter');
        if (!filterContainer) return;
        
        const context = { verticalMode: this.isVerticalMode };
        const categories = this.shortcutManager.getCategories(context);
        
        const existingBtns = filterContainer.querySelectorAll('.filter-btn');
        existingBtns.forEach(btn => {
            if (btn.dataset.category !== 'all') {
                btn.remove();
            }
        });
        
        categories.forEach(cat => {
            if (!filterContainer.querySelector(`[data-category="${cat.id}"]`)) {
                const btn = document.createElement('button');
                btn.className = 'filter-btn';
                btn.dataset.category = cat.id;
                btn.textContent = `${cat.name} (${cat.count})`;
                btn.addEventListener('click', () => {
                    filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentShortcutCategory = cat.id;
                    this.refreshShortcutsList();
                });
                filterContainer.appendChild(btn);
            }
        });
    }

    /**
     * 执行搜索
     */
    async performSearch() {
        if (!this.searchManager) {
            await this.initSearchManager();
        }
        
        const input = document.getElementById('searchInput');
        const query = input.value.trim();
        
        if (!query) {
            this.showError('请输入搜索关键词');
            return;
        }
        
        if (query.length < 2) {
            this.showError('搜索关键词至少需要 2 个字符');
            return;
        }
        
        const caseSensitive = document.getElementById('searchCaseSensitive').checked;
        const resultsContainer = document.getElementById('searchResults');
        const statusEl = document.getElementById('searchStatus');
        
        statusEl.style.display = 'flex';
        resultsContainer.innerHTML = '<div class="search-empty">搜索中...</div>';
        
        try {
            // 检查是否需要构建索引
            if (!this.searchManager.index || this.searchManager.index.sections.length === 0) {
                document.getElementById('searchStatusText').textContent = '正在建立索引...';
                const indexResult = await this.searchManager.buildIndex();
                
                // 检查索引构建结果
                if (!indexResult || indexResult.indexedSections === 0) {
                    statusEl.style.display = 'none';
                    resultsContainer.innerHTML = '<div class="search-empty">无法建立搜索索引，本书可能存在格式问题</div>';
                    return;
                }
            }
            
            const results = await this.searchManager.search(query, { caseSensitive });
            
            statusEl.style.display = 'none';
            
            if (results.length === 0) {
                resultsContainer.innerHTML = '<div class="search-empty">未找到匹配结果</div>';
                return;
            }
            
            // 按章节分组
            const groupedResults = {};
            results.forEach(result => {
                const chapterTitle = result.section?.title || '未知章节';
                if (!groupedResults[chapterTitle]) {
                    groupedResults[chapterTitle] = {
                        href: result.section?.href || '',
                        items: []
                    };
                }
                groupedResults[chapterTitle].items.push(result);
            });
            
            // 生成分组显示的HTML
            let html = '';
            Object.keys(groupedResults).forEach(chapterTitle => {
                const group = groupedResults[chapterTitle];
                html += `
                    <div class="search-result-group">
                        <div class="search-result-group-header">
                            <span class="search-result-chapter-name">${chapterTitle}</span>
                            <span class="search-result-count">${group.items.length} 个匹配</span>
                        </div>
                        <div class="search-result-group-items">
                `;
                
                group.items.forEach((result, index) => {
                    const href = result.section?.href || '';
                    const context = result.match?.context || {};
                    const highlightedText = this.highlightSearchTerm(context.text || '', query);
                    
                    html += `
                        <div class="search-result-item" data-href="${href}" data-position="${result.match.position}">
                            <div class="search-result-index">#${index + 1}</div>
                            <div class="search-result-text">${highlightedText}</div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });
            
            resultsContainer.innerHTML = html;
            
            // 高亮当前章节中的所有匹配项
            await this.highlightAllMatchesInCurrentChapter(query);
            
            resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const href = item.dataset.href;
                    if (href) {
                        try {
                            // 跳转到搜索结果位置（保持搜索侧边栏打开，方便用户查看其他结果）
                            await this.rendition.display(href);
                        } catch (e) {
                            console.warn('跳转到搜索结果失败:', e);
                            this.showError('跳转失败，该位置可能不存在');
                        }
                    }
                });
            });
            
        } catch (e) {
            console.error('搜索失败:', e);
            statusEl.style.display = 'none';
            resultsContainer.innerHTML = '<div class="search-empty">搜索出错，请重试</div>';
            this.showError('搜索失败: ' + e.message);
        }
    }

    /**
     * 高亮搜索关键词
     * @param {string} text - 原始文本
     * @param {string} query - 搜索关键词
     * @returns {string}
     */
    highlightSearchTerm(text, query) {
        if (!text || !query) return text;
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    /**
     * 清除所有搜索高亮
     */
    clearSearchHighlights() {
        if (this.searchHighlights && this.searchHighlights.length > 0) {
            this.searchHighlights.forEach(highlight => {
                try {
                    if (this.rendition && highlight.remove) {
                        highlight.remove();
                    }
                } catch (e) {
                    // 忽略删除错误
                }
            });
            this.searchHighlights = [];
        }
    }

    /**
     * 在当前章节高亮所有匹配的关键词
     * @param {string} query - 搜索关键词
     */
    async highlightAllMatchesInCurrentChapter(query) {
        if (!this.rendition || !query) return;
        
        // 清除之前的高亮
        this.clearSearchHighlights();
        this.currentSearchQuery = query;
        
        try {
            // 获取当前章节的内容
            const location = this.rendition.currentLocation();
            if (!location || !location.start) return;
            
            const section = this.book.section(location.start.href);
            if (!section) return;
            
            // 添加高亮样式
            this.rendition.themes.default({
                '::selection': {
                    'background': 'rgba(196, 149, 106, 0.4)'
                }
            });
            
            // 在 iframe 中查找并高亮所有匹配
            const contents = this.rendition.getContents();
            if (contents && contents.length > 0) {
                const doc = contents[0].document || contents[0].contentDocument;
                if (doc && doc.body) {
                    this.highlightTextInDocument(doc, query);
                }
            }
        } catch (e) {
            console.warn('高亮关键词失败:', e);
        }
    }

    /**
     * 在文档中高亮所有匹配的文本
     * @param {Document} doc - 文档对象
     * @param {string} query - 搜索关键词
     */
    highlightTextInDocument(doc, query) {
        if (!doc || !query) return;
        
        const walker = doc.createTreeWalker(
            doc.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        
        // 收集所有文本节点
        while (node = walker.nextNode()) {
            if (node.textContent.toLowerCase().includes(query.toLowerCase())) {
                textNodes.push(node);
            }
        }
        
        // 在每个文本节点中查找并高亮
        textNodes.forEach(textNode => {
            // 收集该节点中所有匹配的位置（从后往前处理，避免索引变化）
            const matches = [];
            const text = textNode.textContent;
            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            
            let position = 0;
            let index = lowerText.indexOf(lowerQuery, position);
            
            while (index !== -1) {
                matches.push({ start: index, end: index + query.length });
                position = index + query.length;
                index = lowerText.indexOf(lowerQuery, position);
            }
            
            // 从后往前处理，避免索引变化
            matches.reverse().forEach(match => {
                const range = doc.createRange();
                range.setStart(textNode, match.start);
                range.setEnd(textNode, match.end);
                
                const span = doc.createElement('span');
                span.className = 'search-highlight';
                span.style.backgroundColor = 'rgba(196, 149, 106, 0.3)';
                span.style.borderBottom = '2px solid #C4956A';
                span.style.cursor = 'pointer';
                
                try {
                    range.surroundContents(span);
                    this.searchHighlights.push({
                        element: span,
                        remove: () => {
                            try {
                                const parent = span.parentNode;
                                while (span.firstChild) {
                                    parent.insertBefore(span.firstChild, span);
                                }
                                parent.removeChild(span);
                            } catch (e) {
                                // 忽略错误
                            }
                        }
                    });
                } catch (e) {
                    // 如果 range 跨越多个节点，忽略错误
                }
            });
        });
    }

    /**
     * 转义正则特殊字符
     * @param {string} str - 原始字符串
     * @returns {string}
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    toggleWritingMode() {
        if (!this.book) return;

        this.isVerticalMode = !this.isVerticalMode;
        
        if (this.rendition) {
            this.rendition.destroy();
        }
        
        this.initRendition();
        
        if (this.isVerticalMode) {
            this.applyVerticalTextStyles();
        }
        
        this.rendition.display();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    window.epubReader = new EpubReader();
    try {
        await window.epubReader.init();
    } catch (e) {
        console.error('阅读器初始化失败:', e);
    }
});

export default EpubReader;
