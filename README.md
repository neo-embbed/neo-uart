# Neo UART Assistant

[![License](https://img.shields.io/github/license/neo-embbed/neo-uart?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.13-blue?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-CSS3-E34C26?logo=html5&logoColor=white)](https://html.spec.whatwg.org/)
[![PySerial](https://img.shields.io/badge/PySerial-3.5-blue?logo=python&logoColor=white)](https://pypi.org/project/pyserial/)

**Neo UART Assistant** 是一个高效的串行端口数据监测与分析工具，采用现代化的微服务架构设计。用户可通过内置的Web界面进行实时通信、数据监测、参数配置等操作。

## 核心特性

- **串口通信管理**：支持多波特率设置、实时数据收发、完整通信日志记录
- **智能数据监测**：基于正则表达式的灵活规则匹配，支持数值型和布尔型数据提取
- **可视化展示**：实时监测卡片显示、数据迷你图表、自定义单位与配色
- **配置管理**：预设系统支持多套配置快速切换，数据持久化存储
- **个性化设置**：通信日志多色主题、字体自定义、浏览器本地存储

## 1 项目结构

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

## 2 安装与启动

### 方案 A：内置Python Runtime（推荐）

发行版包含 Python 3.13 embeddable runtime。按以下步骤启动：

1. 解压压缩包至本地目录
2. 双击 `start.bat` 脚本
3. 脚本将自动完成以下操作：
   - 检查并配置Python运行时
   - 自动安装项目依赖
   - 启动FastAPI后端服务（端口 8000）
   - 自动打开浏览器访问应用界面

### 方案 B：虚拟环境启动

如果已安装 Python 3.13+，可通过虚拟环境启动：

```bash
# 创建虚拟环境
python -m venv .venv

# 激活虚拟环境
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动应用
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

启动完成后在浏览器访问 `http://127.0.0.1:8000`

## 3 监测卡片与配置管理

### 3.1 卡片属性

监测卡片由以下字段组成：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 卡片显示名称 |
| `pattern` | string | 数据匹配规则（正则表达式或关键词） |
| `type` | enum | `numeric`（数值型）或 `boolean`（布尔型） |
| `unit` | string | 数值单位（可选，仅数值型有效） |
| `color` | hex | 卡片背景色（RGB十六进制格式） |
| `enabled` | boolean | 启用状态开关 |
| `created_at` | ISO8601 | 创建时间戳 |

### 3.2 配置数据格式

卡片配置持久化于 `data/monitor_cards.json`，结构如下：

```json
{
  "current": {
    "name": "当前配置名称",
    "cards": [
      {
        "id": 1,
        "name": "温度监测",
        "pattern": "T1[:=]\\s*([-+]?\\d+(?:\\.\\d+)?)",
        "type": "numeric",
        "enabled": true,
        "unit": "℃",
        "color": "#0e7a68",
        "created_at": "2026-03-12T10:30:00Z"
      }
    ]
  },
  "presets": [
    {
      "name": "默认配置",
      "saved_at": "2026-03-11T15:45:00Z",
      "cards": [ ... ]
    }
  ]
}
```

### 3.3 预设管理

预设功能用于保存和快速切换多套监测配置：

- **保存预设**：将当前卡片列表以指定名称保存为预设
- **加载预设**：从已保存的预设中选择并应用到当前工作环境
- **数据持久化**：预设数据自动保存至本地JSON文件，重启后保留

### 3.4 正则匹配规则

#### 数值型卡片

用于从串口数据中提取数值，支持捕获组语法：

**示例规则：**
```regex
T1[:=]\s*([-+]?\d+(?:\.\d+)?)
```

**规则说明：**
- 使用括号 `(...)` 定义捕获组，组内内容作为目标数值
- 若未定义捕获组，则取整条正则匹配结果
- 支持浮点数、正负号、科学计数法

#### 布尔型卡片

用于匹配状态信号并映射为布尔值：

**示例规则：**
```regex
ALARM=(ON|OFF); true=ON; false=OFF
```

**规则说明：**
- 格式：`<正则规则>; true=<值1|值2>; false=<值3|值4>`
- 匹配成功的捕获组内容与映射列表进行比对
- 多个候选值可用 `|` 或 `,` 分隔
- **默认映射**（若未指定）：
  - `TRUE` ← `ON`、`TRUE`、`1`、`YES`
  - `FALSE` ← `OFF`、`FALSE`、`0`、`NO`
- 匹配成功但值不在映射表内时，显示「不匹配」（视觉警示）

## 4 API 参考

### 4.1 静态资源

| 方法 | 路径 | 描述 |
|--------|------|------|
| GET | `/` | Web UI 界面 |
| GET | `/styles.css` | 样式表 |
| GET | `/app.js` | 前端脚本 |

### 4.2 会话管理

| 方法 | 路径 | 描述 |
|--------|------|------|
| GET | `/api/health` | 应用健康检查 |

### 4.3 串口账户管理

| 方法 | 路径 | 主要参数 | 描述 |
|--------|------|-------------|------|
| GET | `/api/serial/ports` | - | 查询可用串口端口列表 |
| GET | `/api/serial/status` | - | 查询当前连接状态 |
| POST | `/api/serial/connect` | port, baudrate, bytesize, parity, stopbits, timeout | 建立串口连接 |
| POST | `/api/serial/disconnect` | - | 断开串口连接 |
| POST | `/api/serial/send` | payload, mode, append_newline | 发送数据（文本或八进制） |
| GET | `/api/serial/messages` | after_id, limit | 查询通信日志（分页） |

### 4.4 卡片管理

| 方法 | 路径 | 主要参数 | 描述 |
|--------|------|-------------|------|
| GET | `/api/cards` | - | 查询所有卡片配置 |
| POST | `/api/cards` | name, pattern, type, unit, color, enabled | 新成币卡片 |
| PUT | `/api/cards/{card_id}` | 转移参数 | 更新卡片配置 |
| DELETE | `/api/cards/{card_id}` | 转移参数 | 删除卡片 |
| GET | `/api/cards/runtime` | - | 查询卡片实时运行状态 |

### 4.5 配置预设管理

| 方法 | 路径 | 主要参数 | 描述 |
|--------|------|-------------|------|
| GET | `/api/cards/presets` | - | 查询存储的配置预设列表 |
| POST | `/api/cards/presets` | name | 保存当前配置为新预设 |
| POST | `/api/cards/presets/load` | name | 加载特定预设、替换当前设置 |

## 5 系统设计

完整的系统流程图及设计文档位于：`docs/system_flowchart.md`

### 5.1 核心模块

- **SerialService**：串口通信约束控制层，负责端口扫描、连接、读写操作
- **CardService**：卡片配置业务逻辑层，负责CRUD操作、预设管理、实时数据计算
- **前端应用**：原生JavaScript实现的实时UI渲染与交互

### 5.2 数据流设计

```
User Input → Frontend API Call → FastAPI Validation 
  → Business Logic → Serial Device → Data Capture 
  → Message Queue → Frontend Poll → UI Rendering
```

## 6 本地开发

### 6.1 环境要求

- Python 3.13+
- 支持的操作系统：Windows、macOS、Linux

### 6.2 安装依赖

```bash
pip install -r requirements.txt
```

### 6.3 启动开发服务器

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**参数说明：**
- `--reload`：代码改动时自动重新加载服务
- `--host 127.0.0.1`：仅本地访问（开发模式）
- `--port 8000`：服务监听端口

访问 `http://127.0.0.1:8000` 打开Web界面。

### 6.4 项目依赖说明

| 库 | 版本 | 用途 |
|----|------|------|
| [FastAPI](https://fastapi.tiangolo.com/) | 0.116 | Web框架与API路由 |
| [uvicorn](https://www.uvicorn.org/) | 0.34 | 异步Web服务器 |
| [pydantic](https://docs.pydantic.dev/) | 2.11 | 数据验证与序列化 |
| [pyserial](https://pyserial.readthedocs.io/) | 3.5 | 串口通信接口 |

## 7 许可证

本项目采用 MIT License。详见 [LICENSE](LICENSE) 文件。
