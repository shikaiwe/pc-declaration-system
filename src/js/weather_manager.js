// 天气管理模块 - 统一处理PC端和移动端的天气功能
class WeatherManager {
    constructor() {
        this.SESSION_ERRORS = ['Session has expired', 'Invalid session', 'No sessionid cookie'];
    }

    // 检查是否是会话错误
    isSessionError(message) {
        return this.SESSION_ERRORS.includes(message);
    }

    // 统一错误处理
    handleError(error, container) {
        console.error('天气操作失败:', error);
        const errorMessage = this.isSessionError(error.message)
            ? '会话已过期，请重新登录'
            : '无法获取天气信息，请稍后重试';

        if (container) {
            container.innerHTML = `<p>${errorMessage}</p>`;
        }

        if (this.isSessionError(error.message)) {
            // 需要从外部传入auth对象
            if (typeof auth !== 'undefined' && auth.handleSessionError) {
                auth.handleSessionError(error.message);
            }
        }
    }

    // 从 ip.sb 获取 IP 信息
    async getIpInfo() {
        try {
            const response = await fetch('https://api.vore.top/api/IPdata?ip=');
            if (!response.ok) {
                throw new Error('网络请求失败');
            }
            const data = await response.json();
            
            if (data.code === 200) {
                return {
                    ip: data.ipinfo.text,
                    ipdata: data.ipdata
                };
            } else {
                throw new Error('获取IP信息失败: ' + data.msg);
            }
        } catch (error) {
            console.error('获取IP信息出错:', error);
            throw error;
        }
    }

    // 获取天气信息
    async fetchWeatherAndLocation(containerId = 'weatherInfo') {
        const weatherInfoElement = document.getElementById(containerId);
        if (!weatherInfoElement) {
            console.error('天气容器元素未找到:', containerId);
            return;
        }

        try {
            // 获取天气信息
            const response = await $.ajax({
                url: API_URLS.GET_CITY_AND_WEATHER,
                method: 'POST',
                data: JSON.stringify({ ip: 'none' }),
                contentType: 'application/json',
                xhrFields: { withCredentials: true }
            });

            if (response.message === 'Success') {
                if (!response.weather || !response.IP || !response.IP.city) {
                    throw new Error('天气数据格式不正确');
                }
                // 更新天气显示
                this.updateWeatherDisplay(response.IP, response.weather, containerId);
            } else if (this.isSessionError(response.message)) {
                if (typeof auth !== 'undefined' && auth.handleSessionError) {
                    auth.handleSessionError(response.message);
                }
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            console.error('获取天气信息失败:', error);
            weatherInfoElement.innerHTML = `
                <div class="weather-error">
                    <p>暂无天气信息</p>
                    <p class="error-details">${error.message}</p>
                </div>`;
        }
    }

    // 更新天气显示
    updateWeatherDisplay(ipInfo, weatherData, containerId = 'weatherInfo') {
        const weatherInfoElement = document.getElementById(containerId);
        if (!weatherInfoElement) return;

        // 添加数据验证
        if (!weatherData || !ipInfo || !ipInfo.city) {
            weatherInfoElement.innerHTML = '<div class="weather-error">天气数据不完整</div>';
            return;
        }

        // 确保所有必需的天气数据字段都存在并正确处理
        const weather = {
            weather: weatherData.weather ? weatherData.weather.weather || '未知' : '未知',
            temperature: weatherData.weather ? weatherData.weather.temperature || '未知' : '未知',
            winddirection: weatherData.weather ? weatherData.weather.winddirection || '未知' : '未知',
            windpower: weatherData.weather ? weatherData.weather.windpower || '未知' : '未知',
            humidity: weatherData.weather ? weatherData.weather.humidity || '未知' : '未知',
            updateTime: weatherData.weather ? weatherData.weather.updateTime || '未知' : '未知'
        };

        weatherInfoElement.innerHTML = `
            <div class="weather-content">
                <div class="weather-main">
                    <div class="weather-location">
                        <span class="weather-icon">📍</span>
                        ${ipInfo.city}
                    </div>
                    <div class="weather-temp">
                        <span class="weather-icon">🌡️</span>
                        ${weather.temperature}°C
                    </div>
                </div>
                <div class="weather-info-details">
                    <div class="weather-row">
                        <span class="weather-icon">🌤️</span>
                        <span>天气：${weather.weather}</span>
                    </div>
                    <div class="weather-row">
                        <span class="weather-icon">💧</span>
                        <span>湿度：${weather.humidity}%</span>
                    </div>
                    <div class="weather-row">
                        <span class="weather-icon">🌪️</span>
                        <span>风向：${weather.winddirection}</span>
                    </div>
                    <div class="weather-row">
                        <span class="weather-icon">💨</span>
                        <span>风力：${weather.windpower}</span>
                    </div>
                </div>
                <div class="weather-update">
                    <span class="weather-icon">🕒</span>
                    <span>更新时间：${weather.updateTime}</span>
                </div>
            </div>
        `;
    }

    // 初始化天气模块
    init(containerId = 'weatherInfo') {
        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.fetchWeatherAndLocation(containerId);
            });
        } else {
            this.fetchWeatherAndLocation(containerId);
        }
    }
}

// 创建全局天气管理器实例
const weatherManager = new WeatherManager();

export default weatherManager;