// 配置文件
const CONFIG = {
    ip: '8.134.178.71',
    BASE_URL: 'https://8.134.178.71/api',
    API_URLS: {
        // 用户相关
        LOGIN: '/users/login/',
        LOGOUT: '/dashboard/logout/',
        GET_USER_INFO: '/dashboard/get_user_info/',
        
        // 账户管理相关
        SAVE_PHONE: '/dashboard/savePhoneNumber/',
        GET_PHONE: '/dashboard/getPhoneNumber/',
        CHANGE_PASSWORD: '/dashboard/renew_password/',
        
        // 订单相关
        REPORT: '/dashboard/call_report/',
        GET_HISTORY: '/dashboard/user_get_history_report/',
        ASSIGN_ORDER: '/dashboard/assign_order/',
        GET_REPORT_LIST: '/dashboard/worker_get_report_list/',
        COMPLETE_REPORT: '/dashboard/complete_report/',
        
        // 天气相关
        WEATHER_API_KEY: '/dashboard/getWeatherApiKey/'
    }
}; 