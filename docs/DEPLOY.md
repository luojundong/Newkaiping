# 部署指南：开平中心医院能源管理平台（公网 117.21.178.39）

> 目的：**固化部署流程，避免后续重新摸索**。任何代码改动后重新部署按本文档执行。

## 1. 目标服务器

| 项 | 值 |
|----|----|
| IP | `117.21.178.39` |
| 用户名 | `useroot` |
| 密码 | `1qazxdr5`（sudo 同密码，`echo '密码' | sudo -S 命令`） |
| OS | Ubuntu 20.04.4 LTS x86_64（64GB 内存 / 561G 可用磁盘） |
| Node | 已装 `~/node`（v22.22.2，免 sudo） |
| 部署目录 | `/home/useroot/apps/kp` |
| 端口 | **5168**（唯一端口；服务器 ufw 已放行 `5168/tcp`） |
| 访问地址 | **http://117.21.178.39:5168**（admin / admin123） |

## 2. 架构（单进程单端口）

后端 NestJS（Fastify）直接托管前端构建产物：

- `backend/src/main.ts` 的 catch-all 静态路由 `/*` 托管 `backend/public/web/`（前端 dist 拷入）。
- 路由优先级：Nest 的 `/api/v1/*` → `/uploads/*` → 前端 SPA `/*`（SPA 路由如 `/admin/xxx` 回退 `index.html`）。
- 生产无需 nginx/独立前端服务器。

## 3. 打包（本地）

```bash
# 1) 后端构建（保证 dist 最新）
cd D:/wwwroot/NewKaiPing/backend && npm run build

# 2) 前端构建 + 拷入后端 public/web
cd D:/wwwroot/NewKaiPing/frontend && npm run build
mkdir -p D:/wwwroot/NewKaiPing/backend/public/web
cp -r D:/wwwroot/NewKaiPing/frontend/dist/* D:/wwwroot/NewKaiPing/backend/public/web/

# 3) 打包部署包（含 dist/依赖清单/public 静态资源）
cd D:/wwwroot/NewKaiPing/backend
tar -czf D:/wwwroot/NewKaiPing/deploy/kp-backend.tar.gz dist package.json package-lock.json public
```

注意：`backend/public/web/models/hospital.glb`（66MB）会包含在包内，最终包约 60MB。

## 4. 部署（可复用脚本，位于 `C:\Users\Admin\.workbuddy\binaries\node\workspace\ssh2tool\`）

依赖：managed node + `npm i ssh2`（该目录已装好）。脚本均硬编码服务器凭据，按需修改。

| 脚本 | 作用 |
|------|------|
| `kp_ssh_probe.mjs` | 环境探测（OS/node/端口/磁盘） |
| `kp_deploy.mjs` | 全流程：装 Node → 上传 tar → 解压 → npm install → 启动 → 验证（含踩坑：pkill 自杀问题已内置修正？——不，pkill 自杀问题见下，启动用 start.sh） |
| `kp_deploy2.mjs` | `--legacy-peer-deps` 重装依赖 + 自检 |
| `kp_start.mjs` | 上传 `start.sh` 并启动（**推荐启动方式**，避开 pkill 自杀坑） |
| `kp_firewall.mjs` | ufw 放行端口（新端口才需要） |
| `kp_e2e_remote.mjs` | 公网 UI 全链路验证（8 项） |

**重新部署标准流程**（代码改动后）：

```bash
# 本地
npm run build  # backend
npm run build  # frontend，dist 拷入 backend/public/web
tar -czf ../deploy/kp-backend.tar.gz dist package.json package-lock.json public   # 在 backend 目录

# 服务器（通过 ssh2tool 脚本或手动 ssh）
cd /home/useroot/apps/kp
# 上传 kp-backend.tar.gz（sftp fastPut）
tar -xzf kp-backend.tar.gz && rm -f kp-backend.tar.gz
export PATH=$HOME/node/bin:$PATH
npm install --omit=dev --legacy-peer-deps --registry=https://registry.npmmirror.com --no-audit --no-fund
bash start.sh   # pkill + nohup 启动 + 本地验证
```

`start.sh` 内容（服务器端 `~/apps/kp/start.sh`）：

```bash
#!/bin/bash
cd /home/useroot/apps/kp || exit 1
export PATH="$HOME/node/bin:$PATH"
pkill -f 'node dist/main' 2>/dev/null
sleep 1
nohup env PORT=5168 node dist/main >> kp.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "root=%{http_code} " http://localhost:5168/
curl -s -o /dev/null -w "api=%{http_code}\n" http://localhost:5168/api/v1/auth/me
```

## 5. 关键踩坑（务必遵守）

1. **不要用 `pkill -f "node dist/main"` 直接写在 ssh exec 命令串里** —— pkill -f 会匹配自身命令行（含该字符串）把自己杀掉，后续命令全挂。**必须写进独立 `start.sh` 再 `bash start.sh`**。
2. **npm peer 冲突**：`@nestjs/config@3.x` 的 peer 是 `@nestjs/common ^8/^9/^10`，项目用 common 11 → 必须 `--legacy-peer-deps`。
3. **`@fastify/busboy` 已显式加入 package.json dependencies**（main.ts 顶层 import，`--omit=dev` 必须装上）。
4. **防火墙**：服务器 ufw 默认只放行部分端口。新端口需 `echo '1qazxdr5' | sudo -S ufw allow <port>/tcp`。5168 已放行，无需重复。
5. **Node 装 `~/node` 免 sudo**：PATH 前缀 `$HOME/node/bin:$PATH`。
6. **恢复 runtime.json 数据需重启进程**（MockConnector 启动时加载内存）。
7. **重新部署会覆盖 runtime.json**：服务器上 `~/apps/kp/data/runtime.json` 会被部署包里的覆盖——**若服务器上有用户新增数据需先备份**（`cp data/runtime.json ~/runtime.bak`），部署后如无本地覆盖需求可回拷。当前数据以本地为准，部署包内置。

## 6. 验证清单（部署后）

```bash
# API 层
curl -s -o /dev/null -w "%{http_code}" http://117.21.178.39:5168/api/v1/auth/me        # 401
curl -s http://117.21.178.39:5168/api/v1/auth/login -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'                                        # code 0

# UI 层（Playwright）
node kp_e2e_remote.mjs    # 8/8：模型加载(66MB glTF) / 大屏3D / 无致命错误 / 后台DIY / 联动抽屉(139设备) / 审计日志
```

## 7. 历史

- 2026-08-21 首次部署成功：Node 22.22.2 装 `~/node`；`npm install --omit=dev --legacy-peer-deps`（276 packages）；`ufw allow 5168/tcp`；进程 PID 1485104 监听 0.0.0.0:5168；公网验证 8/8。
