#!/usr/bin/env python3
"""
桌面控制客户端 - 通过WebSocket连接服务端，接收指令操控本地电脑
依赖: pip install websockets mss Pillow
"""

import asyncio
import json
import base64
import io
import os
import sys
import platform
import subprocess
import time
import websockets
import mss
from PIL import Image

# 配置
SERVER_URL = sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:8765"
USER_ID = sys.argv[2] if len(sys.argv) > 2 else "default_user"

# 禁用 pyautogui 的 mouseinfo（需要 tkinter），使用 xdotool 直接操控
os.environ['PYAUTOGUI_DISABLE_MOUSEINFO'] = '1'

# 使用 xdotool 操控（不依赖 pyautogui/tkinter）
# pyautogui 在无 GUI 环境下需要 tkinter，这里用 xdotool 替代
HAS_PYAUTOGUI = False

def _run_cmd(cmd):
    """执行 shell 命令"""
    try:
        subprocess.run(cmd, shell=True, check=True, timeout=5,
                      env={**os.environ, 'DISPLAY': os.environ.get('DISPLAY', ':99')})
    except Exception:
        pass

# 确保 DISPLAY 环境变量存在（mss 和 xdotool 都需要）
if not os.environ.get('DISPLAY'):
    os.environ['DISPLAY'] = ':99'

# 获取屏幕分辨率（启动时缓存，避免每次操作都调用 mss）
_cached_resolution = None
def get_screen_resolution():
    global _cached_resolution
    if _cached_resolution:
        return _cached_resolution
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # 主显示器
        _cached_resolution = {"width": monitor["width"], "height": monitor["height"]}
        return _cached_resolution

def capture_screenshot():
    """截取屏幕并返回base64编码的PNG"""
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        screenshot = sct.grab(monitor)
        img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        return base64.b64encode(buffer.read()).decode("utf-8")

async def send_response(ws, command_id, data=None):
    """发送命令响应"""
    response = {
        "type": "command_response",
        "commandId": command_id,
        "data": data or {"status": "ok"}
    }
    await ws.send(json.dumps(response))

async def handle_command(ws, message):
    """处理服务端发来的命令"""
    action = message.get("action")
    command_id = message.get("commandId")

    try:
        if action == "click":
            x = message["x"]
            y = message["y"]
            button = message.get("button", "left")

            # 将百分比坐标转换为绝对坐标
            resolution = get_screen_resolution()
            abs_x = int((x / 100) * resolution["width"])
            abs_y = int((y / 100) * resolution["height"])

            if HAS_PYAUTOGUI:
                if button == "right":
                    pyautogui.rightClick(abs_x, abs_y)
                elif button == "double":
                    pyautogui.doubleClick(abs_x, abs_y)
                else:
                    pyautogui.click(abs_x, abs_y)
            else:
                # xdotool 回退
                btn = "3" if button == "right" else "1"
                _run_cmd(f"xdotool mousemove {abs_x} {abs_y}")
                _run_cmd(f"xdotool click {btn}")

            await send_response(ws, command_id, {"clicked": True, "x": abs_x, "y": abs_y})

        elif action == "type":
            text = message["text"]
            clear_first = message.get("clearFirst", True)

            if HAS_PYAUTOGUI:
                if clear_first:
                    _run_cmd("xdotool key ctrl+a")
                # xdotool type 不支持中文，用 xclip 粘贴
                import tempfile
                with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                    f.write(text)
                    tmpfile = f.name
                _run_cmd(f"xclip -selection clipboard -i {tmpfile}")
                _run_cmd("xdotool key ctrl+v")
                os.unlink(tmpfile)

            await send_response(ws, command_id, {"typed": len(text)})

        elif action == "hotkey":
            keys = message["keys"]
            if HAS_PYAUTOGUI:
                pyautogui.hotkey(*keys)
            else:
                key_str = "+".join(k.lower() for k in keys)
                _run_cmd(f"xdotool key {key_str}")
            await send_response(ws, command_id, {"hotkey": keys})

        elif action == "screenshot":
            base64_img = capture_screenshot()
            await send_response(ws, command_id, {"base64": base64_img})

        elif action == "scroll":
            direction = message.get("direction", "down")
            amount = message.get("amount", 5)
            clicks = amount if direction == "up" else -amount
            # xdotool: 模拟鼠标滚轮（button 4=上, button 5=下）
            button = 4 if direction == "up" else 5
            for _ in range(abs(amount)):
                _run_cmd(f"xdotool click {button}")
            await send_response(ws, command_id, {"scrolled": True})

        elif action == "drag":
            resolution = get_screen_resolution()
            from_x = int((message["fromX"] / 100) * resolution["width"])
            from_y = int((message["fromY"] / 100) * resolution["height"])
            to_x = int((message["toX"] / 100) * resolution["width"])
            to_y = int((message["toY"] / 100) * resolution["height"])
            # xdotool: 移动到起点，按住鼠标，移动到终点，释放
            _run_cmd(f"xdotool mousemove {from_x} {from_y}")
            _run_cmd("xdotool mousedown 1")
            time.sleep(0.1)
            _run_cmd(f"xdotool mousemove {to_x} {to_y}")
            time.sleep(0.1)
            _run_cmd("xdotool mouseup 1")
            await send_response(ws, command_id, {"dragged": True})

        elif action == "key_press":
            key = message["key"]
            _run_cmd(f"xdotool key {key.lower()}")
            await send_response(ws, command_id, {"pressed": key})

        else:
            await send_response(ws, command_id, {"error": f"未知操作: {action}"})

    except Exception as e:
        await send_response(ws, command_id, {"error": str(e)})

async def main():
    resolution = get_screen_resolution()
    os_name = platform.system()

    print(f"桌面控制客户端")
    print(f"   用户ID: {USER_ID}")
    print(f"   系统: {os_name}")
    print(f"   分辨率: {resolution['width']}x{resolution['height']}")
    print(f"   服务端: {SERVER_URL}")
    print(f"   连接中...")

    while True:
        try:
            async with websockets.connect(SERVER_URL) as ws:
                # 注册
                register_msg = {
                    "type": "register",
                    "userId": USER_ID,
                    "screenResolution": resolution,
                    "os": os_name
                }
                await ws.send(json.dumps(register_msg))

                # 等待注册确认
                response = await asyncio.wait_for(ws.recv(), timeout=5)
                data = json.loads(response)
                if data.get("status") == "ok":
                    print(f"连接成功! (clientId: {data.get('clientId')})")

                # 心跳 + 命令处理循环
                heartbeat_task = asyncio.create_task(heartbeat_loop(ws))

                try:
                    async for message in ws:
                        msg = json.loads(message)
                        if msg.get("type") == "command":
                            await handle_command(ws, msg)
                finally:
                    heartbeat_task.cancel()

        except websockets.exceptions.ConnectionClosed:
            print("连接断开，5秒后重连...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"错误: {e}，5秒后重连...")
            await asyncio.sleep(5)

async def heartbeat_loop(ws):
    """发送心跳保持连接"""
    while True:
        await asyncio.sleep(15)
        try:
            await ws.send(json.dumps({"type": "heartbeat"}))
        except:
            break

if __name__ == "__main__":
    asyncio.run(main())
