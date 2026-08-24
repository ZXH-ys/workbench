// 班主任工作台 · 后端服务（最小可用版：单用户 + 多设备同步）
// 存储双模式：检测到 DATABASE_URL（Railway Postgres 自动注入）用 Postgres；否则用 sql.js 文件模式
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const ROOT = __dirname;
const PUB = path.join(ROOT, '..');

const JWT_SECRET = process.env.JWT_SECRET || 'ct-workbench-secret-change-me';
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_PG = !!DATABASE_URL;

console.log('[db] 模式:', USE_PG ? 'Postgres (DATABASE_URL)' : 'sql.js (本地文件)');

// ===================== 存储抽象层 =====================
// 统一接口： kvGet / kvSet / getUser / upsertUser / ensureInit
// 两种实现：PGStore（Postgres） 和 SqlJsStore（文件）

// ---------- Postgres 实现 ----------
function createPgStore() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let ready = false;

  async function ensureInit() {
    if (ready) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT)`);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    if (rows[0].c === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', ['admin', hash]);
      console.log('[init] 默认账号已创建 -> admin / admin123（请尽快修改密码）');
    }
    ready = true;
  }

  return {
    mode: 'pg',
    async kvGet(k) {
      await ensureInit();
      const { rows } = await pool.query('SELECT v FROM kv WHERE k=$1', [k]);
      return rows.length ? rows[0].v : null;
    },
    async kvSet(k, v) {
      await ensureInit();
      await pool.query('INSERT INTO kv (k, v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=$2', [k, v]);
    },
    async getUser(username) {
      await ensureInit();
      const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
      return rows.length ? rows[0] : null;
    },
    async upsertUser(username, hash) {
      await ensureInit();
      await pool.query('INSERT INTO users (username, password_hash) VALUES ($1,$2) ON CONFLICT (username) DO UPDATE SET password_hash=$2', [username, hash]);
    }
  };
}

// ---------- sql.js 实现（本地文件，适合本机/无 Postgres 环境） ----------
function createSqlJsStore() {
  const initSqlJs = require('sql.js');
  let DB_DIR = ROOT;
  if (process.env.DATA_DIR) {
    try {
      if (!fs.existsSync(process.env.DATA_DIR)) fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
      DB_DIR = process.env.DATA_DIR;
    } catch (e) { console.warn('[db] 无法使用 DATA_DIR，回退本地:', e.message); DB_DIR = ROOT; }
  }
  const DB_PATH = path.join(DB_DIR, 'data.db');
  console.log('[db] 文件数据库路径:', DB_PATH);

  let SQL, db;
  function loadDb() {
    if (fs.existsSync(DB_PATH)) return new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
    return new SQL.Database();
  }
  function persist() { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }

  return {
    mode: 'sqljs',
    async init() {
      SQL = await initSqlJs();
      db = loadDb();
      db.run(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
      db.run(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT)`);
      const cnt = db.exec('SELECT COUNT(*) AS c FROM users');
      if (!cnt.length || cnt[0].values[0][0] === 0) {
        db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', bcrypt.hashSync('admin123', 10)]);
        console.log('[init] 默认账号已创建 -> admin / admin123（请尽快修改密码）');
        persist();
      }
      console.log('[db] sql.js 数据库初始化完成');
    },
    async kvGet(k) {
      const r = db.exec("SELECT v FROM kv WHERE k = '" + String(k).replace(/'/g, "''") + "'");
      return r.length ? r[0].values[0][0] : null;
    },
    async kvSet(k, v) {
      db.run('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [k, v]);
      persist();
    },
    async getUser(username) {
      const r = db.exec("SELECT * FROM users WHERE username = '" + String(username).replace(/'/g, "''") + "'");
      if (!r.length) return null;
      const cols = r[0].columns, row = r[0].values[0], obj = {};
      cols.forEach((c, i) => obj[c] = row[i]);
      return obj;
    },
    async upsertUser(username, hash) {
      db.run('INSERT OR REPLACE INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
      persist();
    }
  };
}

// ===================== 启动存储 =====================
let store;
async function bootStore() {
  if (USE_PG) {
    store = createPgStore();
  } else {
    store = createSqlJsStore();
    await store.init();
  }
}

// ===================== 鉴权 =====================
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
app.use(express.json({ limit: '25mb' }));

// 健康检查
app.get('/health', (req, res) => res.json({ ok: true, mode: store ? store.mode : 'booting', ts: Date.now() }));

// 登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });
  const u = await store.getUser(username);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

// 修改密码
app.post('/api/password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const u = await store.getUser(req.user);
  if (!u || !bcrypt.compareSync(oldPassword, u.password_hash)) return res.status(401).json({ error: '原密码错误' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });
  await store.upsertUser(req.user, bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

// 拉取整份数据
app.get('/api/data', authMiddleware, async (req, res) => {
  const raw = (await store.kvGet('state')) || 'null';
  res.json({ state: JSON.parse(raw) });
});

// 保存整份数据
app.post('/api/data', authMiddleware, async (req, res) => {
  const state = req.body && req.body.state;
  if (!state || typeof state !== 'object') return res.status(400).json({ error: '数据格式不正确' });
  await store.kvSet('state', JSON.stringify(state));
  res.json({ ok: true, savedAt: Date.now() });
});

// 导出备份
app.get('/api/export', authMiddleware, async (req, res) => {
  const raw = (await store.kvGet('state')) || '{}';
  res.setHeader('Content-Disposition', 'attachment; filename="banzhuren-backup.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(raw);
});

// 静态文件托管（前端）
app.use(express.static(PUB));

bootStore().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`班主任工作台后端已启动: http://localhost:${PORT} (mode=${store.mode})`);
  });
}).catch(err => {
  console.error('[fatal] 存储初始化失败:', err.stack || err.message);
  process.exit(1);
});

// 捕获未处理异常
process.on('uncaughtException', (err) => { console.error('[fatal] uncaughtException:', err.stack || err.message); process.exit(1); });
process.on('unhandledRejection', (reason) => { console.error('[fatal] unhandledRejection:', reason); });
