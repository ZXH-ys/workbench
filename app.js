// ===================== Storage =====================
const STORAGE_KEY = 'ct_workbench_v1';
const AUTH_KEY = 'ct_auth_token';
let AUTH_TOKEN = (typeof localStorage !== 'undefined') ? localStorage.getItem(AUTH_KEY) : '';

// 后端 API（多设备同步）。无后端时自动退化到纯本地。
function apiPost(url, body) {
  if (!AUTH_TOKEN) return Promise.resolve(null);
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN }, body: JSON.stringify(body) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('sync fail ' + r.status)))
    .catch(e => { console.warn('[sync]', e.message); return null; });
}
function apiGet(url) {
  if (!AUTH_TOKEN) return Promise.resolve(null);
  return fetch(url, { headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN } })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('sync fail ' + r.status)))
    .catch(e => { console.warn('[sync]', e.message); return null; });
}
function setSyncBadge(text, isErr) {
  const el = document.getElementById('sync-badge');
  if (!el) return;
  el.textContent = text;
  el.className = 'text-[11px] ' + (isErr ? 'text-orange-500' : 'text-gray-400');
}
function pushSync() {
  setSyncBadge('同步中…', false);
  apiPost('/api/data', { state }).then(r => {
    if (r && r.ok) setSyncBadge('已同步 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), false);
    else setSyncBadge('离线（本地已存）', true);
  });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function defaultState() {
  return {
    user: { name: 'Claire', role: '英语 · 班主任' },
    nav: [
      { id: 'home', label: '工作台首页', icon: '🏠' },
      { section: '日常记录', items: [
        { id: 'schedule', label: '课程表', icon: '📅' },
        { id: 'students', label: '学生管理', icon: '👨‍👩‍👧‍👦' },
        { id: 'points', label: '积分管理', icon: '🏆' },
        { id: 'classLog', label: '班级日志', icon: '📓' },
        { id: 'album', label: '班级相册', icon: '🖼️' },
        { id: 'seating', label: '座次表', icon: '🪑' },
        { id: 'duty', label: '值日表', icon: '🧹' },
        { id: 'classRecord', label: '课堂记录', icon: '📝' },
      ]},
      { id: 'communication', label: '家校沟通', icon: '💬' },
      { section: '减负工具', items: [
        { id: 'exam', label: '成绩管理', icon: '📊' },
        { id: 'homework', label: '作业管理', icon: '📚' },
        { id: 'templates', label: '模板库', icon: '📋' },
        { id: 'report', label: '周报月报', icon: '📰' },
        { id: 'ppt', label: '班会PPT', icon: '🖥️' },
      ]},
      { id: 'reminders', label: '待办提醒', icon: '🔔' },
    ],
    schedule: {
      days: ['周一', '周二', '周三', '周四', '周五'],
      periods: [
        { id: 1, time: '08:00', label: '第1节' },
        { id: 2, time: '08:55', label: '第2节' },
        { id: 3, time: '10:00', label: '第3节' },
        { id: 4, time: '10:55', label: '第4节' },
        { id: 5, time: '14:00', label: '第5节' },
        { id: 6, time: '14:55', label: '第6节' },
      ],
      courses: [
        { day: 0, period: 1, className: '高一(3)班', subject: '英语', room: '3-201' },
        { day: 2, period: 1, className: '高一(3)班', subject: '英语', room: '3-201' },
        { day: 4, period: 1, className: '高一(3)班', subject: '英语', room: '3-201' },
        { day: 1, period: 2, className: '高一(3)班', subject: '英语', room: '3-207' },
        { day: 3, period: 2, className: '高一(3)班', subject: '英语', room: '3-201' },
        { day: 0, period: 3, className: '高一(1)班', subject: '英语', room: '1-305' },
        { day: 4, period: 3, className: '高一(3)班', subject: '英语', room: '3-201' },
        { day: 3, period: 4, className: '高一(1)班', subject: '英语', room: '1-305' },
        { day: 2, period: 5, className: '高一(2)班', subject: '英语', room: '2-110' },
        { day: 3, period: 6, className: '高一(2)班', subject: '英语', room: '2-110' },
      ]
    },
    students: [
      { id: uid(), name: '张明轩', gender: '男', class: '高一(3)班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zhang', records: [
        { id: uid(), type: 'critic', date: '8月18日', content: '张明轩今天上课迟到了，跟他妈妈沟通了这个问题，后续我们还要跟进' },
        { id: uid(), type: 'critic', date: '8月4日', content: '张明轩今天迟到了' },
        { id: uid(), type: 'praise', date: '8月3日', content: '课堂积极发言，英语口语进步明显' },
        { id: uid(), type: 'chat', date: '7月31日', content: '关于近期学习压力的谈话，学生表示会调整心态' },
      ]},
      { id: uid(), name: '王浩然', gender: '男', class: '高一(3)班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Wang', records: [
        { id: uid(), type: 'praise', date: '8月10日', content: '主动帮助同学解答数学题' },
        { id: uid(), type: 'chat', date: '8月1日', content: '谈心：关于与同桌相处的问题' },
      ]},
      { id: uid(), name: '李思雨', gender: '女', class: '高一(3)班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Li', records: [
        { id: uid(), type: 'praise', date: '8月12日', content: '英语演讲比赛获得二等奖' },
      ]},
      { id: uid(), name: '陈一诺', gender: '女', class: '高一(3)班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Chen', records: [
        { id: uid(), type: 'critic', date: '8月5日', content: '作业未按时完成，已提醒' },
      ]},
    ],
    todos: [
      { id: uid(), title: '关注王浩然课堂状态', level: '低', due: '8月5日', done: false },
      { id: uid(), title: '明天下午开班会', level: '中', due: '8月5日', done: false },
      { id: uid(), title: '提交本月教学计划', level: '中', due: '8月6日', done: false },
      { id: uid(), title: '张明轩迟到问题跟进沟通', level: '中', due: '8月9日', done: false },
    ],
    templates: [
      { id: uid(), category: '评语', title: '学生评语-优秀', content: '{学生姓名}同学本学期表现优异，学习态度端正，成绩稳步提升。课堂参与积极，乐于帮助同学。希望在新的学期中继续保持，争取更大的进步！' },
      { id: uid(), category: '沟通话术', title: '异常情况沟通话术', content: '{家长称呼}您好，我是{学生姓名}的班主任。近期注意到{学生姓名}在校{异常情况描述}，想跟您了解一下孩子在家的境况，共同寻找解决办法。您看什么时间方便通话？' },
      { id: uid(), category: '通知', title: '家长会通知模板', content: '各位家长：您好！兹定于{日期}（{星期}）{时间}召开{年级}家长会，届时将汇报学期学习情况并讨论家校配合事宜。请各位家长准时参加。' },
      { id: uid(), category: '沟通话术', title: '成绩进步沟通话术', content: '您好，我是{学生姓名}的班主任{班主任姓名}。在本次{考试名称}中，{学生姓名}的{科目}成绩取得了明显进步，班级排名第{排名}名。希望继续保持！' },
    ],
    classLogs: [
      { id: uid(), date: '8月20日', content: '今日课堂纪律良好，英语听力练习完成度较高。' },
      { id: uid(), date: '8月19日', content: '班会主题：新学期目标制定，同学们参与度很高。' },
    ],
    communications: [
      { id: uid(), parent: '张明轩妈妈', student: '张明轩', status: '待跟进', content: '迟到问题沟通，需要后续跟进。' },
      { id: uid(), parent: '王浩然爸爸', student: '王浩然', status: '已沟通', content: '课堂状态反馈，家长表示会配合。' },
    ],
    duty: { groupSize: 4, groups: [] },
    homework: [
      { id: uid(), subject: '英语', title: 'Unit 1 单词默写', class: '高一(3)班', due: '8月25日' },
    ],
    scores: [
      { id: uid(), name: '张明轩', subject: '英语', exam: '期中考试', score: 78, class: '高一(3)班' },
      { id: uid(), name: '王浩然', subject: '英语', exam: '期中考试', score: 92, class: '高一(3)班' },
    ],
    album: [],
    seating: { rows: 6, cols: 7, seats: {} },
    reminders: [
      { id: uid(), title: '明天下午开班会', time: '2026-08-25 14:30' },
      { id: uid(), title: '提交本月教学计划', time: '2026-08-25 17:00' },
    ],
    points: defaultPoints(),
    // ===== 成绩分析（两班对比 + 成员预设）=====
    examData: {
      classes: [
        { id: 'c1', name: '初三(1)班', studentNames: [] },
        { id: 'c2', name: '初三(2)班', studentNames: [] },
      ],
      exams: [],          // [{id,name,date,subjects:[]}]
      records: [],        // [{id,examId,classId,studentName,subject,score}]
      subjects: [],       // 全局科目列表
    },
    // ===== 积分折算比例（各维度 × 比例 = 折算分）=====
    convertRatios: { sport: 1, daily: 1, exam: 1, post: 1 },
    // ===== 历史快照（按日期回看积分榜）=====
    snapshots: [],        // [{id,date,type,ranking:[{name,score,conv}]}]
  };
}

// ===================== Points: model =====================
const POINT_DIMS = [
  { id: 'sport', label: '体育打卡', icon: '🏃' },
  { id: 'daily', label: '日常积分', icon: '⭐' },
  { id: 'exam',  label: '考试赋分', icon: '📈' },
  { id: 'post',  label: '任职赋分', icon: '🎖️' },
];
const DIM_STYLE = {
  sport: { bg:'bg-emerald-50', text:'text-emerald-600', bar:'bg-emerald-400', ring:'border-emerald-200' },
  daily: { bg:'bg-amber-50',   text:'text-amber-600',   bar:'bg-amber-400',   ring:'border-amber-200' },
  exam:  { bg:'bg-sky-50',     text:'text-sky-600',     bar:'bg-sky-400',     ring:'border-sky-200' },
  post:  { bg:'bg-violet-50',  text:'text-violet-600',  bar:'bg-violet-400',  ring:'border-violet-200' },
};
function dimLabel(id) { const d = POINT_DIMS.find(x => x.id === id); return d ? d.label : id; }
function dimIcon(id) { const d = POINT_DIMS.find(x => x.id === id); return d ? d.icon : '•'; }
function dimStyle(id) { return DIM_STYLE[id] || DIM_STYLE.daily; }

function defaultPoints() {
  return {
    rules: [
      { id: uid(), dim: 'sport', label: '早锻炼打卡', delta: 2 },
      { id: uid(), dim: 'sport', label: '体育课积极表现', delta: 3 },
      { id: uid(), dim: 'sport', label: '课间操标准', delta: 1 },
      { id: uid(), dim: 'sport', label: '无故缺席锻炼', delta: -3 },
      { id: uid(), dim: 'daily', label: '主动回答问题', delta: 2 },
      { id: uid(), dim: 'daily', label: '帮助同学', delta: 3 },
      { id: uid(), dim: 'daily', label: '卫生打扫认真', delta: 2 },
      { id: uid(), dim: 'daily', label: '作业未交', delta: -3 },
      { id: uid(), dim: 'daily', label: '迟到', delta: -2 },
      { id: uid(), dim: 'daily', label: '违反课堂纪律', delta: -5 },
      { id: uid(), dim: 'exam', label: '班级前10名', delta: 10 },
      { id: uid(), dim: 'exam', label: '成绩显著进步', delta: 8 },
      { id: uid(), dim: 'exam', label: '单科第一/满分', delta: 5 },
      { id: uid(), dim: 'exam', label: '考试退步明显', delta: -3 },
      { id: uid(), dim: 'post', label: '履职尽责（月度）', delta: 5 },
      { id: uid(), dim: 'post', label: '组织活动出色', delta: 5 },
      { id: uid(), dim: 'post', label: '履职不到位', delta: -3 },
    ],
    jobs: [
      { id: uid(), name: '班长', daily: 2 },
      { id: uid(), name: '副班长', daily: 2 },
      { id: uid(), name: '学习委员', daily: 2 },
      { id: uid(), name: '纪律委员', daily: 1.5 },
      { id: uid(), name: '体育委员', daily: 1.5 },
      { id: uid(), name: '卫生委员', daily: 1.5 },
      { id: uid(), name: '语文课代表', daily: 1 },
      { id: uid(), name: '数学课代表', daily: 1 },
      { id: uid(), name: '英语课代表', daily: 1 },
      { id: uid(), name: '小组长', daily: 1 },
    ],
    assigns: [],
    jobStartDate: '2026-01-01',
    logs: [],
  };
}

function migrateState(s) {
  const ds = defaultState();
  // 确保所有顶层字段存在（从旧备份/早期版本导入的数据可能缺少某些模块）
  ['schedule','students','todos','templates','classLogs','communications','duty','homework','scores','album','seating','reminders','classRecords','user','nav','points','examData','convertRatios','snapshots'].forEach(k => {
    if (s[k] == null) s[k] = ds[k];
  });
  const dp = defaultPoints();
  if (!s.points || typeof s.points !== 'object') s.points = dp;
  if (!Array.isArray(s.points.logs)) s.points.logs = [];
  if (!Array.isArray(s.points.rules) || !s.points.rules.length) s.points.rules = dp.rules;
  // 旧版 posts（简化职务）迁移为新版 jobs + assigns + 任职起始日
  if (Array.isArray(s.points.posts)) {
    s.points.jobs = s.points.posts.map(p => ({ id: p.id || uid(), name: p.name || '职务', daily: +p.score || 0 }));
    s.points.assigns = s.points.posts.filter(p => p.studentId).map(p => ({ stuId: p.studentId, jobId: p.id }));
  }
  if (!Array.isArray(s.points.jobs)) s.points.jobs = dp.jobs;
  if (!Array.isArray(s.points.assigns)) s.points.assigns = [];
  if (!s.points.jobStartDate) s.points.jobStartDate = '2026-01-01';
  if (!Array.isArray(s.classRecords)) s.classRecords = [];
  if (!s.user || typeof s.user !== 'object') s.user = { name: '班主任', role: '' };
  // 成绩分析 / 折算 / 快照
  if (!s.examData || typeof s.examData !== 'object') s.examData = { classes: [{id:'c1',name:'初三(1)班',studentNames:[]},{id:'c2',name:'初三(2)班',studentNames:[]}], exams: [], records: [], subjects: [] };
  if (!Array.isArray(s.examData.classes) || !s.examData.classes.length) s.examData.classes = [{id:'c1',name:'初三(1)班',studentNames:[]},{id:'c2',name:'初三(2)班',studentNames:[]}];
  // 旧数据兼容：classes 里若有 students 字段，迁移为 studentNames（旧 students 里可能存的是 {id,name}）
  s.examData.classes.forEach(c => {
    if (Array.isArray(c.students)) {
      c.studentNames = c.students.map(x => typeof x === 'string' ? x : (x && x.name) || '').filter(Boolean);
      delete c.students;
    }
    if (!Array.isArray(c.studentNames)) c.studentNames = [];
  });
  if (!Array.isArray(s.examData.exams)) s.examData.exams = [];
  if (!Array.isArray(s.examData.records)) s.examData.records = [];
  if (!Array.isArray(s.examData.subjects)) s.examData.subjects = [];
  if (!s.convertRatios || typeof s.convertRatios !== 'object') s.convertRatios = { sport: 1, daily: 1, exam: 1, post: 1 };
  ['sport','daily','exam','post'].forEach(k => { if (typeof s.convertRatios[k] !== 'number') s.convertRatios[k] = 1; });
  if (!Array.isArray(s.snapshots)) s.snapshots = [];
  // 学生补全 alias 字段
  if (Array.isArray(s.students)) s.students.forEach(st => { if (st && typeof st.alias === 'undefined') st.alias = ''; });
  // 导航若为旧版本（无积分管理），用最新导航覆盖（导航非用户数据）
  if (!JSON.stringify(s.nav || []).includes('"points"')) s.nav = defaultState().nav;
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.schedule && parsed.students) return migrateState(parsed);
    }
  } catch (e) { console.warn('load failed', e); }
  const s = defaultState();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  return s;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { alert('保存失败，可能是本地存储空间已满（相册图片过多）。' + e.message); }
  pushSync();
}

let state = loadState();
let currentRoute = 'home';

// ===================== Helpers =====================
const now = new Date();
const todayIndex = (now.getDay() + 6) % 7; // Mon=0 ... Fri=4
const todayLabel = (now.getMonth() + 1) + '月' + now.getDate() + '日';
function formatDate(d) {
  const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${days[d.getDay()]}`;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function navigate(route) {
  currentRoute = route; render();
  const app = document.getElementById('app');
  if (app && app.classList.contains('nav-open')) {
    app.classList.remove('nav-open');
    const bd = document.querySelector('.menu-backdrop');
    if (bd) bd.classList.remove('show');
  }
}

function attachSidebarEvents() {
  document.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.route));
  });
}

// ===================== Theme / Mobile / Undo =====================
let theme = localStorage.getItem('ct_theme') || 'light';
let lastRecordContent = '';
let lastScoreSubject = '';
let lastScoreExam = '';

function applyTheme() {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const tg = document.getElementById('themeToggle');
  if (tg) tg.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('ct_theme', theme);
  applyTheme();
}
function toggleSidebar() {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.toggle('nav-open');
  const bd = document.querySelector('.menu-backdrop');
  if (bd) bd.classList.toggle('show', app.classList.contains('nav-open'));
}

// 全局撤销
let lastUndo = null, undoTimer = null;
function recordUndo(label, restore) {
  lastUndo = { label, restore };
  const root = document.getElementById('undo-root');
  if (root) root.innerHTML = `<div class="undo-toast">已删除「${esc(label)}」 <button onclick="doUndo()">撤销</button></div>`;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { if (root) root.innerHTML = ''; lastUndo = null; }, 6000);
}
function doUndo() {
  clearTimeout(undoTimer);
  const root = document.getElementById('undo-root');
  if (root) root.innerHTML = '';
  if (lastUndo) { const r = lastUndo.restore; lastUndo = null; r(); }
}
function doDelete(get, id, label, after) {
  const arr = get();
  const idx = arr.findIndex(x => x.id === id);
  if (idx < 0) return;
  const removed = arr[idx];
  arr.splice(idx, 1);
  save();
  recordUndo(label || '项目', () => {
    const a = get();
    a.splice(Math.min(idx, a.length), 0, removed);
    save();
    after ? after() : render();
  });
  after ? after() : render();
}

// ===================== 批量导入（学生 / 成绩） =====================
function parseCSV(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    .map(l => l.split(/[,，\t]/).map(c => c.trim()));
}
function bindFileToText(fileId, textId) {
  const f = document.getElementById(fileId);
  if (!f) return;
  f.addEventListener('change', () => {
    const file = f.files[0];
    if (!file) return;
    const t = document.getElementById(textId);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isExcel = ['xlsx','xls'].includes(ext);
    if (isExcel) {
      if (typeof XLSX === 'undefined') {
        alert('Excel 解析库尚未加载，请刷新页面后再试');
        return;
      }
      const r = new FileReader();
      r.onload = e => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(firstSheet, { FS: ',', RS: '\n' });
          if (t) t.value = csv;
        } catch (err) {
          alert('解析 Excel 失败：' + (err && err.message ? err.message : '未知错误'));
        }
      };
      r.readAsArrayBuffer(file);
      return;
    }
    const r = new FileReader();
    r.onload = e => { if (t) t.value = e.target.result; };
    r.readAsText(file);
  });
}
function openImportStudents() {
  openModal('批量导入学生', `
    <div class="space-y-4">
      <p class="text-sm text-gray-500 leading-relaxed">支持粘贴、上传 CSV 文本，或直接上传 Excel 文件。每行一个学生，用英文逗号或制表符分隔：<br><code>姓名,性别,班级</code>（性别、班级可留空）。首行若是标题则自动跳过。</p>
      <textarea id="impStudentText" rows="8" class="w-full border rounded-lg p-3 text-sm" placeholder="张明轩,男,高一(3)班&#10;王浩然,男,高一(3)班"></textarea>
      <div><input id="impStudentFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm"></div>
      <div class="flex gap-3">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('impStudentText').value='姓名,性别,班级\\n张明轩,男,高一(3)班\\n王浩然,男,高一(3)班'">填入示例</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doImportStudents()">导入</button>
      </div>
    </div>`, 'lg');
  bindFileToText('impStudentFile', 'impStudentText');
}
function doImportStudents() {
  const text = document.getElementById('impStudentText').value.trim();
  if (!text) return alert('请粘贴或上传学生数据');
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /姓名|name|学生/i.test(rows[0][0])) start = 1;
  let n = 0;
  for (let i = start; i < rows.length; i++) {
    const name = rows[i][0]; if (!name) continue;
    const gender = rows[i][1] || '未设置';
    const cls = rows[i][2] || '';
    const avatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(name);
    state.students.push({ id: uid(), name, gender, class: cls, avatar, records: [] });
    n++;
  }
  if (!n) return alert('没有解析到有效学生，请检查格式');
  save(); closeModal(); render();
  alert('成功导入 ' + n + ' 名学生');
}
function openImportScores() {
  openModal('批量导入成绩', `
    <div class="space-y-4">
      <p class="text-sm text-gray-500 leading-relaxed">支持粘贴、上传 CSV 文本，或直接上传 Excel 文件。每行一条：<code>姓名,班级,科目,考试,分数</code>。首行标题自动跳过。</p>
      <textarea id="impScoreText" rows="8" class="w-full border rounded-lg p-3 text-sm" placeholder="张明轩,高一(3)班,英语,期中考试,78"></textarea>
      <div><input id="impScoreFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm"></div>
      <div class="flex gap-3">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('impScoreText').value='姓名,班级,科目,考试,分数\\n张明轩,高一(3)班,英语,期中考试,78\\n王浩然,高一(3)班,英语,期中考试,92'">填入示例</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doImportScores()">导入</button>
      </div>
    </div>`, 'lg');
  bindFileToText('impScoreFile', 'impScoreText');
}
function doImportScores() {
  const text = document.getElementById('impScoreText').value.trim();
  if (!text) return alert('请粘贴或上传成绩数据');
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /姓名|name|学生/i.test(rows[0][0])) start = 1;
  let n = 0;
  for (let i = start; i < rows.length; i++) {
    const name = rows[i][0]; if (!name) continue;
    const score = parseFloat(rows[i][4]);
    if (isNaN(score)) continue;
    state.scores.unshift({ id: uid(), name, class: rows[i][1] || '', subject: rows[i][2] || '英语', exam: rows[i][3] || '考试', score });
    n++;
  }
  if (!n) return alert('没有解析到有效成绩，请检查格式');
  save(); closeModal(); render();
  alert('成功导入 ' + n + ' 条成绩');
}

// ===================== 首次使用引导 =====================
let onboarded = localStorage.getItem('ct_onboarded');
function maybeOnboard() {
  if (onboarded) return;
  openModal('欢迎使用班主任工作台 👋', `
    <div class="space-y-4">
      <p class="text-sm text-gray-600 leading-relaxed">这是一个完全本地运行的班主任工作台，数据保存在你的浏览器里（刷新不丢）。跟着下面几步，几分钟就能用起来：</p>
      <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-700">
        <li>左下角「清空数据」清除示例，换成你的真实班级</li>
        <li>「学生管理 → 新建学生 / 批量导入」录入全班</li>
        <li>「课程表 → 设置节次 / 添加课程」排好课</li>
        <li>「积分管理 → ⚙️规则 / 🎖️职务」按你们班标准配置</li>
        <li>日常用右下角 ✏️ 快速记录，数据随时「导出」备份</li>
      </ol>
      <div class="flex gap-3 pt-2">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal(); clearAllData(); finishOnboard()">清空示例并开始</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="finishOnboard()">我先看看</button>
      </div>
    </div>`, 'md');
}
function finishOnboard() { onboarded = '1'; localStorage.setItem('ct_onboarded', '1'); closeModal(); }



// ===================== Render =====================
function render() {
  const app = document.getElementById('app');
  const nav = app && app.querySelector('aside nav');
  const savedScrollTop = nav ? nav.scrollTop : 0;
  app.innerHTML = `
    ${renderSidebar()}
    <main class="flex-1 flex flex-col h-full overflow-hidden relative">
      ${renderTopBar()}
      <div class="flex-1 overflow-auto p-6 pb-24" id="main-content">
        ${renderPage()}
      </div>
      ${renderFab()}
    </main>`;
  attachSidebarEvents();
  const newNav = app.querySelector('aside nav');
  if (newNav) newNav.scrollTop = savedScrollTop;
  if (currentRoute === 'schedule') {
    const btnP = document.querySelector('[data-periods]');
    if (btnP) btnP.addEventListener('click', openPeriodSetting);
    const btnA = document.querySelector('[data-addcourse]');
    if (btnA) btnA.addEventListener('click', openCourseModal);
  }
  if (currentRoute === 'home') {
    const b = document.querySelector('[data-home-new]');
    if (b) b.addEventListener('click', openFabDefault);
  }
  if (currentRoute === 'students') {
    const b = document.querySelector('[data-newstudent]');
    if (b) b.addEventListener('click', openStudentForm);
  }
  if (currentRoute === 'templates') {
    const b = document.querySelector('[data-newtemplate]');
    if (b) b.addEventListener('click', () => openTemplateForm(null));
  }
  if (currentRoute === 'classLog') {
    const b = document.querySelector('[data-newlog]');
    if (b) b.addEventListener('click', openClassLogForm);
  }
  if (currentRoute === 'communication') {
    const b = document.querySelector('[data-newcomm]');
    if (b) b.addEventListener('click', openCommForm);
  }
  if (currentRoute === 'homework') {
    const b = document.querySelector('[data-newhw]');
    if (b) b.addEventListener('click', openHomeworkForm);
  }
  if (currentRoute === 'scores') {
    const b = document.querySelector('[data-newscore]');
    if (b) b.addEventListener('click', openScoreForm);
  }
  if (currentRoute === 'reminders') {
    const b = document.querySelector('[data-newreminder]');
    if (b) b.addEventListener('click', openReminderForm);
  }
  applyTheme();
}

function renderSidebar() {
  const buildItem = (item) => {
    const active = currentRoute === item.id ? 'active' : '';
    return `<div class="sidebar-item ${active} flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer text-sm" data-route="${item.id}">
      <span class="text-base">${item.icon}</span>
      <span class="font-medium">${item.label}</span>
    </div>`;
  };
  let itemsHtml = '';
  state.nav.forEach(group => {
    if (group.section && group.items) {
      itemsHtml += `<div class="mt-4 mb-2 px-4 text-xs text-gray-400 font-medium">${group.section}</div>`;
      itemsHtml += group.items.map(buildItem).join('');
    } else if (group.id) {
      itemsHtml += buildItem(group);
    }
  });
  return `
    <aside class="w-64 bg-white h-full flex flex-col shadow-sm z-10">
      <div class="p-6 flex items-center gap-3 cursor-pointer group" onclick="openUserForm()" title="点击修改基础信息">
        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl group-hover:scale-105 transition">👩‍🏫</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-gray-800 truncate">${esc(state.user.name)}的工作台</div>
          <div class="text-xs text-gray-500 truncate">${esc(state.user.role)}</div>
        </div>
        <div class="opacity-0 group-hover:opacity-100 text-gray-400 text-xs">✏️</div>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-hide">
        ${itemsHtml}
      </nav>
      <div class="p-4 border-t space-y-2">
        <div class="text-xs text-gray-400">${formatDate(now)}</div>
        <div class="grid grid-cols-2 gap-2">
          <button class="text-xs border rounded py-1.5 hover:bg-gray-50" onclick="maybeOnboard()">❓ 使用引导</button>
          <button class="text-xs border rounded py-1.5 hover:bg-gray-50" onclick="openSettings()">⚙️ 设置</button>
        </div>
      </div>
    </aside>`;
}

function openUserForm() {
  openModal('基础信息', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">称呼/姓名</label><input id="uName" class="w-full border rounded-lg p-2.5 text-sm" value="${esc(state.user.name)}" placeholder="如：Claire"></div>
      <div><label class="block text-xs text-gray-500 mb-1">身份/学科</label><input id="uRole" class="w-full border rounded-lg p-2.5 text-sm" value="${esc(state.user.role)}" placeholder="如：英语 · 班主任"></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveUser()">保存</button>
    </div>`);
}
function saveUser() {
  const name = document.getElementById('uName').value.trim();
  const role = document.getElementById('uRole').value.trim();
  state.user = { name: name || '班主任', role };
  save(); closeModal(); render();
}

function renderTopBar() {
  const titles = {
    home: '工作台首页', schedule: '课程表', students: '学生管理', classLog: '班级日志',
    album: '班级相册', seating: '座次表', duty: '值日表', classRecord: '课堂记录',
    communication: '家校沟通', homework: '作业管理', templates: '模板库',
    report: '周报月报', ppt: '班会PPT', reminders: '待办提醒', points: '积分管理', exam: '成绩管理',
  };
  const menuBtn = `<button id="menuBtn" onclick="toggleSidebar()" class="mr-3 text-xl text-gray-600" title="菜单">☰</button>`;
  const themeBtn = `<button id="themeToggle" onclick="toggleTheme()" class="ml-3 text-lg" title="切换深色模式">🌙</button>`;
  const syncBadge = `<span id="sync-badge" class="text-[11px] text-gray-400 mr-1"></span>`;
  const logoutBtn = `<button onclick="doLogout()" class="ml-2 text-lg" title="退出登录">🚪</button>`;
  let extra = '';
  if (currentRoute === 'points') {
    return `<header class="bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      ${menuBtn}<h1 class="text-lg font-bold text-gray-800">积分管理</h1>
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtJobs()">🎖️ 职务</button>
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtRules()">⚙️ 规则</button>
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtLogs()">📜 日志</button>
        <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openPtBatch()">批量加减分</button>
        <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openPtAdjust(null,'daily',1)">+ 加减分</button>
        ${syncBadge}${themeBtn}${logoutBtn}
      </div>
    </header>`;
  }
  if (currentRoute === 'home') extra = `<button data-home-new class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5">+ 快速记录</button>`;
  else if (currentRoute === 'schedule') extra = `<button data-periods class="text-sm text-gray-500 hover:text-primary mr-2">⚙️ 设置节次</button><button data-addcourse class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark">+ 添加课程</button>`;
  else if (['students','templates','classLog','communication','homework','scores','reminders'].includes(currentRoute)) {
    const labels = { students:'+ 新建学生', templates:'+ 新建模板', classLog:'+ 写日志', communication:'+ 新增沟通', homework:'+ 布置作业', scores:'+ 录成绩', reminders:'+ 新建提醒' };
    const data = { students:'data-newstudent', templates:'data-newtemplate', classLog:'data-newlog', communication:'data-newcomm', homework:'data-newhw', scores:'data-newscore', reminders:'data-newreminder' };
    let importBtn = '';
    if (currentRoute === 'students') importBtn = `<button class="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full hover:bg-gray-50 mr-2" onclick="openImportStudents()">⬆️ 批量导入</button>`;
    if (currentRoute === 'scores') importBtn = `<button class="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full hover:bg-gray-50 mr-2" onclick="openImportScores()">⬆️ 批量导入</button>`;
    extra = importBtn + `<button ${data[currentRoute]} class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5">${labels[currentRoute]}</button>`;
  }
  return `<header class="bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
    ${menuBtn}<h1 class="text-lg font-bold text-gray-800">${titles[currentRoute] || '工作台'}</h1>
    <div class="flex items-center gap-3">${extra}${syncBadge}${themeBtn}${logoutBtn}</div>
  </header>`;
}

function renderFab() {
  return `<button class="fab absolute bottom-6 right-6 w-12 h-12 rounded-full text-white flex items-center justify-center text-xl hover:scale-105 transition" onclick="openFabDefault()" title="快速记录">✏️</button>`;
}

function renderPage() {
  const map = {
    home: renderHome, schedule: renderSchedule, students: renderStudents, classLog: renderClassLog,
    album: renderAlbum, seating: renderSeating, duty: renderDuty, classRecord: renderClassRecord,
    communication: renderCommunication, scores: renderExam, homework: renderHomework,
    templates: renderTemplates, report: renderReport, ppt: renderPPT, reminders: renderReminders,
    points: renderPoints, exam: renderExam,
  };
  return (map[currentRoute] || renderHome)();
}

// ===================== Home =====================
function renderHome() {
  const todayCourses = state.schedule.courses.filter(c => c.day === todayIndex).sort((a,b)=>a.period-b.period);
  const dutyToday = getDutyForDay(todayIndex);
  return `
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-12 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">🧹 今日值日</div>
        <button class="text-xs text-gray-400 hover:text-primary" onclick="navigate('duty')">去设置 →</button>
      </div>
      ${dutyToday.length ? `<div class="flex flex-wrap gap-2">${dutyToday.map(n=>`<span class="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">${esc(n)}</span>`).join('')}</div>` : `<div class="text-sm text-gray-500">还没有设置值日分组，点「去设置」按每组人数自动排班。</div>`}
    </div>
    ${renderHomePointsCard()}
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">📚 今日课程</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('schedule')">课程表</button>
      </div>
      <div class="space-y-3">
        ${todayCourses.length ? todayCourses.map(c => `
          <div class="flex items-start gap-3 p-3 rounded-xl course-card cursor-pointer" onclick="editCourse(${c.day},${c.period})">
            <div class="text-center min-w-[3rem]">
              <div class="text-xs font-bold text-primary">第${c.period}节</div>
              <div class="text-xs text-gray-500">${state.schedule.periods.find(p=>p.id===c.period)?.time}</div>
            </div>
            <div><div class="font-bold text-gray-800">${esc(c.className)} · ${esc(c.subject)}</div><div class="text-xs text-gray-500">📍 ${esc(c.room)}</div></div>
          </div>`).join('') : '<div class="text-sm text-gray-400">今天没有课程安排</div>'}
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">🔔 待办事项</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('reminders')">查看全部</button>
      </div>
      <div class="space-y-3">
        ${state.todos.slice(0,5).map(t => `
          <div class="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
            <input type="checkbox" class="mt-1 w-4 h-4 accent-primary" ${t.done?'checked':''} onchange="toggleTodo('${t.id}')">
            <div class="flex-1"><div class="text-sm ${t.done?'line-through text-gray-400':'text-gray-700'}">${esc(t.title)}</div>
            <div class="flex gap-2 mt-1"><span class="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">${esc(t.level)}</span><span class="text-[10px] text-gray-400">${esc(t.due)}</span></div></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">📝 最近班级日志</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('classLog')">查看全部</button>
      </div>
      <div class="space-y-3">
        ${state.classLogs.slice(0,2).map(l => `<div class="p-3 rounded-xl bg-gray-50 text-sm"><div class="text-xs text-gray-400 mb-1">${esc(l.date)}</div><div class="text-gray-700">${esc(l.content)}</div></div>`).join('')}
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">💬 待跟进沟通</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('communication')">查看全部</button>
      </div>
      <div class="space-y-3">
        ${state.communications.filter(c=>c.status==='待跟进').slice(0,2).map(c => `<div class="p-3 rounded-xl bg-gray-50 text-sm"><div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(c.student)} · ${esc(c.parent)}</span><span class="text-xs text-red-500">${esc(c.status)}</span></div><div class="text-gray-600 text-xs">${esc(c.content)}</div></div>`).join('')}
      </div>
    </div>
  </div>`;
}

// ===================== Schedule =====================
function renderSchedule() {
  return `
  <div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[700px] border-collapse">
        <thead><tr>
          <th class="p-3 text-sm font-medium text-gray-500 bg-primaryLight/30 rounded-tl-lg">节次</th>
          ${state.schedule.days.map((d,i) => `<th class="p-3 text-sm font-medium ${i===todayIndex?'bg-primary text-white':'bg-primaryLight/30 text-gray-600'}">${d}${i===todayIndex?'<div class="text-[10px] opacity-80">今天</div>':''}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${state.schedule.periods.map(p => `
            <tr>
              <td class="p-3 text-center text-sm text-gray-500 bg-gray-50 border-b"><div>第${p.id}节</div><div class="text-xs text-gray-400">${p.time}</div></td>
              ${[0,1,2,3,4].map(d => renderScheduleCell(d, p.id)).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
function renderScheduleCell(day, period) {
  const course = state.schedule.courses.find(c => c.day === day && c.period === period);
  const isToday = day === todayIndex;
  if (course) {
    return `<td class="p-2 border-b ${isToday?'bg-primary/5':''}"><div class="course-card p-3 rounded-lg cursor-pointer hover:shadow transition" onclick="editCourse(${day},${period})"><div class="font-bold text-primary text-sm">${esc(course.className)}</div><div class="text-xs text-gray-600">${esc(course.subject)}</div><div class="text-[10px] text-gray-400 mt-1">${esc(course.room)}</div></div></td>`;
  }
  return `<td class="p-2 border-b ${isToday?'bg-primary/5':''} empty-cell" onclick="addCourseTo(${day},${period})"><div class="h-full min-h-[70px] flex items-center justify-center text-gray-300 text-xl">+</div></td>`;
}

let editingCourse = null;
function openCourseModal() { editingCourse = null; renderCourseForm(); }
function addCourseTo(day, period) { editingCourse = { day, period }; renderCourseForm(); }
function editCourse(day, period) {
  const c = state.schedule.courses.find(x => x.day===day && x.period===period);
  editingCourse = { ...c }; renderCourseForm();
}
function renderCourseForm() {
  const c = editingCourse || { day: 0, period: 1, className: '', subject: '', room: '' };
  const isEdit = editingCourse && editingCourse.className;
  openModal(isEdit ? '编辑课程' : '添加课程', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">星期</label><select id="courseDay" class="w-full border rounded-lg p-2 text-sm">${state.schedule.days.map((d,i)=>`<option value="${i}" ${c.day===i?'selected':''}>${d}</option>`).join('')}</select></div>
        <div><label class="block text-xs text-gray-500 mb-1">节次</label><select id="coursePeriod" class="w-full border rounded-lg p-2 text-sm">${state.schedule.periods.map(p=>`<option value="${p.id}" ${c.period===p.id?'selected':''}>第${p.id}节</option>`).join('')}</select></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="courseClass" class="w-full border rounded-lg p-2 text-sm" value="${esc(c.className)}" placeholder="如：高一(3)班"></div>
      <div><label class="block text-xs text-gray-500 mb-1">科目</label><input id="courseSubject" class="w-full border rounded-lg p-2 text-sm" value="${esc(c.subject)}" placeholder="如：英语"></div>
      <div><label class="block text-xs text-gray-500 mb-1">教室</label><input id="courseRoom" class="w-full border rounded-lg p-2 text-sm" value="${esc(c.room)}" placeholder="如：3-201"></div>
      <div class="flex gap-3">
        ${isEdit?`<button class="flex-1 border border-red-200 text-red-500 py-2 rounded-full hover:bg-red-50" onclick="removeCourse()">删除</button>`:''}
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveCourse()">保存</button>
      </div>
    </div>`);
}
function saveCourse() {
  const day = +document.getElementById('courseDay').value;
  const period = +document.getElementById('coursePeriod').value;
  const className = document.getElementById('courseClass').value.trim();
  const subject = document.getElementById('courseSubject').value.trim();
  const room = document.getElementById('courseRoom').value.trim();
  if(!className||!subject) return alert('请填写班级和科目');
  state.schedule.courses = state.schedule.courses.filter(c => !(c.day===day && c.period===period));
  state.schedule.courses.push({ day, period, className, subject, room });
  save(); closeModal(); render();
}
function removeCourse() {
  const day = editingCourse.day, period = editingCourse.period;
  state.schedule.courses = state.schedule.courses.filter(c => !(c.day===day && c.period===period));
  save(); closeModal(); render();
}
function openPeriodSetting() {
  openModal('设置节次', `
    <div class="space-y-3">
      <p class="text-sm text-gray-500">当前共 ${state.schedule.periods.length} 节课。可添加或删除节次。</p>
      <div id="periodList" class="space-y-2">
        ${state.schedule.periods.map(p => `<div class="flex gap-2 items-center"><input class="flex-1 border rounded p-1.5 text-sm" value="第${p.id}节" data-pid="${p.id}" data-field="label"><input class="w-24 border rounded p-1.5 text-sm" value="${p.time}" data-pid="${p.id}" data-field="time"><button class="text-red-500 text-sm" onclick="removePeriod(${p.id})">删除</button></div>`).join('')}
      </div>
      <button class="w-full border border-dashed border-gray-300 rounded py-2 text-sm text-gray-500 hover:border-primary hover:text-primary" onclick="addPeriod()">+ 添加节次</button>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="savePeriods()">保存</button>
    </div>`);
}
function addPeriod() {
  const list = document.getElementById('periodList');
  const nextId = state.schedule.periods.length + 1;
  const div = document.createElement('div');
  div.className = 'flex gap-2 items-center';
  div.innerHTML = `<input class="flex-1 border rounded p-1.5 text-sm" value="第${nextId}节" data-pid="${nextId}" data-field="label"><input class="w-24 border rounded p-1.5 text-sm" value="--:--" data-pid="${nextId}" data-field="time"><button class="text-red-500 text-sm" onclick="removePeriod(${nextId})">删除</button>`;
  list.appendChild(div);
}
function removePeriod(pid) {
  const el = document.querySelector('[data-pid="'+pid+'"][data-field="label"]');
  if(el && el.parentElement) el.parentElement.remove();
}
function savePeriods() {
  const inputs = document.querySelectorAll('#periodList input');
  const map = {};
  inputs.forEach(inp => {
    const pid = inp.dataset.pid, field = inp.dataset.field;
    if(!map[pid]) map[pid] = { id: parseInt(pid) };
    map[pid][field] = inp.value.trim();
  });
  const periods = Object.values(map).sort((a,b)=>a.id-b.id).map(p=>({ id: p.id, label: p.label, time: p.time }));
  if(periods.length) { state.schedule.periods = periods; save(); }
  closeModal(); render();
}

// ===================== Students =====================
function renderStudents() {
  return `
  <div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      ${state.students.map(s => `
        <div class="p-4 rounded-2xl bg-gray-50 hover:bg-primary/5 transition cursor-pointer border border-transparent hover:border-primary/20" onclick="openStudentProfile('${s.id}')">
          <div class="flex items-center gap-3">
            <img src="${esc(s.avatar)}" class="w-12 h-12 rounded-full bg-white shadow-sm" alt="">
            <div><div class="font-bold text-gray-800">${esc(s.name)}</div><div class="text-xs text-gray-500">${esc(s.class)}</div></div>
          </div>
          <div class="flex gap-2 mt-4 flex-wrap">
            ${s.records.slice(0,3).map(r => `<span class="text-[10px] px-2 py-0.5 rounded-full ${r.type==='critic'?'tag-critic':r.type==='praise'?'tag-praise':'tag-chat'}">${r.type==='critic'?'批评':r.type==='praise'?'表扬':'谈心'}</span>`).join('')}
            ${s.records.length>3?`<span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">+${s.records.length-1}</span>`:''}
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}
function openStudentForm(id) {
  const s = id ? state.students.find(x=>x.id===id) : null;
  openModal(s ? '编辑学生' : '新建学生', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">姓名</label><input id="stName" class="w-full border rounded-lg p-2 text-sm" value="${esc(s? s.name:'')}"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">性别</label><select id="stGender" class="w-full border rounded-lg p-2 text-sm"><option ${s&&s.gender==='男'?'selected':''}>男</option><option ${s&&s.gender==='女'?'selected':''}>女</option></select></div>
        <div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="stClass" class="w-full border rounded-lg p-2 text-sm" value="${esc(s? s.class:'')}" placeholder="如：高一(3)班"></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">头像（可选，留空随机生成）</label><input id="stAvatar" class="w-full border rounded-lg p-2 text-sm" value="${esc(s? s.avatar:'')}" placeholder="图片链接，留空自动生成"></div>
      <div><label class="block text-xs text-gray-500 mb-1">昵称/别称（可选，用于快速记录识别，多个用空格隔开）</label><input id="stAlias" class="w-full border rounded-lg p-2 text-sm" value="${esc(s? s.alias:'')}" placeholder="如：小明 明明"></div>
      <div class="flex gap-3">
        ${s?`<button class="flex-1 border border-red-200 text-red-500 py-2 rounded-full hover:bg-red-50" onclick="deleteStudent('${s.id}')">删除</button>`:''}
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveStudent(${s? `'${s.id}'`:'null'})">保存</button>
      </div>
    </div>`);
}
function saveStudent(id) {
  const name = document.getElementById('stName').value.trim();
  if(!name) return alert('请输入姓名');
  const gender = document.getElementById('stGender').value;
  const cls = document.getElementById('stClass').value.trim() || '未分班';
  let avatar = document.getElementById('stAvatar').value.trim();
  if(!avatar) avatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(name);
  const alias = document.getElementById('stAlias').value.trim();
  if(id) {
    const s = state.students.find(x=>x.id===id);
    Object.assign(s, { name, gender, class: cls, avatar, alias });
  } else {
    state.students.push({ id: uid(), name, gender, class: cls, avatar, alias, records: [] });
  }
  save(); closeModal(); render();
}
function deleteStudent(id) {
  const s = state.students.find(x=>x.id===id);
  if(!s) return;
  confirmModal('确定删除学生「' + s.name + '」吗？相关行为记录也会一并删除。', function(){
    doDelete(()=>state.students, id, s.name, () => { closeModal(); render(); });
  });
}
function openStudentProfile(id) {
  const s = state.students.find(x=>x.id===id);
  if(!s) return;
  openModal(`${esc(s.name)} · 学生档案`, `
    <div class="space-y-4">
      <div class="flex items-center gap-4 mb-2">
        <img src="${esc(s.avatar)}" class="w-16 h-16 rounded-full bg-gray-100" alt="">
        <div class="flex-1"><div class="font-bold text-lg">${esc(s.name)}</div><div class="text-sm text-gray-500">${esc(s.class)} · ${esc(s.gender)}</div></div>
        <div class="text-right cursor-pointer" onclick="closeModal(); openPtStudent('${s.id}')" title="查看积分详情">
          <div class="text-2xl font-bold text-primary">${fmtScore(ptTotal(s.id))}</div><div class="text-[10px] text-gray-400">总积分 ›</div>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-2">
        ${POINT_DIMS.map(d => { const st = dimStyle(d.id);
          return `<div class="rounded-lg py-2 text-center ${st.bg}"><div class="text-[10px] ${st.text}">${d.icon} ${d.label}</div><div class="text-base font-bold ${st.text}">${fmtScore(ptDimScore(s.id, d.id))}</div></div>`; }).join('')}
      </div>
      <div class="flex gap-2">
        <button class="flex-1 bg-red-50 text-red-500 py-1.5 rounded-full text-xs hover:bg-red-100" onclick="closeModal(); openPtAdjust('${s.id}','daily',1)">＋ 加分</button>
        <button class="flex-1 bg-emerald-50 text-emerald-600 py-1.5 rounded-full text-xs hover:bg-emerald-100" onclick="closeModal(); openPtAdjust('${s.id}','daily',-1)">－ 扣分</button>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <span class="px-3 py-1 rounded-full bg-primary text-white text-xs">行为记录</span>
        <span class="text-xs text-gray-400">共 ${s.records.length} 条</span>
      </div>
      <div class="space-y-3 max-h-72 overflow-y-auto">
        ${s.records.length ? s.records.map(r => `
          <div class="flex gap-3 p-3 rounded-xl bg-gray-50">
            <div class="mt-0.5 text-lg">${r.type==='critic'?'⚠️':r.type==='praise'?'👍':'💬'}</div>
            <div class="flex-1"><div class="text-sm text-gray-700">${esc(r.content)}</div>
            <div class="flex items-center gap-2 mt-1.5"><span class="text-[10px] px-1.5 py-0.5 rounded ${r.type==='critic'?'tag-critic':r.type==='praise'?'tag-praise':'tag-chat'}">${r.type==='critic'?'批评':r.type==='praise'?'表扬':'谈心'}</span><span class="text-[10px] text-gray-400">${esc(r.date)}</span></div></div>
            <button class="text-gray-300 hover:text-red-500" onclick="deleteRecord('${s.id}','${r.id}')">🗑️</button>
          </div>`).join('') : '<div class="text-sm text-gray-400">暂无行为记录</div>'}
      </div>
      <div class="flex gap-3 pt-4 border-t">
        <button class="flex-1 bg-primary text-white py-2 rounded-full text-sm hover:bg-primaryDark" onclick="openRecordForm('${s.id}')">+ 添加记录</button>
        <button class="flex-1 border border-gray-300 py-2 rounded-full text-sm hover:bg-gray-50" onclick="openStudentForm('${s.id}')">✏️ 编辑信息</button>
      </div>
    </div>`, 'lg');
}
let recordType = 'praise';
function openRecordForm(id) {
  const tplOpts = state.templates.map(t => `<option value="${t.id}">${esc(t.category)} · ${esc(t.title)}</option>`).join('');
  openModal('添加行为记录', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">记录类型</label>
        <div class="flex gap-2">
          <button type="button" class="rec-type-btn flex-1 py-2 rounded-lg border text-sm" data-type="critic" onclick="pickRecordType(this)">批评</button>
          <button type="button" class="rec-type-btn flex-1 py-2 rounded-lg border text-sm" data-type="praise" onclick="pickRecordType(this)">表扬</button>
          <button type="button" class="rec-type-btn flex-1 py-2 rounded-lg border text-sm" data-type="chat" onclick="pickRecordType(this)">谈心</button>
        </div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">日期</label><input id="recDate" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
      <div><label class="block text-xs text-gray-500 mb-1">模板（可选，点击套用）</label>
        <select id="recTmpl" class="w-full border rounded-lg p-2 text-sm" onchange="applyRecTmpl(this.value)">
          <option value="">— 不使用模板 —</option>${tplOpts}
        </select>
      </div>
      <div class="flex items-center justify-between"><label class="block text-xs text-gray-500">记录内容</label>${lastRecordContent ? `<button class="text-xs text-primary hover:underline" onclick="pasteLastRecord()">粘贴上次内容</button>` : ''}</div>
      <textarea id="recContent" rows="4" class="w-full border rounded-lg p-3 text-sm">${esc(lastRecordContent)}</textarea>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveRecord('${id}')">保存记录</button>
    </div>`);
  setTimeout(() => { const b = document.querySelector('.rec-type-btn[data-type="praise"]'); if(b) pickRecordType(b); }, 0);
}
function applyRecTmpl(tid) {
  if (!tid) return;
  const t = state.templates.find(x => x.id === tid);
  if (!t) return;
  const ta = document.getElementById('recContent');
  if (ta) ta.value = t.content;
}
function pasteLastRecord() {
  const ta = document.getElementById('recContent');
  if (ta) ta.value = lastRecordContent;
}
function pickRecordType(btn) {
  document.querySelectorAll('.rec-type-btn').forEach(b=>{b.classList.remove('bg-primary','text-white'); b.classList.add('border-gray-200');});
  btn.classList.add('bg-primary','text-white'); btn.classList.remove('border-gray-200');
  recordType = btn.dataset.type;
}
function saveRecord(id) {
  const content = document.getElementById('recContent').value.trim();
  const date = document.getElementById('recDate').value.trim() || todayLabel;
  if(!content) return alert('请输入记录内容');
  lastRecordContent = content;
  const s = state.students.find(x=>x.id===id);
  s.records.unshift({ id: uid(), type: recordType, date, content });
  save(); closeModal(); openStudentProfile(id);
}
function deleteRecord(sid, rid) {
  const s = state.students.find(x=>x.id===sid);
  if(!s) return;
  doDelete(()=>s.records, rid, '记录', () => openStudentProfile(sid));
}

// ===================== Templates =====================
function renderTemplates() {
  return `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
    ${state.templates.map(t => `
      <div class="bg-white rounded-2xl p-5 card-hover relative group">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">${esc(t.category)}</span>
          <div class="flex gap-2">
            <button class="text-lg hover:text-primary" onclick="openTemplateForm('${t.id}')" title="编辑">✏️</button>
            <button class="text-lg hover:text-red-500" onclick="deleteTemplate('${t.id}')" title="删除">🗑️</button>
          </div>
        </div>
        <h3 class="font-bold text-gray-800 mb-2">${esc(t.title)}</h3>
        <p class="text-sm text-gray-500 line-clamp-4 leading-relaxed break-words">${esc(t.content)}</p>
        <button class="mt-3 text-xs text-primary hover:underline" data-c="${esc(t.content)}" onclick="copyText(this.dataset.c)">复制内容</button>
      </div>`).join('')}
  </div>`;
}
function openTemplateForm(id) {
  const t = id ? state.templates.find(x=>x.id===id) : null;
  openModal(t ? '编辑模板' : '新建模板', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">分类</label><input id="tmplCat" class="w-full border rounded-lg p-2 text-sm" value="${esc(t? t.category:'')}" placeholder="如：评语 / 沟通话术 / 通知"></div>
      <div><label class="block text-xs text-gray-500 mb-1">标题</label><input id="tmplTitle" class="w-full border rounded-lg p-2 text-sm" value="${esc(t? t.title:'')}"></div>
      <div><label class="block text-xs text-gray-500 mb-1">内容（可用 {姓名} 等占位符）</label><textarea id="tmplContent" rows="6" class="w-full border rounded-lg p-2 text-sm">${esc(t? t.content:'')}</textarea></div>
      <div class="flex gap-3">
        ${t?`<button class="flex-1 border border-red-200 text-red-500 py-2 rounded-full hover:bg-red-50" onclick="deleteTemplate('${t.id}')">删除</button>`:''}
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveTemplate(${t? `'${t.id}'`:'null'})">保存</button>
      </div>
    </div>`);
}
function saveTemplate(id) {
  const category = document.getElementById('tmplCat').value.trim() || '未分类';
  const title = document.getElementById('tmplTitle').value.trim();
  const content = document.getElementById('tmplContent').value;
  if(!title) return alert('请输入标题');
  if(id) { const t = state.templates.find(x=>x.id===id); Object.assign(t, { category, title, content }); }
  else { state.templates.push({ id: uid(), category, title, content }); }
  save(); closeModal(); render();
}
function deleteTemplate(id) {
  const t = state.templates.find(x=>x.id===id);
  if(!t) return;
  confirmModal('确定删除模板「' + t.title + '」？', function(){
    doDelete(()=>state.templates, id, t.title);
  });
}
function copyText(text) {
  navigator.clipboard.writeText(text).then(()=>alert('已复制到剪贴板'), ()=>alert('复制失败，请手动选择'));
}

// ===================== Class Log =====================
function renderClassLog() {
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="space-y-4">${state.classLogs.map(l => `
      <div class="p-4 rounded-xl bg-gray-50 border-l-4 border-primary flex justify-between items-start">
        <div><div class="text-xs text-gray-400 mb-1">${esc(l.date)}</div><div class="text-sm text-gray-700">${esc(l.content)}</div></div>
        <button class="text-gray-300 hover:text-red-500" onclick="deleteClassLog('${l.id}')">🗑️</button>
      </div>`).join('')}</div>
  </div>`;
}
function openClassLogForm() {
  openModal('写班级日志', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">日期</label><input id="logDate" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
      <div><label class="block text-xs text-gray-500 mb-1">内容</label><textarea id="logContent" rows="4" class="w-full border rounded-lg p-2 text-sm" placeholder="记录今天的班级情况…"></textarea></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveClassLog()">保存</button>
    </div>`);
}
function saveClassLog() {
  const content = document.getElementById('logContent').value.trim();
  const date = document.getElementById('logDate').value.trim() || todayLabel;
  if(!content) return alert('请输入日志内容');
  state.classLogs.unshift({ id: uid(), date, content });
  save(); closeModal(); render();
}
function deleteClassLog(id) {
  const c = state.classLogs.find(x=>x.id===id);
  if(!c) return;
  doDelete(()=>state.classLogs, id, c.content.slice(0,12) || '日志');
}

// ===================== Communication =====================
function renderCommunication() {
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="space-y-4">${state.communications.map(c => `
      <div class="p-4 rounded-xl bg-gray-50 flex items-start justify-between">
        <div class="flex-1"><div class="font-bold text-gray-800 text-sm">${esc(c.student)} · ${esc(c.parent)}</div><div class="text-xs text-gray-500 mt-1">${esc(c.content)}</div></div>
        <div class="flex items-center gap-2 ml-3">
          <select class="text-xs border rounded px-2 py-1" onchange="setCommStatus('${c.id}', this.value)">
            <option value="待跟进" ${c.status==='待跟进'?'selected':''}>待跟进</option>
            <option value="已沟通" ${c.status==='已沟通'?'selected':''}>已沟通</option>
          </select>
          <button class="text-gray-300 hover:text-red-500" onclick="deleteComm('${c.id}')">🗑️</button>
        </div>
      </div>`).join('')}</div>
  </div>`;
}
function openCommForm() {
  openModal('新增家校沟通', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">学生</label><input id="commStudent" class="w-full border rounded-lg p-2 text-sm" placeholder="学生姓名"></div>
      <div><label class="block text-xs text-gray-500 mb-1">家长称呼</label><input id="commParent" class="w-full border rounded-lg p-2 text-sm" placeholder="如：张明轩妈妈"></div>
      <div><label class="block text-xs text-gray-500 mb-1">沟通内容</label><textarea id="commContent" rows="3" class="w-full border rounded-lg p-2 text-sm"></textarea></div>
      <div><label class="block text-xs text-gray-500 mb-1">状态</label><select id="commStatus" class="w-full border rounded-lg p-2 text-sm"><option>待跟进</option><option>已沟通</option></select></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveComm()">保存</button>
    </div>`);
}
function saveComm() {
  const student = document.getElementById('commStudent').value.trim();
  if(!student) return alert('请输入学生姓名');
  const parent = document.getElementById('commParent').value.trim() || (student + '家长');
  const content = document.getElementById('commContent').value.trim();
  const status = document.getElementById('commStatus').value;
  state.communications.unshift({ id: uid(), student, parent, content, status });
  save(); closeModal(); render();
}
function setCommStatus(id, status) {
  const c = state.communications.find(x=>x.id===id);
  c.status = status; save(); render();
}
function deleteComm(id) {
  const c = state.communications.find(x=>x.id===id);
  if(!c) return;
  doDelete(()=>state.communications, id, (c.student || c.parent || '沟通'));
}

// ===================== Homework =====================
function renderHomework() {
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="grid gap-4">${state.homework.map(h => `
      <div class="p-4 rounded-xl bg-gray-50 flex justify-between items-center">
        <div><div class="font-bold text-gray-800 text-sm">${esc(h.title)}</div><div class="text-xs text-gray-500 mt-1">${esc(h.class)} · ${esc(h.subject)}</div></div>
        <div class="flex items-center gap-3"><div class="text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">截止 ${esc(h.due)}</div><button class="text-gray-300 hover:text-red-500" onclick="deleteHomework('${h.id}')">🗑️</button></div>
      </div>`).join('')}</div>
  </div>`;
}
function openHomeworkForm() {
  openModal('布置作业', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">科目</label><input id="hwSubject" class="w-full border rounded-lg p-2 text-sm" value="英语"></div>
      <div><label class="block text-xs text-gray-500 mb-1">作业标题</label><input id="hwTitle" class="w-full border rounded-lg p-2 text-sm" placeholder="如：Unit 1 单词默写"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="hwClass" class="w-full border rounded-lg p-2 text-sm" placeholder="高一(3)班"></div>
        <div><label class="block text-xs text-gray-500 mb-1">截止日期</label><input id="hwDue" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
      </div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveHomework()">保存</button>
    </div>`);
}
function saveHomework() {
  const subject = document.getElementById('hwSubject').value.trim() || '未指定';
  const title = document.getElementById('hwTitle').value.trim();
  if(!title) return alert('请输入作业标题');
  const cls = document.getElementById('hwClass').value.trim();
  const due = document.getElementById('hwDue').value.trim() || todayLabel;
  state.homework.unshift({ id: uid(), subject, title, class: cls, due });
  save(); closeModal(); render();
}
function deleteHomework(id) {
  const h = state.homework.find(x=>x.id===id);
  if(!h) return;
  doDelete(()=>state.homework, id, h.title || '作业');
}

// ===================== Scores =====================
function renderScores() {
  const students = [...new Set(state.scores.map(s=>s.name))];
  const avgByStudent = students.map(name => {
    const rs = state.scores.filter(s=>s.name===name);
    const avg = (rs.reduce((a,b)=>a+b.score,0)/rs.length).toFixed(1);
    return { name, avg, count: rs.length };
  });
  return `<div class="space-y-6">
    <div class="bg-white rounded-2xl p-6 shadow-sm">
      <h3 class="font-bold text-gray-800 mb-3">学生平均分</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        ${avgByStudent.map(a=>`<div class="p-3 rounded-xl bg-gray-50 text-center"><div class="font-bold text-primary">${a.avg}</div><div class="text-xs text-gray-500">${esc(a.name)}（${a.count}次）</div></div>`).join('')}
      </div>
    </div>
    <div class="bg-white rounded-2xl p-6 shadow-sm">
      <table class="w-full text-sm"><thead><tr class="text-gray-500 border-b"><th class="py-2 text-left">学生</th><th class="py-2 text-left">班级</th><th class="py-2 text-left">科目</th><th class="py-2 text-left">考试</th><th class="py-2 text-left">分数</th><th></th></tr></thead>
      <tbody>${state.scores.map(s=>`<tr class="border-b hover:bg-gray-50"><td class="py-3 font-medium">${esc(s.name)}</td><td class="py-3">${esc(s.class)}</td><td class="py-3">${esc(s.subject)}</td><td class="py-3">${esc(s.exam)}</td><td class="py-3 font-bold text-primary">${s.score}</td><td><button class="text-gray-300 hover:text-red-500" onclick="deleteScore('${s.id}')">🗑️</button></td></tr>`).join('')}</tbody></table>
    </div>
  </div>`;
}
function openScoreForm() {
  const subj = lastScoreSubject || '英语';
  const exam = lastScoreExam || '期中考试';
  openModal('录入成绩', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">学生姓名</label><input id="scName" class="w-full border rounded-lg p-2 text-sm" placeholder="如：张明轩"></div>
      <div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="scClass" class="w-full border rounded-lg p-2 text-sm" placeholder="高一(3)班"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">科目</label><input id="scSubject" class="w-full border rounded-lg p-2 text-sm" value="${esc(subj)}"></div>
        <div><label class="block text-xs text-gray-500 mb-1">分数</label><input id="scScore" type="number" class="w-full border rounded-lg p-2 text-sm"></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">考试名称</label><input id="scExam" class="w-full border rounded-lg p-2 text-sm" value="${esc(exam)}"></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveScore()">保存</button>
    </div>`);
}
function saveScore() {
  const name = document.getElementById('scName').value.trim();
  if(!name) return alert('请输入学生姓名');
  const score = parseFloat(document.getElementById('scScore').value);
  if(isNaN(score)) return alert('请输入分数');
  const subject = document.getElementById('scSubject').value.trim() || '英语';
  const exam = document.getElementById('scExam').value.trim() || '考试';
  lastScoreSubject = subject; lastScoreExam = exam;
  state.scores.unshift({ id: uid(), name, class: document.getElementById('scClass').value.trim(), subject, exam, score });
  save(); closeModal(); render();
}
function deleteScore(id) {
  const s = state.scores.find(x=>x.id===id);
  if(!s) return;
  doDelete(()=>state.scores, id, (s.name + ' · ' + s.subject));
}

// ===================== Reminders / Todos =====================
function renderReminders() {
  return `<div class="space-y-6">
    <div class="bg-white rounded-2xl p-6 shadow-sm">
      <h3 class="font-bold text-gray-800 mb-3">📋 待办事项</h3>
      <div class="space-y-3">
        ${state.todos.map(t=>`<div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
          <input type="checkbox" class="w-4 h-4 accent-primary" ${t.done?'checked':''} onchange="toggleTodo('${t.id}')">
          <div class="flex-1"><div class="text-sm ${t.done?'line-through text-gray-400':'text-gray-700'}">${esc(t.title)}</div><div class="flex gap-2 mt-1"><span class="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">${esc(t.level)}</span><span class="text-[10px] text-gray-400">${esc(t.due)}</span></div></div>
          <button class="text-gray-300 hover:text-red-500" onclick="deleteTodo('${t.id}')">🗑️</button>
        </div>`).join('')}
      </div>
      <button class="mt-4 text-sm text-primary hover:underline" onclick="openTodoForm()">+ 添加待办</button>
    </div>
    <div class="bg-white rounded-2xl p-6 shadow-sm">
      <h3 class="font-bold text-gray-800 mb-3">⏰ 提醒</h3>
      <div class="space-y-3">
        ${state.reminders.map(r=>`<div class="p-4 rounded-xl bg-gray-50 flex justify-between items-center"><div class="font-medium text-sm text-gray-800">${esc(r.title)}</div><div class="flex items-center gap-3"><div class="text-xs text-gray-500">${esc(r.time)}</div><button class="text-gray-300 hover:text-red-500" onclick="deleteReminder('${r.id}')">🗑️</button></div></div>`).join('')}
      </div>
    </div>
  </div>`;
}
function openTodoForm() {
  openModal('添加待办', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">内容</label><input id="todoTitle" class="w-full border rounded-lg p-2 text-sm"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">优先级</label><select id="todoLevel" class="w-full border rounded-lg p-2 text-sm"><option>低</option><option>中</option><option>高</option></select></div>
        <div><label class="block text-xs text-gray-500 mb-1">截止</label><input id="todoDue" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
      </div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveTodo()">保存</button>
    </div>`);
}
function saveTodo() {
  const title = document.getElementById('todoTitle').value.trim();
  if(!title) return alert('请输入待办内容');
  state.todos.push({ id: uid(), title, level: document.getElementById('todoLevel').value, due: document.getElementById('todoDue').value.trim()||todayLabel, done: false });
  save(); closeModal(); render();
}
function toggleTodo(id) {
  const t = state.todos.find(x=>x.id===id);
  if(t){ t.done=!t.done; save(); render(); }
}
function deleteTodo(id) {
  const t = state.todos.find(x=>x.id===id);
  if(!t) return;
  doDelete(()=>state.todos, id, t.title || '待办');
}
function openReminderForm() {
  openModal('新建提醒', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">提醒内容</label><input id="remTitle" class="w-full border rounded-lg p-2 text-sm"></div>
      <div><label class="block text-xs text-gray-500 mb-1">时间</label><input id="remTime" class="w-full border rounded-lg p-2 text-sm" placeholder="如：2026-08-25 14:30"></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveReminder()">保存</button>
    </div>`);
}
function saveReminder() {
  const title = document.getElementById('remTitle').value.trim();
  if(!title) return alert('请输入提醒内容');
  state.reminders.push({ id: uid(), title, time: document.getElementById('remTime').value.trim()||'未设置时间' });
  save(); closeModal(); render();
}
function deleteReminder(id) {
  const r = state.reminders.find(x=>x.id===id);
  if(!r) return;
  doDelete(()=>state.reminders, id, r.title || '提醒');
}

// ===================== Duty =====================
function getDutyForDay(dayIdx) {
  if(!state.duty.groups || !state.duty.groups.length) return [];
  return state.duty.groups[dayIdx % state.duty.groups.length] || [];
}
function renderDuty() {
  const has = state.duty.groups && state.duty.groups.length;
  const week = ['周一','周二','周三','周四','周五'];
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800">值日安排</div>
      <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openDutySetting()">设置分组</button>
    </div>
    ${has ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      ${week.map((d,i)=>`<div class="p-4 rounded-xl bg-gray-50"><div class="font-medium text-gray-700 text-sm mb-2 ${i===todayIndex?'text-primary':''}">${d}${i===todayIndex?'（今天）':''}</div><div class="space-y-1">${(state.duty.groups[i]||[]).map(n=>`<div class="text-xs text-gray-600">${esc(n)}</div>`).join('') || '<div class="text-xs text-gray-400">休息</div>'}</div></div>`).join('')}
    </div>` : `<div class="text-sm text-gray-500">还没有设置值日分组，点「设置分组」按每组人数自动排班。</div>`}
  </div>`;
}
function openDutySetting() {
  openModal('设置值日分组', `
    <div class="space-y-4">
      <p class="text-sm text-gray-500">按每组人数把全班同学自动轮流排到周一至周五。</p>
      <div><label class="block text-xs text-gray-500 mb-1">每组人数</label><input id="dutySize" type="number" class="w-full border rounded-lg p-2 text-sm" value="${state.duty.groupSize||4}"></div>
      <div class="max-h-48 overflow-y-auto space-y-1 text-sm">${state.students.map(s=>`<div class="text-gray-600">${esc(s.name)}（${esc(s.class)}）</div>`).join('') || '<div class="text-gray-400">暂无学生，请先在「学生管理」中添加</div>'}</div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveDuty()">生成排班</button>
    </div>`);
}
function saveDuty() {
  const size = parseInt(document.getElementById('dutySize').value) || 1;
  const names = state.students.map(s=>s.name);
  if(!names.length) return alert('请先添加学生');
  const groups = [];
  for(let i=0;i<names.length;i+=size) groups.push(names.slice(i,i+size));
  state.duty = { groupSize: size, groups };
  save(); closeModal(); render();
}

// ===================== Seating =====================
function renderSeating() {
  const { rows, cols, seats } = state.seating;
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800">座次表</div>
      <div class="flex gap-3">
        <button class="text-sm border rounded px-3 py-1.5 hover:bg-gray-50" onclick="setSeatSize()">设置行列</button>
        <button class="text-sm border border-red-200 text-red-500 rounded px-3 py-1.5 hover:bg-red-50" onclick="clearSeats()">清空</button>
      </div>
    </div>
    <p class="text-xs text-gray-400 mb-4">点击座位分配学生（再次点击可更换/清除）。</p>
    <div class="grid gap-3" style="grid-template-columns: repeat(${cols}, minmax(0,1fr));">
      ${Array.from({length: rows*cols}).map((_,idx)=>{
        const key = 's'+idx;
        const sid = seats[key];
        const st = sid ? state.students.find(s=>s.id===sid) : null;
        return `<div class="aspect-square rounded-xl border flex items-center justify-center text-center cursor-pointer transition ${st?'bg-primary/10 border-primary text-primary':'bg-gray-50 border-gray-200 hover:border-primary/40'}" onclick="assignSeat('${key}')">${st?esc(st.name):'<span class=\"text-gray-300 text-xs\">空</span>'}</div>`;
      }).join('')}
    </div>
  </div>`;
}
function assignSeat(key) {
  if(!state.students.length) return alert('请先在「学生管理」中添加学生');
  openModal('分配座位', `
    <div class="space-y-3 max-h-72 overflow-y-auto">
      ${state.students.map(s=>`<div class="p-3 rounded-lg bg-gray-50 hover:bg-primary/5 cursor-pointer" onclick="setSeat('${key}','${s.id}')">${esc(s.name)}（${esc(s.class)}）</div>`).join('')}
      <div class="p-3 rounded-lg bg-red-50 text-red-500 cursor-pointer text-center" onclick="clearSeat('${key}')">清除该座位</div>
    </div>`);
}
function setSeat(key, sid) {
  state.seating.seats[key] = sid;
  save(); closeModal(); render();
}
function clearSeat(key) {
  delete state.seating.seats[key];
  save(); closeModal(); render();
}
function clearSeats() {
  state.seating.seats = {};
  save(); render();
}
function setSeatSize() {
  openModal('设置行列数', `
    <div class="grid grid-cols-2 gap-4">
      <div><label class="block text-xs text-gray-500 mb-1">行数</label><input id="seatRows" type="number" class="w-full border rounded-lg p-2 text-sm" value="${state.seating.rows}"></div>
      <div><label class="block text-xs text-gray-500 mb-1">列数</label><input id="seatCols" type="number" class="w-full border rounded-lg p-2 text-sm" value="${state.seating.cols}"></div>
    </div>
    <button class="w-full mt-4 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveSeatSize()">保存</button>`);
}
function saveSeatSize() {
  const r = parseInt(document.getElementById('seatRows').value)||6;
  const c = parseInt(document.getElementById('seatCols').value)||7;
  state.seating.rows = Math.min(20, Math.max(1, r));
  state.seating.cols = Math.min(20, Math.max(1, c));
  save(); closeModal(); render();
}

// ===================== Album =====================
function renderAlbum() {
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800">班级相册</div>
      <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openAlbumForm()">+ 上传图片</button>
    </div>
    ${state.album.length ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      ${state.album.map(p=>`<div class="relative group rounded-xl overflow-hidden bg-gray-100 aspect-square">
        <img src="${esc(p.url)}" class="w-full h-full object-cover" alt="">
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-end p-2">
          <div class="text-white text-xs flex-1 truncate">${esc(p.caption||'')}</div>
          <button class="text-white text-xs bg-red-500/80 px-2 py-1 rounded" onclick="deleteAlbum('${p.id}')">删除</button>
        </div>
      </div>`).join('')}
    </div>` : `<div class="text-center text-gray-400 py-12"><div class="text-5xl mb-3">🖼️</div><p>还没有照片，点「上传图片」添加班级活动照片</p></div>`}
  </div>`;
}
function openAlbumForm() {
  openModal('上传图片', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">图片地址（链接）</label><input id="albumUrl" class="w-full border rounded-lg p-2 text-sm" placeholder="https://..."></div>
      <div class="text-center text-xs text-gray-400">或</div>
      <div><label class="block text-xs text-gray-500 mb-1">从本地上传</label><input id="albumFile" type="file" accept="image/*" class="w-full text-sm"></div>
      <div><label class="block text-xs text-gray-500 mb-1">说明（可选）</label><input id="albumCaption" class="w-full border rounded-lg p-2 text-sm" placeholder="如：春游合影"></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveAlbum()">保存</button>
    </div>`);
}
function saveAlbum() {
  const caption = document.getElementById('albumCaption').value.trim();
  const urlInput = document.getElementById('albumUrl').value.trim();
  const fileInput = document.getElementById('albumFile');
  if(fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = e => { state.album.unshift({ id: uid(), url: e.target.result, caption }); save(); closeModal(); render(); };
    reader.readAsDataURL(fileInput.files[0]);
    return;
  }
  if(!urlInput) return alert('请输入图片链接或选择本地文件');
  state.album.unshift({ id: uid(), url: urlInput, caption });
  save(); closeModal(); render();
}
function deleteAlbum(id) {
  const p = state.album.find(x=>x.id===id);
  if(!p) return;
  doDelete(()=>state.album, id, p.title || '相册');
}

// ===================== Class Record =====================
function renderClassRecord() {
  if(!state.classRecords) state.classRecords = [];
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800">课堂记录</div>
      <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openClassRecordForm()">+ 添加记录</button>
    </div>
    <div class="space-y-3">${state.classRecords.map(r=>`<div class="p-4 rounded-xl bg-gray-50 flex justify-between items-start"><div><div class="text-xs text-gray-400 mb-1">${esc(r.date)} · ${esc(r.subject)}</div><div class="text-sm text-gray-700">${esc(r.content)}</div></div><button class="text-gray-300 hover:text-red-500" onclick="deleteClassRecord('${r.id}')">🗑️</button></div>`).join('') || '<div class="text-gray-400 text-sm">暂无课堂记录</div>'}</div>
  </div>`;
}
function openClassRecordForm() {
  openModal('添加课堂记录', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">日期</label><input id="crDate" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
        <div><label class="block text-xs text-gray-500 mb-1">科目</label><input id="crSubject" class="w-full border rounded-lg p-2 text-sm" value="英语"></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">内容（课堂表现 / 纪律情况）</label><textarea id="crContent" rows="4" class="w-full border rounded-lg p-2 text-sm"></textarea></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveClassRecord()">保存</button>
    </div>`);
}
function saveClassRecord() {
  if(!state.classRecords) state.classRecords = [];
  const content = document.getElementById('crContent').value.trim();
  if(!content) return alert('请输入内容');
  state.classRecords.unshift({ id: uid(), date: document.getElementById('crDate').value.trim()||todayLabel, subject: document.getElementById('crSubject').value.trim()||'—', content });
  save(); closeModal(); render();
}
function deleteClassRecord(id) {
  const r = state.classRecords.find(x=>x.id===id);
  if(!r) return;
  doDelete(()=>state.classRecords, id, (r.content || '课堂记录').slice(0,12));
}

// ===================== Report =====================
function renderReport() {
  const totalStudents = state.students.length;
  const criticCount = state.students.reduce((a,s)=>a+s.records.filter(r=>r.type==='critic').length,0);
  const praiseCount = state.students.reduce((a,s)=>a+s.records.filter(r=>r.type==='praise').length,0);
  const pendingComm = state.communications.filter(c=>c.status==='待跟进').length;
  const week = ptRecent(7);
  const top3 = ptRanked('all').slice(0, 3).filter(x => x.score !== 0);
  const weekTop = (() => {
    const m = {};
    week.forEach(l => { m[l.studentId] = (m[l.studentId] || 0) + l.delta; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([sid, v]) => `${ptStudentName(sid)}(${ptSigned(v)})`).join('、') || '暂无';
  })();
  const report = `【班级周报／月报】
时间：${formatDate(now)}
班级概况：本班共 ${totalStudents} 名学生。
行为记录统计：本周表扬 ${praiseCount} 次，批评 ${criticCount} 次。
积分概况：全班累计 ${fmtScore(ptClassSum('all'))} 分（体育打卡 ${fmtScore(ptClassSum('sport'))}、日常积分 ${fmtScore(ptClassSum('daily'))}、考试赋分 ${fmtScore(ptClassSum('exam'))}、任职赋分 ${fmtScore(ptClassSum('post'))}）。
积分排行前三：${top3.length ? top3.map((x, i) => `${i + 1}. ${x.s.name} ${fmtScore(x.score)}分`).join('，') : '暂无'}
近7天积分进步：${weekTop}
家校沟通：待跟进 ${pendingComm} 项。
班级日志摘要：${state.classLogs.slice(0,3).map(l=>l.date+' '+l.content).join('；') || '暂无'}
待办重点：${state.todos.filter(t=>!t.done).slice(0,3).map(t=>t.title).join('；') || '无'}`;
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4"><div class="font-bold text-gray-800">班级周报／月报</div><button class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5" onclick="copyText(document.getElementById('reportText').textContent)">复制报告</button></div>
    <pre id="reportText" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl p-4">${esc(report)}</pre>
  </div>`;
}

// ===================== PPT =====================
function renderPPT() {
  const theme = '新学期主题班会';
  const outline = `【班会 PPT 大纲：${theme}】
1. 开场：班级现状与氛围
2. 成绩与目标：本次考试分析（见成绩管理）
3. 行为表现：表扬与改进点（见学生行为记录）
4. 家校协同：近期沟通重点（见家校沟通）
5. 下一阶段计划与寄语`;
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4"><div class="font-bold text-gray-800">班会 PPT</div><button class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5" onclick="copyText(document.getElementById('pptOutline').textContent)">复制大纲</button></div>
    <div class="mb-4"><label class="block text-xs text-gray-500 mb-1">班会主题</label><input id="pptTheme" class="w-full border rounded-lg p-2 text-sm" value="${theme}" oninput="renderPPTLive()"></div>
    <pre class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl p-4" id="pptOutline">${esc(outline)}</pre>
  </div>`;
}
function renderPPTLive() {
  const theme = document.getElementById('pptTheme').value.trim() || '班会';
  const outline = `【班会 PPT 大纲：${theme}】
1. 开场：班级现状与氛围
2. 成绩与目标：本次考试分析（见成绩管理）
3. 行为表现：表扬与改进点（见学生行为记录）
4. 家校协同：近期沟通重点（见家校沟通）
5. 下一阶段计划与寄语`;
  document.getElementById('pptOutline').textContent = outline;
}

// ===================== Points: 积分管理 =====================
let pointsTab = 'all';
let pointsQuery = '';
let pointsMode = 'conv'; // 'conv' 折算分 | 'raw' 原始分

function setPtMode(m) { pointsMode = m; render(); }
function ptScoreOf(sid) { return pointsMode === 'conv' ? ptConvTotal(sid) : ptRawTotal(sid); }

function nowStamp() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function ptSum(logs) { return logs.reduce((a, b) => a + (+b.delta || 0), 0); }
function ptStudentLogs(sid) { return state.points.logs.filter(l => l.studentId === sid); }
function ptTotal(sid) { return ptSum(ptStudentLogs(sid)); }
function ptDimScore(sid, dim) { return ptSum(ptStudentLogs(sid).filter(l => l.dim === dim)); }
function ptClassSum(dim) { return ptSum(state.points.logs.filter(l => dim === 'all' || l.dim === dim)); }
function ptRanked(dim) {
  const arr = state.students.map(s => ({ s, score: dim === 'all' ? ptScoreOf(s.id) : ptDimScore(s.id, dim) }));
  arr.sort((a, b) => b.score - a.score || String(a.s.name).localeCompare(String(b.s.name), 'zh'));
  return arr;
}
function ptRecent(days) {
  const cut = Date.now() - days * 86400000;
  return state.points.logs.filter(l => (l.ts || 0) >= cut);
}
function ptDeltaCls(d) { return d >= 0 ? 'text-red-500' : 'text-emerald-600'; }
function ptDeltaBg(d) { return d >= 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'; }
// 积分数值统一保留 2 位小数
function fmtScore(n) { return (Math.round((+n || 0) * 100) / 100).toFixed(2); }
function ptSigned(d) { return (d >= 0 ? '+' : '') + fmtScore(d); }
function ptStudentName(sid) { const s = state.students.find(x => x.id === sid); return s ? s.name : '（已删除学生）'; }
function ptJobsOf(sid) { return state.points.assigns.filter(a => a.stuId === sid).map(a => { const j = state.points.jobs.find(x => x.id === a.jobId); return j ? j.name : ''; }).filter(Boolean); }
// ===== 折算：各维度原始分 × 比例 = 折算分 =====
function ptConvDim(sid, dim) { return (ptDimScore(sid, dim) || 0) * (state.convertRatios[dim] != null ? state.convertRatios[dim] : 1); }
function ptConvTotal(sid) { return POINT_DIMS.reduce((a, d) => a + ptConvDim(sid, d.id), 0); }
function ptRawTotal(sid) { return ptTotal(sid); }

function setPtTab(t) { pointsTab = t; render(); }
function ptFilter(v) { pointsQuery = v; const el = document.getElementById('pt-list'); if (el) el.innerHTML = renderPtList(); }

function renderPoints() {
  if (!state.students.length) {
    return `<div class="bg-white rounded-2xl p-10 text-center shadow-sm">
      <div class="text-5xl mb-4">🏆</div>
      <div class="font-bold text-gray-800 mb-2">还没有学生，先建立名单</div>
      <p class="text-sm text-gray-500 mb-5">积分与学生档案打通，录入学生后即可开始加减分、排行和统计。</p>
      <button class="bg-primary text-white px-5 py-2 rounded-full text-sm hover:bg-primaryDark" onclick="navigate('students')">去学生管理 →</button>
    </div>`;
  }
  const weekAdd = ptRecent(7);
  const statCards = POINT_DIMS.map(d => {
    const st = dimStyle(d.id); const sum = ptClassSum(d.id);
    const active = pointsTab === d.id;
    return `<div class="cursor-pointer rounded-2xl p-4 border ${active ? 'border-primary shadow-sm' : 'border-transparent'} ${st.bg} card-hover" onclick="setPtTab('${d.id}')">
      <div class="text-xs ${st.text} font-medium">${d.icon} ${d.label}</div>
      <div class="text-2xl font-bold ${st.text} mt-1">${sum}</div>
      <div class="text-[10px] text-gray-400 mt-0.5">全班累计</div>
    </div>`;
  }).join('');

  const tabs = [{ id: 'all', label: '总分排行', icon: '🏅' }].concat(POINT_DIMS).map(t =>
    `<button class="px-4 py-1.5 rounded-full text-sm transition ${pointsTab === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-primary/10'}" onclick="setPtTab('${t.id}')">${t.icon} ${t.label}</button>`
  ).join('');

  const modeToggle = `<div class="flex gap-1 text-xs">
    <button class="px-3 py-1.5 rounded-full ${pointsMode==='conv'?'bg-primary text-white':'bg-gray-100 text-gray-600'}" onclick="setPtMode('conv')">折算分</button>
    <button class="px-3 py-1.5 rounded-full ${pointsMode==='raw'?'bg-primary text-white':'bg-gray-100 text-gray-600'}" onclick="setPtMode('raw')">原始分</button>
  </div>`;

  return `
  <div class="space-y-5">
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      ${statCards}
      <div class="rounded-2xl p-4 bg-primary/10 border border-primary/20">
        <div class="text-xs text-primary font-medium">🕒 近7天变动</div>
        <div class="text-2xl font-bold text-primary mt-1">${ptSum(weekAdd) >= 0 ? '+' : ''}${ptSum(weekAdd)}</div>
        <div class="text-[10px] text-gray-400 mt-0.5">${weekAdd.length} 条记录</div>
      </div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex flex-wrap gap-2">${tabs}</div>
        <div class="flex items-center gap-2 flex-wrap">
          ${modeToggle}
          <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openConvertSettings()">⚙️ 折算</button>
          <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtHistory()">📅 历史</button>
          <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openPtImport()">⬆️ 导入Excel</button>
          <input value="${esc(pointsQuery)}" oninput="ptFilter(this.value)" placeholder="🔍 搜索学生姓名" class="border rounded-full px-4 py-1.5 text-sm w-40 focus:outline-none focus:border-primary">
        </div>
      </div>
      <div id="pt-list" class="space-y-2">${renderPtList()}</div>
    </div>
  </div>`;
}

function renderPtList() {
  const dim = pointsTab;
  let list = ptRanked(dim);
  if (pointsQuery.trim()) {
    const q = pointsQuery.trim().toLowerCase();
    list = list.filter(x => String(x.s.name).toLowerCase().includes(q) || String(x.s.class || '').toLowerCase().includes(q));
  }
  if (!list.length) return '<div class="text-sm text-gray-400 py-6 text-center">没有匹配的学生</div>';
  const maxAbs = Math.max(1, ...list.map(x => Math.abs(x.score)));
  const medals = ['🥇', '🥈', '🥉'];
  return list.map((x, i) => {
    const rankShow = pointsQuery.trim() ? `<span class="text-xs text-gray-400">#${i + 1}</span>` : (medals[i] || `<span class="text-xs text-gray-400 font-medium">${i + 1}</span>`);
    const pills = dim === 'all'
      ? POINT_DIMS.map(d => { const st = dimStyle(d.id); const v = ptDimScore(x.s.id, d.id);
          return `<span class="text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.text}" title="${d.label}">${d.icon}${fmtScore(v)}</span>`; }).join('')
      : '';
    const postTags = ptJobsOf(x.s.id).map(n => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">${esc(n)}</span>`).join('');
    const w = Math.round(Math.abs(x.score) / maxAbs * 100);
    const barCls = dim === 'all' ? 'bg-primary/60' : dimStyle(dim).bar;
    return `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-primary/5 transition">
      <div class="w-7 text-center text-lg shrink-0">${rankShow}</div>
      <img src="${esc(x.s.avatar)}" class="w-9 h-9 rounded-full bg-white shrink-0" alt="">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-gray-800 text-sm cursor-pointer hover:text-primary" onclick="openPtStudent('${x.s.id}')">${esc(x.s.name)}</span>
          ${postTags}
          <span class="text-[10px] text-gray-400">${esc(x.s.class || '')}</span>
        </div>
        <div class="flex items-center gap-2 mt-1.5">
          <div class="h-1.5 rounded-full bg-gray-200 flex-1 max-w-[180px] overflow-hidden"><div class="h-full ${barCls}" style="width:${w}%"></div></div>
          <div class="flex gap-1">${pills}</div>
        </div>
      </div>
      <div class="text-right shrink-0 w-14"><span class="text-lg font-bold ${x.score >= 0 ? 'text-gray-800' : 'text-emerald-600'}">${fmtScore(x.score)}</span><div class="text-[10px] text-gray-400">${pointsMode==='conv'?'折算分':'原始分'}</div></div>
      <div class="flex gap-1 shrink-0">
        <button class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 text-sm font-bold" title="加分" onclick="openPtAdjust('${x.s.id}','${dim === 'all' ? 'daily' : dim}',1)">＋</button>
        <button class="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-sm font-bold" title="扣分" onclick="openPtAdjust('${x.s.id}','${dim === 'all' ? 'daily' : dim}',-1)">－</button>
        <button class="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 text-xs" title="积分详情" onclick="openPtStudent('${x.s.id}')">📊</button>
      </div>
    </div>`;
  }).join('');
}

// ---------- 加减分 ----------
let ptSign = 1;
function openPtAdjust(sid, dim, sign) {
  if (!state.students.length) return alert('请先在「学生管理」录入学生');
  ptSign = sign === -1 ? -1 : 1;
  dim = dim || 'daily';
  openModal('加分 / 扣分', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">学生</label>
        <select id="ptStudent" class="w-full border rounded-lg p-2 text-sm">
          ${state.students.map(s => `<option value="${s.id}" ${sid === s.id ? 'selected' : ''}>${esc(s.name)}（${esc(s.class || '')}）</option>`).join('')}
        </select></div>
      <div><label class="block text-xs text-gray-500 mb-1">积分维度</label>
        <select id="ptDim" class="w-full border rounded-lg p-2 text-sm" onchange="ptRenderRuleChips()">
          ${POINT_DIMS.map(d => `<option value="${d.id}" ${dim === d.id ? 'selected' : ''}>${d.icon} ${d.label}</option>`).join('')}
        </select></div>
      <div><label class="block text-xs text-gray-500 mb-1">规则预设（点击自动填分值和理由）</label>
        <div id="ptRuleChips" class="flex flex-wrap gap-2"></div></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">加/扣</label>
          <div class="flex gap-2">
            <button type="button" id="ptSignPlus" class="flex-1 py-2 rounded-lg border text-sm" onclick="ptSetSign(1)">加分</button>
            <button type="button" id="ptSignMinus" class="flex-1 py-2 rounded-lg border text-sm" onclick="ptSetSign(-1)">扣分</button>
          </div></div>
        <div><label class="block text-xs text-gray-500 mb-1">分值（正数）</label>
          <input id="ptValue" type="number" min="0" step="1" value="2" class="w-full border rounded-lg p-2 text-sm"></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">理由</label>
        <input id="ptReason" class="w-full border rounded-lg p-2 text-sm" placeholder="如：主动回答问题"></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="savePtAdjust()">保存记录</button>
    </div>`);
  ptRenderRuleChips();
  ptSetSign(ptSign);
}
function ptSetSign(s) {
  ptSign = s;
  const plus = document.getElementById('ptSignPlus'), minus = document.getElementById('ptSignMinus');
  if (!plus || !minus) return;
  plus.className = 'flex-1 py-2 rounded-lg border text-sm ' + (s === 1 ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600');
  minus.className = 'flex-1 py-2 rounded-lg border text-sm ' + (s === -1 ? 'bg-emerald-500 text-white border-emerald-500' : 'border-gray-200 text-gray-600');
}
function ptRenderRuleChips() {
  const dimEl = document.getElementById('ptDim'); const box = document.getElementById('ptRuleChips');
  if (!dimEl || !box) return;
  const rules = state.points.rules.filter(r => r.dim === dimEl.value);
  box.innerHTML = rules.length ? rules.map(r =>
    `<button type="button" class="text-xs px-2.5 py-1 rounded-full ${ptDeltaBg(r.delta)} hover:opacity-80" onclick="ptApplyRule('${r.id}')">${esc(r.label)} ${ptSigned(r.delta)}</button>`
  ).join('') : '<span class="text-xs text-gray-400">该维度暂无预设，可在顶部「规则」中添加</span>';
}
function ptApplyRule(rid) {
  const r = state.points.rules.find(x => x.id === rid); if (!r) return;
  document.getElementById('ptValue').value = Math.abs(r.delta);
  document.getElementById('ptReason').value = r.label;
  ptSetSign(r.delta >= 0 ? 1 : -1);
}
function ptWriteLog(studentId, dim, delta, reason, batchId, auto) {
  state.points.logs.unshift({
    id: uid(), ts: Date.now(), date: nowStamp(), studentId,
    studentName: ptStudentName(studentId), dim, delta, reason: reason || dimLabel(dim),
    batchId: batchId || '', auto: auto || '',
  });
}
function savePtAdjust() {
  const sid = document.getElementById('ptStudent').value;
  const dim = document.getElementById('ptDim').value;
  const val = Math.abs(parseInt(document.getElementById('ptValue').value, 10) || 0);
  const reason = document.getElementById('ptReason').value.trim();
  if (!val) return alert('请输入大于 0 的分值');
  ptWriteLog(sid, dim, val * ptSign, reason);
  save(); closeModal(); render();
}

// ---------- 批量加减分 ----------
function openPtBatch() {
  if (!state.students.length) return alert('请先在「学生管理」录入学生');
  openModal('批量加减分', `
    <div class="space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs text-gray-500">选择学生</label>
          <div class="flex gap-2">
            <button type="button" class="text-xs text-primary hover:underline" onclick="ptBatchAll(true)">全选</button>
            <button type="button" class="text-xs text-gray-400 hover:underline" onclick="ptBatchAll(false)">清空</button>
          </div>
        </div>
        <div class="max-h-44 overflow-y-auto border rounded-lg p-2 grid grid-cols-2 gap-1">
          ${state.students.map(s => `<label class="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" class="pt-batch-st accent-primary" value="${s.id}"><span>${esc(s.name)}</span></label>`).join('')}
        </div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">积分维度</label>
        <select id="ptDim" class="w-full border rounded-lg p-2 text-sm" onchange="ptRenderRuleChips()">
          ${POINT_DIMS.map(d => `<option value="${d.id}">${d.icon} ${d.label}</option>`).join('')}
        </select></div>
      <div><label class="block text-xs text-gray-500 mb-1">规则预设</label><div id="ptRuleChips" class="flex flex-wrap gap-2"></div></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">加/扣</label>
          <div class="flex gap-2">
            <button type="button" id="ptSignPlus" class="flex-1 py-2 rounded-lg border text-sm" onclick="ptSetSign(1)">加分</button>
            <button type="button" id="ptSignMinus" class="flex-1 py-2 rounded-lg border text-sm" onclick="ptSetSign(-1)">扣分</button>
          </div></div>
        <div><label class="block text-xs text-gray-500 mb-1">分值（正数）</label>
          <input id="ptValue" type="number" min="0" step="1" value="2" class="w-full border rounded-lg p-2 text-sm"></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">理由</label><input id="ptReason" class="w-full border rounded-lg p-2 text-sm" placeholder="如：全班课间操标准"></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="savePtBatch()">批量保存</button>
      <p class="text-[11px] text-gray-400">批量记录会打上同一批次标记，可在「日志」里一键撤销整批。</p>
    </div>`, 'lg');
  ptRenderRuleChips(); ptSetSign(1);
}
function ptBatchAll(v) { document.querySelectorAll('.pt-batch-st').forEach(c => c.checked = v); }
function savePtBatch() {
  const ids = Array.from(document.querySelectorAll('.pt-batch-st')).filter(c => c.checked).map(c => c.value);
  if (!ids.length) return alert('请至少选择一名学生');
  const dim = document.getElementById('ptDim').value;
  const val = Math.abs(parseInt(document.getElementById('ptValue').value, 10) || 0);
  const reason = document.getElementById('ptReason').value.trim();
  if (!val) return alert('请输入大于 0 的分值');
  const batchId = uid();
  ids.forEach(sid => ptWriteLog(sid, dim, val * ptSign, reason, batchId));
  save(); closeModal(); render();
}

// ---------- 规则预设 ----------
function openPtRules() {
  const grouped = POINT_DIMS.map(d => {
    const rs = state.points.rules.filter(r => r.dim === d.id);
    const st = dimStyle(d.id);
    return `<div>
      <div class="text-xs font-medium ${st.text} mb-2">${d.icon} ${d.label}</div>
      <div class="space-y-1.5">
        ${rs.length ? rs.map(r => `<div class="flex items-center gap-2 text-sm p-2 rounded-lg bg-gray-50">
          <span class="flex-1">${esc(r.label)}</span>
          <span class="font-bold ${ptDeltaCls(r.delta)}">${ptSigned(r.delta)}</span>
          <button class="text-gray-300 hover:text-red-500" onclick="deletePtRule('${r.id}')">🗑️</button>
        </div>`).join('') : '<div class="text-xs text-gray-400">暂无</div>'}
      </div>
    </div>`;
  }).join('');
  openModal('积分规则预设', `
    <div class="space-y-5">
      <div class="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
        <div class="text-xs font-medium text-primary">新增规则</div>
        <div class="grid grid-cols-3 gap-2">
          <select id="ruleDim" class="border rounded-lg p-2 text-sm">${POINT_DIMS.map(d => `<option value="${d.id}">${d.label}</option>`).join('')}</select>
          <input id="ruleLabel" class="border rounded-lg p-2 text-sm col-span-1" placeholder="规则名称">
          <input id="ruleDelta" type="number" step="1" value="2" class="border rounded-lg p-2 text-sm" placeholder="分值(可负)">
        </div>
        <button class="w-full bg-primary text-white py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="savePtRule()">+ 添加规则</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">${grouped}</div>
    </div>`, 'lg');
}
function savePtRule() {
  const dim = document.getElementById('ruleDim').value;
  const label = document.getElementById('ruleLabel').value.trim();
  const delta = parseInt(document.getElementById('ruleDelta').value, 10);
  if (!label) return alert('请输入规则名称');
  if (!delta) return alert('分值不能为 0');
  state.points.rules.push({ id: uid(), dim, label, delta });
  save(); openPtRules();
}
function deletePtRule(id) {
  state.points.rules = state.points.rules.filter(r => r.id !== id);
  save(); openPtRules();
}

// ---------- 职务（任职赋分） ----------
// ---------- 职务系统（任职赋分） ----------
let jobSelStuId = '';
function jobDays() {
  const start = new Date(state.points.jobStartDate || '2026-01-01');
  const today = new Date();
  const d = Math.floor((today - start) / 86400000);
  return d < 0 ? 0 : d;
}
function openPtJobs() {
  if (!state.students.length) return alert('请先在「学生管理」录入学生，再来分配职务');
  if (!jobSelStuId || !state.students.some(s => s.id === jobSelStuId)) jobSelStuId = state.students[0].id;
  openModal('职务系统 · 任职赋分', `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
        <span class="text-sm text-gray-600">任职积分起始日</span>
        <input id="jobStart" type="date" value="${esc(state.points.jobStartDate || '')}" class="border rounded-lg p-1.5 text-sm">
        <button class="border border-primary text-primary px-3 py-1.5 rounded-lg text-sm hover:bg-primary/5" onclick="saveJobStart()">保存日期</button>
        <button class="bg-primary text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primaryDark" onclick="calcJobScores()">🧮 按职务计算任职分</button>
      </div>
      <p class="text-[11px] text-gray-400">任职赋分 = （该生所有职务「每日积分」之和）× 自起始日至今的天数。点击按钮即按当前分配自动计算并记录，可随时重算、可逐条撤销。</p>
      <div class="flex gap-2 text-sm">
        <button id="jobTabAssignBtn" class="px-4 py-1.5 rounded-full bg-primary text-white" onclick="jobShow('assign')">📋 职务分配</button>
        <button id="jobTabManageBtn" class="px-4 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200" onclick="jobShow('manage')">⚙️ 管理职务</button>
      </div>
      <div id="jobAssignView">${renderJobAssign()}</div>
      <div id="jobManageView" class="hidden">${renderJobManage()}</div>
    </div>`, 'lg');
}
function jobShow(view) {
  document.getElementById('jobAssignView').classList.toggle('hidden', view !== 'assign');
  document.getElementById('jobManageView').classList.toggle('hidden', view !== 'manage');
  document.getElementById('jobTabAssignBtn').className = 'px-4 py-1.5 rounded-full ' + (view === 'assign' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200');
  document.getElementById('jobTabManageBtn').className = 'px-4 py-1.5 rounded-full ' + (view === 'manage' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200');
}
function renderJobAssign() {
  const days = jobDays();
  const stuHtml = state.students.map(s => {
    const jobs = ptJobsOf(s.id);
    const active = jobSelStuId === s.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
    return `<div class="px-2.5 py-1.5 rounded-lg text-sm cursor-pointer ${active} truncate" onclick="jobSelectStu('${s.id}')" title="${esc(jobs.join('、') || '未分配')}">${esc(s.name)}<span class="opacity-70 text-[10px]">${jobs.length ? ' ·' + jobs.length : ''}</span></div>`;
  }).join('');
  const selJobs = state.points.jobs.map(j => {
    const has = state.points.assigns.some(a => a.stuId === jobSelStuId && a.jobId === j.id);
    return `<label class="flex items-center gap-2 p-2 rounded-lg ${has ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-transparent'} cursor-pointer">
      <input type="checkbox" class="accent-primary" ${has ? 'checked' : ''} onchange="toggleJobAssign('${j.id}', this.checked)">
      <span class="flex-1 text-sm">${esc(j.name)}</span>
      <span class="text-xs text-gray-400">${j.daily}分/日</span>
    </label>`;
  }).join('') || '<div class="text-sm text-gray-400">还没有职务，先到「管理职务」添加</div>';
  return `
    <div class="grid grid-cols-2 gap-4">
      <div>
        <div class="text-xs text-gray-500 mb-2">学生（点击选择）</div>
        <div class="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">${stuHtml}</div>
      </div>
      <div>
        <div class="text-xs text-gray-500 mb-2">${esc((state.students.find(s => s.id === jobSelStuId) || {}).name || '')} 的职务</div>
        <div class="space-y-1.5 max-h-52 overflow-y-auto">${selJobs}</div>
      </div>
    </div>
    <div class="pt-3 border-t">
      <div class="text-xs text-gray-500 mb-2">分配总览（履职分 = 每日积分之和 × ${days} 天）</div>
      <div class="space-y-1.5 max-h-44 overflow-y-auto">${jobOverviewHtml(days)}</div>
    </div>`;
}
function jobOverviewHtml(days) {
  if (!state.students.length) return '<div class="text-sm text-gray-400">暂无学生</div>';
  const rows = state.students.map(s => {
    const jobs = state.points.assigns.filter(a => a.stuId === s.id).map(a => state.points.jobs.find(j => j.id === a.jobId)).filter(Boolean);
    const daily = jobs.reduce((sum, j) => sum + (+j.daily || 0), 0);
    const lv = daily * days;
    return `<div class="flex items-center gap-2 text-sm p-2 rounded-lg bg-gray-50">
      <span class="font-medium text-gray-800 w-16 truncate">${esc(s.name)}</span>
      <span class="flex-1 text-xs text-gray-500 truncate">${jobs.map(j => esc(j.name)).join('、') || '—'}</span>
      <span class="text-xs text-gray-400">${daily}分/日</span>
      <span class="font-bold text-primary w-16 text-right">${lv}</span>
    </div>`;
  });
  return rows.join('');
}
function renderJobAssignInto() { const el = document.getElementById('jobAssignView'); if (el) el.innerHTML = renderJobAssign(); }
function jobSelectStu(id) { jobSelStuId = id; renderJobAssignInto(); }
function toggleJobAssign(jobId, val) {
  if (!jobSelStuId) return;
  if (val) {
    if (!state.points.assigns.some(a => a.stuId === jobSelStuId && a.jobId === jobId))
      state.points.assigns.push({ stuId: jobSelStuId, jobId });
  } else {
    state.points.assigns = state.points.assigns.filter(a => !(a.stuId === jobSelStuId && a.jobId === jobId));
  }
  save(); renderJobAssignInto();
}
function saveJobStart() {
  const v = document.getElementById('jobStart').value;
  if (!v) return alert('请选择有效的起始日期');
  state.points.jobStartDate = v; save();
  renderJobAssignInto(); openPtJobs();
}
function calcJobScores() {
  const days = jobDays();
  if (days <= 0) return alert('任职积分起始日需早于今天，才能计算任职分');
  // 先移除上一次自动计算的任职分记录，再按当前分配重新生成
  state.points.logs = state.points.logs.filter(l => l.auto !== 'job');
  // 按学生聚合去重职务（学生↔职务应唯一，防止重复分配重复计分）
  const byStu = {};
  state.points.assigns.forEach(a => {
    if (!byStu[a.stuId]) byStu[a.stuId] = new Set();
    byStu[a.stuId].add(a.jobId);
  });
  let count = 0;
  Object.keys(byStu).forEach(sid => {
    let daily = 0;
    byStu[sid].forEach(jid => { const j = state.points.jobs.find(x => x.id === jid); if (j) daily += (+j.daily || 0); });
    if (!daily) return;
    const total = daily * days;
    ptWriteLog(sid, 'post', total, `履职任职分（每日${daily}分 × ${days}天）`, '', 'job');
    count++;
  });
  if (!count) return alert('还没有任何职务分配，请先在「职务分配」勾选');
  save(); closeModal(); render();
}

// ===================== 折算设置 =====================
function openConvertSettings() {
  const rows = POINT_DIMS.map(d => {
    const st = dimStyle(d.id);
    const v = state.convertRatios[d.id] != null ? state.convertRatios[d.id] : 1;
    return `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
      <span class="flex-1 text-sm ${st.text} font-medium">${d.icon} ${d.label}</span>
      <span class="text-xs text-gray-400">原始分 ×</span>
      <input id="conv_${d.id}" type="number" step="0.01" value="${v}" class="w-20 border rounded p-1.5 text-sm">
      <span class="text-xs text-gray-400">= 折算分</span>
    </div>`;
  }).join('');
  openModal('积分折算设置', `
    <div class="space-y-3">
      <p class="text-xs text-gray-500 leading-relaxed">每个维度的「原始分」乘以对应比例得到「折算分」，总分 = 各维度折算分之和。例如：体育原始分 100、比例 0.5 → 折算 50 分。可随时调整，立即生效。</p>
      ${rows}
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveConvertSettings()">保存折算比例</button>
    </div>`, 'md');
}
function saveConvertSettings() {
  POINT_DIMS.forEach(d => {
    const v = parseFloat(document.getElementById('conv_' + d.id).value);
    state.convertRatios[d.id] = isNaN(v) ? 1 : v;
  });
  save(); closeModal(); render();
}

// ===================== 积分 Excel / CSV 导入（按维度按姓名累加）=====================
function openPtImport() {
  openModal('批量导入积分（按姓名累加）', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs text-gray-500 mb-1">选择积分维度</label>
        <select id="ptImpDim" class="w-full border rounded-lg p-2 text-sm">
          ${POINT_DIMS.map(d => `<option value="${d.id}">${d.icon} ${d.label}</option>`).join('')}
        </select>
        <p class="text-[11px] text-gray-400 mt-1">体育 / 日常 一般每周结算；考试 日期不定 —— 都用此入口按姓名累加。</p>
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">粘贴 / 上传数据</label>
        <p class="text-[11px] text-gray-400 mb-1">每行一个：<code>姓名,分值</code>（制表符或逗号分隔）。按姓名匹配学生，累加分值。首行若是标题自动跳过。</p>
        <textarea id="ptImpText" rows="8" class="w-full border rounded-lg p-3 text-sm" placeholder="张明轩,5&#10;王浩然,3&#10;李思雨,-2"></textarea>
        <div class="mt-2"><input id="ptImpFile" type="file" accept=".csv,.txt,.xlsx" class="w-full text-sm"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button class="border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('ptImpText').value='姓名,分值\\n张明轩,5\\n王浩然,3'">填入示例</button>
        <button class="bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doPtImport()">导入并累加</button>
      </div>
    </div>`, 'lg');
  const f = document.getElementById('ptImpFile');
  if (f) f.addEventListener('change', () => {
    const file = f.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = e => { const t = document.getElementById('ptImpText'); if (t) t.value = e.target.result; };
    r.readAsText(file);
  });
}
function doPtImport() {
  const dim = document.getElementById('ptImpDim').value;
  const text = document.getElementById('ptImpText').value.trim();
  if (!text) return alert('请粘贴或上传积分数据');
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /姓名|name|学生|名字/.test(rows[0][0])) start = 1;
  let n = 0, matched = 0, unmatched = [];
  const batchId = uid();
  for (let i = start; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim();
    const val = parseFloat(rows[i][1]);
    if (!name || isNaN(val)) continue;
    const stu = state.students.find(s => s.name === name);
    if (!stu) { unmatched.push(name); continue; }
    ptWriteLog(stu.id, dim, val, `Excel导入`, batchId);
    matched++; n++;
  }
  if (!matched) return alert('没有匹配到任何学生，请检查姓名是否与「学生管理」一致。');
  // 导入即生成快照
  takeSnapshot('import');
  save(); closeModal();
  render();
  let msg = `成功导入 ${matched} 条（${dimLabel(dim)}）。`;
  if (unmatched.length) msg += `\n未匹配（姓名不存在）：${unmatched.join('、')}`;
  alert(msg);
}

// ===================== 历史快照（按日期回看积分榜）=====================
function takeSnapshot(type) {
  const date = new Date().toISOString().slice(0, 10);
  const ranking = state.students.map(s => ({ name: s.name, score: ptScoreOf(s.id), raw: ptRawTotal(s.id) }))
    .sort((a, b) => b.score - a.score);
  state.snapshots.unshift({ id: uid(), date, type: type || 'manual', ranking });
}
function openPtHistory() {
  const snapHtml = state.snapshots.length ? state.snapshots.map(sp => {
    const top = sp.ranking.slice(0, 5).map((r, i) => `<span class="text-xs text-gray-600">${i+1}.${esc(r.name)} ${fmtScore(r.score)}</span>`).join('　');
    return `<div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
      <span class="text-sm font-bold text-primary w-24">${sp.date}</span>
      <span class="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">${esc(sp.type)}</span>
      <div class="flex-1 flex flex-wrap gap-x-3 gap-y-1">${top}${sp.ranking.length>5?'…':''}</div>
      <button class="text-xs text-primary hover:underline" onclick="viewSnapshot('${sp.id}')">查看</button>
      <button class="text-gray-300 hover:text-red-500" onclick="delSnapshot('${sp.id}')">🗑️</button>
    </div>`;
  }).join('') : '<div class="text-sm text-gray-400 py-6 text-center">还没有快照。每周结算 / 每次导入会自动留档，也可手动点「生成快照」。</div>';
  openModal('积分历史（按日期回看）', `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-xs text-gray-500">每次导入 / 手动生成都会保留当天全班积分榜，可随时回看。</p>
        <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="manualSnapshot()">📸 生成快照</button>
      </div>
      <div class="space-y-2 max-h-[60vh] overflow-y-auto">${snapHtml}</div>
    </div>`, 'lg');
}
function manualSnapshot() { takeSnapshot('手动'); save(); openPtHistory(); }
function viewSnapshot(id) {
  const sp = state.snapshots.find(x => x.id === id); if (!sp) return;
  const rows = sp.ranking.map((r, i) => `<tr class="border-b hover:bg-gray-50"><td class="py-2 text-center text-gray-400">${i+1}</td><td class="py-2 font-medium">${esc(r.name)}</td><td class="py-2 text-right font-bold text-primary">${fmtScore(r.score)}</td><td class="py-2 text-right text-xs text-gray-400">原始 ${fmtScore(r.raw)}</td></tr>`).join('');
  openModal(`${sp.date} · 积分榜（${esc(sp.type)}）`, `
    <div class="space-y-3">
      <table class="w-full text-sm"><thead><tr class="text-gray-500 border-b"><th class="py-2 text-left">名次</th><th class="py-2 text-left">姓名</th><th class="py-2 text-right">折算分</th><th class="py-2 text-right">原始分</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`, 'lg');
}
function delSnapshot(id) { state.snapshots = state.snapshots.filter(x => x.id !== id); save(); openPtHistory(); }



// ===================== 成绩分析（数学单科 + 班级预设）=====================
const EXAM_SUBJECT = '数学';
let examTab = 'analysis'; // analysis | manage
let examSelectedStudent = ''; // 当前在榜单中选中的学生

function examClass(id) { return state.examData.classes.find(c => c.id === id); }
function examById(id) { return state.examData.exams.find(e => e.id === id); }
function examSubjects() {
  const set = new Set(state.examData.subjects);
  state.examData.records.forEach(r => r.subject && set.add(r.subject));
  return [...set];
}
function examRecords(examId, classId, subject) {
  return state.examData.records.filter(r => r.examId === examId && r.classId === classId && r.subject === subject);
}
function examAvg(examId, classId, subject) {
  const rs = examRecords(examId, classId, subject);
  if (!rs.length) return null;
  return rs.reduce((a, b) => a + (+b.score || 0), 0) / rs.length;
}
function examMax(examId, classId, subject) {
  const rs = examRecords(examId, classId, subject);
  if (!rs.length) return null;
  return Math.max(...rs.map(r => +r.score || 0));
}
function examMin(examId, classId, subject) {
  const rs = examRecords(examId, classId, subject);
  if (!rs.length) return null;
  return Math.min(...rs.map(r => +r.score || 0));
}
function examCount(examId, classId, subject) {
  return examRecords(examId, classId, subject).length;
}
function examPassRate(examId, classId, subject, passLine) {
  const rs = examRecords(examId, classId, subject);
  if (!rs.length) return null;
  return rs.filter(r => (+r.score || 0) >= passLine).length / rs.length;
}
function examGoodRate(examId, classId, subject, goodLine) {
  const rs = examRecords(examId, classId, subject);
  if (!rs.length) return null;
  return rs.filter(r => (+r.score || 0) >= goodLine).length / rs.length;
}
function studentSubjectSeries(studentName, subject) {
  return state.examData.exams
    .map(e => {
      const r = state.examData.records.find(x => x.examId === e.id && x.studentName === studentName && x.subject === subject);
      return r ? { exam: e.name, date: e.date, score: +r.score } : null;
    })
    .filter(Boolean);
}
function studentRankSeries(studentName, subject) {
  return state.examData.exams.map(e => {
    const mine = state.examData.records.find(r => r.examId === e.id && r.studentName === studentName && r.subject === subject);
    if (!mine) return null;
    const same = state.examData.records.filter(r => r.examId === e.id && r.classId === mine.classId && r.subject === subject);
    const sorted = [...same].sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(r => r.studentName === studentName) + 1;
    return { exam: e.name, date: e.date, score: +mine.score, rank };
  }).filter(Boolean);
}
function findClassIdByName(name) {
  for (const c of state.examData.classes) {
    if ((c.studentNames || []).includes(name)) return c.id;
  }
  return null;
}
function getStudentProgress(studentName, examId, subject) {
  const exams = state.examData.exams;
  const idx = exams.findIndex(e => e.id === examId);
  if (idx <= 0) return null;
  const current = state.examData.records.find(r => r.examId === examId && r.studentName === studentName && r.subject === subject);
  if (!current) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const prev = state.examData.records.find(r => r.examId === exams[i].id && r.studentName === studentName && r.subject === subject);
    if (prev) return { diff: (+current.score) - (+prev.score), prevScore: +prev.score };
  }
  return null;
}

function renderExam() {
  const tabs = [
    { id: 'analysis', label: '📊 成绩分析' },
    { id: 'manage', label: '⚙️ 数据管理' },
  ].map(t => `<button class="px-4 py-1.5 rounded-full text-sm transition ${examTab === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-primary/10'}" onclick="setExamTab('${t.id}')">${t.label}</button>`).join('');

  return `
  <div class="space-y-5">
    <div class="flex flex-wrap gap-2">${tabs}</div>
    <div id="exam-body">${examTab === 'manage' ? renderExamManage() : renderExamAnalysis()}</div>
  </div>`;
}
function setExamTab(t) { examTab = t; render(); }
function selectExamStudent(name) { examSelectedStudent = name; renderExamAnalysisInto(); }

// ---------- 数据管理 ----------
function addExamClass() {
  const id = 'c' + Date.now();
  state.examData.classes.push({ id, name: '新班级', studentNames: [] });
  save(); render();
}
function delExamClass(id) {
  if (state.examData.classes.length <= 1) return alert('至少保留一个班级');
  state.examData.records = state.examData.records.filter(r => r.classId !== id);
  state.examData.classes = state.examData.classes.filter(c => c.id !== id);
  save(); render();
}
function removeClassStudent(clsId, idx) {
  const c = examClass(clsId); if (!c) return;
  c.studentNames.splice(idx, 1);
  save(); render();
}
function clearClassNames(clsId) {
  const c = examClass(clsId); if (!c) return;
  c.studentNames = [];
  save(); render();
}
function uploadClassNames(clsId) {
  const f = document.getElementById('clsFile_' + clsId);
  const file = f && f.files[0]; if (!file) return alert('请先选择文件');
  const finish = (text) => {
    const names = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const c = examClass(clsId);
    if (c) { c.studentNames = names; save(); render(); alert(`已导入 ${names.length} 名学生到「${c.name}」`); }
  };
  if (/\.xlsx?$/i.test(file.name)) {
    file.arrayBuffer().then(buf => {
      try { const wb = XLSX.read(new Uint8Array(buf), { type: 'array' }); const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]); finish(csv); }
      catch (err) { alert('Excel 解析失败：' + err.message); }
    }).catch(() => alert('读取文件失败'));
  } else {
    const r = new FileReader(); r.onload = e => finish(e.target.result); r.readAsText(file);
  }
}
function saveExamClasses() {
  document.querySelectorAll('[data-cls]').forEach(el => {
    const c = examClass(el.dataset.cls); if (!c) return;
    c[el.dataset.field] = el.value;
  });
  document.querySelectorAll('[data-cls-names]').forEach(el => {
    const c = examClass(el.dataset.clsNames); if (!c) return;
    c.studentNames = el.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  });
  save(); render();
}

function renderExamManage() {
  const examOpts = state.examData.exams.map(e => `<option value="${e.id}">${esc(e.name)}（${esc(e.date || '')}）</option>`).join('') || '<option value="">（先添加考试）</option>';
  const clsOpts = state.examData.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const clsHtml = state.examData.classes.map(c => `
    <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div class="flex items-center gap-2 mb-3">
        <input class="flex-1 border rounded-lg p-2 text-sm font-medium" value="${esc(c.name)}" data-cls="${c.id}" data-field="name">
        <span class="text-xs text-gray-400">${c.studentNames.length}人</span>
        <button class="text-xs text-red-500 hover:underline px-2" onclick="clearClassNames('${c.id}')">清空</button>
        ${state.examData.classes.length > 1 ? `<button class="text-gray-300 hover:text-red-500" onclick="delExamClass('${c.id}')">🗑️</button>` : ''}
      </div>
      <div class="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
        ${c.studentNames.length ? c.studentNames.map((n, i) => `<span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">${esc(n)}<button class="text-gray-400 hover:text-red-500 leading-none" onclick="removeClassStudent('${c.id}', ${i})">×</button></span>`).join('') : '<span class="text-xs text-gray-400">暂无学生，请在下方粘贴或上传名单</span>'}
      </div>
      <textarea data-cls-names="${c.id}" rows="4" class="w-full border rounded-lg p-3 text-xs" placeholder="每行一个学生姓名，可批量粘贴">${esc(c.studentNames.join('\n'))}</textarea>
      <div class="flex gap-2 mt-2 items-center">
        <input id="clsFile_${c.id}" type="file" accept=".csv,.txt,.xlsx,.xls" class="text-xs flex-1">
        <button class="text-xs text-primary hover:underline" onclick="uploadClassNames('${c.id}')">上传名单</button>
      </div>
    </div>`).join('');

  return `
  <div class="space-y-5">
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">📋 班级名单</div>
        <button class="text-xs text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="addExamClass()">+ 增加班级</button>
      </div>
      <p class="text-xs text-gray-500 mb-3">设置班级数量与成员姓名，导入成绩时会按姓名自动匹配班级</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${clsHtml}</div>
      <button class="mt-4 text-sm text-primary hover:underline" onclick="saveExamClasses()">保存班级名称与名单</button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h3 class="font-bold text-gray-800">📝 考试管理</h3>
        <div class="flex gap-2">
          <input id="newExamName" class="flex-1 border rounded-lg p-2 text-sm" placeholder="考试名称，如：第一次月考">
          <input id="newExamDate" type="date" class="border rounded-lg p-2 text-sm">
          <button class="bg-primary text-white px-4 rounded-lg text-sm hover:bg-primaryDark" onclick="addExam()">添加</button>
        </div>
        <div class="space-y-1">${state.examData.exams.length ? state.examData.exams.map(e => `<div class="flex items-center gap-2 text-sm p-2 rounded bg-gray-50"><span class="flex-1">${esc(e.name)} <span class="text-gray-400 text-xs">${esc(e.date || '')}</span></span><button class="text-gray-300 hover:text-red-500" onclick="delExam('${e.id}')">🗑️</button></div>`).join('') : '<div class="text-gray-400 text-sm">暂无考试</div>'}</div>
      </div>

      <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h3 class="font-bold text-gray-800">📥 批量导入数学成绩</h3>
        <p class="text-[11px] text-gray-400">每行一个学生：<code>姓名,分数</code>。姓名会先与「班级名单」自动匹配班级。支持上传 Excel/CSV。</p>
        <select id="exImpExam" class="w-full border rounded-lg p-2 text-sm">${examOpts}</select>
        <textarea id="exImpText" rows="6" class="w-full border rounded-lg p-3 text-sm" placeholder="张明轩,88&#10;王浩然,92"></textarea>
        <input id="exImpFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm">
        <button class="w-full bg-primary text-white py-2 rounded-full text-sm hover:bg-primaryDark" onclick="doExamImport()">导入成绩</button>

        <h3 class="font-bold text-gray-800 pt-2 border-t mt-2">➕ 单条录入</h3>
        <div class="grid grid-cols-2 gap-3">
          <select id="exClass" class="border rounded-lg p-2 text-sm">${clsOpts}</select>
          <select id="exExam" class="border rounded-lg p-2 text-sm">${examOpts}</select>
          <input id="exName" class="border rounded-lg p-2 text-sm" placeholder="学生姓名">
          <input id="exScore" type="number" class="border rounded-lg p-2 text-sm" placeholder="数学分数">
          <button class="col-span-2 bg-primary text-white rounded-lg text-sm py-2 hover:bg-primaryDark" onclick="saveExamScore()">保存</button>
        </div>
      </div>
    </div>
  </div>`;
}
function addExam() {
  const name = document.getElementById('newExamName').value.trim();
  if (!name) return alert('请输入考试名称');
  const date = document.getElementById('newExamDate').value;
  state.examData.exams.push({ id: uid(), name, date });
  save(); render();
}
function delExam(id) {
  if (!confirm('删除该考试？其下所有成绩记录也会删除。')) return;
  state.examData.records = state.examData.records.filter(r => r.examId !== id);
  state.examData.exams = state.examData.exams.filter(e => e.id !== id);
  save(); render();
}
function saveExamScore() {
  const classId = document.getElementById('exClass').value;
  const examId = document.getElementById('exExam').value;
  const name = document.getElementById('exName').value.trim();
  const score = parseFloat(document.getElementById('exScore').value);
  const subject = EXAM_SUBJECT;
  if (!examId) return alert('请先选择考试');
  if (!name || isNaN(score)) return alert('请填写姓名和分数');
  const ex = state.examData.records.find(r => r.examId === examId && r.classId === classId && r.studentName === name && r.subject === subject);
  if (ex) ex.score = score;
  else state.examData.records.push({ id: uid(), examId, classId, studentName: name, subject, score });
  save(); render();
}
function doExamImport() {
  const examId = document.getElementById('exImpExam').value;
  if (!examId) return alert('请先选择考试');
  const text = document.getElementById('exImpText').value.trim();
  if (!text) return alert('请粘贴成绩数据');
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /姓名|name|学生|分数|score|数学/i.test(rows[0].join(''))) start = 1;
  let n = 0, unmatched = [];
  for (let i = start; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells.length) continue;
    let name = (cells[0] || '').trim();
    let score = parseFloat(cells[1]);
    if (!name || isNaN(score)) continue;
    let classId = findClassIdByName(name);
    if (!classId) { unmatched.push(name); continue; }
    const ex = state.examData.records.find(r => r.examId === examId && r.classId === classId && r.studentName === name && r.subject === EXAM_SUBJECT);
    if (ex) ex.score = score;
    else state.examData.records.push({ id: uid(), examId, classId, studentName: name, subject: EXAM_SUBJECT, score });
    n++;
  }
  save(); render();
  let msg = `成功导入 ${n} 条数学成绩。`;
  if (unmatched.length) msg += `\n未匹配到班级名单（未导入）：${unmatched.slice(0, 15).join('、')}${unmatched.length > 15 ? '…' : ''}`;
  alert(msg);
}

// ---------- 成绩分析看板 ----------
function renderExamAnalysis() {
  if (!state.examData.exams.length) return `<div class="bg-white rounded-2xl p-10 text-center shadow-sm"><div class="text-4xl mb-3">📊</div><div class="font-bold text-gray-800">还没有考试数据</div><p class="text-sm text-gray-500 mt-2">先到「数据管理」添加考试并导入成绩。</p></div>`;
  const lastExam = state.examData.exams[state.examData.exams.length - 1];
  const examOpts = state.examData.exams.map(e => `<option value="${e.id}" ${e.id === lastExam.id ? 'selected' : ''}>${esc(e.name)}（${esc(e.date || '')}）</option>`).join('');
  const clsChecks = state.examData.classes.map(c => `<label class="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-full bg-gray-100 cursor-pointer"><input type="checkbox" class="an-cls" value="${c.id}" checked> ${esc(c.name)}</label>`).join('');
  return `
  <div class="space-y-4">
    <div class="bg-white rounded-2xl p-5 shadow-sm flex flex-wrap gap-3 items-end">
      <div><label class="block text-xs text-gray-500 mb-1">考试</label><select id="anExam" class="border rounded-lg p-2 text-sm" onchange="renderExam()">${examOpts}</select></div>
      <div><label class="block text-xs text-gray-500 mb-1">班级</label><div class="flex flex-wrap gap-2" id="anClassWrap">${clsChecks}</div></div>
      <div><label class="block text-xs text-gray-500 mb-1">及格线</label><input id="anPass" type="number" value="72" class="border rounded-lg p-2 text-sm w-20"></div>
      <div><label class="block text-xs text-gray-500 mb-1">优秀线</label><input id="anGood" type="number" value="96" class="border rounded-lg p-2 text-sm w-20"></div>
      <button class="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primaryDark" onclick="renderExam()">刷新</button>
    </div>
    <div id="anSummary" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"></div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm"><canvas id="anCmpChart" height="170"></canvas></div>
      <div class="bg-white rounded-2xl p-5 shadow-sm"><canvas id="anTrendChart" height="170"></canvas></div>
    </div>
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">📋 学生榜单</div>
        <div class="text-xs text-gray-400">点击学生查看个人趋势</div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-gray-500 border-b text-left"><th class="py-2 w-16">排名</th><th class="py-2">姓名</th><th class="py-2">班级</th><th class="py-2">分数</th><th class="py-2">较上次</th></tr></thead>
          <tbody id="anRankBody"></tbody>
        </table>
      </div>
    </div>
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="font-bold text-gray-800 mb-3">👤 个人趋势</div>
      <div id="anPersonalWrap"><p class="text-sm text-gray-400">请在榜单中点击一名学生</p></div>
    </div>
  </div>`;
}
function renderExamAnalysisInto() {
  const examId = document.getElementById('anExam') && document.getElementById('anExam').value;
  if (!examId) return;
  const pass = +(document.getElementById('anPass').value || 72);
  const good = +(document.getElementById('anGood').value || 96);
  const checked = Array.from(document.querySelectorAll('.an-cls:checked')).map(c => c.value);
  const classes = state.examData.classes.filter(c => checked.includes(c.id));
  const exam = examById(examId);

  // 概览
  const totalCount = classes.reduce((sum, c) => sum + examCount(examId, c.id, EXAM_SUBJECT), 0);
  const scores = classes.flatMap(c => examRecords(examId, c.id, EXAM_SUBJECT).map(r => +r.score));
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const max = scores.length ? Math.max(...scores) : null;
  const min = scores.length ? Math.min(...scores) : null;
  const passCnt = scores.filter(s => s >= pass).length;
  const goodCnt = scores.filter(s => s >= good).length;
  const passRate = scores.length ? passCnt / scores.length : null;
  const goodRate = scores.length ? goodCnt / scores.length : null;

  const mkCard = (label, value, sub) => `<div class="bg-white rounded-xl p-4 shadow-sm text-center"><div class="text-xs text-gray-500 mb-1">${label}</div><div class="text-xl font-bold text-gray-800">${value}</div>${sub ? `<div class="text-[10px] text-gray-400 mt-0.5">${sub}</div>` : ''}</div>`;
  const fmtN = a => a == null ? '—' : a.toFixed(1);
  const fmtPct = a => a == null ? '—' : (a * 100).toFixed(1) + '%';
  const summaryEl = document.getElementById('anSummary');
  if (summaryEl) summaryEl.innerHTML = `
    ${mkCard('参考人数', totalCount, `${classes.length}个班`)}
    ${mkCard('平均分', fmtN(avg), exam ? esc(exam.name) : '')}
    ${mkCard('最高分', max == null ? '—' : max, '')}
    ${mkCard('最低分', min == null ? '—' : min, '')}
    ${mkCard('及格率', fmtPct(passRate), `≥${pass}`)}
    ${mkCard('优秀率', fmtPct(goodRate), `≥${good}`)}
  `;

  // 对比图
  if (window._anCmpChart) try { window._anCmpChart.destroy(); } catch (e) { }
  const cmpCtx = document.getElementById('anCmpChart');
  if (cmpCtx) {
    const labels = classes.map(c => c.name);
    const avgArr = classes.map(c => examAvg(examId, c.id, EXAM_SUBJECT));
    const passArr = classes.map(c => examPassRate(examId, c.id, EXAM_SUBJECT, pass));
    const goodArr = classes.map(c => examGoodRate(examId, c.id, EXAM_SUBJECT, good));
    window._anCmpChart = new Chart(cmpCtx.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [
        { label: '平均分', data: avgArr.map(a => a == null ? 0 : a), backgroundColor: '#f06292' },
        { label: '及格率%', data: passArr.map(a => a == null ? 0 : a * 100), backgroundColor: '#34d399' },
        { label: '优秀率%', data: goodArr.map(a => a == null ? 0 : a * 100), backgroundColor: '#60a5fa' },
      ]},
      options: { responsive: true, plugins: { title: { display: true, text: esc(exam ? exam.name : '班级对比') } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // 历次趋势图
  if (window._anTrendChart) try { window._anTrendChart.destroy(); } catch (e) { }
  const trCtx = document.getElementById('anTrendChart');
  if (trCtx) {
    const labels = state.examData.exams.map(e => e.name);
    const colors = ['#f06292', '#60a5fa', '#34d399', '#fbbf24'];
    const datasets = classes.map((c, idx) => {
      return { label: c.name, data: state.examData.exams.map(e => examAvg(e.id, c.id, EXAM_SUBJECT)).map(a => a == null ? null : a), borderColor: colors[idx % colors.length], backgroundColor: colors[idx % colors.length] + '20', fill: false, tension: .3 };
    });
    window._anTrendChart = new Chart(trCtx.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: { responsive: true, plugins: { title: { display: true, text: '平均分走势' } }, scales: { y: { beginAtZero: false } } }
    });
  }

  // 榜单
  let rankList = [];
  classes.forEach(c => {
    examRecords(examId, c.id, EXAM_SUBJECT).forEach(r => {
      const prog = getStudentProgress(r.studentName, examId, EXAM_SUBJECT);
      rankList.push({ name: r.studentName, classId: c.id, className: c.name, score: +r.score, progress: prog });
    });
  });
  rankList.sort((a, b) => b.score - a.score);
  if (!examSelectedStudent && rankList.length) examSelectedStudent = rankList[0].name;
  const rankBody = document.getElementById('anRankBody');
  if (rankBody) rankBody.innerHTML = rankList.map((r, i) => {
    const selected = r.name === examSelectedStudent ? 'bg-primary/5' : 'hover:bg-gray-50';
    const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `<span class="text-xs text-gray-400">${i + 1}</span>`;
    const progHtml = !r.progress ? '<span class="text-gray-400">—</span>' :
      (r.progress.diff > 0 ? `<span class="text-red-500 font-bold">↑${r.progress.diff}</span>` :
       r.progress.diff < 0 ? `<span class="text-emerald-600 font-bold">↓${-r.progress.diff}</span>` :
       '<span class="text-gray-500">—</span>');
    return `<tr class="border-b cursor-pointer ${selected}" onclick="selectExamStudent('${esc(r.name)}')">
      <td class="py-2.5 pl-2">${medal}</td>
      <td class="py-2.5 font-medium">${esc(r.name)}</td>
      <td class="py-2.5 text-gray-500">${esc(r.className)}</td>
      <td class="py-2.5 font-bold">${r.score}</td>
      <td class="py-2.5">${progHtml}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="py-6 text-center text-gray-400">暂无成绩记录</td></tr>';

  // 个人趋势
  renderExamPersonalInto();
}
function renderExamPersonalInto() {
  const wrap = document.getElementById('anPersonalWrap');
  if (!wrap) return;
  if (!examSelectedStudent) { wrap.innerHTML = '<p class="text-sm text-gray-400">请在榜单中点击一名学生</p>'; return; }
  const series = studentRankSeries(examSelectedStudent, EXAM_SUBJECT);
  if (!series.length) { wrap.innerHTML = '<p class="text-sm text-gray-400">该学生暂无成绩记录</p>'; return; }
  wrap.innerHTML = `<canvas id="anPsChart" height="170"></canvas><div id="anPsSummary" class="mt-3 text-sm text-gray-600"></div>`;
  setTimeout(() => {
    if (window._anPsChart) try { window._anPsChart.destroy(); } catch (e) { }
    const cv = document.getElementById('anPsChart');
    if (!cv) return;
    window._anPsChart = new Chart(cv.getContext('2d'), {
      type: 'line',
      data: { labels: series.map(s => s.exam), datasets: [
        { label: '数学成绩', data: series.map(s => s.score), borderColor: '#f06292', backgroundColor: 'rgba(240,98,146,.1)', fill: true, tension: .3, yAxisID: 'y' },
        { label: '班级排名', data: series.map(s => s.rank), borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,.1)', fill: false, tension: .3, yAxisID: 'y1' },
      ]},
      options: { responsive: true, plugins: { title: { display: true, text: `${esc(examSelectedStudent)} 数学成绩与排名变化` } }, scales: { y: { type: 'linear', display: true, position: 'left', title: { display: true, text: '分数' }, beginAtZero: false }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: '排名' }, reverse: true, beginAtZero: false, grid: { drawOnChartArea: false } } } }
    });
    const el = document.getElementById('anPsSummary');
    if (!el) return;
    if (series.length >= 2) {
      const first = series[0], last = series[series.length - 1];
      const diff = (last.score - first.score).toFixed(1);
      const rankDiff = first.rank - last.rank;
      el.innerHTML = `共 ${series.length} 次考试：最高 ${Math.max(...series.map(s => s.score))}、最低 ${Math.min(...series.map(s => s.score))}、平均 ${(series.reduce((a, b) => a + b.score, 0) / series.length).toFixed(1)}。<br>较首次成绩 <b class="${diff >= 0 ? 'text-red-500' : 'text-emerald-600'}">${diff >= 0 ? '+' : ''}${diff}</b> 分，排名 <b class="${rankDiff > 0 ? 'text-red-500' : rankDiff < 0 ? 'text-emerald-600' : 'text-gray-600'}">${rankDiff > 0 ? '上升' + rankDiff + '名' : rankDiff < 0 ? '下降' + (-rankDiff) + '名' : '持平'}</b>。`;
    } else {
      el.innerHTML = `仅有 1 次记录：${series[0].score} 分，班级排名 ${series[0].rank}。`;
    }
  }, 0);
}

// 在 render() 后渲染图表 / 绑定文件
const _origRender = render;
render = function() {
  _origRender();
  setTimeout(() => {
    if (currentRoute === 'exam') {
      if (examTab === 'manage') bindFileToText('exImpFile', 'exImpText');
      else if (examTab === 'analysis') renderExamAnalysisInto();
    }
  }, 0);
};


function renderJobManage() {
  const jobRows = state.points.jobs.map(j => `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
      <input class="flex-1 border rounded p-1.5 text-sm" value="${esc(j.name)}" data-job="${j.id}" data-field="name">
      <div class="flex items-center gap-1 text-sm text-gray-500">每日<input class="w-16 border rounded p-1 text-sm" type="number" step="0.5" value="${j.daily}" data-job="${j.id}" data-field="daily">分</div>
      <button class="text-gray-300 hover:text-red-500" onclick="deleteJob('${j.id}')">🗑️</button>
    </div>`).join('');
  return `
    <div class="space-y-2 max-h-64 overflow-y-auto">${jobRows || '<div class="text-sm text-gray-400">暂无职务</div>'}</div>
    <div class="flex gap-2 mt-3">
      <input id="newJobName" class="flex-1 border rounded-lg p-2 text-sm" placeholder="新增职务名称">
      <input id="newJobDaily" type="number" step="0.5" value="1" class="w-20 border rounded-lg p-2 text-sm" title="每日积分">
      <button class="border border-primary text-primary px-3 rounded-lg text-sm hover:bg-primary/5" onclick="addJob()">添加</button>
    </div>
    <div class="flex gap-2 mt-2">
      <button class="text-xs text-primary hover:underline" onclick="importJobs()">⬆️ 粘贴导入职务（格式：职务名称,每日积分）</button>
    </div>`;
}
function collectJobs() {
  document.querySelectorAll('[data-job]').forEach(el => {
    const j = state.points.jobs.find(x => x.id === el.dataset.job); if (!j) return;
    const f = el.dataset.field;
    j[f] = f === 'daily' ? (+el.value || 0) : el.value;
  });
}
function renderJobManageInto() { const el = document.getElementById('jobManageView'); if (el) el.innerHTML = renderJobManage(); }
function addJob() {
  collectJobs();
  const name = document.getElementById('newJobName').value.trim();
  const daily = +document.getElementById('newJobDaily').value || 0;
  if (!name) return alert('请输入职务名称');
  state.points.jobs.push({ id: uid(), name, daily });
  save(); renderJobManageInto();
}
function deleteJob(id) {
  state.points.jobs = state.points.jobs.filter(j => j.id !== id);
  state.points.assigns = state.points.assigns.filter(a => a.jobId !== id);
  save(); renderJobManageInto(); renderJobAssignInto();
}
function importJobs() {
  openModal('批量导入职务（支持 Excel / CSV）', `
    <div class="space-y-4">
      <p class="text-xs text-gray-500 leading-relaxed">每行一个职务，格式：<code>职务名称,每日积分</code>（制表符或逗号分隔）。首行若是标题自动跳过。也可上传 .xlsx / .xls / .csv 文件。</p>
      <textarea id="impJobsText" rows="8" class="w-full border rounded-lg p-3 text-sm" placeholder="班长,2&#10;学习委员,2&#10;体育委员,1.5"></textarea>
      <div><input id="impJobsFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm"></div>
      <div class="flex gap-2">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('impJobsText').value='班长,2\\n学习委员,2\\n体育委员,1.5'">填入示例</button>
        <button class="bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doImportJobs()">导入</button>
      </div>
    </div>`, 'lg');
  const f = document.getElementById('impJobsFile');
  if (f) f.addEventListener('change', () => {
    const file = f.files[0]; if (!file) return;
    const r = new FileReader();
    if (/\.xlsx?$/i.test(file.name)) {
      r.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
          document.getElementById('impJobsText').value = csv;
        } catch (err) { alert('Excel 解析失败：' + err.message); }
      };
      file.arrayBuffer().then(buf => r.readAsArrayBuffer(new Blob([buf]))).catch(()=>alert('读取文件失败'));
    } else {
      r.onload = e => { document.getElementById('impJobsText').value = e.target.result; };
      r.readAsText(file);
    }
  });
}
function doImportJobs() {
  const text = document.getElementById('impJobsText').value.trim();
  if (!text) return alert('请粘贴或上传职务数据');
  collectJobs();
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /职务|名称|name|职位/.test(rows[0][0])) start = 1;
  let n = 0;
  for (let i = start; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim();
    if (!name) continue;
    const daily = parseFloat(rows[i][1]) || 0;
    if (!state.points.jobs.some(j => j.name === name))
      state.points.jobs.push({ id: uid(), name, daily });
    n++;
  }
  if (!n) return alert('没有可导入的职务');
  save(); closeModal(); renderJobManageInto(); renderJobAssignInto();
}

// ---------- 积分日志 / 撤销 ----------
let ptLogDim = 'all', ptLogStudent = 'all';
function openPtLogs() { renderPtLogModal(); }
function setPtLogFilter() {
  ptLogDim = document.getElementById('logDim').value;
  ptLogStudent = document.getElementById('logStudent').value;
  const box = document.getElementById('ptLogList');
  if (box) box.innerHTML = renderPtLogList();
}
function renderPtLogList() {
  let logs = state.points.logs.slice();
  if (ptLogDim !== 'all') logs = logs.filter(l => l.dim === ptLogDim);
  if (ptLogStudent !== 'all') logs = logs.filter(l => l.studentId === ptLogStudent);
  if (!logs.length) return '<div class="text-sm text-gray-400 py-8 text-center">暂无积分记录</div>';
  return logs.slice(0, 300).map(l => {
    const st = dimStyle(l.dim);
    return `<div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
      <div class="text-lg">${dimIcon(l.dim)}</div>
      <div class="flex-1 min-w-0">
        <div class="text-sm text-gray-800 truncate">${esc(l.studentName || ptStudentName(l.studentId))} · ${esc(l.reason)}</div>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.text}">${dimLabel(l.dim)}</span>
          <span class="text-[10px] text-gray-400">${esc(l.date)}</span>
          ${l.batchId ? `<button class="text-[10px] text-primary hover:underline" onclick="undoPtBatch('${l.batchId}')">批量·撤销整批</button>` : ''}
        </div>
      </div>
      <div class="font-bold ${ptDeltaCls(l.delta)} w-12 text-right">${ptSigned(l.delta)}</div>
      <button class="text-xs text-gray-400 hover:text-red-500 shrink-0" onclick="undoPtLog('${l.id}')">撤销</button>
    </div>`;
  }).join('');
}
function renderPtLogModal() {
  openModal('积分日志', `
    <div class="space-y-4">
      <div class="flex gap-2">
        <select id="logDim" class="flex-1 border rounded-lg p-2 text-sm" onchange="setPtLogFilter()">
          <option value="all" ${ptLogDim === 'all' ? 'selected' : ''}>全部维度</option>
          ${POINT_DIMS.map(d => `<option value="${d.id}" ${ptLogDim === d.id ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
        <select id="logStudent" class="flex-1 border rounded-lg p-2 text-sm" onchange="setPtLogFilter()">
          <option value="all" ${ptLogStudent === 'all' ? 'selected' : ''}>全部学生</option>
          ${state.students.map(s => `<option value="${s.id}" ${ptLogStudent === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div id="ptLogList" class="space-y-2 max-h-[55vh] overflow-y-auto">${renderPtLogList()}</div>
      <div class="pt-3 border-t flex gap-3">
        <button class="flex-1 text-sm border border-red-200 text-red-500 py-2 rounded-full hover:bg-red-50" onclick="clearPtLogs()">清空全部积分记录</button>
      </div>
    </div>`, 'lg');
}
function undoPtLog(id) {
  state.points.logs = state.points.logs.filter(l => l.id !== id);
  save(); renderPtLogModal();
}
function undoPtBatch(batchId) {
  const n = state.points.logs.filter(l => l.batchId === batchId).length;
  confirmModal(`该批次共 ${n} 条记录，确定全部撤销？`, function(){
    state.points.logs = state.points.logs.filter(l => l.batchId !== batchId);
    save(); renderPtLogModal();
  });
}
function clearPtLogs() {
  confirmModal('将清空所有积分记录，全班积分归零（规则和职务设置保留）。确定？', function(){
    state.points.logs = [];
    save(); closeModal(); render();
  });
}

// ---------- 学生积分详情 ----------
function openPtStudent(sid) {
  const s = state.students.find(x => x.id === sid); if (!s) return;
  const logs = ptStudentLogs(sid);
  const rank = ptRanked('all').findIndex(x => x.s.id === sid) + 1;
  openModal(`${esc(s.name)} · 积分详情`, `
    <div class="space-y-4">
      <div class="flex items-center gap-4">
        <img src="${esc(s.avatar)}" class="w-14 h-14 rounded-full bg-gray-100" alt="">
        <div class="flex-1">
          <div class="font-bold text-lg">${esc(s.name)} ${ptJobsOf(sid).map(n => `<span class="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 align-middle">${esc(n)}</span>`).join(' ')}</div>
          <div class="text-sm text-gray-500">${esc(s.class || '')} · 班级排名第 ${rank} 名</div>
        </div>
        <div class="text-right"><div class="text-3xl font-bold text-primary">${fmtScore(ptTotal(sid))}</div><div class="text-[10px] text-gray-400">总积分</div></div>
      </div>
      <div class="grid grid-cols-4 gap-2">
        ${POINT_DIMS.map(d => { const st = dimStyle(d.id);
          return `<div class="rounded-xl p-3 text-center ${st.bg}"><div class="text-[10px] ${st.text}">${d.icon} ${d.label}</div><div class="text-xl font-bold ${st.text} mt-0.5">${fmtScore(ptDimScore(sid, d.id))}</div></div>`; }).join('')}
      </div>
      <div class="flex gap-2">
        <button class="flex-1 bg-red-50 text-red-500 py-2 rounded-full text-sm hover:bg-red-100" onclick="closeModal(); openPtAdjust('${sid}','daily',1)">＋ 加分</button>
        <button class="flex-1 bg-emerald-50 text-emerald-600 py-2 rounded-full text-sm hover:bg-emerald-100" onclick="closeModal(); openPtAdjust('${sid}','daily',-1)">－ 扣分</button>
        <button class="flex-1 border border-gray-300 py-2 rounded-full text-sm hover:bg-gray-50" onclick="closeModal(); openStudentProfile('${sid}')">📁 学生档案</button>
      </div>
      <div>
        <div class="text-xs text-gray-500 mb-2">积分记录（${logs.length} 条）</div>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          ${logs.length ? logs.map(l => { const st = dimStyle(l.dim);
            return `<div class="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 text-sm">
              <span>${dimIcon(l.dim)}</span>
              <div class="flex-1 min-w-0"><div class="truncate text-gray-700">${esc(l.reason)}</div>
              <div class="flex gap-2 mt-0.5"><span class="text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.text}">${dimLabel(l.dim)}</span><span class="text-[10px] text-gray-400">${esc(l.date)}</span></div></div>
              <span class="font-bold ${ptDeltaCls(l.delta)}">${ptSigned(l.delta)}</span>
              <button class="text-gray-300 hover:text-red-500 text-xs" onclick="undoPtLogFromStudent('${l.id}','${sid}')">撤销</button>
            </div>`; }).join('') : '<div class="text-sm text-gray-400">暂无积分记录</div>'}
        </div>
      </div>
    </div>`, 'lg');
}
function undoPtLogFromStudent(id, sid) {
  state.points.logs = state.points.logs.filter(l => l.id !== id);
  save(); openPtStudent(sid);
}

// ---------- 首页积分卡片 ----------
function renderHomePointsCard() {
  const top = ptRanked('all').slice(0, 5);
  const week = ptRecent(7);
  const medals = ['🥇', '🥈', '🥉'];
  return `
  <div class="col-span-12 bg-white rounded-2xl p-5 card-hover">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800">🏆 积分榜（Top 5）</div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-400">近7天 ${ptSum(week) >= 0 ? '+' : ''}${ptSum(week)} 分 / ${week.length} 条</span>
        <button class="text-xs text-primary hover:underline" onclick="navigate('points')">积分管理</button>
      </div>
    </div>
    ${top.length ? `<div class="grid grid-cols-1 sm:grid-cols-5 gap-3">
      ${top.map((x, i) => `<div class="p-3 rounded-xl bg-gray-50 text-center cursor-pointer hover:bg-primary/5 transition" onclick="openPtStudent('${x.s.id}')">
        <div class="text-lg">${medals[i] || `<span class="text-xs text-gray-400">${i + 1}</span>`}</div>
        <img src="${esc(x.s.avatar)}" class="w-9 h-9 rounded-full bg-white mx-auto my-1" alt="">
        <div class="text-sm font-medium text-gray-800 truncate">${esc(x.s.name)}</div>
        <div class="text-lg font-bold text-primary">${fmtScore(x.score)}</div>
      </div>`).join('')}
    </div>` : '<div class="text-sm text-gray-400">还没有学生或积分记录，去「积分管理」开始吧。</div>'}
    <div class="flex gap-2 mt-4">
      <button class="flex-1 text-sm border border-primary text-primary py-2 rounded-full hover:bg-primary/5" onclick="openPtAdjust(null,'daily',1)">＋ 快速加减分</button>
      <button class="flex-1 text-sm border border-gray-300 py-2 rounded-full hover:bg-gray-50" onclick="openPtBatch()">批量加减分</button>
    </div>
  </div>`;
}

// ===================== 智能快速记录（自然语言识别） =====================
// 记录类型：类型标签词（既用于识别、也会从内容中剔除，都是明确的「类型动词」）
const REC_TYPE_LABELS_WORDS = {
  critic: ['批评', '罚站', '罚抄', '处罚', '违纪', '迟到', '早退', '打架', '顶撞', '不交', '没交', '未完成', '没完成', '犯错', '扣分', '警告', '处分', '玩手机', '走神', '睡觉', '抄袭', '作弊', '说话'],
  praise: ['表扬', '夸奖', '夸', '赞', '得奖', '获奖', '奖励', '突出', '满分', '高分', '守纪律', '好人好事'],
  chat:   ['谈心', '谈话', '沟通', '家访', '约谈', '开导', '安慰', '鼓励', '交流'],
};
// 仅用于识别的描述性短语（不剔除，保证正文完整，如「主动帮助同学」「作业优秀」）
const REC_TYPE_DESC = {
  critic: ['顶撞', '玩手机', '走神', '睡觉', '抄袭', '作弊', '吵架', '打架'],
  praise: ['主动帮助同学', '帮助同学', '助人为乐', '表现好', '值日认真', '作业优秀', '一等奖', '二等奖', '三等奖', '积极发言', '主动', '认真', '勤奋', '贴心', '懂事', '优秀', '进步', '棒'],
  chat:   ['心理疏导', '聊天', '聊到', '聊了', '情绪低落'],
};
// 识别/剔除用的「引出词」（如「提出表扬」的「提出」）
const REC_LEADIN = ['提出', '给予', '予以', '进行', '做了', '被'];
const REC_TYPE_LABELS = { critic: '批评', praise: '表扬', chat: '谈心' };
const REC_TYPE_EMOJI  = { critic: '⚠️', praise: '👍', chat: '💬' };
// 积分维度识别：根据关键词自动判断所属模块
const QR_DIM_KWS = {
  sport: ['体育', '早训', '早操', '课间操', '锻炼', '运动会', '跑步', '跳绳', '体测', '体育课', '篮球', '足球', '排球', '乒乓球', '游泳', '体能'],
  exam:  ['考试', '测验', '月考', '期中', '期末', '满分', '高分', '成绩', '排名', '进步', '退步', '各科', '数学', '英语', '语文', '物理', '化学'],
  post:  ['班长', '课代表', '委员', '组长', '履职', '职务', '负责', '收发作业', '班干部', '团支书'],
  daily: ['课堂', '纪律', '作业', '值日', '卫生', '主动', '帮助', '迟到', '早退', '校服', '红领巾', '文明'],
};

// 智能解析：返回 { students:[{id,name}], types:[...], content, matched:[], autoDim }
function parseQuickRecord(text) {
  text = (text || '').trim();
  const matched = [];
  // 1) 识别学生
  const studentHits = [];
  const cand = state.students.map(s => {
    const aliases = [s.name].concat((s.alias || '').split(/\s+/).filter(Boolean));
    return { s, aliases };
  });
  cand.forEach(({ s, aliases }) => {
    aliases.sort((a, b) => b.length - a.length);
    for (const a of aliases) {
      if (a && text.includes(a)) {
        studentHits.push({ id: s.id, name: s.name, alias: a, len: a.length });
        matched.push({ kind: 'student', value: s.name });
        break;
      }
    }
  });
  // 2) 识别记录类型（多个）
  const types = [];
  for (const t of ['critic', 'praise', 'chat']) {
    let hitKw = '';
    for (const kw of REC_TYPE_LABELS_WORDS[t]) { if (text.includes(kw)) { hitKw = kw; break; } }
    if (!hitKw) for (const kw of (REC_TYPE_DESC[t] || [])) { if (text.includes(kw)) { hitKw = kw; break; } }
    if (hitKw) { types.push(t); matched.push({ kind: 'type', value: hitKw, type: t }); }
  }
  // 3) 识别积分维度
  let autoDim = 'daily';
  const dimOrder = ['sport', 'post', 'exam', 'daily']; // 命中顺序：体育/职务/考试优先，否则日常
  for (const dim of dimOrder) {
    for (const kw of QR_DIM_KWS[dim]) {
      if (text.includes(kw)) { autoDim = dim; matched.push({ kind: 'dim', value: kw, dim }); break; }
    }
    if (autoDim !== 'daily') break;
  }
  // 4) 内容清洗
  let content = text;
  studentHits.forEach(h => { content = content.split(h.alias).join(''); });
  for (const t of ['critic', 'praise', 'chat']) {
    for (const kw of REC_TYPE_LABELS_WORDS[t]) { if (content.includes(kw)) content = content.split(kw).join(''); }
  }
  REC_LEADIN.forEach(kw => { if (content.includes(kw)) content = content.split(kw).join(''); });
  content = content.replace(/\s{2,}/g, ' ').replace(/[，。、；：,.]+$/g, '').replace(/^[，。、；：,.]+/g, '').trim();
  if (!content) content = text;
  return { students: studentHits, types: Array.from(new Set(types)), content, matched, autoDim };
}

let qrDraft = null; // 当前确认草稿
function openQuickRecord() {
  const tip = '示例：「张明轩参加体育早训，表扬；秦梦茹月考满分，表扬；王浩然迟到批评」\n系统会自动识别 学生、类型、积分模块，确认后一键记录并加减分。';
  openModal('智能快速记录', `
    <div class="space-y-3">
      <p class="text-xs text-gray-500 leading-relaxed whitespace-pre-line">${esc(tip)}</p>
      <textarea id="qrText" rows="3" class="w-full border rounded-lg p-3 text-sm" placeholder="输入一句话，例如：张明轩今天主动帮助同学，提出表扬"></textarea>
      <div class="flex gap-2">
        <button class="flex-1 bg-primary text-white py-2 rounded-full text-sm hover:bg-primaryDark" onclick="qrRecognize()">🔍 识别</button>
        <button class="px-4 border border-gray-300 rounded-full text-sm hover:bg-gray-50" onclick="qrFillExample()">填充示例</button>
      </div>
      <div id="qrResult"></div>
    </div>`, 'lg');
}
function qrFillExample() {
  const ta = document.getElementById('qrText');
  if (ta) ta.value = '孙中杰参加体育早训，提出表扬；秦梦茹数学月考满分，表扬；王浩然迟到批评';
  qrRecognize();
}
function qrRecognize() {
  const text = document.getElementById('qrText').value;
  if (!text.trim()) return alert('请先输入内容');
  const r = parseQuickRecord(text);
  qrDraft = r;
  const typeChips = ['critic', 'praise', 'chat'].map(t => {
    const on = r.types.includes(t);
    return `<button type="button" data-qrtype="${t}" onclick="qrToggleType('${t}')" class="qr-type ${on?'qr-on':'qr-off'}">${REC_TYPE_EMOJI[t]} ${REC_TYPE_LABELS[t]}</button>`;
  }).join('');
  const stuChips = state.students.map(s => {
    const on = r.students.some(x => x.id === s.id);
    return `<button type="button" data-qrstu="${s.id}" onclick="qrToggleStu('${s.id}')" class="qr-stu ${on?'qr-on':'qr-off'}">${esc(s.name)}</button>`;
  }).join('');
  const dimChips = POINT_DIMS.map(d => {
    const on = r.autoDim === d.id;
    return `<button type="button" data-qrdim="${d.id}" onclick="qrSetDim('${d.id}')" class="qr-type ${on?'qr-on':'qr-off'}">${d.icon} ${d.label}</button>`;
  }).join('');
  const matchedText = (r.matched.length ? r.matched.map(m => {
    if (m.kind === 'student') return '👤 ' + m.value;
    if (m.kind === 'type') return REC_TYPE_EMOJI[m.type] + ' ' + m.value;
    return dimIcon(m.dim) + ' ' + m.value;
  }).join('　') : '未识别到学生或类型，请手动选择');
  document.getElementById('qrResult').innerHTML = `
    <div class="rounded-xl border p-4 space-y-4 bg-gray-50">
      <div><div class="text-xs text-gray-500 mb-1">识别结果</div><div class="text-xs text-primary">${esc(matchedText)}</div></div>
      <div><div class="text-xs text-gray-500 mb-1">学生（可增删，默认全选识别到的）</div>
        <div class="flex flex-wrap gap-2">${stuChips}</div></div>
      <div><div class="text-xs text-gray-500 mb-1">记录类型（可多选）</div>
        <div class="flex flex-wrap gap-2">${typeChips}</div></div>
      <div><div class="text-xs text-gray-500 mb-1">自动积分模块（可修改）</div>
        <div class="flex flex-wrap gap-2">${dimChips}</div></div>
      <div><div class="text-xs text-gray-500 mb-1">自动分值（表扬为正，批评为负，谈心不计）</div>
        <input id="qrPointVal" type="number" value="1" class="w-24 border rounded-lg p-2 text-sm" placeholder="1"></div>
      <div><div class="text-xs text-gray-500 mb-1">记录内容</div>
        <textarea id="qrContent" rows="3" class="w-full border rounded-lg p-3 text-sm">${esc(r.content)}</textarea></div>
      <div><div class="text-xs text-gray-500 mb-1">日期</div><input id="qrDate" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
      <div class="flex gap-2 pt-1">
        <button class="flex-1 bg-primary text-white py-2 rounded-full text-sm hover:bg-primaryDark" onclick="qrSave()">✅ 一键记录</button>
        <button class="px-4 border border-gray-300 rounded-full text-sm hover:bg-gray-50" onclick="closeModal(); openFabDefault()">取消</button>
      </div>
    </div>`;
}
function qrSetDim(dim) {
  qrDraft.autoDim = dim;
  document.querySelectorAll('[data-qrdim]').forEach(b => {
    if (b.dataset.qrdim === dim) { b.classList.add('qr-on'); b.classList.remove('qr-off'); }
    else { b.classList.remove('qr-on'); b.classList.add('qr-off'); }
  });
}
function qrToggleType(t) {
  const btn = document.querySelector(`[data-qrtype="${t}"]`);
  const on = btn.classList.contains('qr-on');
  if (on) { qrDraft.types = qrDraft.types.filter(x => x !== t); btn.classList.remove('qr-on'); btn.classList.add('qr-off'); }
  else { qrDraft.types.push(t); btn.classList.add('qr-on'); btn.classList.remove('qr-off'); }
}
function qrToggleStu(id) {
  const btn = document.querySelector(`[data-qrstu="${id}"]`);
  const on = btn.classList.contains('qr-on');
  if (on) { qrDraft.students = qrDraft.students.filter(x => x.id !== id); btn.classList.remove('qr-on'); btn.classList.add('qr-off'); }
  else { const s = state.students.find(x => x.id === id); qrDraft.students.push({ id: s.id, name: s.name }); btn.classList.add('qr-on'); btn.classList.remove('qr-off'); }
}
// 快速记录：识别后按对应模块自动加减分，表扬+ / 批评- / 谈心0
function qrSave() {
  const content = document.getElementById('qrContent').value.trim();
  const date = document.getElementById('qrDate').value.trim() || todayLabel;
  const pointVal = Math.abs(parseFloat(document.getElementById('qrPointVal').value) || 1);
  if (!qrDraft.students.length) return alert('请至少选择一个学生');
  if (!qrDraft.types.length) return alert('请至少选择一个记录类型');
  if (!content) return alert('请输入记录内容');
  let n = 0;
  const autoPointLogs = [];
  qrDraft.students.forEach(st => {
    qrDraft.types.forEach(t => {
      const s = state.students.find(x => x.id === st.id);
      if (!s) return;
      s.records.unshift({ id: uid(), type: t, date, content }); n++;
      // 自动按对应模块加减分
      let delta = 0;
      if (t === 'praise') delta = +pointVal;
      else if (t === 'critic') delta = -pointVal;
      // 谈心 / 未识别类型不计分
      if (delta !== 0) {
        const dim = qrDraft.autoDim || 'daily';
        ptWriteLog(s.id, dim, delta, `快速记录·${REC_TYPE_LABELS[t]}：${content.slice(0, 20)}`);
        autoPointLogs.push(`${s.name} ${dimLabel(dim)}${delta>=0?'+':''}${delta}`);
      }
    });
  });
  lastRecordContent = content;

  // 同步写入班级日志：汇总显示学生、类型、内容及自动积分
  const typeText = qrDraft.types.map(t => REC_TYPE_LABELS[t]).join('/');
  const stuText = qrDraft.students.map(st => st.name).join('、');
  let logContent = `快速记录【${typeText}】${stuText}：${content}`;
  if (autoPointLogs.length) logContent += `（${autoPointLogs.join('、')}）`;
  state.classLogs.unshift({ id: uid(), date, content: logContent });

  save(); closeModal();
  let msg = `已为 ${qrDraft.students.length} 名学生 × ${qrDraft.types.length} 种类型，共记录 ${n} 条`;
  if (autoPointLogs.length) msg += `\n（自动积分：${autoPointLogs.join('、')}）`;
  toast(msg);
  render();
}
// 轻量提示
function toast(text) {
  const root = document.getElementById('undo-root');
  if (!root) return;
  let el = document.getElementById('qrToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'qrToast';
    el.className = 'undo-toast';
    root.appendChild(el);
  }
  el.innerHTML = `<span>${esc(text)}</span>`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2200);
  el.style.opacity = '1';
}

// ===================== FAB =====================
function openFabDefault() {
  openModal('快速记录', `
    <div class="space-y-4">
      <button class="w-full text-left p-4 rounded-xl bg-primary/10 hover:bg-primary/20 font-medium" onclick="closeModal(); openQuickRecord()">🤖 智能记录（输入一句话自动识别）</button>
      <button class="w-full text-left p-4 rounded-xl bg-primary/5 hover:bg-primary/10" onclick="closeModal(); openPtAdjust(null,'daily',1)">🏆 积分加分 / 扣分</button>
      <button class="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-primary/5" onclick="closeModal(); openPtBatch()">👥 批量加减分</button>
      <button class="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-primary/5" onclick="closeModal(); openStudentForm(null)">👤 新建学生</button>
      <button class="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-primary/5" onclick="closeModal(); openRecordForm(state.students[0]?state.students[0].id:null)">📈 添加行为记录</button>
      <button class="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-primary/5" onclick="closeModal(); openClassLogForm()">📝 写班级日志</button>
      <button class="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-primary/5" onclick="closeModal(); openCommForm()">💬 记录家校沟通</button>
      <button class="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-primary/5" onclick="closeModal(); openTodoForm()">🔔 新建待办</button>
    </div>`, 'sm');
}

// ===================== Data management =====================
// 修改密码固定口令（前后端保持一致，可通过环境变量 RESET_PASSWORD_CODE 覆盖后端默认值）
const RESET_PASSWORD_CODE = 'teacher2024';

function openSettings() {
  openModal('设置', `
    <div class="grid grid-cols-2 gap-3 text-sm">
      <button class="p-4 rounded-xl border hover:bg-gray-50 flex flex-col items-center gap-2" onclick="closeModal(); exportData()">
        <span class="text-2xl">⬇️</span><span>导出数据</span>
      </button>
      <button class="p-4 rounded-xl border hover:bg-gray-50 flex flex-col items-center gap-2" onclick="closeModal(); importData()">
        <span class="text-2xl">⬆️</span><span>导入数据</span>
      </button>
      <button class="p-4 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 flex flex-col items-center gap-2" onclick="closeModal(); clearAllData()">
        <span class="text-2xl">🗑️</span><span>清空数据</span>
      </button>
      <button class="p-4 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-50 flex flex-col items-center gap-2" onclick="closeModal(); openChangePassword()">
        <span class="text-2xl">🔑</span><span>修改密码</span>
      </button>
    </div>
    <p class="text-[11px] text-gray-400 mt-4 text-center">修改密码需先验证固定口令，忘记口令请导出数据后重置应用</p>`, 'md');
}

function openChangePassword() {
  openModal('验证固定口令', `
    <div class="space-y-3">
      <p class="text-xs text-gray-500">请输入固定口令以继续修改密码</p>
      <input id="cp-code" type="password" placeholder="固定口令" class="w-full border rounded-lg px-3 py-2 text-sm" />
      <p id="cp-code-msg" class="text-xs h-4"></p>
      <div class="flex gap-2">
        <button class="flex-1 border py-2 rounded-full" onclick="closeModal()">取消</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full" onclick="verifyResetCode()">验证</button>
      </div>
    </div>`, 'sm');
}
function verifyResetCode() {
  const code = document.getElementById('cp-code').value.trim();
  const msg = document.getElementById('cp-code-msg');
  if (code !== RESET_PASSWORD_CODE) {
    msg.textContent = '固定口令错误'; msg.className = 'text-xs text-red-500 h-4'; return;
  }
  openModal('修改密码', `
    <div class="space-y-3">
      <input id="cp-new" type="password" placeholder="新密码（至少6位）" class="w-full border rounded-lg px-3 py-2 text-sm" />
      <p id="cp-msg" class="text-xs h-4"></p>
      <div class="flex gap-2">
        <button class="flex-1 border py-2 rounded-full" onclick="closeModal()">取消</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full" onclick="submitChangePassword()">确定</button>
      </div>
    </div>`, 'sm');
}
function submitChangePassword() {
  const newP = document.getElementById('cp-new').value;
  const msg = document.getElementById('cp-msg');
  if (!AUTH_TOKEN) { msg.textContent = '未登录，无法修改'; msg.className = 'text-xs text-red-500 h-4'; return; }
  fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN }, body: JSON.stringify({ oldPassword: RESET_PASSWORD_CODE, newPassword: newP }) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('修改失败')))
    .then(() => { closeModal(); toast('密码已更新'); })
    .catch(e => { msg.textContent = e.message; msg.className = 'text-xs text-red-500 h-4'; });
}

function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '班主任工作台数据.json';
  a.click();
  URL.revokeObjectURL(url);
}
function importData() {
  openModal('导入数据', `
    <div class="space-y-4">
      <p class="text-sm text-gray-500">选择之前导出的 JSON 文件，将覆盖当前数据。</p>
      <input id="importFile" type="file" accept="application/json" class="w-full text-sm">
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doImport()">导入并覆盖</button>
    </div>`, 'sm');
}
function doImport() {
  const f = document.getElementById('importFile').files[0];
  if(!f) return alert('请选择文件');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      state = data; save(); closeModal(); render();
    } catch(err) { alert('文件格式不正确'); }
  };
  reader.readAsText(f);
}
// ===================== 从「班级积分管理系统」备份导入 =====================
// 兼容 E:/code/class_score/backups/*.json 结构：studentList/jobList/assignList/scoreLog/jobScoreStartDate
const IMPORT_DIM_MAP = { '体育打卡': 'sport', '日常积分': 'daily', '考试赋分': 'exam', '任职赋分': 'post' };
function importFromClassScore() {
  openModal('从班级积分备份导入', `
    <div class="space-y-4">
      <p class="text-sm text-gray-500">选择「班级积分管理系统」导出的备份 JSON（含 studentList / scoreLog 等字段），将把学生、分组、职务、职务分配、任职起算日，以及<b>体育打卡 / 日常积分 / 考试赋分</b>的明细日志合并进当前工作台。<br><span class="text-amber-600">注意：任职赋分由职务系统实时计算，备份中 373 条「自动计算」记录会自动跳过，避免重复计分。</span></p>
      <input id="csFile" type="file" accept="application/json,.json" class="w-full text-sm">
      <div class="flex gap-2">
        <button class="flex-1 bg-gray-100 text-gray-600 py-2 rounded-full hover:bg-gray-200" onclick="closeModal()">取消</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doImportFromClassScore()">导入并合并</button>
      </div>
    </div>`, 'md');
}
function doImportFromClassScore() {
  const f = document.getElementById('csFile').files[0];
  if (!f) return alert('请先选择备份 JSON 文件');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const raw = JSON.parse(e.target.result);
      const sl = typeof raw.studentList === 'string' ? JSON.parse(raw.studentList) : (raw.studentList || []);
      const jl = typeof raw.jobList === 'string' ? JSON.parse(raw.jobList) : (raw.jobList || []);
      const al = typeof raw.assignList === 'string' ? JSON.parse(raw.assignList) : (raw.assignList || []);
      const logs = typeof raw.scoreLog === 'string' ? JSON.parse(raw.scoreLog) : (raw.scoreLog || []);
      if (!Array.isArray(sl) || !sl.length) return alert('文件中未找到 studentList 学生数据');

      // 1) 学生：按姓名去重合并，保留分组
      const nameToId = {};
      const existingNames = new Set(state.students.map(s => s.name));
      let newStu = 0;
      sl.forEach(s => {
        const name = (s.name || '').trim();
        if (!name) return;
        let stu = state.students.find(x => x.name === name);
        if (!stu) {
          stu = { id: uid(), name, gender: '', class: state.user.className || '', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(name), alias: '', records: [] };
          state.students.push(stu); newStu++;
        }
        if (s.group && !stu.group) stu.group = s.group;
        nameToId[name] = stu.id;
        // 同步旧 id 映射（备份日志用旧 id 时可用）
        if (s.id) nameToId[s.id] = stu.id;
      });

      // 2) 职务
      const jobOldToNew = {};
      jl.forEach(j => {
        const oldId = j.id;
        let job = state.points.jobs.find(x => x.name === (j.name || '').trim());
        if (!job) { job = { id: uid(), name: (j.name || '').trim(), daily: +j.point || +j.daily || 0 }; state.points.jobs.push(job); }
        jobOldToNew[oldId] = job.id;
      });

      // 3) 职务分配
      let newAssign = 0;
      const seen = new Set(state.points.assigns.map(a => a.stuId + '|' + a.jobId));
      al.forEach(a => {
        const sid = nameToId[a.stuId] || a.stuId;
        const jid = jobOldToNew[a.jobId] || a.jobId;
        if (!sid || !jid) return;
        const key = sid + '|' + jid;
        if (seen.has(key)) return;
        state.points.assigns.push({ stuId: sid, jobId: jid }); seen.add(key); newAssign++;
      });

      // 4) 任职起算日（取更早的）
      if (raw.jobScoreStartDate) {
        const incoming = new Date(raw.jobScoreStartDate);
        const cur = state.points.jobStartDate ? new Date(state.points.jobStartDate) : null;
        if (!cur || incoming < cur) state.points.jobStartDate = raw.jobScoreStartDate;
      }

      // 5) 积分日志（跳过任职赋分自动计算，避免与职务系统重复）
      let newLogs = 0, skipJob = 0;
      logs.forEach(l => {
        if (!l || !l.module) return;
        const dim = IMPORT_DIM_MAP[l.module];
        if (!dim) return;
        if (l.module === '任职赋分') { skipJob++; return; } // 实时计算
        const sid = nameToId[l.name] || nameToId[l.stuId];
        if (!sid) return;
        const delta = parseFloat(l.score);
        if (isNaN(delta)) return;
        state.points.logs.unshift({
          id: uid(), ts: Date.now(), date: (l.time || nowStamp()).replace(/\//g, '-'),
          studentId: sid, studentName: (l.name || '').trim(), dim, delta,
          reason: l.type && l.type !== '导入累加' ? (l.type + (l.reason ? '·' + l.reason : '')) : dimLabel(dim),
          batchId: '', auto: '',
        });
        newLogs++;
      });

      save(); closeModal(); render();
      alert(`导入完成：新增学生 ${newStu} 人、职务分配 ${newAssign} 条、积分明细 ${newLogs} 条；跳过任职赋分自动记录 ${skipJob} 条（由职务系统实时计算）。`);
    } catch (err) { alert('文件解析失败：' + err.message); }
  };
  reader.readAsText(f);
}
function resetSampleData() {
  confirmModal('载入示例数据将覆盖当前所有内容，确定继续？', function(){
    state = defaultState(); save(); render();
  });
}

// 应用内确认弹窗（不依赖浏览器原生 confirm，避免被预览环境拦截导致"点了没反应"）
// 注意：onYes 是已绑定参数的闭包函数，通过全局 __confirmCb 存储，避免内联序列化丢失闭包变量
let __confirmCb = null;
function runConfirmCb() { const f = __confirmCb; __confirmCb = null; if (f) f(); }
function confirmModal(message, onYes, yesText, noText) {
  __confirmCb = onYes;
  openModal('请确认', `
    <div class="space-y-4">
      <p class="text-sm text-gray-700 leading-relaxed">${esc(message)}</p>
      <div class="flex gap-2">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal()">${noText || '取消'}</button>
        <button class="flex-1 bg-red-500 text-white py-2 rounded-full hover:bg-red-600" onclick="closeModal(); runConfirmCb()">${yesText || '确定'}</button>
      </div>
    </div>`, 'sm');
}
function clearAllData() {
  confirmModal('确定清空所有数据吗？此操作不可恢复（建议先导出备份）。', function(){
    state.students = []; state.todos = []; state.templates = []; state.classLogs = [];
    state.communications = []; state.duty = { groupSize: 4, groups: [] }; state.homework = [];
    state.scores = []; state.album = []; state.seating = { rows: 6, cols: 7, seats: {} };
    state.reminders = []; state.classRecords = [];
    state.schedule.courses = [];
    state.points.logs = [];
    state.points.assigns = [];
    save(); render();
  });
}

// ===================== Modal =====================
function openModal(title, body, size='md') {
  const width = size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-sm' : 'max-w-lg';
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-bg fixed inset-0 z-50 flex items-center justify-center p-4" onclick="if(event.target===this) closeModal()">
      <div class="bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[90vh] overflow-hidden flex flex-col" onclick="event.stopPropagation()">
        <div class="px-6 py-4 border-b flex items-center justify-between"><h3 class="font-bold text-gray-800">${esc(title)}</h3><button class="text-gray-400 hover:text-gray-600 text-xl" onclick="closeModal()">&times;</button></div>
        <div class="p-6 overflow-y-auto">${body}</div>
      </div>
    </div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// ===================== Init =====================
function showLogin() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-rose-50 px-4">
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl p-7 space-y-5">
        <div class="text-center">
          <div class="text-3xl mb-1">📒</div>
          <h1 class="text-lg font-bold text-gray-800">班主任工作台</h1>
          <p class="text-xs text-gray-400 mt-1">登录后多设备同步你的数据</p>
        </div>
        <div class="space-y-3">
          <input id="login-user" placeholder="账号" value="admin" class="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200" />
          <input id="login-pass" type="password" placeholder="密码" class="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200" />
          <button onclick="doLogin()" class="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-rose-500 transition">登录</button>
          <p id="login-err" class="text-xs text-red-500 text-center h-4"></p>
        </div>
        <p class="text-[11px] text-gray-300 text-center">默认账号 admin / admin123，登录后可在数据管理修改密码</p>
      </div>
    </div>`;
  const p = document.getElementById('login-pass');
  if (p) p.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-err');
  err.textContent = '登录中…';
  fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('账号或密码错误')))
    .then(d => {
      AUTH_TOKEN = d.token;
      localStorage.setItem(AUTH_KEY, d.token);
      // 拉取服务端数据
      apiGet('/api/data').then(res => {
        if (res && res.state) {
          try { state = migrateState(res.state); } catch (e) { state = defaultState(); }
          save(); // 写回本地兜底
        }
        render();
        maybeOnboard();
      }).catch(() => { render(); maybeOnboard(); });
    })
    .catch(e => { err.textContent = e.message; });
}

function doLogout() {
  AUTH_TOKEN = '';
  localStorage.removeItem(AUTH_KEY);
  showLogin();
}

function maybeOnboard() {
  if (!onboarded && (!state.students || state.students.length === 0)) {
    openOnboard();
  }
}

// 优先：已登录 -> 拉云端数据；未登录 -> 登录页
if (AUTH_TOKEN) {
  apiGet('/api/data').then(res => {
    if (res && res.state) {
      try { state = migrateState(res.state); } catch (e) { state = defaultState(); }
    }
    render();
    maybeOnboard();
  }).catch(() => { render(); maybeOnboard(); });
} else {
  showLogin();
}

