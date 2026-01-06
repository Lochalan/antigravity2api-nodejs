# Antigravity2API

A proxy service that converts Google Antigravity API to OpenAI-compatible format. Supports streaming responses, tool calling, and multi-account management.

## Features

- OpenAI API compatible format
- Streaming and non-streaming responses
- Function calling / tool use support
- Multi-account rotation with configurable strategies
- Automatic token refresh
- Thinking/reasoning output (OpenAI reasoning_effort + DeepSeek reasoning_content format)
- Image input support (Base64)
- Image generation (gemini-3-pro-image models)
- Web dashboard for management
- Multiple API formats (OpenAI, Gemini, Claude)

## Requirements

- Node.js >= 18.0.0
- Windows

## Quick Start

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with your settings
npm run login    # Get Google auth token (optional, can be done on dashboard)
npm start
```

## Configuration

### Environment Variables (.env)

| Variable         | Description                       | Default  |
| ---------------- | --------------------------------- | -------- |
| `API_KEY`        | API key for client authentication | Required |
| `ADMIN_USERNAME` | Dashboard login username          | Required |
| `ADMIN_PASSWORD` | Dashboard login password          | Required |
| `JWT_SECRET`     | Secret for JWT tokens             | Required |
| `PORT`           | Server port                       | 8045     |
| `PROXY`          | HTTP proxy URL                    | None     |

### config.json

```json
{
  "reasoningEffort": {
    "low": 1024,
    "medium": 16000,
    "high": 20000
  },
  "server": {
    "port": 8045,
    "host": "0.0.0.0",
    "maxRequestSize": "500mb",
    "heartbeatInterval": 15000,
    "memoryThreshold": 50
  },
  "rotation": {
    "strategy": "round_robin",
    "requestCount": 50
  },
  "api": {
    "url": "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse",
    "modelsUrl": "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
    "noStreamUrl": "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent",
    "host": "daily-cloudcode-pa.sandbox.googleapis.com",
    "userAgent": "antigravity/1.11.3 windows/amd64"
  },
  "defaults": {
    "temperature": 1,
    "topP": 0.96,
    "topK": 50,
    "maxTokens": 100000,
    "thinkingBudget": 10000
  },
  "cache": {
    "modelListTTL": 3600000
  },
  "other": {
    "timeout": 300000,
    "retryTimes": 3,
    "skipProjectIdFetch": false,
    "useNativeAxios": false,
    "useContextSystemPrompt": true,
    "passSignatureToClient": true,
    "disableServerCache": true
  }
}
```

### Config Options

| Section           | Option                      | Description                                                                    |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `reasoningEffort` | `low/medium/high`           | Token budgets for thinking models when client sends reasoning_effort parameter |
| `server`          | `port`                      | Server port number                                                             |
| `server`          | `host`                      | Bind address (0.0.0.0 for all interfaces)                                      |
| `server`          | `maxRequestSize`            | Max request body size                                                          |
| `server`          | `heartbeatInterval`         | Heartbeat interval in ms (prevents timeout)                                    |
| `server`          | `memoryThreshold`           | Memory threshold in MB for cleanup                                             |
| `rotation`        | `strategy`                  | Token rotation strategy (see below)                                            |
| `rotation`        | `requestCount`              | Requests before switching (for request_count strategy)                         |
| `api`             | `url/modelsUrl/noStreamUrl` | API endpoints                                                                  |
| `api`             | `host`                      | API host header                                                                |
| `api`             | `userAgent`                 | User agent string                                                              |
| `defaults`        | `temperature`               | Default temperature (0-2)                                                      |
| `defaults`        | `topP/topK`                 | Sampling parameters                                                            |
| `defaults`        | `maxTokens`                 | Max output tokens                                                              |
| `defaults`        | `thinkingBudget`            | Default thinking budget when not using reasoning_effort                        |
| `cache`           | `modelListTTL`              | Model list cache duration in ms                                                |
| `other`           | `timeout`                   | Request timeout in ms                                                          |
| `other`           | `retryTimes`                | Retry attempts on failure                                                      |
| `other`           | `skipProjectIdFetch`        | Skip project ID validation                                                     |
| `other`           | `useNativeAxios`            | Use axios instead of AntigravityRequester                                      |
| `other`           | `useContextSystemPrompt`    | Merge system messages into SystemInstruction                                   |
| `other`           | `passSignatureToClient`     | Pass thoughtSignature to client responses                                      |
| `other`           | `disableServerCache`        | Disable server-side signature caching                                          |

### Rotation Strategies

- `round_robin` - Switch token each request
- `quota_exhausted` - Switch only when quota depleted
- `request_count` - Switch after N requests

## API Endpoints

| Endpoint                                         | Description                |
| ------------------------------------------------ | -------------------------- |
| `POST /v1/chat/completions`                      | OpenAI-compatible chat     |
| `POST /v1/messages`                              | Claude-compatible messages |
| `POST /gemini/v1/models/{model}:generateContent` | Gemini format              |
| `GET /v1/models`                                 | List available models      |

See `API.md` for full API documentation.

## Dashboard

Access at http://localhost:8045 after starting the server.

Features:

- Token management (add/remove/refresh)
- Configuration editor
- Quota monitoring
- Real-time status

## Factory CLI Integration

Add to `~/.factory/settings.json`:

```json
{
  "customModels": [
    {
      "model": "claude-opus-4-5-thinking",
      "baseUrl": "http://127.0.0.1:8045/v1",
      "apiKey": "your-api-key",
      "displayName": "Antigravity Proxy",
      "maxOutputTokens": 60000,
      "provider": "generic-chat-completion-api",
      "extraArgs": {
        "max_tokens": 60000
      }
    }
  ]
}
```

## License

Do whatever you want.
