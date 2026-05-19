#!/bin/bash
# Agent VNC Browser 启动脚本
# 依次启动: Xvfb → Chrome (CDP) → x11vnc → websockify

set -e

# 配置
DISPLAY_NUM=99
SCREEN_RES="1920x1080x24"
CDP_PORT=9222
VNC_PORT=5900
NOVNC_PORT=6080
CHROME_ARGS="--no-sandbox --disable-setuid-sandbox --remote-debugging-port=${CDP_PORT} --remote-allow-origins=* --no-first-run --no-default-browser-check --window-size=1920,1080 --disable-infobars --disable-translate --disable-blink-features=AutomationControlled --disable-dev-shm-usage --disable-gpu"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Agent VNC Browser 启动脚本 ===${NC}"

# 1. 启动 Xvfb 虚拟显示器
if ! pgrep -x "Xvfb" > /dev/null; then
    echo -e "${YELLOW}[1/4] 启动 Xvfb 虚拟显示器 (:${DISPLAY_NUM})...${NC}"
    Xvfb :${DISPLAY_NUM} -screen 0 ${SCREEN_RES} -ac &
    sleep 1
    echo -e "${GREEN}  ✓ Xvfb 已启动${NC}"
else
    echo -e "${YELLOW}[1/4] Xvfb 已在运行${NC}"
fi

export DISPLAY=:${DISPLAY_NUM}

# 1.5 启动 openbox 窗口管理器（让 Chrome 能真正最大化）
if ! pgrep -x "openbox" > /dev/null; then
    echo -e "${YELLOW}[1.5] 启动 openbox 窗口管理器...${NC}"
    # 配置 openbox 自动最大化所有窗口
    mkdir -p ~/.config/openbox
    cat > ~/.config/openbox/rc.xml << 'OBCONF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config>
  <applications>
    <application class="*">
      <maximized>yes</maximized>
    </application>
  </applications>
</openbox_config>
OBCONF
    openbox &
    sleep 1
    echo -e "${GREEN}  ✓ openbox 已启动${NC}"
fi

# 2. 启动 Chrome（开启 CDP 调试端口）
if ! curl -s http://localhost:${CDP_PORT}/json/version > /dev/null 2>&1; then
    echo -e "${YELLOW}[2/4] 启动 Chrome (CDP :${CDP_PORT})...${NC}"

    # 尝试找到 Chrome/Chromium
    CHROME_BIN=""
    if command -v google-chrome-stable &> /dev/null; then
        CHROME_BIN="google-chrome-stable"
    elif command -v google-chrome &> /dev/null; then
        CHROME_BIN="google-chrome"
    elif command -v chromium-browser &> /dev/null; then
        CHROME_BIN="chromium-browser"
    elif command -v chromium &> /dev/null; then
        CHROME_BIN="chromium"
    fi
    
    # 尝试 Playwright 内置 Chromium
    if [ -z "$CHROME_BIN" ]; then
        PW_CHROME=$(find /root/.cache/ms-playwright -name "chrome" -type f 2>/dev/null | head -1)
        if [ -n "$PW_CHROME" ]; then
            CHROME_BIN="$PW_CHROME"
            echo -e "${YELLOW}  使用 Playwright Chromium: ${CHROME_BIN}${NC}"
        fi
    fi
    
    if [ -z "$CHROME_BIN" ]; then
        echo "  ✗ 未找到 Chrome/Chromium，请先安装"
        exit 1
    fi

    ${CHROME_BIN} ${CHROME_ARGS} --start-maximized &
    sleep 3

    # 用 xdotool 确保 Chrome 窗口铺满整个屏幕
    xdotool search --class "chrom" windowmove 0 0 windowsize 1920 1080 2>/dev/null || true
    sleep 1

    # 验证 CDP 端口
    if curl -s http://localhost:${CDP_PORT}/json/version > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Chrome 已启动 (CDP :${CDP_PORT})${NC}"
    else
        echo "  ✗ Chrome 启动失败"
        exit 1
    fi
else
    echo -e "${YELLOW}[2/4] Chrome 已在运行 (CDP :${CDP_PORT})${NC}"
fi

# 3. 启动 x11vnc（共享 Xvfb 画面）
if ! pgrep -x "x11vnc" > /dev/null; then
    echo -e "${YELLOW}[3/4] 启动 x11vnc (VNC :${VNC_PORT})...${NC}"
    x11vnc \
        -display :${DISPLAY_NUM} \
        -forever \
        -nopw \
        -shared \
        -rfbport ${VNC_PORT} \
        -bg \
        -o /tmp/x11vnc.log \
        2>/dev/null
    sleep 1
    echo -e "${GREEN}  ✓ x11vnc 已启动 (VNC :${VNC_PORT})${NC}"
else
    echo -e "${YELLOW}[3/4] x11vnc 已在运行${NC}"
fi

# 4. 启动 websockify（WebSocket → VNC 代理）
if ! pgrep -f "websockify.*${NOVNC_PORT}" > /dev/null; then
    echo -e "${YELLOW}[4/4] 启动 websockify (noVNC :${NOVNC_PORT})...${NC}"

    # 查找 noVNC web 文件目录
    NOVNC_WEB=""
    if [ -d "/usr/share/novnc" ]; then
        NOVNC_WEB="/usr/share/novnc"
    elif [ -d "/opt/noVNC" ]; then
        NOVNC_WEB="/opt/noVNC"
    fi

    if [ -n "$NOVNC_WEB" ]; then
        websockify --web=${NOVNC_WEB} ${NOVNC_PORT} localhost:${VNC_PORT} &
    else
        websockify ${NOVNC_PORT} localhost:${VNC_PORT} &
    fi
    sleep 1
    echo -e "${GREEN}  ✓ websockify 已启动 (noVNC :${NOVNC_PORT})${NC}"
else
    echo -e "${YELLOW}[4/4] websockify 已在运行${NC}"
fi

echo ""
echo -e "${GREEN}=== 所有服务已启动 ===${NC}"
echo "  Chrome CDP:  http://localhost:${CDP_PORT}"
echo "  VNC 服务:    localhost:${VNC_PORT}"
echo "  noVNC 访问:  http://localhost:${NOVNC_PORT}/vnc.html"
echo ""
echo -e "${YELLOW}提示: Playwright 通过 CDP 连接: chromium.connectOverCDP('http://localhost:${CDP_PORT}')${NC}"
