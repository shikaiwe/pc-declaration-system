# PC志愿者服务队管理系统

![Version](https://img.shields.io/badge/版本-1.0.0-blue)
![Status](https://img.shields.io/badge/状态-开发中-green)
![License](https://img.shields.io/badge/许可证-Apache%202.0-yellow)

## 简介
这是一个专门为PC志愿者服务队开发的管理系统，包含用户登录、注册、找回密码、控制面板和移动端适配等功能。系统使用HTML、CSS和JavaScript进行前端开发，并使用CryptoJS库进行数据加密。系统支持PC端和移动端自适应界面，提供完整的用户认证、订单管理、日程管理和天气信息展示功能。

## 项目结构
```
pc-declaration-system/
├── src/                    # 源代码目录
│   ├── dashboard.html      # PC端控制面板页面
│   ├── mobile_dashboard.html # 移动端控制面板页面
│   ├── login.html         # 用户登录页面
│   ├── register.html      # 用户注册页面
│   ├── worker_register.html # 志愿者注册页面
│   └── forgot-password.html # 密码找回页面
├── js/                     # JavaScript文件目录
│   ├── assign_order.js    # 订单分配功能实现
│   ├── message_board.js   # 消息板功能实现
│   └── jquery.js          # jQuery库文件（本地备份）
├── .gitignore             # Git忽略规则配置
├── README.md              # 项目说明文档
└── LICENSE                # Apache 2.0 许可证
```

### 目录说明
| 目录/文件 | 描述 |
|----------|------|
| `src/` | 存放所有HTML源文件的主目录 |
| `js/` | JavaScript文件目录，包含功能实现和库文件 |
| `README.md` | 项目文档，包含功能说明和使用指南 |
| `LICENSE` | 开源许可证文件 |
| `.gitignore` | Git版本控制忽略规则配置 |

## 功能概述

### 🔐 登录系统
- 用户名和密码登录
- 记住密码功能（本地存储）
- 自动登录支持
- 登录失败锁定机制（5次失败后锁定15分钟）
- 会话状态管理和自动续期
- 设备类型检测，自动跳转对应界面
- 安全的密码加密存储

### 📝 注册系统
- 用户名和密码注册
- 邮箱验证码验证
- 密码强度验证（至少8位，包含字母和数字）
- 防重复注册检测
- 实时密码一致性验证
- 注册成功自动跳转

### 🔄 找回密码
- 邮箱验证码验证
- 新密码设置
- 密码强度检查
- 安全的密码重置流程

### 💻 PC端控制面板
- 用户信息显示和管理
- 天气信息实时展示
  - 实时天气数据更新
  - 风向风力显示
  - 上次登录天气记录
- 智能问候语（根据时间段显示）
- 订单管理功能
  - 提交新订单
  - 查看历史订单
  - 订单状态追踪
- 日程管理功能
  - 日历视图
  - 事件添加和管理
- 账户管理
  - 修改个人信息
  - 修改密码
  - 手机号码绑定

### 📱 移动端控制面板
- 移动端优化界面
- 手势操作支持
- 自适应布局
- 功能同PC端，包括：
  - 天气信息展示
  - 订单管理
  - 日程管理
  - 账户设置
- 优化的触摸操作体验
- 滑动手势支持

### 订单分配系统
- 管理员订单分配功能
- 志愿者列表管理
- 订单状态管理
- 实时分配状态更新

## 用户角色
系统支持三种用户角色：

| 角色 | 权限 |
|------|------|
| 普通用户（customer） | • 提交维修订单<br>• 查看订单历史<br>• 管理个人信息 |
| 志愿者（worker） | • 查看被分配的订单<br>• 处理订单（完成/取消）<br>• 管理个人日程 |
| 管理员（admin） | • 所有普通用户功能<br>• 订单分配权限<br>• 系统管理权限 |

## 技术特性
- 响应式设计，支持各种设备
- 安全的数据传输和存储
- 实时天气信息集成
- 高效的日程管理系统
- 完整的订单生命周期管理
- 用户友好的界面设计
- 优化的移动端体验
- jQuery CDN加载（备用本地文件）
- Git版本控制

## 依赖项
| 依赖 | 用途 | 加载方式 |
|------|------|----------|
| ![jQuery](https://img.shields.io/badge/jQuery-v3.6.0-blue) | DOM操作和AJAX请求 | CDN，本地备份 |
| ![CryptoJS](https://img.shields.io/badge/CryptoJS-v4.1.1-green) | 数据加密 | CDN |
| ![FullCalendar](https://img.shields.io/badge/FullCalendar-v5.10.1-orange) | 日程管理 | CDN |
| ![Bootstrap](https://img.shields.io/badge/Bootstrap-v5.1.3-purple) | UI组件和样式 | CDN |
| ![Swiper](https://img.shields.io/badge/Swiper-latest-red) | 移动端滑动交互 | CDN |
| ![Flatpickr](https://img.shields.io/badge/Flatpickr-latest-yellow) | 日期时间选择器 | CDN |

## 安全特性
- AES加密保护敏感数据
- 登录失败保护机制
- 会话状态验证
- 安全的密码存储
- 邮箱验证码验证
- XSS防护
- CSRF防护

## 使用说明
1. 新用户通过 `register.html` 注册账号
2. 使用注册的账号在 `login.html` 登录
3. 系统自动判断设备类型：
   - PC端跳转到 `dashboard.html`
   - 移动端跳转到 `mobile_dashboard.html`
4. 根据用户角色显示对应功能：
   - 普通用户可提交订单和查看历史
   - 志愿者可查看和处理被分配的订单
   - 管理员可分配订单和管理系统

## ⚠️ 注意事项
- 建议使用现代浏览器访问系统
- 确保启用JavaScript和Cookie
- 注意保护个人账号安全
- 定期更新密码
- 使用安全的网络环境
- 及时保存重要信息
- 遵守服务队的相关规定

## 系统要求
- 支持HTML5的现代浏览器
- 稳定的网络连接
- 启用JavaScript
- 启用Cookie
- 建议分辨率不低于320px（移动端）
- Git版本控制系统（用于开发）

## 开发说明
### 版本控制
- 项目使用Git进行版本控制
- 已配置.gitignore忽略以下内容：
  - IDE和编辑器配置文件
  - 操作系统临时文件
  - Node.js相关文件
  - 日志和临时文件
  - 编译输出目录
  - 环境配置文件
  - 依赖包备份文件

### CDN使用说明
- 项目默认使用CDN加载第三方库
- jQuery提供本地备份，位于js/jquery.js
- 如需切换至本地jQuery，将HTML文件中的CDN引用改为：
  ```html
  <script src="js/jquery.js"></script>
  ```

---
© 2024 广州南方学院PC志愿者服务队管理系统. Licensed under the Apache License, Version 2.0.

