// ===================== Storage =====================
const STORAGE_KEY = 'ct_workbench_v1';
const AUTH_KEY = 'ct_auth_token';
const REMEMBER_KEY = 'ct_remember_login'; // 记住本设备：存账号密码，实现「直接登录 / 记住密码」
const HOME_EXHIBIT_KEY = 'ct_home_exhibit'; // 首页/积分展示页的展示设置，按设备持久化（大屏与笔记本可各自不同）
const CLOUD_BACKUP_KEY = 'ct_cloud_backup_v1'; // 合并前留一份云端原始数据，出问题可回滚

// 读取「记住本设备」里保存的账号密码（用于静默自动登录）
function getRememberedLogin() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && typeof o.user === 'string' && typeof o.pass === 'string') return o;
  } catch (e) {}
  return null;
}
// 静默自动登录：用记住的账号密码向后端换 token，成功返回 true。失败静默回退（不报错、不弹登录页）
function tryRememberLogin() {
  const cred = getRememberedLogin();
  if (!cred) return Promise.resolve(false);
  return fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: cred.user, password: cred.pass }) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('remembered-login-failed')))
    .then(d => {
      AUTH_TOKEN = d.token;
      GUEST_MODE = false;
      localStorage.setItem(AUTH_KEY, d.token);
      return true;
    })
    .catch(() => false);
}
let AUTH_TOKEN = (typeof localStorage !== 'undefined') ? localStorage.getItem(AUTH_KEY) : '';
let GUEST_MODE = false; // 大屏访客模式：免登录直接展示本机缓存（只读）

// 后端 API（多设备同步）。无后端时自动退化到纯本地。
function apiPost(url, body) {
  if (!AUTH_TOKEN) return Promise.resolve(null);
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN }, body: JSON.stringify(body) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('sync fail ' + r.status)))
    .catch(e => { console.warn('[sync]', e.message); return null; });
}
function apiGet(url, timeoutMs) {
  if (!AUTH_TOKEN) return Promise.resolve(null);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), typeof timeoutMs === 'number' ? timeoutMs : 15000);
  return fetch(url, { headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }, signal: ctrl.signal })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('sync fail ' + r.status)))
    .catch(e => { console.warn('[sync]', e.message); return null; })
    .finally(() => clearTimeout(timer));
}
function setSyncBadge(text, isErr) {
  const el = document.getElementById('sync-badge');
  if (!el) return;
  el.textContent = text;
  el.className = 'text-[11px] ' + (isErr ? 'text-orange-500' : 'text-gray-400');
}
let _syncFailCount = 0;
function pushSync() {
  // 大屏/访客模式（未登录）：数据只存本机，不尝试云端同步，也不显示误导性的「未同步」告警
  if (!AUTH_TOKEN) return;
  setSyncBadge('同步中…', false);
  // 读-合并-写（read-merge-write）：推送前先拉取云端最新数据，把「云端有、本机没有」的记录并入本机，
  // 再整体写回。既保留本机刚做的修改，又不会把别的设备刚写入的新记录整体覆盖掉，
  // 避免多设备同时使用时出现「信息不同步 / 记录凭空消失」。
  apiGet('/api/data', 15000).then(cloud => {
    let toPush = state;
    if (cloud && cloud.state) {
      let merged;
      try { merged = migrateState(cloud.state); } catch (e) { merged = null; }
      if (merged) {
        // mergeMissing(云端, 本机)：把云端比本机多的记录补进本机 state（不改动本机已有的修改）
        const added = mergeMissing(merged, state);
        toPush = state;
        // 采纳云端的墓碑（别的设备删的东西，本机也要认），并据此剔除已删除条目，避免删除被复活
        toPush._deleted = unionDeleted(state._deleted, merged._deleted);
        applyTombstones(toPush);
        if (added > 0) {
          toPush._savedAt = Date.now();
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toPush)); } catch (e) {}
        }
      } else {
        toPush = state;
        toPush._deleted = unionDeleted(state._deleted, (cloud && cloud.state && cloud.state._deleted) || null);
        applyTombstones(toPush);
      }
    }
    return apiPost('/api/data', { state: toPush });
  }).then(r => {
    if (r && r.ok) {
      _syncFailCount = 0;
      setSyncBadge('已同步 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), false);
    } else {
      _syncFailCount++;
      // 同步失败必须显眼：此时改动只在本机，刷新会被云端旧数据覆盖
      setSyncBadge('⚠️ 未同步（仅存本机）', true);
      // 连续第 2 次失败才弹提示，避免弱网下每次保存都打扰
      if (_syncFailCount === 2) {
        try { toast('⚠️ 云端同步失败，改动只存在本机。请检查网络后重新保存一次，否则刷新后可能丢失。', 6000); } catch (e) {}
      }
    }
  });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ===== 删除墓碑（tombstone）：让「删除」也能跨设备同步 =====
// 旧合并逻辑是「按 id / 值取并集」，只增不删。某设备删了记录，云端还在，下次同步又把记录加回来（用户现象：删了又冒出来）。
// 修复：删除时不只是从数组移除，同时把「被删条目」记进 state._deleted（墓碑）。
// 合并 / 推送时遇到墓碑里的条目就跳过，不再复活；其他设备拉取时也按墓碑过滤，删除随之同步。
function _tomboHas(deleted, k, key, val) {
  if (!deleted || !deleted.length) return false;
  for (let i = 0; i < deleted.length; i++) {
    const d = deleted[i];
    if (!d || d.k !== k) continue;
    if (key === 'id' ? (d.id === val) : (d.v === val)) return true;
  }
  return false;
}
function markDeletedId(k, id) {
  if (id == null) return;
  state._deleted = state._deleted || [];
  if (!_tomboHas(state._deleted, k, 'id', id)) state._deleted.push({ k: k, id: id });
}
function markDeletedVal(k, v) {
  if (v == null) return;
  state._deleted = state._deleted || [];
  if (!_tomboHas(state._deleted, k, 'v', v)) state._deleted.push({ k: k, v: v });
}
function unionDeleted(a, b) {
  const out = (a && a.length) ? a.slice() : [];
  if (b && b.length) for (let i = 0; i < b.length; i++) {
    const d = b[i];
    if (!d || !d.k) continue;
    const key = (d.id != null) ? 'id' : 'v';
    const val = (d.id != null) ? d.id : d.v;
    if (!_tomboHas(out, d.k, key, val)) out.push(d);
  }
  return out;
}
// 把墓碑里的条目从 state 各数组里物理剔除（本地视图 & 推送前清理）
function applyTombstones(s) {
  if (!s || !s._deleted || !s._deleted.length) return;
  const D = s._deleted;
  MERGE_ARRAY_KEYS.forEach(k => {
    if (!Array.isArray(s[k])) return;
    s[k] = s[k].filter(x => !(x && _tomboHas(D, k, 'id', x.id)));
  });
  MERGE_NESTED_ARRAYS.forEach(pair => {
    const p = pair[0], c = pair[1];
    if (s[p] && s[p][c] && Array.isArray(s[p][c])) {
      s[p][c] = s[p][c].filter(x => !(x && _tomboHas(D, p + '.' + c, 'id', x.id)));
    }
  });
  if (s.positions && typeof s.positions === 'object') {
    const P = s.positions;
    if (Array.isArray(P.structure)) P.structure = P.structure.filter(x => !(x && _tomboHas(D, 'positions.structure', 'id', x.id)));
    if (P.assign && typeof P.assign === 'object') {
      Object.keys(P.assign).forEach(rid => {
        if (Array.isArray(P.assign[rid])) P.assign[rid] = P.assign[rid].filter(n => !_tomboHas(D, 'positions.assign.' + rid, 'v', n));
      });
    }
    if (Array.isArray(P.representatives)) P.representatives = P.representatives.filter(x => !(x && _tomboHas(D, 'positions.representatives', 'id', x.id)));
  }
  if (Array.isArray(s.students)) {
    s.students.forEach(st => { if (st && Array.isArray(st.records)) st.records = st.records.filter(r => !(r && _tomboHas(D, 'students.records', 'id', r.id))); });
  }
  if (s.recKeywords && typeof s.recKeywords === 'object') {
    ['labels', 'desc'].forEach(sk => {
      const m = s.recKeywords[sk];
      if (!m || typeof m !== 'object') return;
      Object.keys(m).forEach(t => { if (Array.isArray(m[t])) m[t] = m[t].filter(x => !_tomboHas(D, 'recKeywords.' + sk + '.' + t, 'v', x)); });
    });
  }
  if (Array.isArray(s.homeworkKeywords)) s.homeworkKeywords = s.homeworkKeywords.filter(x => !_tomboHas(D, 'homeworkKeywords', 'v', x));
}

// ===== 轻量内容哈希：缓存变更检测用 =====
// 背景：积分维度签名、成绩派生数据签名原本靠「把整份数据拼成大字符串再比对」判断是否变化。
// 一次渲染里这些签名会被调用数百次（每个学生每次打分都要查一次），每次都构造几百 KB 的字符串，
// 光这一项就让积分页 / 周报页卡在 200ms 以上。改成增量哈希后语义不变（内容一变签名就变），
// 但只做整数运算，不再分配大字符串。
// 两个不同乘子算出两组 32 位值拼在一起，碰撞概率等价于 64 位，可忽略。
// 用普通乘法而非 Math.imul：结果等价（乘完再 ^ 会按 ToInt32 截断），
// 也不需要额外的全局查找，在任何宿主环境下表现一致。
let _hashA = 0, _hashB = 0;
function hashStart() { _hashA = 5381; _hashB = 52711; }
function hashAdd(v) {
  let n;
  if (typeof v === 'number') n = v | 0;
  else if (typeof v === 'boolean') n = v ? 1 : 0;
  else if (v === null || v === undefined) n = -1;
  else {
    const s = String(v);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      _hashA = ((_hashA * 33) ^ c) | 0;
      _hashB = ((_hashB * 65599) ^ c) | 0;
    }
    return;
  }
  _hashA = ((_hashA * 33) ^ n) | 0;
  _hashB = ((_hashB * 65599) ^ n) | 0;
}
function hashEnd() { return _hashA + ':' + _hashB; }

function defaultClassRecordSubjects() {
  return [
    { id:'yuwen', name:'语文', keywords:['语文'] },
    { id:'shuxue', name:'数学', keywords:['数学'] },
    { id:'yingyu', name:'英语', keywords:['英语'] },
    { id:'zhengzhi', name:'政治', keywords:['政治'] },
    { id:'lishi', name:'历史', keywords:['历史'] },
    { id:'wuli', name:'物理', keywords:['物理'] },
    { id:'huaxue', name:'化学', keywords:['化学'] },
    { id:'shengwu', name:'生物', keywords:['生物'] },
    { id:'dili', name:'地理', keywords:['地理'] },
    { id:'tiyu', name:'体育', keywords:['体育'] },
    { id:'yinyue', name:'音乐', keywords:['音乐'] },
    { id:'meishu', name:'美术', keywords:['美术'] },
    { id:'xinxi', name:'信息', keywords:['信息'] },
    { id:'banhui', name:'班会', keywords:['班会'] },
    { id:'qita', name:'其他', keywords:[] }
  ];
}
function defaultHomeworkKeywords() {
  return ['作业','布置作业','交作业','写作业','完成作业','背诵','默写','练习','抄写','预习','复习','试卷','卷子','学案','同步','练习册','课后题'];
}

function defaultState() {
  return {
    user: { name: 'Claire', role: '英语 · 班主任' },
    classes: [{ id: '10班', name: '10班', role: 'head' }, { id: '9班', name: '9班', role: 'teacher' }],
    headTeacherClass: '10班',
    activeClass: '10班',
    locked: true,
    lockPass: '1234',
    defaultLocked: true,
    _deleted: [],
    nav: [
      { id: 'home', label: '工作台首页', icon: '🏠' },
      { section: '日常记录', items: [
        { id: 'schedule', label: '课程表', icon: '📅' },
        { id: 'students', label: '学生管理', icon: '👨‍👩‍👧‍👦' },
        { id: 'points', label: '积分管理', icon: '🏆' },
        { id: 'sport', label: '体育管理', icon: '🏃' },
        { id: 'classLog', label: '班级日志', icon: '📓' },
        { id: 'seating', label: '座次表', icon: '🪑' },
        { id: 'positions', label: '职务与值日', icon: '📋' },
        { id: 'classRecord', label: '课堂记录', icon: '📝' },
        { id: 'behavior', label: '行为记录', icon: '📋' },
        { id: 'handbook', label: '班级手册', icon: '📖' },
      ]},
      { section: '减负工具', items: [
        { id: 'exam', label: '成绩管理', icon: '📊' },
        { id: 'examscore', label: '考试赋分', icon: '📈' },
        { id: 'attendance', label: '考勤管理', icon: '✅' },
        { id: 'homework', label: '作业管理', icon: '📚' },
        { id: 'report', label: '周报月报', icon: '📰' },
      ]},
      { id: 'reminders', label: '待办提醒', icon: '🔔' },
    ],
    positions: defaultPositions(),
    // ===== 班级手册：仅班主任班可见。两个模块竖排（注意事项 / 违禁事项），条目可增删改 + 上下移动 =====
    handbook: { notes: [], bans: [] },
    // ===== 一句话记录关键词（运行时可配置，随数据持久化；缺失时回退 REC_TYPE_LABELS_WORDS / REC_TYPE_DESC）=====
    recKeywords: {
      labels: {
        critic: ['批评','罚站','罚抄','处罚','违纪','迟到','早退','打架','顶撞','不交','没交','未完成','没完成','犯错','扣分','警告','处分','玩手机','走神','睡觉','抄袭','作弊','说话','不认真','不专心'],
        praise: ['表扬','夸奖','夸','赞','得奖','获奖','奖励','突出','满分','高分','守纪律','好人好事'],
        chat:   ['谈心','谈话','沟通','家访','约谈','开导','安慰','鼓励','交流'],
        leave:  ['请假','病假','事假','请假条','缺席'],
      },
      desc: {
        critic: ['顶撞','玩手机','走神','睡觉','抄袭','作弊','吵架','打架','旷课','追逐打闹','马虎','带零食','不整齐','吃零食','喧哗','传纸条','小动作','辱骂','破坏公物','不服从管理','擅自离开座位','讲话','讲小话','打闹','捣乱','起哄','接话','插话','吃东西','看课外书','随意走动','离开座位','下座位','不听讲','不听课'],
        praise: ['主动帮助同学','帮助同学','助人为乐','表现好','值日认真','作业优秀','一等奖','二等奖','三等奖','积极发言','主动','认真','勤奋','贴心','懂事','优秀','进步','棒','拾金不昧','诚实守信','团结同学','热爱劳动','文明守纪','乐于助人'],
        chat:   ['心理疏导','聊天','聊到','聊了','情绪低落'],
        leave:  ['肚子疼','不舒服','生病','家中有事','事假'],
      }
    },
    // ===== 一句话记录纠偏记忆：用户手动修正过的识别结果，下次同样输入直接命中 =====
    qrCorrections: [],
    classRecordSubjects: defaultClassRecordSubjects(),
    homeworkKeywords: defaultHomeworkKeywords(),
    schedule: {
      days: ['周一', '周二', '周三', '周四', '周五'],
      periods: [
        { id: 1, label: '第1节', start: '08:00', end: '08:45' },
        { id: 2, label: '第2节', start: '08:55', end: '09:40' },
        { id: 3, label: '第3节', start: '10:00', end: '10:45' },
        { id: 4, label: '第4节', start: '10:55', end: '11:40' },
        { id: 5, label: '第5节', start: '14:00', end: '14:45' },
        { id: 6, label: '第6节', start: '14:55', end: '15:40' },
      ],
      courses: [
        { day: 0, period: 1, subject: '英语' },
        { day: 2, period: 1, subject: '英语' },
        { day: 4, period: 1, subject: '英语' },
        { day: 1, period: 2, subject: '英语' },
        { day: 3, period: 2, subject: '英语' },
        { day: 0, period: 3, subject: '英语' },
        { day: 4, period: 3, subject: '英语' },
        { day: 3, period: 4, subject: '英语' },
        { day: 2, period: 5, subject: '英语' },
        { day: 3, period: 6, subject: '英语' },
      ]
    },
    students: [
      { id: uid(), name: '张明轩', gender: '男', class: '10班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zhang', records: [
        { id: uid(), type: 'critic', date: '8月18日', content: '张明轩今天上课迟到了，跟他妈妈沟通了这个问题，后续我们还要跟进' },
        { id: uid(), type: 'critic', date: '8月4日', content: '张明轩今天迟到了' },
        { id: uid(), type: 'praise', date: '8月3日', content: '课堂积极发言，英语口语进步明显' },
        { id: uid(), type: 'chat', date: '7月31日', content: '关于近期学习压力的谈话，学生表示会调整心态' },
      ]},
      { id: uid(), name: '王浩然', gender: '男', class: '10班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Wang', records: [
        { id: uid(), type: 'praise', date: '8月10日', content: '主动帮助同学解答数学题' },
        { id: uid(), type: 'chat', date: '8月1日', content: '谈心：关于与同桌相处的问题' },
      ]},
      { id: uid(), name: '李思雨', gender: '女', class: '10班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Li', records: [
        { id: uid(), type: 'praise', date: '8月12日', content: '英语演讲比赛获得二等奖' },
      ]},
      { id: uid(), name: '陈一诺', gender: '女', class: '10班', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Chen', records: [
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
    homework: [
      { id: uid(), studentId: '', studentName: '张明轩', subject: '英语', title: 'Unit 1 单词默写未完成', status: '未完成', class: '10班', date: '' },
    ],
    scores: [
      { id: uid(), name: '张明轩', subject: '英语', exam: '期中考试', score: 78, class: '10班' },
      { id: uid(), name: '王浩然', subject: '英语', exam: '期中考试', score: 92, class: '10班' },
    ],
    seating: {
      name: '座次表',
      rows: 7,
      cols: 6,
      cells: Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => ''))
    },
    reminders: [
      { id: uid(), title: '明天下午开班会', time: '2026-08-25 14:30' },
      { id: uid(), title: '提交本月教学计划', time: '2026-08-25 17:00' },
    ],
    points: defaultPoints(),
    // ===== 体育管理（打卡 + 早操）：基线抵扣模型 =====
    // 默认每天自动获得「打卡分 + 早操分」，只通过一句话记录 / 体育管理页登记异常（负分日志），
    // 体育总分 = 基线分 + 窗口内日志。按月自动重置：跨月后上月日志仍可查看但不参与计分。
    sportModule: {
      enabled: true,
      startDate: '2026-09-01',   // 基线起算日（新学期干净起点；早于此的旧体育日志不参与计分）
      checkinPts: 2,             // 每个日历天默认打卡分（含周末/节假日：节假日也要打卡）
      exercisePts: 2,            // 每个工作日默认早操分（周末不计；法定假日/停操走 noExerciseDays）
      noExerciseDays: [],        // 无早操日期（ISO）：法定节假日、下雨停操等，手动登记
    },
    // ===== 成绩分析（两班对比 + 成员预设）=====
    examScore: defaultExamScore(),
    examData: {
      columns: defaultExamColumns(), // 预识别列：score 类科目 + rank 类排名（可手动增删/启停）
      classes: [
        { id: 'c1', name: '初三(1)班', studentNames: [], gender: {} },
        { id: 'c2', name: '初三(2)班', studentNames: [], gender: {} },
      ],
      exams: [],          // [{id,name,date}]
      records: [],        // [{id,examId,classId,studentName,subject,score,colType}]  colType: score|rank
      subjects: [],       // 兼容旧字段，保留
    },
    // ===== 积分折算满分（0 或空表示不折算；>0 表示该维度原始分最高分映射到此分值）=====
    // 默认等额 100：四维度封顶各 25%，任一模块都无法独大；放弃任一模块最多丢 25% 总分
    convertRatios: { sport: 100, daily: 100, exam: 100, post: 100 },
    // ===== 考勤管理 =====
    attendance: {
      members: [],   // [{name, weeklyHome:['一','三','五']}] 固定回家周期（长期保留，跨日不清空）
      current: null, // {date:'YYYY-MM-DD', home:{}, leave:{}}  home 由周期派生；leave 为当天临时请假
      logs: [],      // 历史每日 [{id,date,dateLabel,total,home:[],leave:[{name,reason}],present,rate}]
    },
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
      // ===== 体育异常规则（noBase：命中后不再叠加一句话记录的基础 ±1，规则分值即最终扣分）=====
      // 基线抵扣模型：打卡+2/天、出操+2/天自动计入体育维度，只在异常时记负分对冲：
      // 早操迟到 -3（净+1）、早操请假 -2（净+2，留痕不罚）、早操缺勤 -4（净0）、未打卡 -2（丢掉打卡分）
      { id: uid(), dim: 'sport', label: '早操迟到', delta: -3, keywords: ['早操迟到','出操迟到'], noBase: true },
      { id: uid(), dim: 'sport', label: '早操请假', delta: -2, keywords: ['早操请假','出操请假'], noBase: true },
      { id: uid(), dim: 'sport', label: '早操缺勤', delta: -4, keywords: ['早操缺勤','缺操','无故缺操','未出操'], noBase: true },
      { id: uid(), dim: 'sport', label: '体育未打卡', delta: -2, keywords: ['未打卡','没打卡','没有打卡'], noBase: true },
      { id: uid(), dim: 'sport', label: '体育课积极表现', delta: 3, keywords: ['体育课积极','体育课表现'] },
      { id: uid(), dim: 'sport', label: '课间操标准', delta: 1, keywords: ['课间操'] },
      { id: uid(), dim: 'sport', label: '无故缺席锻炼', delta: -3, keywords: ['缺席锻炼','未参加锻炼'] },
      { id: uid(), dim: 'daily', label: '主动回答问题', delta: 2, keywords: ['主动回答','回答问题'] },
      { id: uid(), dim: 'daily', label: '帮助同学', delta: 3, keywords: ['帮助同学','助人为乐'] },
      { id: uid(), dim: 'daily', label: '卫生打扫认真', delta: 2, keywords: ['卫生认真','打扫认真'] },
      { id: uid(), dim: 'daily', label: '作业未交', delta: -3, keywords: ['作业未交','未交作业','没交作业'] },
      { id: uid(), dim: 'daily', label: '迟到', delta: -2, keywords: ['迟到'] },
      { id: uid(), dim: 'daily', label: '违反课堂纪律', delta: -5, keywords: ['违反纪律','课堂纪律'] },
      { id: uid(), dim: 'exam', label: '班级前10名', delta: 5, keywords: ['班级前10','前十名'] },
      { id: uid(), dim: 'exam', label: '成绩显著进步', delta: 8, keywords: ['成绩显著进步','显著进步'] },
      { id: uid(), dim: 'exam', label: '单科第一/满分', delta: 3, keywords: ['单科第一','满分'] },
      { id: uid(), dim: 'exam', label: '考试退步明显', delta: -3, keywords: ['退步明显'] },
      { id: uid(), dim: 'post', label: '履职尽责（月度）', delta: 5, keywords: ['履职尽责'] },
      { id: uid(), dim: 'post', label: '组织活动出色', delta: 5, keywords: ['组织活动出色'] },
      { id: uid(), dim: 'post', label: '履职不到位', delta: -3, keywords: ['履职不到位','履职不力'] },
    ],
    calcStartDate: '2026-01-01',
    logs: [],
  };
}

// 职务与值日管理：职务架构 / 值日生 / 职务积分 / 职务树 / 关联扣分
function defaultPositions() {
  const structure = [
    { id:'banzhang', name:'班长', group:'班委', category:'班委', count:1, pts:5, seat:2, duties:['兼任音乐、美术课代表、心理委员','考勤（早、中、课上）','班级全部工作检查提醒','配合学校工作安排'], req:'品学兼优、以身作则' },
    { id:'xuexi', name:'学习委员', group:'班委', category:'班委', count:1, pts:3.5, seat:1, duties:['本周课堂学习/违纪汇总（周末汇总周一交）','上周作业检查汇总（周一）','考试整理考场（周三）','班级学习工作检查提醒'], req:'品学兼优、以身作则' },
    { id:'jilu', name:'记录员', group:'班委', category:'非班委', count:1, pts:null, seat:null, duties:['班会内容记录（周一）','本周作业传达（周五晚）','1530 安全记录（每天）'], req:'书写工整' },
    { id:'shenghuo', name:'生活委员', group:'班委', category:'班委', count:1, pts:3.5, seat:1, duties:['桌椅板凳摆放','整理讲桌','书橱/空桌整理','生活工作检查提醒'], req:'个人生活有条理' },
    { id:'jiexian', name:'接线员', group:'班委', category:'非班委', count:1, pts:null, seat:null, duties:['电脑/电灯/窗帘/空调开关（室内无人就关）'], req:'有时间观念' },
    { id:'guangbo', name:'广播员', group:'班委', category:'非班委', count:1, pts:null, seat:null, duties:['路队古诗（放学）','跑操口号（课间操）'], req:'嗓门大' },
    { id:'linghang', name:'领航员', group:'班委', category:'非班委', count:1, pts:null, seat:null, duties:['举旗/拿旗放旗（课间操）'], req:'体力好、眼神好' },
    { id:'weisheng', name:'卫生委员', group:'班委', category:'班委', count:1, pts:3.5, seat:1, duties:['全天卫生检查','值日生提醒/替补','卫生工具整理','卫生工作检查提醒'], req:'爱干净' },
    { id:'jiancha', name:'监察员', group:'班委', category:'班委', count:1, pts:3.5, seat:1, duties:['提醒班委履职','监督班委工作（周末汇总周一报）','提醒组长管课前纪律'], req:'公平公正、遵守纪律' },
    { id:'jifen', name:'计分员', group:'班委', category:'非班委', count:1, pts:null, seat:null, duties:['每周积分汇总汇报','整理积分表格'], req:'仔细、会加减法' },
    { id:'zuzhang', name:'组长', group:'班委', category:'班委', count:6, pts:3.5, seat:1, duties:['检查小组作业报课代表','管理小组纪律计分','统计吃饭人数'], req:'公平公正、遵守纪律' },
    { id:'zhiban', name:'值日班长', group:'班委', category:'非班委', count:1, pts:null, seat:null, duties:['午休在讲台上值班'], req:'' },
    { id:'xuehui', name:'学生会', group:'学生会', category:'非班委', count:5, pts:null, seat:null, duties:['配合学校学生会工作'], req:'认真负责' },
  ];
  const assign = {};
  structure.forEach(p => assign[p.id] = []);
  assign['kedaibiao'] = [];
  const dutyTree = {
    id:'banzhang', label:'班长', roleId:'banzhang', children:[
      { id:'xuexi', label:'学习委员', roleId:'xuexi', children:[
        { id:'jilu', label:'记录员', roleId:'jilu' },
        { id:'kedaibiao', label:'课代表', roleId:'kedaibiao' }
      ]},
      { id:'shenghuo', label:'生活委员', roleId:'shenghuo', children:[
        { id:'jiexian', label:'接线员', roleId:'jiexian' },
        { id:'guangbo', label:'广播员', roleId:'guangbo' },
        { id:'linghang', label:'领航员', roleId:'linghang' }
      ]},
      { id:'weisheng', label:'卫生委员', roleId:'weisheng', children:[
        { id:'t_zrs', label:'值日生', children:[
          { id:'t_zrs_hb', label:'黑板', dutyTask:'黑板（全部）' },
          { id:'t_zrs_sn', label:'室内', dutyTask:'室内走廊' },
          { id:'t_zrs_sw', label:'室外', dutyTask:'室外走廊（含窗台）' },
          { id:'t_zrs_lj', label:'垃圾桶', dutyTask:'垃圾桶' },
          { id:'t_zrs_td', label:'拖地', dutyTask:'拖地' }
        ]}
      ]},
      { id:'jiancha', label:'监察员', roleId:'jiancha', children:[
        { id:'zuzhang', label:'组长', roleId:'zuzhang' }
      ]},
      { id:'jifen', label:'计分员', roleId:'jifen' },
      { id:'xuehui', label:'学生会', roleId:'xuehui' },
      { id:'zhiban', label:'值日班长', roleId:'zhiban' }
    ]
  };
  const deductionKeywords = {
    'banzhang':['班长'],
    'xuexi':['学习委员','学习'],
    'jilu':['记录员','记录'],
    'kedaibiao':['课代表'],
    'shenghuo':['生活委员','生活'],
    'jiexian':['接线员','电脑','电灯','窗帘','空调'],
    'guangbo':['广播员','广播','路队古诗','跑操口号'],
    'linghang':['领航员','举旗','拿旗'],
    'weisheng':['卫生委员','卫生'],
    'jiancha':['监察员','监察','监督'],
    'jifen':['计分员','计分','积分'],
    'zuzhang':['组长'],
    'zhiban':['值日班长'],
    'xuehui':['学生会'],
    't_zrs_hb':['黑板'],
    't_zrs_sn':['室内','室内走廊'],
    't_zrs_sw':['室外','室外走廊','窗台'],
    't_zrs_lj':['垃圾桶','垃圾'],
    't_zrs_td':['拖地','地面']
  };
  return {
    structure, assign, dutyTree,
    dutyWeekly:{}, dutyEditMode:{},
    dutyTaskPoints:{ '黑板（全部）':null, '室内走廊':null, '垃圾桶':null, '室外走廊（含窗台）':null, '拖地':null },
    dutyTaskMax:{ '黑板（全部）':1, '室内走廊':1, '垃圾桶':1, '室外走廊（含窗台）':1, '拖地':1 },
    deductionKeywords, deductionPoints:1,
    dutyRota:{ startDate:'', stepDays:1, spanDays:30, scope:'all', schedule:[] },
    representatives: [
      { id:'rep_yu', subject:'语文', count:1, pts:null, names:[] },
      { id:'rep_shu', subject:'数学', count:1, pts:null, names:[] },
      { id:'rep_ying', subject:'英语', count:1, pts:null, names:[] },
      { id:'rep_wu', subject:'物理', count:1, pts:null, names:[] },
      { id:'rep_hua', subject:'化学', count:1, pts:null, names:[] },
      { id:'rep_zheng', subject:'政治', count:1, pts:null, names:[] },
      { id:'rep_li', subject:'历史', count:1, pts:null, names:[] },
      { id:'rep_di', subject:'地理', count:1, pts:null, names:[] },
      { id:'rep_sheng', subject:'生物', count:1, pts:null, names:[] }
    ]
  };
}

function migrateState(s) {
  if (!Array.isArray(s._deleted)) s._deleted = []; // 墓碑数组兜底（旧数据可能缺此字段）
  const ds = defaultState();
  // 确保所有顶层字段存在（从旧备份/早期版本导入的数据可能缺少某些模块）
  ['schedule','students','todos','templates','classLogs','communications','homework','scores','seating','seatingByClass','reminders','classRecords','user','nav','points','examData','convertRatios','snapshots','attendance','positions','classRecordSubjects','homeworkKeywords','classes','headTeacherClass','activeClass','locked','lockPass','defaultLocked','handbook'].forEach(k => {
    if (s[k] == null) s[k] = ds[k];
  });
  // 导航菜单：移除已废弃项，并用默认菜单补全新增项（确保旧数据也能看到新模块）
  if (Array.isArray(s.nav)) {
    const removedIds = new Set(['duty', 'communication', 'templates', 'ppt', 'scores']);
    s.nav.forEach(item => {
      if (removedIds.has(item.id)) item._del = true;
      if (Array.isArray(item.items)) item.items = item.items.filter(i => !removedIds.has(i.id));
    });
    s.nav = s.nav.filter(item => !item._del);
  }
  // 以默认导航为基准，保留现有分组但补全/重置所有菜单项（导航不可用户自定义，直接对齐最新结构最稳）
  s.nav = JSON.parse(JSON.stringify(ds.nav));
  // 班级手册：结构兜底（旧备份 / 手工导入可能只有一半字段，或元素缺 id/text）
  if (!s.handbook || typeof s.handbook !== 'object') s.handbook = { notes: [], bans: [] };
  ['notes', 'bans'].forEach(k => {
    if (!Array.isArray(s.handbook[k])) s.handbook[k] = [];
    s.handbook[k] = s.handbook[k].filter(x => x && typeof x === 'object').map(x => ({
      id: x.id || uid(), text: String(x.text == null ? '' : x.text), ts: x.ts || 0,
    }));
  });
  // 职务与值日：补全子字段
  if (!s.positions || typeof s.positions !== 'object') s.positions = defaultPositions();
  if (!Array.isArray(s.positions.structure) || !s.positions.structure.length) s.positions.structure = defaultPositions().structure;
  if (!s.positions.assign || typeof s.positions.assign !== 'object') s.positions.assign = {};
  const _catMap = {};
  defaultPositions().structure.forEach(p => { _catMap[p.id] = p.category || '班委'; });
  s.positions.structure.forEach(p => {
    if (!Array.isArray(s.positions.assign[p.id])) s.positions.assign[p.id] = [];
    if (!p.category) p.category = _catMap[p.id] || (p.group === '学生会' ? '非班委' : '班委');
  });
  if (!s.positions.dutyTree || typeof s.positions.dutyTree !== 'object') s.positions.dutyTree = defaultPositions().dutyTree;
  // 职务树结构对齐：存量用户的数据是在「拖地」等节点新增前保存的，其 dutyTree 可能缺失该节点或缺少 dutyTask 关联属性。
  // 此处按节点 id 递归合并默认树：补齐 dutyTask/roleId 关联属性，并补入缺失的默认子节点（如拖地），解决职务树不显示拖地的 bug。
  (function pmMergeDutyTree(def, pers){
    if(!def) return pers;
    if(!pers || pers.id !== def.id) return JSON.parse(JSON.stringify(def));
    if('dutyTask' in def) pers.dutyTask = def.dutyTask;
    if('roleId' in def) pers.roleId = def.roleId;
    const dc = def.children || [], pc = pers.children || [], merged = [], used = new Set();
    dc.forEach(d=>{ const p = pc.find(x=>x && x.id===d.id); if(p){ merged.push(pmMergeDutyTree(d,p)); used.add(d.id); } else { merged.push(JSON.parse(JSON.stringify(d))); } });
    pc.forEach(x=>{ if(x && !used.has(x.id)) merged.push(x); });
    pers.children = merged;
    return pers;
  })(defaultPositions().dutyTree, s.positions.dutyTree);
  if (!s.positions.dutyWeekly || typeof s.positions.dutyWeekly !== 'object') s.positions.dutyWeekly = {};
  if (!s.positions.deductionKeywords || typeof s.positions.deductionKeywords !== 'object') s.positions.deductionKeywords = defaultPositions().deductionKeywords;
  if (typeof s.positions.deductionPoints !== 'number') s.positions.deductionPoints = 1;
  if (!s.positions.dutyTaskPoints || typeof s.positions.dutyTaskPoints !== 'object') s.positions.dutyTaskPoints = defaultPositions().dutyTaskPoints;
  // 补齐新增值日任务（如「拖地」）的积分与排表槽位，保证存量用户数据与最新任务列表一致
  for (const t of pmDutyTasks) if (!(t in s.positions.dutyTaskPoints)) s.positions.dutyTaskPoints[t] = null;
  if (!s.positions.dutyWeekly || typeof s.positions.dutyWeekly !== 'object') s.positions.dutyWeekly = {};
  pmDays.forEach(d => {
    s.positions.dutyWeekly[d] = s.positions.dutyWeekly[d] || {};
    pmDutyTasks.forEach(t => { if (!Array.isArray(s.positions.dutyWeekly[d][t])) s.positions.dutyWeekly[d][t] = []; });
  });
  // 补齐「每槽最多人数」设置（值日自动排表用）
  if (!s.positions.dutyTaskMax || typeof s.positions.dutyTaskMax !== 'object') s.positions.dutyTaskMax = defaultPositions().dutyTaskMax;
  for (const t of pmDutyTasks) if (!(t in s.positions.dutyTaskMax) || typeof s.positions.dutyTaskMax[t] !== 'number') s.positions.dutyTaskMax[t] = 1;
  if (!Array.isArray(s.positions.representatives)) s.positions.representatives = defaultPositions().representatives;
  if (!Array.isArray(s.positions.assign.kedaibiao)) s.positions.assign.kedaibiao = [];
  // 课代表关联进班级职务体系：补全 pts、同步职务树子节点与关联扣分关键词
  s.positions.representatives.forEach(r => { if (typeof r.pts !== 'number' && r.pts !== null) r.pts = null; });
  if (typeof pmSyncRepTree === 'function') pmSyncRepTree(s.positions);
  const dp = defaultPoints();
  if (!s.points || typeof s.points !== 'object') s.points = dp;
  if (!Array.isArray(s.points.logs)) s.points.logs = [];
  if (!Array.isArray(s.points.rules) || !s.points.rules.length) s.points.rules = dp.rules;
  // 起始日：旧版 jobStartDate 统一迁移为 calcStartDate，作为全局积分计算起始日
  if (!s.points.calcStartDate) s.points.calcStartDate = s.points.jobStartDate || '2026-01-01';
  // 规则补全 keywords 字段（积分预设规则改为关键词识别模式）
  if (Array.isArray(s.points.rules)) {
    s.points.rules.forEach(r => { if (!Array.isArray(r.keywords)) r.keywords = []; });
  }
  if (!Array.isArray(s.classRecords)) s.classRecords = [];
  if (!Array.isArray(s.classRecordSubjects) || !s.classRecordSubjects.length) s.classRecordSubjects = defaultClassRecordSubjects();
  if (!Array.isArray(s.homeworkKeywords) || !s.homeworkKeywords.length) s.homeworkKeywords = defaultHomeworkKeywords();
  s.classRecords.forEach(r => { if (!r.studentId && r.studentId !== null) r.studentId = null; if (typeof r.studentName !== 'string') r.studentName = ''; });
  if (!s.user || typeof s.user !== 'object') s.user = { name: '班主任', role: '' };
  // ===== 双班支持：班级维度 + 旧数据归属班主任班 =====
  if (!Array.isArray(s.classes) || !s.classes.length) s.classes = [{ id: '10班', name: '10班', role: 'head' }, { id: '9班', name: '9班', role: 'teacher' }];
  if (!s.headTeacherClass) s.headTeacherClass = '10班';
  if (!s.activeClass) s.activeClass = s.headTeacherClass;
  const _headCls = s.headTeacherClass;
  // 班级值归一化：存量数据里可能存的是显示名（如"初三10班"）而非内部 id，
  // 直接 === 比较会漏掉记录，这里统一反解为 id，识别不了再归到班主任班
  const _clsId = raw => { const r = String(raw == null ? '' : raw).trim(); if (!r) return ''; const c = s.classes.find(x => x.id === r || x.name === r); return c ? c.id : ''; };
  // 用显示名匹配兜底（旧版本可能把显示名写进了 class 字段），识别不了才归班主任班
  if (Array.isArray(s.students)) s.students.forEach(st => { st.class = _clsId(st.class) || _headCls; });
  if (Array.isArray(s.classRecords)) s.classRecords.forEach(r => { r.class = _clsId(r.class) || _headCls; });
  if (Array.isArray(s.homework)) s.homework.forEach(h => {
    h.class = _clsId(h.class) || _headCls;
    if (!h.subject) h.subject = '未指定';
    // 旧模型为「布置作业」({title,due})，新模型为「作业完成情况台账」：补姓名/状态/日期
    if (h.date == null) h.date = hwNormDate(h.due) || hwNormDate(h.title) || '';
    if (h.due == null) h.due = '';
    if (h.studentName == null) h.studentName = '';
    if (h.studentId == null) h.studentId = '';
    // 旧记录 title 里常常直接写了学生姓名（如「张三英语作业没交」「政治作业不合格 张三」），迁移时自动提取出来
    if (!h.studentName && h.title) {
      const t = String(h.title);
      const students = (s.students || []).filter(x => x.name && x.name.length > 1).sort((a, b) => b.name.length - a.name.length);
      const stu = students.find(x => t.includes(x.name));
      if (stu) { h.studentName = stu.name; h.studentId = stu.id || ''; }
    }
    // 不合格/未背/未默/未写/未抄/太差/差 等也视为未完成；否则旧布置类记录默认「已完成」便于区分
    if (!h.status) h.status = /未完成|没交|未做|不交|未交|漏做|缺交|不合格|未背|未默|未写|未抄|太差|差/.test(h.title || '') ? '未完成' : '已完成';
  });
  if (Array.isArray(s.scores)) s.scores.forEach(sc => { sc.class = _clsId(sc.class) || _headCls; });
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
  if (!Array.isArray(s.examData.columns) || !s.examData.columns.length) s.examData.columns = defaultExamColumns();
  s.examData.classes.forEach(c => { if (!c.gender || typeof c.gender !== 'object') c.gender = {}; });
  s.examData.records.forEach(r => { if (!r.colType) r.colType = 'score'; });
  syncExamClassesToStudents(s); // 成绩分析班级/成员与学生管理对齐
  s.examScore = normalizeExamScore(s.examScore); // 考试赋分规则归一化
  if (!s.convertRatios || typeof s.convertRatios !== 'object') s.convertRatios = { sport: 0, daily: 0, exam: 0, post: 0 };
  ['sport','daily','exam','post'].forEach(k => { if (typeof s.convertRatios[k] !== 'number') s.convertRatios[k] = 0; });
  if (!Array.isArray(s.snapshots)) s.snapshots = [];
  // 一句话记录关键词：确保结构完整（缺失时回退硬编码默认）
  if (!s.recKeywords || typeof s.recKeywords !== 'object') s.recKeywords = {};
  if (!s.recKeywords.labels || typeof s.recKeywords.labels !== 'object') s.recKeywords.labels = {};
  if (!s.recKeywords.desc || typeof s.recKeywords.desc !== 'object') s.recKeywords.desc = {};
  ['critic','praise','chat','leave'].forEach(t => {
    if (!Array.isArray(s.recKeywords.labels[t])) s.recKeywords.labels[t] = (REC_TYPE_LABELS_WORDS[t] || []).slice();
    if (!Array.isArray(s.recKeywords.desc[t])) s.recKeywords.desc[t] = (REC_TYPE_DESC[t] || []).slice();
  });
  if (!Array.isArray(s.qrCorrections)) s.qrCorrections = [];
  if (!s.positions || typeof s.positions !== 'object') s.positions = defaultPositions();
  if (!s.positions.dutyRota || typeof s.positions.dutyRota !== 'object') s.positions.dutyRota = { startDate:'', stepDays:1, spanDays:30, scope:'all', schedule:[] };
  // 考勤管理
  if (!s.attendance || typeof s.attendance !== 'object') s.attendance = { members: [], current: null, logs: [] };
  if (!Array.isArray(s.attendance.members)) s.attendance.members = [];
  if (!Array.isArray(s.attendance.logs)) s.attendance.logs = [];
  if (s.attendance.current && typeof s.attendance.current !== 'object') s.attendance.current = null;
  // 请假时刻（精确到秒）：与 leave 平行存放，不动 leave 的 {姓名:原因} 结构，避免影响所有既有读取逻辑
  if (s.attendance.current && (!s.attendance.current.leaveTs || typeof s.attendance.current.leaveTs !== 'object')) s.attendance.current.leaveTs = {};
  s.attendance.members.forEach(m => { if (!m || typeof m !== 'object') return; if (!Array.isArray(m.weeklyHome)) m.weeklyHome = []; if (typeof m.name !== 'string') m.name = ''; });
  // 将旧考勤 roster 的固定回家周期合并进「学生管理」（attendance.members 不再作为名册来源）
  if (Array.isArray(s.attendance.members)) {
    s.attendance.members.forEach(m => {
      if (!m || !m.name) return;
      const st = (s.students || []).find(x => x.name === m.name);
      if (st && Array.isArray(m.weeklyHome) && (!Array.isArray(st.weeklyHome) || st.weeklyHome.length === 0)) {
        st.weeklyHome = m.weeklyHome.slice();
      }
    });
  }
  if (Array.isArray(s.students)) s.students.forEach(st => { if (st && !Array.isArray(st.weeklyHome)) st.weeklyHome = []; });
  // 学生补全 alias 字段
  if (Array.isArray(s.students)) s.students.forEach(st => { if (st && typeof st.alias === 'undefined') st.alias = ''; });
  // 课程表：旧节次只有 time，迁移为 start/end；旧课程含 className/room，去掉后只保留 subject
  if (s.schedule && Array.isArray(s.schedule.periods)) {
    s.schedule.periods = s.schedule.periods.map((p, i, arr) => {
      if (p && typeof p.time === 'string' && (typeof p.start !== 'string' || typeof p.end !== 'string')) {
        const start = p.time;
        const [h, m] = start.split(':').map(x => parseInt(x, 10) || 0);
        const endDate = new Date(2000, 0, 1, h, m + 45);
        const end = `${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}`;
        return { id: p.id || i + 1, label: p.label || `第${p.id || i + 1}节`, start, end };
      }
      return { id: p.id || i + 1, label: p.label || `第${p.id || i + 1}节`, start: p.start || '', end: p.end || '' };
    });
  }
  if (s.schedule && Array.isArray(s.schedule.courses)) {
    s.schedule.courses = s.schedule.courses.map(c => ({ day: c.day, period: c.period, subject: c.subject || c.className || '' })).filter(c => c.subject);
  }
  // 座次表：旧版是 flat seats 对象，迁移为二维 cells
  if (s.seating && typeof s.seating === 'object') {
    if (!Array.isArray(s.seating.cells)) {
      // 最旧版：flat seats 对象
      const rows = +s.seating.rows || 6;
      const cols = +s.seating.cols || 7;
      const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
      const oldSeats = s.seating.seats || {};
      Object.entries(oldSeats).forEach(([key, sid]) => {
        const m = key.match(/^s(\d+)$/);
        if (!m) return;
        const idx = +m[1];
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        if (r < rows && c < cols) cells[r][c] = sid;
      });
      s.seating = { name: '座次表', rows, cols, cells };
    }
    if (typeof s.seating.name !== 'string') s.seating.name = '座次表';
    if (!Number.isFinite(s.seating.rows) || s.seating.rows < 1) s.seating.rows = 7;
    if (!Number.isFinite(s.seating.cols) || s.seating.cols < 1) s.seating.cols = 6;
    // 兼容旧对象数组：全部转换为字符串数组
    const targetRows = s.seating.rows;
    const targetCols = s.seating.cols;
    while (s.seating.cells.length < targetRows) s.seating.cells.push(Array.from({ length: targetCols }, () => ''));
    s.seating.cells = s.seating.cells.slice(0, targetRows).map(row => {
      const r = (row || []).map(cell => {
        if (!cell) return '';
        if (typeof cell === 'string') return cell;
        // 旧版对象：过道/空白转为空座位；seat 保留 studentId
        return String(cell.studentId || '');
      });
      while (r.length < targetCols) r.push('');
      return r.slice(0, targetCols);
    });
  }
  // 座次表：迁移单份 seatings 为按班级存储（班主任班优先继承旧数据）
  if (!s.seatingByClass || typeof s.seatingByClass !== 'object') s.seatingByClass = {};
  if (s.seating && Array.isArray(s.seating.cells)) {
    const seedClass = s.headTeacherClass || (s.classes[0] && s.classes[0].id) || '10班';
    if (!s.seatingByClass[seedClass]) s.seatingByClass[seedClass] = JSON.parse(JSON.stringify(s.seating));
  }
  // 导航若为旧版本（无积分管理），用最新导航覆盖（导航非用户数据）
  if (!JSON.stringify(s.nav || []).includes('"points"')) s.nav = defaultState().nav;
  // 确保「职务与值日」入口存在（旧导航可能没有）
  if (!JSON.stringify(s.nav || []).includes('"positions"')) {
    s.nav = s.nav.map(g => {
      if (g && g.section === '日常记录' && Array.isArray(g.items)) {
        if (!g.items.find(i => i.id === 'positions')) g.items.push({ id:'positions', label:'职务与值日', icon:'📋' });
      }
      return g;
    });
  }
  // 确保「体育管理」入口存在（旧导航可能没有）
  if (!JSON.stringify(s.nav || []).includes('"sport"')) {
    s.nav = s.nav.map(g => {
      if (g && g.section === '日常记录' && Array.isArray(g.items)) {
        const pts = g.items.findIndex(i => i.id === 'points');
        const item = { id:'sport', label:'体育管理', icon:'🏃' };
        if (pts >= 0) g.items.splice(pts + 1, 0, item); else g.items.push(item);
      }
      return g;
    });
  }
  // ===== 体育基线抵扣模型迁移（2026-09 起）=====
  // 1) sportModule 配置补齐；2) 旧「早锻炼打卡+2」规则移除（基线已覆盖，保留会双发）；
  // 3) 四条体育异常规则补齐（noBase：规则分即最终分，不再叠加基础±1）
  if (!s.sportModule || typeof s.sportModule !== 'object') s.sportModule = {};
  const _sm = s.sportModule;
  if (typeof _sm.enabled !== 'boolean') _sm.enabled = true;
  if (typeof _sm.startDate !== 'string' || !_sm.startDate) _sm.startDate = '2026-09-01';
  if (typeof _sm.checkinPts !== 'number') _sm.checkinPts = 2;
  if (typeof _sm.exercisePts !== 'number') _sm.exercisePts = 2;
  if (!Array.isArray(_sm.noExerciseDays)) _sm.noExerciseDays = [];
  if (s.points && Array.isArray(s.points.rules)) {
    const kw = r => (r.keywords || []).join('/');
    if (!s.points.rules.some(r => kw(r).includes('早操迟到'))) {
      s.points.rules.unshift(
        { id: uid(), dim: 'sport', label: '早操迟到', delta: -3, keywords: ['早操迟到','出操迟到'], noBase: true },
        { id: uid(), dim: 'sport', label: '早操请假', delta: -2, keywords: ['早操请假','出操请假'], noBase: true },
        { id: uid(), dim: 'sport', label: '早操缺勤', delta: -4, keywords: ['早操缺勤','缺操','无故缺操','未出操'], noBase: true },
        { id: uid(), dim: 'sport', label: '体育未打卡', delta: -2, keywords: ['未打卡','没打卡','没有打卡'], noBase: true }
      );
    }
    // 移除旧「早锻炼打卡」规则：基线模型下保留会与基线双发
    s.points.rules = s.points.rules.filter(r => !(r.dim === 'sport' && (r.label || '').includes('早锻炼打卡')));
  }
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.schedule && parsed.students) {
        const migrated = migrateState(parsed);
        if (typeof pmSyncRepTree === 'function') pmSyncRepTree(migrated.positions);
        return migrated;
      }
    }
  } catch (e) { console.warn('load failed', e); }
  const s = defaultState();
  if (typeof pmSyncRepTree === 'function') pmSyncRepTree(s.positions);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  return s;
}

// internal=true 表示「系统内部调用」，锁定状态下依然允许（见下方说明）
function save(internal) {
  // ===== 只读锁定：落盘兜底 =====
  // save() 是数据持久化的唯一出口（localStorage + 云同步 + 展览缓存失效）。
  // UI 层的 initLockGuard 只能拦截内联 onclick/addEventListener 触发的写入，
  // 无法覆盖自动任务、延迟回调等路径。此处做最后一道闸：锁定状态下任何
  // 非内部调用一律拒绝落盘，避免出现「锁定了却仍能改数据」。
  // 必须传 internal=true 的系统调用：上锁 / 解锁 / 登录 / 切换班级。
  if (state && state.locked && !internal) {
    // 静默拒绝：用户点击类写入已由 initLockGuard 提示过，此处若再 toast
    // 会让自动任务（如考勤归档）在每次打开锁定页面时无端弹提示。
    console.warn('[只读模式] 已阻止一次数据写入');
    return false;
  }
  // 记录落盘时间：启动时会拿它和云端数据的时间戳比对，
  // 从而识别「本地改过但推送失败」的情况（否则刷新后被云端旧数据覆盖，记录凭空消失）
  if (state && typeof state === 'object') state._savedAt = Date.now();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { alert('保存失败，可能是本地存储空间已满。' + e.message); }
  _hwNameIdx = null; // 名册可能已变，让姓名索引缓存失效
  ptDropSigMemo(); // 数据已变，积分维度的签名记忆作废
  pushSync();
  _bumpExhibitDataVer(); // 数据变更后失效展览缓存
}

// ===== 云端数据接入：避免「本地已存但推送失败」的记录被覆盖丢失 =====
// 背景：启动时云端数据会无条件覆盖本地。若上次保存时 pushSync 失败
// （网络抖动 / token 过期 / 服务器重启），新增的记录只存在于 localStorage，
// 一刷新就被云端旧数据盖掉 —— 表现为「记录没了 / 新增的不显示」。
// 顶层数组字段（元素带 id，按 id 取并集）
// 注意：'todosReminders' 是历史遗留的错误键名，实际字段是 todos / reminders 两个数组
const MERGE_ARRAY_KEYS = ['students', 'scores', 'classRecords', 'classLogs', 'communications', 'homework', 'todos', 'reminders', 'templates', 'snapshots', 'classRecordSubjects'];
// 嵌套数组：父字段是对象（不是数组），需单独下钻合并（attendance 就是被 Array.isArray 漏掉的那个）
const MERGE_NESTED_ARRAYS = [['attendance', 'logs'], ['examData', 'records'], ['examData', 'exams'], ['points', 'logs'], ['handbook', 'notes'], ['handbook', 'bans']];
// 纯对象字段：按顶层键补齐（座次表 seatingByClass 是「班级id -> 座次」映射）
const MERGE_OBJECT_KEYS = ['seatingByClass'];

// 按 id 取并集：把 la 里 cloud 没有的补进 ca，返回补入条数
function mergeById(la, ca, kp) {
  if (!Array.isArray(la) || !la.length || !Array.isArray(ca)) return 0;
  let n = 0;
  const have = new Set(ca.map(x => x && x.id));
  const D = (kp && state && state._deleted) ? state._deleted : null;
  la.forEach(x => {
    if (!x || !x.id || have.has(x.id)) return;
    if (D && _tomboHas(D, kp, 'id', x.id)) return; // 墓碑：已删除的不再复活
    ca.unshift(x); have.add(x.id); n++;
  });
  return n;
}
// 按值取并集（字符串数组，如识别关键词）
function mergeByValue(la, ca, kp) {
  if (!Array.isArray(la) || !la.length || !Array.isArray(ca)) return 0;
  let n = 0;
  const have = new Set(ca);
  const D = (kp && state && state._deleted) ? state._deleted : null;
  la.forEach(x => {
    if (x == null || have.has(x)) return;
    if (D && _tomboHas(D, kp, 'v', x)) return; // 墓碑：已删除的不再复活
    ca.push(x); have.add(x); n++;
  });
  return n;
}
// 把 local 里有、cloud 里没有的记录补进 cloud（按 id 取并集，不做覆盖式替换）
function mergeMissing(local, cloud) {
  let added = 0;
  MERGE_ARRAY_KEYS.forEach(k => {
    if (!Array.isArray(local[k]) || !local[k].length) return;
    if (!Array.isArray(cloud[k])) cloud[k] = [];
    added += mergeById(local[k], cloud[k], k);
  });
  MERGE_NESTED_ARRAYS.forEach(pair => {
    const [p, c] = pair;
    const lp = local[p];
    if (!lp || typeof lp !== 'object') return;
    if (!Array.isArray(lp[c]) || !lp[c].length) return;
    if (!cloud[p] || typeof cloud[p] !== 'object') cloud[p] = {};
    if (!Array.isArray(cloud[p][c])) cloud[p][c] = [];
    added += mergeById(lp[c], cloud[p][c], p + '.' + c);
  });
  MERGE_OBJECT_KEYS.forEach(k => {
    const lo = local[k];
    if (!lo || typeof lo !== 'object') return;
    const keys = Object.keys(lo);
    if (!keys.length) return;
    if (!cloud[k] || typeof cloud[k] !== 'object') cloud[k] = {};
    keys.forEach(kk => { if (!(kk in cloud[k])) { cloud[k][kk] = lo[kk]; added++; } });
  });
  // 职务与值日：structure 按 id 并集，assign / representatives 按姓名并集（不能整对象替换，否则丢人）
  const lp = local.positions;
  if (lp && typeof lp === 'object') {
    cloud.positions = cloud.positions || {};
    const cp = cloud.positions;
    if (Array.isArray(lp.structure) && lp.structure.length) {
      if (!Array.isArray(cp.structure)) cp.structure = [];
      added += mergeById(lp.structure, cp.structure, 'positions.structure');
    }
    if (lp.assign && typeof lp.assign === 'object') {
      cp.assign = cp.assign || {};
      Object.keys(lp.assign).forEach(rid => {
        const ln = Array.isArray(lp.assign[rid]) ? lp.assign[rid] : [];
        if (!Array.isArray(cp.assign[rid])) cp.assign[rid] = [];
        added += mergeByValue(ln, cp.assign[rid], 'positions.assign.' + rid);
      });
    }
    if (Array.isArray(lp.representatives) && lp.representatives.length) {
      if (!Array.isArray(cp.representatives)) cp.representatives = [];
      const byId = {};
      cp.representatives.forEach(r => { if (r && r.id) byId[r.id] = r; });
      lp.representatives.forEach(r => {
        if (!r || !r.id) return;
        if (!byId[r.id]) { cp.representatives.push(r); byId[r.id] = r; added++; return; }
        if (!Array.isArray(byId[r.id].names)) byId[r.id].names = [];
        added += mergeByValue(r.names || [], byId[r.id].names, 'positions.representatives.names');
      });
    }
  }
  // 识别关键词（recKeywords.labels / .desc 是「类型 -> 关键词数组」的映射，按值并集）
  const lkw = local.recKeywords;
  if (lkw && typeof lkw === 'object') {
    cloud.recKeywords = cloud.recKeywords || {};
    ['labels', 'desc'].forEach(sk => {
      const src = lkw[sk];
      if (!src || typeof src !== 'object') return;
      cloud.recKeywords[sk] = cloud.recKeywords[sk] || {};
      Object.keys(src).forEach(t => {
        if (!Array.isArray(cloud.recKeywords[sk][t])) cloud.recKeywords[sk][t] = [];
        added += mergeByValue(src[t] || [], cloud.recKeywords[sk][t], 'recKeywords.' + sk + '.' + t);
      });
    });
  }
  // 作业识别关键词（字符串数组）
  if (Array.isArray(local.homeworkKeywords) && local.homeworkKeywords.length) {
    if (!Array.isArray(cloud.homeworkKeywords)) cloud.homeworkKeywords = [];
    added += mergeByValue(local.homeworkKeywords, cloud.homeworkKeywords, 'homeworkKeywords');
  }
  // 学生身上的行为记录（students[].records）
  if (Array.isArray(cloud.students) && Array.isArray(local.students)) {
    const byId = {};
    const D2 = (state && state._deleted) ? state._deleted : null;
    local.students.forEach(s => { if (s && s.id) byId[s.id] = s; });
    cloud.students.forEach(cs => {
      const ls = byId[cs.id];
      if (!ls || !Array.isArray(ls.records)) return;
      if (!Array.isArray(cs.records)) cs.records = [];
      const have = new Set(cs.records.map(x => x && x.id));
      ls.records.forEach(r => { if (r && r.id && !have.has(r.id)) { if (D2 && _tomboHas(D2, 'students.records', 'id', r.id)) return; cs.records.unshift(r); have.add(r.id); added++; } });
    });
  }
  return added;
}
// 拉取云端数据后的统一入口：判断是否需要把本地未同步的记录补回云端
function applyCloudState(cloudRaw) {
  // 锁定态是本机显示偏好，不参与云端同步：先记下本机当前是否锁定，合并后再还原，
  // 避免「同步数据把别的设备的锁定/解锁状态带到本机」，也避免同步时把已解锁设备重新锁死。
  const localLocked = isLocked();
  const localDeleted = (state && state._deleted) ? state._deleted.slice() : [];
  if (!cloudRaw) { return; }
  let cloud;
  try { cloud = migrateState(cloudRaw); } catch (e) { cloud = null; }
  if (!cloud) { return; }
  const lt = state && state._savedAt ? state._savedAt : 0;
  const ct = cloud._savedAt ? cloud._savedAt : 0;
  // 仅当「本地保存时间明显晚于云端」时才合并 —— 说明本地有改动没推上去。
  // 云端没有时间戳（旧数据）时不合并，避免把别处已删除的记录大量复活。
  let added = 0;
  if (lt && ct && lt > ct + 5000) {
    try { localStorage.setItem(CLOUD_BACKUP_KEY, JSON.stringify(cloud)); } catch (e) {} // 合并前留底，便于回滚
    added = mergeMissing(state, cloud);
  }
  state = cloud;
  state.locked = localLocked; // 还原本机锁定态（不被云端覆盖）
  // 合并墓碑（本机删的 + 云端删的，全部保留），并据此剔除已删除条目，使删除跨设备同步、不再复活
  state._deleted = unionDeleted(localDeleted, cloud._deleted);
  applyTombstones(state);
  if (added > 0) {
    save(true); // internal：恢复数据属于系统行为，锁定状态下也要写回
    setTimeout(() => { try { toast(`已恢复 ${added} 条未同步到云端的记录`); } catch (e) {} }, 600);
  }
}

// ===================== 成绩分析（数学单科 + 班级预设）=====================
// 预识别列：score 类用于算均分/排名；rank 类（班次/校次/县次）单独存为排名数字，不混入均分
const EXAM_COLUMNS_DEFAULT = [
  { key: '语文', type: 'score' },
  { key: '数学', type: 'score' },
  { key: '英语', type: 'score' },
  { key: '政治', type: 'score' },
  { key: '历史', type: 'score' },
  { key: '物理', type: 'score' },
  { key: '化学', type: 'score' },
  { key: '体育', type: 'score' },
  { key: '班次', type: 'rank' },
  { key: '校次', type: 'rank' },
  { key: '县次', type: 'rank' },
];
function defaultExamColumns() {
  return EXAM_COLUMNS_DEFAULT.map(c => ({ key: c.key, type: c.type, enabled: true }));
}
// ===================== 考试赋分：规则与计算 =====================
// 每个人的考试赋分 = 规定日期内各次考试积分之和
// 规定日期 = 首页设定的 calcStartDate ~ 今天
// 单次考试积分 = 班次第n名(班级总人数+1-n) + 校次区间赋分(读上传的校次列) + 单科最高分赋分(班内每科第1名)
function defaultExamScore() {
  return {
    classRank: { enabled: true },                                   // 班次第n名 = 班级参考人数+1-n（按总分排名）
    schoolRank: {
      enabled: true,
      column: '校次',                                               // 读取的校次列（来自成绩上传的 rank 列）
      tiers: [                                                      // 校次名次区间 → 赋分（闭区间 [from, to]）
        { from: 1, to: 10, points: 5 },
        { from: 11, to: 50, points: 3 },
        { from: 51, to: 99999, points: 1 }
      ]
    },
    subjectTop: {
      enabled: true,
      points: 3,                                                    // 班内每科第1名赋分
      scope: 'class'                                                // 'class' | 'school'
    },
    progressRank: {
      enabled: true,
      standard: 'schoolRank',                                       // 按校次变化判定（对比上次考试）
      improvePoints: 8,                                             // 校次进步 → 奖励分
      regressPoints: -3,                                            // 校次退步 → 扣分
      minTierChange: 1                                              // 最少跨越几个档位才触发（0=任何变化都触发）
    }
  };
}
function normalizeExamScore(obj) {
  const def = defaultExamScore();
  if (!obj || typeof obj !== 'object') return def;
  const o = obj;
  return {
    classRank: { enabled: !!(o.classRank && o.classRank.enabled) },
    schoolRank: {
      enabled: !!(o.schoolRank && o.schoolRank.enabled),
      column: (o.schoolRank && o.schoolRank.column) || def.schoolRank.column,
      tiers: (o.schoolRank && Array.isArray(o.schoolRank.tiers) && o.schoolRank.tiers.length)
        ? o.schoolRank.tiers.map((t, idx, arr) => {
            const prevTo = idx > 0 ? (+arr[idx - 1].to || +arr[idx - 1].upTo || 99999) : 0;
            const to = +t.to || +t.upTo || 99999;
            const from = +t.from || (idx === 0 ? 1 : prevTo + 1);
            return { from, to, points: +t.points || 0 };
          }).sort((a, b) => a.to - b.to)
        : def.schoolRank.tiers.map(t => ({ ...t }))
    },
    subjectTop: {
      enabled: !!(o.subjectTop && o.subjectTop.enabled),
      points: (o.subjectTop && typeof o.subjectTop.points === 'number') ? o.subjectTop.points : def.subjectTop.points,
      scope: (o.subjectTop && o.subjectTop.scope) || def.subjectTop.scope
    },
    progressRank: {
      enabled: !!(o.progressRank && o.progressRank.enabled),
      standard: (o.progressRank && o.progressRank.standard) || def.progressRank.standard,
      improvePoints: (o.progressRank && typeof o.progressRank.improvePoints === 'number') ? o.progressRank.improvePoints : def.progressRank.improvePoints,
      regressPoints: (o.progressRank && typeof o.progressRank.regressPoints === 'number') ? o.progressRank.regressPoints : def.progressRank.regressPoints,
      minTierChange: (o.progressRank && typeof o.progressRank.minTierChange === 'number') ? o.progressRank.minTierChange : def.progressRank.minTierChange
    }
  };
}

// ===================== 考勤管理：核心逻辑（含跨日自动归档）=====================
const ATT_WEEK = ['一','二','三','四','五']; // 固定回家可选的工作日
function attDateKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function attDayName(d){ return ['日','一','二','三','四','五','六'][d.getDay()]; }
function attMembers(){
  // 班级成员直接取自「学生管理」，保证与学生管理实时一致；仅展示当前班级，避免两班混排
  return (state.students||[]).filter(s=>s&&s.name&&s.class===state.activeClass).map(s=>({
    name: s.name,
    gender: s.gender,
    class: s.class,
    weeklyHome: Array.isArray(s.weeklyHome) ? s.weeklyHome.slice() : []
  }));
}
function attStudentByName(name){ return (state.students||[]).find(s=>s.name===name); }
function attRecomputeHome(){
  const a=state.attendance; if(!a) return;
  if(!a.current) a.current={date:attDateKey(new Date()),home:{},leave:{},leaveTs:{}};
  a.current.home = attDeriveHome();
}
function attDeriveHome(){
  const day=attDayName(new Date()); const home={};
  attMembers().forEach(m=>{ if((m.weeklyHome||[]).includes(day)) home[m.name]=true; });
  return home;
}
function attStats(){
  const cur=((state.attendance||{}).current)||{home:{},leave:{},leaveTs:{}};
  const total=attMembers().length;
  const homeKeys=Object.keys(cur.home||{}), leaveKeys=Object.keys(cur.leave||{});
  const absent=new Set([...homeKeys,...leaveKeys]);
  return { total, home:homeKeys.length, leave:leaveKeys.length, present:Math.max(0,total-absent.size),
           rate:total?Math.round((total-absent.size)/total*1000)/10:0 };
}
function attBuildLog(cur){
  return { id:uid(), date:cur.date, dateLabel:cur.date, ts:nowTs(), total:attStats().total,
    home:Object.keys(cur.home||{}),
    // 快照里把请假的精确时刻一并存档（旧快照没有 leaveTs，time 为空，展示时不伪造）
    leave:Object.entries(cur.leave||{}).map(([name,reason])=>{
      const ts=(cur.leaveTs||{})[name]||0;
      return { name, reason:reason===true?'':reason, ts, time: ts ? nowStampSec(new Date(ts)) : (cur.date||'') };
    }),
    present:attStats().present, rate:attStats().rate };
}
function archiveCurrentAttendance(cur){
  const a=state.attendance; if(!cur||!cur.date) return;
  a.logs.unshift(attBuildLog(cur));
  Object.entries(cur.leave||{}).forEach(([name,reason])=>{
    const r=reason===true?'':reason;
    const ts=(cur.leaveTs||{})[name]||0;
    // 归档日 = 请假发生那天；时刻能追溯就补上，没有就只留日期
    const d=ts ? nowStampSec(new Date(ts)) : (cur.date||'');
    state.classLogs.unshift({ id:uid(), date:d, ts:ts||nowTs(), content:`【考勤】${name} 请假${r?('（'+r+'）'):''}` });
  });
}
// 第二天打开（首次加载）时：归档前一天快照、清空请假、固定回家按周期保留
function autoArchiveAttendance(){
  const a=state.attendance; if(!a) return;
  const today=attDateKey(new Date());
  if(!a.current){ a.current={ date:today, home:attDeriveHome(), leave:{}, leaveTs:{} }; return; }
  if(a.current.date !== today){
    archiveCurrentAttendance(a.current);            // 自动保存前一天考勤到历史
    a.current={ date:today, home:attDeriveHome(), leave:{}, leaveTs:{} }; // 固定回家由周期重新派生（保留），请假清空
    save();
  }
}

let state = loadState();
autoArchiveAttendance();   // ★ 跨日自动归档：打开即把前一天考勤存入历史并重置当天
let currentRoute = 'home';
let gsQuery = '';            // 全局搜索框内容（姓名/科目）
let profileSid = null;       // 当前查看的学生档案
let profileSubject = '';     // 档案页成绩趋势所选科目
let hwSearchName = '';       // 作业模块搜索（姓名/科目/内容）
let hwSubjectFilter = '';    // 作业模块科目筛选
let hwStatusFilter = '';     // 作业模块完成状态筛选：'' / '未完成' / '已完成'
let hwClassFilter = '';      // 作业模块班级筛选（两个班分开查看）
let reportRange = 'week';    // 周报/月报切换
let selStudentIds = {};      // 学生管理批量选择（id -> true）

// ===================== Helpers =====================
const now = new Date();
const todayIndex = (now.getDay() + 6) % 7; // Mon=0 ... Fri=4
const todayLabel = (now.getMonth() + 1) + '月' + now.getDate() + '日';
function formatDate(d) {
  const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${days[d.getDay()]}`;
}
// ===================== 时间精度（2026-08-30 起：记录精确到秒） =====================
// 约定：
//   date —— 事件归档时间，字符串。新记录写作「YYYY-MM-DD HH:mm:ss」；
//           若用户明确选了/说了另一天（昨天、周三、手选日期），只写「YYYY-MM-DD」。
//   ts   —— 该条记录**实际录入**的毫秒时间戳（Date.now()），永远有值。
//   两者分离，才能分清「事情哪天发生」和「这条什么时候记的」。
//   旧数据只有「8月30日」这类日期、没有 ts，展示时不显示时间（不伪造）。
const _p2 = n => String(n).padStart(2, '0');
function nowTs() { return Date.now(); }
// 「YYYY-MM-DD HH:mm:ss」（本地时区，精确到秒）
function nowStampSec(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${_p2(x.getMonth() + 1)}-${_p2(x.getDate())} ${_p2(x.getHours())}:${_p2(x.getMinutes())}:${_p2(x.getSeconds())}`;
}
// 「YYYY-MM-DD」（本地时区）
function todayISO(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${_p2(x.getMonth() + 1)}-${_p2(x.getDate())}`;
}
// 取出时间部分：'2026-08-30 21:10:03' -> '21:10:03'；无时间返回 ''
function recTimePart(s) {
  const m = String(s || '').match(/^\d{4}-\d{2}-\d{2}[T\s](\d{2}:\d{2}(?::\d{2})?)/);
  return m ? m[1] : '';
}
// 取出日期部分：'2026-08-30 21:10:03' -> '2026-08-30'
function recDatePart(s) {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(s || '');
}
// 展示用：新格式 -> 「8月30日 21:10:03」；旧格式（8月30日 / 2026-08-30）原样加日期
function recDateLabel(s) {
  const raw = String(s == null ? '' : s).trim();
  if (!raw) return '';
  const t = recTimePart(raw);
  const iso = recDatePart(raw);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = m ? (+m[2]) + '月' + (+m[3]) + '日' : raw;
  return t ? `${day} ${t}` : day;
}
// <input type="datetime-local" step="1"> 需要的初值：'YYYY-MM-DDTHH:mm:ss'
function dtLocalValue(d) {
  const x = d || new Date();
  return `${todayISO(x)}T${_p2(x.getHours())}:${_p2(x.getMinutes())}:${_p2(x.getSeconds())}`;
}
// 解析 datetime-local / 手输值 -> 'YYYY-MM-DD HH:mm:ss'（前端补 0 秒）；无法解析返回 ''
function parseDtLocal(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return d ? d[0] : s; // 只有日期，或旧格式原样返回
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function navigate(route) {
  selStudentIds = {};
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
  const clsOpts = (state.classes || []).map(c => `<option value="${esc(c.id)}" ${c.id===state.activeClass?'selected':''}>${esc(c.name)}</option>`).join('');
  openModal('批量导入学生', `
    <div class="space-y-4">
      <div class="p-3 rounded-xl bg-primary/5 border border-primary/10 text-sm">
        <label class="block text-xs text-gray-500 mb-1">导入到班级</label>
        <select id="impStudentClass" class="w-full border rounded-lg p-2 text-sm bg-white">${clsOpts}</select>
        <label class="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" id="impStudentUseCol" checked class="w-4 h-4 accent-primary"> 按 CSV 中的「班级」列分配（不勾则全部归入上方所选班级；留空也归入所选班级）
        </label>
      </div>
      <p class="text-sm text-gray-500 leading-relaxed">支持粘贴、上传 CSV 文本，或直接上传 Excel 文件。每行一个学生，用英文逗号或制表符分隔：<br><code>姓名,性别,班级</code>（性别、班级可留空）。首行若是标题则自动跳过。</p>
      <textarea id="impStudentText" rows="8" class="w-full border rounded-lg p-3 text-sm" placeholder="张明轩,男,${esc(state.activeClass)}&#10;王浩然,男,${esc(state.activeClass)}"></textarea>
      <div><input id="impStudentFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm"></div>
      <div class="flex gap-3">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('impStudentText').value='姓名,性别,班级\\n张明轩,男,${esc(state.activeClass)}\\n王浩然,男,${esc(state.activeClass)}'">填入示例</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doImportStudents()">导入</button>
      </div>
    </div>`, 'lg');
  bindFileToText('impStudentFile', 'impStudentText');
}
function doImportStudents() {
  const text = document.getElementById('impStudentText').value.trim();
  if (!text) return alert('请粘贴或上传学生数据');
  const targetClass = document.getElementById('impStudentClass').value;
  const useCol = document.getElementById('impStudentUseCol').checked;
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /姓名|name|学生/i.test(rows[0][0])) start = 1;
  let n = 0;
  for (let i = start; i < rows.length; i++) {
    const name = rows[i][0]; if (!name) continue;
    const gender = rows[i][1] || '未设置';
    const cls = useCol ? resolveClass(rows[i][2], targetClass) : targetClass;
    const avatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(name);
    state.students.push({ id: uid(), name, gender, class: cls, avatar, records: [] });
    n++;
  }
  if (!n) return alert('没有解析到有效学生，请检查格式');
  save(); render(); closeModal();
  alert('成功导入 ' + n + ' 名学生到「' + className(targetClass) + '」');
}
function openImportScores() {
  const clsOpts = (state.classes || []).map(c => `<option value="${esc(c.id)}" ${c.id===state.activeClass?'selected':''}>${esc(c.name)}</option>`).join('');
  openModal('批量导入成绩', `
    <div class="space-y-4">
      <div class="p-3 rounded-xl bg-primary/5 border border-primary/10 text-sm">
        <label class="block text-xs text-gray-500 mb-1">导入到班级</label>
        <select id="impScoreClass" class="w-full border rounded-lg p-2 text-sm bg-white">${clsOpts}</select>
        <label class="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" id="impScoreUseCol" checked class="w-4 h-4 accent-primary"> 按 CSV 中的「班级」列分配（不勾则全部归入上方所选班级；留空也归入所选班级）
        </label>
      </div>
      <p class="text-sm text-gray-500 leading-relaxed">支持粘贴、上传 CSV 文本，或直接上传 Excel 文件。每行一条：<code>姓名,班级,科目,考试,分数</code>。首行标题自动跳过。</p>
      <textarea id="impScoreText" rows="8" class="w-full border rounded-lg p-3 text-sm" placeholder="张明轩,${esc(state.activeClass)},英语,期中考试,78"></textarea>
      <div><input id="impScoreFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm"></div>
      <div class="flex gap-3">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('impScoreText').value='姓名,班级,科目,考试,分数\\n张明轩,${esc(state.activeClass)},英语,期中考试,78\\n王浩然,${esc(state.activeClass)},英语,期中考试,92'">填入示例</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doImportScores()">导入</button>
      </div>
    </div>`, 'lg');
  bindFileToText('impScoreFile', 'impScoreText');
}
function doImportScores() {
  const text = document.getElementById('impScoreText').value.trim();
  if (!text) return alert('请粘贴或上传成绩数据');
  const targetClass = document.getElementById('impScoreClass').value;
  const useCol = document.getElementById('impScoreUseCol').checked;
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /姓名|name|学生/i.test(rows[0][0])) start = 1;
  let n = 0;
  for (let i = start; i < rows.length; i++) {
    const name = rows[i][0]; if (!name) continue;
    const score = parseFloat(rows[i][4]);
    if (isNaN(score)) continue;
    const cls = useCol ? resolveClass(rows[i][1], targetClass) : targetClass;
    state.scores.unshift({ id: uid(), name, class: cls, subject: rows[i][2] || '英语', exam: rows[i][3] || '考试', score });
    n++;
  }
  if (!n) return alert('没有解析到有效成绩，请检查格式');
  save(); render(); closeModal();
  alert('成功导入 ' + n + ' 条成绩到「' + className(targetClass) + '」');
}

// ===================== Render =====================
let lastRenderRoute = null;
function render() {
  homeExhibitClearTimer();
  const app = document.getElementById('app');
  const nav = app && app.querySelector('aside nav');
  const main = document.getElementById('main-content');
  const savedNavScroll = nav ? nav.scrollTop : 0;
  const savedMainScroll = (main && currentRoute === lastRenderRoute) ? main.scrollTop : 0;
  app.innerHTML = `
    ${renderSidebar()}
    <main class="flex-1 flex flex-col h-full overflow-hidden relative">
      ${renderTopBar()}
      <div class="flex-1 overflow-auto p-6 pb-24" id="main-content">
        ${ptWithSigMemo(renderPage)}
      </div>
      ${renderFab()}
    </main>`;
  attachSidebarEvents();
  const newNav = app.querySelector('aside nav');
  if (newNav) newNav.scrollTop = savedNavScroll;
  const newMain = document.getElementById('main-content');
  if (newMain && currentRoute === lastRenderRoute) newMain.scrollTop = savedMainScroll;
  lastRenderRoute = currentRoute;
  if (currentRoute === 'schedule') {
    const btnP = document.querySelector('[data-periods]');
    if (btnP) btnP.addEventListener('click', openPeriodSetting);
    const btnA = document.querySelector('[data-addcourse]');
    if (btnA) btnA.addEventListener('click', openCourseModal);
  }
  if (currentRoute === 'students') {
    const b = document.querySelector('[data-newstudent]');
    if (b) b.addEventListener('click', openStudentForm);
  }
  if (currentRoute === 'classLog') {
    const b = document.querySelector('[data-newlog]');
    if (b) b.addEventListener('click', openClassLogForm);
  }
  if (currentRoute === 'homework') {
    const b = document.querySelector('[data-newhw]');
    if (b) b.addEventListener('click', openHomeworkForm);
  }
  if (currentRoute === 'reminders') {
    const b = document.querySelector('[data-newreminder]');
    if (b) b.addEventListener('click', openReminderForm);
  }
  if (currentRoute === 'home') initHomeExhibit();
  applyTheme();
}

function renderSidebar() {
  const buildItem = (item) => {
    const active = currentRoute === item.id ? 'active' : '';
    return `<div class="sidebar-item ${active} flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer text-sm" data-route="${item.id}" data-lock-allow>
      <span class="text-base">${item.icon}</span>
      <span class="font-medium">${item.label}</span>
    </div>`;
  };
  let itemsHtml = '';
  // 9班（任课视角）仅显示部分模块，班主任专属模块（课程表/积分/日志/座次/职务值日/考勤/周报/待办）隐藏
  const teacherOnly = ['schedule','points','sport','classLog','seating','positions','attendance','reminders','examscore','behavior','handbook'];
  const isHead = state.activeClass === state.headTeacherClass;
  state.nav.forEach(group => {
    if (group.section && group.items) {
      const items = group.items.filter(it => isHead || !teacherOnly.includes(it.id));
      if (!items.length) return;
      itemsHtml += `<div class="mt-4 mb-2 px-4 text-xs text-gray-400 font-medium">${group.section}</div>`;
      itemsHtml += items.map(buildItem).join('');
    } else if (group.id) {
      if (!isHead && teacherOnly.includes(group.id)) return;
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
        <button class="w-full text-xs border rounded py-1.5 hover:bg-gray-50" data-lock-allow onclick="openSettings()">⚙️ 设置</button>
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

function setActiveClass(cls) {
  if (state.activeClass === cls) return;
  selStudentIds = {};
  state.activeClass = cls;
  // 9班（任课视角）仅保留：首页/学生/课堂/成绩/作业，其余班主任专属模块回退到首页
  const teacherOnly = ['schedule','points','sport','classLog','seating','positions','attendance','reminders','examscore','behavior','handbook'];
  if (cls !== state.headTeacherClass && teacherOnly.includes(currentRoute)) currentRoute = 'home';
  save(true); render();   // internal：切换班级属于查看行为，锁定下必须允许
}

function renderTopBar() {
  let lockBanner = '';
  if (isLocked()) {
    // 真正的只读锁定：仅查看，修改被拦截。未登录时引导登录（登录即解锁）；已登录时提供解锁
    if (GUEST_MODE) {
      lockBanner = `<div class="bg-amber-500 text-white text-xs sm:text-sm px-4 py-2 flex items-center justify-between sticky top-0 z-20">
        <span>🔒 只读模式（未登录）：请输入账号登录以解锁编辑</span>
        <button data-lock-allow onclick="showLogin()" class="bg-white/90 text-amber-600 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2">登录</button>
      </div>`;
    } else {
      lockBanner = `<div class="bg-amber-500 text-white text-xs sm:text-sm px-4 py-2 flex items-center justify-between sticky top-0 z-20">
        <span>🔒 只读模式：当前仅可查看，所有修改已禁用</span>
        <button data-lock-allow onclick="doUnlockPrompt()" class="bg-white/90 text-amber-600 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2">🔓 解锁</button>
      </div>`;
    }
  } else if (GUEST_MODE) {
    // 未登录的访客模式：可查看、可本地改动，但未同步云端（不是只读锁定）
    lockBanner = `<div class="bg-blue-500 text-white text-xs sm:text-sm px-4 py-2 flex items-center justify-between sticky top-0 z-20">
      <span>🖥️ 大屏模式 · 未登录（改动仅存本机，未同步云端）</span>
      <button data-lock-allow onclick="showLogin()" class="bg-white/90 text-blue-600 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2">登录</button>
    </div>`;
  }
  const classSwitch = `<div class="flex items-center gap-1 bg-gray-100 rounded-full p-0.5 mr-2 overflow-x-auto max-w-[60vw]">
    ${(state.classes || []).map(c => `<button data-lock-allow onclick="setActiveClass('${c.id}')" class="text-xs px-3 py-1 rounded-full transition whitespace-nowrap ${state.activeClass===c.id?'bg-white text-primary shadow-sm font-medium':'text-gray-500 hover:text-gray-700'}">${c.name}</button>`).join('')}
  </div>`;
  const titles = {
    home: '工作台首页', schedule: '课程表', students: '学生管理', classLog: '班级日志',
    seating: '座次表', classRecord: '课堂记录', behavior: '行为记录',
    homework: '作业管理', report: '周报月报', reminders: '待办提醒', points: '积分管理', exam: '成绩管理',
    examscore: '考试赋分', positions: '职务与值日管理', sport: '体育管理',
  };
  const menuBtn = `<button id="menuBtn" data-lock-allow onclick="toggleSidebar()" class="mr-3 text-xl text-gray-600" title="菜单">☰</button>`;
  const themeBtn = `<button id="themeToggle" data-lock-allow onclick="toggleTheme()" class="ml-3 text-lg" title="切换深色模式">🌙</button>`;
  const searchBox = `<div data-lock-allow class="hidden md:flex items-center gap-2 border border-gray-200 rounded-full px-3 py-1.5 bg-gray-50" style="min-width:220px;">
    <span class="text-gray-400 text-sm">🔍</span>
    <input id="gsInput" data-lock-allow value="${esc(gsQuery)}" oninput="gsSetQuery(this.value)" onkeydown="if(event.key==='Enter')gsOpen()" placeholder="搜索姓名/科目，如：张三 数学" class="bg-transparent outline-none text-sm w-40">
    <button data-lock-allow onclick="gsOpen()" class="text-primary text-xs font-medium hover:underline">搜索</button>
  </div>`;
  const syncBadge = `<span id="sync-badge" class="text-[11px] text-gray-400 mr-1"></span>`;
  const logoutBtn = AUTH_TOKEN ? `<button data-lock-allow onclick="doLogout()" class="ml-2 text-lg" title="退出登录">🚪</button>` : '';
  const loginBtn = GUEST_MODE ? `<button data-lock-allow onclick="showLogin()" class="ml-2 text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" title="切换到完整登录模式">登录</button>` : '';
  let extra = '';
  if (currentRoute === 'points') {
    return `<header class="bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      ${menuBtn}${classSwitch}<h1 class="text-lg font-bold text-gray-800">积分管理</h1>${searchBox}
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtRules()">⚙️ 规则</button>
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtLogs()">📜 日志</button>
        <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openPtBatch()">批量加减分</button>
        <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openPtAdjust(null,'daily',1)">+ 加减分</button>
        ${syncBadge}${loginBtn}${themeBtn}${logoutBtn}
      </div>
    </header>${lockBanner}`;
  }
  // 首页特有：在标题旁显示积分起算日期（紧凑内联）
  const homeDateBar = (currentRoute === 'home') ? (() => {
    // todayIndex = (getDay()+6)%7 → 周一=0，必须用「周一首」的数组。
    // 旧实现用了「周日首」的数组，导致首页日期条的星期整体错一天。
    const tw = ['周一','周二','周三','周四','周五','周六','周日'][todayIndex];
    const dl = (new Date().getMonth()+1) + '月' + new Date().getDate() + '日';
    const sd = state.points.calcStartDate || '2026-01-01';
    return `<div class="flex items-center gap-2 text-xs text-gray-500 ml-3">📅 <span class="font-medium text-gray-700">${tw} ${dl}</span>·<span class="text-gray-400">起算</span><input id="homeCalcStart" type="date" value="${esc(sd)}" class="border border-gray-200 rounded px-1 py-0.5 text-xs w-[105px]"><button class="bg-primary/90 text-white px-2 py-0.5 rounded-full text-xs hover:bg-primaryDark whitespace-nowrap" onclick="saveHomeCalcStart()">保存</button></div>`;
  })() : '';
  if (currentRoute === 'home') extra = `<button onclick="openQuickRecord()" class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5">+ 一句话记录</button>`;
  else if (currentRoute === 'sport') extra = `<button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openSportCfg()">⚙️ 设置</button>`;
  else if (currentRoute === 'schedule') extra = `<button data-periods class="text-sm text-gray-500 hover:text-primary mr-2">⚙️ 设置节次</button><button data-addcourse class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark">+ 添加课程</button>`;
  else if (currentRoute === 'seating') extra = `<button class="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full hover:bg-gray-50 mr-2" onclick="openSeatConfig()">⚙️ 布局</button><button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5 mr-2" onclick="exportSeatTeacher()">👩‍🏫 教师用</button><button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="exportSeatStudent()">🎒 学生用</button>`;
  else if (['students','classLog','homework','reminders'].includes(currentRoute)) {
    const labels = { students:'+ 新建学生', classLog:'+ 写日志', homework:'+ 记完成情况', reminders:'+ 新建提醒' };
    const data = { students:'data-newstudent', classLog:'data-newlog', homework:'data-newhw', reminders:'data-newreminder' };
    let importBtn = '';
    if (currentRoute === 'students') importBtn = `<button class="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full hover:bg-gray-50 mr-2" onclick="openImportStudents()">⬆️ 批量导入</button>`;
    extra = importBtn + `<button ${data[currentRoute]} class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5">${labels[currentRoute]}</button>`;
  }
  return `<header class="bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
    ${menuBtn}${classSwitch}${homeDateBar}${searchBox}
    <div class="flex items-center gap-3 flex-wrap justify-end">${extra}${syncBadge}${loginBtn}${themeBtn}${logoutBtn}</div>
  </header>${lockBanner}`;
}

function renderFab() {
  if (isLocked()) return '';
  // 单击直接进一句话记录（手机端要的是「掏出手机 → 点一下 → 立刻能打字」）。
  // 其余 8 个入口收进一句话记录弹窗底部的「更多录入方式」，功能一个没少。
  return `<button class="fab absolute bottom-6 right-6 w-12 h-12 rounded-full text-white flex items-center justify-center text-xl hover:scale-105 transition" onclick="openQuickRecord()" title="一句话记录">✏️</button>`;
}

function renderPage() {
  const map = {
    home: renderHome, schedule: renderSchedule, students: renderStudents, classLog: renderClassLog,
    seating: renderSeating, classRecord: renderClassRecord, behavior: renderBehavior,
    homework: renderHomework, report: renderReport, reminders: renderReminders,
    points: renderPoints, exam: renderExam, examscore: renderExamScore, attendance: renderAttendance, positions: renderPositions,
    sport: renderSport,
    handbook: renderHandbook,
    search: renderGlobalSearch, profile: renderStudentProfile,
  };
  return (map[currentRoute] || renderHome)();
}

// ===================== 全局搜索 + 学生档案 =====================
function gsSetQuery(v) { gsQuery = v; }
function gsOpen() { if (!gsQuery.trim()) return; currentRoute = 'search'; render(); }
function openProfile(sid) { profileSid = sid; currentRoute = 'profile'; render(); }

function studentLeaveCount(name) {
  let n = 0;
  const A = state.attendance || {};
  (A.logs || []).forEach(l => ((l && l.leave) || []).forEach(x => { if (x && x.name === name) n++; }));
  if (A.current && Object.prototype.hasOwnProperty.call(A.current.leave || {}, name)) n++;
  return n;
}

function gsParse() {
  const tokens = (gsQuery || '').trim().split(/\s+/).filter(Boolean);
  const nameHits = (state.students || []).filter(s => s && s.name && tokens.some(t => t.length >= 2 && s.name.includes(t)));
  const nameSet = new Set(nameHits.map(s => s.name));
  const kw = tokens.filter(t => !nameSet.has(t));
  const kwMatch = (txt) => !kw.length || kw.every(t => (txt || '').includes(t));
  return { tokens, nameHits, nameSet, kw, kwMatch };
}

function renderGlobalSearch() {
  const { nameHits, nameSet, kw, kwMatch } = gsParse();
  const rows = [];
  // 各数据源统一走空值兜底：任何一处结构损坏都不该让整个搜索页白屏
  (state.classRecords || []).filter(r => r && (!nameSet.size || (r.studentName && nameSet.has(r.studentName))) && kwMatch((r.subject || '') + ' ' + (r.content || ''))).forEach(r => {
    rows.push({ mod: '课堂', tag: '#EEEDFE', tagc: '#534AB7', name: r.studentName || '', subj: r.subject || '', content: r.content || '', date: recDateLabel(r.date), go: "navigate('classRecord')" });
  });
  // 作业按姓名匹配（旧代码拿 class 去比对姓名，导致按姓名搜不到）
  (state.homework || []).filter(h => h && (!nameSet.size || (hwStudentName(h) && nameSet.has(hwStudentName(h)))) && kwMatch((h.subject || '') + ' ' + (h.title || '') + ' ' + (hwStudentName(h) || ''))).forEach(h => {
    rows.push({ mod: '作业', tag: '#E1F5EE', tagc: '#0F6E56', name: hwStudentName(h) || '', subj: h.subject || '', content: (h.title || '') + (h.status ? ('（' + h.status + '）') : ''), date: recDateLabel(h.date || h.due), go: "navigate('homework')" });
  });
  (state.students || []).filter(s => s && (!nameSet.size || nameSet.has(s.name))).forEach(s => {
    (s.records || []).filter(r => r && kwMatch(r.content || '')).forEach(r => {
      rows.push({ mod: '行为', tag: '#FAECE7', tagc: '#993C1D', name: s.name, subj: recordTypeLabel(r.type), content: r.content || '', date: recDateLabel(r.date), go: "openProfile('" + s.id + "')" });
    });
  });
  const _ed = state.examData || {};
  (_ed.records || []).filter(r => r && (!nameSet.size || nameSet.has(r.studentName)) && kwMatch(r.subject || '')).forEach(r => {
    const ex = (_ed.exams || []).find(e => e && e.id === r.examId) || {};
    rows.push({ mod: '成绩', tag: '#E6F1FB', tagc: '#185FA5', name: r.studentName || '', subj: r.subject || '', content: '得分 ' + (r.score != null ? r.score : '—'), date: ex.name || '', go: "navigate('exam')" });
  });

  const profileBtns = nameHits.map(s => `<button class="text-xs text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openProfile('${s.id}')">进入 ${esc(s.name)} 档案 →</button>`).join(' ');
  const rowsHtml = rows.length ? rows.map(r => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 mb-2 cursor-pointer hover:bg-gray-50" onclick="${r.go}">
      <span class="text-xs px-2 py-0.5 rounded" style="background:${r.tag};color:${r.tagc};">${r.mod}</span>
      ${r.name ? `<span class="text-sm font-medium text-gray-800">${esc(r.name)}</span>` : ''}
      <span class="text-xs text-gray-500">${esc(r.subj)}</span>
      <span class="text-sm text-gray-700 flex-1 truncate">${esc(r.content)}</span>
      <span class="text-xs text-gray-400">${esc(r.date)}</span>
    </div>`).join('') : '<div class="text-gray-400 text-sm p-6 text-center">未找到匹配记录，换个姓名或科目试试</div>';

  return `
  <div class="space-y-4">
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <div class="font-bold text-gray-800">🔍 搜索 “${esc(gsQuery)}”</div>
        <button class="text-xs text-gray-400 hover:text-primary" onclick="gsQuery='';navigate('home')">✕ 清除</button>
      </div>
      <p class="text-xs text-gray-500 mb-3">跨 课堂 / 作业 / 行为 / 成绩 聚合结果，共 ${rows.length} 条${nameHits.length ? '；命中 ' + nameHits.length + ' 名学生' : ''}。</p>
      ${profileBtns ? `<div class="flex flex-wrap gap-2">${profileBtns}</div>` : ''}
    </div>
    <div>${rowsHtml}</div>
  </div>`;
}

function studentLatestExamRanks(s) {
  const cid = findClassIdByName(s.name); if (!cid) return null;
  const exams = (state.examData.exams || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const last = exams[exams.length - 1]; if (!last) return null;
  const subj = profileSubject || (examScoreColumns()[0] && examScoreColumns()[0].key);
  if (!subj) return null;
  return { exam: last.name, classRank: examClassRank(last.id, cid, s.name, subj), schoolRank: examGradeRank(last.id, s.name, subj, examClassesSafe().map(c => c.id)) };
}
function profileTrend(s) {
  const cid = findClassIdByName(s.name);
  const classIds = examClassesSafe().map(c => c.id);
  const exams = (state.examData.exams || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return exams.map(e => {
    const r = state.examData.records.find(x => x.examId === e.id && x.studentName === s.name && x.subject === profileSubject);
    if (!r) return null;
    return { name: e.name, date: e.date, score: +r.score, classRank: cid ? examClassRank(e.id, cid, s.name, profileSubject) : null, schoolRank: examGradeRank(e.id, s.name, profileSubject, classIds) };
  }).filter(Boolean);
}
function trendSvg(data) {
  if (!data.length) return '<div class="text-xs text-gray-400">暂无该科目成绩</div>';
  const W = 360, H = 150, padL = 36, padB = 26, padT = 14, padR = 10;
  const scores = data.map(d => d.score);
  const min = Math.min(...scores), max = Math.max(...scores);
  const lo = Math.max(0, Math.floor((min - 5) / 10) * 10), hi = Math.ceil((max + 5) / 10) * 10;
  const x = i => padL + (W - padL - padR) * (data.length === 1 ? 0.5 : i / (data.length - 1));
  const y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo || 1));
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.score).toFixed(1)}`).join(' ');
  const dots = data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.score).toFixed(1)}" r="3" fill="#185FA5"/>`).join('');
  const xlabels = data.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="10" fill="#888" text-anchor="middle">${esc(d.name)}</text>`).join('');
  const ylabels = [lo, Math.round((lo + hi) / 2), hi].map(v => `<text x="30" y="${y(v).toFixed(1)}" font-size="10" fill="#888" text-anchor="end">${v}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#ddd" stroke-width="1"/>
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#ddd" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="#185FA5" stroke-width="2"/>
    ${dots}${xlabels}${ylabels}
  </svg>`;
}
function setProfileSubject(sub) { profileSubject = sub; render(); }

function renderStudentProfile() {
  const s = state.students.find(x => x.id === profileSid);
  if (!s) return '<div class="text-gray-400 p-6">未找到该学生</div>';
  const totalPts = ptSum(ptStudentLogs(s.id));
  const examPts = examScoreStudentTotal(s.name);
  const leaveN = studentLeaveCount(s.name);
  const ranks = studentLatestExamRanks(s);
  const scoreCols = examScoreColumns();
  if (!profileSubject && scoreCols[0]) profileSubject = scoreCols[0].key;
  const subjTabs = scoreCols.map(c => `<button class="px-3 py-1.5 rounded-full text-xs font-medium ${profileSubject === c.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="setProfileSubject('${c.key}')">${esc(c.key)}</button>`).join('');
  const trend = profileTrend(s);
  const crs = state.classRecords.filter(r => r.studentId === s.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const crHtml = crs.length ? crs.slice(0, 12).map(r => `<div class="p-3 rounded-xl bg-gray-50 mb-2"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">${esc(r.subject || '其他')}</span><span class="text-xs text-gray-400">${esc(recDateLabel(r.date))}</span></div><div class="text-sm text-gray-700">${esc(r.content)}</div></div>`).join('') : '<div class="text-gray-400 text-sm">暂无课堂记录</div>';
  // 作业区块优先读「作业完成情况台账」（有准确状态与历史），无台账记录时再回退到课堂记录
  const hwRecs = (state.homework || [])
    .filter(h => (h.studentId && h.studentId === s.id) || (!h.studentId && h.studentName && h.studentName === s.name) || (hwStudentName(h) === s.name))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const hwUndone = hwRecs.filter(r => r.status === '未完成').length;
  const hwHtml = hwRecs.length
    ? `<div class="text-xs text-gray-500 mb-2">共 ${hwRecs.length} 条作业记录 · 未完成 ${hwUndone} 次</div>` + hwRecs.slice(0, 12).map(r => {
        const undone = r.status === '未完成';
        return `<div class="p-3 rounded-xl ${undone ? 'bg-red-50/60' : 'bg-gray-50'} mb-2"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-600 font-medium">${esc(r.subject || '其他')}</span><span class="text-xs px-2 py-0.5 rounded-full ${undone ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">${esc(r.status || '已完成')}</span><span class="text-xs text-gray-400">${esc(hwDateLabel(r.date))}</span></div><div class="text-sm text-gray-700">${esc(r.title || '')}</div></div>`;
      }).join('')
    : (function () {
        const hwKw = /未完成|没交|未做|不交|作业|背诵|默写/;
        const hws = crs.filter(r => hwKw.test(r.content || ''));
        return hws.length ? hws.slice(0, 12).map(r => `<div class="p-3 rounded-xl bg-gray-50 mb-2"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-600 font-medium">${esc(r.subject || '其他')}</span><span class="text-xs text-gray-400">${esc(recDateLabel(r.date))}</span></div><div class="text-sm text-gray-700">${esc(r.content)}</div></div>`).join('') : '<div class="text-gray-400 text-sm">暂无作业相关记录</div>';
      })();
  const beh = { critic: (s.records || []).filter(r => r.type === 'critic').length, praise: (s.records || []).filter(r => r.type === 'praise').length, chat: (s.records || []).filter(r => r.type === 'chat').length, leave: (s.records || []).filter(r => r.type === 'leave').length };
  return `
  <div class="space-y-5">
    <div class="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4 flex-wrap">
      <div class="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium text-lg">${esc(String(s.name || '?').slice(0, 1))}</div>
      <div class="flex-1">
        <div class="font-bold text-gray-800">${esc(s.name || '（未命名）')}</div>
        <div class="text-sm text-gray-500">${esc(s.class || '')}${s.gender ? (' · ' + s.gender) : ''}</div>
      </div>
      <div class="flex gap-2 flex-wrap">
        <span class="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600">总积分 ${totalPts}</span>
        <span class="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600">考试赋分 ${examPts}</span>
        <span class="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600">请假 ${leaveN} 次</span>
        ${ranks ? `<span class="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600">${esc(ranks.exam)} 班次第 ${ranks.classRank || '—'}</span><span class="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600">校次第 ${ranks.schoolRank || '—'}</span>` : ''}
      </div>
      <button class="text-xs text-gray-400 hover:text-primary" onclick="navigate('students')">← 返回学生管理</button>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="font-bold text-gray-800 mb-3">积分概览</div>
      <div class="grid grid-cols-4 gap-3">
        <div class="bg-gray-50 rounded-xl p-3"><div class="text-xs text-gray-400">考试赋分</div><div class="text-2xl font-medium">${examPts}</div></div>
        <div class="bg-gray-50 rounded-xl p-3"><div class="text-xs text-gray-400">日常</div><div class="text-2xl font-medium">${ptDimScore(s.id, 'daily')}</div></div>
        <div class="bg-gray-50 rounded-xl p-3"><div class="text-xs text-gray-400">任职</div><div class="text-2xl font-medium">${ptDimScore(s.id, 'post')}</div></div>
        <div class="bg-gray-50 rounded-xl p-3"><div class="text-xs text-gray-400">总计</div><div class="text-2xl font-medium">${totalPts}</div></div>
      </div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">成绩趋势</div>
        <div class="flex flex-wrap gap-1">${subjTabs}</div>
      </div>
      ${trendSvg(trend)}
      <div class="text-xs text-gray-500 mt-1">${trend.map(d => `${esc(d.name)} 班次第${d.classRank || '—'}/校次第${d.schoolRank || '—'}`).join(' ｜ ') || '暂无数据'}</div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="font-bold text-gray-800 mb-3">课堂记录</div>
      ${crHtml}
    </div>
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="font-bold text-gray-800 mb-3">作业</div>
      ${hwHtml}
    </div>
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="font-bold text-gray-800 mb-3">行为记录</div>
      <div class="flex gap-2 flex-wrap">
        <span class="text-xs px-3 py-1 rounded-full bg-orange-50 text-orange-600">批评 ${beh.critic}</span>
        <span class="text-xs px-3 py-1 rounded-full bg-green-50 text-green-600">表扬 ${beh.praise}</span>
        <span class="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-600">谈心 ${beh.chat}</span>
        <span class="text-xs px-3 py-1 rounded-full bg-red-50 text-red-600">请假 ${beh.leave}</span>
      </div>
    </div>
  </div>`;
}

// ===================== Home =====================
function renderHome() {
  return state.activeClass === state.headTeacherClass ? renderHomeHead() : renderHomeTeacher();
}

// 首页今日值日班长（取轮值表中与今天匹配的条目，兼容本地/UTC两种日期格式）
function homeDutyMonitorToday() {
  const rota = state.positions && state.positions.dutyRota;
  if (!rota || !rota.schedule || !rota.schedule.length) return null;
  const tk = attDateKey(new Date());
  const uk = new Date().toISOString().slice(0, 10);
  return rota.schedule.find(r => r.date === tk || r.date === uk) || null;
}
function homeDutyMonitorNext() {
  const rota = state.positions && state.positions.dutyRota;
  if (!rota || !rota.schedule || !rota.schedule.length) return null;
  const tk = attDateKey(new Date());
  return rota.schedule.find(r => r.date > tk) || null;
}

// 班主任班（10班）首页：保留全部班主任专属功能
function renderHomeHead() {
  const todayCourses = ((state.schedule && state.schedule.courses) || []).filter(c => c && c.day === todayIndex).sort((a,b)=>(a.period||0)-(b.period||0));
  const todayWeekday = ['周一','周二','周三','周四','周五','周六','周日'][todayIndex];
  const nowD = new Date();
  const dateLabel = (nowD.getMonth()+1) + '月' + nowD.getDate() + '日';
  const dutyTree = state.positions && state.positions.dutyTree;
  const dutyTasks = dutyTree ? (function collect(node){
    let list=[];
    if(node.dutyTask){
      const names = (state.positions.dutyWeekly[todayWeekday] && state.positions.dutyWeekly[todayWeekday][node.dutyTask]) || [];
      if(names.length) list.push({label:node.label, names});
    }
    if(node.children) node.children.forEach(c=>{ list=list.concat(collect(c)); });
    return list;
  })(dutyTree) : [];
  const dmToday = homeDutyMonitorToday();
  const dmNext = homeDutyMonitorNext();
  const dmHasRota = !!(state.positions && state.positions.dutyRota && state.positions.dutyRota.schedule && state.positions.dutyRota.schedule.length);
  const startDate = state.points.calcStartDate || '2026-01-01';
  return `
  <div class="grid grid-cols-12 gap-4">
    <div class="col-span-12 md:col-span-4 bg-white rounded-2xl p-4 card-hover">
      <div class="flex items-center justify-between mb-2">
        <div class="font-bold text-gray-800 text-sm">🗓️ 今日值日班长</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('positions')">轮值表</button>
      </div>
      ${dmToday
        ? `<div class="text-2xl font-bold text-primary leading-tight">${esc(dmToday.name)}</div>
           <div class="text-xs text-gray-400 mt-1">${dmNext ? ('下次：'+esc(dmNext.name)+'（'+esc(dmNext.date.slice(5).replace('-','月')+'日')+'）') : '本轮轮值已结束'}</div>`
        : (isSchoolOff(new Date())
          ? `<div class="text-sm text-gray-500 leading-relaxed">今日放假（周末/法定节假日）<br>无值日班长</div>`
          : (dmHasRota
            ? `<div class="text-sm text-gray-500 leading-relaxed">本轮轮值已结束。<br><button class="text-xs text-primary hover:underline mt-1" onclick="navigate('positions')">去「职务与值日」重新生成</button></div>`
            : `<div class="text-sm text-gray-500 leading-relaxed">尚未生成轮值表。<br><button class="text-xs text-primary hover:underline mt-1" onclick="navigate('positions')">去「职务与值日」生成</button></div>`))}
    </div>

    <div class="col-span-12 md:col-span-4 bg-white rounded-2xl p-4 card-hover">
      <div class="flex items-center justify-between mb-2">
        <div class="font-bold text-gray-800 text-sm">🧹 今日值日</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('positions')">职务与值日</button>
      </div>
      ${dutyTasks.length ? `<div class="grid grid-cols-1 gap-2">${dutyTasks.map(t=>`<div><div class="text-xs font-medium text-gray-600">${esc(t.label)}</div><div class="flex flex-wrap gap-1 mt-0.5">${t.names.map(n=>`<span class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">${esc(n)}</span>`).join('')}</div></div>`).join('')}</div>` : `<div class="text-sm text-gray-500">今天还没有安排值日生</div>`}
    </div>

    <div class="col-span-12 md:col-span-4 bg-white rounded-2xl p-4 card-hover">
      <div class="flex items-center justify-between mb-2">
        <div class="font-bold text-gray-800 text-sm">✅ 今日考勤</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('attendance')">考勤管理</button>
      </div>
      ${(() => {
        const st = attStats(); const cur = ((state.attendance||{}).current) || {home:{},leave:{},leaveTs:{}};
        const leave = Object.entries(cur.leave||{});
        return `<div class="text-sm text-gray-600 mb-2">应到 ${st.total} · 实到 ${st.present} · 回家 ${st.home} · 请假 ${st.leave}</div>
          <div class="flex flex-wrap items-center gap-1.5">
            ${leave.length ? leave.map(([n,r])=>`<span class="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">${esc(n)}${r?('·'+esc(r)):''}</span>`).join('') : '<span class="text-xs text-gray-400">今日暂无请假</span>'}
            <button class="text-xs px-2 py-0.5 rounded-full border border-primary text-primary hover:bg-primary/5" onclick="openAddLeaveModal()">+ 请假</button>
          </div>`;
      })()}
    </div>

    ${renderHomePointsCard()}
  </div>`;
}

// 任课班（9班）首页：只显示与该班教学相关的概览，屏蔽班主任专属模块
function renderHomeTeacher() {
  const cls = state.activeClass;
  const clsName = className(cls);
  const students = (state.students || []).filter(s => s && s.class === cls);
  const todayKey = attDateKey(new Date());
  // 课堂记录的 date 可能是「8月29日」这类中文格式，必须先归一化再和 ISO 的 todayKey 比较，
  // 否则「今日课堂记录」永远为空。
  const records = (state.classRecords || []).filter(r => (!r.class || r.class === cls) && hwNormDate(r.date) === todayKey).slice(0, 5);
  // 作业按「完成情况台账」取当天记录；日期统一归一化后再比较，避免「M月D日」与 ISO 并列导致永远匹配不上
  const homeworks = (state.homework || []).filter(h => hwBelongsTo(h, cls) && hwNormDate(h.date || h.due) === todayKey).slice(0, 5);
  const clsExams = (state.examData.exams || [])
    .filter(e => {
      const recs = (state.examData.records || []).filter(r => r.examId === e.id);
      return recs.some(r => {
        const st = (state.students || []).find(s => s.name === r.studentName);
        return st && st.class === cls;
      });
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 3);
  const recentRecords = (state.classRecords || []).filter(r => !r.class || r.class === cls).slice(0, 5);
  return `
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-12 bg-gradient-to-r from-primary/10 to-transparent rounded-2xl p-6 card-hover">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs text-gray-500 mb-1">当前班级</div>
          <div class="text-2xl font-bold text-gray-800">${esc(clsName)} 工作台</div>
          <div class="text-sm text-gray-600 mt-1">${students.length} 名学生 · ${records.length} 条今日课堂记录 · ${homeworks.length} 项今日作业</div>
        </div>
        <div class="flex gap-2">
          <button class="text-sm bg-primary text-white px-4 py-2 rounded-full hover:bg-primaryDark" onclick="openQuickRecord()">+ 一句话记录</button>
          <button class="text-sm border border-gray-300 px-4 py-2 rounded-full hover:bg-gray-50" onclick="navigate('students')">学生管理</button>
        </div>
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">📝 今日课堂记录</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('classRecord')">查看全部</button>
      </div>
      <div class="space-y-3">
        ${records.length ? records.map(r => `
          <div class="p-3 rounded-xl bg-gray-50 text-sm">
            <div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(r.subject || '课堂')}</span><span class="text-xs text-gray-400">${esc(r.studentName || '')}${recTimePart(r.date) ? ' · ' + esc(recTimePart(r.date)) : ''}</span></div>
            <div class="text-gray-600 text-xs">${esc(r.content || '').slice(0, 80)}${(r.content || '').length > 80 ? '…' : ''}</div>
          </div>`).join('') : `<div class="text-sm text-gray-400">今日还没有课堂记录，用右上角「一句话记录」快速添加。</div>`}
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">📚 今日作业</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('homework')">作业管理</button>
      </div>
      <div class="space-y-2">
        ${homeworks.length ? homeworks.map(h => {
          const undone = h.status === '未完成';
          return `<div class="p-3 rounded-xl ${undone ? 'bg-red-50/60' : 'bg-gray-50'} text-sm">
            <div class="flex justify-between mb-1">
              <span class="font-medium text-gray-800">${esc(hwStudentName(h) || '未指定')} · ${esc(h.subject || '未指定')}</span>
              <span class="flex items-center gap-1.5 flex-shrink-0">${recTimePart(h.date) ? `<span class="text-[10px] text-gray-400">${esc(recTimePart(h.date))}</span>` : ''}<span class="text-xs px-2 py-0.5 rounded-full ${undone ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">${esc(h.status || '已完成')}</span></span>
            </div>
            ${h.title ? `<div class="text-gray-600 text-xs">${esc(h.title).slice(0, 60)}${(h.title || '').length > 60 ? '…' : ''}</div>` : ''}
          </div>`;
        }).join('') : `<div class="text-sm text-gray-400">今日还没有作业完成情况记录。</div>`}
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">📊 最近成绩</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('exam')">成绩管理</button>
      </div>
      <div class="space-y-3">
        ${clsExams.length ? clsExams.map(e => `
          <div class="p-3 rounded-xl bg-gray-50 text-sm">
            <div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(e.name || '考试')}</span><span class="text-xs text-gray-400">${esc(e.date || '')}</span></div>
            <div class="text-gray-600 text-xs">科目：${[...new Set((state.examData.records || []).filter(r => r.examId === e.id).map(r => r.subject))].slice(0, 6).map(s => `<span class="inline-block bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] mr-1">${esc(s)}</span>`).join('') || '暂无科目数据'}</div>
          </div>`).join('') : `<div class="text-sm text-gray-400">暂无该班成绩，可在「成绩管理」中导入或录入。</div>`}
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">🕘 最近记录</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('classRecord')">课堂记录</button>
      </div>
      <div class="space-y-3">
        ${recentRecords.length ? recentRecords.map(r => `
          <div class="p-3 rounded-xl bg-gray-50 text-sm">
            <div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(r.subject || '课堂')}</span><span class="text-xs text-gray-400">${esc(recDateLabel(r.date))}</span></div>
            <div class="text-gray-600 text-xs">${esc(r.content || '').slice(0, 80)}${(r.content || '').length > 80 ? '…' : ''}</div>
          </div>`).join('') : `<div class="text-sm text-gray-400">还没有课堂记录。</div>`}
      </div>
    </div>
  </div>`;
}

// ===================== Schedule =====================
function renderSchedule() {
  // 课表结构兜底：periods/days/courses 任一缺失都按默认值补齐，避免整页白屏
  const sch = (state.schedule && typeof state.schedule === 'object') ? state.schedule : (state.schedule = {});
  if (!Array.isArray(sch.days)) sch.days = ['周一','周二','周三','周四','周五'];
  if (!Array.isArray(sch.periods)) sch.periods = [1,2,3,4,5,6,7];
  if (!Array.isArray(sch.courses)) sch.courses = [];
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
              <td class="p-3 text-center text-sm text-gray-500 bg-gray-50 border-b"><div>${p.label || `第${p.id}节`}</div><div class="text-xs text-gray-400">${p.start||''}${p.end?'-'+p.end:''}</div></td>
              ${[0,1,2,3,4].map(d => renderScheduleCell(d, p.id)).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
let dragCourseSrc = null;
function renderScheduleCell(day, period) {
  const course = state.schedule.courses.find(c => c.day === day && c.period === period);
  const isToday = day === todayIndex;
  if (course) {
    return `<td class="p-2 border-b ${isToday?'bg-primary/5':''}"><div class="course-card p-3 rounded-lg cursor-pointer hover:shadow transition text-center" draggable="true" ondragstart="dragCourse(event,${day},${period})" ondrop="dropCourse(event,${day},${period})" ondragover="allowDropCourse(event)" ondragleave="leaveDropZone(event)" onclick="editCourse(${day},${period})"><div class="font-bold text-primary text-sm">${esc(course.subject)}</div></div></td>`;
  }
  return `<td class="p-2 border-b ${isToday?'bg-primary/5':''} empty-cell" ondrop="dropCourse(event,${day},${period})" ondragover="allowDropCourse(event)" ondragleave="leaveDropZone(event)" onclick="addCourseTo(${day},${period})"><div class="h-full min-h-[70px] flex items-center justify-center text-gray-300 text-xl">+</div></td>`;
}
function dragCourse(ev, day, period) {
  dragCourseSrc = { day, period };
  ev.dataTransfer.effectAllowed = 'move';
  ev.target.classList.add('opacity-50');
}
function leaveDropZone(ev) {
  const td = ev.currentTarget.closest ? ev.currentTarget.closest('td') : ev.currentTarget;
  if (td) td.classList.remove('drag-over');
}
function allowDropCourse(ev) {
  ev.preventDefault();
  const td = ev.currentTarget.closest ? ev.currentTarget.closest('td') : ev.currentTarget;
  if (td) td.classList.add('drag-over');
}
function dropCourse(ev, targetDay, targetPeriod) {
  ev.preventDefault();
  const src = dragCourseSrc;
  dragCourseSrc = null;
  document.querySelectorAll('.opacity-50').forEach(el => el.classList.remove('opacity-50'));
  document.querySelectorAll('td').forEach(el => el.classList.remove('drag-over'));
  if (!src || (src.day === targetDay && src.period === targetPeriod)) return;
  const srcCourse = state.schedule.courses.find(c => c.day === src.day && c.period === src.period);
  if (!srcCourse) return;
  const targetCourse = state.schedule.courses.find(c => c.day === targetDay && c.period === targetPeriod);
  if (targetCourse) {
    // 两节课互换
    const tempDay = srcCourse.day, tempPeriod = srcCourse.period;
    srcCourse.day = targetCourse.day; srcCourse.period = targetCourse.period;
    targetCourse.day = tempDay; targetCourse.period = tempPeriod;
  } else {
    // 拖到空位：移动
    srcCourse.day = targetDay; srcCourse.period = targetPeriod;
  }
  save(); render();
}

let editingCourse = null;
function openCourseModal() { editingCourse = null; renderCourseForm(); }
function addCourseTo(day, period) { editingCourse = { day, period, subject: '' }; renderCourseForm(); }
function editCourse(day, period) {
  const c = state.schedule.courses.find(x => x.day===day && x.period===period);
  editingCourse = c ? { ...c } : { day, period, subject: '' }; renderCourseForm();
}
function renderCourseForm() {
  const c = editingCourse || { day: 0, period: 1, subject: '' };
  const isEdit = editingCourse && editingCourse.subject;
  openModal(isEdit ? '编辑课程' : '添加课程', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">星期</label><select id="courseDay" class="w-full border rounded-lg p-2 text-sm">${state.schedule.days.map((d,i)=>`<option value="${i}" ${c.day===i?'selected':''}>${d}</option>`).join('')}</select></div>
        <div><label class="block text-xs text-gray-500 mb-1">节次</label><select id="coursePeriod" class="w-full border rounded-lg p-2 text-sm">${state.schedule.periods.map(p=>`<option value="${p.id}" ${c.period===p.id?'selected':''}>${p.label || `第${p.id}节`}</option>`).join('')}</select></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">科目</label><input id="courseSubject" class="w-full border rounded-lg p-2 text-sm" value="${esc(c.subject)}" placeholder="如：英语"></div>
      <div class="flex gap-3">
        ${isEdit?`<button class="flex-1 border border-red-200 text-red-500 py-2 rounded-full hover:bg-red-50" onclick="removeCourse()">删除</button>`:''}
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveCourse()">保存</button>
      </div>
    </div>`);
}
function saveCourse() {
  const day = +document.getElementById('courseDay').value;
  const period = +document.getElementById('coursePeriod').value;
  const subject = document.getElementById('courseSubject').value.trim();
  if(!subject) return alert('请填写科目');
  state.schedule.courses = state.schedule.courses.filter(c => !(c.day===day && c.period===period));
  state.schedule.courses.push({ day, period, subject });
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
      <p class="text-sm text-gray-500">当前共 ${state.schedule.periods.length} 节课。可自定义名称、起止时间。</p>
      <div id="periodList" class="space-y-2">
        ${state.schedule.periods.map(p => `<div class="flex gap-2 items-center" data-row="${p.id}"><input class="flex-1 border rounded p-1.5 text-sm" value="${esc(p.label || `第${p.id}节`)}" data-pid="${p.id}" data-field="label"><input class="w-20 border rounded p-1.5 text-sm" value="${esc(p.start)}" placeholder="开始" data-pid="${p.id}" data-field="start"><input class="w-20 border rounded p-1.5 text-sm" value="${esc(p.end)}" placeholder="结束" data-pid="${p.id}" data-field="end"><button class="text-red-500 text-sm" onclick="removePeriod(${p.id})">删除</button></div>`).join('')}
      </div>
      <button class="w-full border border-dashed border-gray-300 rounded py-2 text-sm text-gray-500 hover:border-primary hover:text-primary" onclick="addPeriod()">+ 添加节次</button>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="savePeriods()">保存</button>
    </div>`);
}
function addPeriod() {
  const list = document.getElementById('periodList');
  const existing = Array.from(list.querySelectorAll('[data-pid]')).map(el => +el.dataset.pid).filter(Boolean);
  const nextId = existing.length ? Math.max(...existing) + 1 : 1;
  const div = document.createElement('div');
  div.className = 'flex gap-2 items-center';
  div.setAttribute('data-row', nextId);
  div.innerHTML = `<input class="flex-1 border rounded p-1.5 text-sm" value="第${nextId}节" data-pid="${nextId}" data-field="label"><input class="w-20 border rounded p-1.5 text-sm" value="" placeholder="开始" data-pid="${nextId}" data-field="start"><input class="w-20 border rounded p-1.5 text-sm" value="" placeholder="结束" data-pid="${nextId}" data-field="end"><button class="text-red-500 text-sm" onclick="removePeriod(${nextId})">删除</button>`;
  list.appendChild(div);
}
function removePeriod(pid) {
  const el = document.querySelector('[data-row="'+pid+'"]');
  if(el) el.remove();
}
function savePeriods() {
  const inputs = document.querySelectorAll('#periodList input');
  const map = {};
  inputs.forEach(inp => {
    const pid = inp.dataset.pid, field = inp.dataset.field;
    if(!map[pid]) map[pid] = { id: parseInt(pid) };
    map[pid][field] = inp.value.trim();
  });
  const periods = Object.values(map).sort((a,b)=>a.id-b.id).map(p=>({ id: p.id, label: p.label || `第${p.id}节`, start: p.start || '', end: p.end || '' }));
  if(periods.length) {
    const keptIds = new Set(periods.map(p => p.id));
    state.schedule.periods = periods;
    state.schedule.courses = state.schedule.courses.filter(c => keptIds.has(c.period));
    save();
  }
  closeModal(); render();
}

// ===================== Students =====================
function renderStudents() {
  const list = state.students.filter(s => s.class === state.activeClass);
  const selCount = list.filter(s => selStudentIds[s.id]).length;
  const allSel = list.length > 0 && selCount === list.length;
  const clsOptions = (state.classes || []).map(c => `<option value="${esc(c.id)}" ${c.id===state.activeClass?'selected':''}>${esc(c.name)}</option>`).join('');
  const toolbar = list.length ? `
    <div class="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
      <label class="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
        <input type="checkbox" class="w-4 h-4 accent-primary" ${allSel?'checked':''} onclick="selAllStudents(${!allSel})"> 全选
      </label>
      <span class="text-sm text-gray-500">已选 <b class="text-primary">${selCount}</b> / ${list.length}</span>
      <div class="flex-1"></div>
      <button class="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full hover:bg-white disabled:opacity-40" ${selCount?'':'disabled'} onclick="bulkMoveStudents()">📦 调整班级…</button>
      <button class="text-sm text-red-500 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-50 disabled:opacity-40" ${selCount?'':'disabled'} onclick="bulkDeleteStudents()">🗑️ 批量删除 (${selCount})</button>
      <button class="text-sm text-red-400 border border-red-100 px-3 py-1.5 rounded-full hover:bg-red-50" onclick="clearClassStudents()">⚠️ 清空本班学生</button>
    </div>` : '';
  const cards = list.map(s => `
    <div class="relative p-4 rounded-2xl bg-gray-50 hover:bg-primary/5 transition cursor-pointer border ${selStudentIds[s.id]?'border-primary/40 ring-1 ring-primary/20':'border-transparent hover:border-primary/20'}" onclick="openStudentProfile('${s.id}')">
      <div class="absolute top-3 left-3 z-10" onclick="event.stopPropagation(); toggleSelStudent('${s.id}')">
        <input type="checkbox" class="w-4 h-4 accent-primary" ${selStudentIds[s.id]?'checked':''} onclick="event.stopPropagation(); toggleSelStudent('${s.id}')">
      </div>
      <div class="flex items-center gap-3 pl-6">
        <img src="${esc(s.avatar)}" class="w-12 h-12 rounded-full bg-white shadow-sm" alt="">
        <div><div class="font-bold text-gray-800">${esc(s.name)}</div><div class="text-xs text-gray-500">${esc(s.class)}</div></div>
      </div>
      <div class="flex gap-2 mt-4 flex-wrap">
        ${(s.records||[]).slice(0,3).map(r => `<span class="text-[10px] px-2 py-0.5 rounded-full ${recordTypeClass(r.type)}">${recordTypeLabel(r.type)}</span>`).join('')}
        ${(s.records||[]).length>3?`<span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">+${(s.records||[]).length-1}</span>`:''}
      </div>
    </div>`).join('');
  let empty = '';
  if (!list.length) {
    const otherClasses = [...new Set(state.students.map(s => s.class).filter(c => c && c !== state.activeClass))];
    const tip = otherClasses.length
      ? `当前为 <b>${esc(className(state.activeClass))}</b>，暂无该班学生。其他班级（${otherClasses.map(c => esc(className(c))).join('、')}）已有学生，可切换上方班级查看，或在当前班级「+ 新建学生 / 批量导入」录入。`
      : `当前班级 <b>${esc(className(state.activeClass))}</b> 还没有学生。点右上角「+ 新建学生」或「批量导入」开始录入。`;
    empty = `<div class="col-span-full text-center py-12 text-gray-400">
      <div class="text-4xl mb-2">👨‍👩‍👧‍👦</div>
      <p class="text-sm">${tip}</p>
    </div>`;
  }
  return `
  <div class="bg-white rounded-2xl p-6 shadow-sm">
    ${toolbar}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      ${cards || empty}
    </div>
  </div>`;
}

function toggleSelStudent(id) { selStudentIds[id] = !selStudentIds[id]; if (!selStudentIds[id]) delete selStudentIds[id]; render(); }
function selAllStudents(on) {
  const list = state.students.filter(s => s.class === state.activeClass);
  list.forEach(s => { if (on) selStudentIds[s.id] = true; else delete selStudentIds[s.id]; });
  render();
}
function bulkDeleteStudents() {
  const ids = Object.keys(selStudentIds).filter(id => selStudentIds[id]);
  if (!ids.length) return;
  const count = ids.length;
  confirmModal(`确定删除选中的 ${count} 名学生吗？相关行为记录会一并删除，此操作不可恢复。`, function(){
    const idSet = new Set(ids);
    state.students = state.students.filter(s => !idSet.has(s.id));
    ids.forEach(id => delete selStudentIds[id]);
    save(); closeModal(); render();
  });
}
function bulkMoveStudents() {
  const ids = Object.keys(selStudentIds).filter(id => selStudentIds[id]);
  if (!ids.length) return;
  const opts = (state.classes || []).map(c => `<option value="${esc(c.id)}" ${c.id===state.activeClass?'selected':''}>${esc(c.name)}</option>`).join('');
  openModal('批量调整班级', `
    <p class="text-sm text-gray-600 mb-4">将选中的 <b>${ids.length}</b> 名学生移动到：</p>
    <select id="bulkMoveCls" class="w-full border rounded-lg p-2 text-sm mb-5">${opts}</select>
    <div class="flex gap-3">
      <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal()">取消</button>
      <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doBulkMove('${ids.join(',')}')">确定移动</button>
    </div>`, 'md');
}
function doBulkMove(idsStr) {
  const ids = idsStr.split(',').filter(Boolean);
  const cls = (document.getElementById('bulkMoveCls') || {}).value;
  if (!cls) return;
  const idSet = new Set(ids);
  state.students.forEach(s => { if (idSet.has(s.id)) s.class = cls; });
  ids.forEach(id => delete selStudentIds[id]);
  save(); closeModal(); render();
}
function clearClassStudents() {
  const list = state.students.filter(s => s.class === state.activeClass);
  if (!list.length) return alert('当前班级没有学生，无需清空。');
  confirmModal(`确定清空「${className(state.activeClass)}」的全部 ${list.length} 名学生吗？相关行为记录会一并删除，此操作不可恢复。`, function(){
    const c = state.activeClass;
    state.students = state.students.filter(s => s.class !== c);
    selStudentIds = {};
    save(); closeModal(); render();
  });
}
function openStudentForm(id) {
  const s = id ? state.students.find(x=>x.id===id) : null;
  openModal(s ? '编辑学生' : '新建学生', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">姓名</label><input id="stName" class="w-full border rounded-lg p-2 text-sm" value="${esc(s? s.name:'')}"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">性别</label><select id="stGender" class="w-full border rounded-lg p-2 text-sm"><option ${s&&s.gender==='男'?'selected':''}>男</option><option ${s&&s.gender==='女'?'selected':''}>女</option></select></div>
        <div><label class="block text-xs text-gray-500 mb-1">班级</label>${classSelectHTML('stClass', s ? s.class : state.activeClass, state.activeClass === state.headTeacherClass ? '' : 'bg-gray-100', state.activeClass !== state.headTeacherClass)}</div>
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
  // 取内部 id（下拉框的 value），不再取显示名，避免改名后学生被判到别的班
  const cls = document.getElementById('stClass').value.trim() || state.activeClass;
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
// 删除学生时一并清理散落在各模块的关联记录。
// 旧实现只从 state.students 里摘掉，导致积分流水 / 考勤名单 / 课堂与作业记录 /
// 座次表里残留孤儿引用 —— 这些「查无此人」的数据会一直堆积，还可能被姓名匹配到别人身上。
// 统计散落在各模块的关联数据，删人前先让用户心里有数
function studentRefSummary(id, name) {
  const A = state.attendance || {};
  let live = 0;
  if (A.current) {
    if (A.current.leave && Object.prototype.hasOwnProperty.call(A.current.leave, name)) live++;
    if (A.current.home && Object.prototype.hasOwnProperty.call(A.current.home, name)) live++;
  }
  const seatN = Object.keys(state.seatingByClass || {}).reduce((a, cid) => {
    const st = state.seatingByClass[cid];
    return a + (st && Array.isArray(st.cells) ? st.cells.reduce((r, row) => r + row.filter(x => x === id).length, 0) : 0);
  }, 0);
  const P = state.positions || {};
  const posN = Object.keys(P.assign || {}).reduce((a, rid) => a + (P.assign[rid] || []).filter(n => n === name).length, 0)
    + (P.representatives || []).reduce((a, r) => a + (r.names || []).filter(n => n === name).length, 0);
  return {
    live: live + seatN + posN, seatN, posN, attN: live,
    points: ((state.points && state.points.logs) || []).filter(l => l.studentId === id).length,
    classRecords: (state.classRecords || []).filter(r => r.studentId === id || r.studentName === name).length,
    homework: (state.homework || []).filter(h => h.studentId === id || h.studentName === name).length,
    exam: ((state.examData && state.examData.records) || []).filter(r => r.studentName === name).length,
  };
}
// 清理「当前状态」里的引用：不清理的话，考勤会显示已删学生、座次表留下空位、职务挂着查无此人
function purgeStudentLiveRefs(id, name) {
  const A = state.attendance || {};
  if (A.current) {
    if (A.current.leave) delete A.current.leave[name];
    if (A.current.home) delete A.current.home[name];
  }
  Object.keys(state.seatingByClass || {}).forEach(cid => {
    const st = state.seatingByClass[cid];
    if (st && Array.isArray(st.cells)) st.cells = st.cells.map(row => row.map(x => (x === id ? null : x)));
  });
  const P = state.positions || {};
  Object.keys(P.assign || {}).forEach(rid => { P.assign[rid] = (P.assign[rid] || []).filter(n => n !== name); markDeletedVal('positions.assign.' + rid, name); });
  (P.representatives || []).forEach(r => { r.names = (r.names || []).filter(n => n !== name); });
}
// 清理历史记录（可选）：积分流水 / 课堂 / 作业 / 成绩
function purgeStudentHistory(id, name) {
  (state.classRecords || []).forEach(r => { if (r.studentId === id || r.studentName === name) markDeletedId('classRecords', r.id); });
  (state.homework || []).forEach(h => { if (h.studentId === id || h.studentName === name) markDeletedId('homework', h.id); });
  if (state.examData && Array.isArray(state.examData.records)) {
    (state.examData.records).forEach(r => { if (r.studentName === name) markDeletedId('examData.records', r.id); });
  }
  state.points.logs = (state.points.logs || []).filter(l => l.studentId !== id);
  state.classRecords = (state.classRecords || []).filter(r => r.studentId !== id && r.studentName !== name);
  state.homework = (state.homework || []).filter(h => h.studentId !== id && h.studentName !== name);
  if (state.examData && Array.isArray(state.examData.records)) {
    state.examData.records = state.examData.records.filter(r => r.studentName !== name);
  }
}
function deleteStudent(id) {
  const s = state.students.find(x => x.id === id);
  if (!s) return;
  const ref = studentRefSummary(id, s.name);
  const histTotal = ref.points + ref.classRecords + ref.homework + ref.exam;
  const msg = `确定删除学生「${esc(s.name)}」吗？`
    + `<br><br>一定清理：考勤在册 ${ref.attN} 处、座次占位 ${ref.seatN} 处、任职 ${ref.posN} 处。`
    + (histTotal ? `<br>可选清理：历史记录 ${histTotal} 条（积分 ${ref.points} / 课堂 ${ref.classRecords} / 作业 ${ref.homework} / 成绩 ${ref.exam}）。` : '');
  confirmModal(msg, function () {
    const finish = (alsoHistory) => {
      // 快照：撤销时能整体还原（含关联数据），避免「撤销后学生回来了但记录没了」
      const snap = {
        idx: state.students.indexOf(s), stu: s,
        attendance: JSON.parse(JSON.stringify(state.attendance || {})),
        seatingByClass: JSON.parse(JSON.stringify(state.seatingByClass || {})),
        positions: JSON.parse(JSON.stringify(state.positions || {})),
        hist: alsoHistory ? {
          pointsLogs: (state.points.logs || []).slice(),
          classRecords: (state.classRecords || []).slice(),
          homework: (state.homework || []).slice(),
          examRecords: ((state.examData && state.examData.records) || []).slice(),
        } : null,
      };
      if (snap.idx < 0) return;
      state.students.splice(snap.idx, 1);
      markDeletedId('students', id);
      purgeStudentLiveRefs(id, s.name);
      if (alsoHistory) purgeStudentHistory(id, s.name);
      save();
      recordUndo(`学生「${s.name}」`, () => {
        state.students.splice(Math.min(snap.idx, state.students.length), 0, snap.stu);
        state.attendance = snap.attendance;
        state.seatingByClass = snap.seatingByClass;
        state.positions = snap.positions;
        if (snap.hist) {
          state.points.logs = snap.hist.pointsLogs;
          state.classRecords = snap.hist.classRecords;
          state.homework = snap.hist.homework;
          if (state.examData) state.examData.records = snap.hist.examRecords;
        }
        save(); closeModal(); render();
      });
      closeModal(); render();
      toast(`已删除「${s.name}」，清理 ${ref.live + (alsoHistory ? histTotal : 0)} 条关联数据（可撤销）`);
    };
    if (histTotal) {
      confirmModal(`是否同时删除「${esc(s.name)}」的 ${histTotal} 条历史记录？<br><br>选「取消」会保留历史（之后仍可按姓名查到）。`,
        () => finish(true), '一起删除', '保留历史');
    } else {
      finish(false);
    }
  });
}
function openStudentProfile(id) {
  ptWarmDims(); // 下面要按维度逐项展示分数，先把四个维度缓存一次性准备好
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
          return `<div class="rounded-lg py-2 text-center ${st.bg}"><div class="text-[10px] ${st.text}">${d.icon} ${d.label}</div><div class="text-base font-bold ${st.text}">${fmtScore(ptDimScoreCached(s.id, d.id))}</div></div>`; }).join('')}
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
            <div class="mt-0.5 text-lg">${recordTypeEmoji(r.type)}</div>
            <div class="flex-1"><div class="text-sm text-gray-700">${esc(r.content)}</div>
            <div class="flex items-center gap-2 mt-1.5"><span class="text-[10px] px-1.5 py-0.5 rounded ${recordTypeClass(r.type)}">${recordTypeLabel(r.type)}</span><span class="text-[10px] text-gray-400">${esc(recDateLabel(r.date))}</span></div></div>
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
          <button type="button" class="rec-type-btn flex-1 py-2 rounded-lg border text-sm" data-type="leave" onclick="pickRecordType(this)">请假</button>
        </div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">日期时间（精确到秒）</label><input id="recDate" type="datetime-local" step="1" class="w-full border rounded-lg p-2 text-sm" value="${dtLocalValue()}"></div>
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
// 行为记录同步写入班级日志（带 behaviorId 反向标记，便于删除时清理）
function logBehaviorToClassLog(recId, name, type, content, date) {
  if (!state.classLogs) state.classLogs = [];
  // 按姓名回查学生取其班级（原实现引用了此处并不存在的 s，一旦调用即 ReferenceError）
  const stu = (state.students || []).find(x => x.name === name);
  state.classLogs.unshift({ id: uid(), date: date || nowStampSec(), ts: nowTs(), content: `${name} ${recordTypeLabel(type)}：${content}`, behaviorId: recId, class: (stu && stu.class) || state.activeClass });
}
function saveRecord(id) {
  const content = document.getElementById('recContent').value.trim();
  const date = parseDtLocal(document.getElementById('recDate').value) || nowStampSec();
  if(!content) return alert('请输入记录内容');
  lastRecordContent = content;
  const s = state.students.find(x=>x.id===id);
  const recId = uid();
  s.records.unshift({ id: recId, type: recordType, date, ts: nowTs(), content });
  logBehaviorToClassLog(recId, s.name, recordType, content, date);
  save(); closeModal();
  // 若在行为记录页添加，直接刷新该页（避免弹到学生档案导致列表不更新）
  if (currentRoute === 'behavior') { render(); toast('已添加行为记录'); }
  else openStudentProfile(id);
}
function deleteRecord(sid, rid) {
  const s = state.students.find(x=>x.id===sid);
  if(!s) return;
  if (state.classLogs) state.classLogs = state.classLogs.filter(l => l.behaviorId !== rid);
  markDeletedId('classLogs', rid); markDeletedId('students.records', rid); // 记墓碑，删除跨设备同步
  // 若在行为记录页删除，删除后刷新该页；否则回到学生档案
  if (currentRoute === 'behavior') doDelete(()=>s.records, rid, '记录', null);
  else doDelete(()=>s.records, rid, '记录', () => openStudentProfile(sid));
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
    markDeletedId('templates', id);
    doDelete(()=>state.templates, id, t.title);
  });
}
function copyText(text) {
  navigator.clipboard.writeText(text).then(()=>alert('已复制到剪贴板'), ()=>alert('复制失败，请手动选择'));
}

// ===================== Class Log（按当前班级筛选，两班分离） =====================
// 判断一条日志是否属于指定班级（公共函数，供日志页/周报/首页展览复用）
function classLogBelongsTo(log, cls) {
  if (!log) return false;
  // 1. 有明确 class 字段：严格比较，一票否决（不参与下面的推断）
  if (log.class) return log.class === cls;
  // 2. 旧数据无 class 字段：清理前缀后取开头主体
  const c = (log.content || '').trim();
  if (!c) return false;
  const cleaned = c.replace(/^(一句话记录[：:\s]*|【[^】]+】\s*)+/g, '');
  const head = cleaned.slice(0, 20);
  // 2a. 反向排除：若开头明确是「别的班」的学生，直接判否
  const otherStudents = (state.students || []).filter(s => s.class && s.class !== cls);
  for (const s of otherStudents) {
    if (s.name && head.indexOf(s.name) >= 0) return false;
  }
  // 2b. 正向匹配：开头是本班学生 → 属于本班
  const clsStudents = (state.students || []).filter(s => s.class === cls);
  for (const s of clsStudents) {
    if (s.name && head.indexOf(s.name) >= 0) return true;
  }
  // 2c. 推断不出归属：不显示（不再默认塞给班主任班，避免两班混淆）
  return false;
}
function renderClassLog() {
  const targetCls = state.activeClass;
  const logs = (state.classLogs || []).filter(l => classLogBelongsTo(l, targetCls));
  const clsName = className(targetCls);
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800">📓 ${esc(clsName)} 班级日志 <span class="text-xs text-gray-400 font-normal">（共 ${logs.length} 条）</span></div>
      <button class="text-sm bg-primary text-white px-3 py-1.5 rounded-full hover:bg-primaryDark text-xs" onclick="openClassLogForm()">+ 写日志</button>
    </div>
    <div class="space-y-4">${logs.length ? logs.map(l => `
      <div class="p-4 rounded-xl bg-gray-50 border-l-4 border-primary flex justify-between items-start">
        <div><div class="text-xs text-gray-400 mb-1">${esc(recDateLabel(l.date))}</div><div class="text-sm text-gray-700">${esc(l.content)}</div></div>
        <button class="text-gray-300 hover:text-red-500" onclick="deleteClassLog('${l.id}')">🗑️</button>
      </div>`).join('') : '<div class="text-sm text-gray-400 py-8 text-center">' + esc(clsName) + ' 暂无班级日志，点击上方「写日志」添加。</div>'}</div>
  </div>`;
}
function openClassLogForm() {
  openModal('写班级日志', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">日期时间（精确到秒）</label><input id="logDate" type="datetime-local" step="1" class="w-full border rounded-lg p-2 text-sm" value="${dtLocalValue()}"></div>
      <div><label class="block text-xs text-gray-500 mb-1">内容</label><textarea id="logContent" rows="4" class="w-full border rounded-lg p-2 text-sm" placeholder="记录今天的班级情况…"></textarea></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveClassLog()">保存</button>
    </div>`);
}
function saveClassLog() {
  const content = document.getElementById('logContent').value.trim();
  const date = parseDtLocal(document.getElementById('logDate').value) || nowStampSec();
  if(!content) return alert('请输入日志内容');
  state.classLogs.unshift({ id: uid(), date, ts: nowTs(), content, class: state.activeClass });
  save(); closeModal(); render();
}
function deleteClassLog(id) {
  const c = state.classLogs.find(x=>x.id===id);
  if(!c) return;
  markDeletedId('classLogs', id);
  doDelete(()=>state.classLogs, id, c.content.slice(0,12) || '日志');
}

// ===================== Communication =====================
function renderCommunication() {
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="space-y-4">${state.communications.map(c => `
      <div class="p-4 rounded-xl bg-gray-50 flex items-start justify-between">
        <div class="flex-1"><div class="font-bold text-gray-800 text-sm">${esc(c.student)} · ${esc(c.parent)}${c.date ? `<span class="text-[10px] text-gray-400 font-normal ml-2">${esc(recDateLabel(c.date))}</span>` : ''}</div><div class="text-xs text-gray-500 mt-1">${esc(c.content)}</div></div>
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
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">沟通时间（精确到秒）</label><input id="commDate" type="datetime-local" step="1" class="w-full border rounded-lg p-2 text-sm" value="${dtLocalValue()}"></div>
        <div><label class="block text-xs text-gray-500 mb-1">状态</label><select id="commStatus" class="w-full border rounded-lg p-2 text-sm"><option>待跟进</option><option>已沟通</option></select></div>
      </div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveComm()">保存</button>
    </div>`);
}
function saveComm() {
  const student = document.getElementById('commStudent').value.trim();
  if(!student) return alert('请输入学生姓名');
  const parent = document.getElementById('commParent').value.trim() || (student + '家长');
  const content = document.getElementById('commContent').value.trim();
  const status = document.getElementById('commStatus').value;
  const dEl = document.getElementById('commDate');
  // 沟通时间精确到秒：date 是沟通发生的时刻，ts 是这条记录的录入时刻
  const date = parseDtLocal(dEl ? dEl.value : '') || nowStampSec();
  state.communications.unshift({ id: uid(), student, parent, content, status, date, ts: nowTs() });
  save(); closeModal(); render();
}
function setCommStatus(id, status) {
  const c = state.communications.find(x=>x.id===id);
  c.status = status; save(); render();
}
function deleteComm(id) {
  const c = state.communications.find(x=>x.id===id);
  if(!c) return;
  markDeletedId('communications', id);
  doDelete(()=>state.communications, id, (c.student || c.parent || '沟通'));
}

// 首页「待跟进沟通 → 查看全部」的弹窗视图（家校沟通菜单已精简，用弹窗替代独立页面）
function openCommListModal() {
  openModal('家校沟通', `
    <div class="space-y-3">
      <div class="flex justify-end">
        <button class="text-sm bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-primaryDark" onclick="closeModal(); openCommForm()">＋ 新增沟通</button>
      </div>
      ${renderCommunication()}
    </div>`, 'lg');
}

// ===================== Homework =====================
// 作业日期归一化：兼容「8月25日」「2026-08-25」「8/25」，统一为 YYYY-MM-DD。
// 旧数据里 due 存的是「M月D日」，而首页筛选用的是 ISO，两套格式并列会导致匹配永远失败。
function hwNormDate(raw){
  const s0 = String(raw == null ? '' : raw).trim();
  if (!s0) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s0)) return s0;
  const ymd = s0.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (ymd) return ymd[1] + '-' + String(ymd[2]).padStart(2,'0') + '-' + String(ymd[3]).padStart(2,'0');
  const md = s0.match(/^(\d{1,2})[月/\-.](\d{1,2})日?$/);
  if (md) {
    const n = new Date(), m = +md[1];
    let y = n.getFullYear();
    if (m - (n.getMonth() + 1) > 6) y -= 1;         // 跨年：如 12月 出现在 1 月
    else if ((n.getMonth() + 1) - m > 6) y += 1;    // 跨年：如 1月 出现在 12 月
    return y + '-' + String(m).padStart(2,'0') + '-' + String(md[2]).padStart(2,'0');
  }
  return s0;
}
// ISO -> 「M月D日」展示；带秒的新格式展示为「M月D日 HH:mm:ss」；无法解析时原样返回
function hwDateLabel(iso){
  const raw = String(iso || '').trim();
  if (!raw) return '未设置';
  if (recTimePart(raw)) return recDateLabel(raw);
  const d = hwNormDate(raw);
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (+m[2]) + '月' + (+m[3]) + '日' : raw;
}
// 展示用姓名：优先 studentName；为空时尝试从 title 全文中提取已知学生姓名
// （迁移/写入时若丢失姓名，旧 title 如「张三英语作业没交」「政治作业不合格 张三」仍可反解）
// 按「长姓名优先」排好序的名单缓存。
// 旧实现每条作业记录都重新 filter + sort 一遍全班，是 O(作业数 × 学生数) 的热点；
// 名册只在 save() 之后才可能变，所以在 save() 里统一置空即可。
var _hwNameIdx = null;   // 用 var：save() 在脚本更早的位置就会引用它，避免 let 的暂时性死区
function hwStudentNames(){
  if (_hwNameIdx) return _hwNameIdx;
  _hwNameIdx = (state.students || []).filter(x => x.name && x.name.length > 1)
    .map(x => x.name).sort((a, b) => b.length - a.length);
  return _hwNameIdx;
}
function hwStudentName(h){
  if (h.studentName) return h.studentName;
  if (!h.title) return '';
  const t = String(h.title);
  const stu = hwStudentNames().find(n => t.includes(n));
  return stu || '';
}
// 作业管理 = 作业完成情况台账：姓名 + 科目 + 是否完成 + 日期。
// 支持：两个班分开查看、单科筛选、按姓名搜索、整体通览统计。
// —— 渲染拆成「静态骨架 + 三个可局部刷新区块」：
//    #hwStats     统计条 / 未完成名单（只随班级·科目·状态变化，不随搜索词变化）
//    #hwFilterBar 当前筛选状态条（随搜索词变化）
//    #hwList      条数说明 + 记录列表（随搜索词变化）
// 搜索框输入时只刷新后两块，整页 DOM 与输入框本身不动，避免元素被销毁导致掉焦点、中文输入法组词被打断。

// 统一筛选上下文：班级 → 本班记录 → 本班科目（数据变化时自动回落，避免列表空白）
function hwFilterState() {
  const classes = state.classes || [];
  // 班级分开：默认跟随当前班级；班级列表变化或值失效时自动回落
  if (!hwClassFilter || !classes.some(c => c.id === hwClassFilter)) hwClassFilter = state.activeClass;
  const curCls = hwClassFilter;
  // 归属判定统一走 hwBelongsTo：记录里的 class 可能是 id、显示名或历史遗留值
  const mine = (state.homework || []).filter(h => hwBelongsTo(h, curCls));
  const subjects = [...new Set(mine.map(h => h.subject).filter(Boolean))];
  // 若当前科目筛选值在本班已不存在（如切了班级），自动重置，避免列表空白
  if (hwSubjectFilter && !subjects.includes(hwSubjectFilter)) hwSubjectFilter = '';
  return { classes, curCls, mine, subjects };
}

function hwStatHTML(label, val, cls) {
  return `<div class="flex-1 min-w-[5rem] rounded-xl ${cls} px-3 py-2 text-center"><div class="text-lg font-bold">${val}</div><div class="text-xs text-gray-500">${label}</div></div>`;
}

// 当前筛选状态条（受搜索词影响）
function hwFilterBarHTML() {
  const kw = (hwSearchName || '').trim();
  if (!(kw || hwSubjectFilter || hwStatusFilter)) return '';
  return `<div class="mb-3 flex items-center gap-2 flex-wrap text-xs text-gray-500">
      <span>当前筛选：</span>
      ${hwSubjectFilter ? `<span class="px-2 py-0.5 rounded-full bg-primary/10 text-primary">${esc(hwSubjectFilter)}</span>` : ''}
      ${hwStatusFilter ? `<span class="px-2 py-0.5 rounded-full ${hwStatusFilter === '未完成' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">${esc(hwStatusFilter)}</span>` : ''}
      ${kw ? `<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">搜索：${esc(kw)}</span>` : ''}
      <button data-lock-allow class="text-primary hover:underline" onclick="hwResetFilters()">清空全部</button>
    </div>`;
}

// 统计条 + 未完成名单：不受搜索词影响，保证搜一个人也能通览全局
function hwStatsHTML(mine) {
  // 整体通览：统计作用于「当前班级 + 科目/状态」范围（不受姓名搜索影响，避免搜一个人就看不到全局）
  const scope = mine.filter(h => (!hwSubjectFilter || h.subject === hwSubjectFilter) && (!hwStatusFilter || h.status === hwStatusFilter));
  const nUndone = scope.filter(h => h.status === '未完成').length;
  const nDone = scope.filter(h => h.status === '已完成').length;
  const nStu = new Set(scope.filter(h => h.status === '未完成' && hwStudentName(h)).map(h => hwStudentName(h))).size;

  // 未交名单汇总（按学生聚合，便于整体通览与点名）
  const agg = {};
  mine.forEach(h => {
    if (h.status !== '未完成') return;
    if (hwSubjectFilter && h.subject !== hwSubjectFilter) return;
    const n = hwStudentName(h) || '未指定';
    agg[n] = (agg[n] || 0) + 1;
  });
  const aggList = Object.entries(agg).sort((a, b) => b[1] - a[1]);

  return `<div class="flex gap-2 mb-3">
      ${hwStatHTML('总记录', scope.length, 'bg-gray-50')}
      ${hwStatHTML('未完成', nUndone, 'bg-red-50')}
      ${hwStatHTML('已完成', nDone, 'bg-green-50')}
      ${hwStatHTML('涉及学生', nStu, 'bg-gray-50')}
    </div>
    ${aggList.length ? `<div class="mb-3 p-3 rounded-xl bg-red-50/60">
      <div class="text-xs font-medium text-red-700 mb-2">未完成名单（共 ${aggList.length} 人 ${nUndone} 次）</div>
      <div class="flex flex-wrap gap-1.5">${aggList.map(([n, c]) => `<button data-lock-allow class="text-xs px-2 py-1 rounded-full bg-white text-red-600 border border-red-100 hover:bg-red-100" onclick="hwSearchStudent(${esc(JSON.stringify(n))})">${esc(n)} <span class="font-bold">${c}</span> 次</button>`).join('')}</div>
    </div>` : ''}`;
}

// 条数说明 + 记录列表（受搜索词影响）
function hwListHTML(curCls, mine) {
  const kw = (hwSearchName || '').trim();
  const hitKw = h => (hwStudentName(h) || h.studentName || '').includes(kw) || (h.subject || '').includes(kw) || (h.title || '').includes(kw) || hwDateLabel(h.date).includes(kw);
  // 列表：班级 → 科目 → 状态 → 关键词；按日期倒序，方便查看最新记录
  const list = mine.filter(h =>
    (!hwSubjectFilter || h.subject === hwSubjectFilter) &&
    (!hwStatusFilter || h.status === hwStatusFilter) &&
    (!kw || hitKw(h))
  ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const filtered = !!(kw || hwSubjectFilter || hwStatusFilter);

  return `<div class="text-xs text-gray-400 mb-2">${filtered ? `筛选出 ${list.length} 条（${esc(className(curCls))}共 ${mine.length} 条）` : `${esc(className(curCls))}共 ${mine.length} 条作业记录`}${hwOtherHint(curCls, filtered)}</div>
    <div class="grid gap-2">${list.map(h => {
      const undone = h.status === '未完成';
      const stuName = hwStudentName(h);
      const nameMissing = !h.studentName && !stuName;
      return `<div class="p-3 rounded-xl ${undone ? 'bg-red-50/50' : 'bg-gray-50'} flex gap-3 items-start">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            ${nameMissing
              ? `<button class="font-bold text-red-500 text-sm underline decoration-dotted hover:text-red-600" onclick="hwFixName('${h.id}')">未指定（点击补录姓名）</button>`
              : `<span class="font-bold text-gray-800 text-sm">${esc(stuName || h.studentName || '未指定')}</span>`}
            <span class="text-xs px-2 py-0.5 rounded-full ${undone ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">${esc(h.status || '已完成')}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">${esc(h.subject || '未指定')}</span>
            <span class="text-xs text-gray-400">${esc(hwDateLabel(h.date))}</span>
          </div>
          ${h.title ? `<div class="text-xs text-gray-500 mt-1 break-words whitespace-pre-wrap">${esc(h.title)}</div>` : ''}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button class="text-xs px-2 py-1 rounded-full border ${undone ? 'border-green-300 text-green-600 hover:bg-green-50' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}" onclick="hwToggleStatus('${h.id}')">${undone ? '标记已完成' : '标记未完成'}</button>
          <button class="text-gray-300 hover:text-red-500" onclick="deleteHomework('${h.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('') || `<div class="text-gray-400 text-sm">${filtered ? '没有匹配的记录，试试清空搜索或切换到「全部」。' : '本班暂无作业完成情况记录。用首页「一句话记录」记一条即可自动汇总到这里。'}</div>`}</div>`;
}

function renderHomework() {
  const kwList = (state.homeworkKeywords || []).slice(0, 6).join(' / ');
  const { classes, curCls, mine, subjects } = hwFilterState();
  const hasFilter = !!(hwSearchName || hwSubjectFilter || hwStatusFilter);

  // 班级页签（带各自条数，两个班互不干扰；只读模式下切换班级属于查看操作，放行）
  const classTabs = classes.map(c => {
    const n = (state.homework || []).filter(h => hwBelongsTo(h, c.id)).length;
    return `<button data-lock-allow class="px-3 py-1.5 rounded-full text-xs font-medium transition ${c.id === curCls ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="hwSetClass(${esc(JSON.stringify(c.id))})">${esc(c.name)} ${n}</button>`;
  }).join('');

  // 科目页签
  const subjTabs = [{ id: '', name: '全部' }]
    .concat(subjects.map(s => ({ id: s, name: s })))
    .map(s => `<button data-lock-allow class="px-3 py-1.5 rounded-full text-xs font-medium transition ${hwSubjectFilter === s.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="hwSetSubject(${esc(JSON.stringify(s.id))})">${esc(s.name)}</button>`).join('');

  // 状态页签
  const stTabs = [{ id: '', name: '全部' }, { id: '未完成', name: '未完成' }, { id: '已完成', name: '已完成' }]
    .map(s => `<button data-lock-allow class="px-3 py-1.5 rounded-full text-xs font-medium transition ${hwStatusFilter === s.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="hwSetStatus(${esc(JSON.stringify(s.id))})">${s.name}</button>`).join('');

  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <div class="font-bold text-gray-800">作业管理 · 完成情况台账</div>
        <div class="text-xs text-gray-500 mt-1">快速记录识别词：${esc(kwList)}${(state.homeworkKeywords || []).length > 6 ? '…' : ''}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openHomeworkKeywordSettings()">⚙️ 识别关键词</button>
      </div>
    </div>

    ${classes.length > 1 ? `<div class="flex flex-wrap gap-2 mb-3">${classTabs}</div>` : ''}

    <div id="hwStats">${hwStatsHTML(mine)}</div>

    <div class="flex flex-wrap gap-2 mb-2">${subjTabs}</div>
    <div class="flex flex-wrap gap-2 mb-3">${stTabs}</div>

    <div id="hwFilterBar">${hwFilterBarHTML()}</div>

    <div class="relative mb-3">
      <input id="hwSearchInput" data-lock-allow value="${esc(hwSearchName)}" oninput="hwSetSearch(this.value)" placeholder="按姓名 / 科目 / 内容搜索…" class="w-full border rounded-lg pl-9 pr-12 py-2 text-sm">
      <span class="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
      <button id="hwClearBtn" data-lock-allow class="absolute right-3 top-2 text-xs text-gray-400 hover:text-primary" style="display:${hasFilter ? '' : 'none'}" onclick="hwResetFilters()">清空</button>
    </div>

    <div id="hwList">${hwListHTML(curCls, mine)}</div>
  </div>`;
}

// 只刷新受搜索词影响的区块：搜索框本身与整页 DOM 保持不动，保证连续输入（含中文输入法）不被打断
function hwRefreshPartial() {
  const { curCls, mine } = hwFilterState();
  const bar = document.getElementById('hwFilterBar');
  if (bar) bar.innerHTML = hwFilterBarHTML();
  const box = document.getElementById('hwList');
  if (box) box.innerHTML = hwListHTML(curCls, mine);
  const cb = document.getElementById('hwClearBtn');
  if (cb) cb.style.display = (hwSearchName || hwSubjectFilter || hwStatusFilter) ? '' : 'none';
}

function hwSetSearch(v) { hwSearchName = v; hwRefreshPartial(); }
function hwSetSubject(s) { hwSubjectFilter = s; render(); }
function hwSetStatus(s) { hwStatusFilter = s; render(); }
function hwSetClass(c) { hwClassFilter = c; hwSubjectFilter = ''; hwSearchName = ''; render(); }
function hwSearchStudent(n) { hwSearchName = n; hwStatusFilter = '未完成'; render(); }
function hwResetFilters() { hwSearchName = ''; hwSubjectFilter = ''; hwStatusFilter = ''; render(); }
// 切换完成状态（补交/改判）
function hwToggleStatus(id) {
  const h = (state.homework || []).find(x => x.id === id);
  if (!h) return;
  h.status = h.status === '未完成' ? '已完成' : '未完成';
  save(); render();
}
// 为缺少学生姓名的旧记录补录姓名
function hwFixName(id) {
  const h = (state.homework || []).find(x => x.id === id);
  if (!h) return;
  const curCls = h.class || state.activeClass;
  const names = (state.students || []).filter(s => s && s.name && s.class === curCls).map(s => s.name);
  const name = prompt('补录该条作业记录的学生姓名：' + (names.length ? '\n（本班学生：' + names.join('、') + '）' : ''));
  if (!name || !name.trim()) return;
  const stu = (state.students || []).find(s => s.name === name.trim() && s.class === curCls);
  h.studentName = name.trim();
  h.studentId = stu ? stu.id : '';
  save(); render();
}
// 提示其他班是否还有记录，避免误以为数据丢失；点击可切换班级
function hwOtherHint(curCls, filtered) {
  const others = (state.classes || []).filter(c => c.id !== curCls)
    .map(c => ({ id: c.id, name: c.name, n: (state.homework || []).filter(h => hwBelongsTo(h, c.id)).length }))
    .filter(x => x.n > 0);
  if (!others.length) return '';
  return `　｜　其他班还有：${others.map(x => `<button data-lock-allow class="text-primary hover:underline" onclick="hwSetClass(${esc(JSON.stringify(x.id))})">${esc(x.name)} ${x.n} 项</button>`).join('、')}`;
}
function openHomeworkForm() {
  const cls = hwClassFilter || state.activeClass;
  const names = (state.students || []).filter(s => s && s.name && s.class === cls).map(s => s.name);
  const nameField = names.length
    ? `<select id="hwStudentName" class="w-full border rounded-lg p-2 text-sm">${names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>`
    : `<input id="hwStudentName" class="w-full border rounded-lg p-2 text-sm" placeholder="本班还没有学生，请先到「学生管理」录入">`;
  openModal('记一条作业完成情况', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">学生姓名</label>${nameField}</div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">科目</label><input id="hwSubject" class="w-full border rounded-lg p-2 text-sm" value="英语"></div>
        <div><label class="block text-xs text-gray-500 mb-1">完成情况</label>
          <select id="hwStatus" class="w-full border rounded-lg p-2 text-sm">
            <option value="未完成">未完成</option><option value="已完成">已完成</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">班级</label>${classSelectHTML('hwClass', cls)}</div>
        <div><label class="block text-xs text-gray-500 mb-1">日期时间（精确到秒）</label><input id="hwDate" type="datetime-local" step="1" class="w-full border rounded-lg p-2 text-sm" value="${dtLocalValue()}"></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">备注（可留空）</label><input id="hwTitle" class="w-full border rounded-lg p-2 text-sm" placeholder="如：数学练习册 P12 未交"></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveHomework()">保存</button>
    </div>`);
}
function saveHomework() {
  const nameEl = document.getElementById('hwStudentName');
  const studentName = (nameEl ? nameEl.value : '').trim();
  if (!studentName) return alert('请选择或填写学生姓名');
  const subject = (document.getElementById('hwSubject').value || '').trim() || '未指定';
  const status = document.getElementById('hwStatus').value === '已完成' ? '已完成' : '未完成';
  // 班级存内部 id（下拉框取值），而非显示名，避免改名后记录查不出来
  const clsEl = document.getElementById('hwClass');
  const cls = clsEl ? clsEl.value : state.activeClass;
  // 日期统一存 ISO（可带 HH:mm:ss），避免与首页「今日」判定所用格式不一致导致永远匹配不上。
  // 筛选一律走 hwNormDate 取日期部分，带时间不影响。
  const date = parseDtLocal(document.getElementById('hwDate').value) || nowStampSec();
  const title = (document.getElementById('hwTitle').value || '').trim();
  const stu = (state.students || []).find(s => s.name === studentName && s.class === cls);
  state.homework.unshift({ id: uid(), studentId: stu ? stu.id : '', studentName, subject, title, status, class: cls, date, ts: nowTs() });
  save(); closeModal(); render();
}
function deleteHomework(id) {
  const h = state.homework.find(x=>x.id===id);
  if(!h) return;
  markDeletedId('homework', id);
  doDelete(()=>state.homework, id, h.title || '作业');
}
function openHomeworkKeywordSettings() {
  const kws = (state.homeworkKeywords || []).join('\n');
  openModal('作业识别关键词设置', `
    <div class="space-y-4">
      <p class="text-xs text-gray-500">每行一个关键词。首页「一句话记录」识别到这些词时，会自动将记录加入「作业管理」。默认包含：作业、布置作业、背诵、默写、练习等。</p>
      <textarea id="hwKeywords" rows="8" class="w-full border rounded-lg p-3 text-sm">${esc(kws)}</textarea>
      <div class="flex gap-2">
        <button class="flex-1 bg-primary text-white py-2 rounded-full text-sm hover:bg-primaryDark" onclick="saveHomeworkKeywords()">保存</button>
        <button class="px-4 border border-gray-300 rounded-full text-sm hover:bg-gray-50" onclick="closeModal()">取消</button>
      </div>
    </div>`);
}
function saveHomeworkKeywords() {
  const raw = document.getElementById('hwKeywords').value;
  const kws = raw.split(/\n|、|,|\s+/).map(k => k.trim()).filter(Boolean);
  state.homeworkKeywords = kws.length ? kws : defaultHomeworkKeywords();
  save(); closeModal(); render();
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
      <div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="scClass" class="w-full border rounded-lg p-2 text-sm" placeholder="10班"></div>
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
  markDeletedId('scores', id);
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
  markDeletedId('todos', id);
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

// ===================== 班级手册 =====================
// 两个模块竖着排列：班级注意事项 / 违禁事项。条目支持增、改、删、上移下移。
// 只读模式（state.locked）下隐藏全部编辑入口，只保留查看；写入函数即便被绕过，
// 也会被锁定拦截器拦下（saveHbItem/deleteHbItem/moveHbItem 体内均调用 save()）。
const HB_KINDS = [
  { key: 'notes', title: '班级注意事项', icon: '📌', ph: '如：早读 7:30 前到班，迟到需补读', dot: 'bg-amber-400' },
  { key: 'bans',  title: '违禁事项',     icon: '🚫', ph: '如：禁止携带手机进入校园',       dot: 'bg-red-400' },
];
function hbBook() {
  if (!state.handbook || typeof state.handbook !== 'object') state.handbook = { notes: [], bans: [] };
  if (!Array.isArray(state.handbook.notes)) state.handbook.notes = [];
  if (!Array.isArray(state.handbook.bans)) state.handbook.bans = [];
  return state.handbook;
}
function hbList(kind) {
  const b = hbBook();
  const k = (kind === 'bans') ? 'bans' : 'notes';
  if (!Array.isArray(b[k])) b[k] = [];
  return b[k];
}
function hbMeta(kind) { return HB_KINDS.find(k => k.key === kind) || HB_KINDS[0]; }

function hbCard(kind) {
  const m = hbMeta(kind);
  const list = hbList(kind);
  const locked = isLocked();
  const kk = esc(JSON.stringify(m.key));
  const rows = list.length ? list.map((it, i) => {
    const id = esc(JSON.stringify(it.id));
    const ops = locked ? '' : `<div class="flex items-center gap-0.5 flex-shrink-0">
      <button class="hb-tap text-gray-300 hover:text-primary text-sm" title="上移" ${i === 0 ? 'disabled style="opacity:.3"' : ''} onclick="moveHbItem(${kk},${id},-1)">↑</button>
      <button class="hb-tap text-gray-300 hover:text-primary text-sm" title="下移" ${i === list.length - 1 ? 'disabled style="opacity:.3"' : ''} onclick="moveHbItem(${kk},${id},1)">↓</button>
      <button class="hb-tap text-gray-300 hover:text-primary text-sm" title="编辑" onclick="openHbEdit(${kk},${id})">✏️</button>
      <button class="hb-tap text-gray-300 hover:text-red-500 text-sm" title="删除" onclick="deleteHbItem(${kk},${id})">🗑️</button>
    </div>`;
    return `<div class="flex items-start gap-2 p-3 rounded-xl bg-gray-50">
      <span class="mt-2 w-1.5 h-1.5 rounded-full ${m.dot} flex-shrink-0"></span>
      <div class="flex-1 min-w-0 text-sm text-gray-800 whitespace-pre-wrap break-words">${esc(it.text)}</div>
      ${ops}
    </div>`;
  }).join('') : `<div class="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-xl">还没有内容，点下方「+ 添加一条」开始</div>`;
  return `<div class="bg-white rounded-2xl p-6 shadow-sm h-full flex flex-col">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-gray-800">${m.icon} ${m.title}</h3>
      <span class="text-xs text-gray-400">${list.length} 条</span>
    </div>
    <div class="space-y-2 flex-1">${rows}</div>
    ${locked ? '' : `<button class="mt-4 text-sm text-primary hover:underline" onclick="openHbAdd(${kk})">+ 添加一条</button>`}
  </div>`;
}

function renderHandbook() {
  const locked = isLocked();
  const cls = state.headTeacherClass || state.activeClass || '本班';
  return `<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div class="text-xs text-gray-400">📖 本手册属于「${esc(cls)}」，仅在班主任班显示</div>
      ${locked ? '<div class="text-xs text-amber-600">🔒 只读模式：当前仅可查看</div>' : ''}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
      ${HB_KINDS.map(k => hbCard(k.key)).join('')}
    </div>
  </div>`;
}

function openHbAdd(kind) { openHbEdit(kind, null); }
function openHbEdit(kind, id) {
  const m = hbMeta(kind);
  const it = id ? hbList(kind).find(x => x.id === id) : null;
  if (id && !it) return;
  openModal((it ? '编辑' : '添加') + m.title, `
    <div class="space-y-4">
      <div>
        <label class="block text-xs text-gray-500 mb-1">内容（支持换行，回车可分段）</label>
        <textarea id="hbText" rows="4" class="w-full border rounded-lg p-2.5 text-sm" placeholder="${esc(m.ph)}">${esc(it ? it.text : '')}</textarea>
      </div>
      <div class="flex gap-2">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal()">取消</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveHbItem(${esc(JSON.stringify(m.key))},${esc(JSON.stringify(id || ''))})">保存</button>
      </div>
    </div>`, 'md');
  setTimeout(() => {
    const el = document.getElementById('hbText');
    if (el) { try { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
  }, 50);
}
// 三个写操作都加只读前置判断：只读模式下按钮本就隐藏，这里是第二道防线，
// 保证即便被脚本/其它路径直接调用，内存里的数据也不会被改动（save() 是第三道）。
function saveHbItem(kind, id) {
  if (isLocked()) return;
  const el = document.getElementById('hbText');
  const text = el ? String(el.value || '').trim() : '';
  if (!text) return alert('请输入内容');
  const list = hbList(kind);
  if (id) {
    const it = list.find(x => x.id === id);
    if (it) it.text = text;
  } else {
    list.push({ id: uid(), text, ts: Date.now() });
  }
  save(); closeModal(); render();
}
function deleteHbItem(kind, id) {
  if (isLocked()) return;
  const it = hbList(kind).find(x => x.id === id);
  if (!it) return;
  markDeletedId('handbook.' + kind, id);
  doDelete(() => hbList(kind), id, hbMeta(kind).title + '：' + String(it.text || '').slice(0, 12));
}
function moveHbItem(kind, id, dir) {
  if (isLocked()) return;
  const list = hbList(kind);
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return;
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return;
  const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
  save(); render();
}

// ===================== Duty =====================
// ===================== Seating =====================
let seatDragSrc = null;
// 座次表按班级独立存储：每个班级一份网格，避免两班混排
function seatSD() {
  if (!state.seatingByClass || typeof state.seatingByClass !== 'object') state.seatingByClass = {};
  const c = state.activeClass;
  if (!state.seatingByClass[c]) {
    const base = (state.seating && Array.isArray(state.seating.cells)) ? state.seating : { name: '座次表', rows: 7, cols: 6, cells: null };
    state.seatingByClass[c] = {
      name: base.name || '座次表',
      rows: base.rows || 7,
      cols: base.cols || 6,
      cells: base.cells ? base.cells.map(r => Array.isArray(r) ? r.slice() : []) : makeSeatCells(base.rows || 7, base.cols || 6)
    };
  }
  return state.seatingByClass[c];
}
function makeSeatCells(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
}
function seatAssignedIds() {
  const ids = new Set();
  (seatSD().cells || []).forEach(row => row.forEach(sid => { if (sid) ids.add(sid); }));
  return ids;
}
function seatStudentName(sid) {
  if (!sid) return '';
  const s = state.students.find(x => x.id === sid);
  return s ? s.name : '';
}
function seatPendingStudents() {
  const assigned = seatAssignedIds();
  return state.students.filter(s => s.class === state.activeClass && !assigned.has(s.id));
}
function seatCellClass(sid, isDragging) {
  const has = !!sid;
  const base = has ? 'bg-primary/10 border-primary text-primary' : 'bg-gray-50 border-gray-200 text-gray-300';
  return `seat-cell seat-seat ${base} ${isDragging ? 'opacity-50' : ''}`;
}
function seatRowNumber(r) { return seatSD().rows - r; }
function seatColNumber(c) { return c + 1; }
function renderSeating() {
  const st = seatSD();
  const pending = seatPendingStudents();
  const totalSeats = st.rows * st.cols;
  const assignedCount = st.cells.flat().filter(Boolean).length;
  const colHeaders = Array.from({ length: st.cols }, (_, i) =>
    `<div class="seat-colhead">${seatColNumber(i)}</div>`
  ).join('');
  const rowsHtml = st.cells.map((row, r) => {
    const rowNum = seatRowNumber(r);
    const cellsHtml = row.map((sid, c) => {
      const name = seatStudentName(sid);
      const draggable = !!name;
      return `<div class="${seatCellClass(sid)}" id="seat-${r}-${c}" draggable="${draggable}" ondragstart="seatDragStart(event,${r},${c})" ondrop="seatDrop(event,${r},${c})" ondragover="seatDragOver(event)" ondragleave="seatDragLeave(event)" onclick="seatClick(${r},${c})">${name ? esc(name) : '<span class="seat-empty">空</span>'}</div>`;
    }).join('');
    return `<div class="seat-row"><div class="seat-rownum">${rowNum}</div>${cellsHtml}<div class="seat-rownum">${rowNum}</div></div>`;
  }).join('');
  const pendingHtml = pending.length ? pending.map(s =>
    `<div class="seat-pending-chip" draggable="true" id="pending-${s.id}" ondragstart="seatDragStartPending(event,'${s.id}')" onclick="seatClickPending('${s.id}')">${esc(s.name)}</div>`
  ).join('') : '<span class="text-sm text-gray-400">暂无需安排的学生</span>';
  return `<div class="space-y-3">
    <div class="bg-white rounded-2xl p-4 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <div>
          <div class="font-bold text-gray-800">${esc(st.name)}</div>
          <div class="text-xs text-gray-400 mt-0.5">已安排 ${assignedCount}/${totalSeats} 人 · 待安排 ${pending.length} 人</div>
        </div>
        <div class="flex gap-2">
          <button class="text-xs border rounded px-3 py-1.5 hover:bg-gray-50" onclick="openSeatConfig()">⚙️ 布局</button>
          <button class="text-xs border rounded px-3 py-1.5 hover:bg-gray-50" onclick="seatAutoArrange()">🎲 自动填充</button>
          <button class="text-xs border border-red-200 text-red-500 rounded px-3 py-1.5 hover:bg-red-50" onclick="seatClearAll()">清空</button>
        </div>
      </div>
      <div class="mb-3">
        <div class="text-xs text-gray-500 mb-1.5">🧩 待安排学生（点击或拖入空位）</div>
        <div class="flex flex-wrap gap-2 max-h-[76px] overflow-y-auto">${pendingHtml}</div>
      </div>
      <div class="seat-wrap">
        <div class="seat-row seat-header-row"><div class="seat-rownum"></div>${colHeaders}<div class="seat-rownum"></div></div>
        ${rowsHtml}
      </div>
      <p class="text-xs text-gray-400 mt-2">点击空座位选择学生；拖拽名字可互换或从上方拖入空位。</p>
    </div>
  </div>`;
}
function seatDragStart(ev, r, c) {
  const sid = seatSD().cells[r][c];
  if (!sid) { ev.preventDefault(); return; }
  seatDragSrc = { type: 'cell', r, c };
  ev.dataTransfer.effectAllowed = 'move';
  ev.target.classList.add('opacity-50');
}
function seatDragStartPending(ev, sid) {
  seatDragSrc = { type: 'pending', sid };
  ev.dataTransfer.effectAllowed = 'move';
  ev.target.classList.add('opacity-50');
}
function seatDragOver(ev) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  const cell = ev.currentTarget;
  if (cell && cell.classList) cell.classList.add('drag-over');
}
function seatDragLeave(ev) {
  const cell = ev.currentTarget;
  if (cell && cell.classList) cell.classList.remove('drag-over');
}
function seatDrop(ev, r, c) {
  ev.preventDefault();
  document.querySelectorAll('.opacity-50').forEach(el => el.classList.remove('opacity-50'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (!seatDragSrc) return;
  if (seatDragSrc.type === 'pending') {
    seatSD().cells[r][c] = seatDragSrc.sid;
  } else if (seatDragSrc.type === 'cell') {
    const tmp = seatSD().cells[r][c];
    seatSD().cells[r][c] = seatSD().cells[seatDragSrc.r][seatDragSrc.c];
    seatSD().cells[seatDragSrc.r][seatDragSrc.c] = tmp;
  }
  seatDragSrc = null;
  save(); render();
}
function seatClick(r, c) {
  openSeatAssignModal(r, c);
}
function seatClickPending(sid) {
  for (let r = 0; r < seatSD().rows; r++) {
    for (let c = 0; c < seatSD().cols; c++) {
      if (!seatSD().cells[r][c]) {
        seatSD().cells[r][c] = sid;
        save(); render();
        return;
      }
    }
  }
  alert('没有空座位了');
}
function openSeatAssignModal(r, c) {
  const current = seatStudentName(seatSD().cells[r][c]);
  const pending = seatPendingStudents();
  openModal(`安排座位（第${seatRowNumber(r)}排 第${seatColNumber(c)}列）`, `
    <div class="space-y-3 max-h-80 overflow-y-auto">
      <div class="text-xs text-gray-400">已安排的学生不会出现在下方</div>
      <div class="grid grid-cols-4 gap-2">
        ${pending.map(s => `<div class="p-2 rounded-lg bg-gray-50 hover:bg-primary/5 cursor-pointer text-center text-sm" onclick="seatSetStudent(${r},${c},'${s.id}')">${esc(s.name)}</div>`).join('')}
        <div class="p-2 rounded-lg bg-red-50 text-red-500 cursor-pointer text-center text-sm" onclick="seatSetStudent(${r},${c},'')">清除</div>
      </div>
      ${current ? `<div class="pt-2 border-t text-center"><span class="text-sm text-gray-600">当前：${esc(current)}</span></div>` : ''}
    </div>`);
}
function seatSetStudent(r, c, sid) {
  seatSD().cells[r][c] = sid;
  save(); closeModal(); render();
}
function seatClearAll() {
  if (!confirm('确定清空所有座位安排吗？')) return;
  seatSD().cells = makeSeatCells(seatSD().rows, seatSD().cols);
  save(); render();
}
function seatAutoArrange() {
  const pending = seatPendingStudents();
  const empties = [];
  seatSD().cells.forEach((row, r) => row.forEach((sid, c) => { if (!sid) empties.push({ r, c }); }));
  const shuffled = pending.map((s, i) => ({ s, i })).sort(() => Math.random() - 0.5);
  shuffled.forEach((item, idx) => {
    if (idx < empties.length) seatSD().cells[empties[idx].r][empties[idx].c] = item.s.id;
  });
  save(); render();
}
function openSeatConfig() {
  const st = seatSD();
  openModal('座次表布局设置', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">表名</label><input id="seatName" class="w-full border rounded-lg p-2 text-sm" value="${esc(st.name)}"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">行数</label><input id="seatRows" type="number" min="1" max="20" class="w-full border rounded-lg p-2 text-sm" value="${st.rows}"></div>
        <div><label class="block text-xs text-gray-500 mb-1">列数</label><input id="seatCols" type="number" min="1" max="20" class="w-full border rounded-lg p-2 text-sm" value="${st.cols}"></div>
      </div>
      <p class="text-xs text-gray-400">调整行列会尽量保留已有安排；减少行列时超出部分会丢失。</p>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveSeatConfig()">保存</button>
    </div>`);
}
function saveSeatConfig() {
  const st = seatSD();
  const name = document.getElementById('seatName').value.trim() || '座次表';
  const rows = Math.min(20, Math.max(1, parseInt(document.getElementById('seatRows').value) || 7));
  const cols = Math.min(20, Math.max(1, parseInt(document.getElementById('seatCols').value) || 6));
  const old = st.cells;
  const newCells = makeSeatCells(rows, cols);
  for (let r = 0; r < Math.min(old.length, rows); r++) {
    for (let c = 0; c < Math.min((old[r] || []).length, cols); c++) {
      const sid = (old[r][c] && typeof old[r][c] === 'object') ? (old[r][c].studentId || '') : String(old[r][c] || '');
      newCells[r][c] = sid;
    }
  }
  st.name = name;
  st.rows = rows;
  st.cols = cols;
  st.cells = newCells;
  save(); closeModal(); render();
}
function exportSeatTeacher() {
  const st = seatSD();
  const data = [];
  const header = [''];
  for (let c = 0; c < st.cols; c++) header.push(seatColNumber(c));
  header.push('');
  data.push(header);
  // 教师视角：站在讲台上从前往后看，第一排（最前，离讲台最近）在表格最下方。
  // 数据里 r=0 为屏上最上方、seatRowNumber(r)=rows-r，故屏上最下方(r=rows-1)即第一排(标号1)。
  // 按 r=0→rows-1 顺序写入，最后写入的(最下方)正好是 第一排(标号1)。
  for (let r = 0; r < st.rows; r++) {
    const rowNum = seatRowNumber(r);
    data.push([rowNum, ...st.cells[r].map(sid => seatStudentName(sid)), rowNum]);
  }
  exportSeatToXlsx(data, `${st.name || '座次表'}_教师用.xlsx`);
}
function exportSeatStudent() {
  const st = seatSD();
  const data = [];
  const header = [''];
  for (let c = 0; c < st.cols; c++) header.push(seatColNumber(c));
  header.push('');
  data.push(header);
  // 学生视角：站在教室后边（最后一排一侧）面对讲台看，最后一排（离讲台最远）在表格最下方。
  // 与教师用上下相反：按 r=rows-1→0 倒序写入，最下方是最后一排。
  // 同时，从后边看时左右与从前边看相反（前看左=后看右），故每行姓名左右镜像，
  // 使「列1」对应学生的左侧（即教师视角的右侧）。
  for (let r = st.rows - 1; r >= 0; r--) {
    const rowNum = seatRowNumber(r);
    data.push([rowNum, ...st.cells[r].map(sid => seatStudentName(sid)).reverse(), rowNum]);
  }
  exportSeatToXlsx(data, `${st.name || '座次表'}_学生用.xlsx`);
}
function exportSeatToXlsx(data, filename) {
  if (typeof XLSX === 'undefined') return alert('Excel 导出库尚未加载，请刷新后重试');
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(() => ({ wch: 10 }));
  ws['!merges'] = [];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '座次表');
  XLSX.writeFile(wb, filename);
}

// ===================== Class Record =====================
let crFilterSubject = ''; // '' = 全部
let crSearchName = '';
function crSetSubjectFilter(id){ crFilterSubject = id || ''; crRefreshPartial(); }
// 只重画「科目标签 + 列表」，不动搜索框 —— 否则每敲一个字整页重建，输入框立刻失焦
function crSetSearch(v){ crSearchName = (v || '').trim(); crRefreshPartial(); }
function crScopeRecords() {
  if(!state.classRecords) state.classRecords = [];
  return state.classRecords.filter(r => !r.class || r.class === state.activeClass);
}
function crTabsHtml() {
  const subjects = Array.isArray(state.classRecordSubjects) ? state.classRecordSubjects : [];
  const baseRecords = crScopeRecords();
  const subjectCounts = {};
  baseRecords.forEach(r => { subjectCounts[r.subject] = (subjectCounts[r.subject] || 0) + 1; });
  return [{ id: '', name: '全部' }].concat(subjects).map(s => {
    const active = crFilterSubject === s.id;
    const count = s.id ? (subjectCounts[s.name] || 0) : baseRecords.length;
    return `<button class="px-3 py-1.5 rounded-full text-xs font-medium transition ${active?'bg-primary text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="crSetSubjectFilter('${s.id}')">${esc(s.name)} ${count}</button>`;
  }).join('');
}
function crListHtml() {
  const subjects = Array.isArray(state.classRecordSubjects) ? state.classRecordSubjects : [];
  const nameQ = String(crSearchName || '').toLowerCase();
  const filtered = crScopeRecords().filter(r => {
    const subjOk = !crFilterSubject || (r.subject && subjects.some(s=>s.id===crFilterSubject && s.name===r.subject));
    const nameOk = !nameQ || (r.studentName && String(r.studentName).toLowerCase().includes(nameQ)) || (r.content && String(r.content).toLowerCase().includes(nameQ));
    return subjOk && nameOk;
  });
  return filtered.map(r => `<div class="p-4 rounded-xl bg-gray-50 flex justify-between items-start">
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1 flex-wrap">
        <span class="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">${esc(r.subject || '其他')}</span>
        ${r.studentName ? `<span class="text-xs font-medium text-gray-700">${esc(r.studentName)}</span>` : ''}
        <span class="text-xs text-gray-400">${esc(recDateLabel(r.date))}</span>
        ${r.auto ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">快速记录</span>' : ''}
      </div>
      <div class="text-sm text-gray-700">${esc(r.content)}</div>
    </div>
    <button class="text-gray-300 hover:text-red-500 ml-3" onclick="deleteClassRecord('${r.id}')">🗑️</button>
  </div>`).join('') || '<div class="text-gray-400 text-sm">暂无匹配记录</div>';
}
function crRefreshPartial() {
  const t = document.getElementById('crTabs'); if (t) t.innerHTML = crTabsHtml();
  const l = document.getElementById('crList'); if (l) l.innerHTML = crListHtml();
}
function renderClassRecord() {
  return `<div class="bg-white rounded-2xl p-6 shadow-sm space-y-4">
    <div class="flex items-center justify-between">
      <div class="font-bold text-gray-800">课堂记录</div>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 rounded-full text-xs border border-gray-300 text-gray-600 hover:bg-gray-50" onclick="openClassRecordSubjectSettings()">⚙️ 识别关键词</button>
        <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openClassRecordForm()">+ 添加记录</button>
      </div>
    </div>
    <div id="crTabs" class="flex flex-wrap gap-2">${crTabsHtml()}</div>
    <div class="relative">
      <input id="crSearch" data-lock-allow value="${esc(crSearchName)}" placeholder="按学生姓名搜索…" oninput="crSetSearch(this.value)" class="w-full border rounded-lg pl-9 pr-3 py-2 text-sm">
      <span class="absolute left-3 top-2 text-gray-400 text-sm">🔍</span>
    </div>
    <div id="crList" class="space-y-3">${crListHtml()}</div>
  </div>`;
}
function openClassRecordForm() {
  const subjects = Array.isArray(state.classRecordSubjects) ? state.classRecordSubjects : [];
  const subjOptions = subjects.map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
  const stuOptions = state.students.filter(s => s.class === state.activeClass).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  const defaultSubj = crFilterSubject ? (subjects.find(s=>s.id===crFilterSubject)||{}).name : (subjects[0] && subjects[0].name) || '其他';
  openModal('添加课堂记录', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">日期时间（精确到秒）</label><input id="crDate" type="datetime-local" step="1" class="w-full border rounded-lg p-2 text-sm" value="${dtLocalValue()}"></div>
        <div><label class="block text-xs text-gray-500 mb-1">科目</label><select id="crSubject" class="w-full border rounded-lg p-2 text-sm">${subjOptions}</select></div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">学生</label><select id="crStudent" class="w-full border rounded-lg p-2 text-sm"><option value="">请选择学生</option>${stuOptions}</select></div>
      <div><label class="block text-xs text-gray-500 mb-1">内容（课堂表现 / 纪律情况）</label><textarea id="crContent" rows="4" class="w-full border rounded-lg p-2 text-sm"></textarea></div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveClassRecord()">保存</button>
    </div>`);
  setTimeout(()=>{
    const sel = document.getElementById('crSubject');
    if(sel) sel.value = defaultSubj;
  },0);
}
function saveClassRecord() {
  if(!state.classRecords) state.classRecords = [];
  const content = document.getElementById('crContent').value.trim();
  if(!content) return alert('请输入内容');
  const sid = document.getElementById('crStudent').value;
  const s = sid ? state.students.find(x=>x.id===sid) : null;
  state.classRecords.unshift({
    id: uid(),
    date: parseDtLocal(document.getElementById('crDate').value) || nowStampSec(),
    ts: nowTs(),
    subject: document.getElementById('crSubject').value.trim()||'—',
    studentId: s ? s.id : null,
    studentName: s ? s.name : '',
    class: s ? s.class : state.activeClass,
    content
  });
  save(); closeModal(); render();
}
function deleteClassRecord(id) {
  const r = state.classRecords.find(x => x.id === id);
  if (!r) return;
  markDeletedId('classRecords', id);
  doDelete(() => state.classRecords, id, (r.content || '课堂记录').slice(0, 12));
}

// ===================== 行为记录（独立页，与课堂记录/班级日志平级） =====================
let behFilterType = '';
let behSearchName = '';
function behSetType(t) { behFilterType = t; behRefreshPartial(); }
// 只重画「类型标签 + 列表」，不动搜索框 —— 否则每敲一个字整页重建，输入框立刻失焦
function behSetSearch(v) { behSearchName = v; behRefreshPartial(); }
// 聚合当前班级全部学生的非课堂行为（来自各学生 s.records）
function behAllList() {
  if (!state.students) state.students = [];
  const cls = state.activeClass;
  const list = [];
  state.students.forEach(s => {
    if (s.class !== cls) return;
    (s.records || []).forEach(r => list.push({ sid: s.id, name: s.name, type: r.type, date: r.date, content: r.content, rid: r.id }));
  });
  list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return list;
}
function behTabsHtml() {
  return [
    { id: '', label: '全部' }, { id: 'critic', label: '批评' }, { id: 'praise', label: '表扬' },
    { id: 'chat', label: '谈心' }, { id: 'leave', label: '请假' },
  ].map(t => `<button class="px-3 py-1.5 rounded-full text-xs font-medium transition ${behFilterType === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="behSetType('${t.id}')">${t.label}</button>`).join('');
}
function behListHtml() {
  const q = String(behSearchName || '').trim().toLowerCase();
  const filtered = behAllList().filter(r => {
    const tOk = !behFilterType || r.type === behFilterType;
    const nOk = !q || String(r.name || '').toLowerCase().includes(q) || String(r.content || '').toLowerCase().includes(q);
    return tOk && nOk;
  });
  return filtered.map(r => `<div class="p-4 rounded-xl bg-gray-50 flex justify-between items-start">
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1 flex-wrap">
        <span class="text-xs font-medium text-gray-700">${esc(r.name)}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded ${recordTypeClass(r.type)}">${recordTypeLabel(r.type)}</span>
        <span class="text-xs text-gray-400">${esc(recDateLabel(r.date))}</span>
      </div>
      <div class="text-sm text-gray-700">${esc(r.content || '')}</div>
    </div>
    <button class="text-gray-300 hover:text-red-500 ml-3" onclick="deleteRecord('${r.sid}','${r.rid}')">🗑️</button>
  </div>`).join('') || '<div class="text-gray-400 text-sm">暂无符合条件的行为记录</div>';
}
function behCountHtml() {
  return `共 ${behAllList().length} 条 · 仅显示「${esc(state.activeClass)}」非课堂行为，已同步班级日志`;
}
function behRefreshPartial() {
  const t = document.getElementById('behTabs'); if (t) t.innerHTML = behTabsHtml();
  const l = document.getElementById('behList'); if (l) l.innerHTML = behListHtml();
  const c = document.getElementById('behCount'); if (c) c.textContent = behCountHtml();
}
function renderBehavior() {
  return `<div class="bg-white rounded-2xl p-6 shadow-sm space-y-4">
    <div class="flex items-center justify-between">
      <div class="font-bold text-gray-800">行为记录 <span id="behCount" class="text-xs text-gray-400 font-normal">（${behCountHtml()}）</span></div>
      <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openBehaviorAdd()">+ 添加记录</button>
    </div>
    <div id="behTabs" class="flex flex-wrap gap-2">${behTabsHtml()}</div>
    <div class="relative">
      <input id="behSearch" data-lock-allow value="${esc(behSearchName)}" placeholder="按学生姓名 / 内容搜索…" oninput="behSetSearch(this.value)" class="w-full border rounded-lg pl-9 pr-3 py-2 text-sm">
      <span class="absolute left-3 top-2 text-gray-400 text-sm">🔍</span>
    </div>
    <div id="behList" class="space-y-3">${behListHtml()}</div>
  </div>`;
}
// 选择学生后打开「添加行为记录」表单
function openBehaviorAdd() {
  const opts = state.students.filter(s => s.class === state.activeClass)
    .map(s => `<button class="w-full text-left px-4 py-2.5 rounded-lg hover:bg-primary/5 text-sm" onclick="closeModal(); openRecordForm('${s.id}')">${esc(s.name)} <span class="text-xs text-gray-400">${esc(s.class || '')}</span></button>`).join('');
  openModal('添加行为记录 · 选择学生', `<div class="space-y-1 max-h-[60vh] overflow-y-auto">${opts || '<div class="text-gray-400 text-sm">当前班级暂无学生，请先在「学生管理」中添加。</div>'}</div>`);
}
// 课堂记录科目识别关键词设置
function openClassRecordSubjectSettings() {
  const subjects = Array.isArray(state.classRecordSubjects) ? state.classRecordSubjects : [];
  const rows = subjects.map((s,i) => `<div class="border-b border-gray-100 py-3">
    <div class="flex items-center gap-2 mb-2">
      <input class="w-20 border rounded p-1 text-sm font-medium" value="${esc(s.name)}" onchange="crRenameSubject(${i},this.value)">
      <button class="text-xs text-red-500 hover:text-red-600" onclick="crRemoveSubject(${i})">删除</button>
    </div>
    <div class="flex flex-wrap gap-1 pl-1">
      ${(s.keywords||[]).map((kw,ki)=>`<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded border border-slate-200">${esc(kw)}<button class="text-slate-400 hover:text-red-500" onclick="crRemoveKeyword(${i},${ki})">×</button></span>`).join('')}
      <button class="inline-flex items-center bg-slate-50 text-slate-500 text-xs px-2 py-1 rounded border border-dashed border-slate-300" onclick="crAddKeyword(${i})">＋关键词</button>
    </div>
  </div>`).join('');
  openModal('课堂记录识别关键词', `
    <div class="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
      ${rows || '<div class="text-sm text-gray-400 py-4">暂无科目</div>'}
    </div>
    <button class="mt-4 w-full border border-primary text-primary py-2 rounded-full text-sm hover:bg-primary/5" onclick="crAddSubject()">＋ 添加科目</button>
    <p class="text-xs text-gray-400 mt-3">快速记录会匹配这些关键词，自动把相关内容记入对应科目的课堂记录。</p>`);
}
function crAddSubject(){
  const name = prompt('请输入科目名称：'); if(!name||!name.trim()) return;
  state.classRecordSubjects.push({ id: uid(), name: name.trim(), keywords: [name.trim()] });
  save(); render();
}
function crRemoveSubject(i){
  if(!confirm('确定删除这个科目及其关键词吗？对应的课堂记录不会删除。')) return;
  state.classRecordSubjects.splice(i,1);
  save(); render();
}
function crRenameSubject(i,name){
  if(!name||!name.trim()) return;
  state.classRecordSubjects[i].name = name.trim();
  save(); render();
}
function crAddKeyword(i){
  const kw = prompt('请输入识别关键词：'); if(!kw||!kw.trim()) return;
  state.classRecordSubjects[i].keywords = state.classRecordSubjects[i].keywords || [];
  state.classRecordSubjects[i].keywords.push(kw.trim());
  save(); render();
}
function crRemoveKeyword(i,ki){
  state.classRecordSubjects[i].keywords.splice(ki,1);
  save(); render();
}

// ===================== Report =====================
function setReportRange(r) { reportRange = r; render(); }
function renderReport() {
  if (reportParentMode) return renderParentReport();
  // 下面要按学生逐人取总分和四个维度分，先把缓存一次性准备好（否则每人每次都要重算签名）
  ptEnsureCacheAll();
  const clsStudents = state.students.filter(s => s.class === state.activeClass);
  const isMonth = reportRange === 'month';
  const dayWin = isMonth ? 30 : 7;
  const inClass = new Set(clsStudents.map(s => s.id));
  const totalStudents = clsStudents.length;
  // 时间窗：周报取近 7 天、月报取近 30 天（含今天）。
  // 旧实现算出 recent 却没用，表扬/批评一直是「建班至今累计值」，切周报月报数字纹丝不动。
  const winStartTs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (dayWin - 1)); return d.getTime(); })();
  const inWin = (dateStr) => { const d = ptParseDate(dateStr); return !!d && d.getTime() >= winStartTs; };
  const criticCount = clsStudents.reduce((a, s) => a + (s.records || []).filter(r => r.type === 'critic' && inWin(r.date)).length, 0);
  const praiseCount = clsStudents.reduce((a, s) => a + (s.records || []).filter(r => r.type === 'praise' && inWin(r.date)).length, 0);
  const winLogs = (state.classLogs || []).filter(l => inWin(l.date || l.dateLabel));
  const pendingComm = state.communications.filter(c => c.status === '待跟进').length;
  const recent = ptRecent(dayWin).filter(l => inClass.has(l.studentId));
  const recentSum = ptSum(recent);   // 本周期新增积分
  const top10 = clsStudents.map(s => ({ s, score: ptScoreOfCached(s.id) })).sort((a, b) => b.score - a.score).slice(0, 10).filter(x => x.score !== 0);
  const dimSum = (dim) => clsStudents.reduce((a, s) => a + ptDimScoreCached(s.id, dim), 0);
  const sportSum = dimSum('sport'), dailySum = dimSum('daily'), examSum = dimSum('exam'), postSum = dimSum('post');
  const totalSum = sportSum + dailySum + examSum + postSum;
  const reportText = `【${className(state.activeClass)} · ${isMonth ? '月报' : '周报'}】
时间：${formatDate(now)}
班级概况：本班共 ${totalStudents} 名学生。
行为记录统计：${isMonth ? '近30天' : '近7天'}表扬 ${praiseCount} 次，批评 ${criticCount} 次。
积分概况：全班累计 ${fmtScore(totalSum)} 分（体育打卡 ${fmtScore(sportSum)}、日常积分 ${fmtScore(dailySum)}、考试赋分 ${fmtScore(examSum)}、任职赋分 ${fmtScore(postSum)}）；${isMonth ? '近30天' : '近7天'}新增 ${fmtScore(recentSum)} 分。
积分排行前10：${top10.length ? top10.map((x, i) => `${i + 1}. ${x.s.name} ${fmtScore(x.score)}分`).join('，') : '暂无'}
家校沟通：待跟进 ${pendingComm} 项。
班级日志摘要（${isMonth ? '近30天' : '近7天'}）：${winLogs.slice(0,5).map(l=>l.date+' '+l.content).join('；') || '暂无'}
待办重点：${state.todos.filter(t=>!t.done).slice(0,3).map(t=>t.title).join('；') || '无'}`;

  const rangeBtn = (r, label) => `<button class="px-3 py-1.5 rounded-full text-sm transition ${reportRange===r?'bg-primary text-white':'bg-gray-100 text-gray-600 hover:bg-primary/10'}" onclick="setReportRange('${r}')">${label}</button>`;
  const medals = ['🥇', '🥈', '🥉'];
  const dimBadge = (icon, label, value, color) => `<div class="flex-1 min-w-[110px] rounded-xl p-3 ${color} text-center">
    <div class="text-xs opacity-80 mb-1">${icon} ${label}</div>
    <div class="font-bold text-lg">${fmtScore(value)}</div>
  </div>`;
  const statCard = (icon, label, value, color) => `<div class="flex items-center gap-3 rounded-xl p-3 bg-gray-50 flex-1 min-w-[140px]">
    <div class="w-10 h-10 rounded-full ${color} flex items-center justify-center text-lg">${icon}</div>
    <div>
      <div class="text-xs text-gray-500">${label}</div>
      <div class="font-bold text-xl text-gray-800">${value}</div>
    </div>
  </div>`;

  const visualReport = `<div id="reportVisual" class="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-5 sm:p-6 ${reportParentMode ? 'report-parent' : ''}">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <div class="text-xl sm:text-2xl font-bold text-gray-800">${esc(className(state.activeClass))} · 班级${isMonth ? '月报' : '周报'}</div>
        <div class="text-sm text-gray-500 mt-1">${formatDate(now)} · 共 ${totalStudents} 名学生</div>
      </div>
      <span class="self-start sm:self-auto inline-block px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">${isMonth ? '🗓️ 月报' : '📅 周报'}</span>
    </div>
    <!-- 左右双栏：积分排行（左）+ 班级日志摘要（右） -->
    <div class="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4 mb-4">
      <!-- 左栏：积分排行前10 -->
      <div class="rounded-xl p-4 bg-gradient-to-br from-gray-50 to-white border border-gray-100 shadow-sm">
        <div class="text-sm font-bold text-gray-700 mb-2.5">🏆 积分排行</div>
        ${top10.length ? `<div class="space-y-1">${top10.map((x, i) => {
          const convTotal = ptConvTotal(x.s.id);
          const dims = POINT_DIMS.map(d => ({...d, v: ptConvDim(x.s.id, d.id)}));
          // 前三名精致高亮，其余简洁
          const isTop3 = i < 3;
          const dimStr = dims.map(d => `<span class="${['text-emerald-500/70','text-amber-500/70','text-sky-500/70','text-violet-500/70'][POINT_DIMS.indexOf(d)]}">${d.icon}${fmtScore(d.v)}</span>`).join(' ');
          return `<div class="group flex items-center gap-2 py-2 px-2.5 rounded-xl transition-colors ${isTop3 ? 'bg-gradient-to-r from-amber-50/80 to-yellow-50/40 border border-amber-100/50' : 'hover:bg-gray-100/60'}">
            <!-- 排名+头像 -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span class="${isTop3 ? 'text-base' : 'text-xs text-gray-300'} w-5 text-center font-bold">${isTop3 ? medals[i] : (i + 1)}</span>
              <img src="${esc(x.s.avatar)}" class="w-7 h-7 rounded-full ${isTop3 ? 'ring-2 ring-amber-200' : ''} bg-gray-100" alt="">
            </div>
            <!-- 姓名 -->
            <span class="text-sm ${isTop3 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'} whitespace-nowrap">${esc(x.s.name)}</span>
            <!-- 四维分（小字，次要信息） -->
            <div class="flex-1 min-w-0 justify-end text-[10px] text-gray-400 hidden sm:flex items-center gap-1">${dimStr}</div>
            <!-- 总分（突出） -->
            <span class="${isTop3 ? 'text-sm font-black text-primary tabular-nums' : 'text-xs font-semibold text-gray-500 tabular-nums'} flex-shrink-0 ml-1">${fmtScore(convTotal)}</span>
          </div>`;
        }).join('')}</div>` : '<div class="text-sm text-gray-400 py-4 text-center">暂无数据</div>'}
      </div>
      <!-- 右栏：班级日志摘要 -->
      <div class="rounded-xl p-4 bg-gray-50 border border-gray-100">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-bold text-gray-700">📓 班级日志摘要</div>
        <div class="flex gap-1">
          <button class="text-xs px-2.5 py-1 rounded-full transition ${reportLogMode === 'date' ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}" onclick="reportLogMode='date';render()">📅 按日期</button>
          <button class="text-xs px-2.5 py-1 rounded-full transition ${reportLogMode === 'person' ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}" onclick="reportLogMode='person';render()">👤 按姓名</button>
        </div>
      </div>
      ${(() => {
        // ===== 只取当前班级的日志（两班分离） =====
        const targetCls = state.activeClass;
        // 与周报/月报口径一致：只取时间窗内的日志
        let logs = (state.classLogs || []).filter(l => classLogBelongsTo(l, targetCls) && inWin(l.date || l.dateLabel));
        if (!logs.length) return `<div class="text-sm text-gray-400 py-2">${isMonth ? '近30天' : '近7天'}暂无日志</div>`;

        const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
        const fmtDate = (dstr) => {
          const d = ptParseDate(dstr);
          if (!d) return dstr;
          return weekdays[d.getDay()] + '（' + (d.getMonth()+1) + '月' + d.getDate() + '日）';
        };
        // ===== 日志内容智能解析引擎 v2（基于真实案例训练） =====
        // 已知原始格式案例：
        //   "秦梦茹 请假（肚子疼）" → ✅ 标准格式
        //   "赵吉晨数学作业未完成（赵吉晨日常积分-1）" → 名字紧贴+元数据泄露
        //   "孙巾杰、秦梦菇、赵吉晨 数学作业未完成且上英语课说话；和上数学课打闹；本周三室内卫生不合格；（赵吉晨日常积分-1、赵吉晨日常积分-1）" → 多人多元数据
        //   "董一鸣 室外卫生/值日不合格（班长），周四" → 职位标注+日期后缀
        //   "【考勤】刘语 请假" → 带前缀标记

        const cleanContent = (raw) => {
          let c = (raw || '').trim();
          // 1. 来源标记前缀
          c = c.replace(/^(一句话记录[：:\s]*)+/g, '');
          c = c.replace(/^【[^】]+】\s*/g, '');
          // 2. 括号内元数据（核心：任何包含"积分/分/加分/扣分"的括号内容全部删除）
          c = c.replace(/\([^()]*?(?:日常积分|考试赋分|体育打卡|任职赋分|积分|加分|扣分)[^()]*\)/gi, '');
          // 3. 纯分数括号：（-1）、（+2）、（2分）、（-1分）
          c = c.replace(/\(\s*[+-]?\d+(\.\d+)?\s*分?\s*\)/g, '');
          // 4. 多条分数逗号分隔：（xxx-1、yyy-1）残留处理
          c = c.replace(/[，,]\s*[^\s，,。；;]*?[+-]?\d+(\.\d+)?\s*分?\s*/g, '');
          // 5. 括号内的职位/角色标注：（班长）、（组长）、（课代表）
          c = c.replace(/（(?:班长|组长|课代表|学委|体委|生活委员|纪律委员|团支书|学习委员|宣传委员)）/g, '');
          c = c.replace(/\((?:班长|组长|课代表|学委|体委|生活委员|纪律委员|团支书|学习委员|宣传委员)\)/g, '');
          // 6. 末尾日期后缀："，周四"、"，8月29日"
          c = c.replace(/[,，]\s*(?:周[一二三四五六日]|星期[一二三四五六日]|[\d]+月[\d]+日)\s*$/, '');
          // 7. 清理多余空格和标点
          c = c.replace(/^[，。、:：；;\s]+/, '').replace(/[，。\s]+$/, '');
          c = c.replace(/\s{2,}/g, ' ');
          return c.trim();
        };

        // 用学生名单精确提取人名（解决"赵吉晨数"边界问题）
        const extractNamesFromText = (text) => {
          const clsStudents = state.students.filter(s => s.class === targetCls);
          // 按名字长度降序排列（先匹配长的，避免"张三"误匹配"张三四"中的"张三"）
          const sorted = [...clsStudents].sort((a, b) => (b.name||'').length - (a.name||'').length);
          const found = [];
          let remaining = text;
          for (const s of sorted) {
            if (!s.name || !remaining.includes(s.name)) continue;
            // 避免重复添加（如"张三、张四"中张三只算一次）
            if (!found.includes(s.name)) {
              found.push(s.name);
            }
            // 用占位符替换已匹配的名字（保持原长度，避免后续位置偏移错误）
            remaining = remaining.split(s.name).join('·'.repeat(s.name.length));
          }
          // 清理剩余内容：去掉占位符和多余字符
          let rest = remaining.replace(/·+/g, ' ').replace(/\s+/g, ' ').trim();
          return { names: found, rest };
        };

        const parseLogEntry = (content) => {
          const c = cleanContent(content);
          if (!c) return { names: [], desc: '', raw: c };
          const { names, rest } = extractNamesFromText(c);
          return { names, desc: rest || c, raw: c };
        };

        // 将一条可能包含多个事件的日志拆分成多条（按 ；/； 分割）
        const splitMultiEvents = (text) => {
          // 按 中文分号 或 英文分号 分割，但保留括号内的分号不被分割
          const parts = [];
          let depth = 0, current = '';
          for (const ch of text) {
            if (ch === '(' || ch === '（') depth++;
            else if (ch === ')' || ch === '）') depth--;
            else if ((ch === ';' || ch === '；') && depth === 0) { parts.push(current.trim()); current = ''; continue; }
            current += ch;
          }
          if (current.trim()) parts.push(current.trim());
          return parts.filter(p => p.length > 0);
        };
        // 判断事件类型
        const eventTypeOf = (desc) => {
          if (/请假|病假|事假/.test(desc)) return 'leave';
          if (/批评|违纪|扣分|警告|迟到|说话|不认真|走神|睡觉|玩手机|打架|顶撞|没交作业|未完成|未交|抄袭|作弊/.test(desc)) return 'critic';
          if (/表扬|获奖|🏆|👍|流动红旗|全勤|主动|进步|好人好事|拾金不昧|优秀|积极/.test(desc)) return 'praise';
          if (/谈心|谈话|沟通|家访|约谈|开导|安慰|鼓励/.test(desc)) return 'chat';
          return 'other';
        };
        const typeIcon = { leave:'🏥', critic:'⚠️', praise:'👍', chat:'💬', other:'📌' };

        if (reportLogMode === 'date') {
          // ===== 按日期模式：逐条展示，多人多事件自动拆分 =====
          const groups = {};
          logs.forEach(l => { (groups[l.date] = groups[l.date] || []).push(l); });
          const dates = Object.keys(groups).sort((a,b) => (ptParseDate(a)||0) - (ptParseDate(b)||0));
          const lines = dates.map(date => {
            const items = groups[date];
            let totalSubItems = 0;
            const entryLines = items.map(l => {
              const cleaned = cleanContent(l.content);
              // 尝试按分号拆分为多条子事件
              const subEvents = splitMultiEvents(cleaned);
              return subEvents.map(sub => {
                const { names, desc } = parseLogEntry(sub || cleaned);
                const t = eventTypeOf(desc);
                totalSubItems++;
                // 超长描述智能截断（保留人名完整）
                const nameStr = names.length ? '<span class="font-semibold text-gray-800">'+esc(names.join('、'))+'</span>' : '';
                const displayDesc = desc.length > 60 ? desc.slice(0, 60) + '…' : desc;
                const fullText = nameStr + (nameStr && displayDesc ? ' ' : '') + esc(displayDesc);
                return `<div class="flex items-start gap-2 py-1.5 px-2.5 rounded-lg hover:bg-white/60 transition-colors">
                  <span class="text-xs mt-0.5 flex-shrink-0">${typeIcon[t]||'📌'}</span>
                  <span class="text-sm text-gray-700 leading-relaxed">${fullText}</span>
                </div>`;
              }).join('');
            }).join('');
            return `<div class="py-2.5 border-b border-gray-200/30 last:border-0">
              <div class="text-xs font-semibold text-gray-500 mb-1.5 sticky top-0 bg-gray-50 py-1 -mx-1 px-1">${fmtDate(date)} · ${items.length}条</div>
              <div class="space-y-0.5">${entryLines}</div>
            </div>`;
          });
          return `<div class="max-h-[420px] overflow-y-auto">${lines.join('')}</div>` + `<div class="text-xs text-gray-400 pt-1.5">共 ${logs.length} 条 · ${esc(className(targetCls))}</div>`;
        } else {
          // ===== 按姓名模式：每人显示具体记录（去重+合并相同事件） =====
          const clsStudents = state.students.filter(s => s.class === targetCls);
          const personData = {};
          logs.forEach(l => {
            // 用全文匹配找学生
            for (const s of clsStudents) {
              if ((l.content || '').includes(s.name)) {
                if (!personData[s.id]) personData[s.id] = { name: s.name, avatar: s.avatar, events: [] };
                const cleanedDesc = cleanContent(l.content);
                personData[s.id].events.push({ raw: l.content, desc: cleanedDesc, date: l.date });
                break;
              }
            }
          });
          const ranked = Object.values(personData).map(p => {
            // 去重：相同描述的事件合并，记录次数
            const descMap = {};
            p.events.forEach(e => {
              const key = e.desc; // 用清理后的描述作为去重key
              if (!descMap[key]) descMap[key] = { desc: key, count: 0, dates: [], raws: [] };
              descMap[key].count++;
              descMap[key].dates.push(e.date);
              descMap[key].raws.push(e.raw);
            });
            // 转为数组，按次数降序
            p.uniqueEvents = Object.values(descMap).sort((a, b) => b.count - a.count);
            p.totalEvents = p.events.length;
            return p;
          }).sort((a, b) => b.totalEvents - a.totalEvents);

          return ranked.length ? `<div class="space-y-2 max-h-[420px] overflow-y-auto">${ranked.map((p, i) => {
            const showEvents = p.uniqueEvents.slice(0, 5); // 最多显示5条不同事件
            const eventLines = showEvents.map(e => {
              const { names, desc } = parseLogEntry(e.desc);
              const displayDesc = desc.length > 45 ? desc.slice(0, 45) + '…' : desc;
              const t = eventTypeOf(desc);
              const countBadge = e.count > 1 ? `<span class="text-[10px] text-gray-400 ml-1 bg-gray-100 px-1 rounded">×${e.count}</span>` : '';
              return `<div class="text-xs text-gray-600 pl-4 py-1 border-l-2 ${t==='critic'?'border-rose-300 bg-rose-50/20':t==='praise'?'border-emerald-300 bg-emerald-50/20':t==='leave'?'border-blue-300 bg-blue-50/20':'border-gray-200'} rounded-r">${(typeIcon[t]||'·')} ${esc(displayDesc)}${countBadge}</div>`;
            }).join('');
            const moreHint = p.uniqueEvents.length > 5 ? `<div class="text-xs text-gray-400 pl-4 pt-1">...等${p.uniqueEvents.length}类事件</div>` : '';
            return `<div class="py-2 px-3 rounded-xl ${i < 3 ? 'bg-gradient-to-r from-rose-50/60 to-transparent border border-rose-100/30' : 'hover:bg-gray-50'}">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-xs text-gray-400 w-5 flex-shrink-0 font-bold">${i + 1}</span>
                <img src="${esc(p.avatar)}" class="w-6 h-6 rounded-full bg-gray-100 flex-shrink-0" alt="">
                <span class="text-sm font-semibold text-gray-800">${esc(p.name)}</span>
                <span class="text-xs text-gray-400 ml-auto font-medium">${p.totalEvents}条</span>
              </div>
              <div class="space-y-0.5">${eventLines}${moreHint}</div>
            </div>`;
          }).join('')}</div>` : '<div class="text-sm text-gray-400 py-2">暂无日志记录</div>';
        }
      })()}
    </div>
    </div>
  </div>`;

  const toolbar = reportParentMode ? '' : `<div class="flex items-center justify-between mb-4">
    <div class="font-bold text-gray-800 text-lg">${esc(className(state.activeClass))} · 班级${isMonth ? '月报' : '周报'}</div>
    <div class="flex items-center gap-2 flex-wrap justify-end">
      ${rangeBtn('week','📅 周报')} ${rangeBtn('month','🗓️ 月报')}
      <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openAttendanceBonusModal()">🏅 全勤结算</button>
      <button class="text-sm ${reportParentMode ? 'bg-primary text-white' : 'text-primary border border-primary'} px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="toggleReportParentMode()">${reportParentMode ? '退出截图模式' : '📸 家长群截图'}</button>
      <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="copyText(document.getElementById('reportText').textContent)">复制纯文本</button>
    </div>
  </div>`;

  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    ${toolbar}
    ${visualReport}
    <pre id="reportText" class="hidden">${esc(reportText)}</pre>
  </div>`;
}

function toggleReportParentMode() {
  reportParentMode = !reportParentMode;
  render();
}

// （「班会 PPT」生成功能曾提供，已在菜单精简时移除入口，相关函数已清理为死代码并删除）

// ===================== 全勤与履职结算（客观判定，不依赖主观打分）=====================
const ATT_BONUS  = { sport: 15, attend: 5, post: 5 };
const ATT_AUTO   = { sport: 'attend-sport-month', attend: 'attend-attend-week', post: 'attend-post-week' };
const ATT_REASON = { sport: '体育打卡全勤(月)+15', attend: '考勤全勤(周)+5', post: '履职到位(周)+5' };
const ATT_DIM    = { sport: 'sport', attend: 'daily', post: 'post' };

function attWeekRange(ref){ const d=new Date(ref.getFullYear(),ref.getMonth(),ref.getDate()); const dow=(d.getDay()+6)%7; const s=new Date(d); s.setDate(d.getDate()-dow); const e=new Date(s); e.setDate(s.getDate()+6); return {start:s,end:e}; }
function attMonthRange(ref){ return {start:new Date(ref.getFullYear(),ref.getMonth(),1), end:new Date(ref.getFullYear(),ref.getMonth()+1,0)}; }
function attInRange(dateStr,start,end){ const d=ptParseDate(dateStr); if(!d) return false; const day=new Date(d.getFullYear(),d.getMonth(),d.getDate()); const s=new Date(start.getFullYear(),start.getMonth(),start.getDate()); const e=new Date(end.getFullYear(),end.getMonth(),end.getDate()); return day.getTime()>=s.getTime() && day.getTime()<=e.getTime(); }
// 取某生某维度在某区间的积分记录；排除系统自动写入的"全勤奖励"记录，避免自我循环放大
function attStudentLogsInRange(sid,dim,start,end){ return (state.points.logs||[]).filter(l=>l.studentId===sid && (!dim||l.dim===dim) && attInRange(l.date,start,end) && String(l.auto||'').indexOf('attend-')!==0); }
function attLateCount(sid,start,end){ let n=0; attStudentLogsInRange(sid,'daily',start,end).forEach(l=>{ if((l.reason||'').indexOf('迟到')>=0) n++; }); return n; }
function attLeaveCountRange(name,start,end){ let n=0; (state.attendance.logs||[]).forEach(l=>{ if(!attInRange(l.date,start,end)) return; (l.leave||[]).forEach(x=>{ if(x.name===name) n++; }); }); const cur=state.attendance.current; if(cur&&cur.date&&attInRange(cur.date,start,end)&&cur.leave&&Object.prototype.hasOwnProperty.call(cur.leave,name)) n++; return n; }
function attSportScoreInRange(sid,start,end){
  let v = ptSum(attStudentLogsInRange(sid,'sport',start,end));
  // 基线抵扣模型：区间内补上基线分（封顶今天；仅班主任班）。全勤判定按月区间，
  // 与积分窗口（本月1日起）天然一致——没记异常的学生基线即全班最高。
  if (sportCfg().enabled && state.activeClass === state.headTeacherClass) {
    v += sportBaselineInfo(start, end).total;
  }
  return v;
}
function attClassSportMax(start,end){ let mx=0; state.students.filter(s=>s.class===state.activeClass).forEach(s=>{ const v=attSportScoreInRange(s.id,start,end); if(v>mx) mx=v; }); return mx; }
function attPostBad(sid,start,end){ let bad=false; (state.points.logs||[]).forEach(l=>{ if(l.studentId!==sid||!attInRange(l.date,start,end)) return; if(l.dim==='post'&&l.auto==='job'&&(l.reason||'').indexOf('履职不到位')>=0) bad=true; if(l.auto==='deduct') bad=true; }); return bad; }
// 判断学生是否有任职（班干部/课代表/值日生等）
function hasPostRole(sid){
  const s = (state.students||[]).find(x=>x.id===sid); if(!s) return false;
  const pos = state.positions || {}; const struct = pos.structure || [];
  const assign = pos.assign || {};
  const reps = pos.representatives || [];
  // 检查 structure 中的职务分配
  for (const roleId in assign) { if (Array.isArray(assign[roleId]) && assign[roleId].includes(s.id)) return true; }
  // 检查课代表
  if (reps.includes(s.id)) return true;
  // 检查值日轮值
  const rota = pos.dutyRota || {}; const sched = rota.schedule || [];
  if (sched.some(day => (day.on || []).includes(s.id) || (day.off || []).includes(s.id))) return true;
  return false;
}
// 计算三类全勤的达标情况（返回每个学生 id -> 是否达标）
function attComputeBonus(){
  const today=new Date(); const wk=attWeekRange(today), mo=attMonthRange(today);
  const cls=state.students.filter(s=>s.class===state.activeClass);
  const sportMax=attClassSportMax(mo.start,mo.end);
  const sport={},attend={},post={};
  cls.forEach(s=>{
    sport[s.id]= sportMax>0 && Math.abs(attSportScoreInRange(s.id,mo.start,mo.end)-sportMax)<0.001;
    attend[s.id]= attLateCount(s.id,wk.start,wk.end)===0 && attLeaveCountRange(s.name,wk.start,wk.end)===0;
    post[s.id]= !attPostBad(s.id,wk.start,wk.end);
  });
  return {wk,mo,sportMax,sport,attend,post,cls};
}
function openAttendanceBonusModal(){
  const b=attComputeBonus();
  const sec=(cat,title,sub,map,reasonFn)=>{
    const achieved=b.cls.filter(s=>map[s.id]);
    const missed=b.cls.filter(s=>!map[s.id]);
    const rows=b.cls.map(s=>{
      const ok=map[s.id];
      const reason = !ok && reasonFn ? reasonFn(s) : '';
      return `<label class="flex items-center gap-2 text-sm py-1 px-2 rounded ${ok?'bg-emerald-50':'bg-red-50/60'}">
        <input type="checkbox" class="att-chk" data-cat="${cat}" value="${s.id}" ${ok?'checked':''}>
        <span class="${ok?'text-emerald-700':'text-gray-600 font-medium'}">${esc(s.name)}</span>
        ${ok ? '<span class="text-[10px] text-emerald-500">✅ 达标</span>' : `<span class="text-[11px] text-red-400">❌ ${esc(reason || '未达标')}</span>`}
      </label>`;
    }).join('');
    const summary = missed.length > 0
      ? `<div class="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 mt-2 flex items-center gap-1">
          💪 还差 <b>${missed.length}</b> 人：${missed.map(s=>esc(s.name)).join('、')}
         </div>`
      : `<div class="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5 mt-2">🎉 全班已全部达成！</div>`;
    return `<div class="rounded-xl border border-gray-100 p-3">
      <div class="flex items-center justify-between mb-2 gap-2">
        <div class="font-medium text-gray-700 text-sm">${title} <span class="text-xs text-gray-400">${sub}</span></div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs ${missed.length===0 ? 'text-emerald-600' : 'text-amber-600'}">达标 ${achieved.length}/${b.cls.length}</span>
          <button class="text-xs bg-primary text-white px-2.5 py-1 rounded-full hover:bg-primaryDark" onclick="attSettleBonus('${cat}')">写入 +${ATT_BONUS[cat]}</button>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-52 overflow-y-auto">${rows}</div>
      ${summary}
    </div>`;
  };
  // 未达标原因函数
  const sportReason = (s) => { const diff = attClassSportMax(b.mo.start,b.mo.end) - attSportScoreInRange(s.id,b.mo.start,b.mo.end); return `体育分差 ${diff.toFixed(0)}`; };
  const attendReason = (s) => {
    const late = attLateCount(s.id, b.wk.start, b.wk.end);
    const leave = attLeaveCountRange(s.name, b.wk.start, b.wk.end);
    if (late > 0 && leave > 0) return `迟到${late}次 + 请假${leave}次`;
    if (late > 0) return `迟到${late}次`;
    if (leave > 0) return `请假${leave}次`;
    return '有缺勤';
  };
  const postReason = (s) => {
    if (!hasPostRole(s.id)) return '无任职';
    if (attPostBad(s.id, b.wk.start, b.wk.end)) return '有不到位/扣分记录';
    return '';
  };

  openModal('🏅 全勤与履职结算', `
    <div class="space-y-3">
      <p class="text-xs text-gray-500 leading-relaxed">系统按客观标准自动判定达标名单（✅ 默认勾选）。确认后点「写入」即计入对应维度积分（体育全勤→体育打卡 / 考勤全勤→日常 / 履职到位→任职），可整批撤销。标准：体育全勤=本月体育打卡分达全班最高；考勤全勤=本周迟到0且请假0；履职到位=本周无"履职不到位"记录且无关联扣分。</p>
      ${sec('sport','🏃 体育打卡全勤(月)','+'+ATT_BONUS.sport+'分/月',b.sport,sportReason)}
      ${sec('attend','📋 考勤全勤(周)','+'+ATT_BONUS.attend+'分/周',b.attend,attendReason)}
      ${sec('post','🤝 履职到位(周)','+'+ATT_BONUS.post+'分/周',b.post,postReason)}
      <button class="w-full text-sm text-gray-400 hover:text-primary" onclick="closeModal()">关闭</button>
    </div>`, 'md');
}
// 把勾选的达标学生写入对应维度积分；先清除本类别上次写入，保证重复结算不叠加
function attSettleBonus(cat){
  const auto=ATT_AUTO[cat];
  state.points.logs=state.points.logs.filter(l=>l.auto!==auto);
  const ids=Array.from(document.querySelectorAll('.att-chk[data-cat="'+cat+'"]:checked')).map(c=>c.value);
  const batchId=uid();
  ids.forEach(sid=>ptWriteLog(sid,ATT_DIM[cat],ATT_BONUS[cat],ATT_REASON[cat],batchId,auto));
  save(); render();
  toast(`已写入 ${ids.length} 人 · ${ATT_REASON[cat]}（可在积分明细整批撤销）`);
}
// 班级违纪按类型拆分（用于家长周报，不出现积分）
function classViolationBreakdown(start,end){
  const cls=state.students.filter(s=>s.class===state.activeClass);
  const cnt={late:0,leave:0,homework:0,klass:0,hygiene:0};
  cls.forEach(s=>{
    (s.records||[]).forEach(r=>{
      const c=(r.content||'');
      if(r.type==='critic'){
        if(c.indexOf('卫生')>=0) cnt.hygiene++;
        else if(c.indexOf('不交')>=0||c.indexOf('没交')>=0||c.indexOf('未交')>=0||c.indexOf('未完成')>=0) cnt.homework++;
        else cnt.klass++;
      }
    });
    attStudentLogsInRange(s.id,'daily',start,end).forEach(l=>{ if((l.reason||'').indexOf('迟到')>=0) cnt.late++; });
    cnt.leave+=attLeaveCountRange(s.name,start,end);
    (state.points.logs||[]).forEach(l=>{ if(l.studentId===s.id&&l.auto==='deduct'&&attInRange(l.date,start,end)&&(l.reason||'').indexOf('卫生')>=0) cnt.hygiene++; });
  });
  return cnt;
}
// 家长模式周报/月报：完全不出现"分/积分"，只给实用信息
function renderParentReport(){
  const b=attComputeBonus();
  const isMonth=reportRange==='month';
  const periodLabel=isMonth?'本月':'本周';
  const start=isMonth?b.mo.start:b.wk.start, end=isMonth?b.mo.end:b.wk.end;
  const cls=b.cls, totalStudents=cls.length;
  const vb=classViolationBreakdown(start,end);
  const praiseMap={},criticMap={};
  // 与标题口径一致：只统计所选周期内的记录（旧实现统计的是建班至今累计值）
  cls.forEach(s=>{(s.records||[]).forEach(r=>{ if(!attInRange(r.date,start,end)) return; if(r.type==='praise')praiseMap[s.id]=(praiseMap[s.id]||0)+1; if(r.type==='critic')criticMap[s.id]=(criticMap[s.id]||0)+1; });});
  const praiseTotal=Object.values(praiseMap).reduce((a,x)=>a+x,0);
  const criticTotal=Object.values(criticMap).reduce((a,x)=>a+x,0);
  const praiseList=cls.filter(s=>praiseMap[s.id]).sort((a,b)=>praiseMap[b.id]-praiseMap[a.id]).slice(0,5);
  const criticList=cls.filter(s=>criticMap[s.id]).sort((a,b)=>criticMap[b.id]-criticMap[a.id]).slice(0,5);
  const ctrue=m=>cls.filter(s=>m[s.id]).length;
  const sportN=ctrue(b.sport),attendN=ctrue(b.attend),postN=ctrue(b.post);
  const card=(icon,label,val,color)=>`<div class="flex-1 min-w-[120px] rounded-xl p-3 ${color} text-center"><div class="text-xs opacity-80 mb-1">${icon} ${label}</div><div class="font-bold text-lg">${val}</div></div>`;
  const listHtml=(arr,map,word)=>arr.length?arr.map(s=>`<div class="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0"><span class="text-sm text-gray-700">${esc(s.name)}</span><span class="text-xs text-gray-400">${word} ${map[s.id]} 次</span></div>`).join(''):'<div class="text-sm text-gray-400 py-2">暂无</div>';
  const reportText=`【${className(state.activeClass)} · 家长${isMonth?'月报':'周报'}】
时间：${formatDate(now)}
班级概况：本班共 ${totalStudents} 名学生。
${periodLabel}概况：表扬 ${praiseTotal} 次，需关注 ${criticTotal} 次。
违纪情况：迟到 ${vb.late} 人次、请假 ${vb.leave} 人次、作业未交 ${vb.homework} 人次、课堂违纪 ${vb.klass} 人次、卫生不合格 ${vb.hygiene} 人次。
全勤情况：体育打卡全勤 ${sportN} 人、考勤全勤 ${attendN} 人、履职到位 ${postN} 人。
值得肯定：${praiseList.length?praiseList.map(s=>s.name+'('+praiseMap[s.id]+'次)').join('、'):'暂无'}
需家长协同：${criticList.length?criticList.map(s=>s.name+'('+criticMap[s.id]+'次)').join('、'):'暂无'}
班级日志：${(state.classLogs||[]).filter(l=>attInRange(l.date,start,end)).slice(0,3).map(l=>l.date+' '+l.content).join('；')||'暂无'}`;
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800 text-lg">${esc(className(state.activeClass))} · 家长${isMonth?'月报':'周报'}</div>
      <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="copyText(document.getElementById('reportText').textContent)">复制纯文本</button>
    </div>
    <div class="rounded-2xl p-4 bg-emerald-50 border border-emerald-100 mb-4">
      <div class="text-sm text-gray-600 font-medium mb-2">${periodLabel}概况</div>
      <div class="flex flex-wrap gap-2">
        ${card('👍','表扬',praiseTotal,'bg-emerald-100 text-emerald-700')}
        ${card('⚠️','需关注',criticTotal,'bg-amber-100 text-amber-700')}
        ${card('👥','学生人数',totalStudents,'bg-blue-100 text-blue-700')}
      </div>
    </div>
    <div class="rounded-2xl p-4 bg-gray-50 border border-gray-100 mb-4">
      <div class="text-sm font-bold text-gray-700 mb-2">📊 违纪情况（按类型）</div>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
        ${card('⏰','迟到',vb.late,'bg-rose-100 text-rose-700')}
        ${card('🏠','请假',vb.leave,'bg-indigo-100 text-indigo-700')}
        ${card('📕','作业未交',vb.homework,'bg-orange-100 text-orange-700')}
        ${card('💬','课堂违纪',vb.klass,'bg-violet-100 text-violet-700')}
        ${card('🧹','卫生不合格',vb.hygiene,'bg-teal-100 text-teal-700')}
      </div>
    </div>
    <div class="rounded-2xl p-4 bg-gray-50 border border-gray-100 mb-4">
      <div class="text-sm font-bold text-gray-700 mb-2">✅ 全勤情况（客观达标人数）</div>
      <div class="grid grid-cols-3 gap-2">
        ${card('🏃','体育打卡全勤',sportN,'bg-orange-100 text-orange-700')}
        ${card('📋','考勤全勤',attendN,'bg-sky-100 text-sky-700')}
        ${card('🤝','履职到位',postN,'bg-pink-100 text-pink-700')}
      </div>
    </div>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="rounded-xl p-4 bg-gray-50 border border-gray-100">
        <div class="text-sm font-bold text-gray-700 mb-2">🌟 值得肯定</div>
        ${listHtml(praiseList,praiseMap,'表扬')}
      </div>
      <div class="rounded-xl p-4 bg-gray-50 border border-gray-100">
        <div class="text-sm font-bold text-gray-700 mb-2">🤝 需家长协同</div>
        ${listHtml(criticList,criticMap,'关注')}
      </div>
    </div>
    <pre id="reportText" class="hidden">${esc(reportText)}</pre>
  </div>`;
}


// ===================== Points: 积分管理 =====================
let pointsTab = 'all';
let pointsQuery = '';
let pointsMode = 'conv'; // 'conv' 折算分 | 'raw' 原始分

// ===================== Report: 周报月报 =====================
let reportParentMode = false; // 家长群截图模式：隐藏操作按钮、放大字号
let reportLogMode = 'date';   // 班级日志展示模式: 'date'=按日期  'person'=按人违纪次数

function setPtMode(m) {
  pointsMode = m;
  ptRefreshMode(); ptRefreshCards(); ptRefreshList();
}
function ptScoreOf(sid) { return pointsMode === 'conv' ? ptConvTotal(sid) : ptRawTotal(sid); }
// 同上：用于「循环外已 ptEnsureCacheAll 过」的批量场景，直接读总分缓存
function ptScoreOfCached(sid) { return pointsMode === 'conv' ? (_ptCache.totalConv[sid] || 0) : (_ptCache.totalRaw[sid] || 0); }
// 与上面同理，总分也有两个只读版本：ptConvTotal/ptRawTotal 内部会调 ptEnsureCacheAll，
// 50 人逐个调用就是 50×4 次签名计算。批量场景请用这两个。
function ptConvTotalCached(sid) { return _ptCache.totalConv[sid] || 0; }
function ptRawTotalCached(sid) { return _ptCache.totalRaw[sid] || 0; }
function saveHomeCalcStart() {
  const v = document.getElementById('homeCalcStart').value;
  if (!v) return alert('请选择有效的起始日期');
  state.points.calcStartDate = v;
  save(); render();
  toast('积分计算起始日已更新：' + v + ' 起的记录才会参与统计');
}

// 将各种日期字符串解析为 Date（当年）：支持 "8月25日"、"2026-09-01"、"2026/09/01"、"9.1" 等
function ptParseDate(str) {
  if (!str) return null;
  const currentYear = new Date().getFullYear();
  let m;
  if ((m = String(str).match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/))) {
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  if ((m = String(str).match(/^(\d{1,2})[\.\/月](\d{1,2})[日\s]*$/))) {
    const mm = +m[1], dd = +m[2];
    let year = currentYear;
    const cand = new Date(year, mm - 1, dd);
    const now = new Date();
    const diffDays = (cand - now) / 86400000;
    if (diffDays > 182) year -= 1;        // 今年此日还在很远的未来 → 实为去年（跨年边界）
    else if (diffDays < -182) year += 1;  // 今年此日已过去很久 → 实为明年（跨年边界）
    return new Date(year, mm - 1, dd);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
function ptCalcStartDate() {
  return ptParseDate(state.points.calcStartDate) || new Date('2026-01-01');
}
function ptIsLogEffective(log) {
  const start = ptCalcStartDate();
  const logDate = ptParseDate(log.date);
  if (!logDate) return true; // 无法解析日期时，默认参与计算
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const logDay = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate());
  return logDay.getTime() >= startDay.getTime();
}
function ptEffectiveLogs(logs) { return logs.filter(ptIsLogEffective); }

// ===================== 体育基线抵扣模型 =====================
// 模型：打卡 +N/天（每个日历天）+ 出操 +N/天（每个工作日，减去登记的无早操日）自动计入体育维度，
// 异常（迟到/请假/缺勤/未打卡）通过负分日志对冲。只对班主任班生效；按月重置：
// 计分窗口 = 本月1日 ~ 今天，且不早于 sportModule.startDate（跨月后上月日志保留可查但不计分）。
function sportCfg() {
  const d = (state && state.sportModule) || {};
  return {
    enabled: d.enabled !== false,
    startDate: d.startDate || '2026-09-01',
    checkinPts: typeof d.checkinPts === 'number' ? d.checkinPts : 2,
    exercisePts: typeof d.exercisePts === 'number' ? d.exercisePts : 2,
    noExerciseDays: Array.isArray(d.noExerciseDays) ? d.noExerciseDays : [],
  };
}
// 体育计分窗口：[max(本月1日, 起始日), 今天]
function sportWindow() {
  const cfg = sportCfg();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const sd = ptParseDate(cfg.startDate);
  const s = (sd && sd > start) ? new Date(sd.getFullYear(), sd.getMonth(), sd.getDate()) : start;
  const e = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start: s, end: e };
}
// 体育日志是否落在计分窗口内（替代全局起始日过滤：体育按月窗口自治）
function sportLogEffective(log) {
  const w = sportWindow();
  const d = ptParseDate(log && log.date);
  if (!d) return true;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return day.getTime() >= w.start.getTime() && day.getTime() <= w.end.getTime();
}
// 任意区间的基线信息：checkinDays=日历天数，exerciseDays=工作日数（减 noExerciseDays），封顶到今天
function sportBaselineInfo(start, end) {
  const cfg = sportCfg();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const s = new Date(Math.max(start.getTime(), (ptParseDate(cfg.startDate) || new Date('2026-09-01')).getTime()));
  const e = new Date(Math.min(end.getTime(), today.getTime()));
  const noEx = new Set((cfg.noExerciseDays || []).map(d => String(d || '').slice(0, 10)));
  let checkinDays = 0, exerciseDays = 0;
  const cursor = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  while (cursor.getTime() <= e.getTime()) {
    const iso = todayISO(cursor);
    checkinDays++;
    const dow = cursor.getDay(); // 0=周日 6=周六
    if (dow >= 1 && dow <= 5 && !noEx.has(iso)) exerciseDays++;
    cursor.setDate(cursor.getDate() + 1);
  }
  const checkinPts = checkinDays * cfg.checkinPts;
  const exercisePts = exerciseDays * cfg.exercisePts;
  return { checkinDays, exerciseDays, checkinPts, exercisePts, total: checkinPts + exercisePts };
}
// 当前计分窗口内的基线总分（仅班主任班；任课班无体育模块，不加基线）
function sportBaselinePts() {
  if (!sportCfg().enabled) return 0;
  if (state.activeClass !== state.headTeacherClass) return 0;
  const w = sportWindow();
  return sportBaselineInfo(w.start, w.end).total;
}
// 基线签名成分：配置 + 日期（基线每天自动增长，签名必须随日期变化以失效缓存）
function sportSigExtra() {
  const cfg = sportCfg();
  return [cfg.enabled ? 1 : 0, cfg.startDate, cfg.checkinPts, cfg.exercisePts, (cfg.noExerciseDays || []).slice().sort().join('|'), todayISO()].join('#');
}


function nowStamp() {
  // 精确到秒（旧版只到分钟）。积分日志一直走这个格式，ptParseDate 能直接解析。
  return nowStampSec();
}
function ptSum(logs) { return logs.reduce((a, b) => a + (+b.delta || 0), 0); }
function ptStudentLogs(sid) {
  if (_ptIdx) return _ptIdx.get(sid) || [];
  return ((state.points && state.points.logs) || []).filter(l => l && l.studentId === sid);
}
// ========== 积分计算缓存：按维度独立缓存，支持显式刷新，不主动全局重算 ==========
let _ptCache = { sig: {}, raw: {}, conv: {}, totalConv: {}, totalRaw: {} };

// 本班学生名册签名：转班 / 新增 / 删除 / 改名都会改变积分归属，必须让缓存失效。
// 旧实现签名里没有名册，导致「学生从 A 班转到 B 班后，B 班仍显示 0 分」。
function ptRosterSig() {
  const list = (state.students || []).filter(s => s && s.class === state.activeClass);
  if (!list.length) return '@';
  hashStart();
  hashAdd(list.length);
  for (let i = 0; i < list.length; i++) { hashAdd(list[i].id); hashAdd(list[i].name); }
  return hashEnd();
}
function ptBaseSig() { return [state.activeClass, state.headTeacherClass, state.points.calcStartDate, ptRosterSig()].join('#'); }
function ptLogsSig(dim) {
  const logs = (state.points && state.points.logs) || [];
  hashStart();
  hashAdd(logs.length);
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    if (!l || l.dim !== dim) continue;
    hashAdd(l.id); hashAdd(l.studentId); hashAdd(l.delta); hashAdd(l.date);
  }
  return hashEnd();
}
function ptPositionsSig() {
  const P = state.positions || {};
  hashStart();
  const structure = P.structure || [];
  hashAdd(structure.length);
  for (let i = 0; i < structure.length; i++) {
    const p = structure[i] || {};
    hashAdd(p.id); hashAdd(p.pts == null ? -1 : p.pts); hashAdd(p.category);
  }
  const assign = P.assign || {};
  const ks = Object.keys(assign);
  hashAdd(ks.length);
  for (let i = 0; i < ks.length; i++) {
    hashAdd(ks[i]);
    const arr = assign[ks[i]] || [];
    hashAdd(arr.length);
    for (let j = 0; j < arr.length; j++) hashAdd(arr[j]);
  }
  const reps = P.representatives || [];
  hashAdd(reps.length);
  for (let i = 0; i < reps.length; i++) {
    const r = reps[i] || {};
    hashAdd(r.id); hashAdd(r.pts == null ? -1 : r.pts);
    const ns = r.names || [];
    hashAdd(ns.length);
    for (let j = 0; j < ns.length; j++) hashAdd(ns[j]);
  }
  return hashEnd();
}
// 真正的签名计算（会遍历全部日志 / 成绩记录）
function ptDimSigNow(dim) {
  examScoreData(); // 确保 _escSig 最新
  const base = ptBaseSig();
  const cap = state.convertRatios[dim] != null ? state.convertRatios[dim] : 0;
  if (dim === 'exam') return [base, cap, _escSig].join('#');
  if (dim === 'post') return [base, cap, ptLogsSig('post'), ptPositionsSig()].join('#');
  if (dim === 'sport') return [base, cap, ptLogsSig('sport'), sportSigExtra()].join('#');
  return [base, cap, ptLogsSig(dim)].join('#');
}
// ===== 签名记忆（严格限定在单次渲染内）=====
// 一次页面渲染里 ptDimSig 会被同一批不变的数据反复调用（实测积分页单页 200+ 次：
// 50 个学生逐个查总分，每次查询都要重新哈希 1500 条日志 + 900 条成绩记录）。
// 渲染过程本身不写数据，所以整轮渲染算一次就够，其余直接取记忆值。
//
// 作用域刻意收得很窄，宁可多算也不能让过期签名造成"数据改了页面不更新"：
//   · 只在 ptWithSigMemo() 包住的那次调用期间生效，用 try/finally 保证异常时也撤销；
//   · 实际只有 render() 渲染页面时会包一层；渲染之外的直接读取（脚本、测试、
//     以及将来任何新代码）一律现算，不会因为记忆而读到旧值；
//   · save() 里再兜底撤一次，防止渲染过程中途写数据导致后半程读到旧签名。
// 另外 ptComputeDim 写完缓存后取签名用 ptDimSigNow 强制现算，
// 避免把「改动前的旧签名」当成新数据的签名写进缓存。
let _ptSigMemo = null;
function ptDropSigMemo() { _ptSigMemo = null; }
function ptWithSigMemo(fn) {
  if (_ptSigMemo) return fn();          // 已在批次内，沿用外层记忆
  const m = {};
  _ptSigMemo = m;
  try { return fn(); }
  finally { if (_ptSigMemo === m) _ptSigMemo = null; }
}
function ptDimSig(dim) {
  const m = _ptSigMemo;
  if (!m) return ptDimSigNow(dim);
  const hit = m[dim];
  if (hit !== undefined) return hit;
  const v = ptDimSigNow(dim);
  m[dim] = v;
  return v;
}
function ptAllSig() { return POINT_DIMS.map(d => _ptCache.sig[d.id] || '').join('##'); }

// 底层：单人单维度原始分（含考试赋分并入，仅班主任班）
function ptDimScoreRaw(sid, dim) {
  let v;
  if (dim === 'sport' && sportCfg().enabled && state.activeClass === state.headTeacherClass) {
    // 体育维度走基线抵扣模型：基线分 + 计分窗口内的日志（按月窗口，不受全局起始日约束）
    v = ptSum(ptStudentLogs(sid).filter(l => l.dim === 'sport' && sportLogEffective(l))) + sportBaselinePts();
  } else {
    v = ptSum(ptEffectiveLogs(ptStudentLogs(sid).filter(l => l.dim === dim)));
  }
  if (dim === 'exam' && state.activeClass === state.headTeacherClass) {
    const s = state.students.find(x => x.id === sid);
    if (s) v += examScoreStudentTotal(s.name);
  }
  return v;
}

// 重算单个维度（原始分 + 折算分）并写缓存
function ptComputeDim(dim) {
  _ptCache.raw[dim] = {}; _ptCache.conv[dim] = {};
  const clsStudents = state.students.filter(s => s.class === state.activeClass);
  const cap = state.convertRatios[dim] != null ? state.convertRatios[dim] : 0;
  let mx = 0;
  // 计算期间启用按学生的日志索引，结束后必须清掉（finally 保证异常时也清理）
  _ptIdx = ptBuildLogIndex();
  try {
    clsStudents.forEach(stu => {
      const v = ptDimScoreRaw(stu.id, dim) || 0;
      _ptCache.raw[dim][stu.id] = v;
      if (v > mx) mx = v;
    });
  } finally { _ptIdx = null; }
  clsStudents.forEach(stu => {
    const raw = _ptCache.raw[dim][stu.id] || 0;
    _ptCache.conv[dim][stu.id] = (cap <= 0 || raw < 0) ? raw : (mx > 0 ? (raw / mx) * cap : 0);
  });
  _ptCache.sig[dim] = ptDimSigNow(dim);
}

// 懒加载：签名缺失或与当前数据签名不一致（如更改积分计算起始日/日志/职务/折算）时自动重算
function ptEnsureCacheDim(dim) { if (!_ptCache.sig[dim] || _ptCache.sig[dim] !== ptDimSig(dim)) ptComputeDim(dim); }
// 该维度当前数据是否与缓存不一致
function ptIsDimDirty(dim) { return !!_ptCache.sig[dim] && _ptCache.sig[dim] !== ptDimSig(dim); }
// 显式刷新单个维度（卡片按钮用）
function ptRefreshDim(dim) {
  delete _ptCache.sig[dim];
  ptComputeDim(dim);
  // 总分依赖各维度缓存，清除总分缓存，下次访问时按当前各维度缓存重算
  delete _ptCache.sig.all;
  render();
  toast(`${dimLabel(dim)} 已刷新`);
}

function ptComputeAll() {
  const clsStudents = state.students.filter(s => s.class === state.activeClass);
  // 总分要按学生逐人取四个维度，同样在本次计算期间启用日志索引
  _ptIdx = ptBuildLogIndex();
  try {
    clsStudents.forEach(stu => {
      let c = 0; POINT_DIMS.forEach(d => { c += (_ptCache.conv[d.id] && _ptCache.conv[d.id][stu.id]) || 0; });
      _ptCache.totalConv[stu.id] = c;
      _ptCache.totalRaw[stu.id] = ptTotal(stu.id);
    });
  } finally { _ptIdx = null; }
  _ptCache.sig.all = ptAllSig();
}
function ptEnsureCacheAll() {
  POINT_DIMS.forEach(d => { if (!_ptCache.sig[d.id] || _ptCache.sig[d.id] !== ptDimSig(d.id)) ptComputeDim(d.id); });
  if (!_ptCache.sig.all || _ptCache.sig.all !== ptAllSig()) ptComputeAll();
}

// 原始总分 = 四个维度原始分之和。
// 不能只累加日志：考试赋分的成绩折算分不在日志里（由 ptDimScoreRaw 实时计入），
// 旧实现直接用 ptSum(全部日志) 会把考试赋分整块漏掉（四维度之和 70 而总分只显示 20）。
function ptTotal(sid) {
  const dimIds = POINT_DIMS.map(d => d.id);
  let v = 0;
  for (const d of dimIds) v += ptDimScoreRaw(sid, d) || 0;
  // 兜底：维度不属于四个标准维度的历史脏数据也要计入，避免记录凭空消失
  v += ptSum(ptEffectiveLogs(ptStudentLogs(sid).filter(l => dimIds.indexOf(l.dim) === -1)));
  return v;
}
function ptDimScore(sid, dim) { ptEnsureCacheDim(dim); return (_ptCache.raw[dim] && _ptCache.raw[dim][sid]) || 0; }
// 只读缓存、不检查签名。用于「循环外已 ptEnsureCacheDim / ptEnsureCacheAll 过」的批量场景：
// 渲染过程不会改数据，所以循环外确保一次 + 循环内直读，与每人各查一次签名结果完全一致，
// 但把签名计算次数从 学生数×维度数（实测 416 次）降到个位数。
function ptDimScoreCached(sid, dim) { return (_ptCache.raw[dim] && _ptCache.raw[dim][sid]) || 0; }
function ptConvScoreCached(sid, dim) { return (_ptCache.conv[dim] && _ptCache.conv[dim][sid]) || 0; }
// 一次性确保四个维度都就绪
function ptWarmDims() { POINT_DIMS.forEach(d => ptEnsureCacheDim(d.id)); }

// 积分日志按学生建索引：取分时要按 studentId 过滤，原本每取一次就全表扫一遍
// （50 人 × 1500 条 ≈ 7.5 万次/页）。索引只在单次同步计算期间有效，用完立即置空，
// 因此不存在「日志变了索引没更新」的风险。
let _ptIdx = null;
function ptBuildLogIndex() {
  const map = new Map();
  const logs = (state.points && state.points.logs) || [];
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    if (!l || !l.studentId) continue;
    const arr = map.get(l.studentId);
    if (arr) arr.push(l); else map.set(l.studentId, [l]);
  }
  return map;
}
function ptClassSum(dim) {
  ptEnsureCacheDim(dim);
  return state.students.filter(s => s.class === state.activeClass).reduce((a, s) => a + ((_ptCache.raw[dim] && _ptCache.raw[dim][s.id]) || 0), 0);
}
// 全班某维度折算分之和（用于积分管理页顶部卡片，随折算/原始模式切换）
function ptClassConvSum(dim) {
  ptEnsureCacheDim(dim);
  return state.students.filter(s => s.class === state.activeClass).reduce((a, s) => a + ((_ptCache.conv[dim] && _ptCache.conv[dim][s.id]) || 0), 0);
}
function ptRanked(dim) {
  if (dim === 'all') ptEnsureCacheAll(); else ptEnsureCacheDim(dim);
  const arr = state.students.filter(s => s.class === state.activeClass).map(s => ({
    s,
    score: dim === 'all' ? ptScoreOfCached(s.id) : (pointsMode === 'conv' ? ptConvScoreCached(s.id, dim) : ptDimScoreCached(s.id, dim))
  }));
  arr.sort((a, b) => b.score - a.score || String(a.s.name).localeCompare(String(b.s.name), 'zh'));
  // 同分并列：积分相同的学生名次并列（100/90/90/80 → 1/2/2/4），否则并列者会一个拿银牌一个拿铜牌
  const scoreOf = {};
  arr.forEach(x => { scoreOf[x.s.id] = x.score; });
  const rankMap = denseRankMap(arr.map(x => x.s.id), id => scoreOf[id]);
  arr.forEach(x => { x.rank = rankMap[x.s.id]; });
  return arr;
}
function ptRecent(days) {
  const start = ptCalcStartDate();
  const cut = new Date();
  cut.setDate(cut.getDate() - days);
  cut.setHours(0, 0, 0, 0);
  const clsStudentIds = new Set(state.students.filter(s => s.class === state.activeClass).map(s => s.id));
  return state.points.logs.filter(l => {
    if (!clsStudentIds.has(l.studentId)) return false;
    const d = ptParseDate(l.date);
    if (!d) return false;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return day.getTime() >= cut.getTime() && day.getTime() >= start.getTime();
  });
}
function ptDeltaCls(d) { return d >= 0 ? 'text-red-500' : 'text-emerald-600'; }
function ptDeltaBg(d) { return d >= 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'; }
// 积分数值统一保留 2 位小数
function fmtScore(n) { return (Math.round((+n || 0) * 100) / 100).toFixed(2); }
function ptSigned(d) { return (d >= 0 ? '+' : '') + fmtScore(d); }
function ptStudentName(sid) { const s = state.students.find(x => x.id === sid); return s ? s.name : '（已删除学生）'; }
// ===== 折算：各维度原始分最高分映射到设置的折算满分 =====
function ptConvDim(sid, dim) { ptEnsureCacheDim(dim); return (_ptCache.conv[dim] && _ptCache.conv[dim][sid]) || 0; }
function ptConvTotal(sid) { ptEnsureCacheAll(); return _ptCache.totalConv[sid] || 0; }
function ptRawTotal(sid) { ptEnsureCacheAll(); return _ptCache.totalRaw[sid] || 0; }

function ptRefreshTabs() {
  document.querySelectorAll('[data-pt-tab]').forEach(b => {
    const on = b.getAttribute('data-pt-tab') === pointsTab;
    b.className = `px-4 py-1.5 rounded-full text-sm transition ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-primary/10'}`;
  });
}
function ptRefreshMode() {
  document.querySelectorAll('[data-pt-mode]').forEach(b => {
    const on = b.getAttribute('data-pt-mode') === pointsMode;
    b.className = `px-3 py-1.5 rounded-full ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`;
  });
}
function ptRefreshCards() {
  POINT_DIMS.forEach(d => {
    const el = document.querySelector(`[data-pt-card="${d.id}"]`);
    if (el) el.textContent = fmtScore(pointsMode === 'conv' ? ptClassConvSum(d.id) : ptClassSum(d.id));
  });
}
function ptRefreshList() {
  const el = document.getElementById('pt-list');
  if (el) el.innerHTML = renderPtList();
}
function setPtTab(t) { pointsTab = t; ptRefreshTabs(); ptRefreshList(); }
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
    const st = dimStyle(d.id);
    ptEnsureCacheDim(d.id); // 首次进入自动计算一次，之后保持缓存直到手动刷新
    const dirty = ptIsDimDirty(d.id);
    const sum = pointsMode === 'conv' ? ptClassConvSum(d.id) : ptClassSum(d.id);
    const active = pointsTab === d.id;
    const dirtyBadge = dirty ? `<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-medium">有更新</span>` : '';
    const refreshBtn = `<button class="text-[10px] px-1.5 py-0.5 rounded transition ${dirty ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-white/60 text-gray-400 hover:text-gray-600'}" onclick="event.stopPropagation(); ptRefreshDim('${d.id}')" title="刷新${d.label}">${dirty ? '↻ 刷新' : '↻'}</button>`;
    return `<div class="cursor-pointer rounded-2xl p-4 border ${active ? 'border-primary shadow-sm' : 'border-transparent'} ${st.bg} card-hover" onclick="setPtTab('${d.id}')">
      <div class="flex items-center justify-between">
        <div class="text-xs ${st.text} font-medium">${d.icon} ${d.label}${dirtyBadge}</div>
        ${refreshBtn}
      </div>
      <div class="text-2xl font-bold ${st.text} mt-1" data-pt-card="${d.id}">${fmtScore(sum)}</div>
      <div class="text-[10px] text-gray-400 mt-0.5">全班累计${dirty ? ' · 上次刷新后数据有变化' : ''}</div>
    </div>`;
  }).join('');

  const tabs = [{ id: 'all', label: '总分排行', icon: '🏅' }].concat(POINT_DIMS).map(t =>
    `<button class="px-4 py-1.5 rounded-full text-sm transition ${pointsTab === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-primary/10'}" data-pt-tab="${t.id}" onclick="setPtTab('${t.id}')">${t.icon} ${t.label}</button>`
  ).join('');

  const modeToggle = `<div class="flex gap-1 text-xs">
    <button class="px-3 py-1.5 rounded-full ${pointsMode==='conv'?'bg-primary text-white':'bg-gray-100 text-gray-600'}" data-pt-mode="conv" onclick="setPtMode('conv')">折算分</button>
    <button class="px-3 py-1.5 rounded-full ${pointsMode==='raw'?'bg-primary text-white':'bg-gray-100 text-gray-600'}" data-pt-mode="raw" onclick="setPtMode('raw')">原始分</button>
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
          <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openAttendanceBonusModal()">🏅 全勤结算</button>
          <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openPtImport()">⬆️ 导入Excel</button>
          <input data-lock-allow value="${esc(pointsQuery)}" oninput="ptFilter(this.value)" placeholder="🔍 搜索学生姓名" class="border rounded-full px-4 py-1.5 text-sm w-40 focus:outline-none focus:border-primary">
        </div>
      </div>
      <div id="pt-list" class="space-y-2">${renderPtList()}</div>
    </div>
  </div>`;
}

function renderPtList() {
  const dim = pointsTab;
  // 下面要逐行显示每人的总分与四个维度分。先一次性把缓存准备好，
  // 否则每行都会各自调一次 ptEnsureCacheAll（实测 50 行 × 5 次签名 = 250 次）。
  ptEnsureCacheAll();
  ptWarmDims();
  let list = ptRanked(dim);
  if (pointsQuery.trim()) {
    const q = pointsQuery.trim().toLowerCase();
    list = list.filter(x => String(x.s.name).toLowerCase().includes(q) || String(x.s.class || '').toLowerCase().includes(q));
  }
  if (!list.length) return '<div class="text-sm text-gray-400 py-6 text-center">没有匹配的学生</div>';
  const maxAbs = Math.max(1, ...list.map(x => Math.abs(x.score)));
  const medals = ['🥇', '🥈', '🥉'];
  return list.map((x, i) => {
    const rk = x.rank || (i + 1);   // 优先用并列后的名次；搜索过滤时退回行号
    const rankShow = pointsQuery.trim() ? `<span class="text-xs text-gray-400">#${i + 1}</span>` : (medals[rk - 1] || `<span class="text-xs text-gray-400 font-medium">${rk}</span>`);
    const pills = dim === 'all'
      ? POINT_DIMS.map(d => { const st = dimStyle(d.id); const v = pointsMode === 'conv' ? ptConvScoreCached(x.s.id, d.id) : ptDimScoreCached(x.s.id, d.id);
          return `<span class="text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.text}" title="${d.label}">${d.icon}${fmtScore(v)}</span>`; }).join('')
      : '';
    const w = Math.round(Math.abs(x.score) / maxAbs * 100);
    const barCls = dim === 'all' ? 'bg-primary/60' : dimStyle(dim).bar;
    return `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-primary/5 transition">
      <div class="w-7 text-center text-lg shrink-0">${rankShow}</div>
      <img src="${esc(x.s.avatar)}" class="w-9 h-9 rounded-full bg-white shrink-0" alt="">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-gray-800 text-sm cursor-pointer hover:text-primary" onclick="openPtStudent('${x.s.id}')">${esc(x.s.name)}</span>
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
          ${state.students.filter(s => s.class === state.activeClass).map(s => `<option value="${s.id}" ${sid === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select></div>
      <div><label class="block text-xs text-gray-500 mb-1">积分维度</label>
        <select id="ptDim" data-lock-allow class="w-full border rounded-lg p-2 text-sm" onchange="ptRenderRuleChips()">
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
function ptWriteLog(studentId, dim, delta, reason, batchId, auto, date) {
  state.points.logs.unshift({
    id: uid(), ts: Date.now(), date: date || nowStamp(), studentId,
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
          ${state.students.filter(s => s.class === state.activeClass).map(s => `<label class="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" class="pt-batch-st accent-primary" value="${s.id}"><span>${esc(s.name)}</span></label>`).join('')}
        </div>
      </div>
      <div><label class="block text-xs text-gray-500 mb-1">积分维度</label>
        <select id="ptDim" data-lock-allow class="w-full border rounded-lg p-2 text-sm" onchange="ptRenderRuleChips()">
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
        ${rs.length ? rs.map(r => `<div class="flex flex-col gap-1 text-sm p-2 rounded-lg bg-gray-50">
          <div class="flex items-center gap-2">
            <span class="flex-1">${esc(r.label)}</span>
            <span class="font-bold ${ptDeltaCls(r.delta)}">${ptSigned(r.delta)}</span>
            <button class="text-gray-300 hover:text-red-500" onclick="deletePtRule('${r.id}')">🗑️</button>
          </div>
          <div class="text-[11px] text-gray-400">识别词：${esc((r.keywords || []).join(' / ') || '无')}</div>
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
        <div>
          <div class="text-xs text-gray-500 mb-1">识别关键词（每行一个，快速记录识别到后自动按本规则加减分）</div>
          <textarea id="ruleKeywords" rows="2" class="w-full border rounded-lg p-2 text-sm" placeholder="例如：迟到\n早退"></textarea>
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
  const keywords = (document.getElementById('ruleKeywords').value || '').split(/\n|、|,|\s+/).map(k => k.trim()).filter(Boolean);
  if (!label) return alert('请输入规则名称');
  if (!delta) return alert('分值不能为 0');
  state.points.rules.push({ id: uid(), dim, label, delta, keywords });
  save(); openPtRules();
}
function deletePtRule(id) {
  state.points.rules = state.points.rules.filter(r => r.id !== id);
  save(); openPtRules();
}

// ===================== 折算设置 =====================
function openConvertSettings() {
  const rows = POINT_DIMS.map(d => {
    const st = dimStyle(d.id);
    const v = state.convertRatios[d.id] != null ? state.convertRatios[d.id] : 0;
    return `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
      <span class="flex-1 text-sm ${st.text} font-medium">${d.icon} ${d.label}</span>
      <span class="text-xs text-gray-400">最高分映射到</span>
      <input id="conv_${d.id}" type="number" step="0.01" value="${v}" class="w-20 border rounded p-1.5 text-sm">
      <span class="text-xs text-gray-400">分（0=不折算）</span>
    </div>`;
  }).join('');
  openModal('积分折算设置', `
    <div class="space-y-3">
      <p class="text-xs text-gray-500 leading-relaxed">每个维度取当前学生的原始分最高分，映射到下面设置的「折算满分」，其余学生按比例折算；设置 0 表示不折算，负分保留原始值。例如：体育原始分最高 213、折算满分 80 → 该生得 80 分，其他人按 213→80 的比例折算。总分 = 各维度折算分之和。</p>
      ${rows}
      <div class="flex gap-2">
        <button class="flex-1 bg-gray-100 text-gray-600 py-2 rounded-full hover:bg-gray-200 text-sm" onclick="setConvertPreset(100)" title="四维度均设为 100，单模块封顶 25%">⚖️ 一键均衡</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveConvertSettings()">保存折算设置</button>
      </div>
    </div>`, 'md');
}
// 一键预设：把四个维度折算满分统一设为 v（默认 100=均衡），立即保存
function setConvertPreset(v) {
  POINT_DIMS.forEach(d => { const el = document.getElementById('conv_' + d.id); if (el) el.value = v; });
  saveConvertSettings();
}
function saveConvertSettings() {
  POINT_DIMS.forEach(d => {
    const v = parseFloat(document.getElementById('conv_' + d.id).value);
    state.convertRatios[d.id] = isNaN(v) ? 0 : v;
  });
  save(); closeModal(); render();
}

// ===================== 积分 Excel / CSV 导入（按维度按姓名累加）=====================
function openPtImport() {
  const today = attDateKey(new Date());
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
        <label class="block text-xs text-gray-500 mb-1">积分日期</label>
        <input id="ptImpDate" type="date" value="${today}" class="w-full border rounded-lg p-2 text-sm">
        <p class="text-[11px] text-gray-400 mt-1">默认今天。若下方数据含第三列日期，则以该列日期为准。</p>
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">粘贴 / 上传数据</label>
        <p class="text-[11px] text-gray-400 mb-1">每行一个：<code>姓名,分值</code> 或 <code>姓名,分值,日期</code>（制表符或逗号分隔）。按姓名匹配学生，累加分值。首行若是标题自动跳过。</p>
        <textarea id="ptImpText" rows="8" class="w-full border rounded-lg p-3 text-sm" placeholder="张明轩,5&#10;王浩然,3&#10;李思雨,-2,2026-08-01"></textarea>
        <div class="mt-2"><input id="ptImpFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button class="border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('ptImpText').value='姓名,分值,日期（可选）\\n张明轩,5\\n王浩然,3\\n李思雨,-2,2026-08-01'">填入示例</button>
        <button class="bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="doPtImport()">导入并累加</button>
      </div>
    </div>`, 'lg');
  bindFileToText('ptImpFile', 'ptImpText');
}
function doPtImport() {
  const dim = document.getElementById('ptImpDim').value;
  const defaultDate = document.getElementById('ptImpDate').value.trim() || attDateKey(new Date());
  const text = document.getElementById('ptImpText').value.trim();
  if (!text) return alert('请粘贴或上传积分数据');
  const rows = parseCSV(text);
  let start = 0;
  if (rows.length && /姓名|name|学生|名字/.test(rows[0][0])) start = 1;
  let matched = 0, unmatched = [];
  const batchId = uid();
  for (let i = start; i < rows.length; i++) {
    const name = (rows[i][0] || '').trim();
    const val = parseFloat(rows[i][1]);
    if (!name || isNaN(val)) continue;
    const stu = state.students.find(s => s.name === name && s.class === state.activeClass);
    if (!stu) { unmatched.push(name); continue; }
    const rowDate = (rows[i][2] || '').trim();
    const date = ptParseDate(rowDate) ? rowDate : defaultDate;
    ptWriteLog(stu.id, dim, val, `Excel导入`, batchId, '', date);
    matched++;
  }
  if (!matched) return alert('没有匹配到任何当前班级的学生，请检查姓名是否与「学生管理」一致。');
  // 起始日过滤警告：日志日期早于「积分计算起始日」会被过滤不计分
  let warn = '';
  const sd = ptCalcStartDate();
  if (sd) {
    const sdDay = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
    let filtered = 0;
    for (let i = start; i < rows.length; i++) {
      const name = (rows[i][0] || '').trim();
      const val = parseFloat(rows[i][1]);
      if (!name || isNaN(val)) continue;
      const stu = state.students.find(s => s.name === name && s.class === state.activeClass);
      if (!stu) continue;
      const rowDate = (rows[i][2] || '').trim();
      const d = ptParseDate(rowDate);
      if (d && d < sdDay) filtered++;
    }
    if (filtered > 0) warn = `\n⚠️ 有 ${filtered} 条日志日期早于「积分计算起始日(${state.points.calcStartDate})」，将被过滤不计分；如需计入请先把起始日调早。`;
  }
  // 导入即生成快照
  takeSnapshot('import');
  save(); closeModal();
  render();
  let msg = `成功导入 ${matched} 条（${dimLabel(dim)}）。`;
  if (unmatched.length) msg += `\n未匹配（姓名不存在或非当前班级）：${unmatched.join('、')}`;
  msg += warn;
  alert(msg);
}

// ===================== 历史快照（按日期回看积分榜）=====================
function takeSnapshot(type) {
  const date = new Date().toISOString().slice(0, 10);
  const ranking = state.students.filter(s => s.class === state.activeClass).map(s => ({ name: s.name, score: ptScoreOf(s.id), raw: ptRawTotal(s.id) }))
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
function delSnapshot(id) { state.snapshots = state.snapshots.filter(x => x.id !== id); markDeletedId('snapshots', id); save(); openPtHistory(); }

// ===================== 体育管理（打卡 + 早操 · 基线抵扣模型）=====================
// 模型：每天自动获得「打卡 +2 + 出操 +2」基线分（计入体育维度），只登记异常负分对冲：
//   早操迟到 -3（当天净+1）· 早操请假 -2（净+2，留痕不罚）· 早操缺勤 -4（净0）· 未打卡 -2（丢打卡分）
// 计分窗口按月：本月1日 ~ 今天（不早于起始日），跨月自动重置，上月日志保留可查但不计分。
const SPORT_EVENTS = {
  noclock: { label: '未打卡',  delta: -2, icon: '🌙', hint: '昨天晚上没有完成体育打卡（丢掉当天打卡分）', defDate: 'yesterday', recType: 'critic' },
  late:    { label: '早操迟到', delta: -3, icon: '⏰', hint: '早操迟到（当天净 +1）', defDate: 'today', recType: 'critic' },
  leave:   { label: '早操请假', delta: -2, icon: '🏥', hint: '早操请假（不奖不罚，留痕；不写入当天考勤）', defDate: 'today', recType: 'leave' },
  absent:  { label: '早操缺勤', delta: -4, icon: '❌', hint: '无故缺勤（当天净 0）', defDate: 'today', recType: 'critic' },
};
function sportEvtOf(reason) {
  for (const k in SPORT_EVENTS) { if (String(reason || '').includes(SPORT_EVENTS[k].label)) return k; }
  return '';
}
function renderSport() {
  const cfg = sportCfg();
  const w = sportWindow();
  const bl = sportBaselineInfo(w.start, w.end);
  const cls = state.students.filter(s => s.class === state.activeClass);
  const clsIds = new Set(cls.map(s => s.id));
  // 本月窗口内的体育日志（异常为主，正向加分也会显示）
  const logs = (state.points.logs || []).filter(l => l && l.dim === 'sport' && clsIds.has(l.studentId) && sportLogEffective(l));
  const anom = logs.filter(l => (l.delta || 0) < 0);
  const anomSum = ptSum(anom);
  const posSum = ptSum(logs.filter(l => (l.delta || 0) > 0));
  // 按学生聚合异常次数
  const anomByStu = {};
  anom.forEach(l => { anomByStu[l.studentId] = (anomByStu[l.studentId] || 0) + 1; });
  const anomStus = Object.keys(anomByStu).map(sid => ({
    s: cls.find(x => x.id === sid),
    n: anomByStu[sid],
  })).filter(x => x.s).sort((a, b) => b.n - a.n);
  const cleanN = cls.length - anomStus.length;
  const monthLabel = `${w.start.getMonth() + 1}月`;
  const yday = new Date(); yday.setDate(yday.getDate() - 1);

  const stat = (icon, label, value, sub, cls2) => `
    <div class="bg-card rounded-2xl shadow-sm p-4 card-hover">
      <div class="flex items-center gap-2 text-xs text-gray-500">${icon} ${label}</div>
      <div class="text-2xl font-bold mt-1 ${cls2 || 'text-gray-800'}">${value}</div>
      <div class="text-[11px] text-gray-400 mt-0.5">${sub}</div>
    </div>`;

  const inputCard = (kind) => {
    const ev = SPORT_EVENTS[kind];
    const defDate = ev.defDate === 'yesterday' ? todayISO(yday) : todayISO();
    return `<div class="bg-card rounded-2xl shadow-sm p-4">
      <div class="flex items-center justify-between mb-1">
        <div class="font-bold text-gray-700 text-sm">${ev.icon} 登记${ev.label}</div>
        <span class="text-[11px] px-2 py-0.5 rounded-full ${ev.delta < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}">${ev.delta} 分</span>
      </div>
      <p class="text-[11px] text-gray-400 mb-2">${ev.hint}</p>
      <textarea id="spNames_${kind}" rows="2" class="w-full border rounded-lg p-2 text-sm" placeholder="学生姓名，用逗号/顿号/空格/换行分隔，可一次多人"></textarea>
      <div class="flex items-center gap-2 mt-2">
        <label class="text-xs text-gray-500">日期</label>
        <input id="spDate_${kind}" type="date" value="${defDate}" class="border rounded px-2 py-1 text-xs">
        <button class="ml-auto bg-primary text-white text-sm px-4 py-1.5 rounded-full hover:bg-primaryDark" onclick="sportQuickSave('${kind}')">记录</button>
      </div>
    </div>`;
  };

  const logRows = logs.slice(0, 60).map(l => {
    const evt = sportEvtOf(l.reason);
    const ev = evt ? SPORT_EVENTS[evt] : null;
    return `<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg ${l.delta < 0 ? 'bg-red-50/60' : 'bg-emerald-50/60'} text-sm">
      <span class="text-xs text-gray-400 w-[118px] shrink-0">${esc(String(l.date || '').slice(0, 10))}</span>
      <span class="font-medium w-16 shrink-0 truncate">${esc(l.studentName || ptStudentName(l.studentId))}</span>
      <span class="flex-1 truncate text-gray-600">${ev ? ev.icon + ' ' + ev.label : esc(l.reason || '')}</span>
      <span class="font-bold ${ptDeltaCls(l.delta)} w-12 text-right">${ptSigned(l.delta)}</span>
      <button class="text-gray-300 hover:text-red-500 text-xs" onclick="sportDelLog('${l.id}')" title="撤销这条">✕</button>
    </div>`;
  }).join('') || `<div class="text-sm text-gray-400 py-6 text-center">本月窗口内还没有体育记录 —— 全班默认全勤，基线分照常累计。</div>`;

  const anomChips = anomStus.length ? anomStus.map(x =>
    `<span class="px-2.5 py-1 rounded-full bg-red-50 text-red-500 text-xs">${esc(x.s.name)} ×${x.n}</span>`).join('') :
    `<span class="text-xs text-emerald-600">🎉 本月全班无异常</span>`;

  const noExList = (cfg.noExerciseDays || []).slice().sort().map((d, i) =>
    `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">${esc(String(d).slice(0, 10))}
      <button class="text-gray-300 hover:text-red-500" onclick="sportDelNoEx(${i})">✕</button></span>`).join('')
    || `<span class="text-xs text-gray-400">暂无（法定节假日/停操日在此登记，当天不计早操基线）</span>`;

  return `<div class="space-y-4">
    <div class="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 text-sm text-gray-600 leading-relaxed">
      <b class="text-emerald-700">🏃 基线抵扣模型</b>：每天自动计入 <b>打卡 +${cfg.checkinPts}（每个日历天，含周末节假日）</b> + <b>出操 +${cfg.exercisePts}（每个工作日）</b>，
      无需逐日记录；只登记异常（负分对冲）。${monthLabel}窗口：${todayISO(w.start)} ~ 今天 · 起始日 ${esc(cfg.startDate)}。
      <span class="text-gray-400">跨月自动重置，上月记录保留可查但不计分。也可继续用首页「一句话记录」输入「张三、李四早操迟到」等。</span>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${stat('📅', '本月基线分', '+' + fmtScore(bl.total), `打卡 ${bl.checkinDays}天×${cfg.checkinPts} + 出操 ${bl.exerciseDays}天×${cfg.exercisePts}`, 'text-emerald-600')}
      ${stat('⚠️', '本月异常扣分', fmtScore(anomSum), `共 ${anom.length} 条`, anomSum < 0 ? 'text-red-500' : 'text-gray-800')}
      ${stat('👍', '本月额外加分', '+' + fmtScore(posSum), '体育课表现等正向记录', 'text-amber-600')}
      ${stat('🏅', '本月暂无异常', cleanN + '/' + cls.length, '体育全勤判定标准不变', cleanN === cls.length ? 'text-emerald-600' : 'text-gray-800')}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      ${inputCard('noclock')}
      <div class="bg-card rounded-2xl shadow-sm p-4">
        <div class="font-bold text-gray-700 text-sm mb-1">🌅 早操异常登记</div>
        <p class="text-[11px] text-gray-400 mb-2">选择异常类型，一次粘贴多人名单。</p>
        <div class="flex flex-wrap gap-2 mb-2">
          ${['late','leave','absent'].map((k, i) => {
            const ev = SPORT_EVENTS[k];
            return `<label class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="spEvt" value="${k}" ${i === 0 ? 'checked' : ''} class="accent-primary">
              ${ev.icon} ${ev.label} <span class="text-xs ${ptDeltaCls(ev.delta)}">${ev.delta}</span>
            </label>`;
          }).join('')}
        </div>
        <textarea id="spNames_ex" rows="2" class="w-full border rounded-lg p-2 text-sm" placeholder="学生姓名，用逗号/顿号/空格/换行分隔，可一次多人"></textarea>
        <div class="flex items-center gap-2 mt-2">
          <label class="text-xs text-gray-500">日期</label>
          <input id="spDate_ex" type="date" value="${todayISO()}" class="border rounded px-2 py-1 text-xs">
          <button class="ml-auto bg-primary text-white text-sm px-4 py-1.5 rounded-full hover:bg-primaryDark" onclick="sportQuickSave('ex')">记录</button>
        </div>
      </div>
    </div>

    <div class="bg-card rounded-2xl shadow-sm p-4">
      <div class="flex items-center justify-between mb-2">
        <div class="font-bold text-gray-700 text-sm">📋 本月体育记录（前 60 条）</div>
        <button class="text-xs text-primary hover:underline" onclick="openPtLogs()">在积分日志中管理</button>
      </div>
      <div class="space-y-1 max-h-72 overflow-y-auto">${logRows}</div>
    </div>

    <div class="bg-card rounded-2xl shadow-sm p-4 space-y-3">
      <div class="font-bold text-gray-700 text-sm">🚫 无早操日（不计出操基线）</div>
      <div class="flex flex-wrap gap-2 items-center">
        ${noExList}
        <button class="text-xs text-primary border border-primary px-2.5 py-1 rounded-full hover:bg-primary/5" onclick="openSportCfg()">+ 登记日期</button>
      </div>
      <div class="text-xs text-gray-500 pt-1 border-t">
        本月有异常的学生：${anomChips}
      </div>
    </div>
  </div>`;
}
// 体育管理页快捷登记：按类型写体育维度负分日志 + 班级日志汇总（不写学生行为档案，避免与一句话记录重复）
function sportQuickSave(kind) {
  const isEx = kind === 'ex';
  if (isEx) {
    const sel = document.querySelector('input[name="spEvt"]:checked');
    kind = sel ? sel.value : 'late';
  }
  const ev = SPORT_EVENTS[kind];
  if (!ev) return;
  const namesEl = document.getElementById('spNames_' + (isEx ? 'ex' : kind));
  const dateEl = document.getElementById('spDate_' + (isEx ? 'ex' : kind));
  const names = String((namesEl && namesEl.value) || '').split(/[,，、;；\s\n]+/).map(x => x.trim()).filter(Boolean);
  const dateStr = (dateEl && dateEl.value) || todayISO();
  if (!names.length) return alert('请输入学生姓名（可一次多人，用逗号或空格分隔）');
  const cls = state.students.filter(s => s.class === state.activeClass);
  const matched = [], unmatched = [];
  names.forEach(n => {
    const stu = cls.find(s => s.name === n);
    if (!stu) { unmatched.push(n); return; }
    matched.push(stu);
  });
  if (!matched.length) return alert('未匹配到学生：' + unmatched.join('、') + '（请检查姓名与「学生管理」一致）');
  const batchId = uid();
  const stamp = dateStr + ' ' + new Date().toTimeString().slice(0, 8);
  matched.forEach(stu => ptWriteLog(stu.id, 'sport', ev.delta, `体育·${ev.label}`, batchId, 'sportmod', stamp));
  state.classLogs.unshift({ id: uid(), date: nowStamp(), ts: Date.now(), content: `体育管理：${matched.map(s => s.name).join('、')} ${ev.label}（${ev.delta}分/人）` });
  save(); render();
  let msg = `已记录：${matched.map(s => s.name).join('、')} ${ev.label}（${ev.delta} 分/人）`;
  if (unmatched.length) msg += `\n未匹配（跳过）：${unmatched.join('、')}`;
  alert(msg);
}
function sportDelLog(id) {
  const l = (state.points.logs || []).find(x => x.id === id);
  if (!l) return;
  if (!confirm(`撤销这条记录？\n${l.studentName} ${l.reason} ${ptSigned(l.delta)}`)) return;
  state.points.logs = state.points.logs.filter(x => x.id !== id);
  save(); render();
  toast('已撤销');
}
// 体育模块设置：起始日 / 每日分值 / 无早操日
function openSportCfg() {
  const cfg = sportCfg();
  const noExRows = (cfg.noExerciseDays || []).slice().sort().map((d, i) =>
    `<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 text-sm">
      <span class="flex-1">${esc(String(d).slice(0, 10))}</span>
      <button class="text-gray-300 hover:text-red-500 text-xs" onclick="sportDelNoEx(${i})">✕ 删除</button>
    </div>`).join('') || '<div class="text-xs text-gray-400">暂无登记</div>';
  openModal('体育模块设置', `
    <div class="space-y-4">
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 leading-relaxed">
        基线抵扣模型：体育总分 = 基线分（自动累计）+ 窗口内异常日志。按月自动重置。
        调整分值后，异常日志的固定分值（迟到-3/请假-2/缺勤-4/未打卡-2）不会自动变化，如需同步请在「积分管理 ⚙️ 规则」中修改。
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="block text-xs text-gray-500 mb-1">基线起算日</label>
          <input id="spCfgStart" type="date" value="${esc(cfg.startDate)}" class="w-full border rounded-lg p-2 text-sm"></div>
        <div><label class="block text-xs text-gray-500 mb-1">打卡分/天（含周末）</label>
          <input id="spCfgCheckin" type="number" step="0.5" min="0" value="${cfg.checkinPts}" class="w-full border rounded-lg p-2 text-sm"></div>
        <div><label class="block text-xs text-gray-500 mb-1">出操分/工作日</label>
          <input id="spCfgExercise" type="number" step="0.5" min="0" value="${cfg.exercisePts}" class="w-full border rounded-lg p-2 text-sm"></div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs text-gray-500">无早操日（法定节假日 / 停操，当天不计出操基线）</label>
          <button class="text-xs text-primary border border-primary px-2.5 py-1 rounded-full hover:bg-primary/5" onclick="sportAddNoEx()">+ 登记日期</button>
        </div>
        <div class="space-y-1 max-h-40 overflow-y-auto">${noExRows}</div>
      </div>
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveSportCfg()">保存设置</button>
    </div>`, 'lg');
}
function sportAddNoEx() {
  const v = prompt('登记无早操日（格式 2026-10-01，可一次多个，用逗号分隔）：', todayISO());
  if (!v) return;
  const days = v.split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean).map(x => {
    const d = ptParseDate(x);
    return d ? todayISO(d) : null;
  }).filter(Boolean);
  if (!days.length) return alert('日期格式无法识别，请用 2026-10-01 这样的格式');
  const set = new Set((state.sportModule && state.sportModule.noExerciseDays) || []);
  days.forEach(d => set.add(d));
  state.sportModule = Object.assign({}, state.sportModule, { noExerciseDays: Array.from(set) });
  save(); openSportCfg();
}
function sportDelNoEx(i) {
  if (!state.sportModule || !Array.isArray(state.sportModule.noExerciseDays)) return;
  const sorted = state.sportModule.noExerciseDays.slice().sort();
  const target = sorted[i];
  state.sportModule.noExerciseDays = state.sportModule.noExerciseDays.filter(d => d !== target);
  save(); render(); openSportCfg();
}
function saveSportCfg() {
  const start = document.getElementById('spCfgStart').value;
  const checkin = parseFloat(document.getElementById('spCfgCheckin').value);
  const exercise = parseFloat(document.getElementById('spCfgExercise').value);
  if (!start) return alert('请选择基线起算日');
  if (isNaN(checkin) || checkin < 0 || isNaN(exercise) || exercise < 0) return alert('分值需为不小于 0 的数字');
  state.sportModule = Object.assign({}, state.sportModule, {
    startDate: start,
    checkinPts: checkin,
    exercisePts: exercise,
    noExerciseDays: (state.sportModule && state.sportModule.noExerciseDays) || [],
  });
  save(); closeModal(); render();
  toast('体育模块设置已保存');
}



const EXAM_SUBJECT = '数学';
let examTab = 'analysis'; // analysis | manage
let examSelectedStudent = ''; // 当前在榜单中选中的学生
// 智能导入向导状态
let eiBook = null, eiSheets = [], eiSheetName = '', eiRows = [], eiHeaders = [];
let eiNameCol = -1, eiClassCol = -1, eiColMap = {}, eiHeaderRow = 1, eiExamId = '';
// 成绩查询页状态（仅 UI 偏好，不持久化）
let eqExamId = '', eqClassIds = [], eqSearch = '', eqSortCol = '', eqSortDesc = false, eqHiddenCols = new Set(), eqPinnedKey = '';
// 公示列开关（仅 UI 偏好，不持久化）
let examAnalysisColumns = {
  score: true,
  classRank: true,
  gradeRank: false,
  grade: true,
  pass: false,
  good: false,
  classAvgDiff: false,
  gradeAvgDiff: false,
  totalScore: false,
  totalRank: false,
};
function toggleExamCol(key) {
  if (examAnalysisColumns.hasOwnProperty(key)) examAnalysisColumns[key] = !examAnalysisColumns[key];
  render();
}
// ---------- 列配置（科目 / 预设列）相关 ----------
function examColumns() { return state.examData.columns || defaultExamColumns(); }
// 安全读取考试班级列表：examData 结构被破坏时（异常导入 / 旧备份）返回空数组而不是崩掉整页
function examClassesSafe() { return (state.examData && Array.isArray(state.examData.classes)) ? state.examData.classes.filter(Boolean) : []; }
// examData 结构兜底：旧备份 / 手工导入可能让整块为 null 或某个字段不是数组，
// 这里按"缺什么补什么"原地修复后再返回，避免一个坏字段让好几页一起白屏。
function examDataSafe() {
  const ed = (state.examData && typeof state.examData === 'object') ? state.examData : (state.examData = {});
  if (!Array.isArray(ed.classes)) ed.classes = [];
  if (!Array.isArray(ed.exams)) ed.exams = [];
  if (!Array.isArray(ed.records)) ed.records = [];
  if (!Array.isArray(ed.subjects)) ed.subjects = [];
  if (!Array.isArray(ed.columns)) ed.columns = [];
  return ed;
}
function examScoreColumns() { return examColumns().filter(c => c.type === 'score' && c.enabled); }
function examRankColumns() { return examColumns().filter(c => c.type === 'rank' && c.enabled); }
// 合计类科目名：这些列本身就是各科之和，任何「求总分」的场合都要排除，否则总分翻倍
const TOTAL_SCORE_SUBJECTS = new Set(['总分', '总得分', '总成绩', '合计', '总分合计', 'total']);
function examColumnByKey(key) { return examColumns().find(c => c.key === key); }
function addExamColumn(key, type) {
  key = (key || '').trim(); if (!key) return false;
  if (!state.examData.columns) state.examData.columns = defaultExamColumns();
  if (state.examData.columns.some(c => c.key === key)) return false;
  state.examData.columns.push({ key, type: type === 'rank' ? 'rank' : 'score', enabled: true });
  return true;
}
function removeExamColumn(key) {
  if (!state.examData.columns) return;
  state.examData.columns = state.examData.columns.filter(c => c.key !== key);
  state.examData.records = state.examData.records.filter(r => r.subject !== key);
}
function toggleExamColumnEnabled(key) {
  const c = examColumnByKey(key); if (c) c.enabled = !c.enabled;
}
function renameExamColumn(oldKey, newKey) {
  newKey = (newKey || '').trim(); if (!newKey || !oldKey) return false;
  const c = examColumnByKey(oldKey); if (!c) return false;
  c.key = newKey;
  state.examData.records.forEach(r => { if (r.subject === oldKey) r.subject = newKey; });
  return true;
}

function openColumnManager() {
  const old = document.getElementById('cmRows');
  const scrollTop = old ? old.scrollTop : 0;
  const scrollLeft = old ? old.scrollLeft : 0;
  const cols = examColumns();
  const rows = cols.map((c, i) => `
    <div class="flex items-center gap-2 py-2 border-b last:border-0" data-key="${esc(c.key)}">
      <div class="flex flex-col gap-0.5">
        <button class="text-gray-400 hover:text-primary leading-none ${i === 0 ? 'opacity-30 cursor-not-allowed' : ''}" ${i === 0 ? '' : `onclick="cmMoveUp('${esc(c.key)}')"`} title="上移">▲</button>
        <button class="text-gray-400 hover:text-primary leading-none ${i === cols.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}" ${i === cols.length - 1 ? '' : `onclick="cmMoveDown('${esc(c.key)}')"`} title="下移">▼</button>
      </div>
      <input class="flex-1 border rounded-lg p-2 text-sm" value="${esc(c.key)}" onchange="cmRename('${esc(c.key)}', this.value)">
      <select class="border rounded-lg p-2 text-sm" onchange="cmSetType('${esc(c.key)}', this.value)">
        <option value="score" ${c.type === 'score' ? 'selected' : ''}>分数科目</option>
        <option value="rank" ${c.type === 'rank' ? 'selected' : ''}>排名列</option>
      </select>
      <label class="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap"><input type="checkbox" ${c.enabled ? 'checked' : ''} onchange="cmToggleEnabled('${esc(c.key)}')"> 启用</label>
      <button class="text-gray-300 hover:text-red-500 px-1" onclick="cmRemove('${esc(c.key)}')">🗑️</button>
    </div>`).join('');
  openModal('⚙️ 预设列管理（科目 / 排名列）', `
    <div class="space-y-3">
      <p class="text-xs text-gray-500">可手动增删科目与排名列；新建后，导入 / 单条录入 / 分析筛选中即可选用。删除会一并清除该列已有的成绩记录。列的上下顺序会同步到「成绩查询」的列顺序。</p>
      <div id="cmRows" class="max-h-72 overflow-y-auto">${rows || '<p class="text-xs text-gray-400">暂无列，请在下方添加。</p>'}</div>
      <div class="flex gap-2 pt-1">
        <input id="cmNewKey" class="flex-1 border rounded-lg p-2 text-sm" placeholder="新列名称，如：道法">
        <select id="cmNewType" class="border rounded-lg p-2 text-sm"><option value="score">分数科目</option><option value="rank">排名列</option></select>
        <button class="bg-primary text-white px-4 rounded-lg text-sm hover:bg-primaryDark" onclick="cmAdd()">＋ 添加</button>
      </div>
      <div class="flex gap-2 pt-1">
        <button class="flex-1 border border-emerald-500 text-emerald-600 py-2 rounded-full hover:bg-emerald-50" onclick="cmAddCommon()">⚡ 一键补全常见科目</button>
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal()">完成</button>
      </div>
    </div>`, 'lg');
  if (old) {
    requestAnimationFrame(() => {
      const el = document.getElementById('cmRows');
      if (el) { el.scrollTop = scrollTop; el.scrollLeft = scrollLeft; }
    });
  }
}
function cmAdd() {
  const key = (document.getElementById('cmNewKey').value || '').trim();
  const type = document.getElementById('cmNewType').value;
  if (!key) return;
  if (!addExamColumn(key, type)) { alert('已存在同名列，或名称为空'); return; }
  save(); openColumnManager();
}
function cmRemove(key) {
  if (!confirm('删除列「' + key + '」？其下所有成绩记录也会一并删除。')) return;
  removeExamColumn(key); save(); openColumnManager();
}
function cmRename(oldKey, newKey) {
  if (!renameExamColumn(oldKey, newKey)) { alert('重命名失败：名称重复或为空'); openColumnManager(); return; }
  save(); openColumnManager();
}
function cmSetType(key, type) {
  const c = examColumnByKey(key); if (!c) return;
  c.type = type; save(); openColumnManager();
}
function cmToggleEnabled(key) {
  toggleExamColumnEnabled(key); save();
}
// 一键补全常见科目/排名列（只加标准科目，绝不自动添加带百分比、折合等自定义杂列）
function cmAddCommon() {
  const common = [
    { key: '语文', type: 'score' }, { key: '数学', type: 'score' }, { key: '英语', type: 'score' },
    { key: '政治', type: 'score' }, { key: '历史', type: 'score' }, { key: '物理', type: 'score' },
    { key: '化学', type: 'score' }, { key: '生物', type: 'score' }, { key: '地理', type: 'score' },
    { key: '道法', type: 'score' }, { key: '体育', type: 'score' }, { key: '总分', type: 'score' },
    { key: '班次', type: 'rank' }, { key: '校次', type: 'rank' }, { key: '县次', type: 'rank' },
  ];
  let added = [];
  common.forEach(c => { if (addExamColumn(c.key, c.type)) added.push(c.key); });
  save(); openColumnManager();
  if (added.length) alert('已补全以下常见科目（均已启用）：\n' + added.join('、') + '\n\n不需要的可取消勾选「启用」或删除。');
  else alert('常见科目已全部存在，无需补全。');
}
function cmMoveUp(key) {
  const cols = state.examData.columns || defaultExamColumns();
  const idx = cols.findIndex(c => c.key === key);
  if (idx <= 0) return;
  [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]];
  save(); openColumnManager();
}
function cmMoveDown(key) {
  const cols = state.examData.columns || defaultExamColumns();
  const idx = cols.findIndex(c => c.key === key);
  if (idx < 0 || idx >= cols.length - 1) return;
  [cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]];
  save(); openColumnManager();
}
function scoreToGrade(score, pass, good) {
  if (score >= good) return 'A';
  if (score >= pass + (good - pass) * 0.5) return 'B';
  if (score >= pass) return 'C';
  return 'D';
}
function scoreToGradeLabel(score, pass, good) {
  if (score >= good) return '优秀';
  if (score >= pass + (good - pass) * 0.5) return '良好';
  if (score >= pass) return '及格';
  return '待及格';
}
function examClassRank(examId, classId, name, subject) {
  const rs = state.examData.records.filter(r => r.examId === examId && r.classId === classId && r.subject === subject).sort((a, b) => b.score - a.score);
  const idx = rs.findIndex(r => r.studentName === name);
  return idx >= 0 ? idx + 1 : null;
}
function examGradeRank(examId, name, subject, classIds) {
  const rs = state.examData.records.filter(r => r.examId === examId && classIds.includes(r.classId) && r.subject === subject).sort((a, b) => b.score - a.score);
  const idx = rs.findIndex(r => r.studentName === name);
  return idx >= 0 ? idx + 1 : null;
}
function examTotalScore(name, subject) {
  return state.examData.records.filter(r => r.studentName === name && r.subject === subject).reduce((a, b) => a + (+b.score || 0), 0);
}
function examTotalRank(name, subject, classIds) {
  const names = new Set();
  state.examData.records.filter(r => classIds.includes(r.classId) && r.subject === subject).forEach(r => names.add(r.studentName));
  const totals = [...names].map(n => ({ name: n, total: examTotalScore(n, subject) }));
  totals.sort((a, b) => b.total - a.total);
  const idx = totals.findIndex(x => x.name === name);
  return idx >= 0 ? idx + 1 : null;
}


function examClass(id) { return state.examData.classes.find(c => c.id === id); }
function examStudentGender(name) {
  const s = (state.students || []).find(x => x.name === name);
  if (s && s.gender) return s.gender;
  const c = (state.examData.classes || []).find(x => x.gender && x.gender[name]);
  return c ? c.gender[name] : '';
}
// 成绩分析班级与学生管理对齐（以学生管理为唯一真相源）
// 1) 学生管理中的每个班级都在成绩分析生成/保留对应班级；
// 2) 学生管理中不存在的班级（及其记录）从成绩分析删除；
// 3) 孤立的成绩记录按学生管理中的班级重新归类。
function syncExamClassesToStudents(s) {
  if (!s.examData || !Array.isArray(s.examData.classes)) return;
  const clsList = (s.classes || []).filter(c => c && (c.id || c.name));
  const byKey = {};
  s.examData.classes.forEach(c => { if (c) byKey[c.name || c.id] = c; });
  const next = [];
  const usedIds = new Set();
  clsList.forEach(c => {
    const id = c.id || c.name, name = c.name || c.id;
    let obj = byKey[name] || { id, name, gender: {} };
    obj.id = id; obj.name = name;
    if (!obj.gender || typeof obj.gender !== 'object') obj.gender = {};
    delete obj.studentNames; // 成绩分析不再自存名单，统一取自学生管理
    usedIds.add(obj.id);
    next.push(obj);
  });
  // 保留导入的全年级参考班级（不在学生管理中）：仅用于算校次 / 年级均分，不进入本班分析
  s.examData.classes.forEach(c => {
    if (!c) return;
    const id = c.id || c.name, name = c.name || c.id;
    if (usedIds.has(id)) return;
    let obj = byKey[name] || c;
    obj.id = id; obj.name = name;
    if (!obj.gender || typeof obj.gender !== 'object') obj.gender = {};
    delete obj.studentNames;
    usedIds.add(id);
    next.push(obj);
  });
  s.examData.classes = next;
  // 仅丢弃 classId 完全缺失/无对应班级的孤儿记录，其余（含参考班）全部保留
  if (Array.isArray(s.examData.records)) {
    s.examData.records = s.examData.records.filter(r => r.classId && next.some(c => c.id === r.classId));
  }
}
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
    const sorted = [...same].sort((a, b) => (+b.score || 0) - (+a.score || 0));
    // 同分并列：单科排名同样要处理并列（90/90 → 都是第 1）
    const scoreByName = {};
    sorted.forEach(r => { if (!(r.studentName in scoreByName)) scoreByName[r.studentName] = +r.score || 0; });
    const rank = denseRankMap(sorted.map(r => r.studentName), n => scoreByName[n] || 0)[studentName] || 0;
    return { exam: e.name, date: e.date, score: +mine.score, rank };
  }).filter(Boolean);
}
// 成绩分析班级成员：直接取自「学生管理」，以学生管理为唯一真相源
function examStudentsOfClass(className) {
  return (state.students || []).filter(s => s && s.name && s.class === className).map(s => s.name);
}
function findClassIdByName(name) {
  const st = (state.students || []).find(x => x.name === name);
  if (st && st.class) {
    const c = ((state.examData && state.examData.classes) || []).find(c => c && (c.name === st.class || c.id === st.class));
    if (c) return c.id;
  }
  return null;
}
// ---------- 考试赋分：核心计算 ----------
function examSchoolRankColumnKey() {
  const cfg = (state.examScore && state.examScore.schoolRank) || {};
  const rankCols = examRankColumns().map(c => c.key);
  if (cfg.column && rankCols.includes(cfg.column)) return cfg.column;
  const hint = rankCols.find(k => /校次|校名|年级名|年级次|校排|年排/.test(k));
  return hint || rankCols[0] || null;
}
// 密集排名：同分并列。100/90/90/80 → 1/2/2/4（而不是 1/2/3/4）。
// sortedKeys 必须已按 scoreOf 降序排好。
function denseRankMap(sortedKeys, scoreOf) {
  const m = {};
  sortedKeys.forEach((k, i) => {
    if (i > 0 && scoreOf(k) === scoreOf(sortedKeys[i - 1])) m[k] = m[sortedKeys[i - 1]];
    else m[k] = i + 1;
  });
  return m;
}
function schoolTierPoints(rk, tiers) {
  if (!rk || rk <= 0) return 0;
  const ts = (tiers || []).slice().sort((a, b) => a.to - b.to);
  for (const t of ts) { if (rk >= (t.from || 1) && rk <= t.to) return t.points; }
  return 0;
}
// 计算规定日期内（calcStartDate ~ 今天）各次考试积分，按学生汇总
function examScoreInRange() {
  const cfg = state.examScore || defaultExamScore();
  const start = state.points.calcStartDate || '2026-01-01';
  const today = attDateKey(new Date());
  const clsName = state.activeClass;
  const clsObj = (state.examData.classes || []).find(c => c.name === clsName);
  const out = { exams: [], students: {} };
  if (!clsObj) return out;
  const classId = clsObj.id;
  const exams = (state.examData.exams || [])
    .filter(e => e.date && e.date >= start && e.date <= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  out.exams = exams;
  // 初始化本班所有学生
  examStudentsOfClass(clsName).forEach(n => { out.students[n] = { total: 0, exams: 0, byExam: [] }; });
  const schoolCol = examSchoolRankColumnKey();
  const scoreCols = examScoreColumns().map(c => c.key);
  exams.forEach(e => {
    const recs = (state.examData.records || []).filter(r => r.examId === e.id && r.classId === classId);
    const names = [...new Set(recs.map(r => r.studentName))].filter(Boolean);
    if (!names.length) return;
    // 每位学生总分（score 类列求和）
    // 注意：成绩表常自带「总分」列，它本身就是各科之和，再累加一次会让总分翻倍
    // （语80 + 数90 + 总分170 → 被算成 340）。总分/合计类列一律排除。
    const totalByStu = {};
    recs.filter(r => r.colType !== 'rank' && !TOTAL_SCORE_SUBJECTS.has(r.subject))
        .forEach(r => { totalByStu[r.studentName] = (totalByStu[r.studentName] || 0) + (+r.score || 0); });
    // 班次排名（按总分，同分并列：100/90/90/80 → 1/2/2/4，而不是 1/2/3/4）
    const ranked = [...names].sort((a, b) => (totalByStu[b] || 0) - (totalByStu[a] || 0));
    const classRankMap = denseRankMap(ranked, nm => totalByStu[nm] || 0);
    const classSize = names.length;
    // 单科记录分组（用于单科最高分）
    const bySubj = {};
    // 单科最高分只针对真正的学科；「总分」是合计列，不算单科
    recs.filter(r => r.colType !== 'rank' && !TOTAL_SCORE_SUBJECTS.has(r.subject))
        .forEach(r => { (bySubj[r.subject] = bySubj[r.subject] || []).push(r); });
    // 各 scope 下的单科最高分集合：subject -> 最高分学生集合
    const topOf = {};
    Object.keys(bySubj).forEach(sub => {
      const arr = bySubj[sub];
      const max = Math.max(...arr.map(r => +r.score || 0));
      if (max <= 0) return;
      const winners = new Set(arr.filter(r => (+r.score || 0) === max).map(r => r.studentName));
      if (cfg.subjectTop.scope === 'school') {
        // 校内：跨所有班级同一次考试中该科目最高分（仅当本班为该科目最高时计入）
        const allRecs = (state.examData.records || []).filter(r => r.examId === e.id && r.subject === sub && r.colType !== 'rank');
        const allMax = Math.max(...allRecs.map(r => +r.score || 0));
        if (max >= allMax) topOf[sub] = winners;
      } else {
        topOf[sub] = winners;
      }
    });
    names.forEach(nm => {
      let cr = 0, sr = 0, st = 0, pr = 0, rr = 0;
      const classRank = classRankMap[nm] || null;
      if (cfg.classRank.enabled && classRank) cr = classSize + 1 - classRank;
      let curSchoolRk = null;
      if (cfg.schoolRank.enabled && schoolCol) {
        const rec = recs.find(r => r.studentName === nm && r.subject === schoolCol);
        const rk = rec ? parseInt(rec.score, 10) : NaN;
        curSchoolRk = isNaN(rk) ? null : rk;
        if (!isNaN(rk)) sr = schoolTierPoints(rk, cfg.schoolRank.tiers);
      }
      const topSubs = [];
      if (cfg.subjectTop.enabled) {
        Object.keys(topOf).forEach(sub => { if (topOf[sub].has(nm)) { st += cfg.subjectTop.points; topSubs.push(sub); } });
      }
      // 校次进步/退步：对比上次考试的校次名次
      if (cfg.progressRank.enabled && cfg.progressRank.standard === 'schoolRank' && schoolCol && curSchoolRk != null) {
        const eIdx = exams.findIndex(x => x.id === e.id);
        if (eIdx > 0) {
          const prevExam = exams[eIdx - 1];
          const prevRecs = (state.examData.records || []).filter(r => r.examId === prevExam.id && r.classId === classId);
          const prevRec = prevRecs.find(r => r.studentName === nm && r.subject === schoolCol);
          const prevRk = prevRec ? parseInt(prevRec.score, 10) : NaN;
          if (!isNaN(prevRk) && prevRk > 0) {
            const diff = prevRk - curSchoolRk; // 正数=进步（名次变小），负数=退步
            if (diff >= (cfg.progressRank.minTierChange || 1)) pr = cfg.progressRank.improvePoints || 0;
            else if (diff <= -(cfg.progressRank.minTierChange || 1)) rr = cfg.progressRank.regressPoints || 0;
          }
        }
      }
      const examTotal = cr + sr + st + pr + rr;
      if (!out.students[nm]) out.students[nm] = { total: 0, exams: 0, byExam: [] };
      out.students[nm].total += examTotal;
      out.students[nm].exams += 1;
      out.students[nm].byExam.push({
        examId: e.id, examName: e.name, date: e.date,
        totalScore: totalByStu[nm] || 0,
        classRank, classRankPoints: cr,
        schoolRankVal: curSchoolRk,
        schoolRankPoints: sr,
        topSubjects: topSubs, subjectTopPoints: st,
        progressPoints: pr, regressPoints: rr,
        examTotal
      });
    });
  });
  return out;
}
// 带缓存的派生数据（输入变化时才重算）
let _escCache = null, _escSig = '';
function examScoreData() {
  const ed = examDataSafe();
  // 签名改为增量哈希（原来用 JSON.stringify 整份数据，一次渲染调数百次，是性能大头）。
  // 哈希覆盖 examScoreInRange 实际读取的全部字段，语义与整份序列化等价。
  hashStart();
  hashAdd(state.activeClass);
  hashAdd((state.points && state.points.calcStartDate) || '');
  hashAdd(ed.exams.length);
  for (let i = 0; i < ed.exams.length; i++) {
    const e = ed.exams[i] || {};
    hashAdd(e.id); hashAdd(e.name); hashAdd(e.date);
  }
  hashAdd(ed.records.length);
  for (let i = 0; i < ed.records.length; i++) {
    const r = ed.records[i] || {};
    hashAdd(r.id); hashAdd(r.examId); hashAdd(r.exam); hashAdd(r.classId); hashAdd(r.class);
    hashAdd(r.studentName); hashAdd(r.name); hashAdd(r.subject);
    hashAdd(r.score); hashAdd(r.colType); hashAdd(r.date);
  }
  hashAdd(ed.classes.length);
  for (let i = 0; i < ed.classes.length; i++) {
    const c = ed.classes[i] || {};
    hashAdd(c.id); hashAdd(c.name);
    const ns = c.studentNames || [];
    hashAdd(ns.length);
    for (let j = 0; j < ns.length; j++) hashAdd(ns[j]);
  }
  hashAdd(ed.subjects.length);
  for (let i = 0; i < ed.subjects.length; i++) {
    const s0 = ed.subjects[i] || {};
    hashAdd(s0.key); hashAdd(s0.name);
  }
  hashAdd(ed.columns.length);
  for (let i = 0; i < ed.columns.length; i++) {
    const c = ed.columns[i] || {};
    hashAdd(c.key); hashAdd(c.type); hashAdd(c.enabled ? 1 : 0);
  }
  const st = state.students || [];
  hashAdd(st.length);
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    hashAdd(x ? x.name : ''); hashAdd(x ? x.class : '');
  }
  hashAdd(JSON.stringify(state.examScore == null ? '' : state.examScore));
  const sig = hashEnd();
  if (_escSig === sig && _escCache) return _escCache;
  _escSig = sig; _escCache = examScoreInRange();
  return _escCache;
}
function examScoreStudentTotal(name) { const d = examScoreData(); const e = d.students[name]; return e ? e.total : 0; }
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

// ===================== 考勤管理：页面与交互 =====================
let attMode = null;   // 'home' | 'leave' | null
function attChipClass(name){
  const cur=((state.attendance||{}).current)||{home:{},leave:{},leaveTs:{}};
  const h=Object.prototype.hasOwnProperty.call(cur.home,name), l=Object.prototype.hasOwnProperty.call(cur.leave,name);
  if(h&&l) return 'both'; if(h) return 'home'; if(l) return 'leave'; return '';
}
function setAttMode(mode){
  attMode = (attMode===mode)? null : mode;
  render();
}
function markAttMember(name){
  const a=state.attendance; if(!a.current) a.current={date:attDateKey(new Date()),home:attDeriveHome(),leave:{},leaveTs:{}};
  const day=attDayName(new Date()); const s=attStudentByName(name);
  if(attMode==='home'){
    if(!s) return;
    if(!Array.isArray(s.weeklyHome)) s.weeklyHome=[];
    const i=s.weeklyHome.indexOf(day);
    if(i>-1) s.weeklyHome.splice(i,1); else s.weeklyHome.push(day);
    attRecomputeHome();
  } else if(attMode==='leave'){
    if(!a.current.leaveTs || typeof a.current.leaveTs!=='object') a.current.leaveTs={};
    if(Object.prototype.hasOwnProperty.call(a.current.leave, name)){ delete a.current.leave[name]; delete a.current.leaveTs[name]; }
    else { a.current.leave[name]=true; a.current.leaveTs[name]=nowTs(); }
  } else return;
  save(); render();
}
function toggleAttDay(name, day){
  const s=attStudentByName(name); if(!s) return;
  if(!Array.isArray(s.weeklyHome)) s.weeklyHome=[];
  const i=s.weeklyHome.indexOf(day);
  if(i>-1) s.weeklyHome.splice(i,1); else s.weeklyHome.push(day);
  attRecomputeHome(); save(); render();
}
function addLeave(name, reason, skipClassLog){
  name=(name||'').trim(); if(!name) return false;
  const a=state.attendance; if(!a.current) a.current={date:attDateKey(new Date()),home:attDeriveHome(),leave:{},leaveTs:{}};
  if(!a.current.leaveTs || typeof a.current.leaveTs!=='object') a.current.leaveTs={};
  a.current.leave[name]=reason||true;
  const lvTs=nowTs();                       // 请假登记时刻（精确到秒）
  a.current.leaveTs[name]=lvTs;
  if(!skipClassLog){
    // 班级日志里也记到秒：date 用完整时间戳，ts 是实际录入时刻
    state.classLogs.unshift({ id:uid(), date:nowStampSec(new Date(lvTs)), ts:lvTs, content:`【考勤】${name} 请假${reason?('（'+reason+'）'):''}` });
  }
  save(); return true;
}
function openAddLeaveModal(){
  openModal('添加请假', `<div class="space-y-4">
    <div><label class="block text-xs text-gray-500 mb-1">学生姓名</label><input id="lvName" class="w-full border rounded-lg p-2 text-sm" placeholder="如：王浩然"></div>
    <div><label class="block text-xs text-gray-500 mb-1">请假原因（可选）</label><input id="lvReason" class="w-full border rounded-lg p-2 text-sm" placeholder="如：病假 / 事假"></div>
    <button class="w-full bg-primary text-white py-2 rounded-full" onclick="submitAddLeave()">保存</button></div>`);
}
function submitAddLeave(){
  const n=document.getElementById('lvName').value.trim();
  const r=document.getElementById('lvReason').value.trim();
  if(!n) return alert('请输入学生姓名');
  addLeave(n,r); closeModal(); render();
}
function removeLeave(name){
  delete state.attendance.current.leave[name];
  if(state.attendance.current.leaveTs) delete state.attendance.current.leaveTs[name];
  save(); render();
}
function saveTodayAtt(){
  const a=state.attendance, cur=a.current; if(!cur) return;
  const idx = a.logs.findIndex(l=>l.date===cur.date);
  if(idx > -1) a.logs.splice(idx, 1); // 同日多次保存直接覆盖
  a.logs.unshift(attBuildLog(cur)); save(); alert('今日考勤已存入历史'); render();
}
function openAttMemberModal(){
  const list=(state.students||[]).filter(s=>s&&s.name);
  const rows = list.map(s=>`<div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
    <span class="font-medium">${esc(s.name)} <span class="text-xs text-gray-400">${esc(s.class||'')}</span></span>
    <span class="text-xs text-gray-500">${(s.weeklyHome&&s.weeklyHome.length)?('固定回家：'+s.weeklyHome.join('、')):'无周期'}</span>
  </div>`).join('') || '<div class="text-gray-400 text-sm py-2">暂无学生，请先在「学生管理」中添加。</div>';
  openModal('班级成员（取自学生管理）', `<div class="space-y-3">
    <p class="text-sm text-gray-500">班级成员直接同步自「学生管理」，共 <b>${list.length}</b> 人。在此增删或修改学生，考勤将实时更新；固定回家周期可在考勤页内直接勾选。</p>
    <div class="max-h-60 overflow-y-auto">${rows}</div>
    <button class="w-full bg-primary text-white py-2 rounded-full" onclick="closeModal();navigate('students')">去学生管理增删成员</button>
  </div>`);
}
function renderAttendance() {
  // 考勤结构可能被旧备份 / 手工导入破坏（current 缺失、home/leave 为 null、logs 不是数组），
  // 这里统一按"缺什么补什么"修复后再渲染，避免整页白屏。
  const a = (state.attendance && typeof state.attendance === 'object') ? state.attendance : (state.attendance = {});
  if (!a.current || typeof a.current !== 'object') a.current = {};
  const cur = a.current;
  if (!cur.date) cur.date = attDateKey(new Date());
  if (!cur.home || typeof cur.home !== 'object') cur.home = attDeriveHome() || {};
  if (!cur.leave || typeof cur.leave !== 'object') cur.leave = {};
  if (!cur.leaveTs || typeof cur.leaveTs !== 'object') cur.leaveTs = {};
  if (!Array.isArray(a.logs)) a.logs = [];
  const st=attStats();
  const homeNames=Object.keys(cur.home), leaveNames=Object.keys(cur.leave);
  const leaveList=Object.entries(cur.leave).map(([n,r])=>({name:n,reason:r===true?'':r,ts:cur.leaveTs[n]||0}));
  // 姓名可能来自导入/手动录入，必须转义后再拼接进 HTML（否则 <img onerror=...> 会被执行）
  const conclusion = `应到 ${st.total} 人，实到 ${st.present} 人。固定回家 ${st.home} 人（${esc(homeNames.join('、'))||'无'}），请假 ${st.leave} 人（${esc(leaveNames.join('、'))||'无'}）。`;

  // 姓名作为 JS 参数内联到 onclick 时，用 JSON.stringify + esc 双重保护：
  // 旧实现只去掉单引号，遇到双引号/反斜杠/右括号仍会截断 HTML 属性。
  const memberChips = attMembers().map(m=>{
    const cls=attChipClass(m.name);
    return `<div class="member-chip ${cls}" onclick="markAttMember(${esc(JSON.stringify(m.name))})">${esc(m.name)}</div>`;
  }).join('') || '<div class="text-sm text-gray-400">还没有班级成员，点「班级成员管理」导入名单。</div>';

  const todayDay = attDayName(new Date());
  const homeRows = attMembers().filter(m => (m.weeklyHome||[]).includes(todayDay)).map(m=>`<tr>
    <td class="py-2">${esc(m.name)}</td>
    <td class="py-2"><div class="flex gap-1">${ATT_WEEK.map(d=>`<span class="day-check ${ (m.weeklyHome||[]).includes(d)?'selected':'' }" onclick="toggleAttDay(${esc(JSON.stringify(m.name))},'${d}')">${d}</span>`).join('')}</div></td>
    <td class="py-2">${(m.weeklyHome||[]).includes(todayDay)?'✅':''}</td></tr>`).join('') || '<tr><td colspan="3" class="text-gray-400 py-3">今日无固定回家成员</td></tr>';

  // 请假时间取「登记那一刻」（精确到秒）；旧数据没有 leaveTs 就只显示日期，不伪造时间
  const leaveRows = leaveList.map(l=>`<tr><td>${esc(l.name)}</td><td>${esc(l.ts ? nowStampSec(new Date(l.ts)) : attDateKey(new Date()))}</td><td>${esc(l.reason)||'—'}</td><td><button class="text-xs text-red-500" onclick="removeLeave(${esc(JSON.stringify(l.name))})">删除</button></td></tr>`).join('') || '<tr><td colspan="4" class="text-gray-400">今日暂无请假</td></tr>';

  const historyRows = a.logs.filter(l=>l&&l.dateLabel).slice(0,12).map(l=>`<tr><td>${esc(l.dateLabel)}</td><td>${l.total}</td><td>${l.present}</td><td>${(l.home||[]).length}</td><td>${(l.leave||[]).length}</td><td>${l.rate}%</td><td><span class="text-xs text-blue-600 cursor-pointer">查看</span></td></tr>`).join('') || '<tr><td colspan="7" class="text-gray-400">暂无历史记录，点击「保存今日考勤」生成首条</td></tr>';

  return `<div class="space-y-4">
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div><div class="text-xs text-gray-400 mb-1">当前考勤时间</div><div class="text-2xl font-bold text-gray-800">${formatDate(now)}</div></div>
        <div class="flex items-center gap-2">
          <button class="px-4 py-2 rounded-lg text-sm border ${attMode==='home'?'bg-blue-100 border-blue-300 text-blue-700':'bg-white text-gray-600'}" onclick="setAttMode('home')">🏠 固定回家</button>
          <button class="px-4 py-2 rounded-lg text-sm border ${attMode==='leave'?'bg-red-100 border-red-300 text-red-700':'bg-white text-gray-600'}" onclick="setAttMode('leave')">🏥 请假</button>
          <button class="px-4 py-2 rounded-lg text-sm text-white" style="background:linear-gradient(135deg,#f472b6,#ec4899)" onclick="saveTodayAtt()">💾 保存今日考勤</button>
        </div>
      </div>
      <p class="text-xs text-gray-400 mt-3">操作：点击学生姓名可快速标记固定回家/请假；下方可直接勾选每位学生的固定回家周期；固定回家按周期保留，请假每天清空。</p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-2xl p-4 text-center shadow-sm"><div class="text-2xl font-bold">${st.total}</div><div class="text-xs text-gray-400 mt-1">应到人数</div></div>
      <div class="bg-white rounded-2xl p-4 text-center shadow-sm"><div class="text-2xl font-bold text-blue-600">${st.home}</div><div class="text-xs text-gray-400 mt-1">固定回家</div></div>
      <div class="bg-white rounded-2xl p-4 text-center shadow-sm"><div class="text-2xl font-bold text-red-500">${st.leave}</div><div class="text-xs text-gray-400 mt-1">请假</div></div>
      <div class="bg-white rounded-2xl p-4 text-center shadow-sm"><div class="text-2xl font-bold text-green-600">${st.present}</div><div class="text-xs text-gray-400 mt-1">实到人数</div></div>
    </div>

    <div class="rounded-2xl p-5 shadow-sm" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #bfdbfe;color:#1e40af;">
      <div class="font-bold text-[15px] mb-1">📋 今日考勤</div>
      <div class="text-[13px] leading-6">${conclusion}</div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">👨‍👩‍👧‍👦 班级成员（点击标记）</div>
        <button class="text-xs text-primary hover:underline" onclick="openAttMemberModal()">班级成员（取自学生管理）</button>
      </div>
      <div class="flex flex-wrap gap-3">${memberChips}</div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-white rounded-2xl p-5 shadow-sm">
        <div class="font-bold text-gray-800 mb-3">🏠 固定回家成员（每周周期，可多选不连续日）</div>
        <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left text-gray-500 font-medium pb-2">姓名</th><th class="text-left text-gray-500 font-medium pb-2">固定周期</th><th class="text-left text-gray-500 font-medium pb-2">今日</th></tr></thead><tbody>${homeRows}</tbody></table></div>
      </div>
      <div class="bg-white rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="font-bold text-gray-800">🏥 请假记录（自动写入班级日志）</div>
          <button class="text-xs text-primary hover:underline" onclick="openAddLeaveModal()">+ 添加请假</button>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left text-gray-500 font-medium pb-2">姓名</th><th class="text-left text-gray-500 font-medium pb-2">时间</th><th class="text-left text-gray-500 font-medium pb-2">原因</th><th></th></tr></thead><tbody>${leaveRows}</tbody></table></div>
      </div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="font-bold text-gray-800 mb-3">📚 历史考勤情况（每日自动保存）</div>
      <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="text-left text-gray-500 font-medium pb-2">日期</th><th class="text-left text-gray-500 font-medium pb-2">应到</th><th class="text-left text-gray-500 font-medium pb-2">实到</th><th class="text-left text-gray-500 font-medium pb-2">固定回家</th><th class="text-left text-gray-500 font-medium pb-2">请假</th><th class="text-left text-gray-500 font-medium pb-2">出勤率</th><th></th></tr></thead><tbody>${historyRows}</tbody></table></div>
    </div>
  </div>`;
}

// ===================== 考试赋分模块 =====================
function renderExamScore() {
  if (state.activeClass !== state.headTeacherClass) {
    return `<div class="bg-white rounded-2xl p-10 text-center shadow-sm">
      <div class="text-5xl mb-4">📈</div>
      <div class="font-bold text-gray-800 mb-2">考试赋分（仅班主任班 ${esc(className(state.headTeacherClass))}）</div>
      <p class="text-sm text-gray-500 mb-5">当前为 ${esc(className(state.activeClass))}（任课视角）。考试赋分依据成绩分析自动计算，仅对班主任班生效。</p>
      <button class="bg-primary text-white px-5 py-2 rounded-full text-sm hover:bg-primaryDark" onclick="setActiveClass('${esc(state.headTeacherClass)}')">切换到 ${esc(className(state.headTeacherClass))}</button>
    </div>`;
  }
  const cfg = state.examScore;
  const es = examScoreData();
  const start = state.points.calcStartDate || '2026-01-01';
  const today = attDateKey(new Date());
  const rankCols = examRankColumns().map(c => c.key);
  const schoolKey = examSchoolRankColumnKey();
  const rows = Object.keys(es.students).map(name => ({ name, ...es.students[name] }))
    .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), 'zh'));
  const classTotal = rows.reduce((a, b) => a + b.total, 0);

  // 规则配置卡片
  const tierRows = (cfg.schoolRank.tiers || []).map((t, i) => `
    <div class="flex items-center gap-2 mb-1">
      <input type="number" data-tier-from="${i}" class="w-20 border rounded-lg p-1.5 text-sm" value="${t.from}">
      <span class="text-xs text-gray-500">名 -</span>
      <input type="number" data-tier-to="${i}" class="w-20 border rounded-lg p-1.5 text-sm" value="${t.to}">
      <span class="text-xs text-gray-500">名，赋</span>
      <input type="number" step="0.1" data-tier-points="${i}" class="w-20 border rounded-lg p-1.5 text-sm" value="${t.points}">
      <span class="text-xs text-gray-500">分</span>
      <button class="text-gray-300 hover:text-red-500 text-sm px-1" onclick="examScoreRemoveTier(${i})">×</button>
    </div>`).join('') || '<div class="text-xs text-gray-400">暂无区间</div>';

  const rankColOpts = rankCols.length
    ? rankCols.map(k => `<option value="${esc(k)}" ${k === (cfg.schoolRank.column || schoolKey) ? 'selected' : ''}>${esc(k)}</option>`).join('')
    : '<option value="">（请先在「成绩管理-班级设置/管理列」添加 rank 列）</option>';

  const rulesCard = `
  <div class="bg-white rounded-2xl p-5 shadow-sm space-y-5">
    <div class="flex items-center justify-between">
      <div class="font-bold text-gray-800">⚙️ 赋分规则（可自由更改，立即生效）</div>
    </div>
    <p class="text-xs text-gray-500">规定日期：<b>${esc(start)}</b> 至 <b>${esc(today)}</b>（自首页「积分计算起始日」起）。仅统计 ${esc(className(state.activeClass))} 在成绩分析中上传的成绩。各次考试成绩积分之和，即为每位学生的考试赋分，并自动计入积分系统的「考试赋分」维度。</p>

    <div class="border rounded-xl p-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" id="esClassRank" ${cfg.classRank.enabled ? 'checked' : ''} class="w-4 h-4 accent-primary">
        <span class="font-medium text-gray-800">班次第 n 名</span>
      </label>
      <p class="text-xs text-gray-500 mt-1 ml-6">按当次考试总分在班内排名，赋分 = 班级参考人数 + 1 − 名次。</p>
    </div>

    <div class="border rounded-xl p-4 space-y-2">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" id="esSchoolEnabled" ${cfg.schoolRank.enabled ? 'checked' : ''} class="w-4 h-4 accent-primary">
        <span class="font-medium text-gray-800">校次赋分（读取上传的校次列）</span>
      </label>
      <div class="ml-6 space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">校次列：</span>
          <select id="esSchoolCol" class="border rounded-lg p-1.5 text-sm">${rankColOpts}</select>
        </div>
        <div class="text-xs text-gray-500">名次区间 → 赋分（闭区间，两端都包含；按区间从小到大依次匹配）：</div>
        <div id="esTierWrap">${tierRows}</div>
        <button class="text-xs text-primary border border-primary px-3 py-1 rounded-full hover:bg-primary/5" onclick="examScoreAddTier()">+ 增加区间</button>
      </div>
    </div>

    <div class="border rounded-xl p-4 space-y-2">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" id="esSubjectEnabled" ${cfg.subjectTop.enabled ? 'checked' : ''} class="w-4 h-4 accent-primary">
        <span class="font-medium text-gray-800">单科最高分赋分</span>
      </label>
      <div class="ml-6 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">每科第1名赋分</span>
          <input type="number" step="0.1" id="esSubjectPoints" class="w-20 border rounded-lg p-1.5 text-sm" value="${cfg.subjectTop.points}">
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">范围</span>
          <select id="esSubjectScope" class="border rounded-lg p-1.5 text-sm">
            <option value="class" ${cfg.subjectTop.scope === 'class' ? 'selected' : ''}>班内每科第1名</option>
            <option value="school" ${cfg.subjectTop.scope === 'school' ? 'selected' : ''}>校内每科第1名</option>
          </select>
        </div>
      </div>
    </div>

    <div class="border rounded-xl p-4 space-y-2">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" id="esProgressEnabled" ${(cfg.progressRank && cfg.progressRank.enabled) ? 'checked' : ''} class="w-4 h-4 accent-primary">
        <span class="font-medium text-gray-800">校次进步 / 退步（对比上次考试）</span>
      </label>
      <div class="ml-6 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">进步奖励</span>
          <input type="number" step="0.1" id="esImprovePoints" class="w-20 border rounded-lg p-1.5 text-sm" value="${(cfg.progressRank && cfg.progressRank.improvePoints) || 8}">
          <span class="text-xs text-gray-500">分</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">退步扣分</span>
          <input type="number" step="0.1" id="esRegressPoints" class="w-20 border rounded-lg p-1.5 text-sm" value="${(cfg.progressRank && cfg.progressRank.regressPoints) || -3}">
          <span class="text-xs text-gray-500">分</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">最少变化</span>
          <input type="number" step="1" min="0" id="esMinTierChange" class="w-16 border rounded-lg p-1.5 text-sm" value="${(cfg.progressRank && cfg.progressRank.minTierChange) || 1}">
          <span class="text-xs text-gray-500">名才触发</span>
        </div>
      </div>
      <p class="text-xs text-gray-400 ml-6">以「校次」列为标准，对比该生与上次考试的校次名次变化。名次变小（进步）→ 奖励分；名次变大（退步）→ 扣分。</p>
    </div>

    <button class="bg-primary text-white px-5 py-2 rounded-full text-sm hover:bg-primaryDark" onclick="saveExamScoreRules()">保存规则</button>
  </div>`;

  // 结果列表
  const resultRows = rows.length ? rows.map((r, i) => {
    const detailInner = r.byExam.length ? `
      <div class="overflow-x-auto p-2 bg-gray-50">
        <table class="w-full text-xs">
          <thead><tr class="text-gray-400">
            <th class="text-left p-1">考试</th><th class="text-right p-1">总分</th><th class="text-right p-1">班次名</th>
            <th class="text-right p-1">班次赋分</th><th class="text-right p-1">校次</th><th class="text-right p-1">校次赋分</th>
            <th class="text-left p-1">单科最高分</th><th class="text-right p-1">单科赋分</th>
            <th class="text-right p-1 text-emerald-600">进步</th><th class="text-right p-1 text-red-500">退步</th><th class="text-right p-1">本次合计</th>
          </tr></thead>
          <tbody>
            ${r.byExam.map(b => `<tr class="border-t border-gray-100">
              <td class="p-1">${esc(b.examName)}${b.date ? ` <span class="text-gray-300">${esc(b.date)}</span>` : ''}</td>
              <td class="text-right p-1">${fmtScore(b.totalScore)}</td>
              <td class="text-right p-1">${b.classRank != null ? b.classRank : '—'}</td>
              <td class="text-right p-1 text-sky-600">${fmtScore(b.classRankPoints)}</td>
              <td class="text-right p-1">${b.schoolRankVal != null ? b.schoolRankVal : '—'}</td>
              <td class="text-right p-1 text-sky-600">${fmtScore(b.schoolRankPoints)}</td>
              <td class="p-1">${b.topSubjects.length ? esc(b.topSubjects.join('、')) : '—'}</td>
              <td class="text-right p-1 text-sky-600">${fmtScore(b.subjectTopPoints)}</td>
              <td class="text-right p-1 ${b.progressPoints > 0 ? 'text-emerald-600 font-medium' : 'text-gray-300'}">${b.progressPoints > 0 ? '+' + fmtScore(b.progressPoints) : '—'}</td>
              <td class="text-right p-1 ${b.regressPoints < 0 ? 'text-red-500 font-medium' : 'text-gray-300'}">${b.regressPoints < 0 ? fmtScore(b.regressPoints) : '—'}</td>
              <td class="text-right p-1 font-medium">${fmtScore(b.examTotal)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<div class="p-2 text-xs text-gray-400">该生在规定日期内暂无考试成绩</div>';
    return `
    <tbody>
      <tr class="border-t border-gray-100 cursor-pointer hover:bg-gray-50" onclick="this.nextElementSibling.classList.toggle('hidden')">
        <td class="p-3 w-10 text-gray-400">${i + 1}</td>
        <td class="p-3 font-medium text-gray-800">${esc(r.name)}</td>
        <td class="p-3 text-right font-bold text-sky-600">${fmtScore(r.total)}</td>
        <td class="p-3 text-right text-xs text-gray-400">${r.exams} 次</td>
      </tr>
      <tr class="hidden"><td class="p-0" colspan="4">${detailInner}</td></tr>
    </tbody>`;
  }).join('') : '<div class="text-sm text-gray-400 p-6 text-center">暂无学生或暂无规定日期内的考试成绩</div>';

  return `
  <div class="space-y-5">
    ${rulesCard}
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">📈 考试赋分结果（${esc(className(state.activeClass))}）</div>
        <div class="text-sm text-gray-500">全班合计 <b class="text-sky-600">${fmtScore(classTotal)}</b> 分 · 已计入积分「考试赋分」维度</div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-gray-400 text-xs">
            <th class="text-left p-3 w-10">#</th><th class="text-left p-3">学生</th>
            <th class="text-right p-3">考试赋分</th><th class="text-right p-3">参考次数</th>
          </tr></thead>
          ${resultRows}
        </table>
      </div>
    </div>
  </div>`;
}
function examScoreAddTier() {
  const tiers = state.examScore.schoolRank.tiers;
  const lastTo = tiers.length ? +tiers[tiers.length - 1].to : 0;
  const from = lastTo ? lastTo + 1 : 1;
  state.examScore.schoolRank.tiers.push({ from, to: from + 99, points: 1 });
  save(); render();
}
function examScoreRemoveTier(i) {
  state.examScore.schoolRank.tiers.splice(i, 1);
  save(); render();
}
function saveExamScoreRules() {
  const g = id => document.getElementById(id);
  state.examScore.classRank.enabled = !!g('esClassRank').checked;
  state.examScore.schoolRank.enabled = !!g('esSchoolEnabled').checked;
  state.examScore.schoolRank.column = g('esSchoolCol').value;
  const tiers = [];
  document.querySelectorAll('[data-tier-from]').forEach(el => {
    const i = +el.dataset.tierFrom;
    const toEl = document.querySelector(`[data-tier-to="${i}"]`);
    const p = document.querySelector(`[data-tier-points="${i}"]`);
    tiers.push({ from: +el.value || 1, to: +(toEl && toEl.value) || 99999, points: +p.value || 0 });
  });
  state.examScore.schoolRank.tiers = tiers;
  state.examScore.subjectTop.enabled = !!g('esSubjectEnabled').checked;
  state.examScore.subjectTop.points = +g('esSubjectPoints').value || 0;
  state.examScore.subjectTop.scope = g('esSubjectScope').value;
  // 校次进步/退步
  if (!state.examScore.progressRank) state.examScore.progressRank = {};
  state.examScore.progressRank.enabled = !!g('esProgressEnabled').checked;
  state.examScore.progressRank.improvePoints = +g('esImprovePoints').value || 0;
  state.examScore.progressRank.regressPoints = +g('esRegressPoints').value || 0;
  state.examScore.progressRank.minTierChange = Math.max(0, +g('esMinTierChange').value || 1);
  save(); render();
  toast('考试赋分规则已保存');
}

function renderExam() {
  const tabs = [
    { id: 'query', label: '📋 成绩查询' },
    { id: 'analysis', label: '📊 成绩分析' },
    { id: 'upload', label: '📥 成绩上传' },
    { id: 'settings', label: '🏫 班级设置' },
  ].map(t => `<button class="px-4 py-1.5 rounded-full text-sm transition ${examTab === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-primary/10'}" onclick="setExamTab('${t.id}')">${t.label}</button>`).join('');

  let body = '';
  if (examTab === 'upload') body = renderExamUpload();
  else if (examTab === 'settings') body = renderExamSettings();
  else if (examTab === 'query') body = renderExamQuery();
  else body = renderExamAnalysis();
  return `
  <div class="space-y-5">
    <div class="flex flex-wrap gap-2">${tabs}</div>
    <div id="exam-body">${body}</div>
  </div>`;
}
function setExamTab(t) { examTab = t; render(); }
function selectExamStudent(name) { examSelectedStudent = name; renderExamAnalysisInto(); }
function examQuickCompareClasses() {
  ensureAnalysisSel();
  anSelClasses = examClassesSafe().map(c => c.id);
  anSelExams = state.examData.exams.map(e => e.id);
  anSelStudents = [];
  renderExamAnalysisInto();
}
function examQuickPersonalTrend() {
  ensureAnalysisSel();
  if (!examSelectedStudent) {
    const first = [...new Set(state.examData.records.map(r => r.studentName))][0];
    if (!first) { alert('暂无成绩数据，请先上传成绩'); return; }
    examSelectedStudent = first;
  }
  anSelClasses = examClassesSafe().map(c => c.id);
  anSelExams = state.examData.exams.map(e => e.id);
  renderExamAnalysisInto();
}

// ---------- 数据管理 ----------
// 成绩分析的班级与成员统一取自「学生管理」，以学生管理为唯一真相源；
// 班级增删、成员增删、性别调整均在「学生管理」完成，成绩分析自动同步（见 syncExamClassesToStudents）。

function renderExamSettings() {
  const clsHtml = examClassesSafe().map(c => {
    const members = examStudentsOfClass(c.name);
    const chips = members.length ? members.map(n => {
      const g = examStudentGender(n);
      const badge = g ? `<span class="text-[10px] px-1 py-0.5 rounded bg-white/60 text-slate-500">${esc(g)}</span>` : '';
      return `<span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700"><b>${esc(n)}</b>${badge}</span>`;
    }).join('') : '<span class="text-xs text-gray-400">学生管理中暂无该班学生</span>';
    return `
    <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div class="flex items-center gap-2 mb-3">
        <div class="flex-1 text-sm font-medium">${esc(c.name)}</div>
        <span class="text-xs text-gray-400">${members.length}人</span>
      </div>
      <div class="flex flex-wrap gap-2 mb-3 min-h-[2rem]">${chips}</div>
      <p class="text-[11px] text-gray-400">名单自动同步自「学生管理」，增删学生或调整班级请前往学生管理。</p>
    </div>`;
  }).join('');

  return `
  <div class="space-y-5">
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">🏫 班级与成员（同步自学生管理）</div>
      </div>
      <p class="text-xs text-gray-500 mb-3">成绩分析的班级与成员直接取自「学生管理」，以学生管理为唯一真相源。修改学生、班级、性别请在「学生管理」中进行，成绩分析会自动同步，无需在此维护名单。</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${clsHtml}</div>
      <button class="mt-4 text-sm text-primary hover:underline" onclick="navigate('students')">➡️ 去学生管理维护名单</button>
    </div>
  </div>`;
}
function renderExamUpload() {
  const examOpts = state.examData.exams.map(e => `<option value="${e.id}">${esc(e.name)}（${esc(e.date || '')}）</option>`).join('') || '<option value="">（先添加考试）</option>';
  const clsOpts = examClassesSafe().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const subjOpts = examColumns().filter(c => c.enabled).map(c => `<option value="${esc(c.key)}">${esc(c.key)}${c.type === 'rank' ? '（排名）' : ''}</option>`).join('') || '<option value="">（请先在「班级设置」或下方管理列）</option>';
  return `
  <div class="space-y-5">
    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-gray-800">📝 考试管理</h3>
        <span class="text-xs text-gray-400">修改已导入考试的名称和日期</span>
      </div>
      <div class="space-y-2">${state.examData.exams.length ? state.examData.exams.map(e => `
        <div class="flex items-center gap-2 text-sm p-2 rounded bg-gray-50" data-eid="${e.id}">
          <input type="text" class="ex-name flex-1 border rounded-lg p-2 text-sm" value="${esc(e.name)}" placeholder="考试名称">
          <input type="date" class="ex-date border rounded-lg p-2 text-sm" value="${esc(e.date || '')}">
          <button class="bg-primary text-white px-3 rounded-lg text-sm hover:bg-primaryDark" onclick="updateExam('${e.id}')">保存</button>
          <button class="text-gray-300 hover:text-red-500 px-2" onclick="delExam('${e.id}')">🗑️</button>
        </div>`).join('') : '<div class="text-gray-400 text-sm">暂无考试，导入成绩后会自动出现。</div>'}</div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-gray-800">🛠️ 在线处理成绩（原始成绩文件）</h3>
        <button class="text-xs text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openColumnManager()">⚙️ 管理列</button>
      </div>
      <p class="text-[11px] text-gray-400 leading-relaxed">直接选择年级原始 Excel/CSV，系统自动识别列、按全年级各单科排名计算单科校次、只保留你勾选的班级，再按「班级 + 姓名」匹配保存到工作台。全流程在浏览器内完成，不增加服务器负担。</p>
      <div class="flex flex-wrap gap-3 items-end">
        <div class="flex-1 min-w-[220px]">
          <label class="block text-xs text-gray-500 mb-1">选择原始成绩文件（全年级）</label>
          <input id="olFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm" onchange="olOnFile(this)">
        </div>
      </div>
      <div id="olPanel"></div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <h3 class="font-bold text-gray-800">➕ 单条录入 / 覆盖</h3>
      <div class="grid grid-cols-2 gap-3">
        <select id="exClass" class="border rounded-lg p-2 text-sm">${clsOpts}</select>
        <select id="exExam" class="border rounded-lg p-2 text-sm">${examOpts}</select>
        <select id="exSubject" class="border rounded-lg p-2 text-sm">${subjOpts}</select>
        <input id="exName" class="border rounded-lg p-2 text-sm" placeholder="学生姓名">
        <input id="exScore" type="number" class="border rounded-lg p-2 text-sm col-span-2" placeholder="分数 / 排名数值">
        <button class="col-span-2 bg-primary text-white rounded-lg text-sm py-2 hover:bg-primaryDark" onclick="saveExamScore()">保存</button>
      </div>
    </div>
  </div>`;
}
function updateExam(id) {
  const row = document.querySelector(`[data-eid="${id}"]`);
  if (!row) return;
  const name = row.querySelector('.ex-name').value.trim();
  const date = row.querySelector('.ex-date').value;
  if (!name) return alert('考试名称不能为空');
  const ex = state.examData.exams.find(e => e.id === id);
  if (!ex) return;
  ex.name = name; ex.date = date;
  save(); render();
}
function delExam(id) {
  if (!confirm('删除该考试？其下所有成绩记录也会删除。')) return;
  (state.examData.records || []).forEach(r => { if (r.examId === id) markDeletedId('examData.records', r.id); });
  state.examData.records = state.examData.records.filter(r => r.examId !== id);
  state.examData.exams = state.examData.exams.filter(e => e.id !== id);
  markDeletedId('examData.exams', id);
  save(); render();
}
function saveExamScore() {
  const classId = document.getElementById('exClass').value;
  const examId = document.getElementById('exExam').value;
  const subject = document.getElementById('exSubject').value;
  const name = document.getElementById('exName').value.trim();
  const score = parseFloat(document.getElementById('exScore').value);
  if (!examId) return alert('请先选择考试');
  if (!subject) return alert('请选择科目 / 列');
  if (!name || isNaN(score)) return alert('请填写姓名和分数');
  const col = examColumnByKey(subject);
  const colType = col ? col.type : 'score';
  const ex = state.examData.records.find(r => r.examId === examId && r.classId === classId && r.studentName === name && r.subject === subject);
  if (ex) { ex.score = score; ex.colType = colType; }
  else state.examData.records.push({ id: uid(), examId, classId, studentName: name, subject, score, colType });
  save(); render();
}

// ---------- 成绩智能导入向导 ----------
function parseExamNameFromFilename(fn) {
  if (!fn) return { name: '', date: '' };
  const base = String(fn).replace(/\.[^.]+$/, '').split(/[\\/]/).pop();
  let date = '';
  const dm = base.match(/((?:20)?\d{2})[.\-_年](\d{1,2})[.\-_月](\d{1,2})/);
  if (dm) {
    let y = parseInt(dm[1], 10); if (y < 100) y += 2000;
    const mo = String(parseInt(dm[2], 10)).padStart(2, '0');
    const d = String(parseInt(dm[3], 10)).padStart(2, '0');
    date = `${y}-${mo}-${d}`;
  }
  const typeKw = ['期中考试', '期中', '期末考试', '期末', '月考', '模拟考', '模拟', '一模', '二模', '三模', '联考', '质检', '摸底', '开学考', '入学考'];
  let name = '';
  for (const kw of typeKw) { if (base.includes(kw)) { name = kw.replace('考试', ''); break; } }
  if (!name) {
    let rest = base.replace(dm ? dm[0] : '', '');
    rest = rest.replace(/导入用|合并|全县排名|折合后|全部|分析|排名|成绩|数据|\(.*?\)|（.*?）|_+|merged/gi, ' ').replace(/\s+/g, ' ').trim();
    name = rest || '考试';
  }
  return { name, date };
}
function autoCreateExamFromFilename(fn) {
  const info = parseExamNameFromFilename(fn);
  if (!info.name && !info.date) return null;
  let ex = state.examData.exams.find(e => e.name === info.name && (e.date || '') === (info.date || ''));
  if (!ex && info.name) {
    // 日期有一方为空时，按名称匹配，避免“手动建了期中无日期，导入文件名含日期”产生重复
    ex = state.examData.exams.find(e => e.name === info.name && (!(e.date || '') || !info.date));
  }
  if (!ex) {
    state.examData.exams.push({ id: uid(), name: info.name, date: info.date });
    ex = state.examData.exams[state.examData.exams.length - 1];
  }
  eiExamId = ex.id;
  return ex;
}
function openExamImportWizard() {
  eiBook = null; eiSheets = []; eiSheetName = ''; eiRows = []; eiHeaders = [];
  eiNameCol = -1; eiClassCol = -1; eiColMap = {}; eiHeaderRow = 1;
  eiExamId = state.examData.exams.length ? state.examData.exams[state.examData.exams.length - 1].id : '';
  openModal('📥 智能导入成绩', '<div id="eiHost"></div>', 'xl');
  eiRenderBody();
}
function eiRenderBody() {
  const host = document.querySelector('#modal-root .p-6');
  if (!host) return;
  host.innerHTML = renderEIWizardBody();
  attachEIWizard();
}
function renderEIWizardBody() {
  const examOpts = state.examData.exams.map(e => `<option value="${e.id}" ${e.id === eiExamId ? 'selected' : ''}>${esc(e.name)}（${esc(e.date || '')}）</option>`).join('');
  const hasData = eiRows.length > 1;
  const sheetOpts = eiSheets.map(s => `<option value="${esc(s)}" ${s === eiSheetName ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const canImport = hasData && eiNameCol >= 0 && Object.keys(eiColMap).length > 0;
  const colOptions = (sel, includeNone) => {
    let o = includeNone ? `<option value="-1" ${sel === -1 ? 'selected' : ''}>（不使用）</option>` : '';
    eiHeaders.forEach((h, i) => { o += `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || ('列' + (i + 1)))}</option>`; });
    return o;
  };
  let mapUI = '';
  if (hasData && eiHeaders.length) {
    const otherCols = eiHeaders.map((h, i) => ({ h, i })).filter(o => o.i !== eiNameCol && o.i !== eiClassCol);
    if (otherCols.length) {
      mapUI = `<div class="space-y-2">${otherCols.map(o => `
        <div class="flex items-center gap-2 text-sm">
          <span class="w-28 truncate text-gray-700" title="${esc(o.h || '')}">${esc(o.h || ('列' + (o.i + 1)))}</span>
          <select class="flex-1 border rounded-lg p-2 text-sm" onchange="eiSetColMap(${o.i}, this.value)">${eiMapOptions(o.i, o.h)}</select>
        </div>`).join('')}</div>`;
    } else {
      mapUI = '<p class="text-xs text-gray-400">未检测到可导入的数据列（请确认文件包含科目/排名列）。</p>';
    }
  }
  return `
  <div class="space-y-5">
    <div class="flex items-center gap-2 text-xs text-gray-500">
      <span class="px-2 py-1 rounded-full ${hasData ? 'bg-green-100 text-green-700' : 'bg-gray-100'}">① 选文件 / 工作表</span>
      <span>→</span>
      <span class="px-2 py-1 rounded-full ${hasData ? 'bg-primary/10 text-primary' : 'bg-gray-100'}">② 识别标题 · 列映射 · 预览</span>
    </div>

    <div class="bg-gray-50 rounded-xl p-4 space-y-3">
      <div class="flex flex-wrap gap-3 items-end">
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs text-gray-500 mb-1">选择文件（Excel / CSV / 文本）</label>
          <input id="eiFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm">
        </div>
        <div id="eiSheetWrap" class="${eiSheets.length ? '' : 'hidden'}">
          <label class="block text-xs text-gray-500 mb-1">工作表</label>
          <select id="eiSheet" class="border rounded-lg p-2 text-sm">${sheetOpts}</select>
        </div>
        <div id="eiHeaderRowWrap" class="${eiSheets.length ? '' : 'hidden'}">
          <label class="block text-xs text-gray-500 mb-1">标题行</label>
          <input id="eiHeaderRow" type="number" min="1" value="${eiHeaderRow}" class="border rounded-lg p-2 text-sm w-20">
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">导入到考试</label>
          <select id="eiExam" class="border rounded-lg p-2 text-sm">${examOpts}</select>
        </div>
      </div>
      <p class="text-[11px] text-gray-400">支持含多个工作表的 Excel（可切换）；也可在下方直接粘贴 <code>姓名,数学,英语,班次</code> 文本。第一行将自动识别为标题。</p>
      <textarea id="eiPaste" rows="3" class="w-full border rounded-lg p-3 text-sm" placeholder="也可直接粘贴：&#10;姓名,数学,英语,班次&#10;张明轩,88,92,5">${hasData && !eiBook ? eiRows.map(r => r.join(',')).join('\n') : ''}</textarea>
    </div>

    <div id="eiMapWrap" class="${hasData ? 'space-y-3' : 'hidden space-y-3'}">
      <div class="flex items-center justify-between">
        <div class="font-bold text-gray-800 text-sm">识别到的标题（为每个数据列选择映射目标）</div>
        <button type="button" class="text-xs text-primary border border-primary px-2.5 py-1 rounded-full hover:bg-primary/5" onclick="eiAutoMap();eiRenderBody()">🔄 自动匹配</button>
      </div>
      <div id="eiHeadChips" class="flex flex-wrap gap-2">${eiChipsHTML()}</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="block text-xs text-gray-500 mb-1">姓名列 *</label><select id="eiNameCol" class="w-full border rounded-lg p-2 text-sm">${colOptions(eiNameCol, false)}</select></div>
        <div><label class="block text-xs text-gray-500 mb-1">班级列（可选）</label><select id="eiClassCol" class="w-full border rounded-lg p-2 text-sm">${colOptions(eiClassCol, true)}</select></div>
      </div>
      <div class="bg-gray-50 rounded-xl p-3">
        <div class="text-xs text-gray-500 mb-2">数据列映射（可映射到已有科目/预设列，或新建）</div>
        ${mapUI}
      </div>
      <div class="overflow-x-auto border rounded-xl">
        <table class="w-full text-xs" id="eiPreviewTable"></table>
      </div>
      <div id="eiMatchInfo" class="text-xs"></div>
    </div>

    <div class="flex gap-3 pt-1">
      <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal()">取消</button>
      <button id="eiImportBtn" class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark disabled:opacity-40" onclick="doExamImportWizard()" ${canImport ? '' : 'disabled'}>导入成绩</button>
    </div>
  </div>`;
}
function eiMapOptions(colIndex, header) {
  const cur = eiColMap[colIndex];
  const sel = cur ? (cur.isNew ? ('new:' + cur.type) : ('map:' + cur.target)) : '__skip__';
  let o = `<option value="__skip__" ${sel === '__skip__' ? 'selected' : ''}>（不导入）</option>`;
  const scoreCols = examColumns().filter(c => c.type === 'score');
  const rankCols = examColumns().filter(c => c.type === 'rank');
  if (scoreCols.length) {
    o += '<optgroup label="映射到已有分数科目">';
    scoreCols.forEach(c => { o += `<option value="map:${esc(c.key)}" ${sel === ('map:' + c.key) ? 'selected' : ''}>${esc(c.key)}</option>`; });
    o += '</optgroup>';
  }
  if (rankCols.length) {
    o += '<optgroup label="映射到已有排名列">';
    rankCols.forEach(c => { o += `<option value="map:${esc(c.key)}" ${sel === ('map:' + c.key) ? 'selected' : ''}>${esc(c.key)}（排名）</option>`; });
    o += '</optgroup>';
  }
  o += `<optgroup label="新建为列（以标题命名）">
    <option value="new:score" ${sel === 'new:score' ? 'selected' : ''}>＋新建分数列「${esc(header || ('列' + (colIndex + 1)))}」</option>
    <option value="new:rank" ${sel === 'new:rank' ? 'selected' : ''}>＋新建排名列「${esc(header || ('列' + (colIndex + 1)))}」</option>
  </optgroup>`;
  return o;
}
function eiChipsHTML() {
  if (!eiHeaders.length) return '';
  return eiHeaders.map((h, i) => {
    let cls = 'bg-gray-100 text-gray-600'; let tag = '';
    if (i === eiNameCol) { cls = 'bg-pink-100 text-pink-700'; tag = '姓名'; }
    else if (i === eiClassCol) { cls = 'bg-blue-100 text-blue-700'; tag = '班级'; }
    else if (eiColMap[i]) { if (eiColMap[i].type === 'rank') { cls = 'bg-purple-100 text-purple-700'; tag = '排名'; } else { cls = 'bg-green-100 text-green-700'; tag = '分数'; } }
    return `<span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${cls}">${esc(h || ('列' + (i + 1)))} ${tag ? `<b class="font-bold">${tag}</b>` : ''}</span>`;
  }).join('');
}
function eiPreviewHTML() {
  if (eiRows.length < 2) return '';
  const mappedSet = new Set(Object.keys(eiColMap).map(k => +k));
  mappedSet.add(eiNameCol); if (eiClassCol >= 0) mappedSet.add(eiClassCol);
  let h = '<thead><tr class="bg-gray-100 text-gray-600">';
  eiHeaders.forEach((hd, i) => {
    const hl = mappedSet.has(i) ? 'style="background:#fce7f3"' : '';
    h += `<th class="px-2 py-1.5 text-left whitespace-nowrap font-medium" ${hl}>${esc(hd || ('列' + (i + 1)))}</th>`;
  });
  h += '</tr></thead><tbody>';
  eiRows.slice(1, 11).forEach(r => {
    h += '<tr class="border-t hover:bg-gray-50">';
    eiHeaders.forEach((hd, i) => {
      const hl = mappedSet.has(i) ? 'style="background:#fdf2f8"' : '';
      h += `<td class="px-2 py-1.5 whitespace-nowrap" ${hl}>${esc(String(r[i] ?? ''))}</td>`;
    });
    h += '</tr>';
  });
  h += '</tbody>';
  if (eiRows.length - 1 > 10) h += `<caption class="text-[10px] text-gray-400 p-2">仅预览前 10 行，共 ${eiRows.length - 1} 条数据</caption>`;
  return h;
}
function eiMatchInfoHTML() {
  if (eiRows.length < 2 || eiNameCol < 0 || !Object.keys(eiColMap).length) return '';
  let total = 0, matched = 0; const unmatched = [];
  eiRows.slice(1).forEach(r => {
    const name = String(r[eiNameCol] ?? '').trim();
    if (!name) return;
    const hasVal = Object.keys(eiColMap).some(idx => { const v = parseFloat(String(r[idx] ?? '').trim()); return !isNaN(v); });
    if (!hasVal) return;
    total++;
    let cid = null;
    if (eiClassCol >= 0) { const cv = String(r[eiClassCol] ?? '').trim(); if (cv) cid = 'NEW'; }
    if (!cid) cid = findClassIdByName(name);
    if (cid) matched++; else unmatched.push(name);
  });
  const unmatchedTxt = unmatched.length ? `未匹配 <b class="text-red-500">${unmatched.length}</b> 人（${esc(unmatched.slice(0, 8).join('、'))}${unmatched.length > 8 ? '…' : ''}）` : '';
  const newCols = [...new Set(Object.values(eiColMap).filter(m => m.isNew).map(m => m.target))];
  return `<div class="flex flex-wrap gap-x-4 gap-y-1">
    <span>数据共 <b>${total}</b> 条</span>
    <span>可匹配班级 <b class="text-green-600">${matched}</b> 人</span>
    ${newCols.length ? `<span>将新建列 <b class="text-primary">${esc(newCols.join('、'))}</b></span>` : ''}
    ${unmatchedTxt ? `<span>${unmatchedTxt}</span>` : ''}
    ${!unmatched.length ? '<span class="text-green-600">✓ 全部匹配成功</span>' : ''}
  </div>`;
}
function eiRefreshPreview() {
  const chips = document.getElementById('eiHeadChips'); if (chips) chips.innerHTML = eiChipsHTML();
  const pt = document.getElementById('eiPreviewTable'); if (pt) pt.innerHTML = eiPreviewHTML();
  const mi = document.getElementById('eiMatchInfo'); if (mi) mi.innerHTML = eiMatchInfoHTML();
  const btn = document.getElementById('eiImportBtn');
  if (btn) btn.disabled = !(eiRows.length > 1 && eiNameCol >= 0 && Object.keys(eiColMap).length > 0);
}
function eiAutoDetect() {
  eiNameCol = -1; eiClassCol = -1;
  eiHeaders.forEach((h, i) => {
    const s = String(h || '');
    if (eiNameCol < 0 && /姓名|名字|name|学生/i.test(s)) eiNameCol = i;
    if (eiClassCol < 0 && /班级|class/i.test(s)) eiClassCol = i;
  });
  if (eiNameCol < 0 && eiHeaders.length >= 1) eiNameCol = 0;
  eiAutoMap();
}
function eiAutoMap() {
  eiColMap = {};
  eiHeaders.forEach((h, i) => {
    if (i === eiNameCol || i === eiClassCol) return;
    const key = (h || '').trim();
    if (!key) return;
    const existing = examColumnByKey(key);
    if (existing) { eiColMap[i] = { target: key, type: existing.type }; return; }
    const isRank = /次|排名|rank|位次/i.test(key);
    eiColMap[i] = { target: key, type: isRank ? 'rank' : 'score', isNew: true };
  });
}
function eiSetColMap(colIndex, val) {
  if (val === '__skip__') { delete eiColMap[colIndex]; }
  else if (val.startsWith('new:')) {
    const type = val.split(':')[1] === 'rank' ? 'rank' : 'score';
    const header = (eiHeaders[colIndex] || ('列' + (colIndex + 1))).trim();
    eiColMap[colIndex] = { target: header, type, isNew: true };
  } else if (val.startsWith('map:')) {
    const key = val.slice(4);
    const c = examColumnByKey(key);
    eiColMap[colIndex] = { target: key, type: c ? c.type : 'score' };
  }
  eiRefreshPreview();
}
function eiLoadSheet(name) {
  if (!eiBook || !name) return;
  const ws = eiBook.Sheets[name];
  if (!ws) return;
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const idx = Math.max(0, (parseInt(eiHeaderRow, 10) || 1) - 1);
  const header = (raw[idx] || []).map(c => String(c ?? '').trim());
  const data = raw.slice(idx + 1).filter(r => Array.isArray(r) && r.some(c => c !== '' && c !== undefined && c !== null));
  eiRows = [header, ...data];
  eiHeaders = header;
  eiAutoDetect();
}
function eiOnFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  autoCreateExamFromFilename(file.name);
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['xlsx', 'xls'].includes(ext)) {
    if (typeof XLSX === 'undefined') { alert('Excel 解析库尚未加载，请刷新页面后再试'); return; }
    const r = new FileReader();
    r.onload = ev => {
      try {
        eiBook = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        eiSheets = eiBook.SheetNames;
        eiSheetName = eiSheets[0] || '';
        eiLoadSheet(eiSheetName);
        eiRenderBody();
      } catch (err) { alert('解析 Excel 失败：' + (err && err.message ? err.message : err)); }
    };
    r.readAsArrayBuffer(file);
  } else {
    const r = new FileReader();
    r.onload = ev => {
      eiBook = null; eiSheets = []; eiSheetName = '';
      eiRows = parseCSV(ev.target.result);
      eiHeaders = eiRows[0] || [];
      eiAutoDetect();
      eiRenderBody();
    };
    r.readAsText(file);
  }
}
function attachEIWizard() {
  const file = document.getElementById('eiFile'); if (file) file.addEventListener('change', eiOnFile);
  const sheet = document.getElementById('eiSheet');
  if (sheet) sheet.addEventListener('change', () => { eiSheetName = sheet.value; eiLoadSheet(eiSheetName); eiRenderBody(); });
  const hr = document.getElementById('eiHeaderRow');
  if (hr) hr.addEventListener('change', () => { eiHeaderRow = parseInt(hr.value, 10) || 1; if (eiSheetName) { eiLoadSheet(eiSheetName); eiRenderBody(); } });
  const paste = document.getElementById('eiPaste');
  if (paste) paste.addEventListener('input', () => {
    const text = paste.value.trim();
    if (!text) { eiRows = []; eiHeaders = []; eiColMap = {}; eiRenderBody(); return; }
    eiBook = null; eiSheets = []; eiSheetName = '';
    eiRows = parseCSV(text);
    eiHeaders = eiRows[0] || [];
    eiAutoDetect();
    eiRenderBody();
  });
  const nc = document.getElementById('eiNameCol'); if (nc) nc.addEventListener('change', () => { eiNameCol = parseInt(nc.value, 10); eiAutoMap(); eiRenderBody(); });
  const cc = document.getElementById('eiClassCol'); if (cc) cc.addEventListener('change', () => { eiClassCol = parseInt(cc.value, 10); eiAutoMap(); eiRenderBody(); });
  const ex = document.getElementById('eiExam'); if (ex) ex.addEventListener('change', () => { eiExamId = ex.value; });
  eiRefreshPreview();
}
function ensureExamClass(name) {
  if (!name) return null;
  if (!state.examData.classes) state.examData.classes = [];
  let c = state.examData.classes.find(x => x.name === name);
  if (!c) { c = { id: name, name, gender: {} }; state.examData.classes.push(c); }
  if (!c.gender || typeof c.gender !== 'object') c.gender = {};
  return c.id;
}
function doExamImportWizard() {
  const examId = eiExamId;
  if (!examId) return alert('请选择考试');
  if (eiNameCol < 0) return alert('请指定姓名列');
  const mapEntries = Object.entries(eiColMap);
  if (!mapEntries.length) return alert('请至少映射一个数据列');
  if (eiRows.length < 2) return alert('没有可导入的数据');
  const newCreated = [];
  mapEntries.forEach(([idx, m]) => {
    if (m.isNew && !examColumnByKey(m.target)) {
      if (addExamColumn(m.target, m.type)) newCreated.push(m.target);
    }
  });
  let n = 0; const unmatched = [];
  eiRows.slice(1).forEach(r => {
    const name = String(r[eiNameCol] ?? '').trim();
    if (!name) return;
    let cid = null;
    if (eiClassCol >= 0) { const cv = String(r[eiClassCol] ?? '').trim(); cid = ensureExamClass(cv); }
    if (!cid) cid = findClassIdByName(name);
    if (!cid) { unmatched.push(name); return; }
    mapEntries.forEach(([idx, m]) => {
      const raw = String(r[idx] ?? '').trim();
      if (raw === '') return;
      const sc = parseFloat(raw);
      if (isNaN(sc)) return;
      const ex = state.examData.records.find(x => x.examId === examId && x.classId === cid && x.studentName === name && x.subject === m.target);
      if (ex) { ex.score = sc; ex.colType = m.type; }
      else state.examData.records.push({ id: uid(), examId, classId: cid, studentName: name, subject: m.target, score: sc, colType: m.type });
      n++;
    });
  });
  save(); closeModal(); render();
  let msg = `成功导入 / 更新 ${n} 条成绩记录`;
  if (newCreated.length) msg += `\n新建列：${newCreated.join('、')}`;
  if (unmatched.length) msg += `\n未匹配到班级名单（已跳过）：${unmatched.slice(0, 15).join('、')}${unmatched.length > 15 ? '…' : ''}`;
  alert(msg);
}

// ---------- 导入「处理工具」导出的成品成绩（固定格式，按班级+姓名匹配）----------
let piRows = [], piHeaders = [], piExamId = '', piNewName = '', piNewDate = '', piFileName = '', piExtraInfo = '';
function piNormalizeClass(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const classes = [...new Set((state.students || []).map(x => x.class).filter(Boolean))];
  if (classes.includes(s)) return s;
  const m = s.match(/(\d+)/);
  if (m) { const cand = m[1] + '班'; if (classes.includes(cand)) return cand; }
  return s;
}
// 按「班级 + 姓名」匹配到学生管理中的真实学生，返回其班级 id（= 班级名），否则 null
function piMatchStudent(name, rawClass) {
  const cls = piNormalizeClass(rawClass);
  const s = (state.students || []).find(x => x.name === name && x.class === cls);
  return s ? cls : null;
}
function piDetect(headers) {
  return (headers || []).map((h, i) => {
    const s = String(h || '').trim();
    let kind = 'score';
    if (/姓名|名字|name|学生/i.test(s)) kind = 'name';
    else if (/班级|class/i.test(s)) kind = 'class';
    else if (/次|排名|rank|位次/i.test(s)) kind = 'rank';
    else kind = 'score';
    const label = (kind === 'score' || kind === 'rank') ? olNormalizeSubjectLabel(s) : s;
    return { i, header: s, kind, label };
  });
}
function openProductImport() {
  piRows = []; piHeaders = []; piFileName = '';
  piExamId = '';
  piNewName = ''; piNewDate = '';
  openModal('📦 导入工具成品成绩', '<div id="piHost"></div>', 'xl');
  piRender();
}
function piRender() {
  const host = document.querySelector('#modal-root .p-6'); if (!host) return;
  const hasData = piRows.length > 0;
  const preview = hasData ? piBuildPreviewHTML() : '<p class="text-xs text-gray-400">请选择工具导出的成品 CSV（也可选 .xlsx/.xls，会自动转为 CSV 解析）。</p>';
  host.innerHTML = `
  <div class="space-y-4">
    <p class="text-xs text-gray-400 leading-relaxed">适用于「成绩处理工具」导出的固定格式 CSV。系统会自动识别列、按 <b>班级 + 姓名</b> 与「学生管理」逐一匹配后再保存；班级或姓名对不上的数据会列出并跳过。请先填写本次考试的名称和日期，再选择文件。</p>
    <div class="bg-gray-50 rounded-xl p-4 space-y-3">
      <div class="flex flex-wrap gap-3 items-end">
        <div class="flex-1 min-w-[160px]">
          <label class="block text-xs text-gray-500 mb-1">考试名称 *</label>
          <input id="piNewName" type="text" value="${esc(piNewName)}" class="w-full border rounded-lg p-2 text-sm" placeholder="如：期中">
        </div>
        <div class="flex-1 min-w-[160px]">
          <label class="block text-xs text-gray-500 mb-1">考试日期</label>
          <input id="piNewDate" type="date" value="${esc(piNewDate)}" class="w-full border rounded-lg p-2 text-sm">
        </div>
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">选择工具导出的成品 CSV</label>
        <input id="piFile" type="file" accept=".csv,.txt,.xlsx,.xls" class="w-full text-sm">
      </div>
    </div>
    <div id="piPreview">${preview}</div>
    <div class="flex gap-3 pt-1">
      <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal()">取消</button>
      <button id="piImportBtn" class="flex-1 bg-emerald-600 text-white py-2 rounded-full hover:bg-emerald-700 disabled:opacity-40" onclick="doProductImport()" ${hasData ? '' : 'disabled'}>导入并保存</button>
    </div>
  </div>`;
  const f = document.getElementById('piFile'); if (f) f.addEventListener('change', piOnFile);
  const nIn = document.getElementById('piNewName'); if (nIn) nIn.addEventListener('input', () => { piNewName = nIn.value.trim(); });
  const dIn = document.getElementById('piNewDate'); if (dIn) dIn.addEventListener('change', () => { piNewDate = dIn.value.trim(); });
}
function piOnFile(e) {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  piFileName = file.name;
  if (!piNewName || !piNewDate) {
    const info = parseExamNameFromFilename(file.name);
    if (!piNewName) piNewName = info.name || '';
    if (!piNewDate) piNewDate = info.date || '';
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['xlsx', 'xls'].includes(ext)) {
    if (typeof XLSX === 'undefined') { alert('Excel 解析库尚未加载，请刷新页面后再试'); return; }
    const r = new FileReader();
    r.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const rows = raw.filter(r => Array.isArray(r) && r.some(c => c !== '' && c !== undefined && c !== null));
        piHeaders = rows[0] || []; piRows = rows.slice(1); piRender();
      } catch (err) { alert('解析 Excel 失败：' + (err && err.message ? err.message : err)); }
    };
    r.readAsArrayBuffer(file);
  } else {
    const r = new FileReader();
    r.onload = ev => { const rows = parseCSV(ev.target.result); piHeaders = rows[0] || []; piRows = rows.slice(1); piRender(); };
    r.readAsText(file);
  }
}
function piBuildPreviewHTML() {
  const cols = piDetect(piHeaders);
  const nameCol = cols.find(c => c.kind === 'name');
  const classCol = cols.find(c => c.kind === 'class');
  const dataCols = cols.filter(c => c.kind === 'score' || c.kind === 'rank');
  if (!nameCol) return '<p class="text-xs text-red-500">未识别到「姓名」列，请检查文件表头。</p>';
  if (!dataCols.length) return '<p class="text-xs text-red-500">未识别到成绩 / 排名列。</p>';
  let total = 0, matched = 0; const byClass = {}; const unmatched = [];
  piRows.forEach(r => {
    const name = String(r[nameCol.i] ?? '').trim(); if (!name) return;
    const rawClass = classCol ? String(r[classCol.i] ?? '').trim() : '';
    const cid = classCol ? piMatchStudent(name, rawClass) : findClassIdByName(name);
    total++;
    if (cid) { matched++; byClass[cid] = (byClass[cid] || 0) + 1; } else unmatched.push(name + (rawClass ? ('（' + rawClass + '）') : '（无班级）'));
  });
  const headTxt = cols.map(c => c.header).join(' | ');
  const rowsHtml = piRows.slice(0, 10).map(r => {
    const name = String(r[nameCol.i] ?? '').trim();
    const rawClass = classCol ? String(r[classCol.i] ?? '').trim() : '';
    const cid = classCol ? piMatchStudent(name, rawClass) : findClassIdByName(name);
    const ok = cid ? 'style="background:#f0fdf4"' : 'style="background:#fef2f2"';
    return `<tr class="border-t"><td class="px-2 py-1" ${ok}>${esc(name)}</td><td class="px-2 py-1" ${ok}>${esc(rawClass || '-')}</td><td class="px-2 py-1" ${ok}>${cid ? '✓ ' + esc(cid) : '✗ 未匹配'}</td></tr>`;
  }).join('');
  const byClassTxt = Object.entries(byClass).map(([c, v]) => `${c} ${v}人`).join('，');
  return `
    <div class="text-xs text-gray-500 mb-1">识别到列：${esc(headTxt)}</div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
      <span>数据共 <b>${total}</b> 人</span>
      <span class="text-green-600">按班级 + 姓名匹配 <b>${matched}</b> 人 ${byClassTxt ? '（' + byClassTxt + '）' : ''}</span>
      ${unmatched.length ? `<span class="text-red-500">未匹配 <b>${unmatched.length}</b> 人（${esc(unmatched.slice(0, 8).join('、'))}${unmatched.length > 8 ? '…' : ''}）</span>` : '<span class="text-green-600">✓ 全部匹配成功</span>'}
    </div>
    <div class="overflow-x-auto border rounded-xl"><table class="w-full text-xs"><thead><tr class="bg-gray-100 text-gray-600"><th class="px-2 py-1.5 text-left">姓名</th><th class="px-2 py-1.5 text-left">班级(文件)</th><th class="px-2 py-1.5 text-left">匹配结果</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="text-[10px] text-gray-400 p-2">仅预览前 10 行，共 ${total} 人</div></div>`;
}
function doProductImport() {
  if (!piNewName) return alert('请输入本次考试的名称。');
  let ex = state.examData.exams.find(e => e.name === piNewName && (e.date || '') === (piNewDate || ''));
  if (!ex && piNewName) {
    ex = state.examData.exams.find(e => e.name === piNewName && (!(e.date || '') || !piNewDate));
  }
  if (!ex) {
    state.examData.exams.push({ id: uid(), name: piNewName, date: piNewDate });
    ex = state.examData.exams[state.examData.exams.length - 1];
  }
  const targetExamId = ex.id;
  if (!piRows.length) return alert('没有可导入的数据，请先选择文件。');
  const cols = piDetect(piHeaders);
  const nameCol = cols.find(c => c.kind === 'name');
  const classCol = cols.find(c => c.kind === 'class');
  const dataCols = cols.filter(c => c.kind === 'score' || c.kind === 'rank');
  if (!nameCol) return alert('未识别到姓名列');
  if (!dataCols.length) return alert('未识别到成绩 / 排名列');
  const missingCols = dataCols.filter(c => !examColumnByKey(c.label));
  if (missingCols.length) {
    return alert('以下列尚未在「管理列」中配置，请先添加后再保存：\n' + missingCols.map(c => c.label).join('、'));
  }
  let n = 0; const matchedByClass = {}; const unmatched = [];
  piRows.forEach(r => {
    const name = String(r[nameCol.i] ?? '').trim();
    if (!name) return;
    const rawClass = classCol ? String(r[classCol.i] ?? '').trim() : '';
    const classId = classCol ? piMatchStudent(name, rawClass) : findClassIdByName(name);
    if (!classId) { unmatched.push(name + (rawClass ? ('（' + rawClass + '）') : '（无班级）')); return; }
    matchedByClass[classId] = (matchedByClass[classId] || 0) + 1;
    dataCols.forEach(c => {
      const raw = String(r[c.i] ?? '').trim();
      if (raw === '') return;
      const sc = parseFloat(raw);
      if (isNaN(sc)) return;
      const ex = state.examData.records.find(x => x.examId === targetExamId && x.classId === classId && x.studentName === name && x.subject === c.label);
      if (ex) { ex.score = sc; ex.colType = c.kind; }
      else state.examData.records.push({ id: uid(), examId: targetExamId, classId, studentName: name, subject: c.label, score: sc, colType: c.kind });
      n++;
    });
  });
  Object.keys(matchedByClass).forEach(cid => ensureExamClass(cid));
  save(); closeModal();
  if (currentRoute === 'exam') {
    examTab = 'query';
    eqExamId = targetExamId;
    eqClassIds = examClassesSafe().map(c => c.id);
    eqSearch = '';
  }
  render();
  let msg = `✅ 成功导入 / 更新 ${n} 条记录（已按「班级 + 姓名」与「学生管理」匹配）`;
  const byClassTxt = Object.entries(matchedByClass).map(([c, v]) => `${c} ${v}人`).join('，');
  if (byClassTxt) msg += `\n匹配成功：${byClassTxt}`;
  if (unmatched.length) msg += `\n未匹配（班级或姓名未命中，已跳过）：${unmatched.slice(0, 20).join('、')}${unmatched.length > 20 ? '…' : ''}`;
  if (piExtraInfo) msg += `\n${piExtraInfo}`;
  alert(msg);
}

// ---------- 在线处理成绩（整合自离线「成绩处理工具」，全流程浏览器端，不增加服务器负担）----------
// 规范化科目/排名列名：语文成绩→语文，数学分数→数学，语文名次→语文校次，校次→校次
function olNormalizeSubjectLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  // 分数列：去掉成绩/分数/得分/原始分/标准分后缀
  const scoreStripped = s.replace(/(成绩|分数|得分|原始分|标准分)$/i, '').trim();
  if (scoreStripped !== s && scoreStripped.length > 1 && !/^(总|全|综合)$/i.test(scoreStripped)) return scoreStripped;
  // 排名列：X名次/X排名→X校次；名次/排名→校次
  const rankMatch = s.match(/^(.*?)(校次|名次|排名)$/);
  if (rankMatch) {
    const prefix = rankMatch[1].trim();
    return prefix ? prefix + '校次' : '校次';
  }
  return s;
}
// 根据已配置的管理列，为原始表头推荐新表头（score/rank 只匹配管理列中的同类型列，不会自动新建）
function olSuggestNewHeader(kind, header, label) {
  const cols = examColumns().filter(c => c.enabled);
  if (kind === 'score') {
    const exact = cols.find(c => c.type === 'score' && c.key === label);
    if (exact) return exact.key;
    const fuzzy = cols.filter(c => c.type === 'score').find(c => label.includes(c.key) || c.key.includes(label));
    if (fuzzy) return fuzzy.key;
  } else if (kind === 'rank') {
    const exact = cols.find(c => c.type === 'rank' && c.key === label);
    if (exact) return exact.key;
    const prefix = label.replace(/校次$/, '').trim();
    const fuzzy = cols.filter(c => c.type === 'rank').find(c => {
      if (label.includes(c.key) || c.key.includes(label)) return true;
      if (prefix && (c.key.includes(prefix) || prefix.includes(c.key))) return true;
      return false;
    });
    if (fuzzy) return fuzzy.key;
  }
  return '';
}
// 诊断：未匹配列的原因（区分「管理列没有」与「有但禁用」）
function olDiagnoseMismatch(def) {
  if (def.kind !== 'score' && def.kind !== 'rank') return '';
  const all = examColumns().filter(c => c.type === def.kind);
  const exact = all.find(c => c.key === def.label);
  const fuzzy = all.find(c => def.label.includes(c.key) || c.key.includes(def.label));
  const hit = exact || fuzzy;
  if (!hit) return `管理列里没有「${def.label}」`;
  if (!hit.enabled) return `管理列里有「${hit.key}」但已禁用`;
  return '';
}
// 纯计算：列识别。返回 [{index, header, kind, label}]，kind: skip|name|class|score|rank
function olDetectColumns(headers) {
  const list = (headers || []).map((h, i) => {
    const s = String(h == null ? '' : h).trim();
    let kind = 'score', label = s;
    if (/考号|学号|座位号|id|序号/i.test(s)) { kind = 'skip'; label = s; }
    else if (/姓名|名字|name|学生/i.test(s)) { kind = 'name'; label = '姓名'; }
    else if (/次|排名|rank|位次/i.test(s)) { kind = 'rank'; label = s; }
    else if (/班级|class/i.test(s)) { kind = 'class'; label = '班级'; }
    else { kind = 'score'; label = s; }
    return { index: i, header: s, kind, label, isClassCandidate: (kind === 'class') };
  });
  const classCands = list.filter(c => c.isClassCandidate);
  if (classCands.length > 1) {
    const preferred = classCands.filter(c => /原|行政/.test(c.header))[0];
    const keep = preferred || classCands[0];
    classCands.forEach(c => { if (c !== keep) { c.kind = 'skip'; c.label = c.header; c.isClassCandidate = false; } });
  }
  return list;
}
// 纯计算：按全量行该科分数降序排名，同分同名次
function olComputeSubjectRank(rows, scoreIdx) {
  const scored = [];
  (rows || []).forEach((r, ri) => {
    const v = parseFloat(String(r[scoreIdx] == null ? '' : r[scoreIdx]).trim());
    if (!isNaN(v)) scored.push({ ri, v });
  });
  scored.sort((a, b) => b.v - a.v);
  const rankByIdx = {}; let lastV = null, lastRank = 0;
  scored.forEach((o, i) => {
    if (o.v === lastV) rankByIdx[o.ri] = lastRank;
    else { lastRank = i + 1; lastV = o.v; rankByIdx[o.ri] = lastRank; }
  });
  return rankByIdx;
}
// 纯计算：构建成品（计算单科校次 + 只保留所选班级），只输出已匹配到管理列的列
function olBuildOutput(rows, colDefs, selectedClasses, classNorm) {
  const nameDef = colDefs.find(c => c.kind === 'name');
  const classDef = colDefs.find(c => c.kind === 'class');
  const scoreDefs = colDefs.filter(c => c.kind === 'score' && c.newHeader);
  const rankDefs = colDefs.filter(c => c.kind === 'rank' && c.newHeader);
  if (!nameDef) throw new Error('未找到姓名列，请在列映射中指定一列作为「姓名」');
  if (!classDef) throw new Error('未找到班级列，无法筛选你的班级');
  const subjectScoreDefs = scoreDefs.filter(d => d.newHeader !== '总分');
  // 单科校次是系统按全年级计算得出的派生列，始终计算并输出（非文件列，不受管理列开关影响）
  const subjectRanks = subjectScoreDefs
    .map(d => ({ def: d, map: olComputeSubjectRank(rows, d.index), target: d.newHeader + '校次' }));
  const sel = new Set((selectedClasses || []).map(s => String(s).trim()));
  let totalAll = 0, matched = 0; const outRows = [];
  (rows || []).forEach((r, ri) => {
    const nm = String(r[nameDef.index] == null ? '' : r[nameDef.index]).trim();
    if (!nm) return;
    totalAll++;
    const cv = String(r[classDef.index] == null ? '' : r[classDef.index]).trim();
    const norm = classNorm ? classNorm(cv) : cv;
    if (!sel.has(norm)) return;
    matched++;
    const row = [nm, norm];
    scoreDefs.forEach(d => row.push(String(r[d.index] == null ? '' : r[d.index]).trim()));
    rankDefs.forEach(d => row.push(String(r[d.index] == null ? '' : r[d.index]).trim()));
    subjectRanks.forEach(sr => row.push(sr.map[ri] != null ? sr.map[ri] : ''));
    outRows.push(row);
  });
  const outHeaders = ['姓名', '班级'];
  scoreDefs.forEach(d => outHeaders.push(d.newHeader));
  rankDefs.forEach(d => outHeaders.push(d.newHeader));
  subjectRanks.forEach(sr => outHeaders.push(sr.target));
  return { headers: outHeaders, rows: outRows, stats: { totalRows: totalAll, matched } };
}
// 取得可选班级（优先学生管理中的班级，确保能匹配）
function olAllClasses() {
  const set = new Set((state.students || []).map(x => x.class).filter(Boolean));
  if (!set.size) (state.examData.classes || []).forEach(c => set.add(c.id));
  return [...set];
}
let olHeaders = [], olRows = [], olKindMap = {}, olNewHeaderMap = {}, olSelClasses = [], olName = '', olDate = '';
function olOnFile(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const done = (headers, rows) => {
    olHeaders = headers; olRows = rows;
    const det = olDetectColumns(olHeaders);
    olKindMap = {}; det.forEach(c => { olKindMap[c.index] = c.kind; });
    olNewHeaderMap = {};
    olColDefs().forEach(c => {
      if (c.kind === 'score' || c.kind === 'rank') {
        const sug = olSuggestNewHeader(c.kind, c.header, c.label);
        if (sug) olNewHeaderMap[c.index] = sug;
      }
    });
    const all = olAllClasses();
    olSelClasses = all.filter(c => /9班|10班/.test(c));
    if (!olSelClasses.length) olSelClasses = all.slice();
    const info = parseExamNameFromFilename(file.name);
    olName = info.name || ''; olDate = info.date || '';
    olRender();
  };
  if (['xlsx', 'xls'].includes(ext)) {
    if (typeof XLSX === 'undefined') { alert('Excel 解析库尚未加载，请刷新页面后再试'); return; }
    const r = new FileReader();
    r.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const header = (raw[0] || []).map(c => String(c == null ? '' : c).trim());
        const rows = raw.slice(1).filter(r => Array.isArray(r) && r.some(c => c !== '' && c !== undefined && c !== null));
        done(header, rows.map(r => { const o = r.slice(); while (o.length < header.length) o.push(''); return o; }));
      } catch (e) { alert('解析 Excel 失败：' + (e && e.message ? e.message : e)); }
    };
    r.readAsArrayBuffer(file);
  } else {
    const r = new FileReader();
    r.onload = ev => { const rows = parseCSV(ev.target.result); done(rows[0] || [], rows.slice(1)); };
    r.readAsText(file);
  }
}
function olColDefs() {
  return olHeaders.map((h, i) => {
    const kind = olKindMap[i] || 'score';
    const s = String(h || '').trim();
    let label = s;
    if (kind === 'name') label = '姓名';
    else if (kind === 'class') label = '班级';
    else if (kind === 'score' || kind === 'rank') label = olNormalizeSubjectLabel(s);
    const newHeader = (kind === 'score' || kind === 'rank') ? (olNewHeaderMap[i] || '') : '';
    return { index: i, header: s, kind, label, newHeader };
  });
}
function olSetKind(i, kind) {
  olKindMap[i] = kind;
  const def = olColDefs().find(c => c.index === i);
  if (def && (kind === 'score' || kind === 'rank')) {
    const sug = olSuggestNewHeader(kind, def.header, def.label);
    olNewHeaderMap[i] = sug || '';
  } else {
    delete olNewHeaderMap[i];
  }
  olRender();
}
function olSetNewHeader(i, val) {
  if (val) olNewHeaderMap[i] = val;
  else delete olNewHeaderMap[i];
  olRender();
}
function olToggleClass(c, on) {
  if (on) { if (!olSelClasses.includes(c)) olSelClasses.push(c); }
  else olSelClasses = olSelClasses.filter(x => x !== c);
  olRender();
}
function olBuildProduct() {
  const defs = olColDefs().filter(c => c.kind !== 'skip');
  return olBuildOutput(olRows, defs, olSelClasses, piNormalizeClass);
}
// 确保单科校次等派生排名列在管理列中存在（派生列由系统按全年级计算，非文件列，因此允许自动创建/启用）
function olEnsureDerivedRankColumns(headers) {
  const created = [];
  (headers || []).forEach(h => {
    if (typeof h !== 'string') return;
    if (/校次$/.test(h) && h !== '校次') {
      const c = examColumnByKey(h);
      if (!c) { if (addExamColumn(h, 'rank')) created.push(h); }
      else if (!c.enabled) { c.enabled = true; }
    }
  });
  if (created.length) save();
  return created;
}
function olRender() {
  const panel = document.getElementById('olPanel'); if (!panel) return;
  if (!olHeaders.length) { panel.innerHTML = ''; return; }
  // 记忆列识别容器的滚动位置，避免 select 切换后重绘导致回跳
  const oldColScroll = document.getElementById('olColScroll');
  const savedScroll = oldColScroll ? { top: oldColScroll.scrollTop, left: oldColScroll.scrollLeft } : null;
  const defs = olColDefs();
  const kindLabel = { skip: '跳过', name: '姓名', class: '班级', score: '分数', rank: '排名' };
  const kindOpts = (cur) => ['skip', 'name', 'class', 'score', 'rank'].map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${kindLabel[k]}</option>`).join('');
  const newHeaderOpts = (def) => {
    if (def.kind !== 'score' && def.kind !== 'rank') return '';
    const cols = examColumns().filter(c => c.type === def.kind && c.enabled);
    return `<option value="">（不保存）</option>` + cols.map(c => `<option value="${esc(c.key)}" ${c.key === def.newHeader ? 'selected' : ''}>${esc(c.key)}</option>`).join('');
  };
  const colRows = defs.map(d => {
    const nhCell = (d.kind === 'score' || d.kind === 'rank')
      ? `<select class="border rounded p-1 text-xs ${d.newHeader ? '' : 'text-gray-400'}" onchange="olSetNewHeader(${d.index}, this.value)">${newHeaderOpts(d)}</select>`
      : '<span class="text-gray-300 text-xs">—</span>';
    return `<tr class="border-t"><td class="px-2 py-1 text-xs">${esc(d.header)}</td><td class="px-2 py-1"><select class="border rounded p-1 text-xs" onchange="olSetKind(${d.index}, this.value)">${kindOpts(d.kind)}</select></td><td class="px-2 py-1">${nhCell}</td></tr>`;
  }).join('');
  const skippedDiag = defs.filter(d => (d.kind === 'score' || d.kind === 'rank') && !d.newHeader)
    .map(d => ({ header: esc(d.header), reason: olDiagnoseMismatch(d) }));
  const allClasses = olAllClasses();
  const clsChips = allClasses.map(c => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer"><input type="checkbox" onchange="olToggleClass(${esc(JSON.stringify(c))}, this.checked)" ${olSelClasses.includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('');
  let preview = '<p class="text-xs text-gray-400">请勾选要保留的班级。</p>';
  if (olSelClasses.length) {
    try {
      const product = olBuildProduct();
      let total = 0, matched = 0; const unmatched = []; const byClass = {};
      product.rows.forEach(r => {
        const name = String(r[0] || '').trim(); const cid = String(r[1] || '').trim();
        total++;
        if (piMatchStudent(name, cid)) { matched++; byClass[cid] = (byClass[cid] || 0) + 1; } else unmatched.push(name + '（' + cid + '）');
      });
      const headTxt = product.headers.join(' | ');
      const rowsHtml = product.rows.slice(0, 8).map(r => {
        const name = String(r[0] || '').trim(); const cid = String(r[1] || '').trim();
        const ok = piMatchStudent(name, cid);
        return `<tr class="border-t"><td class="px-2 py-1" style="background:${ok ? '#f0fdf4' : '#fef2f2'}">${esc(name)}</td><td class="px-2 py-1" style="background:${ok ? '#f0fdf4' : '#fef2f2'}">${esc(cid)}</td><td class="px-2 py-1" style="background:${ok ? '#f0fdf4' : '#fef2f2'}">${ok ? '✓' : '✗ 未匹配'}</td></tr>`;
      }).join('');
      const byClassTxt = Object.entries(byClass).map(([c, v]) => `${c} ${v}人`).join('，');
      preview = `
        <div class="text-xs text-gray-500 mb-1">输出列：${esc(headTxt)}</div>
        ${skippedDiag.length ? `<div class="text-xs text-amber-600 mb-1">以下列未匹配到管理列，将不保存：<ul class="list-disc pl-5 mt-1 space-y-0.5">${skippedDiag.map(d => `<li>${d.header}：<b>${esc(d.reason)}</b></li>`).join('')}</ul>如需导入，请到「管理列」补全对应科目后重新选择文件。</div>` : ''}
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
          <span>原始数据 <b>${product.stats.totalRows}</b> 行</span>
          <span class="text-green-600">命中并保留 <b>${matched}</b> 人 ${byClassTxt ? '（' + byClassTxt + '）' : ''}</span>
          ${unmatched.length ? `<span class="text-red-500">未匹配 <b>${unmatched.length}</b> 人（${esc(unmatched.slice(0, 6).join('、'))}${unmatched.length > 6 ? '…' : ''}）</span>` : '<span class="text-green-600">✓ 全部匹配</span>'}
          <span class="text-gray-400">单科校次已按全年级排名计算</span>
        </div>
        <div class="overflow-x-auto border rounded-xl"><table class="w-full text-xs"><thead><tr class="bg-gray-100 text-gray-600"><th class="px-2 py-1.5 text-left">姓名</th><th class="px-2 py-1.5 text-left">班级</th><th class="px-2 py-1.5 text-left">匹配</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="text-[10px] text-gray-400 p-2">仅预览前 8 行，共 ${matched} 人</div></div>`;
    } catch (e) { preview = `<p class="text-xs text-red-500">${esc(e.message || e)}</p>`; }
  }
  panel.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div class="text-xs text-gray-500 mb-1">列识别（如有误请调整）</div>
        <div id="olColScroll" class="overflow-x-auto border rounded-xl max-h-48"><table class="w-full text-xs"><thead><tr class="bg-gray-100 text-gray-600"><th class="px-2 py-1.5 text-left">原表头</th><th class="px-2 py-1.5 text-left">识别为</th><th class="px-2 py-1.5 text-left">新表头</th></tr></thead><tbody>${colRows}</tbody></table></div>
      </div>
      <div class="space-y-3">
        <div>
          <div class="text-xs text-gray-500 mb-1">保留班级（默认只选你的班）</div>
          <div class="flex flex-wrap gap-2">${clsChips}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 mb-1">本次考试名称 *</div>
          <input id="olName" type="text" class="w-full border rounded-lg p-2 text-sm" value="${esc(olName)}" placeholder="如：期中">
        </div>
        <div>
          <div class="text-xs text-gray-500 mb-1">考试日期</div>
          <input id="olDate" type="date" class="w-full border rounded-lg p-2 text-sm" value="${esc(olDate)}">
        </div>
      </div>
    </div>
    <div class="mt-4">
      <div class="text-xs text-gray-500 mb-1">预览（自动计算单科校次并只保留所选班级）</div>
      ${preview}
    </div>
    <div class="flex gap-3 pt-3">
      <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('olFile').value=''; olHeaders=[]; olRows=[]; olRender();">重新选择文件</button>
      <button class="flex-1 bg-emerald-600 text-white py-2 rounded-full hover:bg-emerald-700" onclick="olSave()">处理并保存</button>
    </div>`;
  if (savedScroll) {
    const el = document.getElementById('olColScroll');
    if (el) { el.scrollTop = savedScroll.top; el.scrollLeft = savedScroll.left; }
  }
}
function olSave() {
  const nameIn = document.getElementById('olName');
  const dateIn = document.getElementById('olDate');
  olName = nameIn ? nameIn.value.trim() : olName;
  olDate = dateIn ? dateIn.value.trim() : olDate;
  if (!olName) return alert('请输入本次考试的名称。');
  if (!olSelClasses.length) return alert('请至少选择一个要保留的班级。');
  let product;
  try { product = olBuildProduct(); } catch (e) { return alert(e.message || e); }
  if (!product.rows.length) return alert('没有可导入的数据，请检查班级选择或列识别。');
  const dataHeaders = product.headers.slice(2);
  if (!dataHeaders.length) return alert('没有可保存的成绩列。请先在「管理列」中配置科目/排名列，并在上方「列识别 → 新表头」中为原始表头选择对应的目标列。');
  // 复用「导入工具成品成绩」的保存通道：成品格式一致，按班级+姓名匹配写入
  piHeaders = product.headers; piRows = product.rows;
  piNewName = olName; piNewDate = olDate;
  piExtraInfo = '';
  const created = olEnsureDerivedRankColumns(product.headers);
  if (created.length) piExtraInfo = `已自动创建单科校次列：${created.join('、')}（派生列，由系统按全年级排名计算，可在「管理列」中关闭显示）`;
  doProductImport();
}

// ---------- 成绩查询 ----------
function fmtExamCell(v, isRank) {
  if (v === '' || v === undefined || v === null || (typeof v === 'number' && isNaN(v))) return '—';
  const n = Number(v);
  if (isNaN(n)) return esc(String(v));
  if (isRank || Math.round(n) === n) return String(Math.round(n));
  return n.toFixed(1).replace(/\.0$/, '');
}
function renderExamQuery() {
  const exams = state.examData.exams;
  if (!exams.length) return `<div class="bg-white rounded-2xl p-10 text-center shadow-sm"><div class="text-4xl mb-3">📋</div><div class="font-bold text-gray-800">还没有考试数据</div><p class="text-sm text-gray-500 mt-2">先到「成绩上传」添加考试并导入成绩。</p></div>`;
  if (!eqExamId || !exams.find(e => e.id === eqExamId)) eqExamId = exams[exams.length - 1].id;
  const examOpts = exams.map(e => `<option value="${e.id}" ${e.id === eqExamId ? 'selected' : ''}>${esc(e.name)}（${esc(e.date || '')}）</option>`).join('');
  if (!eqClassIds.length) eqClassIds = examClassesSafe().map(c => c.id);
  const clsChk = examClassesSafe().map(c => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer"><input type="checkbox" class="eq-cls" data-lock-allow value="${c.id}" ${eqClassIds.includes(c.id) ? 'checked' : ''} onchange="eqCollect();"> ${esc(c.name)}</label>`).join('');
  const allCols = examColumns().filter(c => c.enabled);
  const colChk = allCols.map(c => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer whitespace-nowrap"><input type="checkbox" class="eq-col" data-lock-allow value="${esc(c.key)}" ${eqHiddenCols.has(c.key) ? '' : 'checked'} onchange="eqCollect();"> ${esc(c.key)}</label>`).join('');
  const sortOpts = [{k:'',l:'默认（班级/姓名）'},{k:'classId',l:'班级'},{k:'name',l:'姓名'},...allCols.map(c=>({k:c.key,l:c.key+(c.type==='rank'?'·排名':'')}))].map(o=>`<option value="${esc(o.k)}" ${eqSortCol===o.k?'selected':''}>${esc(o.l)}</option>`).join('');
  return `
  <div class="space-y-4">
    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4 overflow-x-auto">
      <div class="min-w-[720px]">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">选择考试</label>
            <select id="eqExam" data-lock-allow class="w-full border rounded-lg p-2 text-sm" onchange="eqCollect();">${examOpts}</select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">班级</label>
            <div class="flex flex-wrap gap-2">${clsChk}</div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">搜索学生姓名</label>
            <input id="eqSearch" data-lock-allow type="text" class="w-full border rounded-lg p-2 text-sm" placeholder="输入姓名，如：张明轩" value="${esc(eqSearch)}" oninput="eqCollect();">
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">排序</label>
            <div class="flex gap-2">
              <select id="eqSortCol" data-lock-allow class="flex-1 border rounded-lg p-2 text-sm" onchange="eqCollect();">${sortOpts}</select>
              <button class="border rounded-lg px-3 text-sm hover:bg-gray-50" onclick="eqSortDesc=!eqSortDesc; eqCollect();" title="切换升序/降序">${eqSortDesc ? '↓' : '↑'}</button>
            </div>
          </div>
        </div>
        <div class="mt-4">
          <label class="block text-xs text-gray-500 mb-1">显示列</label>
          <div class="flex flex-wrap gap-2">${colChk}</div>
        </div>
      </div>
    </div>
    <div id="eqTableWrap">${renderExamQueryTable()}</div>
  </div>`;
}
function eqCollect() {
  eqExamId = document.getElementById('eqExam').value;
  eqClassIds = Array.from(document.querySelectorAll('.eq-cls:checked')).map(b => b.value);
  eqSearch = (document.getElementById('eqSearch').value || '').trim();
  eqSortCol = document.getElementById('eqSortCol').value;
  document.querySelectorAll('.eq-col').forEach(b => {
    if (b.checked) eqHiddenCols.delete(b.value); else eqHiddenCols.add(b.value);
  });
  eqRerenderTable();
}
function eqExportCSV() {
  if (!eqExamId) return;
  const cols = examColumns().filter(c => c.enabled && !eqHiddenCols.has(c.key));
  const data = eqBuildRows();
  if (!data.rows.length) return alert('没有可导出的数据');
  const header = ['班级', '姓名', ...cols.map(c => c.key)];
  const lines = [header.join(',')];
  data.rows.forEach(row => {
    const recs = data.records;
    const vals = cols.map(c => {
      const rec = recs.find(r => r.classId === row.classId && r.studentName === row.name && r.subject === c.key);
      return rec ? fmtExamCell(rec.score, c.type === 'rank') : '';
    });
    lines.push([row.classId, row.name, ...vals].join(','));
  });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `成绩查询_${state.examData.exams.find(e=>e.id===eqExamId)?.name || eqExamId}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function eqBuildRows() {
  const records = state.examData.records.filter(r => r.examId === eqExamId && eqClassIds.includes(r.classId));
  const rows = [];
  const seen = new Set();
  records.forEach(r => {
    const key = r.classId + '|' + r.studentName;
    if (!r.studentName || seen.has(key)) return;
    seen.add(key);
    if (eqSearch && !r.studentName.includes(eqSearch)) return;
    rows.push({ classId: r.classId, name: r.studentName });
  });
  const col = examColumns().find(c => c.key === eqSortCol);
  rows.sort((a, b) => {
    if (!eqSortCol || eqSortCol === 'classId') {
      const d = a.classId.localeCompare(b.classId);
      if (d) return eqSortDesc ? -d : d;
      return eqSortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
    }
    if (eqSortCol === 'name') {
      return eqSortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
    }
    const ra = records.find(r => r.classId === a.classId && r.studentName === a.name && r.subject === eqSortCol);
    const rb = records.find(r => r.classId === b.classId && r.studentName === b.name && r.subject === eqSortCol);
    const va = ra ? Number(ra.score) : -Infinity;
    const vb = rb ? Number(rb.score) : -Infinity;
    if (isNaN(va) && isNaN(vb)) return a.name.localeCompare(b.name);
    if (isNaN(va)) return 1; if (isNaN(vb)) return -1;
    return eqSortDesc ? vb - va : va - vb;
  });
  return { rows, records };
}
function renderExamQueryTable() {
  if (!eqExamId) return '<p class="text-sm text-gray-400">请选择考试。</p>';
  const cols = examColumns().filter(c => c.enabled && !eqHiddenCols.has(c.key));
  if (!cols.length) return '<p class="text-sm text-gray-400">还没有配置成绩列，请到「班级设置 → 管理列」添加。</p>';
  const { rows, records } = eqBuildRows();
  if (!rows.length) return `<p class="text-sm text-gray-400 text-center py-10">没有找到匹配的学生。</p>`;
  const stickyHead = 'position:sticky; top:0; z-index:20; background:#f3f4f6;';
  const stickyClassTh = 'position:sticky; left:0; z-index:21; background:#f3f4f6;';
  const stickyNameTh = 'position:sticky; left:3.5rem; z-index:21; background:#f3f4f6;';
  const stickyClassTd = 'position:sticky; left:0; z-index:10; background:#fff;';
  const stickyNameTd = 'position:sticky; left:3.5rem; z-index:10; background:#fff;';
  const ths = [`<th class="py-2 pl-3 pr-2 text-left whitespace-nowrap text-xs font-semibold" style="${stickyHead} ${stickyClassTh}; min-width:3.5rem;">班级</th>`, `<th class="py-2 pr-3 text-left whitespace-nowrap text-xs font-semibold" style="${stickyHead} ${stickyNameTh}; min-width:5rem;">姓名</th>`];
  cols.forEach(c => {
    const arrow = eqSortCol === c.key ? (eqSortDesc ? '↓' : '↑') : '';
    const activeClass = eqSortCol === c.key ? 'bg-blue-50 text-blue-700' : '';
    ths.push(`<th class="py-2 px-2 text-right whitespace-nowrap text-xs font-semibold cursor-pointer select-none hover:bg-gray-200 ${activeClass}" style="${stickyHead} min-width:3.5rem;" onclick="eqSetSort('${esc(c.key)}', event)">${esc(c.key)}${c.type==='rank'?'<span class="text-[10px] opacity-70">排</span>':''}${arrow}</th>`);
  });
  const tbody = rows.map(row => {
    const pinned = (row.classId + '|' + row.name) === eqPinnedKey;
    const rowBg = pinned ? 'background:#fef3c7;' : '';
    const vals = cols.map(c => {
      const rec = records.find(r => r.classId === row.classId && r.studentName === row.name && r.subject === c.key);
      const v = rec ? fmtExamCell(rec.score, c.type === 'rank') : '—';
      const activeClass = eqSortCol === c.key ? 'bg-blue-50 text-blue-700' : '';
      return `<td class="py-1.5 px-2 text-right whitespace-nowrap text-sm tabular-nums ${activeClass}" style="${rowBg}">${v}</td>`;
    }).join('');
    return `<tr class="border-b hover:bg-gray-50" style="${rowBg}"><td class="py-1.5 pl-3 pr-2 text-sm text-gray-600 whitespace-nowrap" style="${stickyClassTd} ${rowBg}">${esc(row.classId)}</td><td class="py-1.5 pr-3 text-sm font-medium whitespace-nowrap cursor-pointer hover:text-blue-600" style="${stickyNameTd} ${rowBg}" onclick="eqPinRow('${esc(row.classId)}','${esc(row.name)}', event)">${esc(row.name)}</td>${vals}</tr>`;
  }).join('');
  const pinTip = eqPinnedKey ? ' · 已常亮 <b>' + esc(eqPinnedKey.split('|')[1]) + '</b> 的成绩行（点姓名取消）' : '';
  return `
  <div class="bg-white rounded-2xl shadow-sm">
    <div class="flex items-center justify-between p-4 border-b">
      <div class="text-xs text-gray-500">共 <b>${rows.length}</b> 人${pinTip}</div>
      <button class="text-xs text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="eqExportCSV()">📥 导出当前表</button>
    </div>
    <div id="eqTopScroll" class="overflow-x-auto" style="height:10px; background:#f9fafb; border-bottom:1px solid #e5e7eb;">
      <div id="eqTopScrollInner" style="height:1px; min-width:100%;"></div>
    </div>
    <div id="eqTableScroll" class="overflow-auto" style="max-height:calc(100vh - 320px);">
      <table class="text-sm border-separate border-spacing-0" style="min-width:100%;">
        <thead><tr class="bg-gray-100 text-gray-600">${ths.join('')}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </div>`;
}
function eqRerenderTable() {
  const wrap = document.getElementById('eqTableWrap');
  const sc = document.getElementById('eqTableScroll');
  const left = sc ? sc.scrollLeft : 0;
  if (wrap) wrap.innerHTML = renderExamQueryTable();
  const sc2 = document.getElementById('eqTableScroll');
  if (sc2) sc2.scrollLeft = left;
  eqBindScrollSync();
}
function eqPinRow(classId, name, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const key = classId + '|' + name;
  eqPinnedKey = (eqPinnedKey === key) ? '' : key;
  eqRerenderTable();
}
function eqSetSort(col, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  if (eqSortCol === col) eqSortDesc = !eqSortDesc;
  else { eqSortCol = col; eqSortDesc = true; }
  eqRerenderTable();
  const sel = document.getElementById('eqSortCol');
  if (sel) sel.value = eqSortCol;
}
function eqBindScrollSync() {
  setTimeout(() => {
    const top = document.getElementById('eqTopScroll');
    const bot = document.getElementById('eqTableScroll');
    const inner = document.getElementById('eqTopScrollInner');
    if (!top || !bot) return;
    if (inner) inner.style.width = bot.scrollWidth + 'px';
    top.onscroll = () => { bot.scrollLeft = top.scrollLeft; };
    bot.onscroll = () => { top.scrollLeft = bot.scrollLeft; };
  }, 0);
}

// ---------- 成绩分析看板 ----------
let anSelExams = [], anSelSubjects = [], anSelClasses = [], anSelStudents = [];
let anHasRun = false;
// 成绩分析已简化为「个人趋势」与「两班同类型列对比」两个手动触发入口，不再默认勾选/自动全量计算。
function ensureAnalysisSel() {}
function isAnChecked(arr, val) { return arr.includes(val); }
function collectFilters() {}
function toggleFilter(group) {}
function startExamAnalysis() {}
function examAvgInExams(subject, classId, examIds) {
  const rs = state.examData.records.filter(r => examIds.includes(r.examId) && r.classId === classId && r.subject === subject && r.colType !== 'rank');
  if (!rs.length) return null;
  return rs.reduce((a, b) => a + (+b.score || 0), 0) / rs.length;
}
function examGradeAvg(examId, subject, classIds) {
  const rs = state.examData.records.filter(r => r.examId === examId && classIds.includes(r.classId) && r.subject === subject && r.colType !== 'rank');
  if (!rs.length) return null;
  return rs.reduce((a, b) => a + (+b.score || 0), 0) / rs.length;
}
function renderExamAnalysis() {
  // 旧实现直接读 state.examData.exams.length，一旦 examData 结构被破坏（异常导入/旧备份）整页白屏
  const _edExams = (state.examData && state.examData.exams) || [];
  if (!_edExams.length) return `<div class="bg-white rounded-2xl p-10 text-center shadow-sm"><div class="text-4xl mb-3">📊</div><div class="font-bold text-gray-800">还没有考试数据</div><p class="text-sm text-gray-500 mt-2">先到「成绩上传」添加考试并导入成绩。</p></div>`;
  const cols = examColumns().filter(c => c.enabled);
  const colOpts = cols.map(c => `<option value="${esc(c.key)}">${esc(c.key)}${c.type === 'rank' ? '（排名）' : ''}</option>`).join('');
  return `
  <div class="space-y-4">
    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <div class="font-bold text-gray-800">👤 个人趋势</div>
      <p class="text-xs text-gray-400">输入学生姓名，选择要看的一列（分数或排名），系统会列出该生历次考试的数据。</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input id="anStuName" type="text" class="border rounded-lg p-2 text-sm" placeholder="学生姓名，如：张明轩" onkeydown="if(event.key==='Enter')anRunPersonal()">
        <select id="anStuCol" class="border rounded-lg p-2 text-sm">${colOpts}</select>
        <button class="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primaryDark" onclick="anRunPersonal()">查看趋势</button>
      </div>
      <div id="anPersonalWrap"><p class="text-sm text-gray-400 pt-2">输入学生姓名并选择列后，点击「查看趋势」。</p></div>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <div class="font-bold text-gray-800">📊 两班同类型列对比</div>
      <p class="text-xs text-gray-400">选择一列和 1-3 个对比指标，系统会同时呈现多个指标的两班对比。分数科目支持「全班平均分」「优生平均分」「及格数」；排名类列支持「名次区间人数」。</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select id="anCmpCol" data-lock-allow class="border rounded-lg p-2 text-sm" onchange="anToggleMetricInputs()">${colOpts}</select>
      </div>
      <div>
        <div class="text-xs text-gray-500 mb-2">选择指标（1-3 个）</div>
        <div class="flex flex-wrap gap-2 mb-3">
          <label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer whitespace-nowrap"><input type="checkbox" class="an-cmp-metric" value="avg" onchange="anToggleMetricInputs()"> 全班平均分</label>
          <label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer whitespace-nowrap"><input type="checkbox" class="an-cmp-metric" value="top" checked onchange="anToggleMetricInputs()"> 优生平均分</label>
          <label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer whitespace-nowrap"><input type="checkbox" class="an-cmp-metric" value="pass" onchange="anToggleMetricInputs()"> 及格数</label>
          <label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer whitespace-nowrap"><input type="checkbox" class="an-cmp-metric" value="rankRange" onchange="anToggleMetricInputs()"> 名次区间人数</label>
        </div>
        <div id="anMetricParams" class="grid grid-cols-1 md:grid-cols-3 gap-3"></div>
      </div>
      <button class="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primaryDark" onclick="anRunCompare()">对比两班</button>
      <div id="anCompareWrap"><p class="text-sm text-gray-400 pt-2">选择一列和指标后，点击「对比两班」。</p></div>
    </div>
  </div>`;
}
function anRunPersonal() {
  const name = (document.getElementById('anStuName').value || '').trim();
  const col = document.getElementById('anStuCol').value;
  const wrap = document.getElementById('anPersonalWrap');
  if (!name || !col) { wrap.innerHTML = '<p class="text-sm text-red-500">请输入姓名并选择列。</p>'; return; }
  const matches = (state.students || []).filter(s => s.name === name);
  if (!matches.length) { wrap.innerHTML = `<p class="text-sm text-red-500">学生管理中没有「${esc(name)}」，请先去「学生管理」添加。</p>`; return; }
  const stu = matches[0];
  const classId = stu.class;
  const series = [];
  state.examData.exams.forEach(e => {
    const r = state.examData.records.find(x => x.examId === e.id && x.classId === classId && x.studentName === name && x.subject === col);
    if (r) series.push({ exam: e.name, date: e.date, score: +r.score, colType: r.colType });
  });
  series.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!series.length) { wrap.innerHTML = `<p class="text-sm text-gray-400">该学生暂无「${esc(col)}」的历次记录。</p>`; return; }
  const isRank = series[0].colType === 'rank';
  const avg = (series.reduce((a, b) => a + b.score, 0) / series.length).toFixed(isRank ? 0 : 2);
  const min = Math.min(...series.map(s => s.score));
  const max = Math.max(...series.map(s => s.score));
  const unit = isRank ? '名' : '分';
  const rows = series.map(s => `<tr class="border-t"><td class="py-1">${esc(s.exam)}</td><td class="py-1 text-gray-400 text-xs">${esc(s.date || '-')}</td><td class="py-1 text-right font-medium">${s.score}${unit}</td></tr>`).join('');
  wrap.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3">
      <div class="lg:col-span-2 bg-white rounded-2xl p-4 shadow-sm"><canvas id="anPsChart" height="170"></canvas></div>
      <div class="bg-white rounded-2xl p-4 shadow-sm space-y-2">
        <div class="text-sm font-medium text-gray-700">📋 数据明细</div>
        <div class="overflow-y-auto max-h-56"><table class="w-full text-sm"><thead><tr class="text-gray-500 text-left"><th class="py-1">考试</th><th class="py-1">日期</th><th class="py-1 text-right">${esc(col)}</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="text-xs text-gray-500 pt-2 border-t">共 ${series.length} 次 · 平均 ${avg}${unit} · 最高 ${max}${unit} · 最低 ${min}${unit}</div>
      </div>
    </div>`;
  setTimeout(() => {
    if (window._anPsChart) try { window._anPsChart.destroy(); } catch (e) { }
    const cv = document.getElementById('anPsChart');
    if (!cv) return;
    window._anPsChart = new Chart(cv.getContext('2d'), {
      type: 'line',
      data: { labels: series.map(s => s.exam), datasets: [
        { label: col + (isRank ? '（名）' : '（分）'), data: series.map(s => s.score), borderColor: '#f06292', backgroundColor: 'rgba(240,98,146,.1)', fill: true, tension: .3 }
      ]},
      options: { responsive: true, plugins: { title: { display: true, text: `${esc(name)} · ${esc(col)} 趋势` } }, scales: { y: { beginAtZero: !isRank, reverse: isRank } } }
    });
  }, 0);
}
function anToggleMetricInputs() {
  // 还没有考试数据时，成绩分析面板只渲染占位提示，页面上根本没有 #anCmpCol，
  // 旧实现直接取 .value 会抛 "Cannot read properties of null"，每次进成绩页都报一次错。
  const colEl = document.getElementById('anCmpCol');
  if (!colEl) return;
  const col = colEl.value;
  const colDef = examColumnByKey(col);
  const isRank = colDef && colDef.type === 'rank';
  const paramsWrap = document.getElementById('anMetricParams');
  const metricEls = document.querySelectorAll('.an-cmp-metric');
  if (!paramsWrap) return;
  metricEls.forEach(b => {
    if (isRank) b.disabled = b.value !== 'rankRange';
    else b.disabled = b.value === 'rankRange';
    const label = b.closest('label');
    if (label) label.classList.toggle('opacity-50', b.disabled);
  });
  if (isRank) {
    metricEls.forEach(b => { b.checked = b.value === 'rankRange'; });
    paramsWrap.innerHTML = `
      <div><label class="block text-xs text-gray-500 mb-1">名次区间 · 起始名次（含）</label><input id="anCmpParam_rankMin" type="number" class="w-full border rounded-lg p-2 text-sm" placeholder="如：50" value="50"></div>
      <div><label class="block text-xs text-gray-500 mb-1">名次区间 · 结束名次（含）</label><input id="anCmpParam_rankMax" type="number" class="w-full border rounded-lg p-2 text-sm" placeholder="如：100" value="100"></div>
      <div class="flex items-end"><div class="text-xs text-gray-400">统计两班名次在该区间内的学生人数。</div></div>`;
    return;
  }
  const metrics = Array.from(document.querySelectorAll('.an-cmp-metric:checked')).map(b => b.value);
  const defs = {
    avg: { label: '全班平均分', placeholder: '前 N 名（0=全班）', value: '0', hint: '填 0 表示全班，填 N 表示各班取前 N 名' },
    top: { label: '优生平均分', placeholder: '前 N 名', value: '15', hint: '取各班前 N 名计算均分' },
    pass: { label: '及格数', placeholder: '及格线', value: '60', hint: '统计 ≥ 及格线的人数' }
  };
  if (!metrics.length) {
    paramsWrap.innerHTML = `<div class="col-span-full text-xs text-red-400">请至少选择一个指标。</div>`;
    return;
  }
  paramsWrap.innerHTML = metrics.map(m => {
    const d = defs[m];
    return `<div><label class="block text-xs text-gray-500 mb-1">${d.label} · ${d.hint}</label><input id="anCmpParam_${m}" type="number" class="w-full border rounded-lg p-2 text-sm" placeholder="${d.placeholder}" value="${d.value}"></div>`;
  }).join('');
}
function anRunCompare() {
  const col = document.getElementById('anCmpCol').value;
  const wrap = document.getElementById('anCompareWrap');
  if (!col) { wrap.innerHTML = '<p class="text-sm text-red-500">请选择要对比的列。</p>'; return; }
  const colDef = examColumnByKey(col);
  const isRank = colDef && colDef.type === 'rank';
  const metricEls = document.querySelectorAll('.an-cmp-metric:checked');
  if (!metricEls.length) { wrap.innerHTML = '<p class="text-sm text-red-500">请至少选择一个对比指标。</p>'; return; }
  const metrics = Array.from(metricEls).map(b => {
    const key = b.value;
    if (key === 'rankRange') {
      const minRaw = document.getElementById('anCmpParam_rankMin')?.value ?? '1';
      const maxRaw = document.getElementById('anCmpParam_rankMax')?.value ?? '100';
      return { key, param: { min: parseFloat(minRaw), max: parseFloat(maxRaw) } };
    }
    const raw = document.getElementById('anCmpParam_' + key)?.value ?? '';
    return { key, param: parseFloat(raw) };
  });
  const exams = [...state.examData.exams].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const classes = state.examData.classes;
  const defs = {
    rankRange: { label: m => `名次 ${m.param.min}-${m.param.max} 人数`, unit: '人', decimals: 0, beginAtZero: true },
    avg: { label: m => `前${m.param}名平均分`, unit: '分', decimals: 2, beginAtZero: true },
    top: { label: m => `前${m.param}名优生平均分`, unit: '分', decimals: 2, beginAtZero: true },
    pass: { label: m => `≥${m.param}分及格数`, unit: '人', decimals: 0, beginAtZero: true }
  };
  const compute = (rs, metric) => {
    const nums = rs.map(r => +r.score).filter(s => !isNaN(s));
    if (!nums.length) return null;
    if (metric.key === 'rankRange') {
      const lo = Math.min(metric.param.min, metric.param.max);
      const hi = Math.max(metric.param.min, metric.param.max);
      return nums.filter(s => s >= lo && s <= hi).length;
    }
    if (metric.key === 'pass') return nums.filter(s => s >= metric.param).length;
    nums.sort((a, b) => b - a);
    const n = metric.key === 'top' ? metric.param : (metric.param > 0 ? metric.param : nums.length);
    const take = n > 0 ? Math.min(n, nums.length) : nums.length;
    const arr = nums.slice(0, take);
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  const results = metrics.map(metric => {
    const def = defs[metric.key] || defs.avg;
    const label = typeof def.label === 'function' ? def.label(metric) : def.label;
    const data = exams.map(e => {
      const row = { exam: e.name, date: e.date };
      classes.forEach(c => {
        const rs = state.examData.records.filter(r => r.examId === e.id && r.classId === c.id && r.subject === col);
        row[c.id] = compute(rs, metric);
      });
      return row;
    });
    return { metric, def, label, data };
  });
  const renderOne = ({ metric, def, label, data }) => {
    const ths = ['<th class="py-2 pl-2 text-left">考试</th>', ...classes.map(c => `<th class="py-2 text-right">${esc(c.name)}</th>`), '<th class="py-2 text-right">差值</th>'];
    const rows = data.map(d => {
      const vals = classes.map(c => `<td class="py-1.5 text-right">${d[c.id] == null ? '—' : (def.decimals === 0 ? Math.round(d[c.id]) : d[c.id].toFixed(def.decimals))}</td>`).join('');
      let diff = '';
      if (classes.length === 2 && d[classes[0].id] != null && d[classes[1].id] != null) {
        const a = d[classes[0].id], b = d[classes[1].id];
        const v = def.decimals === 0 ? (a - b) : (a - b).toFixed(def.decimals);
        const posGood = metric.key === 'rankRange' ? false : true;
        diff = `<span class="${v > 0 ? (posGood ? 'text-emerald-600' : 'text-red-500') : (posGood ? 'text-red-500' : 'text-emerald-600')}">${v > 0 ? '+' : ''}${v}</span>`;
      }
      return `<tr class="border-t"><td class="py-1.5 pl-2">${esc(d.exam)}<div class="text-gray-400 text-[10px]">${esc(d.date || '-')}</div></td>${vals}<td class="py-1.5 text-right">${diff}</td></tr>`;
    }).join('');
    const chartId = metric.key === 'rankRange' ? ('anCmpChart_' + metric.key + '_' + metric.param.min + '_' + metric.param.max) : ('anCmpChart_' + metric.key + '_' + metric.param);
    return `
    <div class="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-gray-700">${esc(label)}</div>
        <div class="text-xs text-gray-400">${metric.key === 'rankRange' ? '区间内人数：人数越多越好' : (metric.key === 'pass' ? '及格数越多越好' : '分数越高越好')}</div>
      </div>
      <div class="overflow-x-auto"><canvas id="${chartId}" height="160"></canvas></div>
      <div class="overflow-y-auto max-h-56"><table class="w-full text-sm"><thead><tr class="text-gray-500 text-left">${ths.join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  };
  wrap.innerHTML = `<div class="grid grid-cols-1 gap-4 mt-3">${results.map(renderOne).join('')}</div>`;
  setTimeout(() => {
    results.forEach(({ metric, label, data }) => {
      const chartId = metric.key === 'rankRange' ? ('anCmpChart_' + metric.key + '_' + metric.param.min + '_' + metric.param.max) : ('anCmpChart_' + metric.key + '_' + metric.param);
      const cv = document.getElementById(chartId);
      if (!cv) return;
      const key = chartId;
      if (window[key]) try { window[key].destroy(); } catch (e) { }
      const colors = ['#f06292', '#60a5fa', '#34d399', '#fbbf24'];
      const def = defs[metric.key] || defs.avg;
      window[key] = new Chart(cv.getContext('2d'), {
        type: 'bar',
        data: { labels: data.map(d => d.exam), datasets: classes.map((c, i) => ({ label: c.name, data: data.map(d => d[c.id]), backgroundColor: colors[i % colors.length] })) },
        options: { responsive: true, plugins: { title: { display: true, text: `${esc(col)} · ${esc(label)}` } }, scales: { y: { beginAtZero: def.beginAtZero } } }
      });
    });
  }, 0);
}
function renderExamAnalysisInto() {
  // 新版分析页由按钮触发，不再自动全量渲染，避免打开即卡
}
function renderExamPersonalInto() {
  // 个人趋势由 anRunPersonal 直接渲染到 #anPersonalWrap
}

// 在 render() 后渲染图表 / 绑定文件
const _origRender = render;
render = function() {
  _origRender();
  setTimeout(() => {
    if (currentRoute === 'exam') {
      if (examTab === 'analysis') { renderExamAnalysisInto(); anToggleMetricInputs(); }
      if (examTab === 'query') eqBindScrollSync();
    }
  }, 0);
};


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
  const clsStudentIds = new Set(state.students.filter(s => s.class === state.activeClass).map(s => s.id));
  let logs = state.points.logs.filter(l => clsStudentIds.has(l.studentId));
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
          <span class="text-[10px] text-gray-400">${esc(recDateLabel(l.date))}</span>
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
        <select id="logDim" data-lock-allow class="flex-1 border rounded-lg p-2 text-sm" onchange="setPtLogFilter()">
          <option value="all" ${ptLogDim === 'all' ? 'selected' : ''}>全部维度</option>
          ${POINT_DIMS.map(d => `<option value="${d.id}" ${ptLogDim === d.id ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
        <select id="logStudent" data-lock-allow class="flex-1 border rounded-lg p-2 text-sm" onchange="setPtLogFilter()">
          <option value="all" ${ptLogStudent === 'all' ? 'selected' : ''}>全部学生</option>
          ${state.students.filter(s => s.class === state.activeClass).map(s => `<option value="${s.id}" ${ptLogStudent === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
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
  confirmModal('将清空当前班级的所有积分记录，全班积分归零（规则和职务设置保留）。确定？', function(){
    const clsStudentIds = new Set(state.students.filter(s => s.class === state.activeClass).map(s => s.id));
    state.points.logs = state.points.logs.filter(l => !clsStudentIds.has(l.studentId));
    save(); closeModal(); render();
  });
}

// ---------- 学生积分详情 ----------
function openPtStudent(sid) {
  const s = state.students.find(x => x.id === sid); if (!s) return;
  const logs = ptStudentLogs(sid);
  const _rk = ptRanked('all').find(x => x.s.id === sid);
  const rank = (_rk && _rk.rank) || 0;
  openModal(`${esc(s.name)} · 积分详情`, `
    <div class="space-y-4">
      <div class="flex items-center gap-4">
        <img src="${esc(s.avatar)}" class="w-14 h-14 rounded-full bg-gray-100" alt="">
        <div class="flex-1">
          <div class="font-bold text-lg">${esc(s.name)}</div>
          <div class="text-sm text-gray-500">${esc(s.class || '')} · 班级排名第 ${rank} 名</div>
        </div>
        <div class="text-right"><div class="text-3xl font-bold text-primary">${fmtScore(ptTotal(sid))}</div><div class="text-[10px] text-gray-400">总积分</div></div>
      </div>
      <div class="grid grid-cols-4 gap-2">
        ${POINT_DIMS.map(d => { const st = dimStyle(d.id);
          return `<div class="rounded-xl p-3 text-center ${st.bg}"><div class="text-[10px] ${st.text}">${d.icon} ${d.label}</div><div class="text-xl font-bold ${st.text} mt-0.5">${fmtScore(ptDimScoreCached(sid, d.id))}</div></div>`; }).join('')}
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
              <div class="flex gap-2 mt-0.5"><span class="text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.text}">${dimLabel(l.dim)}</span><span class="text-[10px] text-gray-400">${esc(recDateLabel(l.date))}</span></div></div>
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
// ===================== 首页积分排行 + 内嵌展览面板 =====================
// 状态：维度/人数/自动轮换/间隔、内嵌屏与全屏展览的翻页与背景
let homeExhibit = {
  dim: 'all', pool: 10, auto: true, interval: 8,
  screen: 'rank', logPage: 0, embedPage: 0,
  logClass: 'current',
  fs: false, fsBg: 'dark', fsScreen: 'rank', fsRankPage: 0, fsLogPage: 0, fsAuto: true,
  _timer: null, _fsTimer: null, _clock: null,
  // 缓存层：避免每次渲染重复计算排序/折算
  _dataVer: 0, _cacheDim: '', _cachePool: 0, _cacheLogCls: '',
  _cachedStudents: null, _cachedLogGroups: null,
};
// 持久化展示设置（按设备）：仅保存用户设定，不保存运行时/分页/缓存字段。重启后自动恢复。
const HOME_EXHIBIT_PERSIST = ['dim','pool','auto','interval','logClass','fsAuto','fsBg','fsScreen'];
function saveHomeExhibit() {
  try {
    const o = {};
    HOME_EXHIBIT_PERSIST.forEach(k => { if (k in homeExhibit) o[k] = homeExhibit[k]; });
    localStorage.setItem(HOME_EXHIBIT_KEY, JSON.stringify(o));
  } catch (e) {}
}
function loadHomeExhibit() {
  try {
    const raw = localStorage.getItem(HOME_EXHIBIT_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') {
      HOME_EXHIBIT_PERSIST.forEach(k => { if (k in o) homeExhibit[k] = o[k]; });
    }
  } catch (e) {}
}

function renderHomePointsCard() {
  const week = ptRecent(7);
  const dimOpts = `<option value="all">总分</option>` + POINT_DIMS.map(d => `<option value="${d.id}">${d.icon} ${d.label}</option>`).join('');
  const poolOpts = `<option value="10">前 10</option><option value="15">前 15</option><option value="20">前 20</option><option value="0">全部</option>`;
  const intOpts = `<option value="5">5 秒</option><option value="8">8 秒</option><option value="10">10 秒</option><option value="12">12 秒</option><option value="15">15 秒</option>`;
  return `
  <div class="col-span-12 rounded-2xl overflow-hidden border border-gray-200 relative bg-gradient-to-br from-slate-50 to-gray-100">
    <!-- 展览面板头部（含全部控制项） -->
    <div class="flex items-center justify-between px-4 py-2 bg-white/70 backdrop-blur flex-wrap gap-2">
      <div class="flex items-center gap-2 text-sm font-bold text-gray-800">
        <span id="homeExIcon">🏆</span>
        <span id="homeExTitle">积分排行展览</span>
        <span id="homeExBadge" class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">自动轮换中</span>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-gray-400">近7天 ${ptSum(week) >= 0 ? '+' : ''}${ptSum(week)} 分 / ${week.length} 条</span>
        <select id="homeDimSel" data-lock-allow class="text-xs border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="homeExhibitSetDim(this.value)">${dimOpts}</select>
        <select id="homePoolSel" data-lock-allow class="text-xs border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="homeExhibitSetPool(+this.value)">${poolOpts}</select>
        <button class="text-xs border border-primary text-primary px-3 py-1 rounded-full hover:bg-primary/5" data-lock-allow onclick="toggleHomeExhibitFs()">📺 全屏展览</button>
        <a class="text-xs text-primary hover:underline cursor-pointer" data-lock-allow onclick="navigate('points')">积分管理 →</a>
        <button id="homeAutoBtn" class="text-xs border border-gray-300 px-3 py-1 rounded-full hover:bg-gray-50" data-lock-allow onclick="toggleHomeExhibitAuto()">⏸️ 暂停</button>
        <button id="homeSetBtn" class="text-xs border border-gray-300 px-3 py-1 rounded-full hover:bg-gray-50" data-lock-allow onclick="toggleHomeExhibitSettings()">⚙️</button>
      </div>
    </div>

    <!-- 设置下拉面板 -->
    <div id="homeExhibitSettings" class="hidden absolute top-11 right-3 z-20 bg-white border border-gray-200 rounded-xl p-3 w-56 text-xs shadow-xl space-y-2">
      <div><div class="text-gray-400 mb-1">轮换间隔</div><select id="homeIntSel" data-lock-allow class="w-full border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="setHomeExhibitInterval(+this.value)">${intOpts}</select></div>
      <div><div class="text-gray-400 mb-1">自动轮换</div><div class="flex gap-2"><button id="homeAutoOn" class="flex-1 border rounded-lg py-1 bg-primary text-white" onclick="setHomeExhibitAuto(true)">开</button><button id="homeAutoOff" class="flex-1 border rounded-lg py-1" onclick="setHomeExhibitAuto(false)">关</button></div></div>
      <div><div class="text-gray-400 mb-1">日志班级</div><select id="homeLogClsSel" data-lock-allow class="w-full border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="setHomeExhibitLogClass(this.value)"><option value="current">当前班级</option><option value="all">全部班级</option>${(state.classes||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div><div class="text-gray-400 mb-1">全屏背景</div><div class="flex gap-2"><button id="homeBgDark" class="flex-1 border rounded-lg py-1 bg-primary text-white" onclick="setHomeExhibitFsBg(false)">暗</button><button id="homeBgLight" class="flex-1 border rounded-lg py-1" onclick="setHomeExhibitFsBg(true)">亮</button></div></div>
    </div>

    <!-- 展览内容区 -->
    <div id="homeExhibitBody" class="p-4 min-h-[260px]"></div>
    <div id="homeExhibitNav" class="flex items-center justify-center gap-3 py-3 border-t border-black/5"></div>

    ${homeExhibitFsHTML()}
  </div>`;
}

// 全屏展览覆盖层
function homeExhibitFsHTML() {
  const dimOpts = `<option value="all">总分</option>` + POINT_DIMS.map(d => `<option value="${d.id}">${d.icon} ${d.label}</option>`).join('');
  const poolOpts = `<option value="10">前 10</option><option value="15">前 15</option><option value="20">前 20</option><option value="30">前 30</option><option value="0">全部</option>`;
  const intOpts = `<option value="5">5 秒</option><option value="8">8 秒</option><option value="10">10 秒</option><option value="12">12 秒</option><option value="15">15 秒</option>`;
  return `
  <div id="homeFsOverlay" class="hidden fixed inset-0 z-[100] overflow-auto" style="--fsc:rgba(30,41,59,.6);--fsb:rgba(148,163,184,.25);background:linear-gradient(135deg,#0f172a,#1e293b);color:#e2e8f0">
    <div class="sticky top-0 z-10 flex items-center justify-between px-6 py-3" style="background:rgba(15,23,42,.6);backdrop-filter:blur(8px)">
      <div class="flex items-center gap-3"><span id="homeFsTitle" class="text-lg font-bold">🏆 积分排行</span><span id="homeFsClock" class="text-sm opacity-70 tabular-nums"></span></div>
      <div class="flex items-center gap-2">
        <button class="text-xl bg-transparent border-0 cursor-pointer text-current" data-fsset data-lock-allow onclick="toggleHomeExhibitFsSettings()">⚙️</button>
        <button class="text-xl bg-transparent border-0 cursor-pointer text-current" data-lock-allow onclick="toggleHomeExhibitFs()">✕</button>
      </div>
    </div>
    <div id="homeFsPanel" class="hidden fixed top-16 right-4 z-[60] bg-white border border-gray-200 rounded-xl p-3 w-60 text-xs shadow-xl space-y-2" style="color:#1f2937">
      <div class="font-semibold mb-1">展览设置</div>
      <div><div class="text-gray-400 mb-1">展示范围</div><select id="homeFsPool" data-lock-allow class="w-full border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="homeExhibitSetPool(+this.value)">${poolOpts}</select></div>
      <div><div class="text-gray-400 mb-1">排序维度</div><select id="homeFsDim" data-lock-allow class="w-full border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="homeExhibitSetDim(this.value)">${dimOpts}</select></div>
      <div><div class="text-gray-400 mb-1">日志班级</div><select id="homeFsLogCls" data-lock-allow class="w-full border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="setHomeExhibitLogClass(this.value)"><option value="current">当前班级</option><option value="all">全部班级</option>${(state.classes||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div><div class="text-gray-400 mb-1">自动轮换</div><div class="flex gap-2"><button id="homeFsAutoOn" class="flex-1 border rounded-lg py-1 bg-primary text-white" onclick="setHomeExhibitFsAuto(true)">开</button><button id="homeFsAutoOff" class="flex-1 border rounded-lg py-1" onclick="setHomeExhibitFsAuto(false)">关</button></div></div>
      <div><div class="text-gray-400 mb-1">间隔</div><select id="homeFsInt" data-lock-allow class="w-full border rounded-lg px-2 py-1 text-gray-600 bg-white" onchange="setHomeExhibitInterval(+this.value)">${intOpts}</select></div>
      <div><div class="text-gray-400 mb-1">背景</div><div class="flex gap-2"><button id="homeFsBgDark" class="flex-1 border rounded-lg py-1 bg-primary text-white" onclick="setHomeExhibitFsBg(false)">暗</button><button id="homeFsBgLight" class="flex-1 border rounded-lg py-1" onclick="setHomeExhibitFsBg(true)">亮</button></div></div>
    </div>
    <div id="homeFsBody" class="px-6 pb-12 max-w-[1200px] mx-auto"></div>
  </div>`;
}

// 数据版本号：积分/日志变化时递增，用于缓存失效
let _exhibitDataVerVal = 0;
function _exhibitDataVer() { return _exhibitDataVerVal; }
function _bumpExhibitDataVer() { _exhibitDataVerVal++; homeExhibit._cachedStudents = null; homeExhibit._cachedLogGroups = null; }

// 取当前排行列表（带缓存：预计算每人的折算分，避免渲染时重复计算）
function homeExhibitStudents() {
  // 注意：缓存必须同时校验 dim 和 pool，否则只切人数(前10→前20)时 dim 未变会命中旧缓存，表现为"点了没反应"
  if (homeExhibit._cachedStudents && homeExhibit._cacheDim === homeExhibit.dim
      && homeExhibit._cachePool === homeExhibit.pool && homeExhibit._dataVer === _exhibitDataVer()) {
    return homeExhibit._cachedStudents;
  }
  // 先一次性把四个维度 + 总分算好：下面 50 个学生 × 4 个维度若各自调
  // ptConvDim/ptConvTotal，会触发 200+ 次签名计算（首页首次加载实测卡顿明显）
  ptEnsureCacheAll();
  const arr = ptRanked(homeExhibit.dim).map(x => {
    const s = x.s;
    return { s, rank: x.rank, total: ptConvTotalCached(s.id), dims: POINT_DIMS.map(d => ({ id: d.id, v: ptConvScoreCached(s.id, d.id) })) };
  });
  const result = homeExhibit.pool > 0 ? arr.slice(0, homeExhibit.pool) : arr;
  homeExhibit._cachedStudents = result;
  homeExhibit._cacheDim = homeExhibit.dim;
  homeExhibit._cachePool = homeExhibit.pool;
  return result;
}

// 排行卡（fs=false 内嵌卡；fs=true 全屏大卡）—— 使用缓存数据，不实时计算
function homeExhibitCardHTML(x, i, fs) {
  const s = x.s;
  const total = x.total;   // 缓存预计算值
  const dims = x.dims;     // 缓存预计算值 [{id, v}, ...]
  const maxV = Math.max(1, ...dims.map(o => o.v));
  const rk = x.rank || (i + 1);   // 并列后的名次（同分同名次）
  const ri = rk - 1;              // 基于名次的 0 基下标，用于奖牌样式
  // 暗色背景专用亮色（原 bg-*-400 在深底上太暗）
  const FS_BAR = { sport:'bg-emerald-400', daily:'bg-amber-400', exam:'bg-sky-400', post:'bg-violet-400' };
  if (fs) {
    // 全屏大卡片：教室投屏，2×3 布局，高对比度
    const _d = id => POINT_DIMS.find(d => d.id === id) || {};
    const bar = o => `<div class="flex justify-between text-sm text-white/70"><span>${_d(o.id).icon} ${_d(o.id).label}</span><span class="font-bold text-white/90">${fmtScore(o.v)}</span></div>
      <div class="h-3 bg-white/10 rounded-full overflow-hidden mt-1.5"><div class="${FS_BAR[o.id] || 'bg-white/40'} h-full rounded-full transition-all" style="width:${Math.round(o.v / maxV * 100)}%;min-width:4px;box-shadow:0 0 6px ${FS_BAR[o.id]?.replace('bg-','') || 'fff'}40"></div></div>`;
    const badgeCls = ri === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg shadow-amber-400/50 ring-2 ring-amber-300' : ri === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-400 shadow-md shadow-gray-400/40 ring-2 ring-gray-300' : ri === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg shadow-amber-700/50 ring-2 ring-amber-500' : 'bg-gray-400 shadow-sm ring-1.5 ring-gray-300';
    return `<div class="bg-[var(--fsc)] border border-[var(--fsb)] rounded-2xl p-5 flex flex-col">
      <div class="flex items-center gap-3 mb-3">
        <span class="w-10 h-10 rounded-full ${badgeCls} text-white text-lg font-black flex items-center justify-center flex-shrink-0">${rk}</span>
        <img src="${esc(s.avatar)}" class="w-14 h-14 rounded-full bg-white/10 ring-2 ring-white/20" alt="">
        <div class="flex-1 min-w-0"><div class="text-xl font-bold text-white truncate">${esc(s.name)}</div></div>
        <div class="text-right"><div class="text-3xl font-black tabular-nums ${ri < 3 ? 'text-pink-400' : 'text-white'}">${fmtScore(total)}</div></div>
      </div>
      <div class="space-y-2 mt-auto">${dims.map(bar).join('')}</div>
    </div>`;
  }
  // 内嵌卡：全屏卡的等比缩小版（同样结构，紧凑尺寸）
  const _de = id => POINT_DIMS.find(d => d.id === id) || {};
  const bar = o => `<div class="flex justify-between text-[10px] text-gray-500"><span>${_de(o.id).icon}${_de(o.id).label}</span><span class="font-semibold text-gray-700">${fmtScore(o.v)}</span></div>
    <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5"><div class="${dimStyle(o.id).bar} h-full rounded-full" style="width:${Math.round(o.v / maxV * 100)}%;min-width:2px"></div></div>`;
  const badgeCls = ri === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-md shadow-amber-400/40 ring-1.5 ring-amber-300' : ri === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 shadow-sm ring-1.5 ring-gray-300' : ri === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 shadow-md shadow-amber-500/30 ring-1.5 ring-amber-400' : 'bg-gray-400/80 shadow-sm ring-1 ring-gray-300';
  const topCls = ri < 3 ? `ring-1.5 ${ri===0?'ring-amber-300 shadow-sm shadow-amber-100/50':ri===1?'ring-gray-300 shadow-sm shadow-gray-100/50':'ring-amber-400/40 shadow-sm shadow-amber-100/30'}` : '';
  return `<div class="bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm ${topCls}">
    <div class="flex items-center gap-2 mb-1">
      <span class="w-6 h-6 rounded-full ${badgeCls} text-white text-xs font-bold flex items-center justify-center flex-shrink-0">${rk}</span>
      <img src="${esc(s.avatar)}" class="w-8 h-8 rounded-full bg-gray-100 ring-1 ring-gray-200" alt="">
      <div class="flex-1 min-w-0"><span class="text-sm font-semibold text-gray-800">${esc(s.name)}</span></div>
      <span class="text-base font-extrabold text-primary tabular-nums">${fmtScore(total)}</span>
    </div>
    <div class="space-y-1 pl-8">${dims.map(bar).join('')}</div>
  </div>`;
}

// 班级日志按天分组（带缓存）：仅本周内、截止到今天、按班级筛选、无日志天不显示
function homeExhibitLogGroups() {
  if (homeExhibit._cachedLogGroups && homeExhibit._cacheLogCls === homeExhibit.logClass && homeExhibit._dataVer === _exhibitDataVer()) {
    return homeExhibit._cachedLogGroups;
  }
  let logs = state.classLogs || [];
  const clsFilter = homeExhibit.logClass;
  if (clsFilter && clsFilter !== 'all') {
    const targetCls = clsFilter === 'current' ? state.activeClass : clsFilter;
    logs = logs.filter(l => classLogBelongsTo(l, targetCls));
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today); monday.setDate(today.getDate() - dow);
  const groups = {};
  logs.forEach(l => {
    const d = ptParseDate(l.date);
    if (!d) return;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day.getTime() < monday.getTime() || day.getTime() > today.getTime()) return;
    (groups[l.date] = groups[l.date] || []).push(l);
  });
  const result = Object.keys(groups).filter(k => groups[k].length)
    .sort((a, b) => (ptParseDate(a) || 0) - (ptParseDate(b) || 0))
    .map(k => ({ date: k, logs: groups[k] }));
  homeExhibit._cachedLogGroups = result;
  homeExhibit._cacheLogCls = homeExhibit.logClass;
  return result;
}

function homeExhibitLogCardHTML(l) {
  const c = l.content || '';
  const warn = /(迟到|违纪|扣分|警告|⚠️|退步|未完成|未交|打架|顶撞|没交)/.test(c);
  const good = /(表扬|获奖|🏆|👍|流动红旗|全勤|主动|进步|好人好事|拾金不昧)/.test(c);
  const border = warn ? 'border-l-4 border-amber-400' : good ? 'border-l-4 border-emerald-400' : 'border-l-4 border-slate-300';
  return `<div class="bg-white rounded-xl p-3 ${border} text-sm"><div class="text-xs text-gray-400 mb-1">${esc(recDateLabel(l.date))}</div><div class="text-gray-700 leading-relaxed">${esc(c)}</div></div>`;
}

function renderHomeRank() {
  /* 排行已整合到展览面板内（renderHomeExhibit），此处保留空壳避免报错 */
}

function renderHomeExhibit() {
  const body = document.getElementById('homeExhibitBody');
  const nav = document.getElementById('homeExhibitNav');
  const icon = document.getElementById('homeExIcon');
  const title = document.getElementById('homeExTitle');
  if (!body) return;
  if (homeExhibit.screen === 'rank') {
    icon.textContent = '🏆'; title.textContent = '积分排行展览';
    const list = homeExhibitStudents();
    // 视口分页：根据容器高度算每页能放几个
    const per = homeEmbedPerPage();
    const tp = Math.max(1, Math.ceil(list.length / per));
    if (homeExhibit.embedPage >= tp) homeExhibit.embedPage = 0;
    const page = list.slice(homeExhibit.embedPage * per, (homeExhibit.embedPage + 1) * per);
    body.innerHTML = `<div class="grid grid-cols-4 gap-2.5">${page.map((x, i) => homeExhibitCardHTML(x, homeExhibit.embedPage * per + i, false)).join('')}</div>`;
    nav.innerHTML = (tp > 1
      ? `<button class="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50" data-lock-allow onclick="homeEmbedPage(-1)">‹</button><span class="text-xs text-gray-400">${homeExhibit.embedPage + 1}/${tp}</span><button class="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50" data-lock-allow onclick="homeEmbedPage(1)">›</button> `
      : '') + `<span class="text-xs text-gray-400">共 ${list.length} 人 · ${dimLabel(homeExhibit.dim)}</span>
      <button class="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50" data-lock-allow onclick="switchHomeExhibit('log')">📓 日志 →</button>`;
  } else {
    icon.textContent = '📓'; title.textContent = '班级日志展览';
    const groups = homeExhibitLogGroups();
    if (!groups.length) {
      body.innerHTML = '<div class="text-center text-gray-400 py-10 text-sm">本周暂无班级日志</div>';
      nav.innerHTML = '<button class="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50" data-lock-allow onclick="switchHomeExhibit(\'rank\')">← 返回排行</button>';
      return;
    }
    const pg = Math.max(0, Math.min(groups.length - 1, homeExhibit.logPage));
    homeExhibit.logPage = pg;
    const g = groups[pg];
    body.innerHTML = `<div class="text-xs text-gray-400 mb-2">📅 ${esc(g.date)} · 共 ${g.logs.length} 条${homeExhibit.logClass !== 'all' && homeExhibit.logClass !== 'current' ? ' · ' + esc(homeExhibit.logClass) : ''}</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">${g.logs.map(l => homeExhibitLogCardHTML(l)).join('')}</div>`;
    nav.innerHTML = `<button class="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50" data-lock-allow onclick="homeExhibitLogPage(-1)">‹</button>
      <span class="text-xs text-gray-400">${esc(g.date)} (${pg + 1}/${groups.length})</span>
      <button class="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50" data-lock-allow onclick="homeExhibitLogPage(1)">›</button>
      <button class="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50" data-lock-allow onclick="switchHomeExhibit('rank')">← 排行</button>`;
  }
}

// 内嵌面板固定显示 2行×4列=8 张卡片（利用日期栏上移节省的空间）
function homeEmbedPerPage() { return 8; }
function homeEmbedPage(d) { homeExhibit.embedPage = Math.max(0, homeExhibit.embedPage + d); renderHomeExhibit(); }

function switchHomeExhibit(s) { homeExhibit.screen = s; homeExhibit.logPage = 0; homeExhibit.embedPage = 0; renderHomeExhibit(); }
function homeExhibitLogPage(d) { homeExhibit.logPage = Math.max(0, homeExhibit.logPage + d); renderHomeExhibit(); }

function toggleHomeExhibitSettings() {
  const p = document.getElementById('homeExhibitSettings');
  if (p) p.classList.toggle('hidden');
}

function setHomeExhibitAuto(v) {
  homeExhibit.auto = v;
  const btn = document.getElementById('homeAutoBtn');
  const badge = document.getElementById('homeExBadge');
  const on = document.getElementById('homeAutoOn'), off = document.getElementById('homeAutoOff');
  if (on) on.className = 'flex-1 border rounded-lg py-1 ' + (v ? 'bg-primary text-white' : '');
  if (off) off.className = 'flex-1 border rounded-lg py-1 ' + (v ? '' : 'bg-primary text-white');
  if (btn) btn.textContent = v ? '⏸️ 暂停' : '▶️ 轮换';
  if (badge) { badge.textContent = v ? '自动轮换中' : '已暂停'; badge.className = 'text-[10px] px-2 py-0.5 rounded-full ' + (v ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400') + ' font-semibold'; }
  if (v) startHomeExhibitAuto(); else stopHomeExhibitAuto();
  saveHomeExhibit();
}
function toggleHomeExhibitAuto() { setHomeExhibitAuto(!homeExhibit.auto); }
function setHomeExhibitInterval(v) { homeExhibit.interval = v; if (homeExhibit.auto) startHomeExhibitAuto(); if (homeExhibit.fsAuto) startHomeExhibitFsAuto(); saveHomeExhibit(); }

function startHomeExhibitAuto() {
  stopHomeExhibitAuto();
  const sec = (homeExhibit.interval || 8) * 1000;
  homeExhibit._timer = setInterval(() => {
    if (homeExhibit.screen === 'rank') {
      // 排行模式：先翻页，翻完再切到日志
      const list = homeExhibitStudents();
      const per = homeEmbedPerPage();
      const tp = Math.max(1, Math.ceil(list.length / per));
      homeExhibit.embedPage++;
      if (homeExhibit.embedPage >= tp) { homeExhibit.embedPage = 0; switchHomeExhibit('log'); }
      else renderHomeExhibit();
    } else {
      // 日志模式：翻日志天，翻完切回排行
      const groups = homeExhibitLogGroups();
      if (homeExhibit.logPage < groups.length - 1) { homeExhibit.logPage++; renderHomeExhibit(); }
      else { homeExhibit.logPage = 0; switchHomeExhibit('rank'); }
    }
  }, sec);
}
function stopHomeExhibitAuto() { if (homeExhibit._timer) { clearInterval(homeExhibit._timer); homeExhibit._timer = null; } }

// 切换人数/维度时重置分页到第1页，避免停留在越界页码
function homeExhibitSetPool(v) {
  homeExhibit.pool = +v;
  homeExhibit.embedPage = 0; homeExhibit.fsRankPage = 0;
  const el = document.getElementById('homePoolSel'); if (el) el.value = String(homeExhibit.pool);
  const fs = document.getElementById('homeFsPool'); if (fs) fs.value = String(homeExhibit.pool);
  renderHomeExhibit(); renderHomeFs();
  saveHomeExhibit();
}
function homeExhibitSetDim(v) {
  homeExhibit.dim = v;
  homeExhibit.embedPage = 0; homeExhibit.fsRankPage = 0;
  const el = document.getElementById('homeDimSel'); if (el) el.value = v;
  const fs = document.getElementById('homeFsDim'); if (fs) fs.value = v;
  renderHomeExhibit(); renderHomeFs();
  saveHomeExhibit();
}
function setHomeExhibitLogClass(v) {
  homeExhibit.logClass = v;
  homeExhibit.logPage = 0;
  renderHomeExhibit();
  // 同步更新全屏设置面板中的选择器（如果存在）
  const fsSel = document.getElementById('homeFsLogCls');
  if (fsSel) fsSel.value = v;
  saveHomeExhibit();
}

// ---- 全屏展览 ----
function toggleHomeExhibitFs() {
  const o = document.getElementById('homeFsOverlay');
  if (!o) return;
  homeExhibit.fs = !homeExhibit.fs;
  o.classList.toggle('hidden', !homeExhibit.fs);
  if (homeExhibit.fs) { renderHomeFs(); startHomeFsClock(); if (homeExhibit.fsAuto) startHomeExhibitFsAuto(); }
  else { stopHomeFsClock(); stopHomeExhibitFsAuto(); }
  // 注意：fs（全屏开/关）不持久化，避免每次启动自动弹出全屏；其余展示设置在各自 setter 保存
}
function toggleHomeExhibitFsSettings() { const p = document.getElementById('homeFsPanel'); if (p) p.classList.toggle('hidden'); }

// 全屏每页固定6人(2×3大卡片)，适合教室投屏
function homeFsPerPage() { return 6; }

// 响应式列数：根据屏幕宽度自动选择
function homeFsGridCols() {
  const w = window.innerWidth;
  if (w < 768) return 2;       // 手机：2列
  if (w < 1280) return 3;      // 电脑：3列
  return 3;                     // 智慧屏/大屏：3列（2行×3=6人）
}

function renderHomeFs() {
  const body = document.getElementById('homeFsBody');
  if (!body) return;
  const sp = document.getElementById('homeFsPool'); if (sp) sp.value = String(homeExhibit.pool);
  const sd = document.getElementById('homeFsDim'); if (sd) sd.value = homeExhibit.dim;
  const fi = document.getElementById('homeFsInt'); if (fi) fi.value = String(homeExhibit.interval);
  const cols = homeFsGridCols();
  if (homeExhibit.fsScreen === 'rank') {
    document.getElementById('homeFsTitle').textContent = '🏆 积分排行';
    const list = homeExhibitStudents();
    const per = homeFsPerPage();
    const tp = Math.max(1, Math.ceil(list.length / per));
    if (homeExhibit.fsRankPage >= tp) homeExhibit.fsRankPage = tp - 1;
    const page = list.slice(homeExhibit.fsRankPage * per, (homeExhibit.fsRankPage + 1) * per);
    body.innerHTML = `<div class="grid gap-5" style="grid-template-columns:repeat(${cols},1fr);max-width:1200px;margin:0 auto">${page.map((x, i) => homeExhibitCardHTML(x, homeExhibit.fsRankPage * per + i, true)).join('')}</div>`
      + (tp > 1 ? `<div class="flex items-center justify-center gap-4 mt-6"><button class="text-lg px-6 py-2 rounded-full border border-[var(--fsb)] hover:bg-white/10" data-lock-allow onclick="homeFsPage('rank',-1)">‹</button><span class="text-base opacity-70">第 ${homeExhibit.fsRankPage + 1}/${tp} 页</span><button class="text-lg px-6 py-2 rounded-full border border-[var(--fsb)] hover:bg-white/10" data-lock-allow onclick="homeFsPage('rank',1)">›</button></div>` : '');
  } else {
    document.getElementById('homeFsTitle').textContent = '📓 班级日志';
    const groups = homeExhibitLogGroups();
    if (!groups.length) { body.innerHTML = '<div class="text-center opacity-50 py-20 text-lg">本周暂无班级日志</div>'; }
    else {
      const pg = Math.max(0, Math.min(groups.length - 1, homeExhibit.fsLogPage)); homeExhibit.fsLogPage = pg;
      const g = groups[pg];
      const logCols = window.innerWidth < 768 ? 1 : (window.innerWidth < 1024 ? 2 : 3);
      body.innerHTML = `<div class="max-w-[1200px] mx-auto"><div class="text-base opacity-60 mb-4">📅 ${esc(g.date)} · ${g.logs.length} 条${homeExhibit.logClass !== 'all' && homeExhibit.logClass !== 'current' ? ' · ' + esc(homeExhibit.logClass) : ''}</div><div class="grid gap-4" style="grid-template-columns:repeat(${logCols},1fr)">${g.logs.map(l => homeExhibitLogCardHTML(l)).join('')}</div></div>`
        + (groups.length > 1 ? `<div class="flex items-center justify-center gap-4 mt-6"><button class="text-lg px-6 py-2 rounded-full border border-[var(--fsb)] hover:bg-white/10" data-lock-allow onclick="homeFsPage('log',-1)">‹</button><span class="text-base opacity-70">📅 ${esc(g.date)} (${pg + 1}/${groups.length})</span><button class="text-lg px-6 py-2 rounded-full border border-[var(--fsb)] hover:bg-white/10" data-lock-allow onclick="homeFsPage('log',1)">›</button></div>` : '');
    }
  }
  body.insertAdjacentHTML('beforeend', `<div class="flex justify-center gap-4 mt-8 pb-8"><button class="text-base px-6 py-2.5 rounded-full border border-[var(--fsb)] ${homeExhibit.fsScreen === 'rank' ? 'bg-pink-500 text-white border-pink-500' : ''} hover:bg-white/10" data-lock-allow onclick="switchHomeFs('rank')">🏆 积分排行</button><button class="text-base px-6 py-2.5 rounded-full border border-[var(--fsb)] ${homeExhibit.fsScreen === 'log' ? 'bg-pink-500 text-white border-pink-500' : ''} hover:bg-white/10" data-lock-allow onclick="switchHomeFs('log')">📓 班级日志</button></div>`);
}

function switchHomeFs(s) { homeExhibit.fsScreen = s; homeExhibit.fsRankPage = 0; homeExhibit.fsLogPage = 0; renderHomeFs(); saveHomeExhibit(); }
function homeFsPage(which, d) {
  if (which === 'rank') { const list = homeExhibitStudents(), per = homeFsPerPage(), tp = Math.max(1, Math.ceil(list.length / per)); homeExhibit.fsRankPage = Math.max(0, Math.min(tp - 1, homeExhibit.fsRankPage + d)); }
  else { const n = homeExhibitLogGroups().length; homeExhibit.fsLogPage = Math.max(0, Math.min(n - 1, homeExhibit.fsLogPage + d)); }
  renderHomeFs();
}
function setHomeExhibitFsAuto(v) {
  homeExhibit.fsAuto = v;
  const on = document.getElementById('homeFsAutoOn'), off = document.getElementById('homeFsAutoOff');
  if (on) on.className = 'flex-1 border rounded-lg py-1 ' + (v ? 'bg-primary text-white' : '');
  if (off) off.className = 'flex-1 border rounded-lg py-1 ' + (v ? '' : 'bg-primary text-white');
  if (v) startHomeExhibitFsAuto(); else stopHomeExhibitFsAuto();
  saveHomeExhibit();
}
function startHomeExhibitFsAuto() {
  stopHomeExhibitFsAuto();
  const sec = (homeExhibit.interval || 8) * 1000;
  homeExhibit._fsTimer = setInterval(() => {
    if (homeExhibit.fsScreen === 'rank') {
      const list = homeExhibitStudents(), per = homeFsPerPage(), tp = Math.max(1, Math.ceil(list.length / per));
      homeExhibit.fsRankPage++;
      if (homeExhibit.fsRankPage >= tp) { homeExhibit.fsRankPage = 0; switchHomeFs('log'); } else renderHomeFs();
    } else {
      const groups = homeExhibitLogGroups();
      homeExhibit.fsLogPage++;
      if (homeExhibit.fsLogPage >= groups.length) { homeExhibit.fsLogPage = 0; switchHomeFs('rank'); } else renderHomeFs();
    }
  }, sec);
}
// 全屏模式窗口大小变化时重绘（响应式）
window.addEventListener('resize', () => { if (homeExhibit.fs) renderHomeFs(); });
function stopHomeExhibitFsAuto() { if (homeExhibit._fsTimer) { clearInterval(homeExhibit._fsTimer); homeExhibit._fsTimer = null; } }
function startHomeFsClock() { stopHomeFsClock(); const tick = () => { const e = document.getElementById('homeFsClock'); if (e) e.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }; tick(); homeExhibit._clock = setInterval(tick, 1000); }
function stopHomeFsClock() { if (homeExhibit._clock) { clearInterval(homeExhibit._clock); homeExhibit._clock = null; } }
function setHomeExhibitFsBg(light) {
  const o = document.getElementById('homeFsOverlay'); if (!o) return;
  homeExhibit.fsBg = light ? 'light' : 'dark';
  saveHomeExhibit();
  if (light) { o.style.background = 'linear-gradient(135deg,#f8fafc,#e2e8f0)'; o.style.color = '#1e293b'; o.style.setProperty('--fsc', 'rgba(255,255,255,.9)'); o.style.setProperty('--fsb', 'rgba(148,163,184,.3)'); }
  else { o.style.background = 'linear-gradient(135deg,#0f172a,#1e293b)'; o.style.color = '#e2e8f0'; o.style.setProperty('--fsc', 'rgba(30,41,59,.6)'); o.style.setProperty('--fsb', 'rgba(148,163,184,.25)'); }
  [['homeBgDark', !light], ['homeBgLight', light], ['homeFsBgDark', !light], ['homeFsBgLight', light]].forEach(([id, on]) => {
    const b = document.getElementById(id); if (b) { b.classList.toggle('bg-primary', on); b.classList.toggle('text-white', on); }
  });
}
function homeExhibitClearTimer() { stopHomeExhibitAuto(); stopHomeExhibitFsAuto(); stopHomeFsClock(); }

// 首页渲染后初始化内嵌展览（仅在班主任首页存在控制下拉框时生效）
function initHomeExhibit() {
  const dimSel = document.getElementById('homeDimSel');
  const poolSel = document.getElementById('homePoolSel');
  if (!dimSel || !poolSel) return;
  dimSel.value = homeExhibit.dim; poolSel.value = String(homeExhibit.pool);
  const intSel = document.getElementById('homeIntSel'); if (intSel) intSel.value = String(homeExhibit.interval);
  // 统一走 homeExhibitSet*，保证类型一致(pool 为数字)且内嵌/全屏两个面板互相同步
  dimSel.onchange = () => homeExhibitSetDim(dimSel.value);
  poolSel.onchange = () => homeExhibitSetPool(+poolSel.value);
  // 初始化日志班级选择器
  const logClsSel = document.getElementById('homeLogClsSel');
  if (logClsSel) logClsSel.value = homeExhibit.logClass;
  renderHomeExhibit(); setHomeExhibitAuto(homeExhibit.auto);
  document.removeEventListener('click', homeExhibitDocClick);
  document.addEventListener('click', homeExhibitDocClick);
}
function homeExhibitDocClick(e) {
  const p = document.getElementById('homeExhibitSettings');
  if (p && !p.classList.contains('hidden') && !p.contains(e.target) && !e.target.closest('#homeSetBtn')) p.classList.add('hidden');
  const fp = document.getElementById('homeFsPanel');
  if (fp && !fp.classList.contains('hidden') && !fp.contains(e.target) && !e.target.closest('[data-fsset]')) fp.classList.add('hidden');
}

// ===================== 一句话记录（自然语言识别） =====================
// 记录类型：类型标签词（既用于识别、也会从内容中剔除，都是明确的「类型动词」）
const REC_TYPE_LABELS_WORDS = {
  critic: ['批评','罚站','罚抄','处罚','违纪','迟到','早退','打架','顶撞','不交','没交','未完成','没完成','犯错','扣分','警告','处分','玩手机','走神','睡觉','抄袭','作弊','说话','不认真','不专心'],
  praise: ['表扬','夸奖','夸','赞','得奖','获奖','奖励','突出','满分','高分','守纪律','好人好事'],
  chat:   ['谈心','谈话','沟通','家访','约谈','开导','安慰','鼓励','交流'],
  leave:  ['请假','病假','事假','请假条','缺席'],
};
// 仅用于识别的描述性短语（不剔除，保证正文完整）
const REC_TYPE_DESC = {
  critic: ['顶撞','玩手机','走神','睡觉','抄袭','作弊','吵架','打架','旷课','追逐打闹','马虎','带零食','不整齐','吃零食','喧哗','传纸条','小动作','辱骂','破坏公物','不服从管理','擅自离开座位',
           '讲话','讲小话','打闹','捣乱','起哄','接话','插话','吃东西','看课外书','随意走动','离开座位','下座位','不听讲','不听课'],
  praise: ['主动帮助同学','帮助同学','助人为乐','表现好','值日认真','作业优秀','一等奖','二等奖','三等奖','积极发言','主动','认真','勤奋','贴心','懂事','优秀','进步','棒','拾金不昧','诚实守信','团结同学','热爱劳动','文明守纪','乐于助人'],
  chat:   ['心理疏导','聊天','聊到','聊了','情绪低落'],
  leave:  ['肚子疼','不舒服','生病','家中有事','事假'],
};
// 运行时可配置的关键词读取（优先 state.recKeywords，缺失回退硬编码默认）
function getRecLabels(t) { return (state.recKeywords && state.recKeywords.labels && Array.isArray(state.recKeywords.labels[t])) ? state.recKeywords.labels[t] : (REC_TYPE_LABELS_WORDS[t] || []); }
// 内置描述词与用户自定义词取并集：这样以后新增的内置词对已保存的老数据也立即生效，
// 用户自己在设置里加的词依然保留（不会互相覆盖）。
function getRecDesc(t) {
  const mine = (state.recKeywords && state.recKeywords.desc && Array.isArray(state.recKeywords.desc[t])) ? state.recKeywords.desc[t] : [];
  const builtin = REC_TYPE_DESC[t] || [];
  return [...new Set(mine.concat(builtin))];
}
// 识别/剔除用的「引出词」（如「提出表扬」的「提出」）
const REC_LEADIN = ['提出','给予','予以','进行','做了','被'];
const REC_TYPE_LABELS = { critic:'批评', praise:'表扬', chat:'谈心', leave:'请假' };
const REC_TYPE_EMOJI  = { critic:'⚠️', praise:'👍', chat:'💬', leave:'🏥' };
function recordTypeLabel(t){ return REC_TYPE_LABELS[t] || '记录'; }
function recordTypeClass(t){ return t==='critic'?'tag-critic':t==='praise'?'tag-praise':t==='leave'?'tag-leave':'tag-chat'; }
function recordTypeEmoji(t){ return REC_TYPE_EMOJI[t] || '📝'; }
// 积分维度识别：根据关键词自动判断所属模块
const QR_DIM_KWS = {
  sport: ['体育','早训','早操','课间操','锻炼','运动会','跑步','跳绳','体测','体育课','篮球','足球','排球','乒乓球','游泳','体能'],
  exam:  ['考试','测验','月考','期中','期末','满分','高分','成绩','排名','进步','退步','各科'],
  post:  ['班长','课代表','委员','组长','履职','职务','负责','收发作业','班干部','团支书'],
  daily: ['课堂','纪律','作业','值日','卫生','主动','帮助','迟到','早退','校服','红领巾','文明'],
};
const QR_CONNECTORS = /(?:且|并且|又|还|同时|接着|随后|另外|此外|以及|然后|再|最后)/;
// 两名学生之间的「间隔文本」必须整体只是分隔符 / 单个连接词，才能判定为并列（避免把含"且"的事件描述误判为连接）
const BETWEEN_CONN = /^(?:[，,、\s]*)(?:且|并且|又|还|同时|接着|随后|另外|此外|以及|然后|再|最后|和|与|跟|同)?(?:[，,、\s]*)$/;
const QR_CLAUSE_SPLIT = /[，；。,;!！?？\n]+/;
// 事件开头词：给「未知姓名」划右边界，避免把事件首字吞进名字。
// 例：没有它时「周浩然上课说话」会被取成姓名「周浩然上」+ 内容「课说话」。
// 动态生成「上X课」类事件头，避免「孙阳上数学课和高语昕说话」把「上数学课」当成未知姓名，
// 也让两名学生共享课堂动作时能被正确识别。
function qrEventHeads() {
  const heads = new Set(QR_EVENT_HEADS);
  (state.classRecordSubjects || []).forEach(sub => {
    if (!sub.name) return;
    heads.add('上' + sub.name + '课');
    heads.add(sub.name + '课');
    heads.add('在' + sub.name + '课');
  });
  return [...heads];
}
const QR_EVENT_HEADS = ['上课','下课','课堂','课间','讲话','聊天','打闹','追逐','捣乱','起哄','顶嘴','接话','插话','迟到','早退','旷课',
  '睡觉','走神','发呆','玩手机','传纸条','吃东西','喝水','随意走动','离开座位','下位',
  '作业','背诵','默写','预习','复习','考试','测验','卷子','练习','抄写','考了','考完','写完','背完',
  '值日','打扫','卫生','帮助','帮忙','补习','辅导','还给','归还',
  '批评','表扬','谈心','谈话','请假','完成','没完成','未完成','没交','不交',
  '举手','发言','回答','认真','主动','积极','安静','优秀','进步','满分','获奖','突出',
  '一起','一块','一块儿'];
// 姓名黑名单（集体词 / 虚词首字）：这些不是人名，别当成学生提取
const QR_NOT_NAME = ['全班','全体','大家','同学们','同学','部分','几名','多名','有些','有的','某位','一位','该生','本人','两人','三人','四人','所有人',
  '很','太','挺','都','也','又','再','还','就','才','已','正','在','被','把','让','给','帮','向','往','从','对','为','因','所','但','而','且','或','等','这','那','几','多','少','有','无','不','没','未','别','各','每','半','和','与','跟','同'];
// 「A + 事件片段 + 并列词 + B + 事件片段」：如「袁希诺上课和孙阳说话」→ 两人共享「上课说话」
const QR_SHARED_ACT_RE = /^([^\s，,、；;。:：!！?？]{0,8})(和|与|跟|同|一起|一块|一块儿)$/;
// 「A + 承接动词 + B + 事件」：如「袁希诺帮孙阳补习数学」→ A 记「帮孙阳补习数学」，B 不再单列
const QR_BRIDGE_VERBS = ['帮','帮着','帮忙','替','给','带','带着','陪','陪着','教','教着','送','约','叫','让','拉','喊','找','扶','背','接','领','领着','照顾','辅导','补习','护送'];
// 纯类型标签短语（去掉引出词后只剩类型词）：只是修饰前一条记录，不该单独占一条
const QR_LABEL_ONLY = ['表扬','夸奖','批评','谈心','谈话','沟通','家访','约谈','请假','病假','事假','警告','处分','记过'];
// 量词 / 时间单位等：提示「未命中关键词」时要排除，否则会出现「分钟」「次」这类噪音
const QR_NOISE_FRAGS = ['分钟','小时','秒钟','点钟','次','遍','道题','节课','年级','学期','月份','左右','大概','上午','下午','晚上','早上','中午'];
// 单字虚词：一律不能作为姓名起点，但处理方式分两类。
// 绝不把它们当成「关键词跳过」——跳过会让扫描器落进词中间：
// 「李雷不服从管理」跳过「不」后会把「服从管理」当成未注册学生，李雷的记录内容只剩「不」。
//   跳过类（动词/介词）：后面往往还跟着真姓名，跳过继续找（李思雨帮王小明补习数学 → 王小明）
//   停止类（否定/程度/副词）：直接停止扫描（李雷不服从管理 → 不产生任何姓名）
const QR_SKIP_CHARS = new Set(['帮','被','把','让','给','向','往','从','对','为','因','和','与','跟','同']);
const QR_STOP_CHARS = new Set(['不','没','未','别','无','很','太','挺','都','也','又','再','还','就','才','已','正','在','等','这','那','几','多','少','有','但','而','且','或','各','每','半']);

// 日期表达式（用于识别"今天/本周三/周一…"等，并解析为星期几）
const QR_DATE_WORDS = ['今天','今日','昨天','昨日','昨晚','昨夜','明天','明日',
  '本周一','本周二','本周三','本周四','本周五','本周六','本周日',
  '下周','这周','本周',
  '星期一','星期二','星期三','星期四','星期五','星期六','星期日','星期天',
  '礼拜一','礼拜二','礼拜三','礼拜四','礼拜五','礼拜六','礼拜天',
  '周一','周二','周三','周四','周五','周六','周日'];
// 收集职务/卫生/值日相关关键词（含用户自定义扣分关键词 + 常见卫生词），用于把"卫生事件"从学生记录中剥离
function qrDutyKeywordSet() {
  const s = new Set();
  const dk = (state.positions && state.positions.deductionKeywords) || {};
  for (const id in dk) (dk[id] || []).forEach(k => { if (k) s.add(k.toLowerCase()); });
  ['卫生','室内','室外','值日','值日生','黑板','拖地','垃圾桶','垃圾','窗台','走廊','讲台','包干','清洁','打扫','地面','保洁'].forEach(k => s.add(k));
  return s;
}
// 把文本中的日期词与职务/卫生关键词替换为等长占位符，避免被当成学生姓名提取
function qrClaimMask(text) {
  let words = QR_DATE_WORDS.slice();
  qrDutyKeywordSet().forEach(w => words.push(w));
  words = [...new Set(words)].filter(Boolean).sort((a, b) => b.length - a.length);
  const claims = [];
  words.forEach(w => {
    const lower = w.toLowerCase();
    let i = text.toLowerCase().indexOf(lower);
    while (i !== -1) { claims.push([i, i + w.length]); i = text.toLowerCase().indexOf(lower, i + 1); }
  });
  if (!claims.length) return text;
  claims.sort((a, b) => a[0] - b[0]);
  const merged = [];
  claims.forEach(c => {
    if (merged.length && c[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], c[1]);
    else merged.push([c[0], c[1]]);
  });
  let res = '', p = 0;
  merged.forEach(([s, e]) => { res += text.slice(p, s) + '\u0003'.repeat(e - s); p = e; });
  res += text.slice(p);
  return res;
}
// 判断一句是否为「职务/卫生事件」（应走关联扣分，不挂到具体学生）
function isDutyClause(c) {
  const DUTY = qrDutyKeywordSet();
  if (![...DUTY].some(k => c.includes(k))) return false;
  // 正向卫生/值日描述（如"卫生很好""值日认真"）不视为需扣分事件
  const POS = /(干净|整洁|整齐|到位|认真|优秀|棒|好|达标|合格)/;
  if (POS.test(c) && !/(不|没|未|别|无)(干净|整洁|整齐|到位|认真|优秀|棒|好|达标|合格)/.test(c)) return false;
  if (/(今天|今日|昨天|昨日|明天|明日|本周[一二三四五六日天]|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|下周|这周)/.test(c)) return true;
  if (/(不好|不合格|差劲|糟糕|脏|乱|不到位|没做好|未做好|不干净|马虎|敷衍|没扫|未扫|没拖|没倒|不认真|扣|不合格)/.test(c)) return true;
  return false;
}
// 提取日期表达式原文（用于展示"今天(周四)"）
function qrDayExpr(text) {
  if (/今天|今日/.test(text)) return '今天';
  if (/明天|明日/.test(text)) return '明天';
  if (/昨晚|昨夜/.test(text)) return '昨晚';
  if (/昨天|昨日/.test(text)) return '昨天';
  const m = text.match(/本周[一二三四五六日天]|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]/);
  return m ? m[0] : null;
}
// 把日期表达式解析为具体日期。
// 2026-08-30 起统一返回 ISO「YYYY-MM-DD」（旧版返回「X月X日」，无法承载秒级精度）。
// 只归档到「哪一天」；具体时刻由 qrSave 在「就是今天」时补上 HH:mm:ss。
function qrResolveDate(text) {
  if (!text) return null;
  const base = new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const addDays = n => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = x => todayISO(x);
  if (/今天|今日/.test(text)) return fmt(d);
  if (/明天|明日/.test(text)) return fmt(addDays(1));
  if (/昨晚|昨夜|昨天|昨日/.test(text)) return fmt(addDays(-1));
  if (/前天/.test(text)) return fmt(addDays(-2));
  const wmap = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6 };
  const m = text.match(/[周礼拜]([一二三四五六日天])/);
  if (!m) return null;
  const wd = wmap[m[1]];
  let weekOffset = 0;
  if (/上周/.test(text)) weekOffset = -1;
  else if (/下周|下星期|下礼拜/.test(text)) weekOffset = 1;
  else if (/本周|这周|本星期|本礼拜/.test(text)) weekOffset = 0;
  const dow = (d.getDay() + 6) % 7; // 周一=0
  const monday = addDays(-dow);
  const target = new Date(monday);
  target.setDate(target.getDate() + wd + weekOffset * 7);
  return fmt(target);
}
// 否定前缀检测：关键字前 1~2 字含 不/没/未/别/无 则视为否定（如「不认真」不是表扬）
function hasNegBefore(text, kw) {
  const i = text.indexOf(kw);
  if (i <= 0) return false;
  return /[不没未别无]$/.test(text.slice(Math.max(0, i - 2), i));
}
// 正向情感词（需排除否定形式）
const QR_POS_WORDS = ['完成', '满分', '优秀', '帮助', '主动', '认真', '进步', '棒', '突出', '得奖', '帮', '帮忙', '补习', '辅导'];
function hasPos(text) {
  for (const w of QR_POS_WORDS) { if (text.includes(w) && !hasNegBefore(text, w)) return true; }
  return false;
}

// 从文本中找出可能的学生姓名（不在名册中的）。
// 策略：在每个分句开头扫描「姓名[,、]姓名[,、]...」序列，遇到事件描述或已知学生边界即停止。
function extractUnknownNames(text, knownHits) {
  const keywordSet = new Set();
  ['语文','数学','英语','物理','化学','政治','历史','地理','生物','体育','音乐','美术','信息','班会','其他',
   '作业','布置作业','交作业','写作业','完成作业','背诵','默写','练习','抄写','预习','复习','试卷','卷子','学案','同步','练习册','课后题',
   '批评','表扬','谈心','请假','迟到','早退','打架','顶撞','不交','没交','未完成','没完成','犯错','扣分','警告','处分','玩手机','走神','睡觉','抄袭','作弊','说话',
   '今天','明天','昨天','上午','下午','课间','课堂','学校','老师','同学','班主任','家长','孩子','提出','给予','予以','进行','做了','被'].forEach(k => keywordSet.add(k));
  QR_EVENT_HEADS.forEach(k => keywordSet.add(k));   // 事件开头词：给姓名划右边界，防止吞字
  qrEventHeads().forEach(k => { if (k && !QR_EVENT_HEADS.includes(k)) keywordSet.add(k); }); // 动态「上X课」等
  // 集体词 / 量词只收两字以上：单字虚词（不/都/很…）另有专门的起止判断（QR_STOP_CHARS / QR_SKIP_CHARS），
  // 不能进这张表当关键词跳过，否则会把扫描器带进词中间。
  QR_NOT_NAME.filter(k => k.length >= 2).forEach(k => keywordSet.add(k));
  QR_NOISE_FRAGS.filter(k => k.length >= 2).forEach(k => keywordSet.add(k));
  // 记录类型标签词（批评/罚站/说话/表扬…）同样是事件词，不能当姓名（否则「罚站」会被当成人名）
  ['critic', 'praise', 'chat', 'leave'].forEach(t => (REC_TYPE_LABELS_WORDS[t] || []).forEach(k => keywordSet.add(k)));
  const allKwList = [...keywordSet].filter(Boolean).sort((a, b) => b.length - a.length);
  const isNoise = (word) => keywordSet.has(word) || QR_CONNECTORS.test(word);
  // 候选姓名中间夹了科目/作业/事件关键词，说明它不是姓名（如「上数学课」「英语作业」）
  const containsNoNameKw = (word) => {
    for (const kw of allKwList) { if (kw.length >= 2 && word.includes(kw)) return true; }
    return false;
  };
  const knownRanges = knownHits.map(h => ({ start: h.pos, end: h.pos + h.len }));
  const isKnownAt = (pos, len) => knownRanges.some(r => r.start === pos && r.end === pos + len);
  const isKnownOverlap = (pos, len) => knownRanges.some(r => pos < r.end && pos + len > r.start);
  // 当前位置是否正好是一个事件/关键词的开头；返回该词（用于把游标推过事件，继续向后找姓名）
  const headWordAt = (p) => { for (const kw of allKwList) { if (text.startsWith(kw, p)) return kw; } return ''; };

  // 「名词性关键词」（科目 / 作业 / 日期 / 事件名词…）前面紧邻的中文不是姓名。
  // 没有这条，「…且数学课走神」会把「课走神」当成学生名。
  const funcSet = new Set(QR_NOT_NAME.concat(QR_BRIDGE_VERBS).concat(REC_LEADIN));
  const nounishWords = allKwList.filter(w => w.length >= 2 && !funcSet.has(w));
  (state.homeworkKeywords || []).forEach(k => nounishWords.push(k));
  (state.classRecordSubjects || []).forEach(s => (s.keywords || []).forEach(k => nounishWords.push(k)));
  nounishWords.sort((a, b) => b.length - a.length);
  const isNounishBefore = (p) => nounishWords.some(w => p >= w.length && text.startsWith(w, p - w.length));

  const names = [];
  const startsWithNoise = (str) => {
    for (const kw of allKwList) { if (str.startsWith(kw)) return true; }
    return false;
  };
  const clauses = text.split(/([；。;])/);
  let offset = 0;
  for (let i = 0; i < clauses.length; i += 2) {
    const clause = clauses[i];
    const sep = clauses[i + 1] || '';
    let pos = offset;
    while (pos < offset + clause.length) {
      // 跳过占位符(\u0003)与非中文字符（qrClaimMask 把日期/卫生词替换成 \u0003，避免被当成姓名起点）
      while (pos < text.length && !/^[\u4e00-\u9fa5]$/.test(text[pos])) pos++;
      if (pos >= offset + clause.length) break;
      // 当前位置正好是一个事件/虚词开头 → 这里不可能是姓名起点，整个词跳过去再找
      // （没有这一步，「袁希诺上课玩手机」会把「玩手」当成未知名，剩下「机」当内容）
      const headKw = headWordAt(pos);
      if (headKw) { pos += headKw.length; continue; }
      // 否定 / 程度 / 副词单字：这里不可能是姓名起点，而且**不能跳过**
      // （跳过「不」就会把「不服从管理」里的「服从管理」当成学生名）
      if (QR_STOP_CHARS.has(text[pos])) break;
      // 从当前位置尝试2-4字中文，选择「后面紧跟关键词」的最长合法长度
      let name = '', namePos = pos, nextPos = pos;
      for (let len = 2; len <= 4 && pos + len <= text.length; len++) {
        const candidate = text.slice(pos, pos + len);
        if (!/^[\u4e00-\u9fa5]{2,4}$/.test(candidate)) break;
        if (startsWithNoise(candidate)) break; // 候选本身以事件词开头，不是姓名
        if (/^[和与会跟同且又还]/.test(text.slice(pos + len))) { name = candidate; nextPos = pos + len; break; } // 连接词后接下一姓名
        if (startsWithNoise(text.slice(pos + len))) {
          name = candidate;
          nextPos = pos + len;
          break;
        }
        name = candidate;
        nextPos = pos + len;
      }
      if (!name) break;
      // 若与已知学生重叠：完全 known 就跨过去继续向后；只重叠一部分则跳到该已知学生末尾再判断
      if (isKnownOverlap(namePos, name.length)) {
        if (isKnownAt(namePos, name.length)) {
          pos = nextPos;
          const hw = headWordAt(pos);
          // 后面既不是分隔符、也不是并列词、也不是事件/虚词开头 → 说明姓名序列到此结束
          if (!/[，,、]/.test(text[pos]) && !/^[和与会跟同且又还]$/.test(text[pos]) && !hw) {
            // 单字动词/介词（帮/给/被…）后面可能还有真正的姓名，跳过这一个字继续找
            if (QR_SKIP_CHARS.has(text[pos])) { pos += 1; continue; }
            break;
          }
          pos += hw ? hw.length : 1;
          continue;
        }
        // 旧逻辑在这里直接 break，导致「李思雨帮王小明补习数学」句首是名册学生时，
        // 后面的王小明（不在名册）被整句丢弃。改为跳到已知学生末尾，仅当那里正好是
        // 事件/虚词开头才继续扫描（这样「张明轩拾金不昧」仍不会把「拾金不昧」当姓名）。
        const ov = knownRanges.filter(r => namePos < r.end && namePos + name.length > r.start)
                              .sort((a, b) => b.end - a.end)[0];
        const npos = ov ? ov.end : nextPos;
        const hw2 = headWordAt(npos);
        // 单字动词/介词同理：跳过它后面可能还有真姓名（李思雨帮王小明补习数学）
        const step = hw2 ? hw2.length : (QR_SKIP_CHARS.has(text[npos]) ? 1 : 0);
        if (!step) break;
        pos = npos + step;
        continue;
      }
      if (isNoise(name)) break;
      if (containsNoNameKw(name)) break; // 「上数学课」「英语作业」等不是姓名
      if (isNounishBefore(namePos)) break;
      names.push({ pos: namePos, len: name.length, name });
      pos = nextPos;
      // 姓名之间可用 顿号/逗号 或 连接词(和/与/跟/同/且/又/还) 连续
      if (!/[，,、]/.test(text[pos]) && !/^[和与会跟同且又还]$/.test(text[pos])) break;
      if (/^[和与会跟同且又还]$/.test(text[pos])) pos++;
    }
    offset += clause.length + sep.length;
  }
  // 去重并按位置排序
  const seen = new Set();
  return names.filter(n => {
    const key = n.pos + '-' + n.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.pos - b.pos);
}

// 智能解析：返回 { raw, segments:[{student:{id,name}?, unknownName?, items:[{text,content,subjects,homework,rules,recType,dim,pointDelta,enabled}]}], matched:[] }
// 支持连续多名学生共享同一段事件描述，例如「赵吉晨，孙巾杰数学作业未完成；秦梦茹，刘俊汝英语作业未完成」
function parseQuickRecord(text) {
  text = (text || '').trim();
  const matched = [];
  // 1) 识别所有学生，按出现位置排序（取每个学生的最长别名首次匹配）
  const studentHits = [];
  state.students.forEach(s => {
    const aliases = [s.name].concat((s.alias || '').split(/\s+/).filter(Boolean));
    aliases.sort((a, b) => b.length - a.length);
    for (const a of aliases) {
      if (!a) continue;
      let pos = text.indexOf(a);
      while (pos !== -1) {
        // 避免重叠：若该位置已被更长别名占用则跳过
        const overlap = studentHits.some(h => pos < h.pos + h.len && pos + a.length > h.pos);
        if (!overlap) {
          studentHits.push({ id: s.id, name: s.name, alias: a, len: a.length, pos });
        }
        pos = text.indexOf(a, pos + 1);
      }
      if (studentHits.some(h => h.id === s.id)) {
        matched.push({ kind: 'student', value: s.name });
        break;
      }
    }
  });
  studentHits.sort((a, b) => a.pos - b.pos);
  // 2) 识别不在名册中的潜在学生名，并合并到所有命中位置（先用占位符遮住日期/卫生词，避免误当成姓名）
  const unknownHits = extractUnknownNames(qrClaimMask(text), studentHits);
  const allHits = studentHits.concat(unknownHits.map(u => ({ ...u, id: null, name: u.name, unknown: true }))).sort((a, b) => a.pos - b.pos);
  // 3) 把学生按「连续并列组」拆分：组内学生之间只有逗号/顿号/连接词，共享组后的一段事件描述
  const rawSegments = []; // [{student?, unknownName?, text}]
  if (!allHits.length) {
    // 整段无学生：按分句拆分，职务/卫生/值日事件交给「关联扣分」，不生成 phantom 卡片
    text.split(QR_CLAUSE_SPLIT).map(s => s.trim()).filter(Boolean).forEach(cl => {
      if (!isDutyClause(cl)) rawSegments.push({ student: null, text: cl, date: qrResolveDate(cl) || null });
    });
  } else {
    let i = 0;
    let prevEnd = 0; // 上一组结束位置，用于把学生名「前面」的日期词（如「昨天李雷…」）也纳入解析
    while (i < allHits.length) {
      let j = i;
      let prefix = ''; // 「A 事件片段 和 B」里的事件片段，需要拼回 B 后面那段的前面
      let firstOnlyText = ''; // 「A 完成了自己的事，上课和 B 说话」里 A 单独的事件，不共享给 B
      while (j + 1 < allHits.length) {
        const between = text.slice(allHits[j].pos + allHits[j].len, allHits[j + 1].pos);
        if (BETWEEN_CONN.test(between)) { j++; continue; }
        // 「袁希诺上课和孙阳说话」：两名学生之间夹了事件片段 + 并列词。
        // 两人是共同做了这件事，应共享「前缀 + B 之后的描述」，所以吞并后立刻停止，
        // 避免把后面「，孙阳也在说话」这类新分句也连坐进来。
        const m = between.match(QR_SHARED_ACT_RE);
        if (m && m[1] && qrEventHeads().includes(m[1])) { prefix = m[1]; j++; break; }
        // 「袁希诺政治作业未完成，上课和孙阳说话」：A 先有一条独立记录，
        // 接着「事件头 + 并列词」引出 B 共同做这件事。
        // 把并列词前面的事件头拆出来作为共享前缀，前面剩余部分只归 A。
        // 连接词（且/又/还…）分隔的多个子句中，只有最后一段可能是共享事件头。
        const parts = between.split(QR_CONNECTORS).map(s => s.trim()).filter(Boolean);
        const last = parts.length ? parts[parts.length - 1] : '';
        const tailMatch = last.match(QR_SHARED_ACT_RE) || last.match(/(?:^|[，,、；;。:：\s]+)([^\s，,、；;。:：!！?？]{1,8})(和|与|跟|同|一起|一块|一块儿)$/);
        if (tailMatch) {
          const maybeHead = tailMatch[1];
          if (qrEventHeads().includes(maybeHead)) {
            prefix = maybeHead;
            parts.pop();
            const leftover = last.slice(0, last.length - tailMatch[0].length).replace(/[，,、；;。:：\s]+$/g, '');
            if (leftover) parts.push(leftover);
            firstOnlyText = parts.join('，').replace(/^[，,、；;。:：\s]+|[，,、；;。:：\s]+$/g, '');
            j++;
            break;
          }
        }
        break;
      }
      const groupStart = allHits[j].pos + allHits[j].len;
      const groupEnd = j + 1 < allHits.length ? allHits[j + 1].pos : text.length;
      const before = text.slice(prevEnd, allHits[i].pos); // 本组首个学生之前的上下文（含前置日期词）
      let sharedText = text.slice(groupStart, groupEnd).trim().replace(/^[，,、；;。.:：!！?？\s]+/, '');
      if (prefix) sharedText = prefix + sharedText;
      const segDate = qrResolveDate(before + sharedText) || null;
      for (let k = i; k <= j; k++) {
        let segText = sharedText;
        if (k === i && firstOnlyText) {
          segText = firstOnlyText + (sharedText ? '，' + sharedText : '');
        }
        if (allHits[k].unknown) {
          rawSegments.push({ student: null, unknownName: allHits[k].name, text: segText, date: segDate });
        } else {
          rawSegments.push({ student: allHits[k], text: segText, date: segDate });
        }
      }
      prevEnd = groupEnd;
      i = j + 1;
    }
    // 3b) 「A + 承接动词 + B + 事件」合并：A 只剩一个孤零零的动词（如「帮」）没有意义，
    //     应扩展为「帮孙阳补习数学」，并让 B 不再单独成段。
    for (let k = 0; k + 1 < rawSegments.length;) {
      const a = rawSegments[k], b = rawSegments[k + 1];
      const who = b.student ? b.student.name : (b.unknownName || '');
      if (QR_BRIDGE_VERBS.indexOf(a.text) >= 0 && who && b.text && b.text.length >= 2) {
        a.text = a.text + who + b.text;
        rawSegments.splice(k + 1, 1);
        continue;
      }
      k++;
    }
  }
  // 4) 每个学生片段再按连接词/标点拆分为多个记录项
  const result = { raw: text, segments: [], matched };
  rawSegments.forEach(seg => {
    const segment = { student: seg.student || null, unknownName: seg.unknownName || '', items: [], date: seg.date || qrResolveDate(seg.text) || null };
    const rawClauses = seg.text.split(QR_CLAUSE_SPLIT).map(s => s.trim()).filter(Boolean);
    const clauses = [];
    const hasKnownStudent = !!seg.student; // 仅当片段含具名学生时，卫生/值日事件也落到该生头上（避免归因丢失）
    rawClauses.forEach(rc => {
      rc.split(QR_CONNECTORS).map(s => s.trim()).filter(Boolean).forEach(c => {
        if (isDutyClause(c) && !hasKnownStudent) return; // 无具名学生才整体走关联扣分
        clauses.push(c);
      });
    });
    if (!clauses.length && (!isDutyClause(seg.text) || hasKnownStudent)) clauses.push(seg.text);
    // 4b) 合并「分值短语」与「纯类型标签短语」：它们只是修饰前一条，不该单独占一条记录
    //     「袁希诺作业优秀，加2分」      → 一条「作业优秀，加2分」+2 分（原来是两条，第二条内容只有「加2分」）
    //     「张明轩参加体育早训，提出表扬」→ 一条「参加体育早训，提出表扬」表扬（原来第二条内容只有「表扬」）
    const finalClauses = [];
    clauses.forEach(c => {
      const stripped = REC_LEADIN.reduce((s, kw) => s.split(kw).join(''), c).replace(/[\s，。、；：,.]/g, '').trim();
      const isScore = /^[加扣减]?\s*\d+(?:\.\d+)?\s*分$/.test(stripped);
      const isLabel = !!stripped && QR_LABEL_ONLY.indexOf(stripped) >= 0;
      if ((isScore || isLabel) && finalClauses.length) { finalClauses[finalClauses.length - 1] += '，' + c; return; }
      finalClauses.push(c);
    });
    (finalClauses.length ? finalClauses : clauses).forEach(clause => {
      const item = recognizeClause(clause, matched);
      if (item) segment.items.push(item);
    });
    if (segment.items.length) result.segments.push(segment);
  });
  // 5) 收集暂未命中任何关键词的词语，提示用户补充关键词
  const matchedRanges = [];
  studentHits.forEach(h => matchedRanges.push({ start: h.pos, end: h.pos + h.len }));
  unknownHits.forEach(h => matchedRanges.push({ start: h.pos, end: h.pos + h.len }));
  matched.forEach(m => {
    if (!m.value) return;
    let idx = text.indexOf(m.value);
    while (idx !== -1) {
      matchedRanges.push({ start: idx, end: idx + m.value.length });
      idx = text.indexOf(m.value, idx + 1);
    }
  });
  // 5b) 把所有「已识别的东西」（学生名 + 科目/作业/规则/类型关键词 + 日期词 + 职务卫生词 + 量词）
  //     在原文里标成区间，只在这些区间的**补集**里找未命中词。
  //     旧做法是用 2~4 字滑窗全表扫，窗口会和词边界错位，于是「迟到10分钟」提示「分钟」、
  //     「上课捣乱」提示「课捣乱」、「王小明帮助同学」提示「助同学」——全是噪音。
  const kwScan = [];
  ['critic', 'praise', 'chat', 'leave'].forEach(t => { getRecLabels(t).forEach(k => kwScan.push(k)); getRecDesc(t).forEach(k => kwScan.push(k)); });
  Object.keys(QR_DIM_KWS).forEach(d => QR_DIM_KWS[d].forEach(k => kwScan.push(k)));
  QR_EVENT_HEADS.forEach(k => kwScan.push(k));
  QR_NOT_NAME.forEach(k => kwScan.push(k));
  QR_NOISE_FRAGS.forEach(k => kwScan.push(k));
  REC_LEADIN.forEach(k => kwScan.push(k));   // 引出词（提出/给予/予以…）不算未命中
  QR_DATE_WORDS.forEach(k => kwScan.push(k));
  [...qrDutyKeywordSet()].forEach(k => kwScan.push(k));
  (state.homeworkKeywords || []).forEach(k => kwScan.push(k));
  (state.classRecordSubjects || []).forEach(s => (s.keywords || []).forEach(k => kwScan.push(k)));
  [...new Set(kwScan)].filter(Boolean).forEach(w => {
    let idx = text.indexOf(w);
    while (idx !== -1) { matchedRanges.push({ start: idx, end: idx + w.length }); idx = text.indexOf(w, idx + 1); }
  });
  matchedRanges.sort((a, b) => a.start - b.start);
  const covered = [];
  matchedRanges.forEach(r => {
    const last = covered[covered.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else covered.push({ start: r.start, end: r.end });
  });
  const unmatched = [];
  const STOP_WORDS = /^(今天|明天|昨天|上午|下午|晚上|课间|课堂|学校|老师|同学|班主任|家长|孩子|一个|一下|一次|没有|还有|以及|因为|所以|但是|然后|接着|随后|另外|此外|最后|第一|第二|第三|可以|需要|已经|正在|还是|这样|那里|这里|我们|你们|他们|她们|它们)$/;
  const collectGap = (s) => {
    (String(s).match(/[\u4e00-\u9fa5]{2,4}/g) || []).forEach(w => { if (!STOP_WORDS.test(w)) unmatched.push(w); });
  };
  let gapFrom = 0;
  covered.forEach(r => {
    if (r.start > gapFrom) collectGap(text.slice(gapFrom, r.start));
    gapFrom = Math.max(gapFrom, r.end);
  });
  if (gapFrom < text.length) collectGap(text.slice(gapFrom));
  result.unmatchedWords = [...new Set(unmatched)].slice(0, 6);
  return result;
}

function recognizeClause(text, matched) {
  if (!text) return null;
  // 识别科目
  const subjects = [];
  const seenSubj = new Set();
  (state.classRecordSubjects || []).forEach(sub => {
    if (!Array.isArray(sub.keywords)) return;
    for (const kw of sub.keywords) {
      if (text.includes(kw) && !seenSubj.has(sub.id)) {
        seenSubj.add(sub.id);
        subjects.push(sub);
        matched.push({ kind: 'subject', value: kw, subject: sub });
        break;
      }
    }
  });
  // 识别作业关键词
  let homeworkHit = '';
  (state.homeworkKeywords || []).forEach(kw => {
    if (!homeworkHit && text.includes(kw)) {
      homeworkHit = kw;
      matched.push({ kind: 'homework', value: kw });
    }
  });
  // 识别积分规则
  const rules = [];
  const seenRule = new Set();
  (state.points.rules || []).forEach(rule => {
    if (!Array.isArray(rule.keywords)) return;
    for (const kw of rule.keywords) {
      if (text.includes(kw) && !seenRule.has(rule.id)) {
        seenRule.add(rule.id);
        rules.push({ rule, keyword: kw });
        matched.push({ kind: 'rule', value: kw, rule: rule.label, dim: rule.dim, delta: rule.delta });
        break;
      }
    }
  });
  // 体育语境互斥：句中含体育语境词（早操/出操/打卡等）且已命中体育规则时，
  // 抑制其它维度的通用规则（如日常维度的「迟到-2」），避免「早操迟到」被双扣。
  if (rules.length > 1 && /早操|出操|课间操|跑操|体育|打卡/.test(text)) {
    const sportRules = rules.filter(r => r.rule.dim === 'sport');
    if (sportRules.length && sportRules.length < rules.length) {
      for (let i = matched.length - 1; i >= 0; i--) {
        if (matched[i].kind === 'rule' && matched[i].dim !== 'sport') matched.splice(i, 1);
      }
      rules.length = 0;
      sportRules.forEach(r => rules.push(r));
    }
  }
  // 识别记录类型
  let recType = '';
  for (const t of ['critic', 'praise', 'chat', 'leave']) {
    let hitKw = '';
    for (const kw of getRecLabels(t)) { if (text.includes(kw)) { hitKw = kw; break; } }
    if (!hitKw) for (const kw of getRecDesc(t)) { if (text.includes(kw) && !hasNegBefore(text, kw)) { hitKw = kw; break; } }
    if (hitKw) { recType = t; matched.push({ kind: 'type', value: hitKw, type: t }); break; }
  }
  // 具体分值「加N分 / 扣N分」直接决定类型与正负
  // 「分」后面不能是「钟」，否则「迟到10分钟」会被当成扣 10 分
  const mNum = text.match(/([加扣])\s*(\d+(?:\.\d+)?)\s*分(?!钟)|(\d+(?:\.\d+)?)\s*分(?!钟)/);
  if (mNum) {
    if (mNum[1] === '加') recType = 'praise';
    else if (mNum[1] === '扣') recType = 'critic';
  }
  // 未明确类型时，根据情感/规则推断（注意否定词：不认真≠表扬）
  if (!recType) {
    if (rules.some(r => r.rule.delta < 0) || /未完成|没交|未做|迟到|说话|违纪|不合格|捣乱|走神|睡觉|抄袭|作弊|打架/.test(text)) recType = 'critic';
    else if (rules.some(r => r.rule.delta > 0) || hasPos(text)) recType = 'praise';
    else if (/请假|病假|事假/.test(text)) recType = 'leave';
    else recType = 'chat';
  }
  // 「上课聊天」「课堂上讲话」是课堂违纪，但「聊天」先命中谈心词表，这里纠正为批评
  if (recType === 'chat' && /^(上课|课堂上|课堂|课间|自习)/.test(text) && !/(老师|班主任|心理|疏导|办公室|家长)/.test(text)) recType = 'critic';
  // 清洗内容：保留完整事件描述，仅剔除引出词与首尾多余标点
  // 类型标签词用于识别类型，但不再从内容中删除（如「未完成」「迟到」等事实词需要保留）
  let content = text;
  REC_LEADIN.forEach(kw => { if (content.includes(kw)) content = content.split(kw).join(''); });
  // 剔除句首多余的承接连词（如「也/还在」），避免第二分句生成「也在说话」这类内容
  content = content.replace(/^(也在|还在|又在|也|还|又)\s*/, '').trim();
  content = content.replace(/\s{2,}/g, ' ').replace(/[，。、；：,.]+$/g, '').replace(/^[，。、；：,.]+/g, '').trim();
  if (!content) content = text;
  // 维度
  let dim = 'daily';
  if (rules.length) dim = rules[0].rule.dim;
  else {
    const dimOrder = ['sport', 'post', 'exam', 'daily'];
    for (const d of dimOrder) {
      for (const kw of QR_DIM_KWS[d]) {
        if (text.includes(kw)) { dim = d; matched.push({ kind: 'dim', value: kw, dim: d }); break; }
      }
      if (dim !== 'daily') break;
    }
  }
  // 具体分值解析：「加N分 / 扣N分 / N分」覆盖固定 ±1；仅对表扬/批评生效
  let pointDelta = (recType === 'praise' ? 1 : recType === 'critic' ? -1 : 0);
  if (mNum && (recType === 'praise' || recType === 'critic')) {
    const val = parseFloat(mNum[2] || mNum[3]);
    if (mNum[1] === '加') pointDelta = Math.abs(val);
    else if (mNum[1] === '扣') pointDelta = -Math.abs(val);
    else pointDelta = (recType === 'critic' ? -1 : 1) * Math.abs(val);
  }
  // 严重程度：严重/加重/屡教不改 → 幅度翻倍
  if (/严重|加重|屡教不改|多次违纪/.test(text)) {
    pointDelta = pointDelta < 0 ? -Math.abs(pointDelta) * 2 : Math.abs(pointDelta) * 2;
  }
  // noBase 规则（体育异常四条）：规则分值即最终分，不再叠加一句话记录的基础 ±1，
  // 否则「早操迟到」会写成 -1(基础) + -3(规则) = -4，破坏基线抵扣模型的分值设计
  if (rules.some(r => r.rule.noBase)) pointDelta = 0;
  return { text, content, subjects, homework: !!homeworkHit, homeworkKeyword: homeworkHit, rules, recType, dim, pointDelta, enabled: true };
}

// ===== 一句话记录 · 纠偏记忆 =====
// 用户手动修正过的识别结果会被记下来；下次输入完全相同时，直接复用修正结果。
function qrSerializeSegments(segs) {
  return (segs || []).map(seg => ({
    studentId: seg.student ? seg.student.id : null,
    studentName: seg.student ? seg.student.name : '',
    unknownName: seg.unknownName || '',
    date: seg.date || null,
    items: (seg.items || []).map(it => ({
      text: it.text,
      content: it.content,
      subjectIds: (it.subjects || []).map(s => s.id),
      homework: it.homework,
      homeworkKeyword: it.homeworkKeyword || '',
      ruleIds: (it.rules || []).map(r => r.rule.id),
      recType: it.recType,
      dim: it.dim,
      pointDelta: it.pointDelta,
      enabled: it.enabled !== false
    }))
  }));
}
function qrDeserializeSegments(recipe) {
  return (recipe || []).map(seg => {
    let stu = null;
    if (seg.studentId) stu = state.students.find(s => s.id === seg.studentId) || null;
    if (!stu && seg.studentName) stu = state.students.find(s => s.name === seg.studentName) || null;
    return {
      student: stu,
      unknownName: (!stu && seg.unknownName) ? seg.unknownName : '',
      date: seg.date || null,
      items: (seg.items || []).map(it => {
        const subjects = (it.subjectIds || []).map(id => (state.classRecordSubjects || []).find(s => s.id === id)).filter(Boolean);
        const rules = (it.ruleIds || []).map(id => {
          const rule = (state.points.rules || []).find(r => r.id === id);
          return rule ? { rule, keyword: rule.keywords ? rule.keywords[0] : '' } : null;
        }).filter(Boolean);
        return { text: it.text, content: it.content, subjects, homework: !!it.homework, homeworkKeyword: it.homeworkKeyword || '', rules, recType: it.recType, dim: it.dim, pointDelta: it.pointDelta, enabled: it.enabled !== false };
      }).filter(it => it.recType)
    };
  }).filter(seg => seg.student || seg.unknownName || (seg.items && seg.items.length));
}
function qrApplyCorrections(text) {
  if (!text || !state.qrCorrections || !state.qrCorrections.length) return null;
  const c = state.qrCorrections.find(x => x.enabled !== false && x.raw === text);
  if (!c) return null;
  const segs = qrDeserializeSegments(c.segments);
  if (!segs.length) return null;
  return { raw: text, segments: segs, matched: [], unmatchedWords: [] };
}
function qrSaveCorrection(raw) {
  if (!qrDraft || !qrDraft.segments || !qrDraft.segments.length) return toast('当前没有可保存的修正内容');
  if (!Array.isArray(state.qrCorrections)) state.qrCorrections = [];
  const idx = state.qrCorrections.findIndex(c => c.raw === raw);
  const entry = { id: uid(), enabled: true, raw, segments: qrSerializeSegments(qrDraft.segments), createdAt: new Date().toISOString() };
  if (idx >= 0) state.qrCorrections[idx] = entry;
  else state.qrCorrections.push(entry);
  save();
  toast('已记住本次修正，同样输入下次会直接命中');
}
function qrDeleteCorrection(id) {
  if (!Array.isArray(state.qrCorrections)) return;
  state.qrCorrections = state.qrCorrections.filter(c => c.id !== id);
  save();
  renderQrCorrections();
}
function qrToggleCorrection(id) {
  if (!Array.isArray(state.qrCorrections)) return;
  const c = state.qrCorrections.find(x => x.id === id);
  if (c) { c.enabled = c.enabled === false ? true : false; save(); renderQrCorrections(); }
}
function qrCorrectionSummary(c) {
  const segs = c.segments || [];
  const parts = segs.map(seg => {
    const name = seg.studentName || seg.unknownName || '未识别';
    const types = (seg.items || []).map(it => REC_TYPE_LABELS[it.recType] || it.recType).filter(Boolean);
    return name + (types.length ? '(' + [...new Set(types)].join('/') + ')' : '');
  });
  return parts.join('、') || '（无内容）';
}

let qrDraft = null; // 当前确认草稿
let qrDeductDraft = null; // 一句话记录：待确认的关联扣分草稿
// —— 连续记录模式（手机端课间一口气记好几个学生）——
let qrAutoTimer = null;   // 边打边识别的防抖定时器
let qrLastText = '';      // 上次已识别的输入内容，内容没变就不重复识别（免得覆盖用户手改的卡片）
let qrSessionCount = 0;   // 本次弹窗内累计记录条数
let qrLastSummary = '';   // 上一次保存的明细，显示在顶部状态条
let qrDateEdited = false; // 用户是否手动改过「日期时间」（补录）：改过就跨次重绘与连续记录保留，没改过每条都取"此刻"
function openQuickRecord() {
  // 重新打开弹窗 = 新的一次记录会话，计数清零（连续记录只在同一次弹窗内累计）
  qrSessionCount = 0; qrLastSummary = ''; qrLastText = '';
  clearTimeout(qrAutoTimer);
  qrDraft = null; qrDeductDraft = null;
  qrDateEdited = false;   // 新会话：日期时间回到「此刻」
  const tip = '输入一句话即可自动识别多名学生、多个事件。例如：\n「张明轩参加体育早训，提出表扬；秦梦茹月考满分，提出表扬；王浩然迟到批评」\n系统会按学生拆分为多条记录，并自动识别科目、作业、积分规则、类型等。停止输入约 0.4 秒即自动识别。';
  openModal('一句话记录', `
    <div class="space-y-3">
      <div id="qrStatus">${qrStatusHtml()}</div>
      <div class="qr-sticky -mx-6 px-6 pt-3 pb-2 -mt-3 border-b border-gray-100">
        ${(state.activeClass !== state.headTeacherClass) ? `<div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">⚠️ 当前为任课视角（${esc(className(state.activeClass))}），一句话记录只会保存「课堂记录」与「作业」；行为 / 积分 / 请假请在班主任班（${esc(className(state.headTeacherClass))}）记录。</div>` : ''}
        <textarea id="qrText" rows="3" class="w-full border rounded-lg p-3 text-base" oninput="qrOnInput()" placeholder="输入一句话，例如：赵吉晨数学作业未完成且上语文课说话"></textarea>
        <details class="text-[11px] text-gray-400 mt-1.5 qr-hint">
          <summary class="cursor-pointer select-none py-1 text-xs">识别说明 ▾</summary>
          <div class="leading-relaxed whitespace-pre-line py-1">${esc(tip)}</div>
        </details>
      </div>
      <div id="qrResult"></div>
      <details class="qr-more pt-1">
        <summary class="text-xs text-gray-400 select-none py-2 qr-tap-sm flex items-center">▸ 更多录入方式（积分 / 学生 / 日志 / 待办…）</summary>
        <div class="grid grid-cols-2 gap-2 pb-2">${fabMoreEntries()}</div>
      </details>
    </div>`, 'lg');
  // 必须在同一次用户手势内同步 focus，否则手机软键盘弹不出来（setTimeout 会丢失手势上下文）
  try {
    const el = document.getElementById('qrText');
    if (el) { el.focus({ preventScroll: true }); }
  } catch (e) {}
}

// FAB 里除一句话记录之外的其余入口（收进弹窗「更多」，保证功能不丢）
function fabMoreEntries() {
  const items = [
    ['🏆 积分加分/扣分', "openPtAdjust(null,'daily',1)"],
    ['👥 批量加减分', 'openPtBatch()'],
    ['👤 新建学生', 'openStudentForm(null)'],
    ['📈 添加行为记录', 'openRecordForm(state.students[0]?state.students[0].id:null)'],
    ['📝 写班级日志', 'openClassLogForm()'],
    ['💬 记录家校沟通', 'openCommForm()'],
    ['🔔 新建待办', 'openTodoForm()'],
    ['📅 值日与职务', "navigate('positions')"],
  ];
  return items.map(([label, fn]) =>
    `<button class="qr-tap text-left text-xs px-3 py-2 rounded-xl bg-gray-50 hover:bg-primary/10 text-gray-700" onclick="closeModal(); ${fn}">${label}</button>`
  ).join('');
}

// 顶部状态条：连续记录模式下提示「已记录 N 条」
function qrStatusHtml() {
  if (!qrSessionCount) return '';
  return `<div class="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
    <span class="font-bold shrink-0">✅ 本次已记录 ${qrSessionCount} 条</span>
    ${qrLastSummary ? `<span class="truncate text-emerald-600">${esc(qrLastSummary)}</span>` : ''}
    <button class="ml-auto shrink-0 text-emerald-600 hover:text-emerald-800" onclick="closeModal()">完成</button>
  </div>`;
}

// 边打边识别：停止输入 0.4 秒后自动出预览，省掉「识别并预览」这一步。
// 只重绘 #qrResult，输入框本身不动，所以打字过程中焦点和光标位置不受影响。
function qrOnInput() {
  clearTimeout(qrAutoTimer);
  qrAutoTimer = setTimeout(function () {
    const el = document.getElementById('qrText');
    if (!el) return;
    const t = (el.value || '').trim();
    if (!t) {                      // 清空输入框 → 连预览一起清掉
      qrLastText = ''; qrDraft = null; qrDeductDraft = null; qrRenderDraft(); return;
    }
    if (t === qrLastText) return;  // 内容没变就不重识别，避免覆盖用户在结果卡里手改的设置
    qrLastText = t;
    qrRecognize();
  }, 400);
}

function qrRecognize() {
  const el = document.getElementById('qrText');
  const text = el ? (el.value || '') : '';
  if (!text.trim()) { qrDraft = null; qrDeductDraft = null; qrRenderDraft(); return; }
  qrDraft = qrApplyCorrections(text) || parseQuickRecord(text);
  // 关联扣分识别（沿职务树向上追责）
  qrDeductDraft = null;
  let dedNodeId = null;
  try { dedNodeId = pmFindNodeByKeyword(text); } catch (e) { dedNodeId = null; }
  if (dedNodeId) {
    const day = pmExtractDay(text);
    const expr = qrDayExpr(text);
    qrDeductDraft = { nodeId: dedNodeId, text, pts: state.positions.deductionPoints, day, expr };
  }
  qrRenderDraft();
}

// 日期时间的取值：用户没手动改过就永远取"此刻"（连续记录时每条都是各自真实的录入时刻）；
// 改过（补录）就保留他选的那个时刻，边打边识别重绘结果区也不会被重置。
function qrDateValue() {
  if (!qrDateEdited) return dtLocalValue();
  const el = document.getElementById('qrDate');
  return (el && el.value) ? el.value : dtLocalValue();
}

function qrRenderDraft() {
  const resultEl = document.getElementById('qrResult');
  if (!resultEl) return;
  const noSegments = !qrDraft || !qrDraft.segments.length;
  if (noSegments && !qrDeductDraft) {
    // 连续记录模式下刚保存完、输入框已清空：不要报「未识别」，给个让人安心的提示
    const typed = ((document.getElementById('qrText') || {}).value || '').trim();
    if (!typed) {
      resultEl.innerHTML = qrSessionCount
        ? '<div class="text-sm text-emerald-600 text-center py-4">✅ 已保存，继续输入下一条…</div>'
        : '';
      return;
    }
    resultEl.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">未识别到可记录的内容，请检查学生姓名或补充描述。</div>';
    return;
  }
  let dedHtml = '';
  if (qrDeductDraft) {
    const dPath = pmGetNodePath(state.positions.dutyTree, qrDeductDraft.nodeId).map(n => n.label).join(' → ');
    const chain = pmGetDeductionChain(qrDeductDraft.nodeId, qrDeductDraft.day);
    const dayLabel = qrDeductDraft.day ? (qrDeductDraft.expr ? qrDeductDraft.expr + '·' + qrDeductDraft.day : qrDeductDraft.day) : '';
    dedHtml = `<div class="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4 space-y-2 mb-3">
      <div class="text-sm font-bold text-indigo-700">⚠️ 识别到关联扣分</div>
      <div class="font-medium text-indigo-700 text-sm">${esc(dPath)} ${dayLabel ? '（' + esc(dayLabel) + '）' : ''}</div>
      <div class="flex flex-wrap gap-1.5">${chain.length ? chain.map(p => `<span class="bg-white border border-slate-200 rounded-full px-2.5 py-1 text-xs">${esc(p.name)} <span class="text-slate-400">(${esc(p.pos)})</span></span>`).join('') : '<span class="text-slate-400 text-xs">该路径上未安排人员</span>'}</div>
      <button class="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 hover:bg-red-600" onclick="pmConfirmQrDeduct()">确认每人扣 ${qrDeductDraft.pts} 分</button>
    </div>`;
  }
  let totalItems = 0;
  if (qrDraft) qrDraft.segments.forEach(seg => totalItems += seg.items.length);
  const use2Col = totalItems > 4;
  const hasUnknown = qrDraft && qrDraft.segments.some(seg => seg.unknownName);
  const list = qrDraft ? qrDraft.segments.map((seg, si) => {
    const isUnknown = !!seg.unknownName;
    const stuName = seg.student ? seg.student.name : (seg.unknownName || '未识别学生');
    const badge = isUnknown ? `<span class="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded ml-1">未识别</span>` : '';
    const clsBadge = (!isUnknown && seg.student) ? (() => { const sv = state.students.find(x => x.id === seg.student.id); return (sv && sv.class) ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded ml-1">${esc(sv.class)}</span>` : ''; })() : '';
    const addBtn = isUnknown ? `<button class="text-[11px] text-primary hover:underline" onclick="qrAddUnknownStudent(${si})">➕ 添加到学生管理</button>` : '';
    return `<div class="rounded-xl border p-3 space-y-2 bg-white ${isUnknown ? 'border-orange-200 bg-orange-50/30' : ''}">
      <div class="flex items-center justify-between">
        <div class="font-medium text-sm">👤 ${esc(stuName)}${badge}${clsBadge}</div>
        <div class="flex items-center gap-2">
          ${addBtn}
          <span class="text-xs text-gray-400">${seg.items.filter(i => i.enabled).length}/${seg.items.length} 项生效</span>
        </div>
      </div>
      ${seg.items.map((item, ii) => qrItemCard(item, si, ii)).join('')}
    </div>`;
  }).join('') : '';
  const unknownTip = hasUnknown ? `<div class="text-xs text-orange-600 bg-orange-50 rounded-lg p-2">检测到未在学生名册中识别到的姓名，请先点击卡片右上角的「添加到学生管理」，或直接在「学生管理」中补全名单后再记录。</div>` : '';
  const unmatched = (qrDraft && qrDraft.unmatchedWords || []).filter(w => !/^[，,、；;。.:：!！?？\s]+$/).slice(0, 5);
  const unmatchedTip = unmatched.length ? `<div class="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">以下词语暂未匹配到任何关键词，可到「设置」补充：<b>${esc(unmatched.join('、'))}</b></div>` : '';
  const studentBody = noSegments ? '' : `<div class="space-y-3">
    <div class="text-xs text-gray-500">识别到 ${qrDraft.segments.length} 名学生，共 ${totalItems} 条记录分项。已按姓名自动归入对应班级（标签显示在姓名后），可在卡片内修改文本、删除或停用。</div>
    ${unknownTip}
    ${unmatchedTip}
    <div class="grid grid-cols-1 ${use2Col ? 'md:grid-cols-2' : ''} gap-3">${list}</div>
    <div><div class="text-xs ${qrDateEdited ? 'text-amber-600' : 'text-gray-500'} mb-1">日期时间${qrDateEdited ? ' · 补录模式（后续每条都用这个时刻）' : '（默认此刻，精确到秒；改它可补录其它时刻）'}</div><input id="qrDate" type="datetime-local" step="1" class="w-full border rounded-lg p-2 text-sm qr-tap" onchange="qrDateEdited=true" value="${qrDateValue()}"></div>
    <div class="flex gap-2 pt-1">
      <button class="qr-tap flex-1 bg-primary text-white py-3 rounded-full text-sm font-medium hover:bg-primaryDark" onclick="qrSave()">✅ 一键记录</button>
      <button class="qr-tap px-4 border border-gray-300 rounded-full text-sm hover:bg-gray-50" onclick="closeModal()">取消</button>
    </div>
    ${(qrDraft && qrDraft.raw) ? `<div class="pt-1"><button class="qr-tap w-full text-xs border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 py-2 rounded-full" onclick="qrSaveCorrection(${JSON.stringify(qrDraft.raw).replace(/"/g, '&quot;')})">🧠 记住本次修正（下次同样输入直接命中）</button></div>` : ''}
  </div>`;
  const noteBody = noSegments ? `<div class="space-y-3">
    <div class="text-sm text-gray-500">未识别到具体学生，但已匹配到职务 / 卫生事件，请在上方「关联扣分」中确认即可。</div>
    ${unmatchedTip}
  </div>` : '';
  resultEl.innerHTML = dedHtml + studentBody + noteBody;
}

function qrItemCard(item, si, ii) {
  const typeOpts = [['critic','批评','⚠️'],['praise','表扬','👍'],['chat','谈心','💬'],['leave','请假','🏥']];
  const typeSelect = `<select onchange="qrSetType(${si},${ii},this.value)" class="text-xs rounded-full px-2 py-1 border-0 outline-none cursor-pointer ${recordTypeClass(item.recType)}">
    ${typeOpts.map(([v,l,e]) => `<option value="${v}" ${item.recType===v?'selected':''}>${e} ${l}</option>`).join('')}
  </select>`;
  const currentSubj = item.subjects[0];
  const subjOpts = [{id:'',name:'无科目'}].concat(state.classRecordSubjects || []);
  const subjectSelect = `<select onchange="qrSetSubject(${si},${ii},this.value)" class="text-xs rounded-full px-2 py-1 border-0 outline-none cursor-pointer ${currentSubj ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}">
    ${subjOpts.map(sub => `<option value="${sub.id}" ${(currentSubj && currentSubj.id===sub.id)?'selected':''}>📚 ${sub.name}</option>`).join('')}
  </select>`;
  const homeworkSelect = `<select onchange="qrSetHomework(${si},${ii},this.value==='1')" class="text-xs rounded-full px-2 py-1 border-0 outline-none cursor-pointer ${item.homework ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}">
    <option value="1" ${item.homework?'selected':''}>📖 作业</option>
    <option value="0" ${!item.homework?'selected':''}>📖 非作业</option>
  </select>`;
  const pointOpts = [
    {label:'不积分', dim:'daily', delta:0},
    {label:'日常 -1', dim:'daily', delta:-1},
    {label:'日常 +1', dim:'daily', delta:1},
    {label:'体育 +1', dim:'sport', delta:1},
    {label:'考试 +1', dim:'exam', delta:1},
    {label:'任职 +1', dim:'post', delta:1},
  ];
  const activePoint = pointOpts.find(o => o.dim===item.dim && o.delta===item.pointDelta) || {label:`${dimLabel(item.dim)} ${item.pointDelta>=0?'+':''}${item.pointDelta}`, dim:item.dim, delta:item.pointDelta};
  const pointSelect = `<select onchange="qrSetPoint(${si},${ii},this.value)" class="text-xs rounded-full px-2 py-1 border-0 outline-none cursor-pointer ${dimStyle(item.dim).bg} ${dimStyle(item.dim).text}">
    ${pointOpts.map(o => `<option value="${o.dim}|${o.delta}" ${(o.dim===item.dim && o.delta===item.pointDelta)?'selected':''}>${dimIcon(o.dim)} ${o.label}</option>`).join('')}
    <option value="custom">✏️ 自定义…</option>
  </select>`;
  const actions = [];
  if (item.recType && item.recType !== 'leave') actions.push('学生记录');
  if (item.recType === 'leave') actions.push('请假');
  if (item.subjects.length) actions.push('课堂记录');
  if (item.homework && !/未完成|没交|未做|不交/.test(item.content)) actions.push('作业管理');
  if (item.pointDelta !== 0) actions.push('积分');
  if (item.rules.length) actions.push('积分规则');
  const disabledClass = item.enabled ? '' : 'opacity-50 grayscale';
  return `<div class="rounded-lg border border-gray-200 p-3 space-y-2 ${disabledClass}" data-qr-item="${si}-${ii}">
    <div class="flex flex-wrap gap-1.5">${typeSelect}${subjectSelect}${homeworkSelect}${pointSelect}</div>
    <textarea rows="2" class="w-full border rounded-lg p-2 text-sm" onchange="qrReparseItem(${si},${ii},this.value)">${esc(item.content)}</textarea>
    <div class="flex items-center justify-between">
      <div class="text-xs text-gray-400">将生成：${actions.length ? actions.join('、') : '（仅文本记录）'}</div>
      <div class="flex items-center gap-2">
        <label class="text-xs flex items-center gap-1"><input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="qrToggleItem(${si},${ii})"> 启用</label>
        <button class="text-xs text-red-500 hover:underline" onclick="qrRemoveItem(${si},${ii})">删除</button>
      </div>
    </div>
  </div>`;
}

function qrReparseItem(si, ii, newText) {
  if (!qrDraft || !qrDraft.segments[si] || !qrDraft.segments[si].items[ii]) return;
  const fresh = recognizeClause(newText.trim(), []);
  if (!fresh) return;
  fresh.enabled = qrDraft.segments[si].items[ii].enabled;
  qrDraft.segments[si].items[ii] = fresh;
  qrRenderDraft();
}

function qrToggleItem(si, ii) {
  if (!qrDraft || !qrDraft.segments[si] || !qrDraft.segments[si].items[ii]) return;
  qrDraft.segments[si].items[ii].enabled = !qrDraft.segments[si].items[ii].enabled;
  qrRenderDraft();
}

function qrRemoveItem(si, ii) {
  if (!qrDraft || !qrDraft.segments[si]) return;
  qrDraft.segments[si].items.splice(ii, 1);
  if (!qrDraft.segments[si].items.length) qrDraft.segments.splice(si, 1);
  qrRenderDraft();
}

function qrAddUnknownStudent(si) {
  if (!qrDraft || !qrDraft.segments[si]) return;
  const name = qrDraft.segments[si].unknownName;
  if (!name) return;
  state.students.push({
    id: uid(), name,
    gender: '', class: state.activeClass,
    avatar: '', records: []
  });
  qrDraft = parseQuickRecord(qrDraft.raw);
  qrRenderDraft();
  toast('已添加「' + name + '」到学生管理，请稍后补全性别、班级等信息');
  pushSync();
}

function qrSetType(si, ii, type) {
  if (!qrDraft || !qrDraft.segments[si] || !qrDraft.segments[si].items[ii]) return;
  const item = qrDraft.segments[si].items[ii];
  item.recType = type;
  if (type === 'leave') { item.pointDelta = 0; item.dim = 'daily'; }
  else item.pointDelta = (type === 'praise' ? 1 : type === 'critic' ? -1 : 0);
  qrRenderDraft();
}

function qrSetSubject(si, ii, subId) {
  if (!qrDraft || !qrDraft.segments[si] || !qrDraft.segments[si].items[ii]) return;
  const item = qrDraft.segments[si].items[ii];
  if (!subId) { item.subjects = []; }
  else {
    const sub = state.classRecordSubjects.find(s => s.id === subId);
    item.subjects = sub ? [sub] : [];
  }
  qrRenderDraft();
}

function qrSetHomework(si, ii, isHomework) {
  if (!qrDraft || !qrDraft.segments[si] || !qrDraft.segments[si].items[ii]) return;
  qrDraft.segments[si].items[ii].homework = !!isHomework;
  qrRenderDraft();
}

function qrSetPoint(si, ii, value) {
  if (!qrDraft || !qrDraft.segments[si] || !qrDraft.segments[si].items[ii]) return;
  const item = qrDraft.segments[si].items[ii];
  if (value === 'custom') {
    const dim = prompt('请选择积分维度：sport/daily/exam/post', item.dim) || item.dim;
    const delta = parseInt(prompt('请输入积分变化值（扣分用负数）：', item.pointDelta || (item.recType==='praise'?1:item.recType==='critic'?-1:0)) || '0', 10);
    item.dim = dim;
    item.pointDelta = isNaN(delta) ? 0 : delta;
  } else {
    const [dim, deltaStr] = value.split('|');
    item.dim = dim;
    item.pointDelta = parseInt(deltaStr, 10) || 0;
  }
  qrRenderDraft();
}

// 一句话记录：按学生×分项自动写入学生记录、课堂记录、积分、作业、请假
function qrSave() {
  // 精确到秒：日期框是 datetime-local，解析后形如「2026-08-30 21:10:03」
  const _qrDateEl = document.getElementById('qrDate');
  const date = parseDtLocal(_qrDateEl ? _qrDateEl.value : '') || nowStampSec();
  const ts = nowTs();                 // 实际录入时刻（毫秒），与 date 分离
  const todayIso = todayISO();
  // 归档时间的取值优先级：手动改过日期框 > 文本识别出的日期 > 此刻。
  // 识别到日期词时：若是「今天」就带完整时刻；若是其它某天，只归档到那一天（无法知道当时几点）
  const segStamp = (segDate) => {
    if (qrDateEdited) return date;    // 用户手选了时刻，以手选为准
    if (!segDate) return date;
    const day = hwNormDate(segDate);
    if (!day) return date;
    return day === todayIso ? date : day;
  };
  if (!qrDraft || !qrDraft.segments.length) return alert('请先识别内容');
  const unknownSegs = qrDraft.segments.filter(seg => seg.unknownName);
  if (unknownSegs.length) {
    const names = unknownSegs.map(seg => seg.unknownName).join('、');
    return alert('以下姓名未在学生名册中找到，请先点击卡片右上角「添加到学生管理」：' + names);
  }
  let nRecord = 0, nPoint = 0, nClass = 0, nHomework = 0, nLeave = 0;
  const autoPointLogs = [];
  qrDraft.segments.forEach(seg => {
    if (!seg.student) return;
    const s = state.students.find(x => x.id === seg.student.id);
    if (!s) return;
    const recDate = segStamp(seg.date); // 真实日期归档：优先用识别出的日期（今天/本周三/昨天…）
    seg.items.forEach(item => {
      if (!item.enabled) return;
      const { recType, subjects, rules, homework, content, dim, pointDelta } = item;
      const isHead = s.class === state.headTeacherClass; // 仅班主任班(10班)记行为/积分/请假
      const stuClass = s.class || state.activeClass;
      const isClassroom = subjects.length > 0; // 带科目 → 视为课堂/作业行为
      // 学生行为记录 / 请假（仅班主任班；课堂行为只进课堂记录，不重复进行为档案）
      if (recType === 'leave') {
        if (isHead) {
          // 早操/出操请假不写入当天考勤（≠全天请假），只在体育维度留痕扣分，
          // 避免污染「考勤全勤=本周请假0」的判定
          const isSportLeave = dim === 'sport' || /早操|出操|课间操|跑操/.test(content || '');
          if (!isSportLeave) addLeave(s.name, content || '请假', true);
          const recId = uid();
          s.records.unshift({ id: recId, type: 'leave', date: recDate, ts, content: content || '请假' });
          logBehaviorToClassLog(recId, s.name, 'leave', content || '请假', recDate);
          nLeave++;
        }
      } else if (recType) {
        if (isHead && !isClassroom) {
          const recId = uid();
          s.records.unshift({ id: recId, type: recType, date: recDate, ts, content });
          logBehaviorToClassLog(recId, s.name, recType, content, recDate);
          nRecord++;
        }
      }
      // 基础积分（表扬+1 / 批评-1 / 严重翻倍）（仅班主任班）
      if (isHead && pointDelta !== 0) {
        ptWriteLog(s.id, dim, pointDelta, `一句话记录·${recordTypeLabel(recType)}：${content.slice(0, 20)}`);
        nPoint++;
        autoPointLogs.push(`${s.name} ${dimLabel(dim)}${pointDelta >= 0 ? '+' : ''}${pointDelta}`);
      }
      // 规则积分（仅班主任班）
      if (isHead) rules.forEach(({ rule }) => {
        ptWriteLog(s.id, rule.dim, rule.delta, `规则·${rule.label}：${content.slice(0, 20)}`, '', 'rule');
        nPoint++;
        autoPointLogs.push(`${s.name} ${dimLabel(rule.dim)}${rule.delta >= 0 ? '+' : ''}${rule.delta}`);
      });
      // 课堂记录（所有班都记，按学生所属班级归档）
      subjects.forEach(sub => {
        state.classRecords.unshift({ id: uid(), date: recDate, ts, subject: sub.name, studentId: s.id, studentName: s.name, class: stuClass, content, auto: 'quick' });
        nClass++;
      });
      // 作业管理（作业完成情况台账）：记「是否完成」，并保留学生姓名以便按人检索
      if (homework) {
        const hwSubject = subjects[0]?.name || '未指定';
        const undone = /未完成|没交|未做|不交|未交|漏做|缺交/.test(content);
        state.homework.unshift({
          id: uid(), studentId: s.id, studentName: s.name, subject: hwSubject,
          title: content || '', status: undone ? '未完成' : '已完成',
          // date 可带 HH:mm:ss（hwNormDate 取日期部分做筛选，不受影响）
          class: stuClass, date: recDate || attDateKey(new Date()), ts,
        });
        nHomework++;
      }
    });
  });
  // 班级日志：仅在「没有行为记录同步、但存在课堂/作业/积分动作」时保留一句汇总，避免与逐条行为日志重复
  const wroteBehavior = nRecord > 0 || nLeave > 0;
  if (!wroteBehavior && (nClass > 0 || nHomework > 0 || nPoint > 0)) {
    let logContent = `一句话记录：${qrDraft.raw}`;
    if (autoPointLogs.length) logContent += `（${autoPointLogs.join('、')}）`;
    state.classLogs.unshift({ id: uid(), date, ts, content: logContent });
  }
  lastRecordContent = qrDraft.raw;
  const totalSaved = nRecord + nLeave + nPoint + nClass + nHomework;
  save();
  // ===== 连续记录模式 =====
  // 保存后不关弹窗：清空输入框、把光标放回去，顶部提示「本次已记录 N 条」。
  // 课间一口气记好几个学生时，不用每次都重新点 FAB。想退出点右上角 × 或「完成」。
  // 累计的是「实际写入的条目数」，不是保存次数 —— 老师看到的是"这节课记了多少条"
  qrSessionCount += totalSaved;
  const parts = [];
  if (nRecord) parts.push(`${nRecord} 条行为`);
  if (nLeave) parts.push(`${nLeave} 条请假`);
  if (nPoint) parts.push(`${nPoint} 笔积分`);
  if (nClass) parts.push(`${nClass} 条课堂记录`);
  if (nHomework) parts.push(`${nHomework} 条作业`);
  qrLastSummary = parts.join('、') || `${totalSaved} 项`;

  clearTimeout(qrAutoTimer);
  qrDraft = null; qrDeductDraft = null; qrLastText = '';
  const inputEl = document.getElementById('qrText');
  if (inputEl) inputEl.value = '';
  const stEl = document.getElementById('qrStatus');
  if (stEl) stEl.innerHTML = qrStatusHtml();   // 状态条在 #qrResult 之外，要单独刷
  qrRenderDraft();                              // 清空预览区
  toast(`已记录 ${qrLastSummary}`);
  render();
  // 焦点必须在 render() 之后再放：render 只重绘 #app，弹窗在 #app 之外不受影响，
  // 但放在后面可以确保光标不会因为任何重排而丢失
  if (inputEl) { try { inputEl.focus({ preventScroll: true }); inputEl.setSelectionRange(0, 0); } catch (e) {} }
}

// 一句话记录中的关联扣分确认
function pmConfirmQrDeduct() {
  if (!qrDeductDraft) return;
  const { nodeId, text, pts } = qrDeductDraft;
  pmConfirmDeduct(nodeId, pts, text);
  const box = document.getElementById('qrResult');
  if (box) box.innerHTML = '<div class="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-sm text-green-700">✅ 关联扣分已记录（任职赋分维度，可在积分管理-日志按批次撤销）。如还需记录其他内容，可重新输入并识别。</div>';
  qrDeductDraft = null;
}
// 轻量提示
function toast(text, ms) {
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
  el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, ms || 2200);
  el.style.opacity = '1';
}

// ===================== FAB =====================
// 单击 FAB 直接进一句话记录。原「快速记录」菜单的 8 个入口已挪进弹窗内的
// 「更多录入方式」（fabMoreEntries），这里保留同名函数只是为了兼容旧调用。
function openFabDefault() { openQuickRecord(); }

// ===================== Data management =====================
// 修改密码固定口令（前后端保持一致，可通过环境变量 RESET_PASSWORD_CODE 覆盖后端默认值）
const RESET_PASSWORD_CODE = 'teacher2024';

// 班级显示名：内部用 id（如 '10班'），展示用 name（可自定义）
function className(id) {
  const c = (state.classes || []).find(x => x.id === id);
  return c ? c.name : (id || '');
}
// 班级反解：记录里的 class 可能存的是内部 id、显示名，或历史遗留值。
// 统一解析为内部 id；无法识别时返回 ''（调用方自行兜底）
function classIdOf(raw) {
  if (raw == null) return '';
  const r = String(raw).trim();
  if (!r) return '';
  const c = (state.classes || []).find(x => x.id === r || x.name === r);
  return c ? c.id : '';
}
// 作业归属判定：先归一化班级再比较，无法识别的旧数据归到班主任班
function hwBelongsTo(h, cls) {
  return (classIdOf(h && h.class) || state.headTeacherClass) === cls;
}
// 班级下拉框：值一律用内部 id，展示用 name。禁用态（任课班新增）也能正常取到 id
function classSelectHTML(id, cur, cls, disabled) {
  const list = state.classes || [];
  const known = list.some(c => c.id === cur);
  const opts = (known ? '' : `<option value="${esc(cur)}" selected>${esc(cur)}</option>`)
    + list.map(c => `<option value="${esc(c.id)}" ${(known ? c.id === cur : false) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<select id="${id}" ${disabled ? 'disabled' : ''} class="w-full border rounded-lg p-2 text-sm ${cls || ''}">${opts}</select>`;
}
// 导入时把班级列（可能是显示名或 id）统一解析为内部 id
function resolveClass(raw, fallback) {
  const def = (fallback !== undefined) ? fallback : state.activeClass;
  if (!raw) return def;
  raw = String(raw).trim();
  if (!raw) return def;
  const c = (state.classes || []).find(x => x.id === raw || x.name === raw);
  return c ? c.id : def;
}

// ---------- 数据自检：对比本机与云端，找出「刷新后会丢」的记录 ----------
function openDataDiag() {
  const cnt = s => ({
    '学生': (s.students || []).length,
    '作业': (s.homework || []).length,
    '课堂记录': (s.classRecords || []).length,
    '班级日志': (s.classLogs || []).length,
    '积分流水': ((s.points || {}).logs || []).length
  });
  const local = cnt(state);
  const lt = state._savedAt ? new Date(state._savedAt).toLocaleString('zh-CN') : '（无时间戳·旧版数据）';
  const byCls = {};
  (state.homework || []).forEach(h => { const k = String(h.class == null ? '(空)' : h.class); byCls[k] = (byCls[k] || 0) + 1; });
  const clsDist = Object.keys(byCls).length
    ? Object.entries(byCls).map(([k, v]) => `${esc(k)} ${v} 项`).join('　')
    : '（无作业记录）';
  const clsList = (state.classes || []).map(c => `${esc(c.name)}`).join('、') || '（未设置）';
  openModal('数据自检', `
    <div class="space-y-3 text-sm">
      <div class="p-3 rounded-xl bg-gray-50">
        <div class="font-medium mb-1">本机数据（当前页面）</div>
        <div class="text-xs text-gray-600">${Object.entries(local).map(([k, v]) => k + ' ' + v).join(' · ')}</div>
        <div class="text-xs text-gray-400 mt-1">最后保存：${esc(lt)}</div>
      </div>
      <div class="p-3 rounded-xl bg-gray-50">
        <div class="font-medium mb-1">作业按班级分布</div>
        <div class="text-xs text-gray-600">${clsDist}</div>
        <div class="text-xs text-gray-400 mt-1">班级列表：${clsList}</div>
      </div>
      <div id="diagCloud" class="p-3 rounded-xl bg-blue-50 text-xs text-gray-600">正在读取云端数据…</div>
      <div id="diagActions"></div>
      <button class="w-full border py-2 rounded-full text-sm hover:bg-gray-50" onclick="closeModal()">关闭</button>
    </div>`, 'md');
  apiGet('/api/data').then(res => {
    const box = document.getElementById('diagCloud');
    const act = document.getElementById('diagActions');
    if (!box) return;
    if (!res || !res.state) { box.innerHTML = '⚠️ 读取云端失败（未登录或网络异常）'; return; }
    const cloudRaw = res.state;
    const c = cnt(cloudRaw);
    const ct = cloudRaw._savedAt ? new Date(cloudRaw._savedAt).toLocaleString('zh-CN') : '（无时间戳·旧版数据）';
    box.innerHTML = `<div class="font-medium mb-1">云端数据</div>`
      + Object.keys(local).map(k => {
          const a = local[k], b = c[k], diff = a - b;
          const tag = diff === 0 ? '' : (diff > 0
            ? `<span class="text-orange-600">（本机多 ${diff}）</span>`
            : `<span class="text-blue-600">（云端多 ${-diff}）</span>`);
          return `<div>${k}：本机 ${a} / 云端 ${b} ${tag}</div>`;
        }).join('')
      + `<div class="text-gray-400 mt-1">云端最后保存：${esc(ct)}</div>`;
    // 用真实合并函数算出「本机有而云端没有」的记录数
    let snap = null, missing = 0;
    try { snap = JSON.parse(JSON.stringify(cloudRaw)); missing = mergeMissing(JSON.parse(JSON.stringify(state)), snap); } catch (e) {}
    if (missing > 0 && snap) {
      window.__diagSnap = snap;
      act.innerHTML = `<div class="p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-800">
        检测到本机有 <b>${missing}</b> 条记录不在云端。<br/>
        若上次保存时网络异常，这些记录刷新后会被云端旧数据覆盖而丢失。<br/>
        <button class="mt-2 w-full bg-primary text-white py-2 rounded-full text-sm" onclick="diagUploadMissing()">⬆️ 立即补传到云端（${missing} 条）</button>
      </div>`;
    } else {
      act.innerHTML = `<div class="p-3 rounded-xl bg-green-50 text-xs text-green-700">✅ 本机与云端数据一致，没有检测到会丢失的记录。</div>`;
    }
  }).catch(() => {
    const box = document.getElementById('diagCloud');
    if (box) box.innerHTML = '⚠️ 读取云端失败（未登录或网络异常）';
  });
}
// 把「本机有、云端没有」的记录补传上去（本机数据优先，不动云端已有的记录）
function diagUploadMissing() {
  const snap = window.__diagSnap;
  if (!snap) return toast('没有需要补传的数据');
  if (state && state.locked) return toast('🔒 只读模式：请先解锁后再补传');
  state = migrateState(snap);
  save();
  window.__diagSnap = null;
  closeModal();
  render();
  toast('已补传到云端');
}

function openSettings() {
  openModal('设置', `
    <div class="grid grid-cols-2 gap-3 text-sm">
      <button class="p-4 rounded-xl border hover:bg-gray-50 flex flex-col items-center gap-2" onclick="closeModal(); exportData()">
        <span class="text-2xl">⬇️</span><span>导出数据</span>
      </button>
      <button class="p-4 rounded-xl border hover:bg-gray-50 flex flex-col items-center gap-2" onclick="closeModal(); importData()">
        <span class="text-2xl">⬆️</span><span>导入数据</span>
      </button>
      <button class="p-4 rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex flex-col items-center gap-2" onclick="closeModal(); openClassSettings()">
        <span class="text-2xl">🏫</span><span>班级设置</span>
      </button>
      <button class="p-4 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 flex flex-col items-center gap-2" onclick="closeModal(); openClearDataModal()">
        <span class="text-2xl">🗑️</span><span>清理数据</span>
      </button>
      <button class="p-4 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-50 flex flex-col items-center gap-2" onclick="closeModal(); openChangePassword()">
        <span class="text-2xl">🔑</span><span>修改密码</span>
      </button>
      <button class="p-4 rounded-xl border border-amber-200 text-amber-600 hover:bg-amber-50 flex flex-col items-center gap-2" onclick="closeModal(); openLockSettings()">
        <span class="text-2xl">🔒</span><span>只读锁定</span>
      </button>
      <button class="p-4 rounded-xl border border-teal-200 text-teal-600 hover:bg-teal-50 flex flex-col items-center gap-2" onclick="closeModal(); openDataDiag()">
        <span class="text-2xl">🔍</span><span>数据自检</span>
      </button>
      <button class="p-4 rounded-xl border border-emerald-200 text-emerald-600 hover:bg-emerald-50 flex flex-col items-center gap-2" onclick="closeModal(); openRecKeywordEditor()">
        <span class="text-2xl">🔤</span><span>关键词管理</span>
      </button>
      <button class="p-4 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-50 flex flex-col items-center gap-2" onclick="closeModal(); openQrCorrections()">
        <span class="text-2xl">🧠</span><span>识别纠偏</span>
      </button>
    </div>
    <p class="text-[11px] text-gray-400 mt-4 text-center">修改密码需先验证固定口令，忘记口令请导出数据后重置应用</p>`, 'md');
}
function openRecKeywordEditor(){
  const types=[['critic','批评类'],['praise','表扬类'],['chat','谈心类'],['leave','请假类']];
  const blocks=types.map(([t,label])=>{
    const arr=[...new Set(getRecLabels(t).concat(getRecDesc(t)))];
    return `<div class="mb-3">
      <label class="block text-xs text-gray-500 mb-1">${label}（空格 / 逗号 / 顿号分隔）</label>
      <textarea id="kw_${t}" rows="3" class="w-full border rounded-lg p-2 text-sm">${esc(arr.join('、'))}</textarea>
    </div>`;
  }).join('');
  openModal('一句话记录 · 关键词管理', `
    <p class="text-xs text-gray-400 mb-3">这些词决定「一句话记录」如何自动归类。修改后立即生效并随数据保存。批评 / 表扬类的「类型动词」与「描述词」已合并编辑。</p>
    <div>${blocks}</div>
    <div class="flex gap-2 mt-2">
      <button class="flex-1 border py-2 rounded-full" onclick="closeModal()">取消</button>
      <button class="flex-1 bg-primary text-white py-2 rounded-full" onclick="saveRecKeywords()">保存</button>
    </div>`, 'lg');
}
function saveRecKeywords(){
  const types=['critic','praise','chat','leave'];
  types.forEach(t=>{
    const raw=document.getElementById('kw_'+t).value;
    const arr=[...new Set(raw.split(/[\s,，、]+/).map(s=>s.trim()).filter(Boolean))];
    state.recKeywords.labels[t]=arr.slice();
    state.recKeywords.desc[t]=arr.slice();
  });
  save(); closeModal(); toast('关键词已更新');
}

// ===== 一句话记录 · 纠偏管理 =====
function openQrCorrections() {
  openModal('识别纠偏', `<div id="qrCorrectionsBody">${renderQrCorrectionsBody()}</div>`, 'lg');
}
function renderQrCorrectionsBody() {
  const list = (state.qrCorrections || []).slice().reverse();
  if (!list.length) return `<div class="text-sm text-gray-500 text-center py-8">暂无纠偏记录。在「一句话记录」中手动修改识别结果后，点击「记住本次修正」即可添加。</div>`;
  return `<div class="space-y-3">
    <div class="text-xs text-gray-500">共 ${list.length} 条。关闭/删除不想要的，保留常用的；同样输入下次会优先命中。</div>
    ${list.map((c, i) => `
      <div class="rounded-xl border ${c.enabled === false ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-violet-200 bg-violet-50/40'} p-3 space-y-2">
        <div class="flex items-start gap-2">
          <input type="checkbox" ${c.enabled !== false ? 'checked' : ''} onchange="qrToggleCorrection('${c.id}')" class="mt-1 w-4 h-4 text-primary rounded">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 truncate">${esc(c.raw)}</div>
            <div class="text-xs text-violet-600 mt-0.5">${esc(qrCorrectionSummary(c))}</div>
          </div>
          <button class="text-xs text-red-500 hover:underline shrink-0" onclick="qrDeleteCorrection('${c.id}')">删除</button>
        </div>
      </div>
    `).join('')}
  </div>`;
}
function renderQrCorrections() {
  const body = document.getElementById('qrCorrectionsBody');
  if (body) body.innerHTML = renderQrCorrectionsBody();
}

// ===================== 只读锁定（大屏展示防误改） =====================
function isLocked() { return !!state.locked; }

function openLockSettings() {
  const hasPass = !!(state.lockPass && state.lockPass.length);
  const locked = isLocked();
  const statusHtml = locked
    ? `<div class="rounded-xl p-4 bg-amber-50 border border-amber-100 text-center"><div class="text-2xl mb-1">🔒</div><div class="font-bold text-amber-700">当前已锁定</div><div class="text-xs text-amber-600 mt-1">学生只能查看，不能修改</div></div>`
    : `<div class="rounded-xl p-4 bg-emerald-50 border border-emerald-100 text-center"><div class="text-2xl mb-1">🔓</div><div class="font-bold text-emerald-700">当前可编辑</div><div class="text-xs text-emerald-600 mt-1">锁定时学生将无法修改任何数据</div></div>`;
  const actionHtml = locked
    ? `<div class="space-y-3">
        <label class="block text-xs text-gray-500">输入锁定口令解锁</label>
        <input id="unlockPass" type="password" data-lock-allow class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="锁定口令 / 账号重置码" onkeydown="if(event.key==='Enter')doUnlock()" />
        <p id="unlockMsg" class="text-xs h-4"></p>
        <div class="flex gap-2">
          <button class="flex-1 border py-2 rounded-full" data-lock-allow onclick="closeModal()">取消</button>
          <button class="flex-1 bg-primary text-white py-2 rounded-full" data-lock-allow onclick="doUnlock()">🔓 解锁</button>
        </div>
      </div>`
    : `<div class="space-y-3">
        <button class="w-full bg-primary text-white py-2.5 rounded-full hover:bg-primaryDark" onclick="doLock()">🔒 进入只读锁定</button>
        <details class="text-sm">
          <summary class="text-xs text-gray-500 cursor-pointer select-none">${hasPass ? '修改锁定口令' : '首次使用，请设置锁定口令'}</summary>
          <div class="mt-2 space-y-2">
            <label class="block text-xs text-gray-500">${hasPass ? '新口令（留空则不修改）' : '设置口令（至少4位，锁定/解锁时都需要）'}</label>
            <input id="lockPassInput" type="password" data-lock-allow class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="${hasPass ? '输入新口令' : '设置新口令'}" />
          </div>
        </details>
      </div>`;
  openModal('只读锁定', `
    <div class="space-y-4">
      ${statusHtml}
      ${actionHtml}
      <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" id="defaultLockedCheck" data-lock-block ${state.defaultLocked ? 'checked' : ''} onchange="state.defaultLocked=this.checked; save();" class="w-4 h-4 text-primary rounded" />
        <span>每次打开工作台自动进入只读锁定</span>
      </label>
    </div>`, 'sm');
}
function doLock() {
  const v = (document.getElementById('lockPassInput') ? document.getElementById('lockPassInput').value : '').trim();
  const chk = document.getElementById('defaultLockedCheck');
  if (chk) state.defaultLocked = chk.checked;
  if (!state.lockPass) {
    if (v.length < 4) { toast('请先设置至少4位口令'); return; }
    state.lockPass = v;
  } else if (v.length >= 4) {
    state.lockPass = v;
  }
  state.locked = true;
  // 「默认锁定」勾选才在刷新后保持锁定；未勾选则本次锁定仅当前会话，刷新自动解锁。
  state.lockManuallySet = !!(chk && chk.checked);
  save(true); closeModal(); render();   // internal：上锁操作本身必须能落盘
  toast('已锁定为只读模式');
}
function _lockPassVal() {
  const a = document.getElementById('lockPassInput'); if (a && a.value !== '') return a.value.trim();
  const b = document.getElementById('unlockPass'); if (b) return b.value.trim();
  return '';
}
function doUnlockPrompt() {
  openModal('解锁工作台', `
    <div class="space-y-3">
      <p class="text-sm text-gray-600">请输入锁定口令以解锁编辑。</p>
      <input id="unlockPass" type="password" data-lock-allow class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="锁定口令 / 账号重置码" onkeydown="if(event.key==='Enter')doUnlock()" />
      <p id="unlockMsg" class="text-xs h-4"></p>
      <div class="flex gap-2">
        <button class="flex-1 border py-2 rounded-full" data-lock-allow onclick="closeModal()">取消</button>
        <button class="flex-1 bg-primary text-white py-2 rounded-full" data-lock-allow onclick="doUnlock()">解锁</button>
      </div>
    </div>`, 'sm');
}
function doUnlock() {
  const v = _lockPassVal();
  if (v === state.lockPass || v === RESET_PASSWORD_CODE) {
    const chk = document.getElementById('defaultLockedCheck');
    if (chk) state.defaultLocked = chk.checked;
    state.locked = false; state.lockManuallySet = false; save(true); closeModal(); render();   // internal：解锁本身必须能落盘
    toast('已解锁，可正常编辑');
  } else {
    const m = document.getElementById('unlockMsg');
    if (m) { m.textContent = '口令错误'; m.className = 'text-xs text-red-500 h-4'; }
    toast('口令错误');
  }
}

// ===== 全局只读拦截 v2 =====
// 设计原则（与 v1 相反）：锁定只保护「数据不被修改」，不阻碍任何查看/导航/切换。
// v1 为白名单制（默认全拦，仅放行 data-lock-allow），导致切换 tab、展开详情、翻页等
//   只读操作被大量误杀——这是「只是想看看却被强制解锁」的根因。
// v2 改为黑名单制：默认放行，仅拦截明确的写操作。
//   判定顺序（自上而下，命中即返回）：
//   1) data-lock-allow    → 放行（最高优先级，覆盖一切）
//   2) data-lock-block    → 拦截（显式标记）
//   3) 可编辑元素          → 拦截（contenteditable）
//   4) 拖拽事件            → 拦截（dragstart/drop，用于调座位、排课表）
//   5) 表单输入            → 拦截（input/change，搜索框等已用 data-lock-allow 放行）
//   6) 写操作函数名        → 拦截（见 LOCK_WRITE_RE 词表）
//   7) 其余                → 放行
let _lockGuardReady = false;
function initLockGuard() {
  if (_lockGuardReady) return; _lockGuardReady = true;
  const blockTypes = ['click', 'dblclick', 'input', 'change', 'dragstart', 'drop', 'submit'];
  blockTypes.forEach(type => {
    document.addEventListener(type, function (e) {
      if (!state || !state.locked) return;
      const el = e.target;
      if (!el || !el.closest) return;
      // 1) 显式放行标记（最高优先级）
      if (el.closest('[data-lock-allow]')) return;
      // 1b) 模态背景点击关闭（仅当点击目标恰好是 modal-bg 本身时放行，不放行其子元素）
      if (type === 'click' && el.classList && el.classList.contains('modal-bg')) return;
      // 2) 显式拦截标记
      if (el.closest('[data-lock-block]')) { blockLockEvent(e, type); return; }
      // 3) 可编辑内容
      if (el.isContentEditable) { blockLockEvent(e, type); return; }
      // 4) 拖拽类一律拦截
      if (type === 'dragstart' || type === 'drop') { blockLockEvent(e, type); return; }
      // 5) 表单输入拦截
      if (type === 'input' || type === 'change') {
        const t = el.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') { blockLockEvent(e, type); return; }
      }
      // 6) 点击类：按函数名判定
      if (type === 'click' || type === 'dblclick' || type === 'submit') {
        if (isWriteAction(el)) { blockLockEvent(e, type); return; }
      }
      // 7) 其余放行
    }, true);
  });
}

// 锁定提示（节流，避免连续点击刷屏）
let _lockToastAt = 0;
function blockLockEvent(e, type) {
  e.preventDefault();
  e.stopPropagation();
  if (type === 'click' || type === 'dblclick' || type === 'drop' || type === 'dragstart') {
    const now = Date.now();
    if (now - _lockToastAt > 1200) { _lockToastAt = now; toast('🔒 只读模式：查看不受限，修改需先解锁'); }
  }
}

// 写操作动词词表（后接大写字母/下划线/结尾，避免误伤 setPtTab 这类「切换视图」）
// 该词表已对全量 260+ 内联事件函数逐一验证：0 漏网、0 误伤
const LOCK_WRITE_RE = /(?:save|delete|del|remove|undo|submit|import|confirm|clear|drop|paste|mark|apply|calc|add|update|edit|rename|move|bulk|settle|gen|snapshot|finish|arrange|setstudent|setsign|setcommstatus|setconvertpreset|setcategory|toggletodo|autoduty|seatclick|seatdrop|seatclear|seatset|seatauto)(?:[A-Z_]|$)/i;

// 显式写操作名单：函数名不含通用写动词（躲过 LOCK_WRITE_RE），但实测会改数据并 save()。
// 由「全量扫描调用 save() 的函数 → 反查锁定判定」得出，新增函数时请回归此表。
const LOCK_WRITE_FNS = new Set([
  'pmToggleStu',                // 职务与值日：点学生名增删任职/值日生（主要漏洞）
  'toggleAttDay',               // 考勤：切换住校/走读日
  'resetSampleData',            // 载入示例数据（会清空全部现有数据，最危险）
  'olEnsureDerivedRankColumns', // 成绩分析：派生排名列
  'autoArchiveAttendance',      // 考勤：自动归档
  'diagUploadMissing',          // 数据自检：把本机记录补传到云端（会覆盖云端）
  'hwFixName',                  // 作业管理：补录旧记录学生姓名
  'hwToggleStatus',             // 作业管理：切换「已完成/未完成」（实测曾漏网，锁定态下仍能改）
]);

// 自动补全名单：扫描全局函数，凡函数体内直接调用 save() 的都视为写操作。
// 目的：新增功能时无需手工维护名单，避免再次出现「锁定了却仍能改数据」的漏网之鱼。
// 只读/系统类函数列在白名单里排除；宁可多拦（界面提示）也不放过真正的写入。
const LOCK_ALLOW_FNS = new Set([
  'save','pushSync','render','navigate','toast','closeModal','openModal','confirmModal','runConfirmCb',
  'doLogout','showLogin','applyDefaultLock','initLockGuard','isWriteAction','lockAutoWriteFns',
  'doUnlockPrompt','unlockApp','lockApp','setLockPass','toggleDefaultLock','applyLockFromPanel',
  'exportData','doExport','copyReport','printReport','exportSeatTeacher','exportSeatStudent',
  'applyCloudState','load','defaultState','migrateState',
  'gsSetQuery','gsOpen','crSetSearch','behSetSearch','hwSetSearch','ptFilter',
]);
let _lockAutoFns = null;
function lockAutoWriteFns() {
  if (_lockAutoFns) return _lockAutoFns;
  const s = new Set();
  try {
    const keys = Object.getOwnPropertyNames(window);
    for (const k of keys) {
      if (LOCK_ALLOW_FNS.has(k)) continue;
      // 纯查看/导出/打开类：即便内部有 save 也不该拦（如导出前落盘）
      if (/^(open|view|export|copy|print|preview|show)/i.test(k)) continue;
      let f; try { f = window[k]; } catch (e) { continue; }
      if (typeof f !== 'function') continue;
      let src = ''; try { src = String(f); } catch (e) { continue; }
      if (!src || src.length > 40000) continue;
      // 去掉行注释，避免「// 此处不要 save()」这类注释造成误判
      const body = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/\bsave\s*\(/.test(body)) s.add(k);
    }
  } catch (e) { /* 扫描失败时退回手工名单 */ }
  _lockAutoFns = s;
  return s;
}

// 判断元素（或其祖先）绑定的内联处理函数是否属于写操作
function isWriteAction(el) {
  let n = el, guard = 0;
  while (n && n !== document.documentElement && guard++ < 25) {
    if (n.getAttribute) {
      const attrs = ['onclick', 'ondblclick', 'onchange', 'oninput', 'onsubmit'];
      for (const a of attrs) {
        const h = n.getAttribute(a);
        if (!h) continue;
        const fns = h.match(/[A-Za-z_$][\w$]*(?=\s*\()/g) || [];
        for (const fn of fns) {
          // 打开/查看/导出类：只开界面不改数据，放行（含 pmOpenXxx 变体）
          if (/^(open|view|export|copy|print|preview|show)/i.test(fn)) continue;
          if (/open(?=[A-Z])/i.test(fn)) continue;      // pmOpenAdd / pmOpenDescEdit
          if (/toggle\w*edit$/i.test(fn)) continue;     // pmToggleDutyEdit / pmToggleRolesEdit
          // 列管理类：全部为写操作
          if (/^cm[A-Z]/.test(fn)) return true;
          // 显式名单：名称不含写动词但实际会改数据
          if (LOCK_WRITE_FNS.has(fn)) return true;
          if (LOCK_WRITE_RE.test(fn)) return true;
          // 自动补全：函数体内直接调用 save() 的（新增功能自动纳入，无需手工维护）
          if (lockAutoWriteFns().has(fn)) return true;
        }
      }
    }
    n = n.parentElement;
  }
  return false;
}

// 班级设置：只改显示名称与角色，内部 id 保持不变（零数据迁移）
function openClassSettings() {
  const items = (state.classes || []).map((c, i) => `
    <div class="flex items-center gap-3 p-3 rounded-xl border">
      <div class="flex-1">
        <label class="block text-xs text-gray-500 mb-1">班级显示名称</label>
        <input id="clsName${i}" class="w-full border rounded-lg px-3 py-2 text-sm" value="${esc(c.name)}" />
      </div>
      <div class="w-32">
        <label class="block text-xs text-gray-500 mb-1">角色</label>
        <select id="clsRole${i}" class="w-full border rounded-lg px-2 py-2 text-sm">
          <option value="head" ${c.role === 'head' ? 'selected' : ''}>班主任班</option>
          <option value="teacher" ${c.role !== 'head' ? 'selected' : ''}>任课班</option>
        </select>
      </div>
    </div>`).join('');
  openModal('班级设置', `
    <p class="text-xs text-gray-500 mb-3">修改显示名称即可，内部标识自动保留，学生、成绩、座次表等数据无需迁移。班主任班仅可设置一个。</p>
    <div class="space-y-2">${items}</div>
    <div class="flex gap-2 mt-4">
      <button class="flex-1 border py-2 rounded-full" onclick="closeModal()">取消</button>
      <button class="flex-1 bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveClassSettings()">保存</button>
    </div>`, 'md');
}

function saveClassSettings() {
  const classes = state.classes || [];
  const names = [];
  let headCount = 0;
  classes.forEach((c, i) => {
    const name = (document.getElementById('clsName' + i).value || '').trim();
    const role = document.getElementById('clsRole' + i).value;
    if (!name) return alert('班级名称不能为空');
    if (names.includes(name)) return alert('班级名称不能重复：' + name);
    names.push(name);
    c.name = name;
    c.role = role;
    if (role === 'head') headCount++;
  });
  if (headCount !== 1) return alert('必须且只能设置一个班主任班');
  state.headTeacherClass = (classes.find(c => c.role === 'head') || classes[0]).id;
  if (!classes.some(c => c.id === state.activeClass)) state.activeClass = state.headTeacherClass;
  save(); closeModal(); render();
  alert('班级设置已保存');
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
  if (state && state.locked) return alert('当前处于只读锁定模式，请先解锁后再导入数据。');
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try { data = JSON.parse(e.target.result); }
    catch(err) { return alert('文件格式不正确：不是合法的 JSON 文件。'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return alert('文件格式不正确：备份文件的最外层应该是一个对象。');
    }
    // 结构校验：至少要含有工作台的核心字段，避免误导入其它 JSON 把数据冲掉
    const CORE_KEYS = ['students','points','classes','classRecords','homework','scores'];
    if (!CORE_KEYS.some(k => k in data)) {
      return alert('这个文件不像是班主任工作台的备份（未找到 students / points / classes 等核心字段），已取消导入。');
    }
    const curStu = (state.students || []).length;
    const curLogs = ((state.points && state.points.logs) || []).length;
    confirmModal(`导入将<b>覆盖当前全部数据</b>。<br>当前：${curStu} 名学生、${curLogs} 条积分记录；<br>导入后：${(data.students || []).length} 名学生、${((data.points && data.points.logs) || []).length} 条积分记录。<br><br>导入前会自动在本地留一份备份，确定继续吗？`, function(){
      const prev = state;
      const backup = (function(){ try { return JSON.stringify(state); } catch(e){ return ''; } })();
      try {
        state = migrateState(data);   // 归一化：补齐旧备份缺失的模块字段
        save(true);                   // internal：导入属系统级写入，不受只读锁定影响
      } catch (err) {
        state = prev;
        try { save(true); } catch(e2) {}
        return alert('导入失败，已恢复原有数据。原因：' + err.message);
      }
      if (backup) {
        try { localStorage.setItem(STORAGE_KEY + '_bak_import_' + Date.now(), backup); }
        catch(e) { console.warn('备份写入失败（不影响导入结果）', e); }
      }
      closeModal(); render();
      alert('导入成功。原数据已备份在浏览器本地，如发现问题可在「设置 → 数据自检」回滚。');
    }, '确定导入');
  };
  reader.readAsText(f);
}
// ===================== 从「班级积分管理系统」备份导入 =====================
// 兼容 E:/code/class_score/backups/*.json 结构：studentList/scoreLog/jobScoreStartDate
const IMPORT_DIM_MAP = { '体育打卡': 'sport', '日常积分': 'daily', '考试赋分': 'exam', '任职赋分': 'post' };
function importFromClassScore() {
  openModal('从班级积分备份导入', `
    <div class="space-y-4">
      <p class="text-sm text-gray-500">选择「班级积分管理系统」导出的备份 JSON（含 studentList / scoreLog 等字段），将把学生、分组、积分明细日志合并进当前工作台。<br><span class="text-amber-600">注意：职务与任职赋分已独立到「职务与值日」模块，备份中的职务/分配信息不再导入。</span></p>
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

      // 2) 积分计算起始日（取更早的）
      if (raw.jobScoreStartDate) {
        const incoming = new Date(raw.jobScoreStartDate);
        const cur = state.points.calcStartDate ? new Date(state.points.calcStartDate) : null;
        if (!cur || incoming < cur) state.points.calcStartDate = raw.jobScoreStartDate;
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
      // 注意：这里曾引用未定义变量 newAssign，导致导入明明成功却抛出
      // "newAssign is not defined"、被下面的 catch 兜成「文件解析失败」。
      alert(`导入完成：新增学生 ${newStu} 人、积分明细 ${newLogs} 条；跳过任职赋分自动记录 ${skipJob} 条（由职务系统实时计算）。`);
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
// 安全全清：仅清除业务数据，保留账号/班级/积分规则/职务/课程节次/折算比例/考试赋分规则等固定设置
const BUSINESS_DATA_KEYS = ['students','scores','attendance','pointsLogs','classRecords','classLogs','communications','homework','todosReminders','templates','seating','snapshots'];

function clearAllData() {
  applyClearData(BUSINESS_DATA_KEYS);
}

// 分模块选择性清除：只清除 keys 里列出的内容，其余（含固定设置）一律保留
function applyClearData(keys) {
  const on = k => Array.isArray(keys) && keys.indexOf(k) !== -1;
  if (on('students')) state.students = [];
  if (on('scores')) {
    state.scores = [];
    if (state.examData) {
      state.examData.exams = [];
      state.examData.records = [];
      (state.examData.classes || []).forEach(c => { c.studentNames = []; c.gender = {}; });
    }
  }
  if (on('attendance')) state.attendance = { members: [], current: null, logs: [] };
  if (on('pointsLogs')) state.points.logs = [];
  if (on('classRecords')) state.classRecords = [];
  if (on('classLogs')) state.classLogs = [];
  if (on('communications')) state.communications = [];
  if (on('homework')) state.homework = [];
  if (on('todosReminders')) { state.todos = []; state.reminders = []; }
  if (on('templates')) state.templates = [];
  if (on('seating')) state.seatingByClass = {};
  if (on('snapshots')) state.snapshots = [];
  // 高级：固定设置（清空后需重新配置）
  if (on('pointsRules')) state.points.rules = defaultPoints().rules;
  if (on('positions')) state.positions = defaultPositions();
  if (on('scheduleCourses')) state.schedule.courses = [];
  if (on('convertRatios')) state.convertRatios = { sport: 0, daily: 0, exam: 0, post: 0 };
  if (on('examScore')) state.examScore = defaultExamScore();
  if (on('examColumns')) { if (state.examData) state.examData.columns = defaultExamColumns(); }
  save(); render();
}

// 清理数据弹窗：按模块勾选，固定设置默认不勾
const CLEAR_GROUPS = [
  { def: true, title: '业务数据（默认勾选，可取消）', items: [
    { k: 'students', label: '学生与行为档案（含评语/谈心）' },
    { k: 'scores', label: '成绩数据（上传成绩 + 成绩分析名单）' },
    { k: 'attendance', label: '考勤记录（含固定回家周期与请假）' },
    { k: 'pointsLogs', label: '积分流水（积分归零，规则保留）' },
    { k: 'classRecords', label: '课堂记录' },
    { k: 'classLogs', label: '班级日志' },
    { k: 'communications', label: '家校沟通' },
    { k: 'homework', label: '作业' },
    { k: 'todosReminders', label: '待办与提醒' },
    { k: 'templates', label: '模板库' },
    { k: 'seating', label: '座次表安排' },
    { k: 'snapshots', label: '历史积分快照' },
  ] },
  { def: false, advanced: true, title: '固定设置（默认不勾，清空后需重新配置，慎用）', items: [
    { k: 'pointsRules', label: '积分规则' },
    { k: 'positions', label: '职务与值日体系' },
    { k: 'scheduleCourses', label: '课程表内容' },
    { k: 'convertRatios', label: '折算设置' },
    { k: 'examScore', label: '考试赋分规则' },
    { k: 'examColumns', label: '成绩分析预设列' },
  ] },
];

function openClearDataModal() {
  const rows = g => g.items.map(it => `
    <label class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
      <input type="checkbox" class="cd-chk" value="${it.k}" ${g.def ? 'checked' : ''} />
      <span class="text-sm text-gray-700">${it.label}</span>
    </label>`).join('');
  const body = `
    <p class="text-xs text-gray-500 mb-3">勾选要清除的内容，点「执行清除」后仍有二次确认。账号、班级结构、导航等核心设置不会被清除。</p>
    <div class="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
      ${CLEAR_GROUPS.map(g => `
        <div>
          <div class="text-xs font-semibold text-gray-500 mb-1">${g.title}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">${rows(g)}</div>
        </div>`).join('')}
    </div>
    <div class="flex gap-2 mt-4">
      <button class="flex-1 border py-2 rounded-full" onclick="closeModal()">取消</button>
      <button class="flex-1 bg-red-500 text-white py-2 rounded-full hover:bg-red-600" onclick="confirmClearData()">执行清除</button>
    </div>`;
  openModal('清理数据', body, 'lg');
}

function confirmClearData() {
  const sel = [].slice.call(document.querySelectorAll('#modal-root .cd-chk:checked')).map(i => i.value);
  if (!sel.length) { alert('请至少选择一项要清除的内容'); return; }
  const labelOf = {};
  CLEAR_GROUPS.forEach(g => g.items.forEach(it => labelOf[it.k] = it.label));
  const list = sel.map(k => labelOf[k]).join('、');
  confirmModal('将清除以下数据（不可恢复，建议先导出备份）：' + list + '。固定设置（账号/班级/积分规则等）不会被清除。确定？', function () {
    applyClearData(sel);
    closeModal();
  });
}

// ===================== Modal =====================
function openModal(title, body, size='md') {
  const width = size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-sm' : 'max-w-lg';
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-bg fixed inset-0 z-50 flex items-center justify-center p-4" onclick="if(event.target===this) closeModal()">
      <div class="bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[90vh] overflow-hidden flex flex-col" onclick="event.stopPropagation()">
        <div class="px-6 py-4 border-b flex items-center justify-between"><h3 class="font-bold text-gray-800">${esc(title)}</h3><button data-lock-allow class="text-gray-400 hover:text-gray-600 text-xl" onclick="closeModal()">&times;</button></div>
        <div class="p-6 overflow-y-auto">${body}</div>
      </div>
    </div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// ===================== 职务与值日管理 =====================
const pmDays = ['周一','周二','周三','周四','周五'];
const pmDutyTasks = ['黑板（全部）','室内走廊','垃圾桶','室外走廊（含窗台）','拖地'];
let pmTab = 'roles';
let pmRolesEdit = false;
let curCtx = { mode:'role', key:null, day:null, task:null };
let pmDescId = null;
let pmTreeDragId = null;
let pmStatsSort = 'count';

function pmStudentNames(){ return (state.students||[]).filter(s=>s&&s.name&&s.class===state.headTeacherClass).map(s=>s.name); }
function pmStudentIdByName(name){ const s=(state.students||[]).find(x=>x.name===name&&x.class===state.headTeacherClass); return s?s.id:null; }
function pmHeadClassStudentSet(){ return new Set(pmStudentNames()); }
function pmSortPriority(a,b){
  const ap=(a.pts!=null||a.seat!=null)?1:0;
  const bp=(b.pts!=null||b.seat!=null)?1:0;
  if(bp!==ap) return bp-ap;
  return 0;
}
function pmRefreshAll(){ const b=document.getElementById('pm-body'); if(b) b.innerHTML=pmRenderTab(pmTab); }

/* ===== 页面框架 ===== */
function renderPositions(){
  const segs=[['roles','职务架构'],['duty','值日生'],['kedaibiao','课代表'],['dutymonitor','值日班长轮值'],['points','职务积分'],['tree','职务树'],['deduct','关联扣分'],['stats','任职统计']];
  const segHtml=segs.map(([id,label])=>`<button class="pm-seg px-4 py-2 rounded-lg text-sm font-medium ${pmTab===id?'active':'text-slate-600 hover:bg-slate-100'}" data-pmtab="${id}" onclick="pmSwitch('${id}')">${label}</button>`).join('');
  return `<div>
    <div class="flex gap-1 mb-5 bg-white p-1 rounded-xl shadow-sm w-fit">${segHtml}</div>
    <div id="pm-body">${pmRenderTab(pmTab)}</div>
  </div>`;
}
function pmRenderTab(tab){
  if(tab==='duty') return pmRenderDuty();
  if(tab==='kedaibiao') return pmRenderKedaibiao();
  if(tab==='dutymonitor') return pmRenderDutyMonitor();
  if(tab==='points') return pmRenderPoints();
  if(tab==='tree') return pmRenderTree();
  if(tab==='deduct') return pmRenderDeduct();
  if(tab==='stats') return pmRenderStats();
  return pmRenderRoles();
}
function pmSwitch(tab){
  pmTab=tab;
  const body=document.getElementById('pm-body');
  if(body) body.innerHTML=pmRenderTab(tab);
  document.querySelectorAll('.pm-seg').forEach(b=>{ const on=b.getAttribute('data-pmtab')===tab; b.className='pm-seg px-4 py-2 rounded-lg text-sm font-medium '+(on?'active':'text-slate-600 hover:bg-slate-100'); });
}

/* ===== 任职统计 ===== */
function pmStatsSetSort(s){ pmStatsSort=s; pmRefreshAll(); }
function pmRenderStats(){
  const P = (state.positions && typeof state.positions==='object') ? state.positions : defaultPositions();
  const names = pmStudentNames();
  // 统计每个人的现有职务：职务架构中的职务 + 课代表 + 值日任务（值日按实际排表天数计数，同一任务排几天计几次，芯片标注 ×天数）
  const rows = names.map(name=>{
    const pos=[];
    let cnt=0;
    (P.structure||[]).forEach(r=>{ if((P.assign[r.id]||[]).indexOf(name)>=0){ pos.push(r.name); cnt++; } });
    (P.representatives||[]).forEach(r=>{ if((r.names||[]).indexOf(name)>=0){ pos.push(r.subject+'课代表'); cnt++; } });
    const dutyCnt={};
    pmDays.forEach(d=>{ pmDutyTasks.forEach(t=>{ const arr=((P.dutyWeekly&&P.dutyWeekly[d]&&P.dutyWeekly[d][t])||[]); if(arr.indexOf(name)>=0){ dutyCnt[t]=(dutyCnt[t]||0)+1; } }); });
    Object.keys(dutyCnt).forEach(t=>{ pos.push('值日·'+t+(dutyCnt[t]>1?(' ×'+dutyCnt[t]):'')); cnt+=dutyCnt[t]; });
    return { name, pos, count:cnt };
  });
  if(pmStatsSort==='count') rows.sort((a,b)=> b.count-a.count || a.name.localeCompare(b.name,'zh'));
  else rows.sort((a,b)=> a.name.localeCompare(b.name,'zh') || b.count-a.count);
  const withPos = rows.filter(r=>r.count>0).length;
  const totalPos = rows.reduce((s,r)=>s+r.count,0);
  let html=`<div class="flex flex-wrap items-center justify-between gap-2 mb-3">
    <div class="text-sm font-semibold text-slate-600">共 ${rows.length} 人，其中 ${withPos} 人任职（合计 ${totalPos} 个职务）</div>
    <div class="flex gap-2">
      <button class="text-sm border rounded-lg px-3 py-1.5 ${pmStatsSort==='count'?'bg-indigo-600 text-white':'hover:bg-gray-50'}" onclick="pmStatsSetSort('count')">按职务数量</button>
      <button class="text-sm border rounded-lg px-3 py-1.5 ${pmStatsSort==='name'?'bg-indigo-600 text-white':'hover:bg-gray-50'}" onclick="pmStatsSetSort('name')">按姓名</button>
    </div>
  </div>`;
  html+=`<div class="bg-white rounded-2xl shadow-sm overflow-x-auto">
    <table class="w-full text-sm">
      <thead><tr class="bg-slate-50 text-slate-500"><th class="text-left p-3 font-medium whitespace-nowrap">姓名</th><th class="text-left p-3 font-medium w-20 whitespace-nowrap">职务数</th><th class="text-left p-3 font-medium">现有职务</th></tr></thead>
      <tbody>`;
  rows.forEach(r=>{
    const chips = r.pos.length ? r.pos.map(p=>`<span class="inline-flex items-center bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full border border-indigo-200 mr-1 mb-1">${esc(p)}</span>`).join('') : '<span class="text-slate-300">暂无职务</span>';
    html+=`<tr class="border-b border-slate-100">
      <td class="p-3 font-medium text-slate-700 whitespace-nowrap">${esc(r.name)}</td>
      <td class="p-3"><span class="inline-block min-w-[24px] text-center rounded-full ${r.count?'bg-indigo-100 text-indigo-700':'text-slate-300'} text-xs px-2 py-0.5">${r.count}</span></td>
      <td class="p-3">${chips}</td>
    </tr>`;
  });
  html+=`</tbody></table></div>
  <p class="text-xs text-slate-400 mt-3">统计范围：职务架构中的职务 + 课代表 + 值日任务（值日按实际排表天数计数，同一任务排几天就计几次，芯片标注 ×天数）。在「职务架构」「课代表」「值日生」中增删后会自动更新；按职务数量排列时同数量按姓名排序。</p>`;
  return html;
}

/* ===== 职务架构 ===== */
function pmChip(n,i,onRemove){ return `<span class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-full border border-indigo-200" onclick="${onRemove}">${esc(n)}<span class="text-indigo-400">×</span></span>`; }
function pmRenderRoles(){
  // 职务结构兜底：旧备份 / 导入可能让 positions 整块为 null 或 structure 不是数组
  let P = (state.positions && typeof state.positions === 'object') ? state.positions : null;
  if (!P) { try { P = state.positions = defaultPositions(); } catch (e) { return '<div class="text-sm text-gray-400">职务数据异常，请到「设置 → 重置职务数据」恢复。</div>'; } }
  if (!Array.isArray(P.structure)) P.structure = [];
  const list=P.structure.slice().sort(pmSortPriority);
  let html=`<div class="flex items-center justify-between mb-3">
    <div class="text-sm font-semibold text-slate-600">共 ${list.length} 个职务</div>
    <div class="flex items-center gap-2">
      ${pmRolesEdit?`<button class="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700" onclick="pmAddPosition()">＋ 添加职务</button>`:''}
      <button class="text-sm border rounded-lg px-3 py-1.5 hover:bg-gray-50" onclick="pmToggleRolesEdit()">${pmRolesEdit?'完成':'修改'}</button>
    </div>
  </div>`;
  html+=`<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">`;
  const headSet=pmHeadClassStudentSet();
  list.forEach(p=>{
    const names=(P.assign[p.id]||[]).filter(n=>headSet.has(n));
    const extra=p.pts!=null?('日积 '+p.pts):'';
    const delBtn=pmRolesEdit?`<button class="text-[11px] text-red-500 hover:text-red-700 ml-2" onclick="pmDeletePosition('${p.id}')">删除</button>`:'';
    html+=`<div class="bg-white rounded-2xl shadow-sm p-4 border-l-4 ${p.group==='学生会'?'border-purple-400':'border-indigo-400'}">
      <div class="flex items-start justify-between">
        <div>
          <div class="font-bold text-slate-800 flex items-center gap-2">${esc(p.name)}<span class="text-xs text-slate-400 font-normal bg-slate-50 px-1.5 py-0.5 rounded">${names.length}人</span></div>
          <div class="text-[11px] text-slate-400 mt-0.5">${esc(p.req)}</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-[11px] text-slate-400 hover:text-indigo-600" onclick="pmOpenDescEdit('${p.id}')">编辑</button>
          ${delBtn}
          <div class="text-[11px] text-amber-600 whitespace-nowrap">${extra||'—'}</div>
        </div>
      </div>
      <ul class="text-[11px] text-slate-500 list-disc pl-4 mt-2 space-y-0.5 min-h-[38px]">${p.duties.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
      <div class="flex flex-wrap gap-1.5 mt-3 items-center">
        ${names.map((n,i)=>pmChip(n,i,`pmRemoveRole('${p.id}',${esc(JSON.stringify(n))})`)).join('')}
        <span class="inline-flex items-center bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full border border-dashed border-slate-300 cursor-pointer" onclick="pmOpenAdd('${p.id}')">＋</span>
      </div>
    </div>`;
  });
  html+=`</div>`;
  // 课代表也作为班级职务在架构页展示，可直接增删人员
  const reps=P.representatives||[];
  if(reps.length){
    html+=`<div class="flex items-center justify-between mb-3 mt-2">
      <div class="text-sm font-semibold text-slate-600">课代表（可在「课代表」标签页调整科目）</div>
    </div>`;
    html+=`<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">`;
    reps.forEach(r=>{
      const names=r.names||[];
      const extra=r.pts!=null?('日积 '+r.pts):'';
      html+=`<div class="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-sky-400">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-bold text-slate-800 flex items-center gap-2">${esc(r.subject)}<span class="text-xs text-slate-400 font-normal bg-slate-50 px-1.5 py-0.5 rounded">${names.length}人</span></div>
            <div class="text-[11px] text-slate-400 mt-0.5">每科课代表</div>
          </div>
          <div class="text-[11px] text-amber-600 whitespace-nowrap">${extra||'—'}</div>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-3 items-center min-h-[2rem]">
          ${names.map((n,i)=>`<span class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-full border border-indigo-200 cursor-pointer" onclick="pmRemoveRepName('${r.id}',${i})">${esc(n)}<span class="text-indigo-400">×</span></span>`).join('')}
          <span class="inline-flex items-center bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full border border-dashed border-slate-300 cursor-pointer" onclick="pmOpenAddRep('${r.id}')">＋</span>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }
  return html;
}
function pmToggleRolesEdit(){ pmRolesEdit=!pmRolesEdit; pmRefreshAll(); }
function pmAddPosition(){
  const name=prompt('请输入新职务名称：'); if(!name||!name.trim()) return;
  const id='pos_'+Date.now();
  state.positions.structure.push({id:id,name:name.trim(),group:'班委',count:1,pts:null,seat:null,duties:[],req:''});
  state.positions.assign[id]=[];
  save(); pmRefreshAll();
}
function pmDeletePosition(id){
  if(!confirm('确定删除这个职务吗？')) return;
  (state.positions.assign[id]||[]).forEach(n=>markDeletedVal('positions.assign.'+id, n));
  state.positions.structure=state.positions.structure.filter(p=>p.id!==id);
  markDeletedId('positions.structure', id);
  delete state.positions.assign[id];
  save(); pmRefreshAll();
}
// 按「姓名」移除任职（旧实现按下标删除：页面上的 names 是「只保留本班学生」的过滤结果，
// 下标与源数组 assign[id] 不一致 —— 只要有人已不在本班，就会删掉另一个无辜同学）
function pmRemoveRole(id, name){
  const arr = state.positions.assign[id];
  if (!Array.isArray(arr)) return pmRefreshAll();
  const idx = arr.indexOf(name);
  if (idx < 0) return pmRefreshAll();      // 已被别人改过，直接重画即可
  arr.splice(idx, 1); markDeletedVal('positions.assign.' + id, name); save(); pmRefreshAll();
}
function pmOpenDescEdit(id){
  const p=state.positions.structure.find(x=>x.id===id); if(!p) return;
  pmDescId=id;
  openModal('编辑职务 · '+p.name, `
    <div class="space-y-3">
      <div><label class="block text-xs text-gray-500 mb-1">任职要求</label><input id="pmDescReq" class="w-full border rounded-lg p-2 text-sm" value="${esc(p.req||'')}"></div>
      <div><label class="block text-xs text-gray-500 mb-1">职责（每行一条）</label><textarea id="pmDescDuties" class="w-full border rounded-lg p-2 text-sm" rows="5">${esc((p.duties||[]).join('\n'))}</textarea></div>
      <button class="w-full bg-primary text-white py-2 rounded-full text-sm" onclick="pmSaveDescEdit()">保存</button>
    </div>`);
}
function pmSaveDescEdit(){
  const p=state.positions.structure.find(x=>x.id===pmDescId); if(!p) return;
  p.req=document.getElementById('pmDescReq').value.trim();
  const raw=document.getElementById('pmDescDuties').value.trim();
  p.duties=raw?raw.split('\n').map(s=>s.trim()).filter(Boolean):[];
  closeModal(); save(); pmRefreshAll();
}

/* ===== 添加成员弹窗（职务 / 值日生共用） ===== */
function pmOpenAdd(id){
  curCtx={mode:'role',key:id,day:null,task:null};
  const p=state.positions.structure.find(x=>x.id===id);
  openModal('添加成员 · '+(p?p.name:id), `
    <div class="text-xs text-gray-400 mb-2" id="pmAssignHint"></div>
    <div id="pmAssignBody" class="grid grid-cols-3 sm:grid-cols-4 gap-2"></div>
    <div class="flex justify-end mt-4"><button class="bg-primary text-white px-4 py-2 rounded-full text-sm" onclick="closeModal()">完成</button></div>`);
  pmBuildAssignBody((state.positions.assign[id]||[]).slice());
}
function pmOpenAddDuty(day,task){
  curCtx={mode:'duty',key:null,day:day,task:task};
  openModal('添加值日生 · '+day+' · '+task, `
    <div class="text-xs text-gray-400 mb-2" id="pmAssignHint"></div>
    <div id="pmAssignBody" class="grid grid-cols-3 sm:grid-cols-4 gap-2"></div>
    <div class="flex justify-end mt-4"><button class="bg-primary text-white px-4 py-2 rounded-full text-sm" onclick="closeModal()">完成</button></div>`);
  pmBuildAssignBody(((state.positions.dutyWeekly[day]&&state.positions.dutyWeekly[day][task])||[]).slice());
}
function pmBuildAssignBody(selected){
  const set=new Set(selected.filter(Boolean));
  const hint=document.getElementById('pmAssignHint'); if(hint) hint.textContent='已选 '+set.size+' 人';
  const body=document.getElementById('pmAssignBody'); if(!body) return;
  const names=pmStudentNames();
  if(!names.length){ body.innerHTML='<div class="col-span-full text-sm text-gray-400">请先在「学生管理」录入学生</div>'; return; }
  body.innerHTML=names.map(n=>{
    const on=set.has(n);
    return `<div class="px-3 py-2 rounded-lg border text-sm text-center ${on?'bg-indigo-600 text-white border-indigo-600':'bg-gray-50 text-gray-700 border-gray-200 cursor-pointer'}" onclick="pmToggleStu('${esc(n)}')">${esc(n)}</div>`;
  }).join('');
}
function pmToggleStu(name){
  let cur;
  if(curCtx.mode==='role') cur=(state.positions.assign[curCtx.key]||[]).slice();
  else if(curCtx.mode==='rep'){
    const r=state.positions.representatives.find(x=>x.id===curCtx.key); cur=(r&&r.names?r.names:[]).slice();
  }
  else cur=((state.positions.dutyWeekly[curCtx.day]&&state.positions.dutyWeekly[curCtx.day][curCtx.task])||[]).slice();
  const i=cur.indexOf(name);
  if(i>=0){ cur.splice(i,1); if(curCtx.mode==='role') markDeletedVal('positions.assign.'+curCtx.key, name); } else cur.push(name);
  if(curCtx.mode==='role') state.positions.assign[curCtx.key]=cur;
  else if(curCtx.mode==='rep'){
    const r=state.positions.representatives.find(x=>x.id===curCtx.key); if(r) r.names=cur; pmSyncKedaibiaoAssign();
  }
  else state.positions.dutyWeekly[curCtx.day][curCtx.task]=cur;
  pmBuildAssignBody(cur);
  save(); pmRefreshAll();
}

/* ===== 值日生轮换 ===== */
function pmDutyPosCount(name){
  // 与「任职统计」前半段口径一致：职务架构中的职务 + 课代表（不含值日，值日单独计 runDuty）
  const P=state.positions; let c=0;
  (P.structure||[]).forEach(r=>{ if((P.assign[r.id]||[]).indexOf(name)>=0) c++; });
  (P.representatives||[]).forEach(r=>{ if((r.names||[]).indexOf(name)>=0) c++; });
  return c;
}
function pmAutoDuty(){
  const P=state.positions;
  const names=pmStudentNames();
  // 不清空已有排表：仅确保结构存在
  if(!P.dutyWeekly||typeof P.dutyWeekly!=='object') P.dutyWeekly={};
  pmDays.forEach(d=>{ P.dutyWeekly[d]=P.dutyWeekly[d]||{}; pmDutyTasks.forEach(t=>{ if(!Array.isArray(P.dutyWeekly[d][t])) P.dutyWeekly[d][t]=[]; }); });
  // 每种任务每槽最多人数（默认 1），仅约束自动排表，不删你已经排好的
  const maxOf=t=>{ const v=(P.dutyTaskMax&&typeof P.dutyTaskMax[t]==='number')?P.dutyTaskMax[t]:1; return v>=1?v:1; };
  // 运行中的值日计数（含已有排表），用于均衡负载，避免同一人被排满
  const runDuty={}; names.forEach(n=>{ runDuty[n]=0; });
  pmDays.forEach(d=>{ pmDutyTasks.forEach(t=>{ (P.dutyWeekly[d][t]||[]).forEach(n=>{ if(runDuty[n]!=null) runDuty[n]++; }); }); });
  // 静态职务数量：优先排职务数量少的学生
  const posCnt={}; names.forEach(n=>{ posCnt[n]=pmDutyPosCount(n); });
  // 遍历所有待补槽位（天×任务 稳定顺序），每个槽补到 max，但绝不删已有
  const slots=[]; pmDays.forEach(d=>{ pmDutyTasks.forEach(t=>{ slots.push([d,t]); }); });
  slots.forEach(([d,t])=>{
    const cur=P.dutyWeekly[d][t]; const max=maxOf(t); const need=max-cur.length;
    if(need<=0) return;
    const inSlot=new Set(cur);
    const cands=names.filter(n=>!inSlot.has(n)).map(n=>({n,key:posCnt[n]+runDuty[n]})).sort((a,b)=>a.key-b.key||a.n.localeCompare(b.n,'zh')).slice(0,need);
    cands.forEach(c=>{ P.dutyWeekly[d][t].push(c.n); runDuty[c.n]++; });
  });
  save(); pmRefreshAll();
  toast('已自动补排：保留你已排好的，空缺处优先安排职务数量少的学生');
}
function pmRenderDuty(){
  const P=state.positions;
  if(!P.dutyWeekly||!Object.keys(P.dutyWeekly).length){
    P.dutyWeekly={}; pmDays.forEach(d=>{ P.dutyWeekly[d]={}; pmDutyTasks.forEach(t=>{ P.dutyWeekly[d][t]=[]; }); });
  }
  let html=`<div class="bg-white rounded-2xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-3">
      <div class="font-bold text-slate-700">值日生轮换（周一~周五 × 任务）</div>
      <div class="flex gap-2">
        <button class="text-sm border rounded-lg px-3 py-1.5 hover:bg-gray-50" onclick="pmExportDutyXlsx()">⬇ 导出 Excel</button>
        <button class="text-sm bg-sky-600 text-white rounded-lg px-3 py-1.5 hover:bg-sky-700" onclick="pmAutoDuty()">⚡ 自动排表</button>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-xs text-slate-500">
      <span class="font-medium text-slate-600">每槽最多人数（自动排表上限）：</span>
      ${pmDutyTasks.map(t=>{ const v=(P.dutyTaskMax&&typeof P.dutyTaskMax[t]==='number')?P.dutyTaskMax[t]:1; return `<label class="flex items-center gap-1">${esc(t)}<input type="number" min="1" value="${v}" onchange="pmSetDutyMax('${esc(t)}',this.value)" class="inline-input w-12 text-center"></label>`; }).join('')}
    </div>
    <div class="overflow-x-auto"><table class="w-full text-sm border-collapse">
      <thead><tr class="bg-slate-50"><th class="text-left p-2 font-medium text-slate-500">任务 / 日</th>${pmDays.map(d=>`<th class="p-2 font-medium text-slate-500">${d}</th>`).join('')}</tr></thead>
      <tbody>`;
  const headSet=pmHeadClassStudentSet();
  pmDutyTasks.forEach(t=>{
    html+=`<tr><td class="p-3 font-medium text-slate-600 bg-slate-50 whitespace-nowrap">${t}</td>`;
    pmDays.forEach(d=>{
      const names=((P.dutyWeekly[d]&&P.dutyWeekly[d][t])||[]).filter(n=>headSet.has(n));
      const editing=P.dutyEditMode[d]&&P.dutyEditMode[d][t];
      const nameRows=names.length?names.map((n,i)=>`<div class="name-col"><span class="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-sm px-2.5 py-1 rounded border border-sky-200 cursor-pointer" onclick="pmRemoveDuty('${d}','${t}',${i})">${esc(n)}<span class="text-sky-400">×</span></span></div>`).join(''):`<div class="name-col"><span class="text-slate-300 text-sm">空</span></div>`;
      const addRow=editing?`<div class="name-col"><span class="inline-flex items-center justify-center bg-slate-100 text-slate-500 text-sm px-2 py-1 rounded border border-dashed border-slate-300 cursor-pointer" onclick="pmOpenAddDuty('${d}','${t}')">＋</span></div>`:'';
      const toggle=`<div class="edit-toggle" onclick="pmToggleDutyEdit('${d}','${t}')">${editing?'完成':'修改'}</div>`;
      html+=`<td class="border cell-edit duty-cell">${nameRows}${addRow}${toggle}</td>`;
    });
    html+=`</tr>`;
  });
  html+=`</tbody></table></div>
    <p class="text-xs text-slate-400 mt-3">点击任意格子可添加成员；点姓名上的 × 删除；每天人数随成员增减自动变化。<br>「⚡ 自动排表」会保留你已排好的，仅在空缺处补人，并优先安排职务数量少的学生；每种任务每槽最多人数见上方设置。</p>
  </div>`;
  return html;
}
function pmRemoveDuty(day,task,i){ const _nm=state.positions.dutyWeekly[day][task][i]; state.positions.dutyWeekly[day][task].splice(i,1); markDeletedVal('positions.dutyWeekly.'+day+'.'+task, _nm); save(); pmRefreshAll(); }
function pmToggleDutyEdit(day,task){ state.positions.dutyEditMode[day]=state.positions.dutyEditMode[day]||{}; state.positions.dutyEditMode[day][task]=!state.positions.dutyEditMode[day][task]; pmRefreshAll(); }
function pmSetDutyMax(task,val){ const P=state.positions; P.dutyTaskMax=P.dutyTaskMax||{}; const v=parseInt(val,10); P.dutyTaskMax[task]=(v>=1)?v:1; save(); pmRefreshAll(); }
function pmExportDutyXlsx(){
  if(typeof XLSX==='undefined'){ return alert('导出组件未加载，请刷新后重试'); }
  const P=state.positions;
  const headSet=pmHeadClassStudentSet();
  const rows=[['值日生'].concat(pmDays)];
  pmDutyTasks.forEach(t=>{ rows.push([t].concat(pmDays.map(d=>{ const ns=((P.dutyWeekly[d]&&P.dutyWeekly[d][t])||[]).filter(n=>headSet.has(n)); return ns.join('、'); }))); });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'值日生安排');
  XLSX.writeFile(wb,'值日生安排.xlsx');
}

/* ===== 值日班长轮值自动生成 ===== */
// 国家标准法定节假日（含调休）。off=放假日(跳过)；work=调休补课/上班的周末(学生到校，不跳过)。
// 2026 采用国务院办公厅正式通知（国办发明电〔2025〕7号，2025-11-04 发布）。
// 2027 为国办尚未公布前的估算，正式通知发布后请按官方更新。格式：'MM-DD'。
const NATIONAL_HOLIDAYS = {
  '2026': {
    off: ['01-01','01-02','01-03','02-15','02-16','02-17','02-18','02-19','02-20','02-21','02-22','02-23','04-04','04-05','04-06','05-01','05-02','05-03','05-04','05-05','06-19','06-20','06-21','09-25','09-26','09-27','10-01','10-02','10-03','10-04','10-05','10-06','10-07'],
    work: ['01-04','02-14','02-28','05-09','09-20','10-10']
  },
  '2027': {
    off: ['01-01','01-02','01-03','02-04','02-05','02-06','02-07','02-08','02-09','02-10','02-11','02-12','04-03','04-04','04-05','05-01','05-02','05-03','05-04','05-05','06-09','09-15','10-01','10-02','10-03','10-04','10-05','10-06','10-07'],
    work: []  // 2027 调休补课日尚未公布，待国办通知后补充（暂无则全部周末默认跳过）
  }
};
// 该日期是否「学生不到校」：法定节假日 / 周末(非调休补课)。到校的调休补课日返回 false。
function isSchoolOff(dt){
  const y = String(dt.getFullYear());
  const md = ('0'+(dt.getMonth()+1)).slice(-2)+'-'+('0'+dt.getDate()).slice(-2);
  const tbl = NATIONAL_HOLIDAYS[y];
  if(tbl){
    if(tbl.work.indexOf(md) >= 0) return false; // 调休补课，到校
    if(tbl.off.indexOf(md) >= 0) return true;    // 法定节假日
  }
  const wd = dt.getDay();
  if((wd === 0 || wd === 6) && (!tbl || tbl.work.indexOf(md) < 0)) return true; // 周末默认放假
  return false;
}

function pmRenderDutyMonitor(){
  const P=state.positions;
  const rota=P.dutyRota||{};
  const todayKey=new Date().toISOString().slice(0,10);
  let html=`<div class="bg-white rounded-2xl shadow-sm p-5 space-y-4">
    <div class="font-bold text-slate-700">🗓️ 值日班长轮值自动生成</div>
    <p class="text-xs text-slate-400">按班级学生顺序自动轮值，每 N 天换一人，生成后可一键保存。</p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div><label class="block text-xs text-gray-500 mb-1">起始日期</label><input id="dmStart" type="date" value="${rota.startDate||todayKey}" class="w-full border rounded-lg p-2 text-sm"></div>
      <div><label class="block text-xs text-gray-500 mb-1">每位任期(天)</label><input id="dmStep" type="number" min="1" value="${rota.stepDays||1}" class="w-full border rounded-lg p-2 text-sm"></div>
      <div><label class="block text-xs text-gray-500 mb-1">轮值天数（到校日）</label><input id="dmSpan" type="number" min="1" value="${rota.spanDays||30}" class="w-full border rounded-lg p-2 text-sm"></div>
      <div><label class="block text-xs text-gray-500 mb-1">轮值人员</label>
        <select id="dmScope" class="w-full border rounded-lg p-2 text-sm">
          <option value="all" ${(rota.scope||'all')!=='banwei'?'selected':''}>全班学生</option>
          <option value="banwei" ${(rota.scope||'all')==='banwei'?'selected':''}>仅班委</option>
        </select>
      </div>
    </div>
    <label class="flex items-center gap-2 text-xs text-gray-500">
      <input id="dmSkipOff" type="checkbox" ${rota.skipOff!==false?'checked':''} class="accent-indigo-600"> 跳过周末与法定节假日（按国家标准休假，不排到校日之外）
    </label>
    <div class="flex gap-2">
      <button class="bg-indigo-600 text-white px-4 py-2 rounded-full text-sm hover:bg-indigo-700" onclick="pmGenDutyMonitor()">⚡ 生成预览</button>
      ${rota.schedule&&rota.schedule.length?`<button class="border px-4 py-2 rounded-full text-sm hover:bg-gray-50" onclick="pmSaveDutyMonitor()">💾 保存轮值表</button>`:''}
    </div>
    <div id="dmPreview"></div>
  </div>`;
  if(rota.schedule&&rota.schedule.length){
    html+=`<div class="mt-2 overflow-x-auto"><table class="w-full text-sm border-collapse"><thead><tr class="bg-slate-50"><th class="text-left p-2 font-medium text-slate-500">日期</th><th class="text-left p-2 font-medium text-slate-500">值日班长</th></tr></thead><tbody>`;
    rota.schedule.forEach(r=>{ html+=`<tr><td class="p-2 border">${r.date}</td><td class="p-2 border">${esc(r.name)}</td></tr>`; });
    html+=`</tbody></table></div><p class="text-xs text-slate-400 mt-2">共 ${rota.schedule.length} 天轮值；保存后此表会随数据持久化，可随时回看或重新生成。</p>`;
  }
  return html;
}
function pmDutyMonitorMembers(){
  const scope=(document.getElementById('dmScope')?document.getElementById('dmScope').value:'all');
  const all=pmStudentNames();
  if(scope==='banwei'){
    const headSet=pmHeadClassStudentSet();
    const officers=new Set();
    state.positions.structure.forEach(p=>{ if(p.category==='班委'){ (state.positions.assign[p.id]||[]).forEach(n=>{ if(headSet.has(n)) officers.add(n); }); } });
    return all.filter(n=>officers.has(n));
  }
  return all;
}
function pmGenDutyMonitor(){
  const start=(document.getElementById('dmStart').value)||attDateKey(new Date());
  const step=Math.max(1, parseInt(document.getElementById('dmStep').value)||1);
  const span=Math.max(1, parseInt(document.getElementById('dmSpan').value)||30);
  const scope=document.getElementById('dmScope').value;
  const skipOff=document.getElementById('dmSkipOff')?document.getElementById('dmSkipOff').checked:true;
  const members=pmDutyMonitorMembers();
  if(!members.length){ alert('当前班级没有可选学生，请先在「学生管理」录入'); return; }
  const schedule=[]; let mi=0;
  const dt=new Date(start+'T00:00:00');
  let offSkipped=0;
  while(schedule.length<span){
    const dateKey=attDateKey(dt);
    if(!skipOff || !isSchoolOff(dt)){
      schedule.push({date:dateKey, name:members[mi%members.length]});
      mi++;
    } else {
      offSkipped++;
    }
    dt.setDate(dt.getDate()+step);
  }
  state.positions.dutyRota={startDate:start, stepDays:step, spanDays:span, scope, skipOff, schedule};
  pmRefreshAll();
  toast('已生成 '+schedule.length+' 天轮值预览'+(skipOff&&offSkipped?('（已跳过 '+offSkipped+' 个放假/周末日）'):''));
}
function pmSaveDutyMonitor(){
  if(!state.positions.dutyRota||!state.positions.dutyRota.schedule||!state.positions.dutyRota.schedule.length){ return toast('请先生成预览'); }
  save();
  toast('值日班长轮值表已保存');
}

/* ===== 课代表（按科目管理） ===== */
function pmSyncKedaibiaoAssign(){
  const headSet=pmHeadClassStudentSet();
  const all=[];
  (state.positions.representatives||[]).forEach(r=>{(r.names||[]).forEach(n=>{if(headSet.has(n)&&!all.includes(n)) all.push(n);});});
  state.positions.assign.kedaibiao=all;
}
// 把课代表各科同步到职务树（kedaibiao 节点下挂各科子节点）并维护关联扣分关键词
function pmSyncRepTree(positions){
  const P = positions || state.positions;
  const kb = P.dutyTree && pmFindTreeNode(P.dutyTree, 'kedaibiao');
  if (!kb) return;
  const reps = P.representatives || [];
  kb.children = reps.map(r => ({
    id: r.id,
    label: r.subject,
    repId: r.id
  }));
  if (!P.deductionKeywords || typeof P.deductionKeywords !== 'object') P.deductionKeywords = {};
  const validRepIds = new Set(reps.map(r => r.id));
  for (const id in P.deductionKeywords) {
    if (id.startsWith('rep_') && !validRepIds.has(id)) delete P.deductionKeywords[id];
  }
  reps.forEach(r => {
    P.deductionKeywords[r.id] = [r.subject, r.subject + '课代表', r.subject + '代表'];
  });
}
function pmRenderKedaibiao(){
  const reps=state.positions.representatives||[];
  return `<div class="bg-white rounded-2xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-slate-700">课代表（按科目）</div>
      <button class="text-sm bg-sky-600 text-white rounded-lg px-3 py-1.5 hover:bg-sky-700" onclick="pmAddRepSubject()">＋ 添加科目</button>
    </div>
    <div class="space-y-3">${reps.length?reps.map(r=>pmRepRow(r)).join(''):'<div class="text-sm text-slate-400">暂无科目，点击上方按钮添加</div>'}</div>
    <p class="text-xs text-slate-400 mt-4">人数仅作标记；成员数量可自由增减。保存后会同步到「职务树」的课代表节点。</p>
  </div>`;
}
function pmRepRow(r){
  const headSet=pmHeadClassStudentSet();
  const names=(r.names||[]).filter(n=>headSet.has(n));
  return `<div class="border rounded-xl p-4 bg-slate-50">
    <div class="flex flex-wrap items-center gap-3 mb-2">
      <input class="flex-1 min-w-[6rem] border rounded-lg p-2 text-sm font-medium" value="${esc(r.subject)}" onchange="pmUpdateRepSubject('${r.id}','subject',this.value)">
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500">人数</span>
        <input type="number" min="0" class="w-20 border rounded-lg p-2 text-sm" value="${r.count==null?1:r.count}" onchange="pmUpdateRepSubject('${r.id}','count',this.value)">
      </div>
      <button class="text-xs text-red-500 hover:underline px-2" onclick="pmRemoveRepSubject('${r.id}')">删除</button>
    </div>
    <div class="flex flex-wrap gap-2 items-center min-h-[2rem]">
      ${names.length?names.map((n,i)=>`<span class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-full border border-indigo-200 cursor-pointer" onclick="pmRemoveRepName('${r.id}',${i})">${esc(n)}<span class="text-indigo-400">×</span></span>`).join(''):'<span class="text-xs text-slate-400">未安排学生</span>'}
      <span class="inline-flex items-center justify-center bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full border border-dashed border-slate-300 cursor-pointer" onclick="pmOpenAddRep('${r.id}')">＋</span>
    </div>
  </div>`;
}
function pmAddRepSubject(){
  const name=prompt('请输入新科目名称：'); if(!name||!name.trim()) return;
  state.positions.representatives.push({ id:'rep_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5), subject:name.trim(), count:1, pts:null, names:[] });
  pmSyncRepTree(); pmSyncKedaibiaoAssign(); save(); pmRefreshAll();
}
function pmRemoveRepSubject(id){
  if(!confirm('确定删除这个科目吗？')) return;
  state.positions.representatives=state.positions.representatives.filter(r=>r.id!==id);
  pmSyncRepTree(); pmSyncKedaibiaoAssign(); save(); pmRefreshAll();
}
function pmUpdateRepSubject(id,field,value){
  const r=state.positions.representatives.find(x=>x.id===id); if(!r) return;
  if(field==='subject') r.subject=value.trim();
  if(field==='count'){ const v=parseInt(value,10); r.count=isNaN(v)?1:v; }
  pmSyncRepTree(); save(); pmRefreshAll();
}
function pmRemoveRepName(id,idx){
  const r=state.positions.representatives.find(x=>x.id===id); if(!r||!r.names) return;
  const _nm=r.names[idx]; r.names.splice(idx,1); markDeletedVal('positions.representatives.names', _nm);
  pmSyncKedaibiaoAssign(); save(); pmRefreshAll();
}
function pmOpenAddRep(id){
  curCtx={mode:'rep',key:id,day:null,task:null};
  const r=state.positions.representatives.find(x=>x.id===id);
  openModal('添加课代表 · '+(r?r.subject:''), `
    <div class="text-xs text-gray-400 mb-2" id="pmAssignHint"></div>
    <div id="pmAssignBody" class="grid grid-cols-3 sm:grid-cols-4 gap-2"></div>
    <div class="flex justify-end mt-4"><button class="bg-primary text-white px-4 py-2 rounded-full text-sm" onclick="closeModal()">完成</button></div>`);
  pmBuildAssignBody((r&&r.names?r.names:[]).slice());
}

/* ===== 职务积分 ===== */
function pmPointRow(p){
  const catOpts=['班委','非班委','课代表'].map(c=>`<option value="${c}" ${p.category===c?'selected':''}>${c}</option>`).join('');
  return `<tr><td class="p-2 font-medium">${esc(p.name)}</td><td class="p-2"><input type="number" step="0.5" class="inline-input" value="${p.pts==null?'':p.pts}" onchange="pmUpdatePoint('${p.id}','pts',this.value)"></td><td class="p-2"><select class="border rounded-lg p-1 text-xs" onchange="pmSetCategory('${p.id}',this.value)">${catOpts}</select></td></tr>`;
}
function pmDutyPointRow(task){
  const v=state.positions.dutyTaskPoints[task];
  return `<tr><td class="p-2 font-medium">${esc(task)}</td><td class="p-2"><input type="number" step="0.5" class="inline-input" value="${v==null?'':v}" onchange="pmUpdateDutyPoint('${esc(task)}',this.value)"></td><td class="p-2 text-xs text-slate-400">值日任务</td></tr>`;
}
function pmRepPointRow(r){
  return `<tr><td class="p-2 font-medium">${esc(r.subject)} 课代表</td><td class="p-2"><input type="number" step="0.5" class="inline-input" value="${r.pts==null?'':r.pts}" onchange="pmUpdateRepPoint('${r.id}',this.value)"></td><td class="p-2 text-xs text-slate-400">课代表</td></tr>`;
}
// 按职务计算任职分：把每名学生在本班各职务（含课代表）的"日积分"之和 × 距起始日天数，写入 post 维度日志（auto:'job'，可重算覆盖）
function pmCalcJobScores() {
  const start = ptCalcStartDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const ms = today.getTime() - start.getTime();
  if (ms <= 0) return alert('任职积分起始日（' + (state.points.calcStartDate || '未设置') + '）需早于今天，才能计算任职分');
  const days = Math.floor(ms / 86400000) + 1; // 含起始日当天，按"每日计分"理解
  // 先移除上一次自动计算的任职分记录，保留手动调整的 post 日志
  state.points.logs = state.points.logs.filter(l => !(l.auto === 'job' && l.dim === 'post'));
  // 按姓名聚合各职务日积分（同名学生跨多个职务累加）
  const byName = {};
  const addPts = (name, pts) => {
    if (!name) return;
    const p = parseFloat(pts); if (!(p > 0)) return;
    byName[name] = (byName[name] || 0) + p;
  };
  state.positions.structure.forEach(r => { (state.positions.assign[r.id] || []).forEach(n => addPts(n, r.pts)); });
  (state.positions.representatives || []).forEach(r => { (r.names || []).forEach(n => addPts(n, r.pts)); });
  let count = 0; const unmatched = [];
  Object.keys(byName).forEach(name => {
    const st = state.students.find(s => s.name === name && s.class === state.headTeacherClass) || state.students.find(s => s.name === name);
    if (!st) { unmatched.push(name); return; }
    const daily = byName[name];
    const total = Math.round(daily * days * 100) / 100;
    ptWriteLog(st.id, 'post', total, `履职任职分（每日${fmtScore(daily)}分 × ${days}天）`, '', 'job', state.points.calcStartDate);
    count++;
  });
  save();
  if (typeof render === 'function') { try { render(); } catch (e) {} }
  let msg = `已按职务计算任职分：${count} 名学生，起始日 ${state.points.calcStartDate} 起共 ${days} 天。`;
  if (unmatched.length) msg += `（${unmatched.length} 个姓名未匹配到学生：${unmatched.join('、')}，请核对职务分配中的姓名）`;
  toast(msg);
}
function pmRenderPoints(){
  const P=state.positions;
  const banWei=P.structure.filter(p=>p.category==='班委');
  const feiBanWei=P.structure.filter(p=>p.category==='非班委');
  const keDaiBiao=P.structure.filter(p=>p.category==='课代表');
  const reps=P.representatives||[];
  const repRows=reps.map(pmRepPointRow).join('');
  const kdRows=keDaiBiao.map(pmPointRow).join('');
  let html=`<div class="bg-white rounded-2xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-slate-700">职务积分（修改后同步到职务架构）</div>
      <button class="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 whitespace-nowrap" onclick="pmCalcJobScores()">🧮 按职务计算任职分</button>
    </div>
    <div class="grid lg:grid-cols-2 gap-5">
      <div><div class="text-sm font-semibold text-slate-600 mb-2">班委积分</div>
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr class="bg-slate-50 text-slate-500"><th class="text-left p-2">职务</th><th class="text-left p-2">日积分</th><th class="text-left p-2">归类</th></tr></thead>
          <tbody>${banWei.map(pmPointRow).join('')}</tbody></table></div></div>
      <div><div class="text-sm font-semibold text-slate-600 mb-2">非班委职务</div>
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr class="bg-slate-50 text-slate-500"><th class="text-left p-2">职务 / 值日任务</th><th class="text-left p-2">日积分</th><th class="text-left p-2">归类</th></tr></thead>
          <tbody>${feiBanWei.map(pmPointRow).join('')}${pmDutyTasks.map(pmDutyPointRow).join('')}</tbody></table></div></div>
    </div>
    ${reps.length||keDaiBiao.length?`<div class="mt-5"><div class="text-sm font-semibold text-slate-600 mb-2">课代表积分</div>
      <div class="overflow-x-auto max-w-md"><table class="w-full text-sm">
        <thead><tr class="bg-slate-50 text-slate-500"><th class="text-left p-2">科目 / 职务</th><th class="text-left p-2">日积分</th><th class="text-left p-2">归类</th></tr></thead>
        <tbody>${repRows}${kdRows}</tbody></table></div></div>`:''}
    <p class="text-xs text-slate-400 mt-4">清空日积分则视为该职务不享受积分奖励。第三列「归类」可自由调整职务所属分类。<br>修改职务或起始日后，点击右上角「🧮 按职务计算任职分」才会把"日积分 × 天数"写入任职赋分（覆盖上次自动计算结果，手动加减的任职分保留）。</p>
  </div>`;
  return html;
}
function pmSetCategory(id, cat){
  const p=state.positions.structure.find(x=>x.id===id); if(!p) return;
  p.category=cat;
  save(); pmRefreshAll();
}
function pmUpdatePoint(id,field,val){
  const p=state.positions.structure.find(x=>x.id===id); if(!p) return;
  const v=val.trim();
  if(v==='') p[field]=null; else p[field]=field==='pts'?parseFloat(v):parseInt(v,10);
  save(); pmRefreshAll();
}
function pmUpdateDutyPoint(task,val){
  const v=val.trim();
  state.positions.dutyTaskPoints[task]= v===''?null:parseFloat(v);
  save(); pmRefreshAll();
}
function pmUpdateRepPoint(id,val){
  const r=state.positions.representatives.find(x=>x.id===id); if(!r) return;
  const v=val.trim();
  r.pts = v===''?null:parseFloat(v);
  save(); pmRefreshAll();
}

/* ===== 职务树（横向组织图 + 拖动分支） ===== */
function pmGetTreeNames(node){
  let names=[];
  if(node.id==='t_zrs') return names;
  if(node.repId){
    const r = (state.positions.representatives || []).find(x => x.id === node.repId);
    if (r && r.names) names = r.names.slice();
  }
  else if(node.roleId && state.positions.assign[node.roleId]) names=state.positions.assign[node.roleId].slice();
  else if(node.dutyTask){
    pmDays.forEach(d=>{ if(state.positions.dutyWeekly[d]&&state.positions.dutyWeekly[d][node.dutyTask]){ state.positions.dutyWeekly[d][node.dutyTask].forEach(n=>{ if(!names.includes(n)) names.push(n); }); } });
  }
  return names;
}
function pmNamesHtml(names){ if(!names||!names.length) return '<span class="org-empty">未安排</span>'; return names.map(n=>`<span class="name-chip">${esc(n)}</span>`).join(''); }
function pmTreeNodeClass(node){ if(node.id==='banzhang') return 'root'; if(node.repId) return 'leaf'; if(node.children&&node.children.length) return 'branch'; return 'leaf'; }
function pmIsDraggableNode(node){ return node.roleId && node.id!=='banzhang'; }
function pmIsDroppableNode(node){ return (node.roleId || node.id==='banzhang') && !node.repId; }
function pmRenderTreeNode(node){
  const hasChildren=node.children&&node.children.length;
  const cls=pmTreeNodeClass(node)+(pmGetTreeNames(node).length===0&&node.id!=='t_zrs'&&node.id!=='banzhang'?' empty':'');
  const names=pmGetTreeNames(node);
  const draggable=pmIsDraggableNode(node);
  const droppable=pmIsDroppableNode(node);
  const dragAttr=draggable?`draggable="true" ondragstart="pmTreeDragStart(event,'${node.id}')"`:'';
  const dropAttr=droppable?`ondragover="pmTreeDragOver(event,'${node.id}')" ondragleave="pmTreeDragLeave(event,'${node.id}')" ondrop="pmTreeDrop(event,'${node.id}')"`:'';
  let html=`<li><div id="pm-node-${node.id}" class="org-node ${cls}" ${dragAttr} ${dropAttr}>
    <div class="title">${esc(node.label)}</div>
    <div class="names">${pmNamesHtml(names)}</div>
  </div>`;
  if(hasChildren) html+=`<ul>${node.children.map(c=>pmRenderTreeNode(c)).join('')}</ul>`;
  html+=`</li>`;
  return html;
}
function pmFindTreeNode(root,id){ if(root.id===id) return root; if(root.children){ for(const c of root.children){ const f=pmFindTreeNode(c,id); if(f) return f; } } return null; }
function pmFindTreeParent(root,id){ if(!root.children) return null; for(const c of root.children){ if(c.id===id) return root; } for(const c of root.children){ const p=pmFindTreeParent(c,id); if(p) return p; } return null; }
function pmIsDescendant(root,id){ if(root.id===id) return true; if(root.children){ for(const c of root.children){ if(pmIsDescendant(c,id)) return true; } } return false; }
function pmGetRoleIdsInTree(node,set){ set=set||new Set(); if(node.roleId) set.add(node.roleId); if(node.children) node.children.forEach(c=>pmGetRoleIdsInTree(c,set)); return set; }
function pmPruneTree(node){
  if(!node.children) return;
  node.children=node.children.filter(c=>{
    if(c.roleId && c.id!=='banzhang' && c.id!=='kedaibiao' && !state.positions.structure.find(p=>p.id===c.roleId)) return false;
    pmPruneTree(c); return true;
  });
}
function pmGetFreePositions(){ const inTree=pmGetRoleIdsInTree(state.positions.dutyTree); return state.positions.structure.filter(p=>p.id!=='banzhang' && !inTree.has(p.id)); }
function pmRenderTree(){
  pmPruneTree(state.positions.dutyTree);
  const free=pmGetFreePositions();
  const freeHtml=`<div class="free-zone drop-target" id="pmFreeZone" ondragover="pmTreeDragOver(event,'free')" ondragleave="pmTreeDragLeave(event,'free')" ondrop="pmTreeDrop(event,'free')">
    <div class="free-zone-title">未分配职务（把树上的职务拖回这里即可取消分支；从「职务架构」新增后会出现在这里）</div>
    <div class="free-list">${free.length?free.map(p=>`<span class="free-node" draggable="true" ondragstart="pmTreeDragStart(event,'${p.id}')">${esc(p.name)}</span>`).join(''):'<span class="org-empty">暂无未分配职务</span>'}</div>
  </div>`;
  let html=`<div class="bg-white rounded-2xl shadow-sm p-5">
    <div class="flex items-center justify-between mb-4">
      <div><div class="font-bold text-slate-700">班级职务分工树</div>
      <div class="text-xs text-slate-400 mt-0.5">拖动职务即可调整分支；职务在「职务架构」增删后这里自动同步</div></div>
    </div>
    <div class="org-chart overflow-x-auto pb-4"><ul>${pmRenderTreeNode(state.positions.dutyTree)}</ul></div>
    ${freeHtml}
  </div>`;
  return html;
}
function pmTreeDragStart(e,id){ pmTreeDragId=id; e.dataTransfer.setData('text/plain',id); e.dataTransfer.effectAllowed='move'; }
function pmTreeDragOver(e,id){ e.preventDefault(); if(id===pmTreeDragId) return; if(pmTreeDragId&&id!=='free'&&pmIsDescendant(pmFindTreeNode(state.positions.dutyTree,pmTreeDragId),id)) return; const el=id==='free'?document.getElementById('pmFreeZone'):document.getElementById('pm-node-'+id); if(el) el.classList.add('drag-over'); }
function pmTreeDragLeave(e,id){ const el=id==='free'?document.getElementById('pmFreeZone'):document.getElementById('pm-node-'+id); if(el) el.classList.remove('drag-over'); }
function pmTreeDrop(e,id){ e.preventDefault(); pmTreeDragLeave(e,id); const dragId=e.dataTransfer.getData('text/plain')||pmTreeDragId; pmTreeDragId=null; if(!dragId||dragId===id) return; pmMoveTreeNode(dragId,id); }
function pmMoveTreeNode(nodeId,newParentId){
  if(nodeId===newParentId) return;
  if(nodeId==='banzhang') return;
  const movingNode=pmFindTreeNode(state.positions.dutyTree,nodeId);
  if(movingNode && newParentId!=='free' && pmIsDescendant(movingNode,newParentId)) return;
  let node=movingNode;
  if(!node){ const p=state.positions.structure.find(x=>x.id===nodeId); if(!p) return; node={id:p.id,label:p.name,roleId:p.id,children:[]}; }
  else { const oldParent=pmFindTreeParent(state.positions.dutyTree,nodeId); if(oldParent) oldParent.children=oldParent.children.filter(c=>c.id!==nodeId); }
  if(newParentId==='free'){ save(); pmRefreshAll(); return; }
  const newParent=pmFindTreeNode(state.positions.dutyTree,newParentId);
  if(newParent){ newParent.children=newParent.children||[]; newParent.children.push(node); }
  save(); pmRefreshAll();
}

/* ===== 关联扣分 ===== */
function pmFlattenTree(node,list){ list=list||[]; list.push(node); if(node.children) node.children.forEach(c=>pmFlattenTree(c,list)); return list; }
function pmGetNodePath(root,id,path){ path=path||[]; if(root.id===id) return path.concat(root); if(root.children){ for(const c of root.children){ const f=pmGetNodePath(c,id,path.concat(root)); if(f) return f; } } return null; }
function pmFindTreeNodeById(root,id){ if(root.id===id) return root; if(root.children){ for(const c of root.children){ const f=pmFindTreeNodeById(c,id); if(f) return f; } } return null; }
function pmCleanDeductionKeywords(){ const valid=new Set(pmFlattenTree(state.positions.dutyTree).map(n=>n.id)); for(const id in state.positions.deductionKeywords) if(!valid.has(id)) delete state.positions.deductionKeywords[id]; }
function pmExtractDay(text){
  const days=['周一','周二','周三','周四','周五','周六','周日','星期天','星期日'];
  for(const d of days) if(text.includes(d)) return d;
  if(text.includes('今天')||text.includes('今日')){ const labels=['周日','周一','周二','周三','周四','周五','周六']; return labels[new Date().getDay()]; }
  return null;
}
function pmFindNodeByKeyword(text){
  const lower=text.toLowerCase();
  let best=null, bestScore=-1;
  for(const id in state.positions.deductionKeywords){
    for(const kw of state.positions.deductionKeywords[id]){
      if(!kw) continue;
      if(lower.includes(kw.toLowerCase())){
        let depth=0; try{ depth=(pmGetNodePath(state.positions.dutyTree,id)||[]).length; }catch(e){ depth=0; }
        const score=kw.length*10+depth; // 关键词越长、节点越深（越具体）优先
        if(score>bestScore){ bestScore=score; best=id; }
      }
    }
  }
  return best;
}
function pmGetPeopleForNode(node,day){
  if(node.repId){
    const r = (state.positions.representatives || []).find(x => x.id === node.repId);
    return (r && r.names || []).map(name => ({ name, pos: node.label + '课代表' }));
  }
  if(node.roleId) return (state.positions.assign[node.roleId]||[]).map(name=>({name,pos:node.label}));
  if(node.dutyTask){
    if(day && state.positions.dutyWeekly[day] && state.positions.dutyWeekly[day][node.dutyTask]) return state.positions.dutyWeekly[day][node.dutyTask].map(name=>({name,pos:day+node.label}));
    const set=new Set(), list=[];
    pmDays.forEach(d=>{ if(state.positions.dutyWeekly[d]&&state.positions.dutyWeekly[d][node.dutyTask]){ state.positions.dutyWeekly[d][node.dutyTask].forEach(n=>{ if(!set.has(n)){ set.add(n); list.push({name:n,pos:d+node.label}); } }); } });
    return list;
  }
  return [];
}
function pmGetDeductionChain(nodeId,day){
  const path=pmGetNodePath(state.positions.dutyTree,nodeId);
  if(!path) return [];
  const people=[], seen=new Set();
  for(let i=path.length-1;i>=0;i--){ pmGetPeopleForNode(path[i],day).forEach(p=>{ if(!seen.has(p.name)){ seen.add(p.name); people.push(p); } }); }
  return people;
}
function pmDeductionKeywordRow(node){
  const kws=state.positions.deductionKeywords[node.id]||[];
  return `<div class="flex items-start gap-2 text-sm border-b border-slate-100 py-2">
    <div class="font-medium text-slate-700 min-w-[90px] pt-0.5">${esc(node.label)}</div>
    <div class="flex flex-wrap gap-1 flex-1">
      ${kws.map((kw,i)=>`<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded border border-slate-200 cursor-pointer" onclick="pmRemoveDeductKeyword('${node.id}',${i})">${esc(kw)}<span class="text-slate-400">×</span></span>`).join('')}
      <span class="inline-flex items-center bg-slate-50 text-slate-500 text-xs px-2 py-1 rounded border border-dashed border-slate-300 cursor-pointer" onclick="pmAddDeductKeyword('${node.id}')">＋</span>
    </div>
  </div>`;
}
function pmRenderDeduct(){
  pmCleanDeductionKeywords();
  const nodes=pmFlattenTree(state.positions.dutyTree);
  const todayLabels=['周日','周一','周二','周三','周四','周五','周六'];
  const todayLbl=todayLabels[new Date().getDay()];
  let html=`<div class="bg-white rounded-2xl shadow-sm p-5">
    <div class="font-bold text-slate-700 mb-4">关联扣分（沿职务树向上追责）</div>
    <div class="grid lg:grid-cols-2 gap-5">
      <div><div class="text-sm font-semibold text-slate-600 mb-2">识别关键词设置</div>
        <div class="space-y-0 max-h-[460px] overflow-y-auto pr-1 border border-slate-100 rounded-xl p-2">
          ${nodes.map(pmDeductionKeywordRow).join('')}
        </div>
        <p class="text-xs text-slate-400 mt-2">在快速记录中输入描述，系统会匹配关键词，并沿职务树向上找到相关人员。</p>
      </div>
      <div><div class="text-sm font-semibold text-slate-600 mb-2">快速记录 <span class="text-xs text-gray-400">（今天：${todayLbl}，写“今天”会自动识别）</span></div>
        <textarea id="pmDeductInput" class="w-full border border-slate-200 rounded-lg p-3 text-sm" rows="3" placeholder="例如：周一垃圾桶不合格；监察员今天没好好干"></textarea>
        <div class="flex gap-2 mt-2 items-center">
          <button class="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700" onclick="pmParseDeduct()">识别</button>
          <input type="number" step="0.5" id="pmDeductPoints" value="${state.positions.deductionPoints}" class="inline-input">
          <span class="text-sm text-slate-500">分 / 人</span>
        </div>
        <div id="pmDeductResult" class="mt-3"></div>
      </div>
    </div>
  </div>`;
  return html;
}
function pmAddDeductKeyword(nodeId){ const kw=prompt('请输入识别关键词：'); if(!kw||!kw.trim()) return; state.positions.deductionKeywords[nodeId]=state.positions.deductionKeywords[nodeId]||[]; state.positions.deductionKeywords[nodeId].push(kw.trim()); save(); pmRefreshAll(); }
function pmRemoveDeductKeyword(nodeId,i){ state.positions.deductionKeywords[nodeId].splice(i,1); save(); pmRefreshAll(); }
function pmParseDeduct(){
  const text=document.getElementById('pmDeductInput').value.trim();
  const resultEl=document.getElementById('pmDeductResult');
  if(!text){ resultEl.innerHTML='<p class="text-xs text-slate-400">请输入描述</p>'; return; }
  const nodeId=pmFindNodeByKeyword(text);
  if(!nodeId){ resultEl.innerHTML='<p class="text-xs text-red-500">未识别到职务/任务关键词，请在左侧添加关键词</p>'; return; }
  const day=pmExtractDay(text);
  const node=pmFindTreeNodeById(state.positions.dutyTree,nodeId);
  const chain=pmGetDeductionChain(nodeId,day);
  const path=pmGetNodePath(state.positions.dutyTree,nodeId).map(n=>n.label).join(' → ');
  const pts=parseFloat(document.getElementById('pmDeductPoints').value)||0;
  let html=`<div class="bg-slate-50 rounded-lg p-3 text-sm">
    <div class="text-slate-500 text-xs mb-1">识别路径</div>
    <div class="font-medium text-indigo-700 mb-2">${esc(path)} ${day?('（'+esc(day)+'）'):''}</div>
    <div class="text-slate-500 text-xs mb-1">将扣分人员</div>
    <div class="flex flex-wrap gap-1.5">
      ${chain.length?chain.map(p=>`<span class="bg-white border border-slate-200 rounded-full px-2.5 py-1 text-xs">${esc(p.name)} <span class="text-slate-400">(${esc(p.pos)})</span></span>`).join(''):'<span class="text-slate-400 text-xs">该路径上未安排人员</span>'}
    </div>
    <button class="mt-3 text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 hover:bg-red-600" onclick="pmConfirmDeduct('${nodeId}',${pts})">确认每人扣 ${esc(pts.toString())} 分</button>
  </div>`;
  resultEl.innerHTML=html;
}
function pmConfirmDeduct(nodeId,pts,textOverride){
  const el=document.getElementById('pmDeductInput');
  const text=textOverride!=null?textOverride:(el?el.value.trim():'');
  const day=pmExtractDay(text);
  const node=pmFindTreeNodeById(state.positions.dutyTree,nodeId);
  const chain=pmGetDeductionChain(nodeId,day);
  if(!chain.length) return alert('未识别到可扣分人员');
  const reason=(day?day+' ':'')+(node?node.label:'')+' 关联扣分';
  const behDate=qrResolveDate(text)||todayLabel;
  const batchId=uid();
  let cnt=0, behCnt=0;
  chain.forEach(p=>{
    const sid=pmStudentIdByName(p.name);
    if(!sid) return;
    ptWriteLog(sid,'post',-Math.abs(pts),reason,batchId,'deduct');
    cnt++;
    const stu=state.students.find(x=>x.id===sid);
    if(stu && stu.class===state.headTeacherClass){
      const recId=uid();
      const c=(node?node.label:'')+'卫生/值日不合格'+(p.pos?('（'+p.pos+'）'):'')+(day?('，'+day):'');
      stu.records.unshift({ id:recId, type:'critic', date:behDate, content:c });
      logBehaviorToClassLog(recId, stu.name, 'critic', c, behDate);
      behCnt++;
    }
  });
  save(); render();
  let msg='已对 '+cnt+' 人各扣 '+pts+' 分（任职赋分维度，可在积分管理-日志查看/撤销）。';
  if(behCnt) msg+=' 并为 '+behCnt+' 名本班学生补记了「卫生/值日不合格」行为记录（已同步班级日志）。';
  alert(msg);
}
// 首页「一句话记录」中的关联扣分确认
function pmConfirmQrDeduct(){
  if(!qrDeductDraft) return;
  const { nodeId, text, pts } = qrDeductDraft;
  pmConfirmDeduct(nodeId, pts, text);
  const box=document.getElementById('qrResult');
  if(box) box.innerHTML='<div class="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-sm text-green-700">✅ 关联扣分已记录（任职赋分维度，可在积分管理-日志按批次撤销）。如还需记录其他内容，可重新输入并识别。</div>';
  qrDeductDraft=null;
}

// ===================== Init =====================
function showLogin() {
  GUEST_MODE = false;
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
          <input id="login-user" data-lock-allow placeholder="账号" value="admin" class="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200" />
          <input id="login-pass" data-lock-allow type="password" placeholder="密码" class="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200" />
          <label data-lock-allow class="flex items-center gap-2 text-xs text-gray-500 select-none"><input id="login-remember" type="checkbox" checked class="w-4 h-4 text-primary rounded" /> 记住本设备（下次自动登录，无需再输密码）</label>
          <button data-lock-allow onclick="doLogin()" class="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-rose-500 transition">登录</button>
          <button data-lock-allow onclick="enterOffline()" class="w-full text-gray-500 py-2 rounded-lg text-sm hover:bg-gray-50 transition">📴 本地离线使用（数据仅存本机，不上云）</button>
          <button data-lock-allow onclick="GUEST_MODE=!AUTH_TOKEN; render()" class="w-full text-gray-400 py-1.5 rounded-lg text-xs hover:bg-gray-50 transition">← 返回工作台（只读浏览）</button>
          <p id="login-err" class="text-xs text-red-500 text-center h-4"></p>
        </div>
        <p class="text-[11px] text-gray-300 text-center">默认账号 admin / admin123，登录后可在数据管理修改密码</p>
      </div>
    </div>`;
  const p = document.getElementById('login-pass');
  if (p) p.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

function enterOffline() {
  GUEST_MODE = true; // 本地离线即访客只读模式
  localStorage.setItem('ct_offline', '1');
  render();
}

function doLogin() {
  localStorage.removeItem('ct_offline');
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const chk = document.getElementById('login-remember');
  // 「记住本设备」：勾选则存账号密码，下次静默自动登录；不勾则清除，退出后需重新输入
  if (chk && chk.checked) {
    try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ user: u, pass: p })); } catch (e) {}
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
  const err = document.getElementById('login-err');
  err.textContent = '登录中…';
  fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('账号或密码错误')))
    .then(d => {
      AUTH_TOKEN = d.token;
      GUEST_MODE = false;
      localStorage.setItem(AUTH_KEY, d.token);
      // 拉取服务端数据（applyCloudState 会把本地未同步的记录补回，避免丢数据）
      apiGet('/api/data').then(res => {
        if (res && res.state) {
          applyCloudState(res.state);
          save(true); // internal：登录拉取数据后写回本地兜底
        } else {
          applyDefaultLock();
        }
        // 登录即视为本人操作：解除只读锁定（云端若存过 locked 也一并清除），进入可编辑状态
        if (state) { state.locked = false; state.lockManuallySet = false; }
        save(true);
        render();
        startSyncTimer(); // 登录成功即启动实时同步
      }).catch(() => { render(); startSyncTimer(); });
    })
    .catch(e => { err.textContent = e.message; });
}

function doLogout() {
  // 先停掉首页排行榜轮播 / 全屏时钟等定时器：它们会在登录页继续跑，
  // 每秒去读已经不存在的 DOM 节点，既耗电又会在控制台刷报错。
  try {
    stopHomeExhibitAuto();
    stopHomeExhibitFsAuto();
    stopHomeFsClock();
  } catch (e) { /* 首页未渲染过时会抛错，忽略即可 */ }
  AUTH_TOKEN = '';
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(REMEMBER_KEY); // 退出登录同时清除「记住本设备」，需重新输入密码
  stopSyncTimer(); // 退出登录即停止轮询
  showLogin();
}

function applyDefaultLock() {
  // 打开即进入只读锁定（满足「刷新/打开自动进入只读锁定」）。
  // defaultLocked 默认 true（见 defaultState，且锁定面板有「每次打开自动进入只读锁定」开关），
  // 取消勾选则打开即可用。锁定态为各设备本地偏好，不会因云端同步被别的设备覆盖。
  if (!state) return;
  state.locked = (state.defaultLocked !== false);
}
function startCloudSync() {
  setSyncBadge('同步中…', false);
  apiGet('/api/data', 30000).then(res => {
    if (res && res.state) {
      applyCloudState(res.state); // 内部含本地未同步记录的补回逻辑（并保留本机锁定态）
      render();
      startSyncTimer(); // 登录态下启动定时拉取，让多设备在数秒内自动同步
    } else {
      setSyncBadge('⚠️ 未同步（仅本机）', true);
    }
  }).catch(() => {
    // token 可能已过期（30 天），若本机「记住了登录」则静默续登后重试一次，实现长期免输入
    if (getRememberedLogin()) {
      tryRememberLogin().then(ok => { if (ok) startCloudSync(); else setSyncBadge('⚠️ 未同步（仅本机）', true); });
    } else {
      setSyncBadge('⚠️ 未同步（仅本机）', true);
    }
  });
}

// ===================== 多设备实时同步 =====================
// 之前只在「保存时推送、打开时拉取」，多设备同时用会出现信息不一致。
// 这里补上：定时拉取 + 窗口聚焦/切回可见时立即对账，让各端在数秒内自动同步。
let _syncTimer = null;
function syncNow() {
  if (!AUTH_TOKEN || GUEST_MODE) return; // 大屏访客模式（未登录）不参与云端同步
  apiGet('/api/data', 15000).then(res => {
    if (!res || !res.state) { setSyncBadge('⚠️ 未同步（仅本机）', true); return; }
    const ct = res.state._savedAt || 0;
    const lt = (state && state._savedAt) ? state._savedAt : 0;
    if (ct > lt) {
      // 云端更新：拉下来并渲染
      applyCloudState(res.state);
      render();
    } else if (lt > ct) {
      // 本机更新：推上去（pushSync 内部先合并，不会覆盖他人新记录）
      pushSync();
    }
    // 相等：无需操作
  }).catch(() => { setSyncBadge('⚠️ 未同步（仅本机）', true); });
}
function startSyncTimer() {
  stopSyncTimer();
  _syncTimer = setInterval(syncNow, 10000);
}
function stopSyncTimer() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}
// 聚焦窗口 / 切回本标签页时立即对账，替代手动刷新
window.addEventListener('focus', syncNow);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') syncNow();
});

// 启动：恢复首页/积分展示页的展示设置（显示人数、翻页速度、维度、自动轮换等），再渲染
loadHomeExhibit();

// 启动：始终先打开工作台（只读锁定）。登录 / 解锁仅按需触发，避免大屏卡在登录界面。
GUEST_MODE = !AUTH_TOKEN;
applyDefaultLock();   // 打开即进入只读锁定
render();
if (AUTH_TOKEN) {
  startCloudSync();   // 已登录：拉云端并启动实时同步
} else if (getRememberedLogin()) {
  // 已勾选「记住本设备」：静默自动登录，成功后切到完整同步模式
  setSyncBadge('自动登录中…', false);
  tryRememberLogin().then(ok => {
    if (ok) { GUEST_MODE = false; startCloudSync(); }
    else { GUEST_MODE = true; setSyncBadge('🖥️ 大屏模式 · 未登录（改动仅存本机）', true); render(); }
  });
} else {
  // 无登录态、无「记住本设备」：作为大屏/访客只读展示，不再自动弹出登录框
  GUEST_MODE = true;
  setSyncBadge('🖥️ 大屏模式 · 未登录（改动仅存本机）', true);
}

// 只读锁定拦截（仅注册一次）
initLockGuard();

// PWA：注册 Service Worker（网络优先，保证部署更新立即可见；离线时回退缓存）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

