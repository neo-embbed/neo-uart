# Neo UART Assistant

串口助手基础框架，包含 FastAPI 后端与 Web UI。

## 目录结构

```text
app/
  main.py
  serial_service.py
  card_service.py
  models.py
static/
  index.html
  styles.css
  app.js
data/
  monitor_cards.json   # 运行时自动创建
requirements.txt
```

## 快速启动

1. 创建虚拟环境并安装依赖

```powershell
cd d:\Project\neo-embedded\neo-uart
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. 启动服务

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. 打开页面

访问 `http://127.0.0.1:8000/`
