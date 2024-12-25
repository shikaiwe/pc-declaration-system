// 工具函数
const utils = {
    // 加密函数
    encrypt: function(text) {
        return btoa(encodeURIComponent(text));
    },
    
    // 解密函数
    decrypt: function(encoded) {
        return decodeURIComponent(atob(encoded));
    },
    
    // 存储数据到 localStorage
    saveData: function(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error(`保存${key}数据失败:`, error);
        }
    },
    
    // 从 localStorage 获取数据
    getData: function(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`获取${key}数据失败:`, error);
            return null;
        }
    },
    
    // 从 localStorage 删除数据
    removeData: function(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`删除${key}数据失败:`, error);
        }
    },

    // 格式化日期
    formatDate: function(dateString) {
        try {
            if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
                const [datePart, timePart] = dateString.split(' ');
                const [year, month, day] = datePart.split('-');
                const [hours, minutes] = timePart.split(':');
                return `${year}年${parseInt(month)}月${parseInt(day)}日 ${hours}:${minutes}`;
            }
            
            if (typeof dateString === 'string' && dateString.includes('年') && dateString.includes('月')) {
                return dateString;
            }
            
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return '时间格式错误';
            }
            
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${year}年${month}月${day}日 ${hours}:${minutes}`;
        } catch (error) {
            console.error('日期格式化错误:', error);
            return '时间格式错误';
        }
    }
}; 