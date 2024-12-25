// UI相关功能
const UI = {
    showMessage: function(message, type = 'info') {
        const messageModal = document.getElementById('messageModal');
        const messageText = document.getElementById('messageText');
        const confirmButton = document.getElementById('messageConfirm');
        
        messageText.textContent = message;
        messageModal.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                messageModal.style.display = 'none';
            }, 3000);
        }
        
        confirmButton.onclick = () => {
            messageModal.style.display = 'none';
        };
    },

    showLoading: function(show = true) {
        let loader = document.querySelector('.loading-indicator');
        if (!loader && show) {
            loader = document.createElement('div');
            loader.className = 'loading-indicator';
            loader.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">加载中...</div>
            `;
            document.body.appendChild(loader);
        } else if (loader && !show) {
            loader.remove();
        }
    },

    toggleBodyScroll: function(disable) {
        if (disable) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    },

    handleSessionError: function(message) {
        switch (message) {
            case 'Session has expired':
                this.showMessage('会话已过期，请重新登录');
                break;
            case 'Invalid session':
                this.showMessage('无效会话，请重新登录');
                break;
            case 'No sessionid cookie':
                this.showMessage('未找到会话信息，请重新登录');
                break;
            default:
                this.showMessage('发生未知错误，请重新登录');
        }
        utils.removeData('username');
        utils.removeData('loginData');
        utils.removeData('rememberMe');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    }
}; 