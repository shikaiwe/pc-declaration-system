/**
 * 搜索功能模块
 * 提供全文搜索、索引构建和结果高亮功能
 * 
 * @module SearchManager
 * @version 1.0.0
 */

import dbManager from './database.js';

/**
 * 搜索结果类型
 */
const SearchResultType = {
    TEXT: 'text',
    CHAPTER: 'chapter',
    ANNOTATION: 'annotation'
};

/**
 * 搜索管理器类
 */
class SearchManager {
    /**
     * 创建搜索管理器实例
     * @param {Object} book - epub.js book 实例
     */
    constructor(book) {
        this.book = book;
        this.index = null;
        this.sectionTexts = new Map();
        this.isIndexing = false;
        this.indexProgress = 0;
        this.tocMap = new Map(); // href -> title 映射
        
        this.onProgress = null;
        this.onComplete = null;
    }

    /**
     * 构建搜索索引
     * @param {Object} options - 配置选项
     * @returns {Promise<void>}
     */
    async buildIndex(options = {}) {
        if (this.isIndexing) {
            return;
        }
        
        this.isIndexing = true;
        this.indexProgress = 0;
        let successCount = 0;
        let failCount = 0;
        
        try {
            // 构建 TOC 映射
            await this.buildTocMap();
            
            const spine = await this.book.loaded.spine;
            const total = spine.items.length;
            const batchSize = options.batchSize || 5; // 每批处理的章节数
            
            // 初始化索引结构
            this.index = {
                sections: [],
                words: new Map()
            };
            
            // 分批遍历所有章节，避免阻塞渲染
            for (let i = 0; i < total; i += batchSize) {
                const batch = spine.items.slice(i, Math.min(i + batchSize, total));
                
                // 处理当前批次
                for (let j = 0; j < batch.length; j++) {
                    const section = batch[j];
                    try {
                        const result = await this.indexSection(section, i + j);
                        if (result) {
                            successCount++;
                        } else {
                            failCount++;
                        }
                    } catch (e) {
                        // 单个章节索引失败，不影响其他章节
                        failCount++;
                    }
                }
                
                // 更新进度
                const completed = Math.min(i + batchSize, total);
                this.indexProgress = (completed / total) * 100;
                this.onProgress?.({
                    current: completed,
                    total,
                    percentage: this.indexProgress
                });
                
                // 使用 requestIdleCallback 让出主线程，避免阻塞渲染
                if (i + batchSize < total) {
                    await this.yieldToMainThread();
                }
            }
            
            this.isIndexing = false;
            this.onComplete?.();
            
            // 返回索引构建结果
            return {
                success: true,
                totalSections: total,
                indexedSections: successCount,
                failedSections: failCount
            };
            
        } catch (e) {
            console.error('构建搜索索引失败:', e);
            this.isIndexing = false;
            throw e;
        }
    }
    
    /**
     * 构建 TOC 映射
     * @private
     */
    async buildTocMap() {
        try {
            const toc = await this.book.loaded.navigation;
            if (toc && toc.toc) {
                this.buildTocMapRecursive(toc.toc);
            }
        } catch (e) {
            console.warn('构建 TOC 映射失败:', e);
        }
    }
    
    /**
     * 递归构建 TOC 映射
     * @param {Array} items - TOC 项数组
     * @private
     */
    buildTocMapRecursive(items) {
        if (!items || !Array.isArray(items)) return;
        
        items.forEach(item => {
            if (item.href) {
                // 提取 href（去掉 # 后面的锚点）
                const href = item.href.split('#')[0];
                if (!this.tocMap.has(href)) {
                    this.tocMap.set(href, item.label);
                }
            }
            
            // 递归处理子项
            if (item.subitems && item.subitems.length > 0) {
                this.buildTocMapRecursive(item.subitems);
            }
        });
    }

    /**
     * 让出主线程，避免阻塞渲染
     * @private
     */
    async yieldToMainThread() {
        return new Promise(resolve => {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(() => resolve(), { timeout: 100 });
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    /**
     * 索引单个章节
     * @param {Object} section - 章节对象
     * @param {number} index - 章节索引
     * @returns {Promise<boolean>} - 是否成功索引
     * @private
     */
    async indexSection(section, index) {
        try {
            const sectionObj = this.book.section(section.href);
            if (!sectionObj) {
                return false;
            }
            
            const contents = await sectionObj.load();
            if (!contents) {
                return false;
            }
            
            const text = this.extractText(contents);
            
            if (!text || text.trim().length === 0) {
                return false;
            }
            
            // 检查是否包含错误信息
            if (text.includes('This page contains the following errors')) {
                return false;
            }
            
            this.sectionTexts.set(section.href, text);
            
            // 从 TOC 映射中获取章节标题
            const href = section.href.split('#')[0];
            const title = this.tocMap.get(href) || section.label || `章节 ${index + 1}`;
            
            this.index.sections.push({
                href: section.href,
                index: index,
                title: title,
                text: text,
                wordCount: text.length
            });
            
            return true;
            
        } catch (e) {
            // 静默处理索引错误，不影响其他章节
            return false;
        }
    }

    /**
     * 提取文本内容
     * @param {Document} contents - 内容文档
     * @returns {string}
     * @private
     */
    extractText(contents) {
        try {
            // 处理不同类型的内容对象
            let doc = contents;
            
            // 如果是 Document 对象
            if (contents instanceof Document) {
                doc = contents;
            }
            // 如果有 ownerDocument 属性（DOM 元素）
            else if (contents && contents.ownerDocument) {
                doc = contents.ownerDocument;
            }
            // 如果有 documentElement 属性
            else if (contents && contents.documentElement) {
                doc = contents;
            }
            
            // 获取 body 元素
            const body = doc.body || doc.documentElement || doc;
            
            if (!body) {
                return '';
            }
            
            // 移除脚本和样式
            try {
                const scripts = body.querySelectorAll('script, style, nav');
                scripts.forEach(s => s.remove());
            } catch (e) {
                // querySelectorAll 可能失败，忽略错误
            }
            
            // 提取文本内容
            const text = body.textContent || body.innerText || '';
            
            // 清理文本：移除多余的空白字符
            return text.replace(/\s+/g, ' ').trim();
            
        } catch (e) {
            console.warn('提取文本失败:', e);
            return '';
        }
    }

    /**
     * 执行搜索
     * @param {string} query - 搜索关键词
     * @param {Object} options - 搜索选项
     * @returns {Promise<Array>}
     */
    async search(query, options = {}) {
        if (!query || query.trim().length === 0) {
            return [];
        }
        
        // 如果索引未构建，先构建
        if (!this.index) {
            await this.buildIndex();
        }
        
        const results = [];
        const caseSensitive = options.caseSensitive || false;
        const searchTerm = caseSensitive ? query.trim() : query.toLowerCase().trim();
        const maxResults = options.maxResults || 200; // 增加最大结果数到200
        const contextLength = options.contextLength || 100; // 增加上下文长度到100
        
        // 搜索每个章节
        for (const section of this.index.sections) {
            const text = caseSensitive ? section.text : section.text.toLowerCase();
            let position = 0;
            
            // 查找该章节中的所有匹配
            while ((position = text.indexOf(searchTerm, position)) !== -1) {
                const context = this.getContext(section.text, position, searchTerm.length, contextLength);
                
                results.push({
                    type: SearchResultType.TEXT,
                    section: {
                        href: section.href,
                        index: section.index,
                        title: section.title
                    },
                    match: {
                        text: query,
                        position: position,
                        context: context
                    },
                    score: this.calculateScore(position, section.text.length, section.index)
                });
                
                position += searchTerm.length;
                
                // 达到最大结果数，停止搜索
                if (results.length >= maxResults) break;
            }
            
            // 达到最大结果数，停止搜索
            if (results.length >= maxResults) break;
        }
        
        // 按章节顺序排序，同一章节内按位置排序
        results.sort((a, b) => {
            // 先按章节索引排序
            if (a.section.index !== b.section.index) {
                return a.section.index - b.section.index;
            }
            // 同一章节内按位置排序
            return a.match.position - b.match.position;
        });
        
        return results.slice(0, maxResults);
    }

    /**
     * 获取上下文
     * @param {string} text - 完整文本
     * @param {number} position - 匹配位置
     * @param {number} length - 匹配长度
     * @param {number} contextLength - 上下文长度
     * @returns {Object}
     * @private
     */
    getContext(text, position, length, contextLength) {
        const start = Math.max(0, position - contextLength);
        const end = Math.min(text.length, position + length + contextLength);
        
        let context = text.slice(start, end);
        
        // 添加省略号
        if (start > 0) context = '...' + context;
        if (end < text.length) context = context + '...';
        
        return {
            text: context,
            highlightStart: position - start + (start > 0 ? 3 : 0),
            highlightLength: length
        };
    }

    /**
     * 计算搜索分数
     * @param {number} position - 匹配位置
     * @param {number} textLength - 文本长度
     * @param {number} sectionIndex - 章节索引
     * @returns {number}
     * @private
     */
    calculateScore(position, textLength, sectionIndex) {
        // 位置越靠前分数越高
        const positionScore = 1 - (position / textLength);
        // 章节越靠前分数越高
        const sectionScore = 1 - (sectionIndex / 100);
        return Math.round((positionScore * 0.7 + sectionScore * 0.3) * 100);
    }

    /**
     * 在当前章节搜索
     * @param {string} query - 搜索关键词
     * @param {string} href - 当前章节 href
     * @returns {Promise<Array>}
     */
    async searchInSection(query, href) {
        if (!query || query.trim().length === 0) {
            return [];
        }
        
        const text = this.sectionTexts.get(href);
        if (!text) return [];
        
        const results = [];
        const searchTerm = query.toLowerCase().trim();
        const textLower = text.toLowerCase();
        let position = 0;
        
        while ((position = textLower.indexOf(searchTerm, position)) !== -1) {
            const context = this.getContext(text, position, searchTerm.length, 50);
            
            results.push({
                position,
                context,
                text: query
            });
            
            position += searchTerm.length;
        }
        
        return results;
    }

    /**
     * 获取索引进度
     * @returns {number}
     */
    getProgress() {
        return this.indexProgress;
    }

    /**
     * 是否正在索引
     * @returns {boolean}
     */
    isCurrentlyIndexing() {
        return this.isIndexing;
    }

    /**
     * 获取索引统计
     * @returns {Object}
     */
    getIndexStats() {
        if (!this.index) return null;
        
        return {
            sectionCount: this.index.sections.length,
            totalWords: this.index.sections.reduce((sum, s) => sum + s.wordCount, 0),
            isComplete: !this.isIndexing
        };
    }

    /**
     * 清除索引
     */
    clearIndex() {
        this.index = null;
        this.sectionTexts.clear();
        this.indexProgress = 0;
    }
}

/**
 * 搜索结果高亮器类
 */
class SearchHighlighter {
    /**
     * 创建高亮器实例
     * @param {Object} rendition - epub.js rendition 实例
     */
    constructor(rendition) {
        this.rendition = rendition;
        this.highlights = new Map();
        this.currentHighlightId = 0;
    }

    /**
     * 高亮搜索结果
     * @param {Array} results - 搜索结果
     * @param {string} color - 高亮颜色
     */
    async highlightResults(results, color = '#ffff00') {
        this.clearHighlights();
        
        for (const result of results) {
            try {
                // 计算 CFI 范围（简化版本）
                const cfiRange = await this.calculateCfiRange(result);
                
                if (cfiRange) {
                    const id = `search-highlight-${++this.currentHighlightId}`;
                    
                    this.rendition.annotations.highlight(
                        cfiRange,
                        { type: 'search', result },
                        (e) => {
                            console.log('点击搜索结果:', result);
                        },
                        id,
                        {
                            'background-color': color,
                            'opacity': 0.4
                        }
                    );
                    
                    this.highlights.set(id, cfiRange);
                }
            } catch (e) {
                // 忽略无法高亮的结果
            }
        }
    }

    /**
     * 计算 CFI 范围
     * @param {Object} result - 搜索结果
     * @returns {string|null}
     * @private
     */
    async calculateCfiRange(result) {
        // 这是一个简化版本，实际实现需要更复杂的 CFI 计算
        // 需要根据文本位置计算精确的 CFI
        return null;
    }

    /**
     * 清除所有高亮
     */
    clearHighlights() {
        for (const [id, cfiRange] of this.highlights) {
            try {
                this.rendition.annotations.remove(cfiRange, 'highlight');
            } catch (e) {
                // 忽略错误
            }
        }
        
        this.highlights.clear();
        this.currentHighlightId = 0;
    }

    /**
     * 获取高亮数量
     * @returns {number}
     */
    getCount() {
        return this.highlights.size;
    }
}

/**
 * 搜索面板 UI 类
 */
class SearchPanel {
    /**
     * 创建搜索面板实例
     * @param {Object} searchManager - 搜索管理器实例
     * @param {Object} rendition - epub.js rendition 实例
     */
    constructor(searchManager, rendition) {
        this.searchManager = searchManager;
        this.rendition = rendition;
        this.highlighter = new SearchHighlighter(rendition);
        this.panel = null;
        this.results = [];
        this.currentQuery = '';
        
        this.onResultClick = null;
    }

    /**
     * 创建并显示搜索面板
     */
    create() {
        this.panel = document.createElement('div');
        this.panel.className = 'search-panel';
        this.panel.innerHTML = `
            <div class="search-panel-header">
                <input type="text" class="search-input" placeholder="搜索书籍内容...">
                <button class="search-btn">搜索</button>
                <button class="search-close-btn">&times;</button>
            </div>
            <div class="search-panel-body">
                <div class="search-status"></div>
                <div class="search-results"></div>
            </div>
        `;
        
        document.body.appendChild(this.panel);
        
        this.bindEvents();
    }

    /**
     * 绑定事件
     * @private
     */
    bindEvents() {
        const input = this.panel.querySelector('.search-input');
        const searchBtn = this.panel.querySelector('.search-btn');
        const closeBtn = this.panel.querySelector('.search-close-btn');
        
        // 搜索按钮点击
        searchBtn.addEventListener('click', () => {
            this.performSearch(input.value);
        });
        
        // 回车搜索
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch(input.value);
            }
        });
        
        // 关闭按钮
        closeBtn.addEventListener('click', () => {
            this.hide();
        });
    }

    /**
     * 执行搜索
     * @param {string} query - 搜索关键词
     */
    async performSearch(query) {
        if (!query || query.trim().length === 0) {
            return;
        }
        
        this.currentQuery = query;
        const statusEl = this.panel.querySelector('.search-status');
        const resultsEl = this.panel.querySelector('.search-results');
        
        // 显示搜索中状态
        statusEl.textContent = '搜索中...';
        resultsEl.innerHTML = '';
        
        try {
            // 检查是否需要构建索引
            if (!this.searchManager.index) {
                statusEl.textContent = '正在构建索引...';
                
                this.searchManager.onProgress = (progress) => {
                    statusEl.textContent = `正在构建索引... ${progress.percentage.toFixed(0)}%`;
                };
                
                await this.searchManager.buildIndex();
            }
            
            // 执行搜索
            this.results = await this.searchManager.search(query);
            
            // 显示结果
            this.renderResults();
            
        } catch (e) {
            statusEl.textContent = '搜索失败';
            console.error('搜索失败:', e);
        }
    }

    /**
     * 渲染搜索结果
     * @private
     */
    renderResults() {
        const statusEl = this.panel.querySelector('.search-status');
        const resultsEl = this.panel.querySelector('.search-results');
        
        if (this.results.length === 0) {
            statusEl.textContent = '未找到匹配结果';
            resultsEl.innerHTML = '';
            return;
        }
        
        statusEl.textContent = `找到 ${this.results.length} 个结果`;
        
        resultsEl.innerHTML = this.results.map((result, index) => `
            <div class="search-result-item" data-index="${index}">
                <div class="result-section">${result.section.title}</div>
                <div class="result-context">${this.highlightContext(result.match.context)}</div>
            </div>
        `).join('');
        
        // 绑定点击事件
        resultsEl.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.onResultClick?.(this.results[index]);
            });
        });
    }

    /**
     * 高亮上下文中的关键词
     * @param {Object} context - 上下文对象
     * @returns {string}
     * @private
     */
    highlightContext(context) {
        const text = context.text;
        const start = context.highlightStart;
        const length = context.highlightLength;
        
        return text.slice(0, start) +
            '<mark>' + text.slice(start, start + length) + '</mark>' +
            text.slice(start + length);
    }

    /**
     * 显示搜索面板
     */
    show() {
        if (!this.panel) {
            this.create();
        }
        
        this.panel.classList.add('active');
        this.panel.querySelector('.search-input').focus();
    }

    /**
     * 隐藏搜索面板
     */
    hide() {
        if (this.panel) {
            this.panel.classList.remove('active');
        }
    }

    /**
     * 切换显示状态
     */
    toggle() {
        if (this.panel && this.panel.classList.contains('active')) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * 销毁
     */
    destroy() {
        this.highlighter.clearHighlights();
        
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
    }
}

export {
    SearchManager,
    SearchHighlighter,
    SearchPanel,
    SearchResultType
};

export default SearchManager;
