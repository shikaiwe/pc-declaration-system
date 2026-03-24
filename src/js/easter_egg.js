/**
 * 彩蛋视频播放模块
 * 使用Artplayer.js实现彩蛋视频播放功能
 * 触发方式：连续点击用户名5次（间隔不超过500ms）
 */

class EasterEgg {
    constructor() {
        this.clickCount = 0;
        this.clickTimer = null;
        this.requiredClicks = 5;
        this.clickTimeout = 500;
        this.artInstance = null;
        this.isInitialized = false;
        this.videoUrl = '/Video/彩蛋视频.mp4';
        this.posterUrl = '../images/Mascot.jpg';
    }

    /**
     * 初始化彩蛋功能
     * 自动检测不同页面的触发元素：
     * - PC端：#currentTime（顶部导航栏时间显示）
     * - 移动端：.user-greeting（用户问候语区域）
     */
    init() {
        if (this.isInitialized) return;
        
        let triggerElement = null;
        let triggerType = '';
        
        const currentTimeEl = document.getElementById('currentTime');
        const userGreetingEl = document.querySelector('.user-greeting');
        
        if (currentTimeEl) {
            triggerElement = currentTimeEl;
            triggerType = 'PC端-时间显示';
        } else if (userGreetingEl) {
            triggerElement = userGreetingEl;
            triggerType = '移动端-用户问候';
        }
        
        if (triggerElement) {
            triggerElement.style.cursor = 'pointer';
            triggerElement.style.userSelect = 'none';
            triggerElement.addEventListener('click', this.handleClick.bind(this));
            this.triggerElement = triggerElement;
            this.isInitialized = true;
            console.log(`[EasterEgg] 彩蛋功能已初始化 (${triggerType})`);
        } else {
            console.warn('[EasterEgg] 未找到触发元素');
        }
    }

    /**
     * 处理点击事件
     * @param {Event} e - 点击事件对象
     */
    handleClick(e) {
        e.stopPropagation();
        
        this.clickCount++;
        
        if (this.clickTimer) {
            clearTimeout(this.clickTimer);
        }

        if (this.clickCount >= this.requiredClicks) {
            this.triggerEasterEgg();
            this.clickCount = 0;
            return;
        }

        this.clickTimer = setTimeout(() => {
            this.clickCount = 0;
        }, this.clickTimeout);
    }

    /**
     * 触发彩蛋视频播放
     */
    triggerEasterEgg() {
        console.log('[EasterEgg] 彩蛋触发！');
        this.showVideoModal();
    }

    /**
     * 显示视频模态框
     */
    showVideoModal() {
        const existingModal = document.getElementById('easterEggModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'easterEggModal';
        modal.innerHTML = `
            <div class="easter-egg-overlay"></div>
            <div class="easter-egg-container">
                <button class="easter-egg-close" id="closeEasterEgg">
                    <span class="iconify" data-icon="mdi:close"></span>
                </button>
                <div class="easter-egg-video-wrapper">
                    <div id="easterEggPlayer"></div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(() => {
            modal.classList.add('active');
        });

        this.initPlayer();
        this.bindModalEvents();
    }

    /**
     * 初始化Artplayer播放器
     */
    initPlayer() {
        if (typeof Artplayer === 'undefined') {
            console.error('[EasterEgg] Artplayer未加载');
            this.loadArtplayerScript().then(() => {
                this.createPlayer();
            });
        } else {
            this.createPlayer();
        }
    }

    /**
     * 动态加载Artplayer脚本
     * @returns {Promise} 加载完成的Promise
     */
    loadArtplayerScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '../vendor/Artplayer/artplayer.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * 创建Artplayer播放器实例
     */
    createPlayer() {
        const container = document.getElementById('easterEggPlayer');
        if (!container) return;

        const isMobile = window.innerWidth <= 768;

        this.artInstance = new Artplayer({
            container: container,
            url: this.videoUrl,
            poster: this.posterUrl,
            autoplay: true,
            muted: false,
            pip: true,
            autoSize: false,
            autoMini: true,
            screenshot: false,
            setting: true,
            loop: false,
            flip: false,
            playbackRate: true,
            aspectRatio: false,
            fullscreen: true,
            fullscreenWeb: true,
            subtitleOffset: false,
            miniProgressBar: true,
            mutex: true,
            backdrop: true,
            playsInline: true,
            autoPlayback: false,
            airplay: true,
            theme: '#0369A1',
            lang: navigator.language.toLowerCase(),
            moreVideoAttr: {
                crossOrigin: 'anonymous'
            },
            style: {
                width: isMobile ? '100%' : '800px',
                height: isMobile ? 'auto' : '450px'
            },
            controls: [
                {
                    name: 'fast-rewind',
                    position: 'right',
                    html: '<span class="iconify" data-icon="mdi:rewind-10"></span>',
                    tooltip: '后退10秒',
                    click: function() {
                        this.seek = Math.max(0, this.currentTime - 10);
                    }
                },
                {
                    name: 'fast-forward',
                    position: 'right',
                    html: '<span class="iconify" data-icon="mdi:fast-forward-10"></span>',
                    tooltip: '前进10秒',
                    click: function() {
                        this.seek = Math.min(this.duration, this.currentTime + 10);
                    }
                }
            ],
            customType: {
                mp4: function(video, url) {
                    video.src = url;
                }
            }
        });

        this.bindPlayerEvents();
    }

    /**
     * 绑定播放器事件
     */
    bindPlayerEvents() {
        if (!this.artInstance) return;

        this.artInstance.on('ready', () => {
            console.log('[EasterEgg] 播放器准备就绪');
        });

        this.artInstance.on('play', () => {
            console.log('[EasterEgg] 视频开始播放');
        });

        this.artInstance.on('pause', () => {
            console.log('[EasterEgg] 视频暂停');
        });

        this.artInstance.on('ended', () => {
            console.log('[EasterEgg] 视频播放结束');
            setTimeout(() => {
                this.closeModal();
            }, 2000);
        });

        this.artInstance.on('error', (error) => {
            console.error('[EasterEgg] 播放错误:', error);
            this.handleVideoError();
        });
    }

    /**
     * 处理视频加载错误
     */
    handleVideoError() {
        const container = document.getElementById('easterEggPlayer');
        if (container) {
            container.innerHTML = `
                <div class="easter-egg-error">
                    <span class="iconify" data-icon="mdi:video-off"></span>
                    <p>视频加载失败</p>
                    <p class="easter-egg-error-hint">请确保视频文件存在：${this.videoUrl}</p>
                </div>
            `;
        }
    }

    /**
     * 绑定模态框事件
     */
    bindModalEvents() {
        const modal = document.getElementById('easterEggModal');
        const closeBtn = document.getElementById('closeEasterEgg');
        const overlay = modal.querySelector('.easter-egg-overlay');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        if (overlay) {
            overlay.addEventListener('click', () => this.closeModal());
        }

        document.addEventListener('keydown', this.handleEscKey.bind(this));
    }

    /**
     * 处理ESC键关闭
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleEscKey(e) {
        if (e.key === 'Escape') {
            this.closeModal();
        }
    }

    /**
     * 关闭模态框
     */
    closeModal() {
        const modal = document.getElementById('easterEggModal');
        if (modal) {
            modal.classList.remove('active');
            
            setTimeout(() => {
                if (this.artInstance) {
                    this.artInstance.destroy();
                    this.artInstance = null;
                }
                modal.remove();
                document.body.style.overflow = '';
            }, 300);
        }

        document.removeEventListener('keydown', this.handleEscKey.bind(this));
    }

    /**
     * 销毁彩蛋实例
     */
    destroy() {
        this.closeModal();
        if (this.triggerElement) {
            this.triggerElement.removeEventListener('click', this.handleClick.bind(this));
            this.triggerElement = null;
        }
        this.isInitialized = false;
    }
}

const easterEgg = new EasterEgg();

export default easterEgg;
