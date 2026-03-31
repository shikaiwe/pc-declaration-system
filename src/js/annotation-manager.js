/**
 * 高亮和笔记系统模块
 * 提供文本选择、高亮、笔记添加和管理功能
 * 
 * @module AnnotationManager
 * @version 1.0.0
 */

import dbManager from './database.js';

/**
 * 注解类型枚举
 */
const AnnotationType = {
    HIGHLIGHT: 'highlight',
    UNDERLINE: 'underline',
    NOTE: 'note',
    BOOKMARK: 'bookmark'
};

/**
 * 默认高亮颜色（参考行业最佳实践：Kindle、微信读书、Apple Books）
 */
const DEFAULT_COLORS = {
    yellow: '#FFEB3B',
    green: '#81C784',
    blue: '#64B5F6',
    pink: '#F48FB1',
    orange: '#FFB74D',
    purple: '#BA68C8',
    red: '#E57373',
    cyan: '#4DD0E1'
};

/**
 * 高亮颜色显示名称
 */
const COLOR_NAMES = {
    yellow: '黄色',
    green: '绿色',
    blue: '蓝色',
    pink: '粉色',
    orange: '橙色',
    purple: '紫色',
    red: '红色',
    cyan: '青色'
};

/**
 * 注解管理器类
 */
class AnnotationManager {
    /**
     * 创建注解管理器实例
     * @param {Object} rendition - epub.js rendition 实例
     */
    constructor(rendition) {
        this.rendition = rendition;
        this.annotations = new Map();
        this.currentSelection = null;
        this.toolbar = null;
        this.noteDialog = null;
        this.bookKey = null;
        
        this.onAnnotationAdded = null;
        this.onAnnotationRemoved = null;
        this.onAnnotationClicked = null;
        this.onError = null;
    }

    /**
     * 初始化注解系统
     * @param {string} bookKey - 书籍标识
     */
    async init(bookKey) {
        this.bookKey = bookKey;
        
        this.bindSelectionEvents();
        
        this.createToolbar();
        
        this.createNoteDialog();
        
        this.createEditDialog();
        
        await this.loadAnnotations();
    }

    /**
     * 绑定文本选择事件
     * @private
     */
    bindSelectionEvents() {
        this.rendition.on('selected', (cfiRange, contents) => {
            this.currentSelection = {
                cfiRange,
                contents,
                text: this.getSelectedText(contents)
            };
            
            this.showToolbar(contents);
        });
        
        // 点击注解事件
        this.rendition.on('annotationClick', (e, annotation) => {
            this.onAnnotationClicked?.(annotation.data);
        });
    }

    /**
     * 获取选中文本
     * @param {Object} contents - 内容对象
     * @returns {string}
     * @private
     */
    getSelectedText(contents) {
        const selection = contents.window.getSelection();
        return selection ? selection.toString().trim() : '';
    }

    /**
     * 创建工具栏
     * @private
     */
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'annotation-toolbar';
        this.toolbar.innerHTML = `
            <div class="toolbar-content">
                <div class="toolbar-colors">
                    <button class="toolbar-btn btn-highlight" data-color="yellow" title="黄色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.yellow}"></span>
                    </button>
                    <button class="toolbar-btn btn-highlight" data-color="green" title="绿色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.green}"></span>
                    </button>
                    <button class="toolbar-btn btn-highlight" data-color="blue" title="蓝色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.blue}"></span>
                    </button>
                    <button class="toolbar-btn btn-highlight" data-color="pink" title="粉色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.pink}"></span>
                    </button>
                    <button class="toolbar-btn btn-highlight" data-color="orange" title="橙色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.orange}"></span>
                    </button>
                    <button class="toolbar-btn btn-highlight" data-color="purple" title="紫色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.purple}"></span>
                    </button>
                    <button class="toolbar-btn btn-highlight" data-color="red" title="红色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.red}"></span>
                    </button>
                    <button class="toolbar-btn btn-highlight" data-color="cyan" title="青色高亮">
                        <span class="color-dot" style="background: ${DEFAULT_COLORS.cyan}"></span>
                    </button>
                </div>
                <div class="toolbar-divider"></div>
                <div class="toolbar-actions">
                    <button class="toolbar-btn btn-underline" title="下划线">
                        <span class="iconify" data-icon="mdi:format-underline"></span>
                    </button>
                    <button class="toolbar-btn btn-note" title="添加笔记">
                        <span class="iconify" data-icon="mdi:note-plus"></span>
                    </button>
                    <button class="toolbar-btn btn-copy" title="复制">
                        <span class="iconify" data-icon="mdi:content-copy"></span>
                    </button>
                </div>
            </div>
        `;
        
        this.toolbar.style.display = 'none';
        document.body.appendChild(this.toolbar);
        
        this.bindToolbarEvents();
    }

    /**
     * 绑定工具栏按钮事件
     * @private
     */
    bindToolbarEvents() {
        // 高亮按钮
        this.toolbar.querySelectorAll('.btn-highlight').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.addHighlight(color);
            });
        });
        
        // 下划线按钮
        this.toolbar.querySelector('.btn-underline').addEventListener('click', () => {
            this.addUnderline();
        });
        
        // 笔记按钮
        this.toolbar.querySelector('.btn-note').addEventListener('click', () => {
            this.showNoteDialog();
        });
        
        // 复制按钮
        this.toolbar.querySelector('.btn-copy').addEventListener('click', () => {
            this.copySelection();
        });
    }

    /**
     * 显示工具栏
     * @param {Object} contents - 内容对象
     * @private
     */
    showToolbar(contents) {
        const selection = contents.window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 计算工具栏位置
        const toolbarWidth = 200;
        const toolbarHeight = 40;
        
        let left = rect.left + rect.width / 2 - toolbarWidth / 2;
        let top = rect.top - toolbarHeight - 10;
        
        // 边界检查
        left = Math.max(10, Math.min(left, window.innerWidth - toolbarWidth - 10));
        top = Math.max(10, top);
        
        this.toolbar.style.left = `${left}px`;
        this.toolbar.style.top = `${top}px`;
        this.toolbar.style.display = 'block';
    }

    /**
     * 隐藏工具栏
     */
    hideToolbar() {
        this.toolbar.style.display = 'none';
    }

    /**
     * 创建对话框基础 HTML
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题
     * @param {string} options.className - 额外的 CSS 类名
     * @param {boolean} options.showDeleteBtn - 是否显示删除按钮
     * @returns {string} HTML 字符串
     * @private
     */
    createDialogHTML(options) {
        const { title, className = '', showDeleteBtn = false } = options;
        
        const deleteBtn = showDeleteBtn ? '<button class="btn-delete">删除</button>' : '';
        
        return `
            <div class="note-dialog-overlay"></div>
            <div class="note-dialog-content">
                <div class="note-dialog-header">
                    <span class="note-dialog-title">${title}</span>
                    <button class="note-dialog-close">&times;</button>
                </div>
                <div class="note-dialog-body">
                    <div class="selected-text-preview"></div>
                    <textarea class="note-textarea" placeholder="输入笔记内容..."></textarea>
                    <div class="note-color-picker">
                        <span>颜色:</span>
                        <button class="color-option" data-color="yellow" style="background: ${DEFAULT_COLORS.yellow}" title="黄色"></button>
                        <button class="color-option" data-color="green" style="background: ${DEFAULT_COLORS.green}" title="绿色"></button>
                        <button class="color-option" data-color="blue" style="background: ${DEFAULT_COLORS.blue}" title="蓝色"></button>
                        <button class="color-option" data-color="pink" style="background: ${DEFAULT_COLORS.pink}" title="粉色"></button>
                        <button class="color-option" data-color="orange" style="background: ${DEFAULT_COLORS.orange}" title="橙色"></button>
                        <button class="color-option" data-color="purple" style="background: ${DEFAULT_COLORS.purple}" title="紫色"></button>
                        <button class="color-option" data-color="red" style="background: ${DEFAULT_COLORS.red}" title="红色"></button>
                        <button class="color-option" data-color="cyan" style="background: ${DEFAULT_COLORS.cyan}" title="青色"></button>
                    </div>
                </div>
                <div class="note-dialog-footer">
                    ${deleteBtn}
                    <button class="btn-cancel">取消</button>
                    <button class="btn-save">保存</button>
                </div>
            </div>
        `;
    }

    /**
     * 创建笔记对话框
     * @private
     */
    createNoteDialog() {
        this.noteDialog = document.createElement('div');
        this.noteDialog.className = 'note-dialog';
        this.noteDialog.innerHTML = this.createDialogHTML({
            title: '添加笔记',
            showDeleteBtn: false
        });
        
        this.noteDialog.style.display = 'none';
        document.body.appendChild(this.noteDialog);
        
        this.bindNoteDialogEvents();
    }

    /**
     * 创建编辑对话框
     * @private
     */
    createEditDialog() {
        this.editDialog = document.createElement('div');
        this.editDialog.className = 'note-dialog edit-dialog';
        this.editDialog.innerHTML = this.createDialogHTML({
            title: '编辑注解',
            className: 'edit-dialog',
            showDeleteBtn: true
        });
        
        this.editDialog.style.display = 'none';
        document.body.appendChild(this.editDialog);
        
        this.bindEditDialogEvents();
    }

    /**
     * 绑定笔记对话框事件
     * @private
     */
    bindNoteDialogEvents() {
        this.noteDialog.querySelector('.note-dialog-close').addEventListener('click', () => {
            this.hideNoteDialog();
        });
        
        this.noteDialog.querySelector('.btn-cancel').addEventListener('click', () => {
            this.hideNoteDialog();
        });
        
        this.noteDialog.querySelector('.btn-save').addEventListener('click', () => {
            this.saveNote();
        });
        
        this.noteDialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                this.noteDialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        this.noteDialog.querySelector('.note-dialog-overlay').addEventListener('click', () => {
            this.hideNoteDialog();
        });
    }

    /**
     * 绑定编辑对话框事件
     * @private
     */
    bindEditDialogEvents() {
        this.editDialog.querySelector('.note-dialog-close').addEventListener('click', () => {
            this.hideEditDialog();
        });
        
        this.editDialog.querySelector('.btn-cancel').addEventListener('click', () => {
            this.hideEditDialog();
        });
        
        this.editDialog.querySelector('.btn-save').addEventListener('click', () => {
            this.saveEditAnnotation();
        });
        
        this.editDialog.querySelector('.btn-delete').addEventListener('click', () => {
            this.deleteEditAnnotation();
        });
        
        this.editDialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                this.editDialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        this.editDialog.querySelector('.note-dialog-overlay').addEventListener('click', () => {
            this.hideEditDialog();
        });
    }

    /**
     * 显示笔记对话框
     */
    showNoteDialog() {
        if (!this.currentSelection) return;
        
        const preview = this.noteDialog.querySelector('.selected-text-preview');
        preview.textContent = this.currentSelection.text;
        
        this.noteDialog.querySelector('.note-textarea').value = '';
        this.noteDialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
        this.noteDialog.querySelector('.color-option[data-color="yellow"]').classList.add('active');
        
        this.noteDialog.style.display = 'flex';
        this.hideToolbar();
    }

    /**
     * 隐藏笔记对话框
     */
    hideNoteDialog() {
        this.noteDialog.style.display = 'none';
    }

    /**
     * 显示编辑对话框
     * @param {Object} annotation - 注解对象
     */
    showEditDialog(annotation) {
        if (!annotation) return;
        
        this.currentEditAnnotation = annotation;
        
        const preview = this.editDialog.querySelector('.selected-text-preview');
        preview.textContent = annotation.text || '无文本';
        
        this.editDialog.querySelector('.note-textarea').value = annotation.note || '';
        
        this.editDialog.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.remove('active');
            const colorName = this.getColorNameByValue(annotation.style?.color);
            if (btn.dataset.color === colorName) {
                btn.classList.add('active');
            }
        });
        
        this.editDialog.style.display = 'flex';
    }

    /**
     * 隐藏编辑对话框
     */
    hideEditDialog() {
        this.editDialog.style.display = 'none';
        this.currentEditAnnotation = null;
    }

    /**
     * 保存编辑的注解
     */
    async saveEditAnnotation() {
        if (!this.currentEditAnnotation) return;
        
        const noteText = this.editDialog.querySelector('.note-textarea').value.trim();
        const activeColor = this.editDialog.querySelector('.color-option.active');
        const colorName = activeColor ? activeColor.dataset.color : 'yellow';
        
        const updates = {
            note: noteText,
            style: {
                ...this.currentEditAnnotation.style,
                color: DEFAULT_COLORS[colorName] || DEFAULT_COLORS.yellow
            }
        };
        
        await this.updateAnnotation(this.currentEditAnnotation.id, updates);
        this.hideEditDialog();
    }

    /**
     * 删除编辑中的注解
     */
    async deleteEditAnnotation() {
        if (!this.currentEditAnnotation) return;
        
        await this.removeAnnotation(this.currentEditAnnotation.id);
        this.hideEditDialog();
    }

    /**
     * 根据颜色值获取颜色名称
     * @param {string} colorValue - 颜色值
     * @returns {string}
     */
    getColorNameByValue(colorValue) {
        for (const [name, value] of Object.entries(DEFAULT_COLORS)) {
            if (value.toUpperCase() === colorValue?.toUpperCase()) {
                return name;
            }
        }
        return 'yellow';
    }

    /**
     * 保存笔记
     */
    async saveNote() {
        if (!this.currentSelection) return;
        
        const noteText = this.noteDialog.querySelector('.note-textarea').value.trim();
        const activeColor = this.noteDialog.querySelector('.color-option.active');
        const color = activeColor ? activeColor.dataset.color : 'yellow';
        
        const annotation = {
            id: this.generateId(),
            bookKey: this.bookKey,
            type: AnnotationType.NOTE,
            cfiRange: this.currentSelection.cfiRange,
            text: this.currentSelection.text,
            note: noteText,
            style: {
                color: DEFAULT_COLORS[color] || DEFAULT_COLORS.yellow
            },
            timestamp: Date.now()
        };
        
        await this.addAnnotation(annotation);
        this.hideNoteDialog();
    }

    /**
     * 添加高亮
     * @param {string} colorName - 颜色名称
     */
    async addHighlight(colorName) {
        if (!this.currentSelection) return;
        
        const annotation = {
            id: this.generateId(),
            bookKey: this.bookKey,
            type: AnnotationType.HIGHLIGHT,
            cfiRange: this.currentSelection.cfiRange,
            text: this.currentSelection.text,
            style: {
                color: DEFAULT_COLORS[colorName] || DEFAULT_COLORS.yellow,
                opacity: 0.4
            },
            timestamp: Date.now()
        };
        
        await this.addAnnotation(annotation);
        this.hideToolbar();
    }

    /**
     * 添加下划线
     */
    async addUnderline() {
        if (!this.currentSelection) return;
        
        const annotation = {
            id: this.generateId(),
            bookKey: this.bookKey,
            type: AnnotationType.UNDERLINE,
            cfiRange: this.currentSelection.cfiRange,
            text: this.currentSelection.text,
            style: {
                color: '#000000',
                style: 'solid'
            },
            timestamp: Date.now()
        };
        
        await this.addAnnotation(annotation);
        this.hideToolbar();
    }

    /**
     * 复制选中文本
     */
    async copySelection() {
        if (!this.currentSelection) return;
        
        try {
            await navigator.clipboard.writeText(this.currentSelection.text);
            this.hideToolbar();
        } catch (e) {
            console.error('复制失败:', e);
        }
    }

    /**
     * 添加注解
     * @param {Object} annotation - 注解对象
     */
    async addAnnotation(annotation) {
        // 添加到渲染
        this.rendition.annotations.highlight(
            annotation.cfiRange,
            annotation,
            (e) => {
                this.onAnnotationClicked?.(annotation);
            },
            `annotation-${annotation.id}`,
            {
                'background-color': annotation.style.color,
                'opacity': annotation.style.opacity || 0.4
            }
        );
        
        // 保存到内存
        this.annotations.set(annotation.id, annotation);
        
        // 保存到数据库
        try {
            await dbManager.put('annotations', annotation);
        } catch (e) {
            console.error('保存注解失败:', e);
        }
        
        // 触发回调
        this.onAnnotationAdded?.(annotation);
        
        // 清除选择
        if (this.currentSelection?.contents) {
            this.currentSelection.contents.window.getSelection().removeAllRanges();
        }
    }

    /**
     * 删除注解
     * @param {string} annotationId - 注解 ID
     */
    async removeAnnotation(annotationId) {
        const annotation = this.annotations.get(annotationId);
        if (!annotation) return;
        
        // 从渲染中移除
        this.rendition.annotations.remove(annotation.cfiRange, 'highlight');
        
        // 从内存中移除
        this.annotations.delete(annotationId);
        
        // 从数据库中删除
        try {
            await dbManager.delete('annotations', annotationId);
        } catch (e) {
            console.error('删除注解失败:', e);
        }
        
        // 触发回调
        this.onAnnotationRemoved?.(annotation);
    }

    /**
     * 更新注解
     * @param {string} annotationId - 注解 ID
     * @param {Object} updates - 更新内容
     */
    async updateAnnotation(annotationId, updates) {
        const annotation = this.annotations.get(annotationId);
        if (!annotation) return;
        
        // 合并更新
        const updated = {
            ...annotation,
            ...updates,
            timestamp: Date.now()
        };
        
        // 更新内存
        this.annotations.set(annotationId, updated);
        
        // 更新数据库
        try {
            await dbManager.put('annotations', updated);
        } catch (e) {
            console.error('更新注解失败:', e);
        }
    }

    /**
     * 加载已保存的注解
     */
    async loadAnnotations() {
        try {
            const savedAnnotations = await dbManager.getByIndex('annotations', 'bookKey', this.bookKey);
            
            for (const annotation of savedAnnotations) {
                // 添加到渲染
                this.rendition.annotations.highlight(
                    annotation.cfiRange,
                    annotation,
                    (e) => {
                        this.onAnnotationClicked?.(annotation);
                    },
                    `annotation-${annotation.id}`,
                    {
                        'background-color': annotation.style?.color,
                        'opacity': annotation.style?.opacity || 0.4
                    }
                );
                
                // 添加到内存
                this.annotations.set(annotation.id, annotation);
            }
        } catch (e) {
            console.error('加载注解失败:', e);
        }
    }

    /**
     * 获取所有注解
     * @returns {Array}
     */
    getAllAnnotations() {
        return Array.from(this.annotations.values());
    }

    /**
     * 获取所有注解（别名）
     * @returns {Promise<Array>}
     */
    async getAnnotations() {
        return this.getAllAnnotations();
    }

    /**
     * 添加书签
     * @param {string} cfiRange - CFI 范围
     * @param {string} chapter - 章节名称
     */
    async addBookmark(cfiRange, chapter) {
        const annotation = {
            id: this.generateId(),
            bookKey: this.bookKey,
            type: AnnotationType.BOOKMARK,
            cfiRange: cfiRange,
            chapter: chapter,
            timestamp: Date.now()
        };
        
        await this.addAnnotation(annotation);
    }

    /**
     * 按类型获取注解
     * @param {string} type - 注解类型
     * @returns {Array}
     */
    getAnnotationsByType(type) {
        return this.getAllAnnotations().filter(a => a.type === type);
    }

    /**
     * 获取注解数量
     * @returns {number}
     */
    getCount() {
        return this.annotations.size;
    }

    /**
     * 清除所有注解
     */
    async clearAll() {
        for (const [id, annotation] of this.annotations) {
            this.rendition.annotations.remove(annotation.cfiRange, 'highlight');
        }
        
        this.annotations.clear();
        
        try {
            await dbManager.clear('annotations');
        } catch (e) {
            console.error('清除注解失败:', e);
        }
    }

    /**
     * 生成唯一 ID
     * @returns {string}
     * @private
     */
    generateId() {
        return `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 导出注解为 Markdown 格式
     * @param {string} bookName - 书籍名称
     * @returns {string}
     */
    exportToMarkdown(bookName = '未知书籍') {
        const annotations = this.getAllAnnotations();
        if (annotations.length === 0) {
            return '';
        }
        
        let markdown = `# ${bookName} - 读书笔记\n\n`;
        markdown += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
        
        const highlights = annotations.filter(a => a.type === AnnotationType.HIGHLIGHT);
        const notes = annotations.filter(a => a.type === AnnotationType.NOTE);
        const bookmarks = annotations.filter(a => a.type === AnnotationType.BOOKMARK);
        
        if (highlights.length > 0) {
            markdown += `## 高亮 (${highlights.length})\n\n`;
            highlights.forEach((h, index) => {
                const colorName = this.getColorNameByValue(h.style?.color);
                markdown += `### ${index + 1}. ${COLOR_NAMES[colorName] || '默认'}高亮\n`;
                markdown += `> ${h.text || '无文本'}\n`;
                if (h.chapter) {
                    markdown += `>\n> *位置: ${h.chapter}*\n`;
                }
                markdown += `\n`;
            });
        }
        
        if (notes.length > 0) {
            markdown += `## 笔记 (${notes.length})\n\n`;
            notes.forEach((n, index) => {
                markdown += `### ${index + 1}. 笔记\n`;
                markdown += `> ${n.text || '无文本'}\n`;
                if (n.note) {
                    markdown += `\n**我的笔记:**\n${n.note}\n`;
                }
                if (n.chapter) {
                    markdown += `\n*位置: ${n.chapter}*\n`;
                }
                markdown += `\n---\n\n`;
            });
        }
        
        if (bookmarks.length > 0) {
            markdown += `## 书签 (${bookmarks.length})\n\n`;
            bookmarks.forEach((b, index) => {
                markdown += `${index + 1}. ${b.chapter || '未知位置'} - ${new Date(b.timestamp).toLocaleString('zh-CN')}\n`;
            });
        }
        
        return markdown;
    }

    /**
     * 导出注解为纯文本格式
     * @param {string} bookName - 书籍名称
     * @returns {string}
     */
    exportToText(bookName = '未知书籍') {
        const annotations = this.getAllAnnotations();
        if (annotations.length === 0) {
            return '';
        }
        
        let text = `${bookName} - 读书笔记\n`;
        text += `${'='.repeat(40)}\n`;
        text += `导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
        
        const highlights = annotations.filter(a => a.type === AnnotationType.HIGHLIGHT);
        const notes = annotations.filter(a => a.type === AnnotationType.NOTE);
        const bookmarks = annotations.filter(a => a.type === AnnotationType.BOOKMARK);
        
        if (highlights.length > 0) {
            text += `【高亮】共 ${highlights.length} 条\n`;
            text += `${'-'.repeat(40)}\n`;
            highlights.forEach((h, index) => {
                text += `${index + 1}. ${h.text || '无文本'}\n`;
                if (h.chapter) {
                    text += `   位置: ${h.chapter}\n`;
                }
                text += `\n`;
            });
        }
        
        if (notes.length > 0) {
            text += `【笔记】共 ${notes.length} 条\n`;
            text += `${'-'.repeat(40)}\n`;
            notes.forEach((n, index) => {
                text += `${index + 1}. ${n.text || '无文本'}\n`;
                if (n.note) {
                    text += `   笔记: ${n.note}\n`;
                }
                if (n.chapter) {
                    text += `   位置: ${n.chapter}\n`;
                }
                text += `\n`;
            });
        }
        
        if (bookmarks.length > 0) {
            text += `【书签】共 ${bookmarks.length} 个\n`;
            text += `${'-'.repeat(40)}\n`;
            bookmarks.forEach((b, index) => {
                text += `${index + 1}. ${b.chapter || '未知位置'} - ${new Date(b.timestamp).toLocaleString('zh-CN')}\n`;
            });
        }
        
        return text;
    }

    /**
     * 下载导出文件
     * @param {string} format - 格式 ('markdown' 或 'text')
     * @param {string} bookName - 书籍名称
     */
    downloadExport(format = 'markdown', bookName = '未知书籍') {
        let content, filename, mimeType;
        
        if (format === 'markdown') {
            content = this.exportToMarkdown(bookName);
            filename = `${bookName}_读书笔记.md`;
            mimeType = 'text/markdown;charset=utf-8';
        } else {
            content = this.exportToText(bookName);
            filename = `${bookName}_读书笔记.txt`;
            mimeType = 'text/plain;charset=utf-8';
        }
        
        if (!content) {
            this.onError?.('暂无可导出的注解内容');
            return;
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * 销毁
     */
    destroy() {
        this.hideToolbar();
        this.hideNoteDialog();
        this.hideEditDialog();
        
        if (this.toolbar && this.toolbar.parentNode) {
            this.toolbar.parentNode.removeChild(this.toolbar);
        }
        
        if (this.noteDialog && this.noteDialog.parentNode) {
            this.noteDialog.parentNode.removeChild(this.noteDialog);
        }
        
        if (this.editDialog && this.editDialog.parentNode) {
            this.editDialog.parentNode.removeChild(this.editDialog);
        }
        
        this.annotations.clear();
    }
}

export {
    AnnotationManager,
    AnnotationType,
    DEFAULT_COLORS,
    COLOR_NAMES
};

export default AnnotationManager;
