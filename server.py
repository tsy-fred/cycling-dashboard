#!/usr/bin/env python3
"""
server.py — 骑行看板开发服务器
支持静态文件服务和 .fit 文件上传解析。

用法：
  python3 server.py [端口]
  默认端口 8080，然后打开 http://localhost:8080
"""

import http.server
import json
import os
import sys
import tempfile
import subprocess
import webbrowser
import shutil
import time
import base64
import urllib.request
import urllib.parse
import urllib.error
from urllib.parse import urlparse, parse_qs

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(PROJECT_DIR, "config.json")
PARSE_SCRIPT = os.path.join(PROJECT_DIR, "scripts", "parse_fit.py")
DATA_FILE = os.path.join(PROJECT_DIR, "data", "rides.json")
PROCESSED_DIR = os.path.join(PROJECT_DIR, "__processed__")

# ── 配置加载 ──

def load_config():
    default = {
        "obsidian": {"enabled": False, "vault_path": ""},
        "server": {"port": 8080, "auto_open_browser": True},
        "strava": {
            "client_id": "",
            "client_secret": "",
            "refresh_token": "",
            "access_token": "",
            "expires_at": 0,
            "athlete": "",
            "auto_sync": False,
        },
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            for k, v in default.items():
                cfg.setdefault(k, v)
            for k, v in default["strava"].items():
                cfg["strava"].setdefault(k, v)
            return cfg
        except Exception:
            pass
    return default

CONFIG = load_config()


def save_config(cfg):
    """写入 config.json 并刷新全局 CONFIG。"""
    global CONFIG
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    CONFIG = cfg


# ── Strava 工具 ──

STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API = "https://www.strava.com/api/v3"


def _ssl_context():
    """macOS python.org 的 Python 经常 SSL 验证失败(cert.pem 缺失),用 certifi 兜底。"""
    try:
        import certifi, ssl
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


def strava_http(method, url, headers=None, data=None, timeout=30):
    """对 Strava API 的极简封装。返回 (status, data);data 失败时会带 status / raw 字段。"""
    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if data is not None:
        body = data if isinstance(data, bytes) else data.encode("utf-8")
        req.data = body
    ctx = _ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        info = {"status": e.code, "raw": raw.decode("utf-8", errors="replace")[:500]}
        try:
            info.update(json.loads(raw))
        except Exception:
            pass
        return e.code, info
    except urllib.error.URLError as e:
        return 0, {"status": "url_error", "error": f"URLError: {e.reason}"}
    except Exception as e:
        return 0, {"status": "exception", "error": f"{type(e).__name__}: {e or '(无消息)'}",
                   "repr": repr(e), "type": type(e).__name__}


def get_strava_access_token():
    """读取/刷新 access_token,过期前 60 秒主动续。失败返回 None。"""
    s = CONFIG.get("strava", {})
    rt = s.get("refresh_token", "")
    cid = s.get("client_id", "")
    cs = s.get("client_secret", "")
    if not (rt and cid and cs):
        return None
    if s.get("access_token") and s.get("expires_at", 0) > time.time() + 60:
        return s["access_token"]
    body = urllib.parse.urlencode({
        "client_id": cid, "client_secret": cs,
        "grant_type": "refresh_token", "refresh_token": rt,
    }).encode("utf-8")
    status, data = strava_http("POST", STRAVA_TOKEN_URL,
                               headers={"Content-Type": "application/x-www-form-urlencoded"},
                               data=body)
    if status != 200 or "access_token" not in data:
        return None
    cfg = load_config()
    cfg["strava"]["access_token"] = data["access_token"]
    cfg["strava"]["expires_at"] = time.time() + data.get("expires_in", 21600)
    save_config(cfg)
    return data["access_token"]


class CyclingHandler(http.server.SimpleHTTPRequestHandler):
    """自定义请求处理：静态文件 + 上传解析"""

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/locations':
            self.handle_locations()
        elif parsed.path == '/export-md':
            self.handle_export_md()
        elif parsed.path == '/pick-folder':
            self.handle_pick_folder()
        elif parsed.path == '/config':
            self.handle_config()
        elif parsed.path == '/strava/connect':
            self.handle_strava_connect()
        elif parsed.path == '/strava/callback':
            self.handle_strava_callback()
        elif parsed.path.startswith('/strava/status/'):
            upload_id = parsed.path[len('/strava/status/'):]
            self.handle_strava_status(upload_id)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/upload':
            self.handle_upload()
        elif path == '/save':
            self.handle_save()
        elif path == '/locations':
            self.handle_locations()
        elif path == '/export-obsidian':
            self.handle_export_obsidian()
        elif path == '/config':
            self.handle_config()
        elif path == '/detect-vault':
            self.handle_detect_vault()
        elif path == '/pick-folder':
            self.handle_pick_folder()
        elif path == '/strava/upload':
            self.handle_strava_upload()
        elif path == '/strava/disconnect':
            self.handle_strava_disconnect()
        else:
            self.send_json({"error": "未知接口"}, 404)

    # ── 处理 .fit 上传 ──

    def handle_upload(self):
        """接收 .fit 文件，解析后返回 JSON"""
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0:
            self.send_json({"error": "未上传文件"}, 400)
            return

        body = self.rfile.read(content_len)

        with tempfile.NamedTemporaryFile(suffix='.fit', delete=False) as tmp:
            tmp.write(body)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                [sys.executable, PARSE_SCRIPT, tmp_path],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode != 0:
                err_msg = result.stderr.strip() or result.stdout.strip() or "解析失败"
                self.send_json({"error": err_msg}, 400)
                return

            parsed = json.loads(result.stdout)

            if "error" in parsed:
                self.send_json(parsed, 400)
                return

            self.send_json(parsed)
        except subprocess.TimeoutExpired:
            self.send_json({"error": "解析超时（超过 30 秒）"}, 400)
        except json.JSONDecodeError:
            self.send_json({"error": "解析器输出异常"}, 400)
        except Exception as e:
            self.send_json({"error": f"服务器错误: {str(e)}"}, 500)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # ── 保存骑行记录到 rides.json ──

    def handle_save(self):
        """接收前端发来的完整记录，写入 rides.json"""
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0:
            self.send_json({"error": "无数据"}, 400)
            return

        body = self.rfile.read(content_len)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json({"error": "JSON 格式错误"}, 400)
            return

        records = data.get("records", [])
        replace = data.get("_replace", False)

        if not records and not replace:
            self.send_json({"error": "无有效记录"}, 400)
            return

        # 读取现有数据
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
        else:
            existing = {
                "version": 1,
                "last_updated": None,
                "route_colors": {},
                "route_order": [],
                "records": [],
            }

        if replace:
            # 替换模式：直接使用传入的 records
            existing["records"] = records
        else:
            # 合并模式：按 id 去重，新记录覆盖旧记录
            existing_by_id = {}
            for r in existing.get("records", []):
                rid = r.get("id")
                if rid:
                    existing_by_id[rid] = r

            for r in records:
                rid = r.get("id")
                if rid:
                    existing_by_id[rid] = r
                else:
                    existing_by_id[f"ride-{len(existing_by_id)}"] = r

            existing["records"] = list(existing_by_id.values())

        # 更新配色表 & 清理不再使用的路线
        used_routes = set(r.get("route") for r in existing["records"] if r.get("route"))
        existing["route_colors"] = {k: v for k, v in existing["route_colors"].items() if k in used_routes}
        existing["route_order"] = [r for r in existing["route_order"] if r in used_routes]

        for r in existing["records"]:
            route = r.get("route", "")
            if route and route not in existing["route_colors"]:
                import hashlib
                h = hashlib.md5(route.encode()).hexdigest()
                existing["route_colors"][route] = f"#{h[:6]}"
                if route not in existing["route_order"]:
                    existing["route_order"].append(route)
        existing["records"].sort(key=lambda x: x.get("date", ""), reverse=True)
        existing["last_updated"] = __import__("datetime").datetime.now().isoformat()
        existing["version"] = 1

        # 保存 .fit 文件到 __processed__/ 归档
        fit_data = data.get("fit_files", {})
        for rid, fit_content_b64 in fit_data.items():
            import base64
            try:
                fit_bytes = base64.b64decode(fit_content_b64)
                fit_path = os.path.join(PROCESSED_DIR, f"{rid}.fit")
                os.makedirs(PROCESSED_DIR, exist_ok=True)
                with open(fit_path, "wb") as ff:
                    ff.write(fit_bytes)
            except Exception:
                pass  # 非关键错误

        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)

        # 同步到 Obsidian（按配置决定是否启用）
        obs_cfg = CONFIG.get("obsidian", {})
        if obs_cfg.get("enabled") and obs_cfg.get("vault_path"):
            try:
                subprocess.Popen(
                    [sys.executable, os.path.join(PROJECT_DIR, "scripts", "sync_obsidian.py")],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            except Exception:
                pass

        total_km = sum(rr.get("distance_km", 0) for rr in existing["records"])
        self.send_json({
            "ok": True,
            "total_rides": len(existing["records"]),
            "total_km": round(total_km, 1),
        })

    # ── 地标管理 ──

    def handle_locations(self):
        LOC_FILE = os.path.join(PROJECT_DIR, "data", "locations.json")
        content_len = int(self.headers.get('Content-Length', 0))

        if content_len == 0:
            # GET: 读取地标
            if os.path.exists(LOC_FILE):
                with open(LOC_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = []
            self.send_json(data)
            return

        # POST: 保存地标列表（全量替换）
        body = self.rfile.read(content_len)
        try:
            locations = json.loads(body)
            with open(LOC_FILE, "w", encoding="utf-8") as f:
                json.dump(locations, f, ensure_ascii=False, indent=2)
            self.send_json({"ok": True, "count": len(locations)})
        except json.JSONDecodeError:
            self.send_json({"error": "JSON 格式错误"}, 400)

    # ── 导出 Obsidian ──

    def handle_export_obsidian(self):
        sync_script = os.path.join(PROJECT_DIR, "scripts", "sync_obsidian.py")
        try:
            result = subprocess.run([sys.executable, sync_script], capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                self.send_json({"ok": True, "message": result.stdout.strip()})
            else:
                self.send_json({"ok": False, "error": result.stderr.strip() or result.stdout.strip()})
        except subprocess.TimeoutExpired:
            self.send_json({"ok": False, "error": "同步超时"})
        except Exception as e:
            self.send_json({"ok": False, "error": str(e)})

    # ── 导出 .md 文件 ──

    def handle_export_md(self):
        sync_script = os.path.join(PROJECT_DIR, "scripts", "sync_obsidian.py")
        try:
            proc = subprocess.run(
                [sys.executable, sync_script, "--stdout"],
                capture_output=True, text=True, timeout=30
            )
            content = proc.stdout
            if not content:
                content = "# 骑行记录\n\n暂无数据\n"

            body = content.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/markdown; charset=utf-8")
            self.send_header("Content-Disposition", "attachment; filename=cycling_record.md")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except subprocess.TimeoutExpired:
            self.send_json({"error": "生成超时"}, 500)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    # ── 配置读写 ──

    def handle_config(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0:
            self.send_json(load_config())
            return
        body = self.rfile.read(content_len)
        try:
            cfg = json.loads(body)
            for k, v in load_config().items():
                cfg.setdefault(k, v)
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
            global CONFIG
            CONFIG = cfg
            self.send_json({"ok": True})
        except json.JSONDecodeError:
            self.send_json({"error": "JSON 格式错误"}, 400)

    # ── 自动检测 Obsidian 资料库 ──

    def handle_detect_vault(self):
        import glob
        home = os.path.expanduser("~")
        candidates = [
            os.path.join(home, "Documents", "Obsidian"),
            os.path.join(home, "Obsidian"),
            os.path.join(home, "Desktop"),
        ]
        # iCloud Obsidian
        icloud = os.path.join(home, "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents")
        if os.path.isdir(icloud):
            candidates.insert(0, icloud)

        found = []
        for p in candidates:
            if os.path.isdir(p):
                # 检查是否有 .obsidian 隐藏文件夹（确认是 Obsidian vault）
                is_vault = os.path.isdir(os.path.join(p, ".obsidian"))
                found.append({"path": p, "is_vault": is_vault})

        # 同时检查已有配置
        cfg = load_config()
        obs = cfg.get("obsidian", {})
        if obs.get("vault_path") and os.path.isdir(os.path.expanduser(obs["vault_path"])):
            found.insert(0, {"path": os.path.expanduser(obs["vault_path"]), "is_vault": True, "current": True})

        self.send_json({"candidates": found})

    # ── 原生文件夹选择器 ──

    def handle_pick_folder(self):
        try:
            result = subprocess.run(
                ['osascript', '-e',
                 'set f to POSIX path of (choose folder with prompt "选择骑行记录.md 的导出位置")\nreturn f'],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0 and result.stdout.strip():
                folder = result.stdout.strip()
                self.send_json({"path": folder})
            else:
                self.send_json({"path": None})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    # ── Strava OAuth + 上传 ──

    def handle_strava_connect(self):
        """GET /strava/connect — 跳到 Strava 授权页。"""
        s = CONFIG.get("strava", {})
        cid = s.get("client_id", "")
        if not cid:
            self.send_json({"error": "请先在设置面板填入 Strava client_id"}, 400)
            return
        port = CONFIG.get("server", {}).get("port", 8080)
        redirect = f"http://localhost:{port}/strava/callback"
        url = ("https://www.strava.com/oauth/authorize?"
               f"client_id={cid}&response_type=code&redirect_uri={urllib.parse.quote(redirect)}"
               "&scope=activity:write,read&approval_prompt=force")
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()

    def handle_strava_callback(self):
        """GET /strava/callback?code=... — 用 code 换 refresh_token 并存。"""
        qs = parse_qs(urlparse(self.path).query)
        code = (qs.get("code") or [""])[0]
        if not code:
            self.send_html("<h1>❌ Strava 回调缺少 code</h1>")
            return
        s = CONFIG.get("strava", {})
        cid, cs = s.get("client_id", ""), s.get("client_secret", "")
        if not (cid and cs):
            self.send_html("<h1>❌ 配置缺少 client_id / client_secret</h1>")
            return
        body = urllib.parse.urlencode({
            "client_id": cid, "client_secret": cs, "code": code,
            "grant_type": "authorization_code",
        }).encode("utf-8")
        status, data = strava_http("POST", STRAVA_TOKEN_URL,
                                   headers={"Content-Type": "application/x-www-form-urlencoded"},
                                   data=body)
        if status != 200 or "refresh_token" not in data:
            err = data.get("error") or data.get("error_description") or data.get("message") or "未知错误"
            raw = data.get("raw", "")
            print(f"[Strava] token 换失败: status={status} err={err} raw={raw[:200]}", flush=True)
            self.send_html(f"""<meta charset="utf-8"><h1>❌ Strava 换 token 失败</h1>
<p><b>HTTP {status}</b> · {err}</p>
<details><summary>原始响应</summary><pre>{raw[:800]}</pre></details>
<p><a href="/">返回看板</a></p>""")
            return
        cfg = load_config()
        cfg["strava"]["refresh_token"] = data["refresh_token"]
        cfg["strava"]["access_token"] = data.get("access_token", "")
        cfg["strava"]["expires_at"] = time.time() + data.get("expires_in", 21600)
        # 顺手取一下用户名
        athlete_name = ""
        if data.get("access_token"):
            _, me = strava_http("GET", f"{STRAVA_API}/athlete",
                                headers={"Authorization": f"Bearer {data['access_token']}"})
            if isinstance(me, dict):
                athlete_name = f"{me.get('firstname','')} {me.get('lastname','')}".strip()
        cfg["strava"]["athlete"] = athlete_name
        save_config(cfg)
        self.send_html(f"""<!doctype html><meta charset="utf-8"><title>Strava 已连接</title>
<style>body{{font-family:-apple-system,sans-serif;background:#f7f8fa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
.c{{background:#fff;padding:32px 40px;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.1);text-align:center}}
h1{{color:#2e7d32;margin:0 0 8px;font-size:20px}}
p{{color:#666;font-size:13px;margin:0 0 16px}}
a{{display:inline-block;padding:8px 24px;background:#FC4C02;color:#fff;text-decoration:none;border-radius:8px;font-size:13px}}</style>
<div class="c"><h1>✅ Strava 连接成功</h1><p>已连接账号：<b>{athlete_name or '(未知)'}</b></p>
<a href="/">返回看板</a></div>
<script>setTimeout(function(){{location.href='/?strava=connected'}},800)</script>
""")

    def handle_strava_upload(self):
        """POST /strava/upload — 把 .fit 转给 Strava。body: {file_base64, external_id, name}"""
        s = CONFIG.get("strava", {})
        if not s.get("refresh_token"):
            self.send_json({"error": "未连接 Strava"}, 400)
            return
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0:
            self.send_json({"error": "无数据"}, 400)
            return
        try:
            data = json.loads(self.rfile.read(content_len))
        except json.JSONDecodeError:
            self.send_json({"error": "JSON 格式错误"}, 400)
            return
        try:
            fit_bytes = base64.b64decode(data["file_base64"])
        except Exception:
            self.send_json({"error": "file_base64 解析失败"}, 400)
            return
        if not fit_bytes:
            self.send_json({"error": "空文件"}, 400)
            return
        token = get_strava_access_token()
        if not token:
            self.send_json({"error": "无法获取 Strava access_token"}, 401)
            return
        # 组 multipart/form-data 给 Strava
        boundary = "----cycling" + str(int(time.time() * 1000))
        def field(name, value):
            return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").encode("utf-8")
        def file_field(name, filename, content):
            return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
                    "Content-Type: application/octet-stream\r\n\r\n").encode("utf-8") + content + b"\r\n"
        parts = [
            field("data_type", "fit"),
            field("external_id", str(data.get("external_id") or int(time.time()))),
        ]
        if data.get("name"):
            parts.append(field("activity_name", str(data["name"])))
        if data.get("description"):
            parts.append(field("description", str(data["description"])))
        if data.get("commute"):
            parts.append(field("commute", "1"))
        parts.append(file_field("file", data.get("name", "ride.fit") + ".fit", fit_bytes))
        body = b"".join(parts) + f"--{boundary}--\r\n".encode("utf-8")
        status, resp = strava_http(
            "POST", f"{STRAVA_API}/uploads",
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": f"multipart/form-data; boundary={boundary}"},
            data=body, timeout=60,
        )
        if status in (200, 201):
            self.send_json({"ok": True, "upload_id": resp.get("id"),
                            "status": resp.get("status"), "external_id": resp.get("external_id")})
        else:
            self.send_json({"error": f"Strava 上传失败 (HTTP {status})", "detail": resp}, status or 500)

    def handle_strava_status(self, upload_id):
        """GET /strava/status/{id} — 轮询 Strava 看是否处理完。"""
        token = get_strava_access_token()
        if not token:
            self.send_json({"error": "未连接 Strava"}, 401)
            return
        status, data = strava_http("GET", f"{STRAVA_API}/uploads/{upload_id}",
                                   headers={"Authorization": f"Bearer {token}"})
        self.send_json({"ok": status == 200,
                        "status": data.get("status"),
                        "activity_id": data.get("activity_id"),
                        "error": data.get("error")}, status if status else 500)

    def handle_strava_disconnect(self):
        """POST /strava/disconnect — 清掉 refresh_token。"""
        cfg = load_config()
        cfg["strava"]["refresh_token"] = ""
        cfg["strava"]["access_token"] = ""
        cfg["strava"]["expires_at"] = 0
        cfg["strava"]["athlete"] = ""
        save_config(cfg)
        self.send_json({"ok": True})

    # ── 工具方法 ──

    def send_html(self, html, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, fmt, *args):
        # 美化日志：只显示方法和路径
        if len(args) >= 2:
            method, path = args[0], args[1]
            if path == "/upload":
                super().log_message("📤 POST /upload", *args)
            else:
                super().log_message(fmt, *args)
        else:
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.HTTPServer(("127.0.0.1", port), CyclingHandler)

    print(f"\n  🚴 骑行看板服务器已启动")
    print(f"  ─────────────────────────────")
    print(f"  📍 http://localhost:{port}")
    print(f"  📤 POST /upload  上传 .fit 文件")
    print(f"  💾 POST /save    保存骑行记录")
    print(f"  ─────────────────────────────")
    print(f"  按 Ctrl+C 停止服务器\n")

    # 自动打开浏览器
    webbrowser.open(f"http://localhost:{port}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        server.server_close()


if __name__ == "__main__":
    main()
