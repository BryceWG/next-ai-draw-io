# 使用 Docker 运行

如果您只是想在本地运行，最好的方式是使用 Docker。

首先，如果您尚未安装 Docker，请先安装：[获取 Docker](https://docs.docker.com/get-docker/)

然后运行：

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

或者使用环境变量文件：

```bash
cp env.example .env
# 编辑 .env 文件并填入您的配置
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

请将环境变量替换为您首选的 AI 提供商配置。查看 [AI 提供商](./ai-providers.md) 了解可用选项。

> **离线部署：** 如果无法访问 `embed.diagrams.net`，请参阅 [离线部署](./offline-deployment.md) 了解配置选项。

如果您要在 VPS 上从源码构建本地镜像，并启用小团队登录、服务端 session 存储和账号级模型配置同步，请参阅 [VPS 源码构建本地 Docker 镜像部署](./vps-source-docker.md)。
