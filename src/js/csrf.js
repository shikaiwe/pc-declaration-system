/**
 * CSRF Token 保护模块
 * 用于防止跨站请求伪造攻击
 * 适配后端 Django CSRF 机制
 * @module csrf
 * @version 2.0.0
 */

(function(global) {
    'use strict';

    /**
     * CSRF配置常量
     */
    const CSRF_CONFIG = {
        CSRF_COOKIE_NAME: 'csrftoken',
        CSRF_HEADER_NAME: 'X-CSRFToken',
        CSRF_API_URL: '/api/unit/csrf/'
    };

    /**
     * 从 Cookie 中获取指定名称的值
     * @param {string} name - Cookie 名称
     * @returns {string|null} Cookie 值或 null
     */
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    /**
     * 获取 CSRF Token
     * 从 Cookie 中读取 csrftoken
     * @returns {string|null} CSRF Token 或 null
     */
    function getToken() {
        return getCookie(CSRF_CONFIG.CSRF_COOKIE_NAME);
    }

    /**
     * 从后端获取 CSRF Token
     * 调用 /api/unit/csrf/ 接口设置 Cookie
     * @param {string} baseUrl - API 基础地址
     * @returns {Promise<boolean>} 是否成功获取
     */
    async function fetchCSRFToken(baseUrl) {
        try {
            const url = baseUrl ? 
                `${baseUrl}${CSRF_CONFIG.CSRF_API_URL}` : 
                CSRF_CONFIG.CSRF_API_URL;
            
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const token = getToken();
                if (token) {
                    console.log('CSRF Token 已获取:', token.substring(0, 8) + '...');
                    return true;
                }
            }
            console.warn('CSRF Token 获取失败');
            return false;
        } catch (error) {
            console.error('获取 CSRF Token 失败:', error);
            return false;
        }
    }

    /**
     * 使用 jQuery 从后端获取 CSRF Token
     * @param {string} baseUrl - API 基础地址
     * @returns {Promise<boolean>} 是否成功获取
     */
    function fetchCSRFTokenjQuery(baseUrl) {
        return new Promise((resolve) => {
            const url = baseUrl ? 
                `${baseUrl}${CSRF_CONFIG.CSRF_API_URL}` : 
                CSRF_CONFIG.CSRF_API_URL;
            
            $.ajax({
                url: url,
                method: 'GET',
                xhrFields: {
                    withCredentials: true
                },
                success: function(data) {
                    const token = getToken();
                    if (token) {
                        console.log('CSRF Token 已获取:', token.substring(0, 8) + '...');
                        resolve(true);
                    } else {
                        console.warn('CSRF Token Cookie 未设置');
                        resolve(false);
                    }
                },
                error: function(xhr, status, error) {
                    console.error('获取 CSRF Token 失败:', error);
                    resolve(false);
                }
            });
        });
    }

    /**
     * 获取带 CSRF Token 的请求头
     * @returns {Object} 包含 CSRF Token 的请求头对象
     */
    function getHeaders() {
        const token = getToken();
        const headers = {};
        if (token) {
            headers[CSRF_CONFIG.CSRF_HEADER_NAME] = token;
        }
        return headers;
    }

    /**
     * 为 jQuery AJAX 请求添加 CSRF Token
     * @param {Object} options - jQuery ajax 选项
     * @returns {Object} 添加了 CSRF 保护的 ajax 选项
     */
    function wrapJQueryAjax(options) {
        const token = getToken();
        const wrappedOptions = Object.assign({}, options);

        if (!wrappedOptions.headers) {
            wrappedOptions.headers = {};
        }
        
        if (token) {
            wrappedOptions.headers[CSRF_CONFIG.CSRF_HEADER_NAME] = token;
        }

        if (!wrappedOptions.xhrFields) {
            wrappedOptions.xhrFields = {};
        }
        wrappedOptions.xhrFields.withCredentials = true;

        return wrappedOptions;
    }

    /**
     * 创建带 CSRF 保护的 fetch 请求
     * @param {string} url - 请求 URL
     * @param {Object} options - fetch 选项
     * @returns {Promise} fetch Promise
     */
    function fetchWithCSRF(url, options) {
        const token = getToken();
        const wrappedOptions = Object.assign({}, options);

        if (!wrappedOptions.headers) {
            wrappedOptions.headers = {};
        }
        
        if (token) {
            wrappedOptions.headers[CSRF_CONFIG.CSRF_HEADER_NAME] = token;
        }
        wrappedOptions.credentials = 'include';

        return fetch(url, wrappedOptions);
    }

    /**
     * 初始化 CSRF 保护
     * 设置 jQuery ajaxPrefilter 自动添加 CSRF Token
     */
    function init() {
        if (typeof $ !== 'undefined' && $.ajaxPrefilter) {
            $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
                if (options.type && options.type.toUpperCase() !== 'GET') {
                    const token = getToken();
                    if (token) {
                        jqXHR.setRequestHeader(CSRF_CONFIG.CSRF_HEADER_NAME, token);
                    }
                }
            });
        }
        console.log('CSRF 保护模块已初始化');
    }

    /**
     * 检查 CSRF Token 是否存在
     * @returns {boolean} Token 是否存在
     */
    function hasToken() {
        return !!getToken();
    }

    /**
     * 确保 CSRF Token 存在，不存在则获取
     * @param {string} baseUrl - API 基础地址
     * @returns {Promise<boolean>} 是否成功
     */
    async function ensureToken(baseUrl) {
        if (hasToken()) {
            return true;
        }
        return await fetchCSRFToken(baseUrl);
    }

    /**
     * CSRF 模块公共 API
     */
    const CSRF = {
        init: init,
        getToken: getToken,
        getCookie: getCookie,
        fetchCSRFToken: fetchCSRFToken,
        fetchCSRFTokenjQuery: fetchCSRFTokenjQuery,
        ensureToken: ensureToken,
        hasToken: hasToken,
        getHeaders: getHeaders,
        wrapJQueryAjax: wrapJQueryAjax,
        fetchWithCSRF: fetchWithCSRF,
        HEADER_NAME: CSRF_CONFIG.CSRF_HEADER_NAME,
        COOKIE_NAME: CSRF_CONFIG.CSRF_COOKIE_NAME,
        API_URL: CSRF_CONFIG.CSRF_API_URL
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CSRF;
    } else {
        global.CSRF = CSRF;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(typeof window !== 'undefined' ? window : this);
