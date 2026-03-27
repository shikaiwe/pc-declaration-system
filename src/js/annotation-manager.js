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
 * 默认高亮颜色
 */
const DEFAULT_COLORS = {
    yellow: '#ffff00',
    green: '#00ff00',
    blue: '#00bfff',
    pink: '#ff69b4',
    orange: '#ffa500'
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
    }

    /**
     * 初始化注解系统
     * @param {string} bookKey - 书籍标识
     */
    async init(bookKey) {
        this.bookKey = bookKey;
        
        // 绑定选择事件
        this.bindSelectionEvents();
        
        // 创建工具栏
        this.createToolbar();
        
        // 创建笔记对话框
        this.createNoteDialog();
        
        // 加载已保存的注解
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
                <button class="toolbar-btn btn-highlight" data-color="yellow" title="高亮">
                    <span class="color-dot" style="background: #ffff00"></span>
                </button>
                <button class="toolbar-btn btn-highlight" data-color="green" title="绿色高亮">
                    <span class="color-dot" style="background: #00ff00"></span>
                </button>
                <button class="toolbar-btn btn-highlight" data-color="blue" title="蓝色高亮">
                    <span class="color-dot" style="background: #00bfff"></span>
                </button>
                <button class="toolbar-btn btn-highlight" data-color="pink" title="粉色高亮">
                    <span class="color-dot" style="background: #ff69b4"></span>
                </button>
                <button class="toolbar-btn btn-underline" title="下划线">
                    <span class="underline-icon">U</span>
                </button>
                <button class="toolbar-btn btn-note" title="添加笔记">
                    <span class="note-icon">📝</span>
                </button>
                <button class="toolbar-btn btn-copy" title="复制">
                    <span class="copy-icon">📋</span>
                </button>
            </div>
        `;
        
        this.toolbar.style.display = 'none';
        document.body.appendChild(this.toolbar);
        
        // 绑定按钮事件
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
     * 创建笔记对话框
     * @private
     */
    createNoteDialog() {
        this.noteDialog = document.createElement('div');
        this.noteDialog.className = 'note-dialog';
        this.noteDialog.innerHTML = `
            <div class="note-dialog-overlay"></div>
            <div class="note-dialog-content">
                <div class="note-dialog-header">
                    <span class="note-dialog-title">添加笔记</span>
                    <button class="note-dialog-close">&times;</button>
                </div>
                <div class="note-dialog-body">
                    <div class="selected-text-preview"></div>
                    <textarea class="note-textarea" placeholder="输入笔记内容..."></textarea>
                    <div class="note-color-picker">
                        <span>颜色:</span>
                        <button class="color-option" data-color="yellow" style="background: #ffff00"></button>
                        <button class="color-option" data-color="green" style="background: #00ff00"></button>
                        <button class="color-option" data-color="blue" style="background: #00bfff"></button>
                        <button class="color-option" data-color="pink" style="background: #ff69b4"></button>
                    </div>
                </div>
                <div class="note-dialog-footer">
                    <button class="btn-cancel">取消</button>
                    <button class="btn-save">保存</button>
                </div>
            </div>
        `;
        
        this.noteDialog.style.display = 'none';
        document.body.appendChild(this.noteDialog);
        
        // 绑定事件
        this.bindNoteDialogEvents();
    }

    /**
     * 绑定笔记对话框事件
     * @private
     */
    bindNoteDialogEvents() {
        // 关闭按钮
        this.noteDialog.querySelector('.note-dialog-close').addEventListener('click', () => {
            this.hideNoteDialog();
        });
        
        // 取消按钮
        this.noteDialog.querySelector('.btn-cancel').addEventListener('click', () => {
            this.hideNoteDialog();
        });
        
        // 保存按钮
        this.noteDialog.querySelector('.btn-save').addEventListener('click', () => {
            this.saveNote();
        });
        
        // 颜色选择
        this.noteDialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                this.noteDialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // 点击遮罩关闭
        this.noteDialog.querySelector('.note-dialog-overlay').addEventListener('click', () => {
            this.hideNoteDialog();
        });
    }

    /**
     * 显示笔记对话框
     */
    showNoteDialog() {
        if (!this.currentSelection) return;
        
        // 显示选中文本预览
        const preview = this.noteDialog.querySelector('.selected-text-preview');
        preview.textContent = this.currentSelection.text;
        
        // 重置表单
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
     * 销毁
     */
    destroy() {
        this.hideToolbar();
        this.hideNoteDialog();
        
        if (this.toolbar && this.toolbar.parentNode) {
            this.toolbar.parentNode.removeChild(this.toolbar);
        }
        
        if (this.noteDialog && this.noteDialog.parentNode) {
            this.noteDialog.parentNode.removeChild(this.noteDialog);
        }
        
        this.annotations.clear();
    }
}

export {
    AnnotationManager,
    AnnotationType,
    DEFAULT_COLORS
};

export default AnnotationManager;
