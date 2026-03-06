/**
 * EPUB电子书阅读器模块
 * 提供完整的电子书阅读功能，包括书架管理、阅读控制、进度追踪等
 * 直接从服务器静态目录读取EPUB文件
 */

class EpubReader {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.currentBookKey = null;
        this.books = [];
        this.settings = {
            fontSize: 100,
            theme: 'light'
        };
        this.readingProgress = {};
        // EPUB静态文件目录URL - 修改为你的实际路径
        this.EPUB_DIR = '/static/epub/';
        // 书籍配置文件URL
        this.BOOKS_CONFIG_URL = '/static/epub/books.json';
        
        this.init();
    }

    /**
     * 初始化阅读器
     */
    init() {
        this.loadSettings();
        this.loadReadingProgress();
        this.bindEvents();
        this.loadBooks();
        this.applyTheme(this.settings.theme);
    }

    /**
     * 加载用户设置
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('epub-reader-settings');
            if (saved) {
                this.settings = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('加载设置失败:', e);
        }
        this.updateFontSizeDisplay();
    }

    /**
     * 保存用户设置
     */
    saveSettings() {
        try {
            localStorage.setItem('epub-reader-settings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('保存设置失败:', e);
        }
    }

    /**
     * 加载阅读进度
     */
    loadReadingProgress() {
        try {
            const saved = localStorage.getItem('epub-reader-progress');
            if (saved) {
                this.readingProgress = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('加载阅读进度失败:', e);
        }
    }

    /**
     * 保存阅读进度
     */
    saveReadingProgress() {
        try {
            localStorage.setItem('epub-reader-progress', JSON.stringify(this.readingProgress));
        } catch (e) {
            console.warn('保存阅读进度失败:', e);
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        const backBtn = document.getElementById('backBtn');
        const tocBtn = document.getElementById('tocBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const closeTocBtn = document.getElementById('closeTocBtn');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        const overlay = document.getElementById('overlay');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const decreaseFont = document.getElementById('decreaseFont');
        const increaseFont = document.getElementById('increaseFont');
        const themeBtns = document.querySelectorAll('.theme-btn');

        backBtn.addEventListener('click', () => this.showBookshelf());
        tocBtn.addEventListener('click', () => this.toggleToc());
        settingsBtn.addEventListener('click', () => this.toggleSettings());
        closeTocBtn.addEventListener('click', () => this.closeToc());
        closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        overlay.addEventListener('click', () => this.closeSidebars());
        prevBtn.addEventListener('click', () => this.prevPage());
        nextBtn.addEventListener('click', () => this.nextPage());
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

        document.addEventListener('keyup', (e) => this.handleKeyup(e));
        
        window.addEventListener('beforeunload', () => {
            if (this.book) {
                this.book.destroy();
            }
        });
    }

    /**
     * 加载书籍列表
     * 从静态目录的books.json配置文件读取
     */
    async loadBooks() {
        try {
            const response = await fetch(this.BOOKS_CONFIG_URL);
            if (response.ok) {
                const data = await response.json();
                this.books = data.books || [];
            } else {
                console.warn('加载书籍配置失败，使用默认配置');
                this.books = this.getDefaultBooks();
            }
        } catch (e) {
            console.warn('加载书籍配置失败:', e);
            this.books = this.getDefaultBooks();
        }
        
        this.renderBookshelf();
    }

    /**
     * 获取默认书籍列表
     * 当配置文件不存在时使用
     */
    getDefaultBooks() {
        return [
            // 示例书籍，请根据实际文件修改
            // {
            //     key: 'example-book',
            //     name: '示例书籍',
            //     author: '作者名',
            //     url: '/static/epub/example-book.epub',
            //     cover: '/static/epub/covers/example-book.jpg'
            // }
        ];
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
                    <div class="book-cover" style="background-image: url('${book.cover}'); background-size: cover; background-position: center;">
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
                <p class="empty-hint">请将EPUB文件上传到服务器静态目录</p>
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
            // 直接从静态URL加载EPUB
            const bookUrl = bookData.url || `${this.EPUB_DIR}${bookData.key}.epub`;
            this.book = ePub(bookUrl);
            
            await this.book.ready;
            
            document.getElementById('bookTitle').textContent = bookData.name;
            document.getElementById('bookshelf').style.display = 'none';
            document.getElementById('readerViewer').style.display = 'flex';
            document.getElementById('progressInfo').style.display = 'block';
            document.getElementById('tocBtn').style.display = 'flex';
            document.getElementById('settingsBtn').style.display = 'flex';

            this.initRendition();
            this.loadToc();
            
            const savedLocation = this.readingProgress[bookData.key + '_location'];
            await this.rendition.display(savedLocation || undefined);
            
        } catch (e) {
            console.error('打开书籍失败:', e);
            alert('打开书籍失败，请检查文件是否存在');
        }
    }

    /**
     * 初始化渲染器
     */
    initRendition() {
        const viewer = document.getElementById('epubViewer');
        const viewerRect = viewer.getBoundingClientRect();

        this.rendition = this.book.renderTo('epubViewer', {
            width: viewerRect.width,
            height: viewerRect.height,
            spread: 'none',
            flow: 'paginated',
            manager: 'default'
        });

        this.rendition.themes.fontSize(`${this.settings.fontSize}%`);
        
        this.applyRenditionTheme();

        this.rendition.on('relocated', (location) => this.onRelocated(location));
        this.rendition.on('rendered', () => this.onRendered());
        this.rendition.on('resized', () => this.onResized());

        this.rendition.display();
    }

    /**
     * 应用渲染器主题
     */
    applyRenditionTheme() {
        if (!this.rendition) return;

        const themes = {
            light: {
                body: {
                    background: '#ffffff',
                    color: '#1a1a1a'
                }
            },
            sepia: {
                body: {
                    background: '#f4ecd8',
                    color: '#5c4b37'
                }
            },
            dark: {
                body: {
                    background: '#1a1a2e',
                    color: '#e0e0e0'
                }
            }
        };

        const theme = themes[this.settings.theme] || themes.light;
        this.rendition.themes.override('background', theme.body.background);
        this.rendition.themes.override('color', theme.body.color);
    }

    /**
     * 加载目录
     */
    async loadToc() {
        const tocContent = document.getElementById('tocContent');
        tocContent.innerHTML = '<div class="loading-toc"><span class="iconify loading-icon" data-icon="mdi:loading"></span><p>加载目录中...</p></div>';

        try {
            const navigation = await this.book.loaded.navigation;
            const toc = navigation.toc;

            if (!toc || toc.length === 0) {
                tocContent.innerHTML = '<div class="loading-toc"><p>此书没有目录</p></div>';
                return;
            }

            tocContent.innerHTML = '';
            this.renderTocItems(toc, tocContent, 1);
        } catch (e) {
            console.warn('加载目录失败:', e);
            tocContent.innerHTML = '<div class="loading-toc"><p>加载目录失败</p></div>';
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
        if (!location) return;

        const progress = Math.round(location.start.percentage * 100);
        
        document.getElementById('progressText').textContent = `${progress}%`;
        document.getElementById('progressFill').style.width = `${progress}%`;
        document.getElementById('progressLabel').textContent = `${progress}%`;

        if (this.currentBookKey) {
            this.readingProgress[this.currentBookKey] = progress;
            this.readingProgress[this.currentBookKey + '_location'] = location.start.cfi;
            this.saveReadingProgress();
        }

        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        prevBtn.disabled = location.atStart;
        nextBtn.disabled = location.atEnd;
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
        if (this.book) {
            this.book.destroy();
            this.book = null;
            this.rendition = null;
        }

        document.getElementById('bookTitle').textContent = '我的书架';
        document.getElementById('bookshelf').style.display = 'block';
        document.getElementById('readerViewer').style.display = 'none';
        document.getElementById('progressInfo').style.display = 'none';
        document.getElementById('tocBtn').style.display = 'none';
        document.getElementById('settingsBtn').style.display = 'none';
        
        this.closeSidebars();
        this.renderBookshelf();
    }

    /**
     * 上一页
     */
    prevPage() {
        if (this.rendition) {
            this.rendition.prev();
        }
    }

    /**
     * 下一页
     */
    nextPage() {
        if (this.rendition) {
            this.rendition.next();
        }
    }

    /**
     * 键盘事件处理
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyup(e) {
        if (!this.rendition) return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            this.prevPage();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
            e.preventDefault();
            this.nextPage();
        }
    }

    /**
     * 切换目录侧边栏
     */
    toggleToc() {
        const sidebar = document.getElementById('tocSidebar');
        const overlay = document.getElementById('overlay');
        const settingsSidebar = document.getElementById('settingsSidebar');
        
        settingsSidebar.classList.remove('active');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active', sidebar.classList.contains('active'));
    }

    /**
     * 切换设置侧边栏
     */
    toggleSettings() {
        const sidebar = document.getElementById('settingsSidebar');
        const overlay = document.getElementById('overlay');
        const tocSidebar = document.getElementById('tocSidebar');
        
        tocSidebar.classList.remove('active');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active', sidebar.classList.contains('active'));
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
     * 关闭所有侧边栏
     */
    closeSidebars() {
        document.getElementById('tocSidebar').classList.remove('active');
        document.getElementById('settingsSidebar').classList.remove('active');
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
    }

    /**
     * HTML转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.epubReader = new EpubReader();
});

export default EpubReader;
