# Neo UART Assistant

基于 `FastAPI + pyserial + 原生前端` 的串口监测工具，支持：
- 串口连接、收发、通信日志
- 监测卡片配置（正则规则、单位、颜色）与实时值展示
- 卡片配置保存/载入（命名预设）
- 通信日志分色与字体/字号配置

## 1. 目录结构

```text
neo-uart/
├─ app/
│  ├─ main.py              # FastAPI 入口与路由
│  ├─ models.py            # 请求/响应数据模型
│  ├─ serial_service.py    # 串口服务（连接、读写、消息缓存）
│  └─ card_service.py      # 监测卡片服务（CRUD、运行态计算、预设管理）
├─ static/
│  ├─ index.html           # 前端页面
│  ├─ app.js               # 前端逻辑
│  └─ styles.css           # 样式
├─ data/
│  └─ monitor_cards.json   # 卡片持久化数据（运行时自动生成/更新）
├─ start.bat               # 一键启动脚本（Windows）
├─ requirements.txt
└─ README.md
```

## 2. 快速启动

### 方式 A：一键启动（推荐）
双击根目录的 `start.bat`，会自动：
1. 创建 `.venv`（若不存在）
2. 安装依赖
3. 启动后端
4. 打开浏览器页面

### 方式 B：手动启动
```powershell
cd d:\Project\neo-embedded\neo-uart
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

浏览器访问：`http://127.0.0.1:8000/`

## 3. 卡片与预设

### 3.1 卡片字段
- `name`：卡片名称
- `pattern`：匹配规则（优先按正则；非法正则时回退为关键字包含）
- `unit`：单位（可选，显示在数值后）
- `color`：卡片颜色（创建或编辑时指定）
- `enabled`：启用状态

### 3.2 数据文件结构
`data/monitor_cards.json` 使用以下结构：
```json
{
  "current": [
    { "id": 1, "name": "...", "pattern": "...", "enabled": true, "unit": "", "color": "#0e7a68", "created_at": "..." }
  ],
  "presets": [
    { "name": "默认配置", "saved_at": "2026-03-11T00:00:00", "cards": [ ... ] }
  ]
}
```

### 3.3 预设功能
- 保存当前卡片列表到命名预设
- 载入预设后替换当前卡片列表

## 4. 主要接口

### 页面/静态资源
- `GET /`
- `GET /styles.css`
- `GET /app.js`

### 健康检查
- `GET /api/health`

### 串口
- `GET /api/serial/ports`
- `GET /api/serial/status`
- `POST /api/serial/connect`
- `POST /api/serial/disconnect`
- `POST /api/serial/send`
- `GET /api/serial/messages`

### 监测卡片
- `GET /api/cards`
- `POST /api/cards`
- `PUT /api/cards/{card_id}`
- `DELETE /api/cards/{card_id}`
- `GET /api/cards/runtime`

### 卡片预设
- `GET /api/cards/presets`
- `POST /api/cards/presets`          # 保存（name）
- `POST /api/cards/presets/load`     # 载入（name）

## 5. 流程图文档
详细 Mermaid 流程图见：`docs/system_flowchart.md`
