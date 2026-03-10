@echo off
echo =====================================
echo 腾讯云 CloudBase 部署脚本
echo =====================================
echo.

REM 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 16+
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)

echo [√] Node.js 已安装
echo.

REM 检查 CloudBase CLI
cloudbase --version >nul 2>&1
if errorlevel 1 (
    echo [提示] 正在安装 CloudBase CLI...
    npm install -g @cloudbase/cli
)

echo [√] CloudBase CLI 已安装
echo.

REM 登录提示
echo =====================================
echo 请登录腾讯云账号
echo =====================================
echo.
echo 1. 访问：https://console.cloud.tencent.com/tcb
echo 2. 开通云开发（免费版即可）
echo 3. 记录环境 ID（类似：vocab-app-xxx）
echo.

set /p ENV_ID=请输入你的环境 ID: 
echo.

REM 替换配置文件中的环境 ID
echo [提示] 配置环境 ID...
powershell -Command "(Get-Content cloudbaserc.json) -replace '{{envId}}', '%ENV_ID%' | Set-Content cloudbaserc.json"

REM 提示输入 API 密钥
echo.
echo =====================================
echo 配置 API 密钥
echo =====================================
echo.

set /p TENCENT_ID=请输入腾讯云 SecretId: 
set /p TENCENT_KEY=请输入腾讯云 SecretKey: 
set /p DASHSCOPE_KEY=请输入阿里云 DashScope API Key: 
echo.

REM 替换配置文件中的密钥
powershell -Command "(Get-Content cloudbaserc.json) -replace '{{TENCENT_SECRET_ID}}', '%TENCENT_ID%' | Set-Content cloudbaserc.json"
powershell -Command "(Get-Content cloudbaserc.json) -replace '{{TENCENT_SECRET_KEY}}', '%TENCENT_KEY%' | Set-Content cloudbaserc.json"
powershell -Command "(Get-Content cloudbaserc.json) -replace '{{DASHSCOPE_API_KEY}}', '%DASHSCOPE_KEY%' | Set-Content cloudbaserc.json"

echo [√] 配置完成
echo.

REM 构建项目
echo =====================================
echo 构建项目
echo =====================================
echo.

pnpm build
if errorlevel 1 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo [√] 构建成功
echo.

REM 部署
echo =====================================
echo 部署到 CloudBase
echo =====================================
echo.

cloudbase deploy --force

echo.
echo =====================================
echo 部署完成！
echo =====================================
echo.
echo 访问地址：https://%ENV_ID%.service.tcloudbase.com
echo.
pause
