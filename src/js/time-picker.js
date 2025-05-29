/**
 * 现代化时间选择器组件
 * @class TimePicker
 */
class TimePicker {
    constructor(options = {}) {
        // 默认配置
        this.config = {
            inputSelector: '#preferredTime', // 默认输入框选择器
            minDate: new Date(), // 最早可选日期（默认今天）
            maxDate: new Date(new Date().setMonth(new Date().getMonth() + 3)), // 最晚可选日期（默认3个月后）
            timeSlots: ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30'], // 时间段选项
            dateFormat: 'YYYY-MM-DD', // 日期格式
            timeFormat: 'HH:mm', // 时间格式
            monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
            dayNames: ['日', '一', '二', '三', '四', '五', '六'],
            ...options
        };

        // 初始化状态
        this.state = {
            currentMonth: new Date(),
            selectedDate: null,
            selectedTime: null,
            isOpen: false,
            currentStep: 'date' // 新增：当前步骤，默认为日期选择
        };

        // 初始化DOM引用
        this.elements = {
            input: document.querySelector(this.config.inputSelector),
            container: null,
            panel: null
        };

        // 如果找不到输入框元素，直接返回
        if (!this.elements.input) {
            console.error(`找不到选择器为 ${this.config.inputSelector} 的元素`);
            return;
        }

        // 初始化选择器
        this.init();
    }

    /**
     * 初始化时间选择器
     */
    init() {
        // 创建容器
        this.createContainer();

        // 渲染选择器
        this.render();

        // 绑定事件
        this.bindEvents();
    }

    /**
     * 创建时间选择器容器
     */
    createContainer() {
        // 创建容器并设置样式
        const container = document.createElement('div');
        container.className = 'time-picker-container';

        // 获取原始输入框的位置和大小
        const inputRect = this.elements.input.getBoundingClientRect();

        // 将原始输入框替换为自定义输入框
        const originalInput = this.elements.input;
        originalInput.type = 'hidden'; // 将原始输入框设为隐藏

        // 创建自定义输入框
        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.className = 'time-picker-input';
        customInput.readOnly = true;
        customInput.placeholder = '请选择时间';

        // 创建时间图标
        const icon = document.createElement('span');
        icon.className = 'time-picker-icon';
        icon.innerHTML = '🕒';

        // 创建面板容器
        const panel = document.createElement('div');
        panel.className = 'time-picker-panel';

        // 添加元素到容器
        container.appendChild(customInput);
        container.appendChild(icon);
        container.appendChild(panel);

        // 插入容器到DOM
        originalInput.parentNode.insertBefore(container, originalInput.nextSibling);

        // 更新元素引用
        this.elements.container = container;
        this.elements.customInput = customInput;
        this.elements.panel = panel;
    }

    /**
     * 渲染时间选择器
     */
    render() {
        this.renderPanel();
    }

    /**
     * 渲染选择器面板
     */
    renderPanel() {
        const { panel } = this.elements;

        // 清空面板内容
        panel.innerHTML = '';

        // 创建步骤导航
        const stepNavigation = document.createElement('div');
        stepNavigation.className = 'step-navigation';

        // 日期步骤按钮
        const dateStepButton = document.createElement('button');
        dateStepButton.className = `step-button ${this.state.currentStep === 'date' ? 'active' : ''}`;
        dateStepButton.textContent = '选择日期';
        dateStepButton.addEventListener('click', () => this.switchStep('date'));

        // 时间步骤按钮
        const timeStepButton = document.createElement('button');
        timeStepButton.className = `step-button ${this.state.currentStep === 'time' ? 'active' : ''}`;
        timeStepButton.textContent = '选择时间';
        timeStepButton.addEventListener('click', () => {
            // 只有在已选择日期的情况下才能切换到时间选择
            if (this.state.selectedDate) {
                this.switchStep('time');
            }
        });

        // 添加步骤按钮到导航
        stepNavigation.appendChild(dateStepButton);
        stepNavigation.appendChild(timeStepButton);

        // 添加导航到面板
        panel.appendChild(stepNavigation);

        // 创建日期选择区域
        const dateSelection = document.createElement('div');
        dateSelection.className = `step-content date-selection ${this.state.currentStep === 'date' ? 'active' : ''}`;

        // 创建日期选择器标题
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-selection-header';

        // 当前月份和年份显示
        const monthYear = document.createElement('div');
        monthYear.className = 'month-year';
        monthYear.textContent = `${this.config.monthNames[this.state.currentMonth.getMonth()]} ${this.state.currentMonth.getFullYear()}`;

        // 上一月和下一月按钮
        const navButtons = document.createElement('div');
        navButtons.className = 'nav-buttons';

        const prevButton = document.createElement('button');
        prevButton.className = 'nav-button prev-month';
        prevButton.innerHTML = '&lt;';
        prevButton.addEventListener('click', () => this.prevMonth());

        const nextButton = document.createElement('button');
        nextButton.className = 'nav-button next-month';
        nextButton.innerHTML = '&gt;';
        nextButton.addEventListener('click', () => this.nextMonth());

        navButtons.appendChild(prevButton);
        navButtons.appendChild(nextButton);

        dateHeader.appendChild(monthYear);
        dateHeader.appendChild(navButtons);

        // 创建日历表格
        const calendarTable = document.createElement('table');
        calendarTable.className = 'calendar-table';

        // 创建表头
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        for (let i = 0; i < 7; i++) {
            const th = document.createElement('th');
            th.textContent = this.config.dayNames[i];
            headerRow.appendChild(th);
        }

        thead.appendChild(headerRow);
        calendarTable.appendChild(thead);

        // 创建表格主体
        const tbody = document.createElement('tbody');

        // 获取当前月份的第一天
        const firstDay = new Date(this.state.currentMonth.getFullYear(), this.state.currentMonth.getMonth(), 1);
        // 获取当前月份的最后一天
        const lastDay = new Date(this.state.currentMonth.getFullYear(), this.state.currentMonth.getMonth() + 1, 0);

        // 计算日历表格的起始日期和结束日期
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - startDate.getDay());

        const endDate = new Date(lastDay);
        if (endDate.getDay() < 6) {
            endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
        }

        // 当前日期
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 最小和最大日期
        const minDate = new Date(this.config.minDate);
        minDate.setHours(0, 0, 0, 0);

        const maxDate = new Date(this.config.maxDate);
        maxDate.setHours(0, 0, 0, 0);

        // 生成日历表格
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const row = document.createElement('tr');

            for (let i = 0; i < 7; i++) {
                const cell = document.createElement('td');
                const dayElement = document.createElement('div');
                dayElement.className = 'calendar-day';
                dayElement.textContent = currentDate.getDate();

                // 检查是否是当前月份
                const isCurrentMonth = currentDate.getMonth() === this.state.currentMonth.getMonth();

                // 检查是否是今天
                const isToday = currentDate.getTime() === today.getTime();

                // 检查是否在可选范围内
                const isInRange = currentDate >= minDate && currentDate <= maxDate;

                // 检查是否是已选择的日期
                let isSelected = false;
                if (this.state.selectedDate) {
                    const selectedDate = new Date(this.state.selectedDate);
                    selectedDate.setHours(0, 0, 0, 0);
                    isSelected = currentDate.getTime() === selectedDate.getTime();
                }

                // 设置样式
                if (!isCurrentMonth || !isInRange) {
                    dayElement.classList.add('disabled');
                } else {
                    if (isToday) {
                        dayElement.classList.add('today');
                    }

                    if (isSelected) {
                        dayElement.classList.add('selected');
                    }

                    // 添加点击事件
                    dayElement.addEventListener('click', () => {
                        if (isInRange && isCurrentMonth) {
                            this.selectDate(new Date(currentDate));
                        }
                    });
                }

                cell.appendChild(dayElement);
                row.appendChild(cell);

                // 移动到下一天
                currentDate.setDate(currentDate.getDate() + 1);
            }

            tbody.appendChild(row);
        }

        calendarTable.appendChild(tbody);

        // 将日历添加到日期选择区域
        dateSelection.appendChild(dateHeader);
        dateSelection.appendChild(calendarTable);

        // 创建时间选择区域
        const timeSelection = document.createElement('div');
        timeSelection.className = `step-content time-selection ${this.state.currentStep === 'time' ? 'active' : ''}`;

        // 创建时间选择器标题
        const timeHeader = document.createElement('div');
        timeHeader.className = 'time-selection-header';
        timeHeader.textContent = '请选择时间';

        // 创建时间选择网格
        const timeSlots = document.createElement('div');
        timeSlots.className = 'time-slots';

        // 添加时间选项
        this.config.timeSlots.forEach(time => {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot';
            timeSlot.textContent = time;

            // 检查时间是否可选
            let isDisabled = false;

            // 如果选择的是今天，则只能选择当前时间之后的时间段
            if (this.state.selectedDate && this.isSameDay(this.state.selectedDate, new Date())) {
                const [hours, minutes] = time.split(':').map(Number);
                const selectedTime = new Date();
                selectedTime.setHours(hours, minutes, 0, 0);

                isDisabled = selectedTime < new Date();
            }

            // 设置样式
            if (isDisabled) {
                timeSlot.classList.add('disabled');
            } else {
                // 检查是否是已选择的时间
                if (this.state.selectedTime === time) {
                    timeSlot.classList.add('selected');
                }

                // 添加点击事件
                timeSlot.addEventListener('click', () => {
                    if (!isDisabled) {
                        this.selectTime(time);
                    }
                });
            }

            timeSlots.appendChild(timeSlot);
        });

        timeSelection.appendChild(timeHeader);
        timeSelection.appendChild(timeSlots);

        // 创建底部按钮区域
        const footer = document.createElement('div');
        footer.className = 'time-picker-footer';

        // 返回按钮（在时间选择步骤显示）
        const backButton = document.createElement('button');
        backButton.className = `time-picker-button back-button ${this.state.currentStep === 'time' ? 'active' : ''}`;
        backButton.textContent = '返回';
        backButton.addEventListener('click', () => this.switchStep('date'));

        // 取消按钮
        const cancelButton = document.createElement('button');
        cancelButton.className = 'time-picker-button cancel-button';
        cancelButton.textContent = '取消';
        cancelButton.addEventListener('click', () => this.cancel());

        // 下一步/确认按钮
        let actionButton;
        if (this.state.currentStep === 'date') {
            // 在日期步骤显示"下一步"按钮
            actionButton = document.createElement('button');
            actionButton.className = 'time-picker-button next-button';
            actionButton.textContent = '下一步';
            actionButton.disabled = !this.state.selectedDate;
            actionButton.addEventListener('click', () => {
                if (this.state.selectedDate) {
                    this.switchStep('time');
                } else {
                    alert('请先选择日期');
                }
            });
        } else {
            // 在时间步骤显示"确认"按钮
            actionButton = document.createElement('button');
            actionButton.className = 'time-picker-button confirm-button';
            actionButton.textContent = '确认';
            actionButton.disabled = !this.state.selectedTime;
            actionButton.addEventListener('click', () => this.confirm());
        }

        footer.appendChild(backButton);

        // 将按钮添加到footer
        if (this.state.currentStep === 'date') {
            footer.appendChild(cancelButton);
            footer.appendChild(actionButton);
        } else {
            footer.appendChild(cancelButton);
            footer.appendChild(actionButton);
        }

        // 添加所有元素到面板
        panel.appendChild(dateSelection);
        panel.appendChild(timeSelection);
        panel.appendChild(footer);
    }

    /**
     * 切换步骤
     * @param {string} step - 目标步骤
     */
    switchStep(step) {
        if (step === 'time' && !this.state.selectedDate) {
            alert('请先选择日期');
            return;
        }

        this.state.currentStep = step;
        this.renderPanel();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 点击输入框时显示面板
        this.elements.customInput.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            this.toggle();
        });

        // 阻止点击面板内部元素时的冒泡，防止触发document的点击事件
        this.elements.panel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 移除点击外部自动关闭的行为
        // 只有在用户明确点击取消或确认按钮时才会关闭面板
    }

    /**
     * 切换面板显示状态
     */
    toggle() {
        if (this.state.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * 打开面板
     */
    open() {
        if (!this.state.isOpen) {
            this.state.isOpen = true;
            this.elements.panel.classList.add('active');

            // 如果有选中的日期，更新当前月份
            if (this.state.selectedDate) {
                this.state.currentMonth = new Date(this.state.selectedDate);
            }

            // 重新渲染面板
            this.renderPanel();
        }
    }

    /**
     * 关闭面板
     */
    close() {
        if (this.state.isOpen) {
            this.state.isOpen = false;
            this.elements.panel.classList.remove('active');

            // 关闭时重置为日期选择步骤
            this.state.currentStep = 'date';
        }
    }

    /**
     * 选择日期
     * @param {Date} date - 选择的日期
     */
    selectDate(date) {
        this.state.selectedDate = date;
        // 选择日期后立即切换到时间选择步骤
        this.state.currentStep = 'time';
        this.renderPanel();
    }

    /**
     * 选择时间
     * @param {string} time - 选择的时间
     */
    selectTime(time) {
        this.state.selectedTime = time;
        this.renderPanel();
    }

    /**
     * 切换到上一个月
     */
    prevMonth() {
        this.state.currentMonth.setMonth(this.state.currentMonth.getMonth() - 1);
        this.renderPanel();
    }

    /**
     * 切换到下一个月
     */
    nextMonth() {
        this.state.currentMonth.setMonth(this.state.currentMonth.getMonth() + 1);
        this.renderPanel();
    }

    /**
     * 确认选择
     */
    confirm() {
        if (this.state.selectedDate && this.state.selectedTime) {
            // 格式化日期和时间
            const year = this.state.selectedDate.getFullYear();
            const month = String(this.state.selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(this.state.selectedDate.getDate()).padStart(2, '0');

            // 构建日期时间字符串
            const dateTimeStr = `${year}-${month}-${day} ${this.state.selectedTime}`;

            // 更新输入框显示
            this.elements.customInput.value = dateTimeStr;

            // 更新原始输入框的值
            this.elements.input.value = dateTimeStr;
            this.elements.input.dataset.submitValue = dateTimeStr;

            // 触发变更事件
            const event = new Event('change', { bubbles: true });
            this.elements.input.dispatchEvent(event);

            // 检查时间是否合法
            this.checkTimeValidity(this.state.selectedTime);

            // 关闭面板
            this.close();
        } else {
            if (!this.state.selectedDate) {
                alert('请选择日期');
                this.switchStep('date');
            } else if (!this.state.selectedTime) {
                alert('请选择时间');
            }
        }
    }

    /**
     * 检查选择时间是否在有效范围内
     * @param {string} timeStr - 时间字符串 (HH:MM)
     */
    checkTimeValidity(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const timeWarning = document.getElementById('timeWarning');

        // 检查时间是否在18:00-21:00之间
        if ((hours >= 18 && hours < 21) || (hours === 21 && minutes === 0)) {
            if (timeWarning) {
                timeWarning.style.display = 'none';
            }
        } else {
            if (timeWarning) {
                timeWarning.style.display = 'block';
            }
        }
    }

    /**
     * 取消选择
     */
    cancel() {
        // 关闭面板
        this.close();
    }

    /**
     * 检查两个日期是否是同一天
     * @param {Date} date1 - 第一个日期
     * @param {Date} date2 - 第二个日期
     * @returns {boolean} - 是否是同一天
     */
    isSameDay(date1, date2) {
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    }

    /**
     * 格式化日期
     * @param {Date} date - 要格式化的日期
     * @param {string} format - 格式化模板
     * @returns {string} - 格式化后的日期字符串
     */
    formatDate(date, format) {
        if (!date) return '';

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        return format
            .replace('YYYY', year)
            .replace('MM', String(month).padStart(2, '0'))
            .replace('DD', String(day).padStart(2, '0'));
    }
}

/**
 * 初始化时间选择器
 */
function initTimePicker() {
    // 检查是否在报单页面
    const reportOrderForm = document.getElementById('reportOrderForm');
    if (reportOrderForm) {
        // 初始化时间选择器
        const timePicker = new TimePicker({
            inputSelector: '#preferredTime',
            // 可配置的时间段，限定在18:00-21:00之间
            timeSlots: ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30'],
            // 设置最小日期为今天，最大日期为3个月后
            minDate: new Date(),
            maxDate: new Date(new Date().setMonth(new Date().getMonth() + 3))
        });

        // 监听输入变化，检查时间有效性
        const preferredTimeInput = document.getElementById('preferredTime');
        if (preferredTimeInput) {
            preferredTimeInput.addEventListener('change', (e) => {
                const timeValue = e.target.value;
                // 提取时间部分
                const timePart = timeValue.split(' ')[1];
                if (timePart) {
                    // 检查时间是否在18:00-21:00之间
                    const [hours, minutes] = timePart.split(':').map(Number);
                    const timeWarning = document.getElementById('timeWarning');

                    if (timeWarning) {
                        if ((hours >= 18 && hours < 21) || (hours === 21 && minutes === 0)) {
                            timeWarning.style.display = 'none';
                        } else {
                            timeWarning.style.display = 'block';
                        }
                    }
                }
            });
        }
    }
}

// 在DOM加载完成后自动初始化时间选择器
document.addEventListener('DOMContentLoaded', initTimePicker);

// 导出时间选择器类和初始化函数
export { TimePicker, initTimePicker };
export default TimePicker;