/**
 * 安全日志工具
 * 生产环境自动禁用所有日志输出，防止信息泄露
 * @module logger
 */

(function(global) {
    'use strict';

    /**
     * 环境检测
     * 通过hostname判断是否为生产环境
     */
    const isProduction = () => {
        const hostname = window.location.hostname;
        return hostname !== 'localhost' && 
               hostname !== '127.0.0.1' &&
               !hostname.startsWith('192.168.') &&
               !hostname.startsWith('10.') &&
               !hostname.startsWith('172.');
    };

    /**
     * 日志级别枚举
     */
    const LogLevel = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };

    /**
     * 安全日志管理器
     */
    const Logger = {
        /**
         * 当前日志级别
         * 生产环境为NONE，开发环境为DEBUG
         */
        level: isProduction() ? LogLevel.NONE : LogLevel.DEBUG,

        /**
         * 是否启用日志
         */
        enabled: !isProduction(),

        /**
         * 日志前缀
         */
        prefix: '[App]',

        /**
         * 设置日志级别
         * @param {number} level - 日志级别
         */
        setLevel(level) {
            this.level = level;
            this.enabled = level < LogLevel.NONE;
        },

        /**
         * 启用日志
         */
        enable() {
            this.enabled = true;
            this.level = LogLevel.DEBUG;
        },

        /**
         * 禁用日志
         */
        disable() {
            this.enabled = false;
            this.level = LogLevel.NONE;
        },

        /**
         * 调试日志
         * 仅开发环境输出
         * @param {...any} args - 日志参数
         */
        debug(...args) {
            if (this.enabled && this.level <= LogLevel.DEBUG) {
                console.log(this.prefix, ...args);
            }
        },

        /**
         * 信息日志
         * 仅开发环境输出
         * @param {...any} args - 日志参数
         */
        info(...args) {
            if (this.enabled && this.level <= LogLevel.INFO) {
                console.info(this.prefix, ...args);
            }
        },

        /**
         * 警告日志
         * 开发环境输出，生产环境可配置
         * @param {...any} args - 日志参数
         */
        warn(...args) {
            if (this.enabled && this.level <= LogLevel.WARN) {
                console.warn(this.prefix, ...args);
            }
        },

        /**
         * 错误日志
         * 开发环境输出到控制台
         * 生产环境可发送到日志服务器（需配置）
         * @param {...any} args - 日志参数
         */
        error(...args) {
            if (this.enabled && this.level <= LogLevel.ERROR) {
                console.error(this.prefix, ...args);
            }
            // 生产环境可发送到日志服务器
            // this.sendToServer('error', args);
        },

        /**
         * 分组日志开始
         * @param {string} label - 分组标签
         */
        group(label) {
            if (this.enabled && console.group) {
                console.group(label);
            }
        },

        /**
         * 分组日志结束
         */
        groupEnd() {
            if (this.enabled && console.groupEnd) {
                console.groupEnd();
            }
        },

        /**
         * 时间戳日志
         * @param {string} label - 时间标签
         */
        time(label) {
            if (this.enabled && console.time) {
                console.time(label);
            }
        },

        /**
         * 时间戳结束
         * @param {string} label - 时间标签
         */
        timeEnd(label) {
            if (this.enabled && console.timeEnd) {
                console.timeEnd(label);
            }
        },

        /**
         * 表格日志
         * @param {any} data - 表格数据
         */
        table(data) {
            if (this.enabled && console.table) {
                console.table(data);
            }
        },

        /**
         * 发送日志到服务器（可选实现）
         * @param {string} level - 日志级别
         * @param {any} data - 日志数据
         */
        sendToServer(level, data) {
            // 可在此实现日志上报逻辑
            // fetch('/api/logs', { ... });
        }
    };

    /**
     * 生产环境禁用原生console方法
     * 防止遗漏的console调用
     */
    if (isProduction()) {
        // 保存原始console引用（调试时可用）
        const _console = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };

        // 重写console方法为空函数
        console.log = function() {};
        console.info = function() {};
        console.warn = function() {};
        console.error = function() {};
        console.debug = function() {};

        // 可选：保留error用于关键错误追踪
        // console.error = _console.error;

        // 暴露原始console供调试使用（开发工具中可用）
        window._console = _console;
    }

    // 暴露到全局
    global.Logger = Logger;
    global.LogLevel = LogLevel;

})(typeof window !== 'undefined' ? window : this);
