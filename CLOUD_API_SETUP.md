# 云 API 配置指南

本项目需要以下云服务 API 才能完整运行（OCR 识别和中文释义生成）。

## 方案一：国内推荐（腾讯云 + 阿里云）

### 1. 腾讯云 OCR（文档/图片识别）

**注册地址**：https://cloud.tencent.com/

**步骤**：
1. 注册/登录腾讯云账号
2. 实名认证（必须）
3. 进入控制台 → 搜索"OCR" → 选择"通用文字识别"
4. 开通服务（有免费额度）
5. 进入 API 密钥管理：https://console.cloud.tencent.com/cam/capi
6. 创建密钥，记录：
   - `SecretId`
   - `SecretKey`
7. 记录地域（Region），推荐：`ap-guangzhou`（广州）

**免费额度**：
- 每月 1000 次免费调用
- 超出后约 0.007 元/次

### 2. 阿里云 DashScope（通义千问 - 中文释义生成）

**注册地址**：https://dashscope.console.aliyun.com/

**步骤**：
1. 注册/登录阿里云账号
2. 实名认证（必须）
3. 开通 DashScope 服务
4. 进入 API-KEY 管理：https://dashscope.console.aliyun.com/apiKey
5. 创建 API-KEY，记录：
   - `API Key`（如：`sk-xxxxxxxx`）
6. 选择模型，推荐：`qwen-plus` 或 `qwen-turbo`

**免费额度**：
- 新用户赠送额度
- `qwen-turbo` 约 0.002 元/千 token
- `qwen-plus` 约 0.004 元/千 token

### 3. 配置到项目

在 `C:\Users\a'a'a\Desktop\Code\word` 目录下创建 `.env.local` 文件：

```env
# 会话管理
SESSION_SECRET=your-random-secret-string-here

# 管理员账号（单用户）
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD_HASH=your-bcrypt-hash-here

# Mock 模式（开发时设为 1，生产时设为 0）
MOCK_OCR=0
MOCK_LLM=0

# 腾讯云 OCR
TENCENT_SECRET_ID=你的腾讯云 SecretId
TENCENT_SECRET_KEY=你的腾讯云 SecretKey
TENCENT_REGION=ap-guangzhou

# 阿里云 DashScope
DASHSCOPE_API_KEY=你的阿里云 API Key
DASHSCOPE_MODEL=qwen-plus

# Worker 密钥
WORKER_SECRET=your-worker-secret-here

# 限制配置
MAX_FILE_MB=50
MAX_PDF_PAGES=100
MAX_WORDS_PER_DOC=1000
DAILY_OCR_PAGES=100
DAILY_LLM_TOKENS=100000
```

---

## 方案二：先用 Mock 模式测试

如果暂时没有云账号，可以先用 Mock 模式测试完整流程：

在 `.env.local` 中设置：

```env
MOCK_OCR=1
MOCK_LLM=1
```

这样系统会使用模拟的 OCR 和 LLM 输出，不会产生任何费用。

---

## 方案三：使用其他云服务商

### 百度智能云 OCR
- 官网：https://cloud.baidu.com/
- 产品：文字识别 OCR
- 免费额度：每月 500 次

### 华为云 OCR
- 官网：https://www.huaweicloud.com/
- 产品：文字识别
- 免费额度：每月 1000 次

### 其他 LLM 提供商
- **DeepSeek**：https://platform.deepseek.com/（便宜，约 0.001 元/千 token）
- **智谱 AI**：https://open.bigmodel.cn/（有免费额度）
- **OpenAI**：需要海外账号和支付方式

---

## 验证配置

配置完成后，运行以下命令验证：

```bash
cd "C:\Users\a'a'a\Desktop\Code\word"

# 开发模式运行
pnpm dev

# 打开浏览器访问 http://localhost:3000
# 登录账号：admin@example.com
# 密码：admin123（在 .env.local 中配置的）
```

上传一个测试文档（PDF/Word/Excel/图片），观察处理流程：
1. 上传 → 2. 提取文本 → 3. 生成词表 → 4. 生成释义 → 5. 完成

---

## 费用控制建议

1. **设置配额限制**：在 `.env.local` 中调整 `DAILY_OCR_PAGES` 和 `DAILY_LLM_TOKENS`
2. **使用 Mock 模式开发**：开发时 `MOCK_OCR=1` 和 `MOCK_LLM=1`
3. **监控用量**：定期查看云控制台的用量统计
4. **选择便宜模型**：使用 `qwen-turbo` 代替 `qwen-plus` 可节省 50% 费用

---

## 常见问题

**Q: 实名认证需要多久？**
A: 腾讯云和阿里云通常 1-2 小时完成审核。

**Q: 免费额度用完怎么办？**
A: 账户充值后自动按量计费，费用很低（处理 100 个单词约 0.1 元）。

**Q: 可以在本地运行不用云吗？**
A: 可以，使用 `MOCK_OCR=1` 和 `MOCK_LLM=1` 即可，但输出是模拟数据。

**Q: 如何生成密码哈希？**
A: 运行以下 Node.js 命令：
```bash
node -e "console.log(require('bcryptjs').hashSync('你的密码', 10))"
```
