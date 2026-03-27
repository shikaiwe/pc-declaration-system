/**
 * Web Worker 处理 Locations 数据
 * 在后台线程中处理 EPUB 位置信息生成，避免阻塞主线程
 * 
 * @module LocationWorker
 * @version 1.0.0
 */

let currentTask = null;
let cancelled = false;

/**
 * 消息处理
 */
self.onmessage = async (e) => {
    const { taskId, type, data } = e.data;
    
    switch (type) {
        case 'generate':
            await handleGenerate(taskId, data);
            break;
            
        case 'load':
            handleLoad(taskId, data);
            break;
            
        case 'cancel':
            handleCancel(taskId);
            break;
            
        case 'parse':
            handleParse(taskId, data);
            break;
    }
};

/**
 * 处理生成任务
 * @param {string} taskId - 任务 ID
 * @param {Object} data - 任务数据
 */
async function handleGenerate(taskId, data) {
    const { spineItems, chars } = data;
    cancelled = false;
    
    try {
        const locations = [];
        const total = spineItems.length;
        
        for (let i = 0; i < total; i++) {
            if (cancelled) {
                sendError(taskId, '任务已取消');
                return;
            }
            
            const item = spineItems[i];
            const sectionLocations = generateSectionLocations(item, chars);
            locations.push(...sectionLocations);
            
            // 发送进度
            sendProgress(taskId, {
                current: i + 1,
                total,
                percentage: Math.round((i + 1) / total * 100)
            });
        }
        
        sendComplete(taskId, locations);
    } catch (error) {
        sendError(taskId, error.message);
    }
}

/**
 * 生成章节位置信息
 * @param {Object} item - 章节项
 * @param {number} chars - 字符分段数
 * @returns {Array}
 */
function generateSectionLocations(item, chars) {
    const locations = [];
    
    // 简化的位置生成逻辑
    // 实际实现需要根据章节内容计算
    if (item.content) {
        const contentLength = item.content.length;
        const sectionCount = Math.ceil(contentLength / chars);
        
        for (let i = 0; i < sectionCount; i++) {
            locations.push({
                href: item.href,
                index: item.index,
                start: i * chars,
                end: Math.min((i + 1) * chars, contentLength)
            });
        }
    }
    
    return locations;
}

/**
 * 处理加载任务
 * @param {string} taskId - 任务 ID
 * @param {Object} data - 位置数据
 */
function handleLoad(taskId, data) {
    try {
        const locations = JSON.parse(data);
        sendComplete(taskId, locations);
    } catch (error) {
        sendError(taskId, error.message);
    }
}

/**
 * 处理取消
 * @param {string} taskId - 任务 ID
 */
function handleCancel(taskId) {
    cancelled = true;
    sendComplete(taskId, { cancelled: true });
}

/**
 * 处理解析任务
 * @param {string} taskId - 任务 ID
 * @param {Object} data - 解析数据
 */
function handleParse(taskId, data) {
    try {
        const { content, chars } = data;
        const locations = [];
        
        if (content && typeof content === 'string') {
            const contentLength = content.length;
            const sectionCount = Math.ceil(contentLength / chars);
            
            for (let i = 0; i < sectionCount; i++) {
                locations.push({
                    index: i,
                    start: i * chars,
                    end: Math.min((i + 1) * chars, contentLength),
                    preview: content.slice(i * chars, Math.min((i + 1) * chars, contentLength)).slice(0, 50)
                });
            }
        }
        
        sendComplete(taskId, locations);
    } catch (error) {
        sendError(taskId, error.message);
    }
}

/**
 * 发送进度
 * @param {string} taskId - 任务 ID
 * @param {Object} data - 进度数据
 */
function sendProgress(taskId, data) {
    self.postMessage({ taskId, type: 'progress', data });
}

/**
 * 发送完成
 * @param {string} taskId - 任务 ID
 * @param {Object} data - 结果数据
 */
function sendComplete(taskId, data) {
    self.postMessage({ taskId, type: 'complete', data });
}

/**
 * 发送错误
 * @param {string} taskId - 任务 ID
 * @param {string} message - 错误消息
 */
function sendError(taskId, message) {
    self.postMessage({ taskId, type: 'error', data: message });
}

/**
 * CFI 解析工具
 */
const CFIUtils = {
    /**
     * 解析 CFI 字符串
     * @param {string} cfi - CFI 字符串
     * @returns {Object}
     */
    parse(cfi) {
        if (!cfi || typeof cfi !== 'string') return null;
        
        // 简化的 CFI 解析
        const match = cfi.match(/epubcfi\(([^)]+)\)/);
        if (!match) return null;
        
        return {
            original: cfi,
            path: match[1]
        };
    },
    
    /**
     * 比较 CFI 位置
     * @param {string} a - CFI A
     * @param {string} b - CFI B
     * @returns {number} -1, 0, 1
     */
    compare(a, b) {
        const parsedA = this.parse(a);
        const parsedB = this.parse(b);
        
        if (!parsedA || !parsedB) return 0;
        
        return parsedA.path.localeCompare(parsedB.path);
    },
    
    /**
     * 从位置生成 CFI
     * @param {Object} location - 位置对象
     * @returns {string}
     */
    generate(location) {
        if (!location) return null;
        
        return `epubcfi(/6/${location.index}!/4/2/${location.start},${location.end})`;
    }
};

/**
 * 文本处理工具
 */
const TextUtils = {
    /**
     * 分词
     * @param {string} text - 文本
     * @returns {Array}
     */
    tokenize(text) {
        if (!text || typeof text !== 'string') return [];
        
        // 简单分词
        return text
            .toLowerCase()
            .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0);
    },
    
    /**
     * 提取关键词
     * @param {string} text - 文本
     * @param {number} count - 关键词数量
     * @returns {Array}
     */
    extractKeywords(text, count = 10) {
        const tokens = this.tokenize(text);
        const frequency = {};
        
        tokens.forEach(token => {
            frequency[token] = (frequency[token] || 0) + 1;
        });
        
        return Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([word, freq]) => ({ word, frequency: freq }));
    },
    
    /**
     * 计算阅读时间
     * @param {string} text - 文本
     * @param {number} wordsPerMinute - 每分钟阅读字数
     * @returns {number} 分钟
     */
    estimateReadingTime(text, wordsPerMinute = 300) {
        if (!text || typeof text !== 'string') return 0;
        
        // 中文按字符数，英文按单词数
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
        
        const totalWords = chineseChars + englishWords;
        
        return Math.ceil(totalWords / wordsPerMinute);
    }
};

/**
 * 导出工具（供主线程使用）
 */
self.CFIUtils = CFIUtils;
self.TextUtils = TextUtils;
