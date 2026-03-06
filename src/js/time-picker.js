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
            timeSlots: ['18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45', '20:00', '20:15', '20:30', '20:45', '21:00'], // 时间段选项
            dateFormat: 'YYYY-MM-DD', // 日期格式
            timeFormat: 'HH:mm', // 时间格式
            monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
            dayNames: ['日', '一', '二', '三', '四', '五', '六'],
            cutoffHour: 10, // 默认截止时间点，超过这个时间默认选择第二天
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

        // 初始化状态，不设置默认选择的日期和时间
        this.state.selectedDate = null;
        this.state.selectedTime = null;
        this.state.currentMonth = new Date();

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
        originalInput.value = ''; // 确保原始输入框值为空

        // 创建自定义输入框
        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.className = 'time-picker-input';
        customInput.readOnly = true;
        customInput.placeholder = '请选择时间';
        customInput.value = ''; // 确保自定义输入框值为空

        // 创建时间图标
        const icon = document.createElement('span');
        icon.className = 'time-picker-icon';
        icon.innerHTML = '<span class="iconify" data-icon="mdi:clock-outline"></span>';

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

        // 创建日期选择区域
        const dateSelection = document.createElement('div');
        dateSelection.className = `step-content date-selection ${this.state.currentStep === 'date' ? 'active' : ''}`;

        // 创建日期选择器标题
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-selection-header';

        // 当前月份和年份显示
        const monthYear = document.createElement('div');
        monthYear.className = 'month-year';
        monthYear.textContent = '请选择日期';

        // 将标题添加到头部
        dateHeader.appendChild(monthYear);

        // 将日期选择添加到日期选择区域
        dateSelection.appendChild(dateHeader);

        // 创建日期选择网格（改用按钮形式）
        const dateSlots = document.createElement('div');
        dateSlots.className = 'date-slots';

        // 获取当前日期
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 计算下周五的日期
        const nextFriday = new Date(today);
        const dayOfWeek = today.getDay(); // 0=周日, 1=周一, ..., 6=周六

        // 计算到下周五的天数
        let daysToNextFriday;
        if (dayOfWeek <= 5) { // 今天是周日到周五
            daysToNextFriday = 5 - dayOfWeek + 7; // 到下周五的天数
        } else { // 今天是周六
            daysToNextFriday = 6; // 到下周五的天数
        }

        nextFriday.setDate(today.getDate() + daysToNextFriday);
        nextFriday.setHours(23, 59, 59, 999);

        // 最小和最大日期
        const minDate = new Date(today);
        minDate.setHours(0, 0, 0, 0);

        const maxDate = new Date(nextFriday);
        maxDate.setHours(23, 59, 59, 999);

        // 获取当前月份
        const currentMonth = this.state.currentMonth;
        const currentMonthYear = currentMonth.getFullYear();
        const currentMonthNum = currentMonth.getMonth();

        // 收集可显示的日期（当前月份中的可选工作日）
        const availableDates = [];
        let tempDate = new Date(currentMonthYear, currentMonthNum, 1);

        // 循环当前月份的每一天
        while (tempDate.getMonth() === currentMonthNum) {
            // 如果是工作日且在可选范围内
            if (tempDate.getDay() !== 0 && tempDate.getDay() !== 6 && // 不是周末
                tempDate >= minDate && tempDate <= maxDate) { // 在日期范围内
                availableDates.push(new Date(tempDate));
            }
            tempDate.setDate(tempDate.getDate() + 1);
        }

        // 如果没有可选日期，显示提示信息
        if (availableDates.length === 0) {
            const noDateMessage = document.createElement('div');
            noDateMessage.className = 'no-dates-message';
            noDateMessage.textContent = '当前月份没有可选日期';
            dateSlots.appendChild(noDateMessage);
        } else {
            // 按日期排序
            availableDates.sort((a, b) => a - b);

            // 创建日期按钮
            availableDates.forEach(date => {
                const dateSlot = document.createElement('div');
                dateSlot.className = 'date-slot';

                // 格式化为"年-月-日-星期"格式
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const weekDay = this.config.dayNames[date.getDay()];

                dateSlot.textContent = `${year}年${month}月${day}日 星期${weekDay}`;

                // 检查是否是今天
                const isToday = date.getTime() === today.getTime();

                // 检查是否是已选择的日期
                let isSelected = false;
                if (this.state.selectedDate) {
                    const selectedDate = new Date(this.state.selectedDate);
                    selectedDate.setHours(0, 0, 0, 0);
                    isSelected = date.getTime() === selectedDate.getTime();
                }

                // 设置样式
                // 修改：如果是今天且被选中，只添加selected类
                if (isSelected) {
                    dateSlot.classList.add('selected');
                }

                // 添加点击事件
                dateSlot.addEventListener('click', () => {
                    this.selectDate(new Date(date));
                });

                dateSlots.appendChild(dateSlot);
            });
        }

        // 将日期选择添加到日期选择区域
        dateSelection.appendChild(dateSlots);

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

            // 解析时间
            const [hours, minutes] = time.split(':').map(Number);

            // 如果选择的是今天，则只能选择当前时间之后的时间段
            if (this.state.selectedDate && this.isSameDay(this.state.selectedDate, new Date())) {
                const selectedTime = new Date();
                selectedTime.setHours(hours, minutes, 0, 0);

                isDisabled = selectedTime < new Date();
            }

            // 始终确保时间在18:00-21:00范围内
            if (!((hours >= 18 && hours < 21) || (hours === 21 && minutes === 0))) {
                isDisabled = true;
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
        backButton.type = 'button'; // 明确指定为button类型，防止被解释为submit
        backButton.addEventListener('click', () => this.switchStep('date'));

        // 取消按钮（只在日期选择步骤显示）
        const cancelButton = document.createElement('button');
        cancelButton.className = 'time-picker-button cancel-button';
        cancelButton.textContent = '取消';
        cancelButton.type = 'button'; // 明确指定为button类型，防止被解释为submit
        cancelButton.addEventListener('click', () => this.cancel());

        // 根据当前步骤添加不同的按钮
        if (this.state.currentStep === 'date') {
            // 日期步骤只显示取消按钮
            footer.appendChild(cancelButton);
        } else {
            // 时间步骤显示返回按钮
            footer.appendChild(backButton);
        }

        // 添加所有元素到面板
        panel.appendChild(dateSelection);
        panel.appendChild(timeSelection);
        panel.appendChild(footer);

        // 更新输入框显示当前选择
        this.updateInputDisplay();
    }

    /**
     * 更新输入框显示
     */
    updateInputDisplay() {
        if (this.state.selectedDate) {
            let displayText = '';

            // 格式化日期部分（使用中文格式：年月日 星期X）
            const year = this.state.selectedDate.getFullYear();
            const month = this.state.selectedDate.getMonth() + 1;
            const day = this.state.selectedDate.getDate();
            const weekDay = this.config.dayNames[this.state.selectedDate.getDay()];

            displayText = `${year}年${month}月${day}日 星期${weekDay}`;

            // 如果已选择时间，添加时间部分
            if (this.state.selectedTime) {
                displayText += ` ${this.state.selectedTime}`;
            }

            this.elements.customInput.value = displayText;
        } else {
            // 如果没有选择日期，则清空输入框
            this.elements.customInput.value = '';
            this.elements.input.value = '';
        }
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

        // 添加点击外部关闭面板的行为
        document.addEventListener('click', (e) => {
            if (this.state.isOpen && !this.elements.container.contains(e.target)) {
                this.close();
            }
        });
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
        // 更新输入框显示
        this.updateInputDisplay();
        // 选择日期后立即切换到时间选择步骤
        this.state.currentStep = 'time';
        this.renderPanel();
    }

    /**
     * 选择时间
     * @param {string} time - 选择的时间
     */
    selectTime(time) {
        // 检查时间是否在允许的范围内（18:00-21:00）
        const [hours, minutes] = time.split(':').map(Number);
        if ((hours >= 18 && hours < 21) || (hours === 21 && minutes === 0)) {
            this.state.selectedTime = time;
            // 更新输入框显示
            this.updateInputDisplay();
            // 检查时间有效性（用于显示警告信息）
            this.checkTimeValidity(time);
            // 选择时间后自动确认并关闭选择器
            this.confirm();
        } else {
            alert('请选择18:00-21:00之间的时间');
        }
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
            const weekDay = this.config.dayNames[this.state.selectedDate.getDay()];

            // 构建日期时间字符串（与显示格式保持一致，使用中文格式）
            const displayDateTimeStr = `${year}年${month}月${day}日 星期${weekDay} ${this.state.selectedTime}`;
            
            // 构建标准格式的日期时间字符串（用于提交）
            const submitDateTimeStr = `${year}-${month}-${day} ${this.state.selectedTime}`;

            // 更新自定义输入框的显示值
            this.elements.customInput.value = displayDateTimeStr;
            
            // 更新原始输入框的值（使用标准格式）
            this.elements.input.value = submitDateTimeStr;
            this.elements.input.dataset.submitValue = submitDateTimeStr;
            this.elements.input.dataset.displayValue = displayDateTimeStr;

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
        // 清空选择
        this.state.selectedDate = null;
        this.state.selectedTime = null;
        
        // 更新输入框显示
        this.updateInputDisplay();
        
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

    /**
     * 获取下一个工作日（跳过周末）
     * @param {Date} date - 起始日期
     * @returns {Date} - 下一个工作日
     */
    getNextWorkday(date) {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        // 如果是周末（0=周日，6=周六），继续寻找下一个工作日
        if (nextDay.getDay() === 0) { // 如果是周日
            nextDay.setDate(nextDay.getDate() + 1); // 跳到周一
        } else if (nextDay.getDay() === 6) { // 如果是周六
            nextDay.setDate(nextDay.getDate() + 2); // 跳到下周一
        }

        return nextDay;
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
            // 可配置的时间段，限定在18:00-21:00之间，间隔为15分钟
            // 这些时间限制适用于所有日期（无论是今天还是将来的日期）
            timeSlots: ['18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45', '20:00', '20:15', '20:30', '20:45', '21:00'],
            // 设置最小日期为今天，最大日期为3个月后
            minDate: new Date(),
            maxDate: new Date(new Date().setMonth(new Date().getMonth() + 3)),
            // 设置截止时间点为10点，超过这个时间会自动选择下一个工作日（跳过周末）
            cutoffHour: 10
        });

        // 监听输入变化，检查时间有效性
        const preferredTimeInput = document.getElementById('preferredTime');
        if (preferredTimeInput) {
            preferredTimeInput.addEventListener('change', (e) => {
                const timeValue = e.target.value;
                // 提取时间部分（格式为：YYYY年MM月DD日 星期X HH:MM）
                const timeParts = timeValue.split(' ');
                let timePart;
                
                // 检查格式并提取时间部分
                if (timeParts.length >= 3 && timeParts[2].includes(':')) {
                    // 格式：YYYY年MM月DD日 星期X HH:MM
                    timePart = timeParts[2];
                } else if (timeParts.length >= 2 && timeParts[1].includes(':')) {
                    // 旧格式：YYYY-MM-DD HH:MM
                    timePart = timeParts[1];
                }
                
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