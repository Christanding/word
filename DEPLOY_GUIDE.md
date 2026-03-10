# 腾讯云 CloudBase 部署指南

## 📋 前提条件

- ✅ 已注册腾讯云账号
- ✅ 已实名认证（必须）
- ✅ Node.js 16+ 已安装

---

## 🚀 快速部署（3 步完成）

### 第一步：开通 CloudBase（5 分钟）

1. 访问：https://console.cloud.tencent.com/tcb
2. 点击"开通云开发"
3. 选择"免费版"
4. 环境名称：`vocab-app`
5. 区域：选择"广州"或"上海"
6. 点击"开通"
7. **记录环境 ID**（类似：`vocab-app-xxx`）

---

### 第二步：配置密钥（2 分钟）

在项目中创建 `.env.cloudbase` 文件：

```env
# CloudBase 环境 ID
CLOUDBASE_ENV=你的环境 ID

# 腾讯云 OCR
TENCENT_SECRET_ID=你的 SecretId
TENCENT_SECRET_KEY=你的 SecretKey
TENCENT_REGION=ap-guangzhou

# 阿里云 DashScope
DASHSCOPE_API_KEY=你的 API Key
DASHSCOPE_MODEL=qwen3.5-plus

# 其他配置
SESSION_SECRET=your-session-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=your-bcrypt-password-hash
MOCK_OCR=0
MOCK_LLM=0
WORKER_SECRET=your-worker-secret
```

---

### 第三步：一键部署（5 分钟）

**Windows 用户**：
```bash
cd "C:\Users\a'a'a\Desktop\Code\word"
deploy.bat
```

**手动部署**：
```bash
# 1. 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 2. 登录腾讯云
cloudbase login

# 3. 构建项目
pnpm build

# 4. 部署
cloudbase deploy --force
```

---

## 🌐 访问应用

部署成功后，获得访问地址：

```
https://<你的环境 ID>.service.tcloudbase.com
```

例如：`https://vocab-app-123.service.tcloudbase.com`

---

## 🔧 配置自定义域名（可选）

1. 访问 CloudBase 控制台
2. 进入"云托管" → "域名管理"
3. 添加自定义域名
4. 按指引配置 DNS
5. 自动签发 HTTPS 证书

---

## 💰 费用说明

**免费版额度**：
- 云函数：每月 500 万 GB-秒
- 数据库：2GB 存储
- 存储：5GB 存储
- CDN：5GB 流量

**个人使用基本免费**，重度使用约 10-50 元/月

---

## 📊 监控和管理

访问 CloudBase 控制台查看：
- 访问统计
- 函数执行日志
- 数据库内容
- 存储文件

---

## ❓ 常见问题

**Q: 部署失败怎么办？**
A: 检查：
1. Node.js 版本是否 16+
2. 是否已开通 CloudBase
3. 环境 ID 是否正确
4. API 密钥是否有效

**Q: 访问速度慢？**
A: 确保选择离用户近的区域（广州/上海）

**Q: 需要备案吗？**
A: CloudBase 托管不需要备案

**Q: 直接用 HTTP 的服务器 IP 访问，登录/注册能正常工作吗？**
A: 可以。当前认证 cookie 会根据真实请求协议自动设置：HTTP 访问不会强制加 `Secure`，HTTPS 访问会自动启用 `Secure`。不过正式对外仍建议尽快配置域名和 HTTPS。

**Q: 如何更新代码？**
A: 重新运行 `deploy.bat` 即可

---

## 📞 技术支持

- CloudBase 文档：https://docs.cloudbase.net/
- 腾讯云工单：https://console.cloud.tencent.com/workorder
