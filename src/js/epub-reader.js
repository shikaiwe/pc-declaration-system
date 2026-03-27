/**
 * EPUB电子书阅读器模块
 * 提供完整的电子书阅读功能，包括书架管理、阅读控制、进度追踪等
 * 直接从服务器静态目录读取EPUB文件
 */

// 数据库模块引用（延迟加载）
let dbManager = null;
let DatabaseError = null;
let DBErrorType = null;

// 搜索和笔记模块引用（延迟加载）
let SearchManager = null;
let AnnotationManager = null;

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
        // 注解管理器
        this.annotationManager = null;
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
        const annotationBtn = document.getElementById('annotationBtn');
        const closeTocBtn = document.getElementById('closeTocBtn');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        const closeSearchBtn = document.getElementById('closeSearchBtn');
        const closeAnnotationBtn = document.getElementById('closeAnnotationBtn');
        const overlay = document.getElementById('overlay');
        const decreaseFont = document.getElementById('decreaseFont');
        const increaseFont = document.getElementById('increaseFont');
        const themeBtns = document.querySelectorAll('.theme-btn');
        const annotationTabs = document.querySelectorAll('.annotation-tab');
        const addBookmarkBtn = document.getElementById('addBookmarkBtn');
        const searchInput = document.getElementById('searchInput');
        const searchSubmitBtn = document.getElementById('searchSubmitBtn');

        backBtn.addEventListener('click', () => this.showBookshelf());
        tocBtn.addEventListener('click', () => this.toggleToc());
        settingsBtn.addEventListener('click', () => this.toggleSettings());
        searchBtn.addEventListener('click', () => this.toggleSearch());
        annotationBtn.addEventListener('click', () => this.toggleAnnotations());
        closeTocBtn.addEventListener('click', () => this.closeToc());
        closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        closeSearchBtn.addEventListener('click', () => this.closeSearch());
        closeAnnotationBtn.addEventListener('click', () => this.closeAnnotations());
        overlay.addEventListener('click', () => this.closeSidebars());
        decreaseFont.addEventListener('click', () => this.changeFontSize(-10));
        increaseFont.addEventListener('click', () => this.changeFontSize(10));

        themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                this.applyTheme(theme);
                themeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        annotationTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchAnnotationTab(tabName);
                annotationTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });

        addBookmarkBtn.addEventListener('click', () => this.addBookmark());
        
        searchSubmitBtn.addEventListener('click', () => this.performSearch());
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        document.addEventListener('keyup', (e) => this.handleKeyup(e));
        
        window.addEventListener('beforeunload', () => {
            if (this.book) {
                this.book.destroy();
            }
        });

        window.addEventListener('resize', () => this.onResized());
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
            document.getElementById('annotationBtn').style.display = 'flex';

            this.initRendition();
            this.loadToc();
            this.initSearchManager();
            this.initAnnotationManager();
            
            // 先显示书籍内容，不阻塞阅读
            this.hideLoading();
            this.optimizeImages();
            
            // 应用日文竖排样式
            if (this.isVerticalMode) {
                this.applyVerticalTextStyles();
            }
            
            const savedLocation = this.readingProgress[bookData.key + '_location'];
            await this.rendition.display(savedLocation || undefined);
            
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

        this.rendition.on('relocated', (location) => this.onRelocated(location));
        this.rendition.on('rendered', () => this.onRendered());

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
    goToChapter(href) {
        if (this.rendition) {
            this.rendition.display(href);
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
     */
    onRendered() {
        this.applyRenditionTheme();
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
    }

    /**
     * 键盘事件处理
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyup(e) {
        // 日文竖排模式下支持键盘翻页
        if (this.isVerticalMode && this.rendition) {
            // 竖排模式下：左箭头下一页，右箭头上一页（从右向左阅读）
            if (e.key === 'ArrowLeft' || e.keyCode === 37) {
                this.rendition.next();
            } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
                this.rendition.prev();
            } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
                // 上箭头滚动
                this.scrollVertical(-50);
            } else if (e.key === 'ArrowDown' || e.keyCode === 40) {
                // 下箭头滚动
                this.scrollVertical(50);
            }
        }
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
     * 切换目录侧边栏
     */
    toggleToc() {
        const sidebar = document.getElementById('tocSidebar');
        const overlay = document.getElementById('overlay');
        
        this.closeOtherSidebars('tocSidebar');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active', sidebar.classList.contains('active'));
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
        }
    }

    /**
     * 切换笔记侧边栏
     */
    toggleAnnotations() {
        const sidebar = document.getElementById('annotationSidebar');
        const overlay = document.getElementById('overlay');
        
        this.closeOtherSidebars('annotationSidebar');
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active', sidebar.classList.contains('open'));
    }

    /**
     * 关闭其他侧边栏
     * @param {string} except - 排除的侧边栏ID
     */
    closeOtherSidebars(except) {
        const sidebars = ['tocSidebar', 'settingsSidebar', 'searchSidebar', 'annotationSidebar'];
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
    }

    /**
     * 关闭设置侧边栏
     */
    closeSettings() {
        document.getElementById('settingsSidebar').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
    }

    /**
     * 关闭搜索侧边栏
     */
    closeSearch() {
        document.getElementById('searchSidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('active');
    }

    /**
     * 关闭笔记侧边栏
     */
    closeAnnotations() {
        document.getElementById('annotationSidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('active');
    }

    /**
     * 关闭所有侧边栏
     */
    closeSidebars() {
        document.getElementById('tocSidebar').classList.remove('active');
        document.getElementById('settingsSidebar').classList.remove('active');
        document.getElementById('searchSidebar').classList.remove('open');
        document.getElementById('annotationSidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('active');
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
     * 初始化注解管理器
     */
    async initAnnotationManager() {
        if (!this.rendition || !this.currentBookKey) return;
        
        try {
            if (!AnnotationManager) {
                const module = await import('./annotation-manager.js');
                AnnotationManager = module.default;
            }
            
            this.annotationManager = new AnnotationManager(this.rendition);
            await this.annotationManager.init(this.currentBookKey);
            
            this.annotationManager.onAnnotationAdded = (annotation) => {
                this.refreshAnnotationList();
            };
            
            this.annotationManager.onAnnotationRemoved = (annotation) => {
                this.refreshAnnotationList();
            };
            
            this.annotationManager.onAnnotationClicked = (annotation) => {
                this.rendition.display(annotation.cfiRange);
            };
            
            this.refreshAnnotationList();
            
        } catch (e) {
            console.error('初始化注解管理器失败:', e);
        }
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
        
        if (!query) return;
        
        const caseSensitive = document.getElementById('searchCaseSensitive').checked;
        const resultsContainer = document.getElementById('searchResults');
        const statusEl = document.getElementById('searchStatus');
        
        statusEl.style.display = 'flex';
        resultsContainer.innerHTML = '<div class="search-empty">搜索中...</div>';
        
        try {
            if (!this.searchManager.index) {
                document.getElementById('searchStatusText').textContent = '正在建立索引...';
                await this.searchManager.buildIndex();
            }
            
            const results = await this.searchManager.search(query, { caseSensitive });
            
            statusEl.style.display = 'none';
            
            if (results.length === 0) {
                resultsContainer.innerHTML = '<div class="search-empty">未找到匹配结果</div>';
                return;
            }
            
            resultsContainer.innerHTML = results.map((result) => {
                const chapter = result.section?.title || '未知章节';
                const href = result.section?.href || '';
                const context = result.match?.context || {};
                const highlightedText = this.highlightSearchTerm(context.text || '', query);
                
                return `
                    <div class="search-result-item" data-href="${href}">
                        <div class="search-result-chapter">${chapter}</div>
                        <div class="search-result-text">${highlightedText}</div>
                    </div>
                `;
            }).join('');
            
            resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const href = item.dataset.href;
                    if (href) {
                        this.rendition.display(href);
                    }
                    this.closeSearch();
                });
            });
            
        } catch (e) {
            console.error('搜索失败:', e);
            statusEl.style.display = 'none';
            resultsContainer.innerHTML = '<div class="search-empty">搜索出错</div>';
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
     * 转义正则特殊字符
     * @param {string} str - 原始字符串
     * @returns {string}
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 切换笔记标签页
     * @param {string} tabName - 标签名称
     */
    switchAnnotationTab(tabName) {
        const panels = {
            highlights: 'highlightsPanel',
            notes: 'notesPanel',
            bookmarks: 'bookmarksPanel'
        };
        
        Object.values(panels).forEach(panelId => {
            document.getElementById(panelId).style.display = 'none';
        });
        
        if (panels[tabName]) {
            document.getElementById(panels[tabName]).style.display = 'block';
        }
        
        this.refreshAnnotationList();
    }

    /**
     * 刷新注解列表
     */
    async refreshAnnotationList() {
        if (!this.annotationManager) return;
        
        const annotations = await this.annotationManager.getAnnotations();
        
        const highlights = annotations.filter(a => a.type === 'highlight');
        const notes = annotations.filter(a => a.type === 'note');
        const bookmarks = annotations.filter(a => a.type === 'bookmark');
        
        this.renderAnnotationItems('highlightsList', highlights, 'highlight');
        this.renderAnnotationItems('notesList', notes, 'note');
        this.renderAnnotationItems('bookmarksList', bookmarks, 'bookmark');
    }

    /**
     * 渲染注解项
     * @param {string} listId - 列表元素ID
     * @param {Array} items - 注解项数组
     * @param {string} type - 注解类型
     */
    renderAnnotationItems(listId, items, type) {
        const list = document.getElementById(listId);
        
        if (items.length === 0) {
            const emptyText = {
                highlight: '暂无高亮',
                note: '暂无笔记',
                bookmark: '暂无书签'
            };
            list.innerHTML = `<div class="annotation-empty">${emptyText[type]}</div>`;
            return;
        }
        
        list.innerHTML = items.map(item => `
            <div class="annotation-item" data-id="${item.id}" data-cfi="${item.cfiRange}">
                <div class="annotation-item-header">
                    <span class="annotation-item-chapter">${item.chapter || '当前位置'}</span>
                    <span class="annotation-item-date">${this.formatDate(item.timestamp)}</span>
                </div>
                <div class="annotation-item-text">${item.text || '点击跳转'}</div>
                ${item.note ? `<div class="annotation-item-note">${item.note}</div>` : ''}
                <div class="annotation-item-actions">
                    <button class="annotation-item-btn goto">跳转</button>
                    <button class="annotation-item-btn delete">删除</button>
                </div>
            </div>
        `).join('');
        
        list.querySelectorAll('.annotation-item').forEach(el => {
            const id = el.dataset.id;
            const cfi = el.dataset.cfi;
            
            el.querySelector('.goto').addEventListener('click', (e) => {
                e.stopPropagation();
                this.rendition.display(cfi);
                this.closeAnnotations();
            });
            
            el.querySelector('.delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.annotationManager.removeAnnotation(id);
                this.refreshAnnotationList();
            });
            
            el.addEventListener('click', () => {
                this.rendition.display(cfi);
            });
        });
    }

    /**
     * 添加书签
     */
    async addBookmark() {
        if (!this.annotationManager || !this.rendition) return;
        
        const location = this.rendition.currentLocation();
        if (!location || !location.start) return;
        
        const cfiRange = location.start.cfi;
        const chapter = this.getCurrentChapterName();
        
        await this.annotationManager.addBookmark(cfiRange, chapter);
        this.refreshAnnotationList();
    }

    /**
     * 获取当前章节名称
     * @returns {string}
     */
    getCurrentChapterName() {
        if (!this.rendition) return '';
        const location = this.rendition.currentLocation();
        if (location && location.start && location.start.href) {
            const tocItem = this.tocData?.find(item => item.href === location.start.href);
            return tocItem?.label || location.start.href;
        }
        return '当前位置';
    }

    /**
     * 格式化日期
     * @param {number} timestamp - 时间戳
     * @returns {string}
     */
    formatDate(timestamp) {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    /**
     * 手动切换竖排/横排模式
     */
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
