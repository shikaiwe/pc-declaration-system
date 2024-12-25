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
    }
}; 