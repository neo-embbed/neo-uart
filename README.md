# Neo UART Assistant

基于 `FastAPI + pyserial + 原生前端` 的串口监测工具，支持：
- 串口连接、收发、日志查看
- 监测卡片配置（规则、单位、颜色）
- 卡片实时值计算与展示（根据串口接收数据匹配）

## 1. 目录结构

```text
neo-uart/
├─ app/
│  ├─ main.py              # FastAPI 入口与路由
│  ├─ models.py            # 请求/响应数据模型
│  ├─ serial_service.py    # 串口服务（连接、读写、消息缓存）
│  └─ card_service.py      # 监测卡片服务（CRUD、实时值计算）
├─ static/
│  ├─ index.html           # 前端页面
│  ├─ app.js               # 前端逻辑
│  └─ styles.css           # 样式
├─ data/
│  └─ monitor_cards.json   # 卡片持久化数据（运行时自动生成）
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
4. 打开浏览器访问页面

### 方式 B：手动启动

```powershell
cd d:\Project\neo-embedded\neo-uart
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

浏览器访问：`http://127.0.0.1:8000/`

## 3. 主要业务说明

### 3.1 串口功能
- 扫描串口：`/api/serial/ports`
- 连接串口：`/api/serial/connect`
- 断开串口：`/api/serial/disconnect`
- 发送数据：`/api/serial/send`
- 拉取消息：`/api/serial/messages`

后端内部会启动读线程，持续将 RX/TX/SYS 消息写入内存队列（最大 5000 条）。

### 3.2 监测卡片功能
- 卡片字段：
  - `name`：卡片名称
  - `pattern`：匹配规则（优先按正则；非法正则时回退为关键字包含）
  - `unit`：单位（可选，显示在数值后）
  - `color`：卡片颜色（创建时指定）
  - `enabled`：启用状态
- 卡片接口：
  - `GET /api/cards`：获取卡片配置
  - `POST /api/cards`：创建卡片
  - `PUT /api/cards/{id}`：更新卡片
  - `DELETE /api/cards/{id}`：删除卡片
  - `GET /api/cards/runtime`：计算每张卡片的实时状态与最新值

### 3.3 实时值计算规则
1. 仅使用串口接收消息（`direction == "rx"`）
2. 从最新消息向旧消息反向查找
3. 正则匹配成功时：
   - 若有捕获组：取第一个非空捕获组作为值
   - 否则取整段匹配文本
4. 正则非法时，回退为关键字包含匹配

## 4. 当前接口清单

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
- `GET /api/cards/runtime`
- `POST /api/cards`
- `PUT /api/cards/{card_id}`
- `DELETE /api/cards/{card_id}`

## 5. 流程图文档

详细 Mermaid 流程图见：
- [docs/流程图.md](docs/流程图.md)
