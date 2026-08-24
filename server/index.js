// 班主任工作台 · 后端服务（最小可用版：单用户 + 多设备同步）
// 数据库使用 sql.js（纯 JavaScript 实现的 SQLite，无需编译原生模块，Railway 等平台 100% 可跑）
const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const ROOT = __dirname;
const PUB = path.join(ROOT, '..'); // workbench 目录（index.html + app.js）

// 数据库文件路径：优先用持久卷（Railway 挂载 /data），否则用本地文件
let DB_DIR = ROOT;
if (process.env.DATA_DIR) {
  try {
    if (!fs.existsSync(process.env.DATA_DIR)) fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
    DB_DIR = process.env.DATA_DIR;
  } catch (e) {
    console.warn('[db] 无法使用 DATA_DIR，回退本地:', e.message);
    DB_DIR = ROOT;
  }
}
const DB_PATH = path.join(DB_DIR, 'data.db');
console.log('[db] 使用数据库路径:', DB_PATH);

const JWT_SECRET = process.env.JWT_SECRET || 'ct-workbench-secret-change-me';
const PORT = process.env.PORT || 3000;

// ---------- 启动 sql.js ----------
let db;
function loadDb() {
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    return new SQL.Database(new Uint8Array(fileBuffer));
  }
  return new SQL.Database();
}
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

let SQL;
initSqlJs().then((SQLModule) => {
  SQL = SQLModule;
  db = loadDb();
  db.run(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT)`);

  // 默认账号：admin / admin123（首次启动写入，建议上线后改密码）
  const cnt = db.exec("SELECT COUNT(*) AS c FROM users");
  const count = cnt.length ? cnt[0].values[0][0] : 0;
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('[init] 默认账号已创建 -> admin / admin123（请尽快修改密码）');
    persist();
  }
  console.log('[db] 数据库初始化完成');
}).catch(err => {
  console.error('[fatal] sql.js 初始化失败:', err.stack || err.message);
  process.exit(1);
});

function kvGet(k) {
  const r = db.exec("SELECT v FROM kv WHERE k = '" + k.replace(/'/g, "''") + "'");
  return r.length ? r[0].values[0][0] : null;
}
function kvSet(k, v) {
  db.run('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [k, v]);
  persist();
}
function getUser(username) {
  const r = db.exec("SELECT * FROM users WHERE username = '" + username.replace(/'/g, "''") + "'");
  if (!r.length) return null;
  const cols = r[0].columns;
  const row = r[0].values[0];
  const obj = {};
  cols.forEach((c, i) => obj[c] = row[i]);
  return obj;
}

// ---------- 鉴权 ----------
function authMiddleware(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload.username;
    next();
  } catch (e) {
    res.status(401).json({ error: '未登录或登录已过期' });
  }
}

const app = express();
app.use(express.json({ limit: '25mb' })); // 相册图片可能较大

// 健康检查（Railway 等平台的探针用）
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });
  const u = getUser(username);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

// 修改密码
app.post('/api/password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const u = getUser(req.user);
  if (!u || !bcrypt.compareSync(oldPassword, u.password_hash)) return res.status(401).json({ error: '原密码错误' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });
  db.run('UPDATE users SET password_hash=? WHERE username=?', [bcrypt.hashSync(newPassword, 10), req.user]);
  persist();
  res.json({ ok: true });
});

// 拉取整份数据
app.get('/api/data', authMiddleware, (req, res) => {
  const raw = kvGet('state') || 'null';
  res.json({ state: JSON.parse(raw) });
});

// 保存整份数据
app.post('/api/data', authMiddleware, (req, res) => {
  const state = req.body && req.body.state;
  if (!state || typeof state !== 'object') return res.status(400).json({ error: '数据格式不正确' });
  kvSet('state', JSON.stringify(state));
  res.json({ ok: true, savedAt: Date.now() });
});

// 导出备份（服务端生成 json 下载）
app.get('/api/export', authMiddleware, (req, res) => {
  const raw = kvGet('state') || '{}';
  res.setHeader('Content-Disposition', 'attachment; filename="banzhuren-backup.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(raw);
});

// 静态文件托管（前端）
app.use(express.static(PUB));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`班主任工作台后端已启动: http://localhost:${PORT}`);
});

// 优雅退出
process.on('SIGINT', () => { try { persist(); } catch (e) {} process.exit(0); });
process.on('SIGTERM', () => { try { persist(); } catch (e) {} process.exit(0); });

// 捕获未处理异常，避免静默崩溃
process.on('uncaughtException', (err) => { console.error('[fatal] uncaughtException:', err.stack || err.message); process.exit(1); });
process.on('unhandledRejection', (reason, p) => { console.error('[fatal] unhandledRejection:', reason); });
