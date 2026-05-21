# 🚀 Yinxin.AGI 服务器部署指南

## 📋 部署概览

本指南将帮助你把 Yinxin.AGI 系统部署到阿里云轻量应用服务器。

### 环境要求
- **操作系统**: Ubuntu 24.04
- **配置**: 2核 vCPU + 2GB 内存 + 40GB ESSD
- **域名**: liugeshu.com (主域名)

---

## 阶段1：安全配置

### 1.1 配置防火墙（UFW）

```bash
# 启用防火墙，只开放必要端口
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
ufw status
```

### 1.2 创建部署用户（可选，安全加固）

```bash
# 创建普通用户
adduser deploy

# 添加到 sudo 组
usermod -aG sudo deploy

# 切换到 deploy 用户
su - deploy
```

### 1.3 安装 Fail2ban（防暴力破解）

```bash
# 安装
apt install -y fail2ban

# 启用并启动
systemctl enable --now fail2ban

# 检查状态
systemctl status fail2ban
```

### 1.4 SSH 安全加固（可选）

```bash
# 编辑 SSH 配置
sudo nano /etc/ssh/sshd_config

# 修改以下配置：
# Port 2222  # 更改 SSH 端口（非必须）
# PasswordAuthentication no  # 禁用密码登录
# PermitRootLogin no  # 禁用 root 登录

# 重启 SSH 服务
sudo systemctl restart sshd
```

> ⚠️ **注意**: 修改 SSH 配置前，请确保已经配置好 SSH 密钥登录，否则可能无法登录！

---

## 阶段2：安装 Nginx + SSL

### 2.1 安装 Nginx

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
sudo systemctl status nginx
```

### 2.2 安装 Certbot（SSL 证书工具）

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2.3 获取 SSL 证书

```bash
sudo certbot --nginx -d liugeshu.com -d www.liugeshu.com
```

按照提示输入：
- 邮箱地址（用于接收证书过期通知）
- 同意服务条款
- 选择是否接收营销邮件
- 选择是否自动跳转（选择 "2" 手动跳转）

---

## 阶段3：项目部署

### 3.1 安装 Node.js 20.x（如果还没安装）

```bash
# 安装 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 安装 Node.js
sudo apt install -y nodejs

# 验证安装
node --version  # 应显示 v20.x.x
npm --version    # 应显示 10.x.x
```

### 3.2 安装 Yarn

```bash
sudo npm install -g yarn
yarn --version
```

### 3.3 安装 PM2（进程管理器）

```bash
sudo npm install -g pm2
pm2 --version
```

### 3.4 克隆项目代码

```bash
# 切换到 home 目录
cd ~

# 克隆仓库（使用 SSH 或 HTTPS）
git clone https://github.com/liwei668/yinxin-rag-stack.git
# 或者如果配置了 SSH 密钥：
# git clone git@github.com:liwei668/yinxin-rag-stack.git

# 进入项目目录
cd yinxin-rag-stack
```

### 3.5 安装依赖

```bash
yarn install
```

### 3.6 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑环境变量
nano .env
```

至少配置以下变量：
```env
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://liugeshu.com
# 添加你的 API Key 等配置
```

### 3.7 构建项目

```bash
yarn build
```

### 3.8 配置 PM2

创建 PM2 配置文件 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'yinxin-agi',
    script: 'yarn',
    args: 'start',
    cwd: '/home/deploy/yinxin-rag-stack',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/home/deploy/.pm2/logs/yinxin-agi-error.log',
    out_file: '/home/deploy/.pm2/logs/yinxin-agi-out.log'
  }]
};
```

### 3.9 启动应用

```bash
pm2 start ecosystem.config.js
pm2 list
```

### 3.10 设置开机自启

```bash
pm2 startup
pm2 save
```

---

## 阶段4：配置 Nginx

### 4.1 创建 Nginx 配置文件

```bash
sudo nano /etc/nginx/sites-available/yinxin-agi
```

添加以下内容：

```nginx
server {
    listen 80;
    server_name liugeshu.cn 六个数.com 六个数.cn;
    return 301 https://liugeshu.com$request_uri;
}

server {
    listen 80;
    server_name liugeshu.com www.liugeshu.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name liugeshu.com www.liugeshu.com;

    # SSL 配置（Certbot 自动添加）

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 100M;
}
```

### 4.2 启用配置

```bash
# 删除默认配置
sudo rm /etc/nginx/sites-enabled/default

# 启用新配置
sudo ln -s /etc/nginx/sites-available/yinxin-agi /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## 阶段5：配置 SSL 自动续期

Certbot 会自动配置续期任务，但我们可以验证一下：

```bash
sudo certbot renew --dry-run
```

---

## 阶段6：系统优化（可选）

### 6.1 优化系统参数

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
```

### 6.2 配置 Swap（可选）

如果内存不足，可以添加 swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 阶段7：测试验证

### 7.1 检查服务状态

```bash
# 检查 PM2
pm2 status

# 检查 Nginx
sudo systemctl status nginx

# 检查防火墙
sudo ufw status

# 检查端口占用
sudo netstat -tlnp | grep -E ':(80|443|3000)'
```

### 7.2 测试访问

在浏览器中访问：
- `https://liugeshu.com`
- `https://www.liugeshu.com`

### 7.3 测试重定向

访问以下域名，应该会 301 重定向到主域名：
- `http://liugeshu.cn`
- `http://六个数.com`
- `http://六个数.cn`

---

## 常用维护命令

### 日志管理

```bash
# 查看 PM2 日志
pm2 logs yinxin-agi

# 查看 Nginx 访问日志
sudo tail -f /var/log/nginx/access.log

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log
```

### 重启服务

```bash
# 重启应用
pm2 restart yinxin-agi

# 重启 Nginx
sudo systemctl restart nginx
```

### 更新部署

```bash
cd ~/yinxin-rag-stack
git pull
yarn install
yarn build
pm2 restart yinxin-agi
```

### 备份数据

```bash
# 备份整个项目
tar -czvf yinxin-backup-$(date +%Y%m%d).tar.gz ~/yinxin-rag-stack
```

---

## 故障排查

### 应用无法启动

```bash
# 查看错误日志
pm2 logs yinxin-agi --err

# 手动测试启动
cd ~/yinxin-rag-stack
yarn start
```

### Nginx 502 错误

- 检查 PM2 是否运行：`pm2 list`
- 检查端口：`curl http://127.0.0.1:3000`
- 查看 Nginx 错误日志

### SSL 证书问题

```bash
# 检查证书状态
sudo certbot certificates

# 手动续期
sudo certbot renew
```

---

## 安全建议

1. **定期更新系统**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **监控服务器资源**
   ```bash
   htop
   ```

3. **设置自动备份**
   ```bash
   # 每天凌晨 3 点自动备份
   0 3 * * * tar -czvf /home/deploy/backups/yinxin-$(date +\%Y\%m\%d).tar.gz /home/deploy/yinxin-rag-stack
   ```

4. **配置防火墙规则**
   ```bash
   sudo ufw status
   sudo ufw delete allow 22/tcp  # 如果使用密钥登录，可以删除 SSH 端口
   ```

---

## 📞 获取帮助

如果遇到问题，可以：
1. 查看日志：`pm2 logs yinxin-agi`
2. 检查服务状态：`pm2 list`
3. 验证配置：`sudo nginx -t`

---

**祝你部署成功！🚀**
