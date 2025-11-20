# Antigravity to OpenAI API 代理服务

将 Google Antigravity API 转换为 OpenAI 兼容格式的代理服务，支持流式和非流式响应。

## 功能特性

- ✅ OpenAI API 兼容格式
- ✅ 支持流式和非流式响应
- ✅ 自动 Token 管理和刷新
- ✅ 多账户支持
- ✅ 思维链输出（thinking）
- ✅ 完整的日志记录

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置

编辑 `config.json` 配置文件：

```json
{
  "server": {
    "port": 8045,
    "host": "0.0.0.0"
  },
  "api": {
    "url": "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse",
    "modelsUrl": "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
    "host": "daily-cloudcode-pa.sandbox.googleapis.com",
    "userAgent": "antigravity/1.11.3 windows/amd64"
  },
  "defaults": {
    "temperature": 1,
    "top_p": 0.85,
    "top_k": 100,
    "max_tokens": 8096
  },
  "security": {
    "maxRequestSize": "50mb",
    "apiKey": "your-api-key-here"
  }
}
```

配置说明：
- `apiKey`: 设置 API Key 以保护 /v1 端点，留空或设为 null 则不启用验证

### 账户登录

运行 OAuth 服务器进行账户授权：

```bash
npm run login
```

按照提示完成 Google 账户授权，账户信息将保存在 `accounts.json`。

### 启动服务

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

## API 端点

### 获取可用模型

```bash
GET http://localhost:8045/v1/models
```

### 聊天补全

```bash
POST http://localhost:8045/v1/chat/completions
Content-Type: application/json

{
  "model": "claude-sonnet-4-5-thinking",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": true
}
```

## 使用示例

### cURL

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-here" \
  -d '{
    "model": "claude-sonnet-4-5-thinking",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### Python

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8045/v1",
    api_key="your-api-key-here"
)

response = client.chat.completions.create(
    model="claude-sonnet-4-5-thinking",
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

## 项目结构

```
.
├── server.js          # 主服务器
├── api.js             # API 调用逻辑
├── oauth-server.js    # OAuth 授权服务器
├── token_manager.js   # Token 管理
├── utils.js           # 工具函数
├── logger.js          # 日志模块
├── config.json        # 配置文件
├── accounts.json      # 账户信息（自动生成）
└── package.json       # 项目配置
```

## 环境要求

- Node.js >= 18.0.0

## 许可证

MIT
