# PC志愿者服务队管理系统

![License](https://img.shields.io/badge/许可证-Apache%202.0-yellow)

## 项目简介
基于Web的综合性管理平台，专为PC志愿者服务队设计开发。实现用户认证、订单管理、日程规划等核心功能。支持PC端和移动端自适应。

> 后端服务仓库地址：[NanFangCollegePC](https://github.com/luogangsama/NanFangCollegePC)

## 系统架构
```
pc-declaration-system/
├── src/                    # 源代码
│   ├── html/               # 页面模板
│   │   ├── dashboard.html       # 管理控制台
│   │   ├── mobile_dashboard.html # 移动端控制台
│   │   ├── login.html           # 登录页面
│   │   ├── register.html        # 用户注册
│   │   ├── worker_register.html # 志愿者注册
│   │   └── forgot-password.html # 密码找回
│   ├── js/                 # 业务逻辑
│   │   ├── assign_order.js      # 订单分配
│   │   ├── crypto-js.min.js     # 加密库
│   │   ├── jquery.js            # jQuery库
│   │   ├── message_board.js     # 留言板功能
│   │   ├── order_rating.js      # 订单评价功能
│   │   ├── time-picker.js       # 时间选择器
│   │   └── weather_manager.js   # 天气管理模块
│   ├── css/                # 样式资源
│   │   ├── forgot-password.css  # 找回密码样式
│   │   ├── login.css            # 登录样式
│   │   ├── message_board.css    # 留言板样式
│   │   ├── order_rating.css     # 订单评价样式
│   │   ├── register.css         # 注册样式 
│   │   └── time-picker.css      # 时间选择器样式
│   ├── images/             # 图像资源
│   └── vendor/             # 第三方库
│       ├── bootstrap/           # UI框架
│       ├── fullcalendar/        # 日程管理组件
│       └── swiper/              # 移动端滑动组件
├── .gitignore              # 版本控制
├── README.md               # 项目文档
└── LICENSE                 # 开源协议
```

## 核心功能

| 模块 | 功能描述 |
|------|----------|
| 🔐 用户认证 | 多因素身份认证、会话管理、密码安全、设备识别 |
| 📝 用户管理 | 邮箱验证、密码校验、防重复注册、表单验证 |
| 💻 管理控制台 | 用户管理、天气集成、订单管理、日程管理、安全中心 |
| 📱 移动端适配 | 响应式布局、触控优化、性能优化、交互优化 |
| 📦 订单系统 | 权限控制、志愿者管理、状态管理、实时同步、留言板、订单评价 |
| 🌤️ 天气集成 | 实时天气信息获取与展示、位置信息识别、自动更新 |

## 用户权限
| 角色 | 权限范围 |
|------|----------|
| 普通用户 | 订单提交、历史查询、个人信息管理、订单评价 |
| 志愿者 | 订单处理、状态更新、日程管理 |
| 管理员 | 系统管理、订单分配、用户管理 |

## 技术依赖
| 依赖 | 用途 |
|------|------|
| ![jQuery](https://img.shields.io/badge/jQuery-v3.6.0-blue) | DOM操作和AJAX |
| ![CryptoJS](https://img.shields.io/badge/CryptoJS-v4.1.1-green) | 数据加密 |
| ![FullCalendar](https://img.shields.io/badge/FullCalendar-v5.10.1-orange) | 日程管理 |
| ![Bootstrap](https://img.shields.io/badge/Bootstrap-v5.1.3-purple) | UI框架 |
| ![Swiper](https://img.shields.io/badge/Swiper-latest-red) | 移动端交互 |

## 安全机制
- AES加密
- 登录保护
- 会话验证
- 密码安全
- XSS/CSRF防护

## 贡献与反馈
- 前端问题反馈：[Issues](https://github.com/shikaiwe/pc-declaration-system/issues)
- 后端问题反馈：[Issues](https://github.com/luogangsama/NanFangCollegePC/issues)
- 请尽可能地在Issues中详细描述问题，包括复现步骤、环境信息、错误日志等。
- 我们非常欢迎任何形式的反馈和建议，无论是功能建议、性能问题还是代码问题。

## 想说的话

从刚入学到如今即将毕业，广州南方学院PC志愿者服务队完整地陪伴我走过了这四年，在这里我遇到了很多很好的人，感受到了非常非常多的温暖和爱，让我没有遗憾地度过了这段在彻底成长为大人之前，这段漫长而孤寂的时期。

时代在不断改变，新旧之间的交替不断上演，我始终怀抱着一个信念：***想要珍视的东西，即使形态改变了，也会一直传承，一直存在。*** 所以我希望在这最后的时间里，能够把这一部分以我的方式传承下去。

该项目本身源于一时的兴起，因为很多客观因素和自身能力的局限，该项目花费了我们非常多的时间和精力才得以实现。虽然还有非常多的问题，但我相信，只要这份信念依然存在，在所有人的共同努力下，总有一天它会变成让所有人都满意的样子。

<u>***我最后的敬礼要献给那些知道它不完美却依然爱它的人。***</u>

---
© 2025 广州南方学院PC志愿者服务队管理系统. Licensed under the Apache License, Version 2.0.

Made with ❤️ by **QiannanYou** and **luogangsama**