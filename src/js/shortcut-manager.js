/**
 * 阅读器快捷键定义模块
 * 集中管理所有快捷键配置，支持搜索和分类筛选
 * 
 * @module ShortcutKeys
 * @version 1.0.0
 */

/**
 * 快捷键分类
 */
export const ShortcutCategory = {
    NAVIGATION: 'navigation',
    READING: 'reading',
    ANNOTATION: 'annotation',
    SEARCH: 'search',
    SYSTEM: 'system'
};

/**
 * 快捷键分类显示名称
 */
export const CategoryNames = {
    [ShortcutCategory.NAVIGATION]: '导航操作',
    [ShortcutCategory.READING]: '阅读控制',
    [ShortcutCategory.ANNOTATION]: '笔记标注',
    [ShortcutCategory.SEARCH]: '搜索功能',
    [ShortcutCategory.SYSTEM]: '系统操作'
};

/**
 * 默认快捷键定义
 */
export const DEFAULT_SHORTCUTS = [
    {
        id: 'toggle-toc',
        keys: ['Ctrl', 'T'],
        description: '打开/关闭目录',
        category: ShortcutCategory.NAVIGATION,
        customizable: false
    },
    {
        id: 'toggle-search',
        keys: ['Ctrl', 'S'],
        description: '打开/关闭搜索',
        category: ShortcutCategory.SEARCH,
        customizable: false
    },
    {
        id: 'escape',
        keys: ['Esc'],
        description: '关闭所有面板/取消操作',
        category: ShortcutCategory.SYSTEM,
        customizable: false
    },
    // 横排模式翻页快捷键
    {
        id: 'page-next-horizontal',
        keys: ['→', '↓', 'PageDown', 'Space'],
        description: '下一页（横排模式）',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: '!verticalMode'
    },
    {
        id: 'page-prev-horizontal',
        keys: ['←', '↑', 'PageUp', 'Shift+Space'],
        description: '上一页（横排模式）',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: '!verticalMode'
    },
    {
        id: 'go-start',
        keys: ['Home'],
        description: '跳到开头',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: '!verticalMode'
    },
    {
        id: 'go-end',
        keys: ['End'],
        description: '跳到结尾',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: '!verticalMode'
    },
    // 竖排模式翻页快捷键
    {
        id: 'page-next-vertical',
        keys: ['←'],
        description: '下一页（竖排模式）',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: 'verticalMode'
    },
    {
        id: 'page-prev-vertical',
        keys: ['→'],
        description: '上一页（竖排模式）',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: 'verticalMode'
    },
    {
        id: 'scroll-up-vertical',
        keys: ['↑'],
        description: '向上滚动（竖排模式）',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: 'verticalMode'
    },
    {
        id: 'scroll-down-vertical',
        keys: ['↓'],
        description: '向下滚动（竖排模式）',
        category: ShortcutCategory.READING,
        customizable: false,
        condition: 'verticalMode'
    }
];

/**
 * 格式化快捷键显示
 * @param {Array} keys - 快捷键数组
 * @returns {string} 格式化后的快捷键字符串
 */
export function formatShortcutDisplay(keys) {
    return keys.map(key => {
        const keyMap = {
            'Ctrl': 'Ctrl',
            'Alt': 'Alt',
            'Shift': 'Shift',
            'Meta': 'Cmd',
            '→': '右箭头',
            '←': '左箭头',
            '↑': '上箭头',
            '↓': '下箭头',
            'Esc': 'Esc',
            'Enter': 'Enter',
            'Backspace': 'Backspace'
        };
        return keyMap[key] || key;
    }).join(' + ');
}

/**
 * 获取快捷键的 HTML 表示
 * @param {Array} keys - 快捷键数组
 * @returns {string} HTML 字符串
 */
export function getShortcutHTML(keys) {
    return keys.map(key => `<kbd>${key}</kbd>`).join(' + ');
}

/**
 * 快捷键管理器类
 */
export class ShortcutManager {
    constructor() {
        this.shortcuts = [...DEFAULT_SHORTCUTS];
        this.customShortcuts = new Map();
        this.listeners = new Set();
    }

    /**
     * 获取所有快捷键
     * @param {Object} context - 上下文信息（如 isVerticalMode）
     * @returns {Array} 过滤后的快捷键列表
     */
    getShortcuts(context = {}) {
        return this.shortcuts.map(shortcut => {
            const custom = this.customShortcuts.get(shortcut.id);
            return {
                ...shortcut,
                keys: custom?.keys || shortcut.keys,
                isCustomized: !!custom
            };
        }).filter(shortcut => {
            if (shortcut.condition && context[shortcut.condition] === false) {
                return false;
            }
            return true;
        });
    }

    /**
     * 按分类获取快捷键
     * @param {string} category - 分类名称
     * @param {Object} context - 上下文信息
     * @returns {Array} 该分类的快捷键列表
     */
    getShortcutsByCategory(category, context = {}) {
        return this.getShortcuts(context)
            .filter(s => s.category === category);
    }

    /**
     * 获取所有分类
     * @param {Object} context - 上下文信息
     * @returns {Array} 分类列表
     */
    getCategories(context = {}) {
        const shortcuts = this.getShortcuts(context);
        const categories = new Set();
        
        shortcuts.forEach(s => categories.add(s.category));
        
        return Array.from(categories).map(cat => ({
            id: cat,
            name: CategoryNames[cat] || cat,
            count: shortcuts.filter(s => s.category === cat).length
        }));
    }

    /**
     * 搜索快捷键
     * @param {string} query - 搜索关键词
     * @param {Object} context - 上下文信息
     * @returns {Array} 匹配的快捷键列表
     */
    searchShortcuts(query, context = {}) {
        const lowerQuery = query.toLowerCase().trim();
        if (!lowerQuery) {
            return this.getShortcuts(context);
        }
        
        return this.getShortcuts(context).filter(shortcut => {
            const descMatch = shortcut.description.toLowerCase().includes(lowerQuery);
            const keyMatch = shortcut.keys.some(k => k.toLowerCase().includes(lowerQuery));
            const categoryMatch = CategoryNames[shortcut.category].toLowerCase().includes(lowerQuery);
            return descMatch || keyMatch || categoryMatch;
        });
    }

    /**
     * 自定义快捷键
     * @param {string} shortcutId - 快捷键 ID
     * @param {Array} keys - 新的快捷键组合
     */
    setCustomShortcut(shortcutId, keys) {
        const shortcut = this.shortcuts.find(s => s.id === shortcutId);
        if (!shortcut || !shortcut.customizable) {
            return false;
        }
        
        this.customShortcuts.set(shortcutId, { keys });
        this.notifyListeners();
        return true;
    }

    /**
     * 重置快捷键到默认值
     * @param {string} shortcutId - 快捷键 ID
     */
    resetShortcut(shortcutId) {
        this.customShortcuts.delete(shortcutId);
        this.notifyListeners();
    }

    /**
     * 重置所有快捷键
     */
    resetAllShortcuts() {
        this.customShortcuts.clear();
        this.notifyListeners();
    }

    /**
     * 添加监听器
     * @param {Function} listener - 监听函数
     */
    addListener(listener) {
        this.listeners.add(listener);
    }

    /**
     * 移除监听器
     * @param {Function} listener - 监听函数
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    /**
     * 通知所有监听器
     * @private
     */
    notifyListeners() {
        this.listeners.forEach(listener => listener(this.getShortcuts()));
    }
}

export default ShortcutManager;
