// 日期时间选择器
class DateTimePicker {
    constructor(inputElement) {
        this.input = inputElement;
        this.init();
    }

    init() {
        this.createPickerElement();
        this.initSwipers();
        this.bindEvents();
    }

    createPickerElement() {
        const pickerContainer = document.createElement('div');
        pickerContainer.className = 'datetime-picker';
        pickerContainer.innerHTML = `
            <div class="picker-container">
                <div class="picker-header">
                    <button class="picker-cancel">取消</button>
                    <div class="picker-title">选择时间</div>
                    <button class="picker-confirm">确定</button>
                </div>
                <div class="picker-content">
                    <div class="swiper-container date-swiper">
                        <div class="swiper-wrapper">
                            ${this.generateDateSlides()}
                        </div>
                        <div class="swiper-scrollbar"></div>
                    </div>
                    <div class="swiper-container time-swiper">
                        <div class="swiper-wrapper">
                            ${this.generateTimeSlides()}
                        </div>
                        <div class="swiper-scrollbar"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(pickerContainer);
        this.pickerContainer = pickerContainer;
    }

    generateDateSlides() {
        const dates = [];
        const today = new Date();
        for (let i = 0; i < 14; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(`
                <div class="swiper-slide">
                    <div class="date-item">
                        ${date.getMonth() + 1}月${date.getDate()}日
                    </div>
                </div>
            `);
        }
        return dates.join('');
    }

    generateTimeSlides() {
        const times = [];
        for (let hour = 18; hour < 21; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                times.push(`
                    <div class="swiper-slide">
                        <div class="time-item">
                            ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}
                        </div>
                    </div>
                `);
            }
        }
        times.push(`
            <div class="swiper-slide">
                <div class="time-item">21:00</div>
            </div>
        `);
        return times.join('');
    }

    initSwipers() {
        setTimeout(() => {
            this.dateSwiper = new Swiper('.date-swiper', {
                direction: 'vertical',
                slidesPerView: 5,
                centeredSlides: true,
                spaceBetween: 10,
                scrollbar: {
                    el: '.date-swiper .swiper-scrollbar',
                },
                touchRatio: 1.5,
                resistance: true,
                resistanceRatio: 0.85,
                touchAngle: 45,
                touchReleaseOnEdges: true,
            });

            this.timeSwiper = new Swiper('.time-swiper', {
                direction: 'vertical',
                slidesPerView: 5,
                centeredSlides: true,
                spaceBetween: 10,
                scrollbar: {
                    el: '.time-swiper .swiper-scrollbar',
                },
                touchRatio: 1.5,
                resistance: true,
                resistanceRatio: 0.85,
                touchAngle: 45,
                touchReleaseOnEdges: true,
            });
        }, 0);
    }

    bindEvents() {
        this.input.addEventListener('click', () => this.show());

        const cancelBtn = this.pickerContainer.querySelector('.picker-cancel');
        const confirmBtn = this.pickerContainer.querySelector('.picker-confirm');
        const pickerContent = this.pickerContainer.querySelector('.picker-container');

        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        });

        confirmBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.confirm();
        });

        // 防止点击选择器内容时关闭
        pickerContent.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 点击背景关闭选择器
        this.pickerContainer.addEventListener('click', (e) => {
            if (e.target === this.pickerContainer) {
                this.hide();
            }
        });

        // 添加触摸事件处理
        let startY = 0;
        let currentY = 0;

        pickerContent.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        });

        pickerContent.addEventListener('touchmove', (e) => {
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            
            if (deltaY > 0) {
                pickerContent.style.transform = `translateY(${deltaY}px)`;
            }
        });

        pickerContent.addEventListener('touchend', () => {
            if (currentY - startY > 100) {
                this.hide();
            } else {
                this.resetTouchState(pickerContent);
            }
        });

        pickerContent.addEventListener('touchcancel', () => {
            this.resetTouchState(pickerContent);
        });
    }

    resetTouchState(element) {
        element.style.transform = '';
    }

    show() {
        this.pickerContainer.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    hide() {
        this.pickerContainer.classList.remove('active');
        document.body.style.overflow = '';
        const pickerContent = this.pickerContainer.querySelector('.picker-container');
        if (pickerContent) {
            pickerContent.style.transform = '';
        }
    }

    confirm() {
        if (this.dateSwiper && this.timeSwiper) {
            const selectedDate = this.dateSwiper.slides[this.dateSwiper.activeIndex]
                .querySelector('.date-item').textContent.trim();
            const selectedTime = this.timeSwiper.slides[this.timeSwiper.activeIndex]
                .querySelector('.time-item').textContent.trim();
            
            const year = new Date().getFullYear();
            const [month, day] = selectedDate.match(/(\d+)月(\d+)日/).slice(1);
            
            const displayDateTime = `${year}年${month}月${day}日 ${selectedTime}`;
            const submitDateTime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${selectedTime}`;
            
            this.input.value = displayDateTime;
            this.input.dataset.submitValue = submitDateTime;
            
            this.hide();
        }
    }
} 