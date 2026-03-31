/**
 * HTML安全处理模块
 * 移除HTML中的开发相关注释，防止信息泄露
 * @module html-sanitizer
 */

(function(global) {
    'use strict';

    /**
     * 需要保留的注释关键词
     * 包含这些关键词的注释将被保留
     */
    const PRESERVE_KEYWORDS = [
        '备案',
        '版权',
        'Copyright',
        'license',
        'IE',
        'if lt',
        'if gt',
        'if IE',
        'endif',
        '[if',
        '[endif'
    ];

    /**
     * 检查注释是否应该保留
     * @param {string} comment - 注释内容
     * @returns {boolean} 是否保留
     */
    function shouldPreserve(comment) {
        const content = comment.toLowerCase();
        return PRESERVE_KEYWORDS.some(keyword => 
            content.includes(keyword.toLowerCase())
        );
    }

    /**
     * 移除HTML中的开发注释
     * @param {string} html - HTML内容
     * @returns {string} 处理后的HTML
     */
    function removeDevComments(html) {
        return html.replace(/<!--([\s\S]*?)-->/g, (match, content) => {
            if (shouldPreserve(content)) {
                return match;
            }
            return '';
        });
    }

    /**
     * 移除多余的空白行
     * @param {string} html - HTML内容
     * @returns {string} 处理后的HTML
     */
    function removeExtraBlankLines(html) {
        return html
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .replace(/\n\s*\n\s*\n/g, '\n\n');
    }

    /**
     * 处理HTML文档
     * @param {string} html - HTML内容
     * @returns {string} 处理后的HTML
     */
    function sanitize(html) {
        let result = removeDevComments(html);
        result = removeExtraBlankLines(result);
        return result;
    }

    /**
     * 生产环境自动处理页面中的注释
     * 通过重新序列化DOM来移除注释节点
     */
    function sanitizeCurrentPage() {
        const isProd = window.location.hostname !== 'localhost' && 
                       window.location.hostname !== '127.0.0.1' &&
                       !window.location.hostname.startsWith('192.168.');
        
        if (!isProd) {
            return;
        }

        // 移除DOM中的注释节点
        const walker = document.createTreeWalker(
            document.documentElement,
            NodeFilter.SHOW_COMMENT,
            null,
            false
        );

        const commentsToRemove = [];
        let node;
        while (node = walker.nextNode()) {
            const content = node.nodeValue || '';
            if (!shouldPreserve(content)) {
                commentsToRemove.push(node);
            }
        }

        commentsToRemove.forEach(node => {
            node.parentNode.removeChild(node);
        });
    }

    // 页面加载完成后自动处理
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sanitizeCurrentPage);
    } else {
        sanitizeCurrentPage();
    }

    // 暴露API
    const HTMLSanitizer = {
        removeDevComments,
        removeExtraBlankLines,
        sanitize,
        sanitizeCurrentPage,
        shouldPreserve
    };

    global.HTMLSanitizer = HTMLSanitizer;

})(typeof window !== 'undefined' ? window : this);
