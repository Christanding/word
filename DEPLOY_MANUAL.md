# 腾讯云 CloudBase 部署指南

## 你的环境信息
- **环境 ID**: chris-7-4gh5omxl96f5b617
- **控制台**: https://console.cloud.tencent.com/tcb

## 方案一：云托管部署（推荐，最简单）

### 1. 访问云托管
打开：https://console.cloud.tencent.com/tcb/env/index

### 2. 开通云托管
1. 选择环境 `chris-7-4gh5omxl96f5b617`
2. 左侧菜单 **"云托管"** → **"开通服务"**
3. 选择 **"Node.js 16"** 运行时
4. 内存：**512MB**

### 3. 上传代码
1. 点击 **"新建服务"**
2. 服务名称：`vocab-web`
3. 部署方式：**"源码部署"**
4. 上传目录：选择整个 `word` 文件夹
5. 启动命令：`pnpm start`
6. 安装命令：`pnpm install`

### 4. 配置环境变量
在云托管控制台添加以下环境变量：
```
SESSION_SECRET=your-session-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=your-bcrypt-password-hash
MOCK_OCR=0
MOCK_LLM=0
TENCENT_SECRET_ID=your-tencent-secret-id
TENCENT_SECRET_KEY=your-tencent-secret-key
TENCENT_REGION=ap-guangzhou
DASHSCOPE_API_KEY=your-dashscope-api-key
DASHSCOPE_MODEL=qwen3.5-plus
WORKER_SECRET=your-worker-secret
```

### 5. 获得公网域名
部署成功后，云托管会分配一个域名，格式类似：
```
https://vocab-web-xxx-7-4gh5omxl96f5b617-1234567890.gz.apigw.tencentcs.com
```

---

## 方案二：静态网站托管（仅前端）

### 1. 导出静态文件
```bash
pnpm build
# .next 目录即为构建产物
```

### 2. 上传到网站托管
1. 控制台 → **"网站托管"** → **"上传文件"**
2. 上传 `.next/static` 目录
3. 配置路由规则

---

## 方案三：使用 Serverless Framework（高级）

### 1. 安装 Serverless
```bash
npm install -g serverless
```

### 2. 创建 serverless.yml
```yaml
component: website
name: vocab-web
org: chris
inputs:
  src:
    src: ./
    exclude:
      - node_modules
      - .git
  region: ap-guangzhou
  runtime: Nodejs16.13
  apigatewayConf:
    protocol: https
    environment: release
```

### 3. 部署
```bash
serverless deploy
```

---

## 验证部署

部署成功后：
1. 打开分配的公网域名
2. 使用账号登录：`admin@example.com` / `admin123`
3. 上传单词图片测试
4. 检查背词功能是否正常

---

## 常见问题

### Q: 部署后无法访问？
A: 检查：
- 云托管服务是否已启动
- 环境变量是否正确配置
- 防火墙/安全组是否放行

### Q: API 调用失败？
A: 检查：
- TENCENT_SECRET_ID/KEY 是否正确
- DASHSCOPE_API_KEY 是否有效
- 网络是否可访问外网

### Q: 如何查看日志？
A: 云托管控制台 → 服务详情 → "日志查询"
