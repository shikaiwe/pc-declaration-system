/**
 * IndexedDB 数据库管理模块
 * 提供完整的数据库初始化、CRUD 操作、事务管理和降级方案
 * 
 * @module Database
 * @version 1.0.0
 */

/**
 * 数据库配置常量
 */
const DB_CONFIG = {
    name: 'EpubReaderDB',
    version: 2,
    stores: {
        books: {
            keyPath: 'key',
            autoIncrement: false,
            indexes: [
                { name: 'title', keyPath: 'title', options: { unique: false } },
                { name: 'author', keyPath: 'author', options: { unique: false } },
                { name: 'lastRead', keyPath: 'lastRead', options: { unique: false } },
                { name: 'addedAt', keyPath: 'addedAt', options: { unique: false } }
            ]
        },
        progress: {
            keyPath: 'bookKey',
            autoIncrement: false,
            indexes: [
                { name: 'timestamp', keyPath: 'timestamp', options: { unique: false } },
                { name: 'percentage', keyPath: 'percentage', options: { unique: false } }
            ]
        },
        locations: {
            keyPath: 'bookKey',
            autoIncrement: false,
            indexes: [
                { name: 'generated', keyPath: 'generated', options: { unique: false } }
            ]
        },
        annotations: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: [
                { name: 'bookKey', keyPath: 'bookKey', options: { unique: false } },
                { name: 'timestamp', keyPath: 'timestamp', options: { unique: false } },
                { name: 'type', keyPath: 'type', options: { unique: false } },
                { name: 'syncStatus', keyPath: 'syncStatus', options: { unique: false } },
                { name: 'bookKey-timestamp', keyPath: ['bookKey', 'timestamp'], options: { unique: false } }
            ]
        },
        settings: {
            keyPath: 'id',
            autoIncrement: false,
            indexes: []
        },
        resources: {
            keyPath: 'url',
            autoIncrement: false,
            indexes: [
                { name: 'bookKey', keyPath: 'bookKey', options: { unique: false } },
                { name: 'type', keyPath: 'type', options: { unique: false } }
            ]
        }
    }
};

/**
 * 数据库错误类型枚举
 */
const DBErrorType = {
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    VERSION_CHANGE: 'VERSION_CHANGE',
    TRANSACTION_FAILED: 'TRANSACTION_FAILED',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',
    ALREADY_OPEN: 'ALREADY_OPEN',
    CLOSED: 'CLOSED'
};

/**
 * 自定义数据库错误类
 */
class DatabaseError extends Error {
    /**
     * 创建数据库错误实例
     * @param {string} type - 错误类型
     * @param {string} message - 错误消息
     * @param {Error} [originalError] - 原始错误对象
     */
    constructor(type, message, originalError = null) {
        super(message);
        this.name = 'DatabaseError';
        this.type = type;
        this.originalError = originalError;
        this.timestamp = Date.now();
    }
}

/**
 * 数据验证器类
 */
class DataValidator {
    /**
     * 验证书籍数据
     * @param {Object} data - 书籍数据
     * @returns {{valid: boolean, errors: string[]}}
     */
    static validateBook(data) {
        const errors = [];
        
        if (!data || typeof data !== 'object') {
            errors.push('数据必须是一个对象');
            return { valid: false, errors };
        }
        
        if (!data.key || typeof data.key !== 'string') {
            errors.push('key 是必需的字符串字段');
        }
        
        if (data.title !== undefined && typeof data.title !== 'string') {
            errors.push('title 必须是字符串');
        }
        
        if (data.author !== undefined && typeof data.author !== 'string') {
            errors.push('author 必须是字符串');
        }
        
        if (data.lastRead !== undefined && typeof data.lastRead !== 'number') {
            errors.push('lastRead 必须是数字时间戳');
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    /**
     * 验证进度数据
     * @param {Object} data - 进度数据
     * @returns {{valid: boolean, errors: string[]}}
     */
    static validateProgress(data) {
        const errors = [];
        
        if (!data || typeof data !== 'object') {
            errors.push('数据必须是一个对象');
            return { valid: false, errors };
        }
        
        if (!data.bookKey || typeof data.bookKey !== 'string') {
            errors.push('bookKey 是必需的字符串字段');
        }
        
        if (data.percentage !== undefined) {
            if (typeof data.percentage !== 'number' || data.percentage < 0 || data.percentage > 100) {
                errors.push('percentage 必须是 0-100 之间的数字');
            }
        }
        
        if (data.cfi !== undefined && typeof data.cfi !== 'string') {
            errors.push('cfi 必须是字符串');
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    /**
     * 验证注解数据
     * @param {Object} data - 注解数据
     * @returns {{valid: boolean, errors: string[]}}
     */
    static validateAnnotation(data) {
        const errors = [];
        
        if (!data || typeof data !== 'object') {
            errors.push('数据必须是一个对象');
            return { valid: false, errors };
        }
        
        if (!data.id || typeof data.id !== 'string') {
            errors.push('id 是必需的字符串字段');
        }
        
        if (!data.bookKey || typeof data.bookKey !== 'string') {
            errors.push('bookKey 是必需的字符串字段');
        }
        
        const validTypes = ['highlight', 'underline', 'note', 'bookmark'];
        if (!data.type || !validTypes.includes(data.type)) {
            errors.push(`type 必须是以下值之一: ${validTypes.join(', ')}`);
        }
        
        if (!data.cfiRange || typeof data.cfiRange !== 'string') {
            errors.push('cfiRange 是必需的字符串字段');
        } else if (!/^epubcfi\((.*)\)$/.test(data.cfiRange)) {
            errors.push('CFI格式无效，必须符合 epubcfi(...) 格式');
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    /**
     * 验证 locations 数据
     * @param {Object} data - locations 数据
     * @returns {{valid: boolean, errors: string[]}}
     */
    static validateLocations(data) {
        const errors = [];
        
        if (!data || typeof data !== 'object') {
            errors.push('数据必须是一个对象');
            return { valid: false, errors };
        }
        
        if (!data.bookKey || typeof data.bookKey !== 'string') {
            errors.push('bookKey 是必需的字符串字段');
        }
        
        if (!data.data) {
            errors.push('data 是必需字段');
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    /**
     * 根据存储名称获取验证器
     * @param {string} storeName - 存储名称
     * @returns {Function|null}
     */
    static getValidator(storeName) {
        const validators = {
            books: DataValidator.validateBook,
            progress: DataValidator.validateProgress,
            annotations: DataValidator.validateAnnotation,
            locations: DataValidator.validateLocations
        };
        return validators[storeName] || null;
    }
}

/**
 * 降级存储类（使用 localStorage）
 */
class FallbackStorage {
    constructor() {
        this.prefix = 'epub-reader-';
        this.isAvailable = this.checkAvailability();
    }
    
    /**
     * 检查 localStorage 可用性
     * @returns {boolean}
     */
    checkAvailability() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 生成存储键
     * @param {string} storeName - 存储名称
     * @param {string} key - 键
     * @returns {string}
     */
    getKey(storeName, key) {
        return `${this.prefix}${storeName}-${key}`;
    }
    
    /**
     * 添加数据
     * @param {string} storeName - 存储名称
     * @param {Object} data - 数据
     * @returns {Promise<void>}
     */
    async add(storeName, data) {
        if (!this.isAvailable) {
            throw new DatabaseError(DBErrorType.BROWSER_NOT_SUPPORTED, 'localStorage 不可用');
        }
        
        const key = data[DB_CONFIG.stores[storeName]?.keyPath || 'key'];
        const storeKey = this.getKey(storeName, key);
        
        // 检查是否已存在
        const existing = localStorage.getItem(storeKey);
        if (existing) {
            throw new DatabaseError(DBErrorType.VALIDATION_ERROR, '数据已存在');
        }
        
        localStorage.setItem(storeKey, JSON.stringify(data));
    }
    
    /**
     * 获取数据
     * @param {string} storeName - 存储名称
     * @param {string} key - 键
     * @returns {Promise<Object|null>}
     */
    async get(storeName, key) {
        if (!this.isAvailable) {
            throw new DatabaseError(DBErrorType.BROWSER_NOT_SUPPORTED, 'localStorage 不可用');
        }
        
        const storeKey = this.getKey(storeName, key);
        const data = localStorage.getItem(storeKey);
        
        return data ? JSON.parse(data) : null;
    }
    
    /**
     * 更新数据
     * @param {string} storeName - 存储名称
     * @param {Object} data - 数据
     * @returns {Promise<void>}
     */
    async put(storeName, data) {
        if (!this.isAvailable) {
            throw new DatabaseError(DBErrorType.BROWSER_NOT_SUPPORTED, 'localStorage 不可用');
        }
        
        const key = data[DB_CONFIG.stores[storeName]?.keyPath || 'key'];
        const storeKey = this.getKey(storeName, key);
        
        localStorage.setItem(storeKey, JSON.stringify(data));
    }
    
    /**
     * 删除数据
     * @param {string} storeName - 存储名称
     * @param {string} key - 键
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        if (!this.isAvailable) {
            throw new DatabaseError(DBErrorType.BROWSER_NOT_SUPPORTED, 'localStorage 不可用');
        }
        
        const storeKey = this.getKey(storeName, key);
        localStorage.removeItem(storeKey);
    }
    
    /**
     * 获取所有数据
     * @param {string} storeName - 存储名称
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        if (!this.isAvailable) {
            throw new DatabaseError(DBErrorType.BROWSER_NOT_SUPPORTED, 'localStorage 不可用');
        }
        
        const prefix = `${this.prefix}${storeName}-`;
        const results = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const data = localStorage.getItem(key);
                if (data) {
                    results.push(JSON.parse(data));
                }
            }
        }
        
        return results;
    }
    
    /**
     * 清空存储
     * @param {string} storeName - 存储名称
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        if (!this.isAvailable) {
            throw new DatabaseError(DBErrorType.BROWSER_NOT_SUPPORTED, 'localStorage 不可用');
        }
        
        const prefix = `${this.prefix}${storeName}-`;
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
}

/**
 * IndexedDB 数据库管理器类
 */
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isOpening = false;
        this.isClosed = false;
        this.fallbackStorage = new FallbackStorage();
        this.useFallback = false;
        this.pendingOperations = [];
        this.connectionState = 'closed';
    }
    
    /**
     * 检查 IndexedDB 支持
     * @returns {boolean}
     */
    static isSupported() {
        return 'indexedDB' in window;
    }
    
    /**
     * 初始化数据库连接
     * @returns {Promise<IDBDatabase>}
     * @throws {DatabaseError}
     */
    async init() {
        if (this.db) {
            return this.db;
        }
        
        if (this.isOpening) {
            return new Promise((resolve, reject) => {
                this.pendingOperations.push({ resolve, reject });
            });
        }
        
        if (!DatabaseManager.isSupported()) {
            console.warn('IndexedDB 不支持，使用降级方案');
            this.useFallback = true;
            return null;
        }
        
        this.isOpening = true;
        this.connectionState = 'connecting';
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);
            
            request.onerror = (event) => {
                this.isOpening = false;
                this.connectionState = 'error';
                const error = new DatabaseError(
                    DBErrorType.CONNECTION_FAILED,
                    '数据库连接失败',
                    event.target.error
                );
                this.processPendingOperations(null, error);
                reject(error);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isOpening = false;
                this.isClosed = false;
                this.connectionState = 'open';
                
                this.db.onclose = () => {
                    this.handleConnectionClose();
                };
                
                this.db.onerror = (event) => {
                    console.error('数据库错误:', event.target.error);
                };
                
                this.db.onversionchange = () => {
                    this.db.close();
                    this.db = null;
                    this.connectionState = 'version_change';
                };
                
                this.processPendingOperations(this.db, null);
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createObjectStores(db, event);
            };
            
            request.onblocked = () => {
                console.warn('数据库被阻塞，请关闭其他标签页');
            };
        });
    }
    
    /**
     * 创建对象存储
     * @param {IDBDatabase} db - 数据库实例
     * @param {IDBVersionChangeEvent} event - 版本变更事件
     */
    createObjectStores(db, event) {
        const oldVersion = event?.oldVersion || 0;
        
        for (const [storeName, config] of Object.entries(DB_CONFIG.stores)) {
            if (!db.objectStoreNames.contains(storeName)) {
                const store = db.createObjectStore(storeName, {
                    keyPath: config.keyPath,
                    autoIncrement: config.autoIncrement
                });
                
                for (const index of config.indexes) {
                    store.createIndex(index.name, index.keyPath, index.options);
                }
            } else if (event?.target?.transaction) {
                // 版本升级时，检查并添加缺失的索引
                const tx = event.target.transaction;
                const store = tx.objectStore(storeName);
                
                for (const index of config.indexes) {
                    if (!store.indexNames.contains(index.name)) {
                        store.createIndex(index.name, index.keyPath, index.options);
                    }
                }
            }
        }
    }
    
    /**
     * 处理待处理操作
     * @param {IDBDatabase|null} db - 数据库实例
     * @param {Error|null} error - 错误对象
     */
    processPendingOperations(db, error) {
        while (this.pendingOperations.length > 0) {
            const operation = this.pendingOperations.shift();
            if (error) {
                operation.reject(error);
            } else {
                operation.resolve(db);
            }
        }
    }
    
    /**
     * 处理连接关闭
     */
    handleConnectionClose() {
        this.db = null;
        this.isClosed = true;
        this.connectionState = 'closed';
        console.warn('数据库连接已关闭');
    }
    
    /**
     * 确保数据库已打开
     * @returns {Promise<IDBDatabase>}
     */
    async ensureOpen() {
        if (this.useFallback) {
            return null;
        }
        
        if (this.isClosed || !this.db) {
            return this.init();
        }
        
        return this.db;
    }
    
    /**
     * 添加数据
     * @param {string} storeName - 存储名称
     * @param {Object} data - 数据对象
     * @returns {Promise<string>} 添加的数据键
     * @throws {DatabaseError}
     */
    async add(storeName, data) {
        // 数据验证
        const validator = DataValidator.getValidator(storeName);
        if (validator) {
            const validation = validator(data);
            if (!validation.valid) {
                throw new DatabaseError(
                    DBErrorType.VALIDATION_ERROR,
                    `数据验证失败: ${validation.errors.join(', ')}`
                );
            }
        }
        
        // 使用降级方案
        if (this.useFallback) {
            await this.fallbackStorage.add(storeName, data);
            return data[DB_CONFIG.stores[storeName]?.keyPath || 'key'];
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                const error = this.handleTransactionError(request.error, '添加数据失败');
                reject(error);
            };
            
            tx.onerror = () => {
                reject(this.handleTransactionError(tx.error, '事务失败'));
            };
        });
    }
    
    /**
     * 获取单条数据
     * @param {string} storeName - 存储名称
     * @param {string} key - 数据键
     * @returns {Promise<Object|null>}
     * @throws {DatabaseError}
     */
    async get(storeName, key) {
        if (this.useFallback) {
            return this.fallbackStorage.get(storeName, key);
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '获取数据失败'));
            };
        });
    }
    
    /**
     * 更新或添加数据
     * @param {string} storeName - 存储名称
     * @param {Object} data - 数据对象
     * @returns {Promise<string>}
     * @throws {DatabaseError}
     */
    async put(storeName, data) {
        // 数据验证
        const validator = DataValidator.getValidator(storeName);
        if (validator) {
            const validation = validator(data);
            if (!validation.valid) {
                throw new DatabaseError(
                    DBErrorType.VALIDATION_ERROR,
                    `数据验证失败: ${validation.errors.join(', ')}`
                );
            }
        }
        
        if (this.useFallback) {
            await this.fallbackStorage.put(storeName, data);
            return data[DB_CONFIG.stores[storeName]?.keyPath || 'key'];
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '更新数据失败'));
            };
        });
    }
    
    /**
     * 删除数据
     * @param {string} storeName - 存储名称
     * @param {string} key - 数据键
     * @returns {Promise<void>}
     * @throws {DatabaseError}
     */
    async delete(storeName, key) {
        if (this.useFallback) {
            return this.fallbackStorage.delete(storeName, key);
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '删除数据失败'));
            };
        });
    }
    
    /**
     * 获取所有数据
     * @param {string} storeName - 存储名称
     * @returns {Promise<Array>}
     * @throws {DatabaseError}
     */
    async getAll(storeName) {
        if (this.useFallback) {
            return this.fallbackStorage.getAll(storeName);
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '获取所有数据失败'));
            };
        });
    }
    
    /**
     * 通过索引查询数据
     * @param {string} storeName - 存储名称
     * @param {string} indexName - 索引名称
     * @param {*} value - 查询值
     * @returns {Promise<Array>}
     * @throws {DatabaseError}
     */
    async getByIndex(storeName, indexName, value) {
        if (this.useFallback) {
            // 降级方案需要遍历所有数据
            const all = await this.fallbackStorage.getAll(storeName);
            return all.filter(item => item[indexName] === value);
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '索引查询失败'));
            };
        });
    }
    
    /**
     * 通过复合索引查询数据
     * @param {string} storeName - 存储名称
     * @param {string} indexName - 索引名称
     * @param {Array} values - 查询值数组
     * @returns {Promise<Array>}
     */
    async getByCompoundIndex(storeName, indexName, values) {
        if (this.useFallback) {
            const all = await this.fallbackStorage.getAll(storeName);
            return all.filter(item => {
                return values.every((val, idx) => {
                    const keyPath = DB_CONFIG.stores[storeName]?.indexes
                        ?.find(i => i.name === indexName)?.keyPath?.[idx];
                    return keyPath && item[keyPath] === val;
                });
            });
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(values);
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '复合索引查询失败'));
            };
        });
    }
    
    /**
     * 批量添加数据
     * @param {string} storeName - 存储名称
     * @param {Array} dataArray - 数据数组
     * @returns {Promise<number>} 成功添加的数量
     * @throws {DatabaseError}
     */
    async addBatch(storeName, dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return 0;
        }
        
        if (this.useFallback) {
            let count = 0;
            for (const data of dataArray) {
                try {
                    await this.fallbackStorage.add(storeName, data);
                    count++;
                } catch (e) {
                    console.warn('批量添加失败:', e);
                }
            }
            return count;
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            let count = 0;
            
            dataArray.forEach(data => {
                const request = store.add(data);
                request.onsuccess = () => count++;
            });
            
            tx.oncomplete = () => {
                resolve(count);
            };
            
            tx.onerror = () => {
                reject(this.handleTransactionError(tx.error, '批量添加失败'));
            };
        });
    }
    
    /**
     * 批量更新数据
     * @param {string} storeName - 存储名称
     * @param {Array} dataArray - 数据数组
     * @returns {Promise<number>}
     */
    async putBatch(storeName, dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return 0;
        }
        
        if (this.useFallback) {
            let count = 0;
            for (const data of dataArray) {
                try {
                    await this.fallbackStorage.put(storeName, data);
                    count++;
                } catch (e) {
                    console.warn('批量更新失败:', e);
                }
            }
            return count;
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            let count = 0;
            
            dataArray.forEach(data => {
                const request = store.put(data);
                request.onsuccess = () => count++;
            });
            
            tx.oncomplete = () => {
                resolve(count);
            };
            
            tx.onerror = () => {
                reject(this.handleTransactionError(tx.error, '批量更新失败'));
            };
        });
    }
    
    /**
     * 清空存储
     * @param {string} storeName - 存储名称
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        if (this.useFallback) {
            return this.fallbackStorage.clear(storeName);
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '清空存储失败'));
            };
        });
    }
    
    /**
     * 计数
     * @param {string} storeName - 存储名称
     * @returns {Promise<number>}
     */
    async count(storeName) {
        if (this.useFallback) {
            const all = await this.fallbackStorage.getAll(storeName);
            return all.length;
        }
        
        await this.ensureOpen();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(this.handleTransactionError(request.error, '计数失败'));
            };
        });
    }
    
    /**
     * 检查数据是否存在
     * @param {string} storeName - 存储名称
     * @param {string} key - 数据键
     * @returns {Promise<boolean>}
     */
    async exists(storeName, key) {
        const data = await this.get(storeName, key);
        return data !== null;
    }
    
    /**
     * 处理事务错误
     * @param {Error} error - 原始错误
     * @param {string} message - 错误消息
     * @returns {DatabaseError}
     */
    handleTransactionError(error, message) {
        if (error.name === 'QuotaExceededError') {
            return new DatabaseError(DBErrorType.QUOTA_EXCEEDED, '存储空间不足', error);
        }
        if (error.name === 'ConstraintError') {
            return new DatabaseError(DBErrorType.VALIDATION_ERROR, '数据约束错误', error);
        }
        return new DatabaseError(DBErrorType.TRANSACTION_FAILED, message, error);
    }
    
    /**
     * 获取存储估算
     * @returns {Promise<{quota: number, usage: number, available: number}>}
     */
    async getStorageEstimate() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            return {
                quota: estimate.quota || 0,
                usage: estimate.usage || 0,
                available: (estimate.quota || 0) - (estimate.usage || 0)
            };
        }
        return { quota: 0, usage: 0, available: 0 };
    }
    
    /**
     * 获取连接状态
     * @returns {string}
     */
    getConnectionState() {
        return this.connectionState;
    }
    
    /**
     * 是否使用降级方案
     * @returns {boolean}
     */
    isUsingFallback() {
        return this.useFallback;
    }
    
    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isClosed = true;
            this.connectionState = 'closed';
        }
    }
    
    /**
     * 删除数据库
     * @returns {Promise<void>}
     */
    async deleteDatabase() {
        this.close();
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(DB_CONFIG.name);
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(new DatabaseError(DBErrorType.TRANSACTION_FAILED, '删除数据库失败', request.error));
            };
        });
    }
}

/**
 * 创建全局数据库管理器实例
 */
const dbManager = new DatabaseManager();

export {
    DatabaseManager,
    DatabaseError,
    DBErrorType,
    DataValidator,
    FallbackStorage,
    DB_CONFIG,
    dbManager
};

export default dbManager;
