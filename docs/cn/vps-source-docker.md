# VPS 源码构建本地 Docker 镜像部署

这份指南适合把本仓库部署到自己的 VPS，供小团队内部使用。镜像只在本机构建和运行，不需要发布到 Docker Hub 或 GHCR。

## 1. 准备源码和配置

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io.git
cd next-ai-draw-io
cp env.example .env
mkdir -p config data
```

编辑 `.env`，至少设置一个可用的模型来源。团队登录相关变量建议加入：

```env
AUTH_SECRET=请替换为一段至少32字符的随机字符串
TEAM_USERS_FILE=/app/config/users.json
TEAM_DATA_DIR=/app/data
AUTH_COOKIE_SECURE=false
ENABLE_TEAM_REGISTRATION=false
NEXT_PUBLIC_SELFHOSTED=true
```

如果 VPS 前面已经有 HTTPS 反代，把 `AUTH_COOKIE_SECURE` 改成 `true`。

## 2. 创建团队账号

为每个成员生成密码哈希：

```bash
read -s DRAWIO_PASSWORD
node scripts/hash-password.mjs "$DRAWIO_PASSWORD"
unset DRAWIO_PASSWORD
```

把输出写入 `config/users.json`：

```json
[
  {
    "id": "alice",
    "name": "Alice",
    "passwordHash": "scrypt$..."
  },
  {
    "id": "bob",
    "name": "Bob",
    "passwordHash": "scrypt$..."
  }
]
```

`id` 是登录用户名。不要把明文密码写进任何配置文件。

如果希望成员自己在登录页注册账号，可以把 `.env` 改成：

```env
ENABLE_TEAM_REGISTRATION=true
```

同时把 `config/users.json` 挂载为可写，不要使用 `:ro`：

```yaml
volumes:
  - ./data:/app/data
  - ./config/users.json:/app/config/users.json
```

首次开启注册前，如果还没有用户文件，先创建一个空数组文件：

```bash
printf '[]\n' > config/users.json
```

注册功能适合团队初始建号阶段使用。账号建完后，建议改回 `ENABLE_TEAM_REGISTRATION=false`，并把用户文件重新以只读方式挂载。

## 3. 启动 Docker Compose

确认 `docker-compose.yml` 里启用了用户文件挂载：

```yaml
volumes:
  - ./data:/app/data
  - ./config/users.json:/app/config/users.json:ro
```

构建并启动：

```bash
docker compose up -d --build
```

访问：

```text
http://你的服务器IP:3000
```

登录后，聊天 session 会写入 `./data/sessions.json`，每个账号的模型配置会写入 `./data/model-configs.json`。历史列表只显示当前账号创建的 session；团队成员拿到 `?session=...` 链接并登录后可以直接打开。

## 4. 使用 Caddy 反代 HTTPS

示例 `Caddyfile`：

```caddyfile
drawio.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

启用 HTTPS 后，把 `.env` 改为：

```env
AUTH_COOKIE_SECURE=true
```

然后重启：

```bash
docker compose up -d
```

## 5. 使用 Nginx 反代 HTTPS

示例配置：

```nginx
server {
    server_name drawio.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

配好证书后，同样把 `AUTH_COOKIE_SECURE=true` 并重启 Compose。

## 6. 备份和升级

备份团队数据：

```bash
tar czf next-ai-drawio-data-$(date +%F).tgz data config/users.json .env
```

升级源码后重新构建：

```bash
git pull
docker compose up -d --build
```

`data/` 和 `config/users.json` 是本地挂载目录，不会被镜像重建覆盖。
