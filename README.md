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

### 方式 A：Embedded runtime（推荐）

从release中下载的压缩包中带有目录`python/`

使用自带的 Python embeddable runtime，双击根目录的 `start.bat`，会自动：

1. 使用 `python/` 目录中的runtime
2. 安装依赖
3. 启动后端
4. 打开浏览器页面

### 方式 B：Venv 启动

双击根目录的 `start_venv.bat`

## 3. 卡片与预设

### 3.1 卡片字段
- `name`：卡片名称
- `pattern`：匹配规则（优先按正则；非法正则时回退为关键字包含）
- `type`：卡片类型（`numeric` 数值型 / `boolean` 布尔型）
- `unit`：单位（可选，显示在数值后）
- `color`：卡片颜色（创建或编辑时指定）
- `enabled`：启用状态

### 3.2 数据文件结构
`data/monitor_cards.json` 使用以下结构：
```json
{
  "current": {
    "name": "当前配置名",
    "cards": [
      { "id": 1, "name": "...", "pattern": "...", "type": "numeric", "enabled": true, "unit": "", "color": "#0e7a68", "created_at": "..." }
    ]
  },
  "presets": [
    { "name": "默认配置", "saved_at": "2026-03-11T00:00:00", "cards": [ ... ] }
  ]
}
```

### 3.3 预设功能
- 保存当前卡片列表到命名预设
- 载入预设后替换当前卡片列表

### 3.4 正则匹配示例

数值型卡片（提取捕获组中的数值）：
```text
T1[:=]\s*([-+]?\d+(?:\.\d+)?)
```
说明：
- 建议用捕获组 `(...)` 提取目标值
- 若无捕获组，默认取整条匹配文本

布尔型卡片（命中正则后，将捕获组映射为 True/False）：
```text
ALARM=(ON|OFF); true=ON; false=OFF
```
说明：
- `; true=...; false=...` 用于自定义映射
- 值可用 `|` 或 `,` 分隔多个候选
- 若不写映射，默认使用：`ON/TRUE/1/YES` → `TRUE`，`OFF/FALSE/0/NO` → `FALSE`
- 匹配到但不在映射内时显示 **不匹配**（红色）

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
