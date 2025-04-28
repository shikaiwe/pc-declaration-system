# PC志愿者服务队管理系统

![Status](https://img.shields.io/badge/状态-开发中-green)
![License](https://img.shields.io/badge/许可证-Apache%202.0-yellow)

## 项目简介
基于Web的综合性管理平台，专为PC志愿者服务队设计开发。实现用户认证、订单管理、日程规划等核心功能。支持PC端和移动端自适应。

> 后端服务仓库地址：[NanFangCollegePC](https://github.com/luogangsama/NanFangCollegePC)

## 系统架构
```
pc-declaration-system/
├── src/                    # 源代码
│   ├── html/              # 页面模板
│   ├── js/                # 业务逻辑
│   └── css/               # 样式资源
├── .gitignore             # 版本控制
├── README.md              # 项目文档
└── LICENSE                # 开源协议
```

## 核心功能

| 模块 | 功能描述 |
|------|----------|
| 🔐 用户认证 | 多因素身份认证、会话管理、密码安全、设备识别 |
| 📝 用户管理 | 邮箱验证、密码校验、防重复注册、表单验证 |
| 💻 管理控制台 | 用户管理、天气集成、订单管理、日程管理、安全中心 |
| 📱 移动端适配 | 响应式布局、触控优化、性能优化、交互优化 |
| 📦 订单系统 | 权限控制、志愿者管理、状态管理、实时同步、留言板 |

## 用户权限
| 角色 | 权限范围 |
|------|----------|
| 普通用户 | 订单提交、历史查询、个人信息管理 |
| 志愿者 | 订单处理、状态更新、日程管理 |
| 管理员 | 系统管理、订单分配、用户管理 |

## 技术依赖
| 依赖 | 用途 | 加载方式 |
|------|------|----------|
| ![jQuery](https://img.shields.io/badge/jQuery-v3.6.0-blue) | DOM操作和AJAX | 本地文件 |
| ![CryptoJS](https://img.shields.io/badge/CryptoJS-v4.1.1-green) | 数据加密 | CDN |
| ![FullCalendar](https://img.shields.io/badge/FullCalendar-v5.10.1-orange) | 日程管理 | CDN |
| ![Bootstrap](https://img.shields.io/badge/Bootstrap-v5.1.3-purple) | UI框架 | CDN |
| ![Swiper](https://img.shields.io/badge/Swiper-latest-red) | 移动端交互 | CDN |
| ![Flatpickr](https://img.shields.io/badge/Flatpickr-latest-yellow) | 日期选择 | CDN |

## 安全机制
- AES加密
- 登录保护
- 会话验证
- 密码安全
- XSS/CSRF防护

## 使用指南
1. 访问 `register.html` 完成注册
2. 通过 `login.html` 进行登录
3. 系统自动识别设备类型
4. 根据用户角色使用对应功能

---
© 2025 广州南方学院PC志愿者服务队管理系统. Licensed under the Apache License, Version 2.0.

Made with ❤️ by **QiannanYou** and **luogangsama**