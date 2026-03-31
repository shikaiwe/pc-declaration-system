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
     * @param {string} bookKey - 书籍唯一标识
     */
    constructor(book, bookKey = 'unknown') {
        this.book = book;
        this.bookKey = bookKey;
        this.index = null;
        this.sectionTexts = new Map();
        this.isIndexing = false;
        this.indexProgress = 0;
        this.tocMap = new Map();
        
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
        
        // 索引缓存配置
        this.cacheKey = `epub-search-index-${bookKey}`;
        this.cacheVersion = '1.0';
        this.maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7天
    }

    /**
     * 构建搜索索引
     * @param {Object} options - 配置选项
     * @returns {Promise<Object>} 索引构建结果
     */
    async buildIndex(options = {}) {
        if (this.isIndexing) {
            return {
                success: false,
                error: '索引正在构建中',
                totalSections: 0,
                indexedSections: 0,
                failedSections: 0
            };
        }
        
        this.isIndexing = true;
        this.indexProgress = 0;
        let successCount = 0;
        let failCount = 0;
        const failedSections = [];
        
        try {
            // 构建 TOC 映射
            await this.buildTocMap();
            
            const spine = await this.book.loaded.spine;
            if (!spine || !spine.items || spine.items.length === 0) {
                throw new Error('书籍目录为空,无法构建索引');
            }
            
            const total = spine.items.length;
            const batchSize = options.batchSize || 5;
            
            // 初始化索引结构
            this.index = {
                sections: [],
                words: new Map(),
                builtAt: Date.now(),
                bookKey: this.bookKey || 'unknown'
            };
            
            // 分批遍历所有章节,避免阻塞渲染
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
                            failedSections.push({
                                href: section.href,
                                index: i + j,
                                reason: '内容提取失败'
                            });
                        }
                    } catch (e) {
                        failCount++;
                        failedSections.push({
                            href: section.href,
                            index: i + j,
                            reason: e.message || '未知错误'
                        });
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
                
                // 使用 requestIdleCallback 让出主线程
                if (i + batchSize < total) {
                    await this.yieldToMainThread();
                }
            }
            
            this.isIndexing = false;
            this.onComplete?.();
            
            // 验证索引构建结果
            const successRate = total > 0 ? (successCount / total) : 0;
            const isSuccessful = successRate >= 0.3 && successCount > 0;
            
            if (!isSuccessful) {
                console.error('索引构建失败: 成功率过低', {
                    total,
                    successCount,
                    failCount,
                    successRate: `${(successRate * 100).toFixed(1)}%`
                });
                
                return {
                    success: false,
                    error: `索引构建成功率过低 (${(successRate * 100).toFixed(1)}%),无法提供有效搜索`,
                    totalSections: total,
                    indexedSections: successCount,
                    failedSections: failCount,
                    failedSectionDetails: failedSections.slice(0, 10)
                };
            }
            
            // 保存索引到缓存
            await this.saveIndexToCache();
            
            return {
                success: true,
                totalSections: total,
                indexedSections: successCount,
                failedSections: failCount,
                successRate: `${(successRate * 100).toFixed(1)}%`,
                warnings: failCount > 0 ? [`有 ${failCount} 个章节索引失败`] : []
            };
            
        } catch (e) {
            console.error('构建搜索索引失败:', e);
            this.isIndexing = false;
            
            return {
                success: false,
                error: e.message || '索引构建过程出错',
                totalSections: 0,
                indexedSections: successCount,
                failedSections: failCount
            };
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
     * @param {Document|Element} contents - 内容文档或元素
     * @returns {string} 提取的文本内容
     * @private
     */
    extractText(contents) {
        try {
            if (!contents) {
                return '';
            }
            
            // 处理不同类型的内容对象
            let doc = contents;
            let body = null;
            
            // 如果是 Document 对象
            if (contents instanceof Document) {
                doc = contents;
                body = doc.body || doc.documentElement;
            }
            // 如果有 ownerDocument 属性（DOM 元素）
            else if (contents.ownerDocument) {
                doc = contents.ownerDocument;
                body = contents;
            }
            // 如果有 documentElement 属性
            else if (contents.documentElement) {
                doc = contents;
                body = doc.body || doc.documentElement;
            }
            // 如果是其他类型的对象,尝试直接获取文本
            else if (typeof contents === 'object') {
                body = contents;
            }
            
            if (!body) {
                console.warn('无法找到有效的文档主体');
                return '';
            }
            
            // 克隆节点以避免修改原始DOM
            let cloneBody;
            try {
                cloneBody = body.cloneNode(true);
            } catch (e) {
                cloneBody = body;
            }
            
            // 移除脚本、样式、导航等非内容元素
            try {
                const removeSelectors = [
                    'script', 'style', 'nav', 'header', 'footer',
                    'noscript', 'iframe', 'svg', 'form',
                    '.hidden', '.invisible', '[style*="display:none"]',
                    '[style*="visibility:hidden"]'
                ];
                
                const elementsToRemove = cloneBody.querySelectorAll(removeSelectors.join(', '));
                elementsToRemove.forEach(el => {
                    try {
                        el.remove();
                    } catch (e) {
                        // 忽略删除错误
                    }
                });
            } catch (e) {
                // querySelectorAll 可能失败,继续处理
            }
            
            // 提取文本内容
            let text = '';
            try {
                text = cloneBody.textContent || cloneBody.innerText || cloneBody.text || '';
            } catch (e) {
                // 如果textContent失败,尝试其他方法
                try {
                    text = cloneBody.innerHTML || '';
                    // 移除HTML标签
                    text = text.replace(/<[^>]*>/g, ' ');
                } catch (e2) {
                    text = '';
                }
            }
            
            // 清理文本
            text = text
                .replace(/[\r\n\t]+/g, ' ')
                .replace(/\s+/g, ' ')
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                .trim();
            
            // 验证文本有效性
            if (!text || text.length < 5) {
                return '';
            }
            
            // 检查是否包含错误信息
            const errorPatterns = [
                'This page contains the following errors',
                'XML Parsing Error',
                'Error parsing XML',
                'Content is not allowed in prolog'
            ];
            
            for (const pattern of errorPatterns) {
                if (text.includes(pattern)) {
                    return '';
                }
            }
            
            return text;
            
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
            isComplete: !this.isIndexing,
            builtAt: this.index.builtAt,
            bookKey: this.index.bookKey
        };
    }

    /**
     * 保存索引到缓存
     * @returns {Promise<boolean>}
     */
    async saveIndexToCache() {
        if (!this.index || !this.index.sections || this.index.sections.length === 0) {
            return false;
        }
        
        try {
            // 准备缓存数据
            const cacheData = {
                version: this.cacheVersion,
                bookKey: this.bookKey,
                builtAt: Date.now(),
                sections: this.index.sections.map(section => ({
                    href: section.href,
                    index: section.index,
                    title: section.title,
                    text: section.text,
                    wordCount: section.wordCount
                }))
            };
            
            // 尝试使用 IndexedDB
            if (dbManager && this._dbAvailable) {
                await dbManager.put('searchIndex', {
                    bookKey: this.bookKey,
                    ...cacheData
                });
                return true;
            }
            
            // 降级到 localStorage
            const cacheString = JSON.stringify(cacheData);
            
            // 检查缓存大小
            if (cacheString.length > 5 * 1024 * 1024) {
                console.warn('索引缓存过大,跳过缓存');
                return false;
            }
            
            localStorage.setItem(this.cacheKey, cacheString);
            return true;
            
        } catch (e) {
            console.warn('保存索引缓存失败:', e);
            return false;
        }
    }

    /**
     * 从缓存加载索引
     * @returns {Promise<boolean>}
     */
    async loadIndexFromCache() {
        try {
            let cacheData = null;
            
            // 尝试从 IndexedDB 加载
            if (dbManager && this._dbAvailable) {
                cacheData = await dbManager.get('searchIndex', this.bookKey);
            }
            
            // 降级到 localStorage
            if (!cacheData) {
                const cacheString = localStorage.getItem(this.cacheKey);
                if (cacheString) {
                    cacheData = JSON.parse(cacheString);
                }
            }
            
            if (!cacheData) {
                return false;
            }
            
            // 验证缓存版本
            if (cacheData.version !== this.cacheVersion) {
                console.info('索引缓存版本不匹配,需要重建');
                await this.clearIndexCache();
                return false;
            }
            
            // 验证缓存年龄
            const cacheAge = Date.now() - cacheData.builtAt;
            if (cacheAge > this.maxCacheAge) {
                console.info('索引缓存已过期,需要重建');
                await this.clearIndexCache();
                return false;
            }
            
            // 验证书籍标识
            if (cacheData.bookKey !== this.bookKey) {
                console.warn('索引缓存书籍标识不匹配');
                await this.clearIndexCache();
                return false;
            }
            
            // 恢复索引
            this.index = {
                sections: cacheData.sections,
                words: new Map(),
                builtAt: cacheData.builtAt,
                bookKey: cacheData.bookKey
            };
            
            // 恢复章节文本映射
            this.sectionTexts.clear();
            cacheData.sections.forEach(section => {
                this.sectionTexts.set(section.href, section.text);
            });
            
            console.info(`成功加载索引缓存: ${cacheData.sections.length} 个章节`);
            return true;
            
        } catch (e) {
            console.warn('加载索引缓存失败:', e);
            await this.clearIndexCache();
            return false;
        }
    }

    /**
     * 清除索引缓存
     * @returns {Promise<void>}
     */
    async clearIndexCache() {
        try {
            // 清除 IndexedDB
            if (dbManager && this._dbAvailable) {
                await dbManager.delete('searchIndex', this.bookKey);
            }
            
            // 清除 localStorage
            localStorage.removeItem(this.cacheKey);
            
        } catch (e) {
            console.warn('清除索引缓存失败:', e);
        }
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
