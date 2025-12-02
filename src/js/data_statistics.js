// API端点配置
const API_URLS = {
    GET_USER_INFO: 'https://gznfpc.cn/api/dashboard/get_user_info/',
    GET_HISTORY: 'https://gznfpc.cn/api/dashboard/user_get_history_report/',
    GET_WORKER_REPORTS: 'https://gznfpc.cn/api/dashboard/worker_get_report_list/',
    GET_REPORT_OF_SAME_DAY: 'https://gznfpc.cn/api/dashboard/get_report_of_same_day/',
    TODAY_WORKERS: 'https://gznfpc.cn/api/dashboard/today_workers/'
};

// 数据统计配置
const STATS_CONFIG = {
    // 缓存过期时间（毫秒）
    CACHE_EXPIRY: 15 * 60 * 1000, // 15分钟
    // 默认时间范围
    DEFAULT_TIME_RANGE: 'week',
    // 图表主题
    CHART_THEME: 'light'
};

// 数据缓存对象
const dataCache = {
    cache: new Map(),
    
    // 设置缓存
    set(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    },
    
    // 获取缓存
    get(key) {
        const cached = this.cache.get(key);
        if (cached) {
            const isExpired = Date.now() - cached.timestamp > STATS_CONFIG.CACHE_EXPIRY;
            if (!isExpired) {
                return cached.data;
            } else {
                this.cache.delete(key);
            }
        }
        return null;
    },
    
    // 清除缓存
    clear(key) {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }
};

// 数据统计类
class DataStatistics {
    constructor() {
        this.currentUserRole = null;
        this.currentTimeRange = STATS_CONFIG.DEFAULT_TIME_RANGE;
        this.charts = {};
        this.init();
    }
    
    // 初始化方法
    init() {
        this.bindEventHandlers();
        this.loadUserInfo();
    }
    
    // 绑定事件处理
    bindEventHandlers() {
        // 时间范围选择器事件
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('time-range-btn')) {
                this.handleTimeRangeChange(e.target);
            }
        });
    }
    
    // 加载用户信息和角色
    async loadUserInfo() {
        try {
            const response = await $.ajax({
                url: API_URLS.GET_USER_INFO,
                method: 'GET',
                xhrFields: { withCredentials: true }
            });
            
            if (response.message === 'Success') {
                this.currentUserRole = response.label;
                this.initStatistics();
            } else {
                this.handleError(new Error('获取用户信息失败'), '无法获取用户角色');
            }
        } catch (error) {
            this.handleError(error, '加载用户信息失败');
        }
    }
    
    // 初始化统计数据
    async initStatistics() {
        try {
            await this.loadStatisticsData();
        } catch (error) {
            this.handleError(error, '初始化统计数据失败');
        }
    }
    
    // 处理时间范围变化
    handleTimeRangeChange(btn) {
        // 更新按钮状态
        document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 更新当前时间范围
        this.currentTimeRange = btn.dataset.range;
        
        // 重新加载数据
        this.loadStatisticsData();
    }
    
    // 加载统计数据
    async loadStatisticsData() {
        try {
            this.showLoading();
            
            let data;
            const cacheKey = `${this.currentUserRole}_${this.currentTimeRange}`;
            
            // 尝试从缓存获取数据
            const cachedData = dataCache.get(cacheKey);
            if (cachedData) {
                data = cachedData;
            } else {
                // 根据用户角色获取不同的数据
                if (this.currentUserRole === 'worker') {
                    data = await this.fetchWorkerStatistics();
                } else if (this.currentUserRole === 'admin') {
                    data = await this.fetchAdminStatistics();
                } else {
                    throw new Error('不支持的用户角色');
                }
                
                // 缓存数据
                dataCache.set(cacheKey, data);
            }
            
            // 渲染统计数据
            this.renderStatistics(data);
        } catch (error) {
            this.handleError(error, '加载统计数据失败');
        } finally {
            this.hideLoading();
        }
    }
    
    // 获取工作人员统计数据
    async fetchWorkerStatistics() {
        try {
            // 获取被分配的订单
            const workerReportsResponse = await $.ajax({
                url: API_URLS.GET_WORKER_REPORTS,
                method: 'GET',
                xhrFields: { withCredentials: true }
            });
            
            // 获取自己报的订单
            const userReportsResponse = await $.ajax({
                url: API_URLS.GET_HISTORY,
                method: 'GET',
                xhrFields: { withCredentials: true }
            });
            
            if (workerReportsResponse.message === 'Success' && userReportsResponse.message === 'Success') {
                // 合并订单数据
                const allOrders = [...workerReportsResponse.report_info, ...userReportsResponse.report_info];
                
                // 过滤指定时间范围内的订单
                const filteredOrders = this.filterOrdersByTimeRange(allOrders, this.currentTimeRange);
                
                // 计算统计数据
                return this.calculateWorkerStatistics(filteredOrders);
            } else {
                throw new Error('获取订单数据失败');
            }
        } catch (error) {
            throw error;
        }
    }
    
    // 获取管理员统计数据
    async fetchAdminStatistics() {
        try {
            // 获取当天的报告
            const reportsResponse = await $.ajax({
                url: API_URLS.GET_REPORT_OF_SAME_DAY,
                method: 'GET',
                xhrFields: { withCredentials: true }
            });
            
            // 获取工作人员列表
            const workersResponse = await $.ajax({
                url: API_URLS.TODAY_WORKERS,
                method: 'GET',
                xhrFields: { withCredentials: true }
            });
            
            if (reportsResponse.message === 'Success' && workersResponse.message === 'Success') {
                // 获取所有历史订单（模拟，实际可能需要更复杂的API调用）
                const allOrders = reportsResponse.reports;
                
                // 过滤指定时间范围内的订单
                const filteredOrders = this.filterOrdersByTimeRange(allOrders, this.currentTimeRange);
                
                // 计算统计数据
                return this.calculateAdminStatistics(filteredOrders, workersResponse.workers);
            } else {
                throw new Error('获取数据失败');
            }
        } catch (error) {
            throw error;
        }
    }
    
    // 过滤指定时间范围内的订单
    filterOrdersByTimeRange(orders, timeRange) {
        const now = new Date();
        let startDate;
        
        switch (timeRange) {
            case 'week':
                // 过去7天
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                // 过去30天
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'year':
                // 过去一年
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }
        
        return orders.filter(order => {
            const orderDate = new Date(order.call_date || order.date);
            return orderDate >= startDate;
        });
    }
    
    // 计算工作人员统计数据
    calculateWorkerStatistics(orders) {
        // 总接单量
        const totalOrders = orders.length;
        
        // 已完成订单
        const completedOrders = orders.filter(order => order.status === '2').length;
        
        // 计算平均处理时长
        let totalProcessingTime = 0;
        let completedOrdersWithTime = 0;
        
        orders.forEach(order => {
            if (order.status === '2' && order.call_date && order.completed_at) {
                const callDate = new Date(order.call_date);
                const completedDate = new Date(order.completed_at);
                const processingTime = (completedDate - callDate) / (1000 * 60); // 转换为分钟
                totalProcessingTime += processingTime;
                completedOrdersWithTime++;
            }
        });
        
        const avgProcessingTime = completedOrdersWithTime > 0 ? Math.round(totalProcessingTime / completedOrdersWithTime) : 0;
        
        // 订单状态分布
        const statusDistribution = {
            pending: 0,
            allocated: 0,
            completed: 0,
            cancelled: 0
        };
        
        orders.forEach(order => {
            switch (order.status) {
                case '0': statusDistribution.pending++;
                    break;
                case '1': statusDistribution.allocated++;
                    break;
                case '2': statusDistribution.completed++;
                    break;
                case '3': statusDistribution.cancelled++;
                    break;
            }
        });
        
        // 订单趋势（按天）
        const orderTrend = this.calculateOrderTrend(orders, this.currentTimeRange);
        
        return {
            totalOrders,
            completedOrders,
            avgProcessingTime,
            statusDistribution,
            orderTrend
        };
    }
    
    // 计算管理员统计数据
    calculateAdminStatistics(orders, workers) {
        // 总订单量
        const totalOrders = orders.length;
        
        // 已完成订单
        const completedOrders = orders.filter(order => order.status === '2').length;
        
        // 分单量（已分配的订单）
        const allocatedOrders = orders.filter(order => order.status === '1' || order.status === '2').length;
        
        // 工作人员接单情况
        const workerStats = {};
        workers.forEach(worker => {
            workerStats[worker.username] = 0;
        });
        
        orders.forEach(order => {
            if (order.workerName && workerStats[order.workerName] !== undefined) {
                workerStats[order.workerName]++;
            }
        });
        
        // 订单状态分布
        const statusDistribution = {
            pending: 0,
            allocated: 0,
            completed: 0,
            cancelled: 0
        };
        
        orders.forEach(order => {
            switch (order.status) {
                case '0': statusDistribution.pending++;
                    break;
                case '1': statusDistribution.allocated++;
                    break;
                case '2': statusDistribution.completed++;
                    break;
                case '3': statusDistribution.cancelled++;
                    break;
            }
        });
        
        // 订单趋势
        const orderTrend = this.calculateOrderTrend(orders, this.currentTimeRange);
        
        return {
            totalOrders,
            allocatedOrders,
            completedOrders,
            workerStats,
            statusDistribution,
            orderTrend
        };
    }
    
    // 计算订单趋势
    calculateOrderTrend(orders, timeRange) {
        const trend = {};
        
        // 初始化时间点
        const now = new Date();
        let days = 7;
        
        if (timeRange === 'month') {
            days = 30;
        } else if (timeRange === 'year') {
            days = 365;
        }
        
        // 初始化趋势对象
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            trend[dateKey] = 0;
        }
        
        // 统计每天的订单量
        orders.forEach(order => {
            const orderDate = new Date(order.call_date || order.date);
            const dateKey = orderDate.toISOString().split('T')[0];
            if (trend[dateKey] !== undefined) {
                trend[dateKey]++;
            }
        });
        
        return trend;
    }
    
    // 渲染统计数据
    renderStatistics(data) {
        if (this.currentUserRole === 'worker') {
            this.renderWorkerStatistics(data);
        } else if (this.currentUserRole === 'admin') {
            this.renderAdminStatistics(data);
        }
    }
    
    // 渲染工作人员统计数据
    renderWorkerStatistics(data) {
        // 更新数据卡片
        document.getElementById('totalOrdersCard')?.querySelector('.stat-value').textContent = data.totalOrders;
        document.getElementById('completedOrdersCard')?.querySelector('.stat-value').textContent = data.completedOrders;
        document.getElementById('avgProcessingTimeCard')?.querySelector('.stat-value').textContent = `${data.avgProcessingTime}分钟`;
        
        // 更新移动端数据卡片
        document.getElementById('mobileTotalOrders')?.querySelector('.stat-value').textContent = data.totalOrders;
        document.getElementById('mobileCompletedOrders')?.querySelector('.stat-value').textContent = data.completedOrders;
        document.getElementById('mobileAvgProcessingTime')?.querySelector('.stat-value').textContent = `${data.avgProcessingTime}分钟`;
        
        // 渲染图表
        this.renderOrderTrendChart(data.orderTrend);
        this.renderOrderStatusChart(data.statusDistribution);
        this.renderProcessingTimeChart(data.avgProcessingTime);
    }
    
    // 渲染管理员统计数据
    renderAdminStatistics(data) {
        // 更新数据卡片
        document.getElementById('totalOrdersCard')?.querySelector('.stat-value').textContent = data.totalOrders;
        document.getElementById('completedOrdersCard')?.querySelector('.stat-value').textContent = data.completedOrders;
        document.getElementById('avgProcessingTimeCard')?.querySelector('.stat-value').textContent = `${data.allocatedOrders}单`;
        
        // 更新移动端数据卡片
        document.getElementById('mobileTotalOrders')?.querySelector('.stat-value').textContent = data.totalOrders;
        document.getElementById('mobileCompletedOrders')?.querySelector('.stat-value').textContent = data.completedOrders;
        document.getElementById('mobileAvgProcessingTime')?.querySelector('.stat-value').textContent = `${data.allocatedOrders}单`;
        
        // 渲染图表
        this.renderOrderTrendChart(data.orderTrend);
        this.renderOrderStatusChart(data.statusDistribution);
        this.renderWorkerStatsChart(data.workerStats);
    }
    
    // 渲染订单趋势图
    renderOrderTrendChart(trendData) {
        // 转换数据格式
        const dates = Object.keys(trendData);
        const values = Object.values(trendData);
        
        // 渲染PC端图表
        const pcChartElement = document.getElementById('orderTrendChart');
        if (pcChartElement) {
            // 销毁旧图表
            if (this.charts.pcOrderTrend) {
                this.charts.pcOrderTrend.dispose();
            }
            
            // 初始化新图表
            this.charts.pcOrderTrend = echarts.init(pcChartElement);
            
            const option = {
                title: {
                    text: '订单趋势',
                    left: 'center'
                },
                tooltip: {
                    trigger: 'axis',
                    formatter: '{b}: {c}单'
                },
                xAxis: {
                    type: 'category',
                    data: dates,
                    axisLabel: {
                        rotate: 45,
                        interval: this.currentTimeRange === 'week' ? 0 : 6
                    }
                },
                yAxis: {
                    type: 'value',
                    name: '订单数量'
                },
                series: [{
                    data: values,
                    type: 'line',
                    smooth: true,
                    itemStyle: {
                        color: '#2196F3'
                    },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [{
                                offset: 0, color: 'rgba(33, 150, 243, 0.5)'
                            }, {
                                offset: 1, color: 'rgba(33, 150, 243, 0.1)'
                            }]
                        }
                    }
                }]
            };
            
            this.charts.pcOrderTrend.setOption(option);
        }
        
        // 渲染移动端图表
        const mobileChartElement = document.getElementById('mobileOrderTrendChart');
        if (mobileChartElement) {
            // 销毁旧图表
            if (this.charts.mobileOrderTrend) {
                this.charts.mobileOrderTrend.dispose();
            }
            
            // 初始化新图表
            this.charts.mobileOrderTrend = echarts.init(mobileChartElement);
            
            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: '{b}: {c}单'
                },
                xAxis: {
                    type: 'category',
                    data: dates,
                    axisLabel: {
                        rotate: 45,
                        interval: this.currentTimeRange === 'week' ? 0 : 14
                    }
                },
                yAxis: {
                    type: 'value',
                    name: '数量'
                },
                series: [{
                    data: values,
                    type: 'line',
                    smooth: true,
                    itemStyle: {
                        color: '#2196F3'
                    }
                }]
            };
            
            this.charts.mobileOrderTrend.setOption(option);
        }
    }
    
    // 渲染订单状态分布图表
    renderOrderStatusChart(statusData) {
        const data = [
            { value: statusData.pending, name: '待分配' },
            { value: statusData.allocated, name: '已分配' },
            { value: statusData.completed, name: '已完成' },
            { value: statusData.cancelled, name: '已取消' }
        ];
        
        // 渲染PC端图表
        const pcChartElement = document.getElementById('orderStatusChart');
        if (pcChartElement) {
            if (this.charts.pcOrderStatus) {
                this.charts.pcOrderStatus.dispose();
            }
            
            this.charts.pcOrderStatus = echarts.init(pcChartElement);
            
            const option = {
                title: {
                    text: '订单状态分布',
                    left: 'center'
                },
                tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c} ({d}%)'
                },
                legend: {
                    orient: 'vertical',
                    left: 'left'
                },
                series: [{
                    name: '订单状态',
                    type: 'pie',
                    radius: '50%',
                    data: data,
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowOffsetX: 0,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    }
                }]
            };
            
            this.charts.pcOrderStatus.setOption(option);
        }
        
        // 渲染移动端图表
        const mobileChartElement = document.getElementById('mobileOrderStatusChart');
        if (mobileChartElement) {
            if (this.charts.mobileOrderStatus) {
                this.charts.mobileOrderStatus.dispose();
            }
            
            this.charts.mobileOrderStatus = echarts.init(mobileChartElement);
            
            const option = {
                tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c} ({d}%)'
                },
                legend: {
                    orient: 'horizontal',
                    bottom: 0
                },
                series: [{
                    name: '订单状态',
                    type: 'pie',
                    radius: '60%',
                    data: data
                }]
            };
            
            this.charts.mobileOrderStatus.setOption(option);
        }
    }
    
    // 渲染处理时长图表
    renderProcessingTimeChart(avgProcessingTime) {
        // 渲染PC端图表
        const pcChartElement = document.getElementById('processingTimeChart');
        if (pcChartElement) {
            if (this.charts.pcProcessingTime) {
                this.charts.pcProcessingTime.dispose();
            }
            
            this.charts.pcProcessingTime = echarts.init(pcChartElement);
            
            const option = {
                title: {
                    text: '平均处理时长',
                    left: 'center'
                },
                tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c}分钟'
                },
                series: [{
                    name: '平均处理时长',
                    type: 'gauge',
                    data: [{ value: avgProcessingTime, name: '分钟' }],
                    min: 0,
                    max: 120,
                    splitNumber: 6,
                    axisLine: {
                        lineStyle: {
                            width: 15,
                            color: [[0.5, '#52c41a'], [0.8, '#faad14'], [1, '#f5222d']]
                        }
                    },
                    pointer: {
                        itemStyle: {
                            color: '#2196F3'
                        }
                    },
                    axisTick: {
                        distance: -30
                    },
                    splitLine: {
                        distance: -38,
                        length: 15
                    },
                    axisLabel: {
                        distance: -40
                    }
                }]
            };
            
            this.charts.pcProcessingTime.setOption(option);
        }
    }
    
    // 渲染工作人员统计图表
    renderWorkerStatsChart(workerStats) {
        // 转换数据格式
        const workerNames = Object.keys(workerStats);
        const workerValues = Object.values(workerStats);
        
        // 渲染PC端图表
        const pcChartElement = document.getElementById('processingTimeChart');
        if (pcChartElement) {
            if (this.charts.pcWorkerStats) {
                this.charts.pcWorkerStats.dispose();
            }
            
            this.charts.pcWorkerStats = echarts.init(pcChartElement);
            
            const option = {
                title: {
                    text: '工作人员接单情况',
                    left: 'center'
                },
                tooltip: {
                    trigger: 'axis',
                    formatter: '{b}: {c}单'
                },
                xAxis: {
                    type: 'category',
                    data: workerNames,
                    axisLabel: {
                        rotate: 45
                    }
                },
                yAxis: {
                    type: 'value',
                    name: '接单数量'
                },
                series: [{
                    data: workerValues,
                    type: 'bar',
                    itemStyle: {
                        color: '#2196F3'
                    }
                }]
            };
            
            this.charts.pcWorkerStats.setOption(option);
        }
    }
    
    // 显示加载状态
    showLoading() {
        // 显示PC端加载状态
        const pcContainer = document.querySelector('.data-stats-container');
        if (pcContainer) {
            const loadingElement = document.createElement('div');
            loadingElement.className = 'loading';
            loadingElement.innerHTML = '数据加载中...';
            loadingElement.id = 'statsLoading';
            pcContainer.appendChild(loadingElement);
        }
        
        // 显示移动端加载状态
        const mobileContainer = document.getElementById('dataStatisticsContent');
        if (mobileContainer) {
            const loadingElement = document.createElement('div');
            loadingElement.className = 'loading';
            loadingElement.innerHTML = '数据加载中...';
            loadingElement.id = 'mobileStatsLoading';
            mobileContainer.appendChild(loadingElement);
        }
    }
    
    // 隐藏加载状态
    hideLoading() {
        // 隐藏PC端加载状态
        const pcLoading = document.getElementById('statsLoading');
        if (pcLoading) {
            pcLoading.remove();
        }
        
        // 隐藏移动端加载状态
        const mobileLoading = document.getElementById('mobileStatsLoading');
        if (mobileLoading) {
            mobileLoading.remove();
        }
    }
    
    // 处理错误
    handleError(error, message) {
        console.error(message, error);
        
        // 显示错误消息
        this.showMessage(message, 'error');
        this.hideLoading();
    }
    
    // 显示消息
    showMessage(message, type = 'info') {
        // 创建消息元素
        const messageElement = document.createElement('div');
        messageElement.className = `form-message ${type}`;
        messageElement.textContent = message;
        messageElement.style.display = 'block';
        
        // 添加到页面
        const container = document.querySelector('.data-stats-container') || document.body;
        container.appendChild(messageElement);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (messageElement.parentElement) {
                messageElement.parentElement.removeChild(messageElement);
            }
        }, 3000);
    }
}

// 导出数据统计类
export default DataStatistics;
