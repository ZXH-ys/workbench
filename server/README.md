# 班主任工作台 · 多设备同步版

单用户（班主任自己用）、多设备实时同步的班级管理工作台。前端沿用原版 UI，后端用 Node + SQLite 存数据。

## 本地运行（同局域网多设备）
```bash
cd server
node index.js
```
- 本机：http://localhost:3000
- 同 WiFi 手机/电脑：http://<你的局域网IP>:3000
- 账号：admin / admin123（登录后「数据管理 → 🔑 修改密码」可改）

## 公网部署（不同网络也能用）— 以 Railway 为例
Railway 支持 Node 后端，免费额度够用，无需绑卡即可试运行。

1. 把整个 `workbench` 目录推到 GitHub（或用 Railway 的「Deploy from GitHub」）。
2. 在 Railway 新建 Project → Deploy a new service → 选你的仓库。
3. Railway 会自动识别根目录 `package.json` 并执行 `npm install` + `node server/index.js`。
4. 在 Railway 控制台设置环境变量：
   - `JWT_SECRET`：一串随机强密码（必填，用于登录令牌安全）
   - `DATA_DIR`：`/data`（持久卷路径，保证重启不丢数据）
   - `PORT`：不用设，Railway 自动注入
5. 在 Railway 给服务挂载一个 **Volume**，挂载路径填 `/data`。
6. 部署完成后 Railway 会给一个 `xxx.up.railway.app` 的公网网址，手机电脑任意网络都能打开登录。

> 数据库文件在服务器的 `/data/data.db`（本地运行则在 `server/data.db`）。

## 数据迁移
你原来在浏览器 `file://` 本地录入的数据：
- 方式一：登录新版后首次保存会自动同步到后端。
- 方式二：「数据管理 → 导出」下载 JSON，再在新版「导入」。

## 备份
- 前端「数据管理 → ⬇️ 导出」下载 JSON。
- 后端 GET /api/export 也可直接下载。

## 安全提示
- 默认账号 admin/admin123 仅用于演示，上线务必改密码。
- JWT_SECRET 必须设为强随机值，不要用默认值。
