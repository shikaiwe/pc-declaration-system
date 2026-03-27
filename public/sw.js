/**
 * Service Worker 离线阅读支持
 * 提供书籍资源缓存、离线访问和后台同步功能
 * @version 1.1.0
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `epub-static-${CACHE_VERSION}`;
const BOOK_CACHE = `epub-books-${CACHE_VERSION}`;
const IMAGE_CACHE = `epub-images-${CACHE_VERSION}`;

/**
 * 允许的来源白名单（消息验证）
 */
const ALLOWED_ORIGINS = [
    self.location.origin
];

/**
 * 允许缓存的路径正则（URL 验证）
 */
const ALLOWED_CACHE_PATHS = [
    /^\/book\/.*\.epub$/i,
    /^\/images\/.*\.(jpg|jpeg|png|gif|webp|svg)$/i,
    /^\/libs\/.*$/i
];

/**
 * 验证 URL 是否允许缓存
 * @param {string} url - 待验证的 URL
 * @returns {boolean}
 */
function isAllowedCacheUrl(url) {
    try {
        const urlObj = new URL(url, self.location.origin);
        if (urlObj.origin !== self.location.origin) {
            return false;
        }
        return ALLOWED_CACHE_PATHS.some(regex => regex.test(urlObj.pathname));
    } catch {
        return false;
    }
}

/**
 * 验证消息来源
 * @param {Event} event - 消息事件
 * @returns {boolean}
 */
function isValidMessageSource(event) {
    return ALLOWED_ORIGINS.includes(event.origin);
}

/**
 * 预缓存的静态资源
 */
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/js/epub-reader.js',
    '/js/database.js',
    '/css/reader.css',
    '/libs/epub.min.js'
];

/**
 * 安装事件 - 预缓存静态资源
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

/**
 * 激活事件 - 清理旧缓存
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => !name.includes(CACHE_VERSION))
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

/**
 * 敏感 API 路径正则表达式（不缓存）
 * 使用严格匹配防止路径绕过
 */
const SENSITIVE_PATHS_REGEX = /^\/api\/(auth|user|login|logout|register|password|token|sensitive|account|profile|session)(\/|$)/;

/**
 * 请求拦截 - 缓存策略
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // 敏感 API 请求 - 不缓存，直接网络请求
    if (SENSITIVE_PATHS_REGEX.test(url.pathname)) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // EPUB 文件 - 网络优先
    if (url.pathname.endsWith('.epub')) {
        event.respondWith(networkFirst(event.request, BOOK_CACHE));
        return;
    }
    
    // 图片资源 - 缓存优先
    if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
        event.respondWith(cacheFirst(event.request, IMAGE_CACHE));
        return;
    }
    
    // 静态资源 - 缓存优先
    if (PRECACHE_ASSETS.some(asset => url.pathname.endsWith(asset) || url.pathname === asset)) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }
    
    // API 请求 - 网络优先，但不缓存敏感数据
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstNoCache(event.request));
        return;
    }
    
    // 其他请求 - 网络优先
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
});

/**
 * 缓存优先策略
 * @param {Request} request - 请求对象
 * @param {string} cacheName - 缓存名称
 * @returns {Promise<Response>}
 */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return new Response('离线状态', { status: 503 });
    }
}

/**
 * 网络优先策略
 * @param {Request} request - 请求对象
 * @param {string} cacheName - 缓存名称
 * @returns {Promise<Response>}
 */
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        return new Response('离线状态，资源未缓存', { status: 503 });
    }
}

/**
 * 网络优先策略（不缓存）
 * 用于 API 请求，确保数据实时性
 * @param {Request} request - 请求对象
 * @returns {Promise<Response>}
 */
async function networkFirstNoCache(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (e) {
        return new Response('离线状态，API 不可用', { status: 503 });
    }
}

/**
 * 后台更新策略
 * @param {Request} request - 请求对象
 * @param {string} cacheName - 缓存名称
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request)
        .then((response) => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => cached);
    
    return cached || fetchPromise;
}

/**
 * 消息处理（带来源验证）
 */
self.addEventListener('message', (event) => {
    if (!isValidMessageSource(event)) {
        console.error('[SW] 拒绝未授权来源的消息:', event.origin);
        return;
    }
    
    const { type, data } = event.data;
    
    switch (type) {
        case 'PRECACHE_BOOK':
            if (data && data.url && isAllowedCacheUrl(data.url)) {
                event.waitUntil(precacheBook(data.url));
            } else {
                console.error('[SW] 拒绝缓存未授权 URL:', data?.url);
            }
            break;
            
        case 'GET_CACHE_STATUS':
            if (data && data.url) {
                event.waitUntil(getCacheStatus(event.source, data.url));
            }
            break;
            
        case 'CLEAR_BOOK_CACHE':
            if (data && data.url && isAllowedCacheUrl(data.url)) {
                event.waitUntil(clearBookCache(data.url));
            }
            break;
            
        case 'GET_STORAGE_ESTIMATE':
            event.waitUntil(sendStorageEstimate(event.source));
            break;
    }
});

/**
 * 预缓存书籍
 * @param {string} url - 书籍 URL
 */
async function precacheBook(url) {
    const cache = await caches.open(BOOK_CACHE);
    
    try {
        const response = await fetch(url);
        if (response.ok) {
            await cache.put(url, response);
            
            // 通知客户端
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
                client.postMessage({
                    type: 'BOOK_CACHED',
                    url: url
                });
            });
        }
    } catch (e) {
        console.error('[SW] 预缓存书籍失败:', e);
    }
}

/**
 * 获取缓存状态
 * @param {Client} client - 客户端
 * @param {string} url - 书籍 URL
 */
async function getCacheStatus(client, url) {
    const cache = await caches.open(BOOK_CACHE);
    const response = await cache.match(url);
    
    client.postMessage({
        type: 'CACHE_STATUS',
        data: {
            url: url,
            cached: !!response,
            size: response ? parseInt(response.headers.get('content-length')) || 0 : 0
        }
    });
}

/**
 * 清除书籍缓存
 * @param {string} url - 书籍 URL
 */
async function clearBookCache(url) {
    const cache = await caches.open(BOOK_CACHE);
    await cache.delete(url);
}

/**
 * 发送存储估算
 * @param {Client} client - 客户端
 */
async function sendStorageEstimate(client) {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        client.postMessage({
            type: 'STORAGE_ESTIMATE',
            data: {
                quota: estimate.quota,
                usage: estimate.usage,
                available: estimate.quota - estimate.usage
            }
        });
    }
}

/**
 * 后台同步
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reading-progress') {
        event.waitUntil(syncReadingProgress());
    }
});

/**
 * 验证同步数据格式
 * @param {Object} item - 待同步数据
 * @returns {boolean}
 */
function isValidSyncItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (!item.id || typeof item.id !== 'string') return false;
    if (!item.bookKey || typeof item.bookKey !== 'string') return false;
    if (typeof item.cfi !== 'string') return false;
    if (typeof item.percentage !== 'number' || item.percentage < 0 || item.percentage > 1) return false;
    return true;
}

/**
 * 同步阅读进度
 */
async function syncReadingProgress() {
    try {
        const db = await openDB();
        const pendingSync = await getAllPendingSync(db);
        
        for (const item of pendingSync) {
            if (!isValidSyncItem(item)) {
                console.error('[SW] 无效的同步数据，跳过:', item.id);
                await deletePendingSync(db, item.id);
                continue;
            }
            
            try {
                const response = await fetch('/api/reading-progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bookKey: item.bookKey,
                        cfi: item.cfi,
                        percentage: item.percentage,
                        timestamp: item.timestamp
                    })
                });
                
                if (response.ok) {
                    await deletePendingSync(db, item.id);
                }
            } catch (e) {
                console.error('[SW] 同步失败:', e);
            }
        }
    } catch (e) {
        console.error('[SW] 同步阅读进度失败:', e);
    }
}

/**
 * 打开 IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('EpubReaderDB', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 获取待同步数据
 * @param {IDBDatabase} db - 数据库实例
 * @returns {Promise<Array>}
 */
function getAllPendingSync(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('progress', 'readonly');
        const store = tx.objectStore('progress');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 删除已同步数据
 * @param {IDBDatabase} db - 数据库实例
 * @param {string} id - 数据 ID
 * @returns {Promise<void>}
 */
function deletePendingSync(db, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('progress', 'readwrite');
        const store = tx.objectStore('progress');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
