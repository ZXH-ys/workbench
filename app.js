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
    nav: [
      { id: 'home', label: '工作台首页', icon: '🏠' },
      { section: '日常记录', items: [
        { id: 'schedule', label: '课程表', icon: '📅' },
        { id: 'students', label: '学生管理', icon: '👨‍👩‍👧‍👦' },
        { id: 'points', label: '积分管理', icon: '🏆' },
        { id: 'classLog', label: '班级日志', icon: '📓' },
        { id: 'seating', label: '座次表', icon: '🪑' },
        { id: 'positions', label: '职务与值日', icon: '📋' },
        { id: 'classRecord', label: '课堂记录', icon: '📝' },
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
      { id: uid(), subject: '英语', title: 'Unit 1 单词默写', class: '10班', due: '8月25日' },
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
    convertRatios: { sport: 0, daily: 0, exam: 0, post: 0 },
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
      { id: uid(), dim: 'sport', label: '早锻炼打卡', delta: 2, keywords: ['早锻炼','体育早训'] },
      { id: uid(), dim: 'sport', label: '体育课积极表现', delta: 3, keywords: ['体育课积极','体育课表现'] },
      { id: uid(), dim: 'sport', label: '课间操标准', delta: 1, keywords: ['课间操'] },
      { id: uid(), dim: 'sport', label: '无故缺席锻炼', delta: -3, keywords: ['缺席锻炼','未参加锻炼'] },
      { id: uid(), dim: 'daily', label: '主动回答问题', delta: 2, keywords: ['主动回答','回答问题'] },
      { id: uid(), dim: 'daily', label: '帮助同学', delta: 3, keywords: ['帮助同学','助人为乐'] },
      { id: uid(), dim: 'daily', label: '卫生打扫认真', delta: 2, keywords: ['卫生认真','打扫认真'] },
      { id: uid(), dim: 'daily', label: '作业未交', delta: -3, keywords: ['作业未交','未交作业','没交作业'] },
      { id: uid(), dim: 'daily', label: '迟到', delta: -2, keywords: ['迟到'] },
      { id: uid(), dim: 'daily', label: '违反课堂纪律', delta: -5, keywords: ['违反纪律','课堂纪律'] },
      { id: uid(), dim: 'exam', label: '班级前10名', delta: 10, keywords: ['班级前10','前十名'] },
      { id: uid(), dim: 'exam', label: '成绩显著进步', delta: 8, keywords: ['成绩显著进步','显著进步'] },
      { id: uid(), dim: 'exam', label: '单科第一/满分', delta: 5, keywords: ['单科第一','满分'] },
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
    { id:'banzhang', name:'班长', group:'班委', count:1, pts:5, seat:2, duties:['兼任音乐、美术课代表、心理委员','考勤（早、中、课上）','班级全部工作检查提醒','配合学校工作安排'], req:'品学兼优、以身作则' },
    { id:'xuexi', name:'学习委员', group:'班委', count:1, pts:3.5, seat:1, duties:['本周课堂学习/违纪汇总（周末汇总周一交）','上周作业检查汇总（周一）','考试整理考场（周三）','班级学习工作检查提醒'], req:'品学兼优、以身作则' },
    { id:'jilu', name:'记录员', group:'班委', count:1, pts:null, seat:null, duties:['班会内容记录（周一）','本周作业传达（周五晚）','1530 安全记录（每天）'], req:'书写工整' },
    { id:'shenghuo', name:'生活委员', group:'班委', count:1, pts:3.5, seat:1, duties:['桌椅板凳摆放','整理讲桌','书橱/空桌整理','生活工作检查提醒'], req:'个人生活有条理' },
    { id:'jiexian', name:'接线员', group:'班委', count:1, pts:null, seat:null, duties:['电脑/电灯/窗帘/空调开关（室内无人就关）'], req:'有时间观念' },
    { id:'guangbo', name:'广播员', group:'班委', count:1, pts:null, seat:null, duties:['路队古诗（放学）','跑操口号（课间操）'], req:'嗓门大' },
    { id:'linghang', name:'领航员', group:'班委', count:1, pts:null, seat:null, duties:['举旗/拿旗放旗（课间操）'], req:'体力好、眼神好' },
    { id:'weisheng', name:'卫生委员', group:'班委', count:1, pts:3.5, seat:1, duties:['全天卫生检查','值日生提醒/替补','卫生工具整理','卫生工作检查提醒'], req:'爱干净' },
    { id:'jiancha', name:'监察员', group:'班委', count:1, pts:3.5, seat:1, duties:['提醒班委履职','监督班委工作（周末汇总周一报）','提醒组长管课前纪律'], req:'公平公正、遵守纪律' },
    { id:'jifen', name:'计分员', group:'班委', count:1, pts:null, seat:null, duties:['每周积分汇总汇报','整理积分表格'], req:'仔细、会加减法' },
    { id:'zuzhang', name:'组长', group:'班委', count:6, pts:3.5, seat:1, duties:['检查小组作业报课代表','管理小组纪律计分','统计吃饭人数'], req:'公平公正、遵守纪律' },
    { id:'zhiban', name:'值日班长', group:'班委', count:1, pts:null, seat:null, duties:['午休在讲台上值班'], req:'' },
    { id:'xuehui', name:'学生会', group:'学生会', count:5, pts:null, seat:null, duties:['配合学校学生会工作'], req:'认真负责' },
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
          { id:'t_zrs_td', label:'拖地' }
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
    dutyTaskPoints:{ '黑板（全部）':null, '室内走廊':null, '垃圾桶':null, '室外走廊（含窗台）':null },
    deductionKeywords, deductionPoints:1,
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
  const ds = defaultState();
  // 确保所有顶层字段存在（从旧备份/早期版本导入的数据可能缺少某些模块）
  ['schedule','students','todos','templates','classLogs','communications','homework','scores','seating','seatingByClass','reminders','classRecords','user','nav','points','examData','convertRatios','snapshots','attendance','positions','classRecordSubjects','homeworkKeywords','classes','headTeacherClass','activeClass'].forEach(k => {
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
  // 职务与值日：补全子字段
  if (!s.positions || typeof s.positions !== 'object') s.positions = defaultPositions();
  if (!Array.isArray(s.positions.structure) || !s.positions.structure.length) s.positions.structure = defaultPositions().structure;
  if (!s.positions.assign || typeof s.positions.assign !== 'object') s.positions.assign = {};
  s.positions.structure.forEach(p => { if (!Array.isArray(s.positions.assign[p.id])) s.positions.assign[p.id] = []; });
  if (!s.positions.dutyTree || typeof s.positions.dutyTree !== 'object') s.positions.dutyTree = defaultPositions().dutyTree;
  if (!s.positions.dutyWeekly || typeof s.positions.dutyWeekly !== 'object') s.positions.dutyWeekly = {};
  if (!s.positions.deductionKeywords || typeof s.positions.deductionKeywords !== 'object') s.positions.deductionKeywords = defaultPositions().deductionKeywords;
  if (typeof s.positions.deductionPoints !== 'number') s.positions.deductionPoints = 1;
  if (!s.positions.dutyTaskPoints || typeof s.positions.dutyTaskPoints !== 'object') s.positions.dutyTaskPoints = defaultPositions().dutyTaskPoints;
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
  const _knownCls = s.classes.map(c => c.id);
  const _headCls = s.headTeacherClass;
  if (Array.isArray(s.students)) s.students.forEach(st => { if (!st.class || !_knownCls.includes(st.class)) st.class = _headCls; });
  if (Array.isArray(s.classRecords)) s.classRecords.forEach(r => { if (!r.class) r.class = _headCls; });
  if (Array.isArray(s.homework)) s.homework.forEach(h => { if (!h.class) h.class = _headCls; });
  if (Array.isArray(s.scores)) s.scores.forEach(sc => { if (!sc.class || !_knownCls.includes(sc.class)) sc.class = _headCls; });
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
  // 考勤管理
  if (!s.attendance || typeof s.attendance !== 'object') s.attendance = { members: [], current: null, logs: [] };
  if (!Array.isArray(s.attendance.members)) s.attendance.members = [];
  if (!Array.isArray(s.attendance.logs)) s.attendance.logs = [];
  if (s.attendance.current && typeof s.attendance.current !== 'object') s.attendance.current = null;
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

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { alert('保存失败，可能是本地存储空间已满。' + e.message); }
  pushSync();
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
        { from: 1, to: 10, points: 8 },
        { from: 11, to: 50, points: 4 },
        { from: 51, to: 99999, points: 1 }
      ]
    },
    subjectTop: {
      enabled: true,
      points: 5,                                                    // 班内每科第1名赋分
      scope: 'class'                                                // 'class' | 'school'
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
  if(!a.current) a.current={date:attDateKey(new Date()),home:{},leave:{}};
  a.current.home = attDeriveHome();
}
function attDeriveHome(){
  const day=attDayName(new Date()); const home={};
  attMembers().forEach(m=>{ if((m.weeklyHome||[]).includes(day)) home[m.name]=true; });
  return home;
}
function attStats(){
  const cur=(state.attendance.current)||{home:{},leave:{}};
  const total=attMembers().length;
  const homeKeys=Object.keys(cur.home||{}), leaveKeys=Object.keys(cur.leave||{});
  const absent=new Set([...homeKeys,...leaveKeys]);
  return { total, home:homeKeys.length, leave:leaveKeys.length, present:Math.max(0,total-absent.size),
           rate:total?Math.round((total-absent.size)/total*1000)/10:0 };
}
function attBuildLog(cur){
  return { id:uid(), date:cur.date, dateLabel:cur.date, total:attStats().total,
    home:Object.keys(cur.home||{}),
    leave:Object.entries(cur.leave||{}).map(([name,reason])=>({name,reason:reason===true?'':reason})),
    present:attStats().present, rate:attStats().rate };
}
function archiveCurrentAttendance(cur){
  const a=state.attendance; if(!cur||!cur.date) return;
  a.logs.unshift(attBuildLog(cur));
  Object.entries(cur.leave||{}).forEach(([name,reason])=>{
    const r=reason===true?'':reason;
    state.classLogs.unshift({ id:uid(), date:cur.date, content:`【考勤】${name} 请假${r?('（'+r+'）'):''}` });
  });
}
// 第二天打开（首次加载）时：归档前一天快照、清空请假、固定回家按周期保留
function autoArchiveAttendance(){
  const a=state.attendance; if(!a) return;
  const today=attDateKey(new Date());
  if(!a.current){ a.current={ date:today, home:attDeriveHome(), leave:{} }; return; }
  if(a.current.date !== today){
    archiveCurrentAttendance(a.current);            // 自动保存前一天考勤到历史
    a.current={ date:today, home:attDeriveHome(), leave:{} }; // 固定回家由周期重新派生（保留），请假清空
    save();
  }
}

let state = loadState();
autoArchiveAttendance();   // ★ 跨日自动归档：打开即把前一天考勤存入历史并重置当天
let currentRoute = 'home';
let gsQuery = '';            // 全局搜索框内容（姓名/科目）
let profileSid = null;       // 当前查看的学生档案
let profileSubject = '';     // 档案页成绩趋势所选科目
let hwSearchName = '';       // 作业模块姓名搜索
let hwSubjectFilter = '';    // 作业模块科目筛选
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

// ===================== 首次使用引导 =====================
let onboarded = localStorage.getItem('ct_onboarded');
function maybeOnboard() {
  if (onboarded) return;
  openModal('欢迎使用班主任工作台 👋', `
    <div class="space-y-4">
      <p class="text-sm text-gray-600 leading-relaxed">这是一个班主任工作台，数据主要保存在你的浏览器里（刷新不丢），登录后还会云端同步、支持多设备。跟着下面几步，几分钟就能用起来：</p>
      <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-700">
        <li>先点下方「清空示例并开始」，或在「设置 → 清理数据」按需清理示例，换成你的真实班级</li>
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
let lastRenderRoute = null;
function render() {
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
        ${renderPage()}
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
  // 9班（任课视角）仅显示部分模块，班主任专属模块（课程表/积分/日志/座次/职务值日/考勤/周报/待办）隐藏
  const teacherOnly = ['schedule','points','classLog','seating','positions','attendance','reminders','examscore'];
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
        <button class="w-full text-xs border rounded py-1.5 hover:bg-gray-50" onclick="openSettings()">⚙️ 设置</button>
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
  const teacherOnly = ['schedule','points','classLog','seating','positions','attendance','reminders','examscore'];
  if (cls !== state.headTeacherClass && teacherOnly.includes(currentRoute)) currentRoute = 'home';
  save(); render();
}

function renderTopBar() {
  const classSwitch = `<div class="flex items-center gap-1 bg-gray-100 rounded-full p-0.5 mr-2">
    ${(state.classes || []).map(c => `<button onclick="setActiveClass('${c.id}')" class="text-xs px-3 py-1 rounded-full transition ${state.activeClass===c.id?'bg-white text-primary shadow-sm font-medium':'text-gray-500 hover:text-gray-700'}">${c.name}</button>`).join('')}
  </div>`;
  const titles = {
    home: '工作台首页', schedule: '课程表', students: '学生管理', classLog: '班级日志',
    seating: '座次表', classRecord: '课堂记录',
    homework: '作业管理', report: '周报月报', reminders: '待办提醒', points: '积分管理', exam: '成绩管理',
    examscore: '考试赋分', positions: '职务与值日管理',
  };
  const menuBtn = `<button id="menuBtn" onclick="toggleSidebar()" class="mr-3 text-xl text-gray-600" title="菜单">☰</button>`;
  const themeBtn = `<button id="themeToggle" onclick="toggleTheme()" class="ml-3 text-lg" title="切换深色模式">🌙</button>`;
  const searchBox = `<div class="flex items-center gap-2 border border-gray-200 rounded-full px-3 py-1.5 bg-gray-50" style="min-width:220px;">
    <span class="text-gray-400 text-sm">🔍</span>
    <input id="gsInput" value="${esc(gsQuery)}" oninput="gsSetQuery(this.value)" onkeydown="if(event.key==='Enter')gsOpen()" placeholder="搜索姓名/科目，如：张三 数学" class="bg-transparent outline-none text-sm w-40">
    <button onclick="gsOpen()" class="text-primary text-xs font-medium hover:underline">搜索</button>
  </div>`;
  const syncBadge = `<span id="sync-badge" class="text-[11px] text-gray-400 mr-1"></span>`;
  const logoutBtn = `<button onclick="doLogout()" class="ml-2 text-lg" title="退出登录">🚪</button>`;
  let extra = '';
  if (currentRoute === 'points') {
    return `<header class="bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      ${menuBtn}${classSwitch}<h1 class="text-lg font-bold text-gray-800">积分管理</h1>${searchBox}
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtRules()">⚙️ 规则</button>
        <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openPtLogs()">📜 日志</button>
        <button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openPtBatch()">批量加减分</button>
        <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openPtAdjust(null,'daily',1)">+ 加减分</button>
        ${syncBadge}${themeBtn}${logoutBtn}
      </div>
    </header>`;
  }
  if (currentRoute === 'home') extra = `<button onclick="openQuickRecord()" class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5">+ 一句话记录</button>`;
  else if (currentRoute === 'schedule') extra = `<button data-periods class="text-sm text-gray-500 hover:text-primary mr-2">⚙️ 设置节次</button><button data-addcourse class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark">+ 添加课程</button>`;
  else if (currentRoute === 'seating') extra = `<button class="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full hover:bg-gray-50 mr-2" onclick="openSeatConfig()">⚙️ 布局</button><button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5 mr-2" onclick="exportSeatTeacher()">👩‍🏫 教师用</button><button class="text-sm text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="exportSeatStudent()">🎒 学生用</button>`;
  else if (['students','classLog','homework','reminders'].includes(currentRoute)) {
    const labels = { students:'+ 新建学生', classLog:'+ 写日志', homework:'+ 布置作业', reminders:'+ 新建提醒' };
    const data = { students:'data-newstudent', classLog:'data-newlog', homework:'data-newhw', reminders:'data-newreminder' };
    let importBtn = '';
    if (currentRoute === 'students') importBtn = `<button class="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-full hover:bg-gray-50 mr-2" onclick="openImportStudents()">⬆️ 批量导入</button>`;
    extra = importBtn + `<button ${data[currentRoute]} class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5">${labels[currentRoute]}</button>`;
  }
  return `<header class="bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
    ${menuBtn}${classSwitch}<h1 class="text-lg font-bold text-gray-800">${titles[currentRoute] || '工作台'}</h1>${searchBox}
    <div class="flex items-center gap-3">${extra}${syncBadge}${themeBtn}${logoutBtn}</div>
  </header>`;
}

function renderFab() {
  return `<button class="fab absolute bottom-6 right-6 w-12 h-12 rounded-full text-white flex items-center justify-center text-xl hover:scale-105 transition" onclick="openFabDefault()" title="快速记录">✏️</button>`;
}

function renderPage() {
  const map = {
    home: renderHome, schedule: renderSchedule, students: renderStudents, classLog: renderClassLog,
    seating: renderSeating, classRecord: renderClassRecord,
    homework: renderHomework, report: renderReport, reminders: renderReminders,
    points: renderPoints, exam: renderExam, examscore: renderExamScore, attendance: renderAttendance, positions: renderPositions,
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
  (state.attendance.logs || []).forEach(l => (l.leave || []).forEach(x => { if (x.name === name) n++; }));
  if (state.attendance.current && Object.prototype.hasOwnProperty.call(state.attendance.current.leave || {}, name)) n++;
  return n;
}

function gsParse() {
  const tokens = (gsQuery || '').trim().split(/\s+/).filter(Boolean);
  const nameHits = state.students.filter(s => tokens.some(t => t.length >= 2 && s.name.includes(t)));
  const nameSet = new Set(nameHits.map(s => s.name));
  const kw = tokens.filter(t => !nameSet.has(t));
  const kwMatch = (txt) => !kw.length || kw.every(t => (txt || '').includes(t));
  return { tokens, nameHits, nameSet, kw, kwMatch };
}

function renderGlobalSearch() {
  const { nameHits, nameSet, kw, kwMatch } = gsParse();
  const rows = [];
  state.classRecords.filter(r => (!nameSet.size || (r.studentName && nameSet.has(r.studentName))) && kwMatch((r.subject || '') + ' ' + (r.content || ''))).forEach(r => {
    rows.push({ mod: '课堂', tag: '#EEEDFE', tagc: '#534AB7', name: r.studentName || '', subj: r.subject || '', content: r.content || '', date: r.date || '', go: "navigate('classRecord')" });
  });
  state.homework.filter(h => (!nameSet.size || kwMatch(h.title || '') || nameSet.has(h.class || '')) && kwMatch((h.subject || '') + ' ' + (h.title || ''))).forEach(h => {
    rows.push({ mod: '作业', tag: '#E1F5EE', tagc: '#0F6E56', name: '', subj: h.subject || '', content: h.title || '', date: h.due || '', go: "navigate('homework')" });
  });
  state.students.filter(s => !nameSet.size || nameSet.has(s.name)).forEach(s => {
    (s.records || []).filter(r => kwMatch(r.content || '')).forEach(r => {
      rows.push({ mod: '行为', tag: '#FAECE7', tagc: '#993C1D', name: s.name, subj: recordTypeLabel(r.type), content: r.content || '', date: r.date || '', go: "openProfile('" + s.id + "')" });
    });
  });
  state.examData.records.filter(r => (!nameSet.size || nameSet.has(r.studentName)) && kwMatch(r.subject || '')).forEach(r => {
    const ex = state.examData.exams.find(e => e.id === r.examId) || {};
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
  return { exam: last.name, classRank: examClassRank(last.id, cid, s.name, subj), schoolRank: examGradeRank(last.id, s.name, subj, state.examData.classes.map(c => c.id)) };
}
function profileTrend(s) {
  const cid = findClassIdByName(s.name);
  const classIds = state.examData.classes.map(c => c.id);
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
  const crHtml = crs.length ? crs.slice(0, 12).map(r => `<div class="p-3 rounded-xl bg-gray-50 mb-2"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">${esc(r.subject || '其他')}</span><span class="text-xs text-gray-400">${esc(r.date)}</span></div><div class="text-sm text-gray-700">${esc(r.content)}</div></div>`).join('') : '<div class="text-gray-400 text-sm">暂无课堂记录</div>';
  const hwKw = /未完成|没交|未做|不交|作业|背诵|默写/;
  const hws = crs.filter(r => hwKw.test(r.content || ''));
  const hwHtml = hws.length ? hws.slice(0, 12).map(r => `<div class="p-3 rounded-xl bg-gray-50 mb-2"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-600 font-medium">${esc(r.subject || '其他')}</span><span class="text-xs text-gray-400">${esc(r.date)}</span></div><div class="text-sm text-gray-700">${esc(r.content)}</div></div>`).join('') : '<div class="text-gray-400 text-sm">暂无作业相关记录</div>';
  const beh = { critic: (s.records || []).filter(r => r.type === 'critic').length, praise: (s.records || []).filter(r => r.type === 'praise').length, chat: (s.records || []).filter(r => r.type === 'chat').length, leave: (s.records || []).filter(r => r.type === 'leave').length };
  return `
  <div class="space-y-5">
    <div class="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4 flex-wrap">
      <div class="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium text-lg">${esc(s.name.slice(0, 1))}</div>
      <div class="flex-1">
        <div class="font-bold text-gray-800">${esc(s.name)}</div>
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

// 班主任班（10班）首页：保留全部班主任专属功能
function renderHomeHead() {
  const todayCourses = state.schedule.courses.filter(c => c.day === todayIndex).sort((a,b)=>a.period-b.period);
  const todayWeekday = ['周一','周二','周三','周四','周五','周六','周日'][todayIndex];
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
  const startDate = state.points.calcStartDate || '2026-01-01';
  return `
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-12 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">📅 积分计算起始日</div>
        <span class="text-xs text-gray-400">设置后，所有积分排行与统计均从该日开始计算</span>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <input id="homeCalcStart" type="date" value="${esc(startDate)}" class="border rounded-lg p-2 text-sm">
        <button class="bg-primary text-white px-4 py-2 rounded-full text-sm hover:bg-primaryDark" onclick="saveHomeCalcStart()">保存起始日</button>
        <span class="text-xs text-gray-400">当前显示：${esc(startDate)} 起的积分</span>
      </div>
    </div>
    <div class="col-span-12 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">🧹 今日值日</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('positions')">职务与值日</button>
      </div>
      ${dutyTasks.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">${dutyTasks.map(t=>`<div class="p-3 rounded-xl bg-gray-50"><div class="text-xs font-medium text-gray-600 mb-1">${esc(t.label)}</div><div class="flex flex-wrap gap-1">${t.names.map(n=>`<span class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">${esc(n)}</span>`).join('')}</div></div>`).join('')}</div>` : `<div class="text-sm text-gray-500">今天还没有安排值日生，可在「职务与值日」中设置。</div>`}
    </div>
    <div class="col-span-12 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-gray-800">✅ 今日考勤</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('attendance')">考勤管理</button>
      </div>
      ${(() => {
        const st = attStats(); const a = state.attendance; const cur = a.current || {home:{},leave:{}};
        const leave = Object.entries(cur.leave||{});
        return `<div class="text-sm text-gray-600 mb-2">应到 ${st.total} · 实到 ${st.present} · 固定回家 ${st.home} · 请假 ${st.leave}</div>
          <div class="flex flex-wrap items-center gap-2">
            ${leave.length ? leave.map(([n,r])=>`<span class="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600">${esc(n)}${r?('·'+esc(r)):''}</span>`).join('') : '<span class="text-xs text-gray-400">今日暂无请假</span>'}
            <button class="text-xs px-2 py-1 rounded-full border border-primary text-primary hover:bg-primary/5" onclick="openAddLeaveModal()">+ 记请假</button>
          </div>`;
      })()}
    </div>
    ${renderHomePointsCard()}
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">📚 今日课程</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('schedule')">课程表</button>
      </div>
      <div class="space-y-3">
        ${todayCourses.length ? todayCourses.map(c => {
          const p = state.schedule.periods.find(x=>x.id===c.period);
          return `
          <div class="flex items-start gap-3 p-3 rounded-xl course-card cursor-pointer" onclick="editCourse(${c.day},${c.period})">
            <div class="text-center min-w-[3rem]">
              <div class="text-xs font-bold text-primary">${p ? (p.label || `第${p.id}节`) : `第${c.period}节`}</div>
              <div class="text-xs text-gray-500">${p ? ((p.start||'') + (p.end?'-'+p.end:'')) : ''}</div>
            </div>
            <div><div class="font-bold text-gray-800">${esc(c.subject)}</div></div>
          </div>`;
        }).join('') : '<div class="text-sm text-gray-400">今天没有课程安排</div>'}
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
        <button class="text-xs text-primary hover:underline" onclick="openCommListModal()">查看全部</button>
      </div>
      <div class="space-y-3">
        ${state.communications.filter(c=>c.status==='待跟进').slice(0,2).map(c => `<div class="p-3 rounded-xl bg-gray-50 text-sm"><div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(c.student)} · ${esc(c.parent)}</span><span class="text-xs text-red-500">${esc(c.status)}</span></div><div class="text-gray-600 text-xs">${esc(c.content)}</div></div>`).join('')}
      </div>
    </div>
  </div>`;
}

// 任课班（9班）首页：只显示与该班教学相关的概览，屏蔽班主任专属模块
function renderHomeTeacher() {
  const cls = state.activeClass;
  const clsName = className(cls);
  const students = (state.students || []).filter(s => s && s.class === cls);
  const todayKey = attDateKey(new Date());
  const records = (state.classRecords || []).filter(r => (!r.class || r.class === cls) && r.date === todayKey).slice(0, 5);
  const homeworks = (state.homework || []).filter(h => (!h.class || h.class === cls) && (h.due === todayKey || !h.due)).slice(0, 5);
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
            <div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(r.subject || '课堂')}</span><span class="text-xs text-gray-400">${esc(r.studentName || '')}</span></div>
            <div class="text-gray-600 text-xs">${esc(r.content || '').slice(0, 80)}${(r.content || '').length > 80 ? '…' : ''}</div>
          </div>`).join('') : `<div class="text-sm text-gray-400">今日还没有课堂记录，用右上角「一句话记录」快速添加。</div>`}
      </div>
    </div>
    <div class="col-span-12 md:col-span-6 bg-white rounded-2xl p-5 card-hover">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-gray-800">📚 今日作业</div>
        <button class="text-xs text-primary hover:underline" onclick="navigate('homework')">作业管理</button>
      </div>
      <div class="space-y-3">
        ${homeworks.length ? homeworks.map(h => `
          <div class="p-3 rounded-xl bg-gray-50 text-sm">
            <div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(h.subject || '作业')}</span><span class="text-xs text-gray-400">${h.due === todayKey ? '今日' : '无截止日'}</span></div>
            <div class="text-gray-600 text-xs">${esc(h.title || '').slice(0, 80)}${(h.title || '').length > 80 ? '…' : ''}</div>
          </div>`).join('') : `<div class="text-sm text-gray-400">今日还没有作业，可在「作业管理」中布置。</div>`}
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
            <div class="flex justify-between mb-1"><span class="font-medium text-gray-800">${esc(r.subject || '课堂')}</span><span class="text-xs text-gray-400">${esc(r.date || '')}</span></div>
            <div class="text-gray-600 text-xs">${esc(r.content || '').slice(0, 80)}${(r.content || '').length > 80 ? '…' : ''}</div>
          </div>`).join('') : `<div class="text-sm text-gray-400">还没有课堂记录。</div>`}
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
        ${state.activeClass === state.headTeacherClass
          ? `<div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="stClass" class="w-full border rounded-lg p-2 text-sm" value="${esc(s? s.class:'')}" placeholder="如：10班"></div>`
          : `<div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="stClass" class="w-full border rounded-lg p-2 text-sm bg-gray-100" value="${esc(className(state.activeClass))}" readonly></div>`}
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
            <div class="mt-0.5 text-lg">${recordTypeEmoji(r.type)}</div>
            <div class="flex-1"><div class="text-sm text-gray-700">${esc(r.content)}</div>
            <div class="flex items-center gap-2 mt-1.5"><span class="text-[10px] px-1.5 py-0.5 rounded ${recordTypeClass(r.type)}">${recordTypeLabel(r.type)}</span><span class="text-[10px] text-gray-400">${esc(r.date)}</span></div></div>
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
function renderHomework() {
  const kwList = (state.homeworkKeywords || []).slice(0, 6).join(' / ');
  const subjects = [...new Set(state.homework.filter(h => !h.class || h.class === state.activeClass).map(h => h.subject).filter(Boolean))];
  const subjTabs = [{ id: '', name: '全部' }].concat(subjects).map(s => `<button class="px-3 py-1.5 rounded-full text-xs font-medium transition ${hwSubjectFilter === s.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="hwSetSubject('${s.id}')">${esc(s.name)}</button>`).join('');
  const list = state.homework.filter(h => (!h.class || h.class === state.activeClass) && (!hwSubjectFilter || h.subject === hwSubjectFilter) && (!hwSearchName.trim() || (h.title || '').includes(hwSearchName.trim()) || (h.subject || '').includes(hwSearchName.trim())));
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <div class="font-bold text-gray-800">作业管理</div>
        <div class="text-xs text-gray-500 mt-1">快速记录识别词：${esc(kwList)}${(state.homeworkKeywords || []).length > 6 ? '…' : ''}</div>
      </div>
      <button class="text-sm text-gray-500 hover:text-primary px-2" onclick="openHomeworkKeywordSettings()">⚙️ 识别关键词</button>
    </div>
    <div class="flex flex-wrap gap-2 mb-3">${subjTabs}</div>
    <div class="relative mb-3">
      <input value="${esc(hwSearchName)}" oninput="hwSetSearch(this.value)" placeholder="按姓名/科目/标题搜索…" class="w-full border rounded-lg pl-9 pr-3 py-2 text-sm">
      <span class="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
    </div>
    <div class="grid gap-4">${list.map(h => `
      <div class="p-4 rounded-xl bg-gray-50 flex justify-between items-center">
        <div><div class="font-bold text-gray-800 text-sm">${esc(h.title)}</div><div class="text-xs text-gray-500 mt-1">${esc(h.class)} · ${esc(h.subject)}</div></div>
        <div class="flex items-center gap-3"><div class="text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">截止 ${esc(h.due)}</div><button class="text-gray-300 hover:text-red-500" onclick="deleteHomework('${h.id}')">🗑️</button></div>
      </div>`).join('') || '<div class="text-gray-400 text-sm">暂无匹配的作业。</div>'}</div>
  </div>`;
}
function hwSetSearch(v) { hwSearchName = v; render(); }
function hwSetSubject(s) { hwSubjectFilter = s; render(); }
function openHomeworkForm() {
  openModal('布置作业', `
    <div class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1">科目</label><input id="hwSubject" class="w-full border rounded-lg p-2 text-sm" value="英语"></div>
      <div><label class="block text-xs text-gray-500 mb-1">作业标题</label><input id="hwTitle" class="w-full border rounded-lg p-2 text-sm" placeholder="如：Unit 1 单词默写"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">班级</label><input id="hwClass" class="w-full border rounded-lg p-2 text-sm" value="${esc(className(state.activeClass))}"></div>
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
function crSetSubjectFilter(id){ crFilterSubject = id || ''; render(); }
function crSetSearch(v){ crSearchName = (v || '').trim(); render(); }
function renderClassRecord() {
  if(!state.classRecords) state.classRecords = [];
  const subjects = Array.isArray(state.classRecordSubjects) ? state.classRecordSubjects : [];
  const nameQ = crSearchName.toLowerCase();
  const baseRecords = state.classRecords.filter(r => !r.class || r.class === state.activeClass);
  const filtered = baseRecords.filter(r => {
    const subjOk = !crFilterSubject || (r.subject && subjects.some(s=>s.id===crFilterSubject && s.name===r.subject));
    const nameOk = !nameQ || (r.studentName && r.studentName.toLowerCase().includes(nameQ)) || (r.content && r.content.toLowerCase().includes(nameQ));
    return subjOk && nameOk;
  });
  const subjectCounts = {};
  baseRecords.forEach(r => { subjectCounts[r.subject] = (subjectCounts[r.subject] || 0) + 1; });
  const subjTabs = [{id:'', name:'全部'}].concat(subjects).map(s => {
    const active = crFilterSubject === s.id;
    const count = s.id ? (subjectCounts[s.name] || 0) : baseRecords.length;
    return `<button class="px-3 py-1.5 rounded-full text-xs font-medium transition ${active?'bg-primary text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="crSetSubjectFilter('${s.id}')">${esc(s.name)} ${count}</button>`;
  }).join('');
  const recordsHtml = filtered.map(r => `<div class="p-4 rounded-xl bg-gray-50 flex justify-between items-start">
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1 flex-wrap">
        <span class="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">${esc(r.subject || '其他')}</span>
        ${r.studentName ? `<span class="text-xs font-medium text-gray-700">${esc(r.studentName)}</span>` : ''}
        <span class="text-xs text-gray-400">${esc(r.date)}</span>
        ${r.auto ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">快速记录</span>' : ''}
      </div>
      <div class="text-sm text-gray-700">${esc(r.content)}</div>
    </div>
    <button class="text-gray-300 hover:text-red-500 ml-3" onclick="deleteClassRecord('${r.id}')">🗑️</button>
  </div>`).join('');
  return `<div class="bg-white rounded-2xl p-6 shadow-sm space-y-4">
    <div class="flex items-center justify-between">
      <div class="font-bold text-gray-800">课堂记录</div>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 rounded-full text-xs border border-gray-300 text-gray-600 hover:bg-gray-50" onclick="openClassRecordSubjectSettings()">⚙️ 识别关键词</button>
        <button class="bg-primary text-white px-4 py-1.5 rounded-full text-sm hover:bg-primaryDark" onclick="openClassRecordForm()">+ 添加记录</button>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">${subjTabs}</div>
    <div class="relative">
      <input id="crSearch" value="${esc(crSearchName)}" placeholder="按学生姓名搜索…" oninput="crSetSearch(this.value)" class="w-full border rounded-lg pl-9 pr-3 py-2 text-sm">
      <span class="absolute left-3 top-2 text-gray-400 text-sm">🔍</span>
    </div>
    <div class="space-y-3">${recordsHtml || '<div class="text-gray-400 text-sm">暂无匹配记录</div>'}</div>
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
        <div><label class="block text-xs text-gray-500 mb-1">日期</label><input id="crDate" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
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
    date: document.getElementById('crDate').value.trim()||todayLabel,
    subject: document.getElementById('crSubject').value.trim()||'—',
    studentId: s ? s.id : null,
    studentName: s ? s.name : '',
    class: s ? s.class : state.activeClass,
    content
  });
  save(); closeModal(); render();
}
function deleteClassRecord(id) {
  const r = state.classRecords.find(x=>x.id===id);
  if(!r) return;
  doDelete(()=>state.classRecords, id, (r.content || '课堂记录').slice(0,12));
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
  const clsStudents = state.students.filter(s => s.class === state.activeClass);
  const isMonth = reportRange === 'month';
  const dayWin = isMonth ? 30 : 7;
  const inClass = new Set(clsStudents.map(s => s.id));
  const totalStudents = clsStudents.length;
  const criticCount = clsStudents.reduce((a, s) => a + (s.records || []).filter(r => r.type === 'critic').length, 0);
  const praiseCount = clsStudents.reduce((a, s) => a + (s.records || []).filter(r => r.type === 'praise').length, 0);
  const pendingComm = state.communications.filter(c => c.status === '待跟进').length;
  const recent = ptRecent(dayWin).filter(l => inClass.has(l.studentId));
  const top3 = clsStudents.map(s => ({ s, score: ptScoreOf(s.id) })).sort((a, b) => b.score - a.score).slice(0, 3).filter(x => x.score !== 0);
  const weekTop = (() => {
    const m = {};
    recent.forEach(l => { m[l.studentId] = (m[l.studentId] || 0) + l.delta; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([sid, v]) => `${ptStudentName(sid)}(${ptSigned(v)})`).join('、') || '暂无';
  })();
  const dimSum = (dim) => clsStudents.reduce((a, s) => a + ptDimScore(s.id, dim), 0);
  const sportSum = dimSum('sport'), dailySum = dimSum('daily'), examSum = dimSum('exam'), postSum = dimSum('post');
  const totalSum = sportSum + dailySum + examSum + postSum;
  const report = `【${className(state.activeClass)} · ${isMonth ? '月报' : '周报'}】
时间：${formatDate(now)}
班级概况：本班共 ${totalStudents} 名学生。
行为记录统计：${isMonth ? '本月' : '本周'}表扬 ${praiseCount} 次，批评 ${criticCount} 次。
积分概况：全班累计 ${fmtScore(totalSum)} 分（体育打卡 ${fmtScore(sportSum)}、日常积分 ${fmtScore(dailySum)}、考试赋分 ${fmtScore(examSum)}、任职赋分 ${fmtScore(postSum)}）。
积分排行前三：${top3.length ? top3.map((x, i) => `${i + 1}. ${x.s.name} ${fmtScore(x.score)}分`).join('，') : '暂无'}
近${dayWin}天积分进步：${weekTop}
家校沟通：待跟进 ${pendingComm} 项。
班级日志摘要：${state.classLogs.slice(0,3).map(l=>l.date+' '+l.content).join('；') || '暂无'}
待办重点：${state.todos.filter(t=>!t.done).slice(0,3).map(t=>t.title).join('；') || '无'}`;
  const rangeBtn = (r, label) => `<button class="px-3 py-1.5 rounded-full text-sm transition ${reportRange===r?'bg-primary text-white':'bg-gray-100 text-gray-600 hover:bg-primary/10'}" onclick="setReportRange('${r}')">${label}</button>`;
  return `<div class="bg-white rounded-2xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="font-bold text-gray-800">${esc(className(state.activeClass))} · 班级${isMonth ? '月报' : '周报'}</div>
      <div class="flex items-center gap-2">
        ${rangeBtn('week','📅 周报')} ${rangeBtn('month','🗓️ 月报')}
        <button class="text-sm text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary/5" onclick="copyText(document.getElementById('reportText').textContent)">复制报告</button>
      </div>
    </div>
    <pre id="reportText" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl p-4">${esc(report)}</pre>
  </div>`;
}

// （「班会 PPT」生成功能曾提供，已在菜单精简时移除入口，相关函数已清理为死代码并删除）

// ===================== Points: 积分管理 =====================
let pointsTab = 'all';
let pointsQuery = '';
let pointsMode = 'conv'; // 'conv' 折算分 | 'raw' 原始分

function setPtMode(m) { pointsMode = m; render(); }
function ptScoreOf(sid) { return pointsMode === 'conv' ? ptConvTotal(sid) : ptRawTotal(sid); }
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
    return new Date(currentYear, +m[1] - 1, +m[2]);
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

function nowStamp() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function ptSum(logs) { return logs.reduce((a, b) => a + (+b.delta || 0), 0); }
function ptStudentLogs(sid) { return state.points.logs.filter(l => l.studentId === sid); }
function ptTotal(sid) { return ptSum(ptEffectiveLogs(ptStudentLogs(sid))); }
function ptDimScore(sid, dim) {
  let v = ptSum(ptEffectiveLogs(ptStudentLogs(sid).filter(l => l.dim === dim)));
  // 考试赋分：并入自动计算的考试赋分（仅班主任班）
  if (dim === 'exam' && state.activeClass === state.headTeacherClass) {
    const s = state.students.find(x => x.id === sid);
    if (s) v += examScoreStudentTotal(s.name);
  }
  return v;
}
function ptClassSum(dim) {
  const clsStudentIds = new Set(state.students.filter(s => s.class === state.activeClass).map(s => s.id));
  let base = ptSum(ptEffectiveLogs(state.points.logs.filter(l => clsStudentIds.has(l.studentId) && (dim === 'all' || l.dim === dim))));
  // 考试赋分：并入自动计算的考试赋分（仅班主任班）
  if ((dim === 'exam' || dim === 'all') && state.activeClass === state.headTeacherClass) {
    const d = examScoreData();
    base += Object.values(d.students).reduce((a, b) => a + b.total, 0);
  }
  return base;
}
function ptRanked(dim) {
  const arr = state.students.filter(s => s.class === state.activeClass).map(s => ({ s, score: dim === 'all' ? ptScoreOf(s.id) : ptDimScore(s.id, dim) }));
  arr.sort((a, b) => b.score - a.score || String(a.s.name).localeCompare(String(b.s.name), 'zh'));
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
function ptConvDim(sid, dim) {
  const raw = ptDimScore(sid, dim) || 0;
  const cap = state.convertRatios[dim] != null ? state.convertRatios[dim] : 0;
  // 不折算 或 负分保留原始值
  if (cap <= 0 || raw < 0) return raw;
  const maxRaw = Math.max(...state.students.filter(s => s.class === state.activeClass).map(s => ptDimScore(s.id, dim) || 0), 0);
  if (maxRaw <= 0) return 0;
  return (raw / maxRaw) * cap;
}
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
      <button class="w-full bg-primary text-white py-2 rounded-full hover:bg-primaryDark" onclick="saveConvertSettings()">保存折算设置</button>
    </div>`, 'md');
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
        <div class="mt-2"><input id="ptImpFile" type="file" accept=".csv,.txt,.xlsx" class="w-full text-sm"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button class="border py-2 rounded-full hover:bg-gray-50" onclick="document.getElementById('ptImpText').value='姓名,分值,日期（可选）\\n张明轩,5\\n王浩然,3\\n李思雨,-2,2026-08-01'">填入示例</button>
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
  // 导入即生成快照
  takeSnapshot('import');
  save(); closeModal();
  render();
  let msg = `成功导入 ${matched} 条（${dimLabel(dim)}）。`;
  if (unmatched.length) msg += `\n未匹配（姓名不存在或非当前班级）：${unmatched.join('、')}`;
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
function delSnapshot(id) { state.snapshots = state.snapshots.filter(x => x.id !== id); save(); openPtHistory(); }



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
function examScoreColumns() { return examColumns().filter(c => c.type === 'score' && c.enabled); }
function examRankColumns() { return examColumns().filter(c => c.type === 'rank' && c.enabled); }
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
  const cols = examColumns();
  const rows = cols.map(c => `
    <div class="flex items-center gap-2 py-2 border-b last:border-0" data-key="${esc(c.key)}">
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
      <p class="text-xs text-gray-500">可手动增删科目与排名列；新建后，导入 / 单条录入 / 分析筛选中即可选用。删除会一并清除该列已有的成绩记录。</p>
      <div id="cmRows" class="max-h-72 overflow-y-auto">${rows || '<p class="text-xs text-gray-400">暂无列，请在下方添加。</p>'}</div>
      <div class="flex gap-2 pt-1">
        <input id="cmNewKey" class="flex-1 border rounded-lg p-2 text-sm" placeholder="新列名称，如：道法">
        <select id="cmNewType" class="border rounded-lg p-2 text-sm"><option value="score">分数科目</option><option value="rank">排名列</option></select>
        <button class="bg-primary text-white px-4 rounded-lg text-sm hover:bg-primaryDark" onclick="cmAdd()">＋ 添加</button>
      </div>
      <div class="flex gap-2 pt-1">
        <button class="flex-1 border py-2 rounded-full hover:bg-gray-50" onclick="closeModal()">完成</button>
      </div>
    </div>`, 'lg');
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
    const sorted = [...same].sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(r => r.studentName === studentName) + 1;
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
    const c = state.examData.classes.find(c => c.name === st.class || c.id === st.class);
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
    const totalByStu = {};
    recs.filter(r => r.colType !== 'rank').forEach(r => { totalByStu[r.studentName] = (totalByStu[r.studentName] || 0) + (+r.score || 0); });
    // 班次排名（按总分）
    const ranked = [...names].sort((a, b) => (totalByStu[b] || 0) - (totalByStu[a] || 0));
    const classRankMap = {}; ranked.forEach((nm, i) => { classRankMap[nm] = i + 1; });
    const classSize = names.length;
    // 单科记录分组（用于单科最高分）
    const bySubj = {};
    recs.filter(r => r.colType !== 'rank').forEach(r => { (bySubj[r.subject] = bySubj[r.subject] || []).push(r); });
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
      let cr = 0, sr = 0, st = 0;
      const classRank = classRankMap[nm] || null;
      if (cfg.classRank.enabled && classRank) cr = classSize + 1 - classRank;
      if (cfg.schoolRank.enabled && schoolCol) {
        const rec = recs.find(r => r.studentName === nm && r.subject === schoolCol);
        const rk = rec ? parseInt(rec.score, 10) : NaN;
        if (!isNaN(rk)) sr = schoolTierPoints(rk, cfg.schoolRank.tiers);
      }
      const topSubs = [];
      if (cfg.subjectTop.enabled) {
        Object.keys(topOf).forEach(sub => { if (topOf[sub].has(nm)) { st += cfg.subjectTop.points; topSubs.push(sub); } });
      }
      const examTotal = cr + sr + st;
      if (!out.students[nm]) out.students[nm] = { total: 0, exams: 0, byExam: [] };
      out.students[nm].total += examTotal;
      out.students[nm].exams += 1;
      out.students[nm].byExam.push({
        examId: e.id, examName: e.name, date: e.date,
        totalScore: totalByStu[nm] || 0,
        classRank, classRankPoints: cr,
        schoolRankVal: (() => { const rec = recs.find(r => r.studentName === nm && r.subject === schoolCol); return rec ? parseInt(rec.score, 10) : null; })(),
        schoolRankPoints: sr,
        topSubjects: topSubs, subjectTopPoints: st,
        examTotal
      });
    });
  });
  return out;
}
// 带缓存的派生数据（输入变化时才重算）
let _escCache = null, _escSig = '';
function examScoreData() {
  const sig = JSON.stringify({
    a: state.activeClass,
    s: state.points.calcStartDate,
    ex: state.examData.exams,
    rc: state.examData.records,
    st: (state.students || []).map(x => x.name + '|' + x.class),
    cols: (state.examData.columns || []).map(c => c.key + c.type + (c.enabled ? '1' : '0')),
    cfg: state.examScore
  });
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
  const cur=(state.attendance.current)||{home:{},leave:{}};
  const h=Object.prototype.hasOwnProperty.call(cur.home,name), l=Object.prototype.hasOwnProperty.call(cur.leave,name);
  if(h&&l) return 'both'; if(h) return 'home'; if(l) return 'leave'; return '';
}
function setAttMode(mode){
  attMode = (attMode===mode)? null : mode;
  render();
}
function markAttMember(name){
  const a=state.attendance; if(!a.current) a.current={date:attDateKey(new Date()),home:attDeriveHome(),leave:{}};
  const day=attDayName(new Date()); const s=attStudentByName(name);
  if(attMode==='home'){
    if(!s) return;
    if(!Array.isArray(s.weeklyHome)) s.weeklyHome=[];
    const i=s.weeklyHome.indexOf(day);
    if(i>-1) s.weeklyHome.splice(i,1); else s.weeklyHome.push(day);
    attRecomputeHome();
  } else if(attMode==='leave'){
    if(Object.prototype.hasOwnProperty.call(a.current.leave, name)) delete a.current.leave[name];
    else a.current.leave[name]=true;
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
  const a=state.attendance; if(!a.current) a.current={date:attDateKey(new Date()),home:attDeriveHome(),leave:{}};
  a.current.leave[name]=reason||true;
  if(!skipClassLog){
    const dk=attDateKey(new Date());
    state.classLogs.unshift({ id:uid(), date:dk, content:`【考勤】${name} 请假${reason?('（'+reason+'）'):''}` });
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
  delete state.attendance.current.leave[name]; save(); render();
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
  const a=state.attendance; if(!a.current) a.current={date:attDateKey(new Date()),home:attDeriveHome(),leave:{}};
  const st=attStats();
  const homeNames=Object.keys(a.current.home), leaveNames=Object.keys(a.current.leave);
  const leaveList=Object.entries(a.current.leave).map(([n,r])=>({name:n,reason:r===true?'':r}));
  const conclusion = `应到 ${st.total} 人，实到 ${st.present} 人。固定回家 ${st.home} 人（${homeNames.join('、')||'无'}），请假 ${st.leave} 人（${leaveNames.join('、')||'无'}）。`;

  const memberChips = attMembers().map(m=>{
    const cls=attChipClass(m.name);
    return `<div class="member-chip ${cls}" onclick="markAttMember('${m.name.replace(/'/g,"")}')">${esc(m.name)}</div>`;
  }).join('') || '<div class="text-sm text-gray-400">还没有班级成员，点「班级成员管理」导入名单。</div>';

  const todayDay = attDayName(new Date());
  const homeRows = attMembers().filter(m => (m.weeklyHome||[]).includes(todayDay)).map(m=>`<tr>
    <td class="py-2">${esc(m.name)}</td>
    <td class="py-2"><div class="flex gap-1">${ATT_WEEK.map(d=>`<span class="day-check ${ (m.weeklyHome||[]).includes(d)?'selected':'' }" onclick="toggleAttDay('${m.name.replace(/'/g,"")}','${d}')">${d}</span>`).join('')}</div></td>
    <td class="py-2">${(m.weeklyHome||[]).includes(todayDay)?'✅':''}</td></tr>`).join('') || '<tr><td colspan="3" class="text-gray-400 py-3">今日无固定回家成员</td></tr>';

  const leaveRows = leaveList.map(l=>`<tr><td>${esc(l.name)}</td><td>${attDateKey(new Date())} ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(l.reason)||'—'}</td><td><button class="text-xs text-red-500" onclick="removeLeave('${l.name.replace(/'/g,"")}')">删除</button></td></tr>`).join('') || '<tr><td colspan="4" class="text-gray-400">今日暂无请假</td></tr>';

  const historyRows = a.logs.slice(0,12).map(l=>`<tr><td>${esc(l.dateLabel)}</td><td>${l.total}</td><td>${l.present}</td><td>${l.home.length}</td><td>${l.leave.length}</td><td>${l.rate}%</td><td><span class="text-xs text-blue-600 cursor-pointer">查看</span></td></tr>`).join('') || '<tr><td colspan="7" class="text-gray-400">暂无历史记录，点击「保存今日考勤」生成首条</td></tr>';

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
            <th class="text-left p-1">单科最高分</th><th class="text-right p-1">单科赋分</th><th class="text-right p-1">本次合计</th>
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
  anSelClasses = state.examData.classes.map(c => c.id);
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
  anSelClasses = state.examData.classes.map(c => c.id);
  anSelExams = state.examData.exams.map(e => e.id);
  renderExamAnalysisInto();
}

// ---------- 数据管理 ----------
// 成绩分析的班级与成员统一取自「学生管理」，以学生管理为唯一真相源；
// 班级增删、成员增删、性别调整均在「学生管理」完成，成绩分析自动同步（见 syncExamClassesToStudents）。

function renderExamSettings() {
  const clsHtml = state.examData.classes.map(c => {
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
  const clsOpts = state.examData.classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
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
        <h3 class="font-bold text-gray-800">⚙️ 成绩列管理（科目 / 排名列）</h3>
        <button class="text-xs text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-primary/5" onclick="openColumnManager()">⚙️ 管理列</button>
      </div>
      <p class="text-[11px] text-gray-400 leading-relaxed">统一管理成绩中显示的科目与排名列（如语文、数学、校次、县次等）。在「成绩查询」「成绩分析」中按需勾选显示。直接处理原始成绩文件请使用上方「🛠️ 在线处理成绩」。</p>
    </div>

    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-gray-800">🛠️ 在线处理成绩（原始成绩文件）</h3>
        <span class="text-xs text-gray-400">无需先用离线工具导出</span>
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
  state.examData.records = state.examData.records.filter(r => r.examId !== id);
  state.examData.exams = state.examData.exams.filter(e => e.id !== id);
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
let piRows = [], piHeaders = [], piExamId = '', piNewName = '', piNewDate = '', piFileName = '';
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
  const newCols = [];
  dataCols.forEach(c => { if (!examColumnByKey(c.label)) { if (addExamColumn(c.label, c.kind === 'rank' ? 'rank' : 'score')) newCols.push(c.label); } });
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
    eqClassIds = state.examData.classes.map(c => c.id);
    eqSearch = '';
  }
  render();
  let msg = `✅ 成功导入 / 更新 ${n} 条记录（已按「班级 + 姓名」与「学生管理」匹配）`;
  if (newCols.length) msg += `\n新建列：${newCols.join('、')}`;
  const byClassTxt = Object.entries(matchedByClass).map(([c, v]) => `${c} ${v}人`).join('，');
  if (byClassTxt) msg += `\n匹配成功：${byClassTxt}`;
  if (unmatched.length) msg += `\n未匹配（班级或姓名未命中，已跳过）：${unmatched.slice(0, 20).join('、')}${unmatched.length > 20 ? '…' : ''}`;
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
// 纯计算：构建成品（计算单科校次 + 只保留所选班级）
function olBuildOutput(rows, colDefs, selectedClasses, classNorm) {
  const nameDef = colDefs.find(c => c.kind === 'name');
  const classDef = colDefs.find(c => c.kind === 'class');
  const scoreDefs = colDefs.filter(c => c.kind === 'score');
  const rankDefs = colDefs.filter(c => c.kind === 'rank');
  if (!nameDef) throw new Error('未找到姓名列，请在列映射中指定一列作为「姓名」');
  if (!classDef) throw new Error('未找到班级列，无法筛选你的班级');
  const subjectScoreDefs = scoreDefs.filter(d => d.label !== '总分');
  const subjectRanks = subjectScoreDefs.map(d => ({ def: d, map: olComputeSubjectRank(rows, d.index) }));
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
  scoreDefs.forEach(d => outHeaders.push(d.label));
  rankDefs.forEach(d => outHeaders.push(d.label));
  subjectRanks.forEach(sr => outHeaders.push(sr.def.label + '校次'));
  return { headers: outHeaders, rows: outRows, stats: { totalRows: totalAll, matched } };
}
// 取得可选班级（优先学生管理中的班级，确保能匹配）
function olAllClasses() {
  const set = new Set((state.students || []).map(x => x.class).filter(Boolean));
  if (!set.size) (state.examData.classes || []).forEach(c => set.add(c.id));
  return [...set];
}
let olHeaders = [], olRows = [], olKindMap = {}, olSelClasses = [], olName = '', olDate = '';
function olOnFile(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const done = (headers, rows) => {
    olHeaders = headers; olRows = rows;
    const det = olDetectColumns(olHeaders);
    olKindMap = {}; det.forEach(c => { olKindMap[c.index] = c.kind; });
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
    return { index: i, header: s, kind, label };
  });
}
function olSetKind(i, kind) { olKindMap[i] = kind; olRender(); }
function olToggleClass(c, on) {
  if (on) { if (!olSelClasses.includes(c)) olSelClasses.push(c); }
  else olSelClasses = olSelClasses.filter(x => x !== c);
  olRender();
}
function olBuildProduct() {
  const defs = olColDefs().filter(c => c.kind !== 'skip');
  return olBuildOutput(olRows, defs, olSelClasses, piNormalizeClass);
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
  const colRows = defs.map(d => `<tr class="border-t"><td class="px-2 py-1 text-xs">${esc(d.header)}</td><td class="px-2 py-1"><select class="border rounded p-1 text-xs" onchange="olSetKind(${d.index}, this.value)">${kindOpts(d.kind)}</select></td></tr>`).join('');
  const allClasses = olAllClasses();
  const clsChips = allClasses.map(c => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer"><input type="checkbox" onchange="olToggleClass(${JSON.stringify(c)}, this.checked)" ${olSelClasses.includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('');
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
        <div id="olColScroll" class="overflow-x-auto border rounded-xl max-h-48"><table class="w-full text-xs"><thead><tr class="bg-gray-100 text-gray-600"><th class="px-2 py-1.5 text-left">原表头</th><th class="px-2 py-1.5 text-left">识别为</th></tr></thead><tbody>${colRows}</tbody></table></div>
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
  // 复用「导入工具成品成绩」的保存通道：成品格式一致，按班级+姓名匹配写入
  piHeaders = product.headers; piRows = product.rows;
  piNewName = olName; piNewDate = olDate;
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
  if (!eqClassIds.length) eqClassIds = state.examData.classes.map(c => c.id);
  const clsChk = state.examData.classes.map(c => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer"><input type="checkbox" class="eq-cls" value="${c.id}" ${eqClassIds.includes(c.id) ? 'checked' : ''} onchange="eqCollect();"> ${esc(c.name)}</label>`).join('');
  const allCols = examColumns().filter(c => c.enabled);
  const colChk = allCols.map(c => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 cursor-pointer whitespace-nowrap"><input type="checkbox" class="eq-col" value="${esc(c.key)}" ${eqHiddenCols.has(c.key) ? '' : 'checked'} onchange="eqCollect();"> ${esc(c.key)}</label>`).join('');
  const sortOpts = [{k:'',l:'默认（班级/姓名）'},{k:'classId',l:'班级'},{k:'name',l:'姓名'},...allCols.map(c=>({k:c.key,l:c.key+(c.type==='rank'?'·排名':'')}))].map(o=>`<option value="${esc(o.k)}" ${eqSortCol===o.k?'selected':''}>${esc(o.l)}</option>`).join('');
  return `
  <div class="space-y-4">
    <div class="bg-white rounded-2xl p-5 shadow-sm space-y-4 overflow-x-auto">
      <div class="min-w-[720px]">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">选择考试</label>
            <select id="eqExam" class="w-full border rounded-lg p-2 text-sm" onchange="eqCollect();">${examOpts}</select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">班级</label>
            <div class="flex flex-wrap gap-2">${clsChk}</div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">搜索学生姓名</label>
            <input id="eqSearch" type="text" class="w-full border rounded-lg p-2 text-sm" placeholder="输入姓名，如：张明轩" value="${esc(eqSearch)}" oninput="eqCollect();">
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">排序</label>
            <div class="flex gap-2">
              <select id="eqSortCol" class="flex-1 border rounded-lg p-2 text-sm" onchange="eqCollect();">${sortOpts}</select>
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
  if (!state.examData.exams.length) return `<div class="bg-white rounded-2xl p-10 text-center shadow-sm"><div class="text-4xl mb-3">📊</div><div class="font-bold text-gray-800">还没有考试数据</div><p class="text-sm text-gray-500 mt-2">先到「成绩上传」添加考试并导入成绩。</p></div>`;
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
        <select id="anCmpCol" class="border rounded-lg p-2 text-sm" onchange="anToggleMetricInputs()">${colOpts}</select>
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
  const col = document.getElementById('anCmpCol').value;
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
  const rank = ptRanked('all').findIndex(x => x.s.id === sid) + 1;
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

// ===================== 一句话记录（自然语言识别） =====================
// 记录类型：类型标签词（既用于识别、也会从内容中剔除，都是明确的「类型动词」）
const REC_TYPE_LABELS_WORDS = {
  critic: ['批评','罚站','罚抄','处罚','违纪','迟到','早退','打架','顶撞','不交','没交','未完成','没完成','犯错','扣分','警告','处分','玩手机','走神','睡觉','抄袭','作弊','说话'],
  praise: ['表扬','夸奖','夸','赞','得奖','获奖','奖励','突出','满分','高分','守纪律','好人好事'],
  chat:   ['谈心','谈话','沟通','家访','约谈','开导','安慰','鼓励','交流'],
  leave:  ['请假','病假','事假','请假条','缺席'],
};
// 仅用于识别的描述性短语（不剔除，保证正文完整）
const REC_TYPE_DESC = {
  critic: ['顶撞','玩手机','走神','睡觉','抄袭','作弊','吵架','打架'],
  praise: ['主动帮助同学','帮助同学','助人为乐','表现好','值日认真','作业优秀','一等奖','二等奖','三等奖','积极发言','主动','认真','勤奋','贴心','懂事','优秀','进步','棒'],
  chat:   ['心理疏导','聊天','聊到','聊了','情绪低落'],
  leave:  ['肚子疼','不舒服','生病','家中有事','事假'],
};
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
const QR_CLAUSE_SPLIT = /[，；。,;!！?？\n]+/;

// 从文本中找出可能的学生姓名（不在名册中的）。
// 策略：在每个分句开头扫描「姓名[,、]姓名[,、]...」序列，遇到事件描述或已知学生边界即停止。
function extractUnknownNames(text, knownHits) {
  const keywordSet = new Set();
  ['语文','数学','英语','物理','化学','政治','历史','地理','生物','体育','音乐','美术','信息','班会','其他',
   '作业','布置作业','交作业','写作业','完成作业','背诵','默写','练习','抄写','预习','复习','试卷','卷子','学案','同步','练习册','课后题',
   '批评','表扬','谈心','请假','迟到','早退','打架','顶撞','不交','没交','未完成','没完成','犯错','扣分','警告','处分','玩手机','走神','睡觉','抄袭','作弊','说话',
   '今天','明天','昨天','上午','下午','课间','课堂','学校','老师','同学','班主任','家长','孩子','提出','给予','予以','进行','做了','被'].forEach(k => keywordSet.add(k));
  const isNoise = (word) => keywordSet.has(word) || QR_CONNECTORS.test(word);
  const knownRanges = knownHits.map(h => ({ start: h.pos, end: h.pos + h.len }));
  const isKnownAt = (pos, len) => knownRanges.some(r => r.start === pos && r.end === pos + len);
  const isKnownOverlap = (pos, len) => knownRanges.some(r => pos < r.end && pos + len > r.start);

  const names = [];
  const startsWithNoise = (str) => {
    for (const kw of keywordSet) { if (str.startsWith(kw)) return true; }
    return false;
  };
  const clauses = text.split(/([；。;])/);
  let offset = 0;
  for (let i = 0; i < clauses.length; i += 2) {
    const clause = clauses[i];
    const sep = clauses[i + 1] || '';
    let pos = offset;
    while (pos < offset + clause.length) {
      // 从当前位置尝试2-4字中文，选择「后面紧跟关键词」的最长合法长度
      let name = '', namePos = pos, nextPos = pos;
      for (let len = 2; len <= 4 && pos + len <= text.length; len++) {
        const candidate = text.slice(pos, pos + len);
        if (!/^[\u4e00-\u9fa5]{2,4}$/.test(candidate)) break;
        if (startsWithNoise(text.slice(pos + len))) {
          name = candidate;
          nextPos = pos + len;
          break;
        }
        name = candidate;
        nextPos = pos + len;
      }
      if (!name) break;
      // 若与已知学生重叠：完全 known 则继续向后，否则停止
      if (isKnownOverlap(namePos, name.length)) {
        if (isKnownAt(namePos, name.length)) {
          pos = nextPos;
          if (!/[，,、]/.test(text[pos])) break;
          pos++;
          continue;
        }
        break;
      }
      if (isNoise(name)) break;
      names.push({ pos: namePos, len: name.length, name });
      pos = nextPos;
      if (!/[，,、]/.test(text[pos])) break;
      pos++; // skip separator
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
  // 2) 识别不在名册中的潜在学生名，并合并到所有命中位置
  const unknownHits = extractUnknownNames(text, studentHits);
  const allHits = studentHits.concat(unknownHits.map(u => ({ ...u, id: null, name: u.name, unknown: true }))).sort((a, b) => a.pos - b.pos);
  // 3) 把学生按「连续并列组」拆分：组内学生之间只有逗号/顿号/连接词，共享组后的一段事件描述
  const rawSegments = []; // [{student?, unknownName?, text}]
  if (!allHits.length) {
    rawSegments.push({ student: null, text });
  } else {
    let i = 0;
    while (i < allHits.length) {
      let j = i;
      while (j + 1 < allHits.length) {
        const between = text.slice(allHits[j].pos + allHits[j].len, allHits[j + 1].pos);
        if (/^[，,、\s]*$/.test(between) || QR_CONNECTORS.test(between.trim())) {
          j++;
        } else {
          break;
        }
      }
      const groupStart = allHits[j].pos + allHits[j].len;
      const groupEnd = j + 1 < allHits.length ? allHits[j + 1].pos : text.length;
      let sharedText = text.slice(groupStart, groupEnd).trim().replace(/^[，,、；;。.:：!！?？\s]+/, '');
      for (let k = i; k <= j; k++) {
        if (allHits[k].unknown) {
          rawSegments.push({ student: null, unknownName: allHits[k].name, text: sharedText });
        } else {
          rawSegments.push({ student: allHits[k], text: sharedText });
        }
      }
      i = j + 1;
    }
  }
  // 4) 每个学生片段再按连接词/标点拆分为多个记录项
  const result = { raw: text, segments: [], matched };
  rawSegments.forEach(seg => {
    const segment = { student: seg.student || null, unknownName: seg.unknownName || '', items: [] };
    const rawClauses = seg.text.split(QR_CLAUSE_SPLIT).map(s => s.trim()).filter(Boolean);
    const clauses = [];
    rawClauses.forEach(rc => {
      rc.split(QR_CONNECTORS).map(s => s.trim()).filter(Boolean).forEach(c => clauses.push(c));
    });
    if (!clauses.length) clauses.push(seg.text);
    clauses.forEach(clause => {
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
  const unmatched = [];
  const wordRe = /[\u4e00-\u9fa5]{2,4}/g;
  let wm;
  while ((wm = wordRe.exec(text)) !== null) {
    const start = wm.index, end = start + wm[0].length;
    if (matchedRanges.some(r => start < r.end && end > r.start)) continue;
    if (/^(今天|明天|昨天|上午|下午|晚上|课间|课堂|学校|老师|同学|班主任|家长|孩子|一个|一下|一次|没有|还有|以及|因为|所以|但是|然后|接着|随后|另外|此外|最后|第一|第二|第三|可以|需要|已经|正在|还是|这样|那里|这里|我们|你们|他们|她们|它们)$/.test(wm[0])) continue;
    unmatched.push(wm[0]);
  }
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
  // 识别记录类型
  let recType = '';
  for (const t of ['critic', 'praise', 'chat', 'leave']) {
    let hitKw = '';
    for (const kw of REC_TYPE_LABELS_WORDS[t]) { if (text.includes(kw)) { hitKw = kw; break; } }
    if (!hitKw) for (const kw of (REC_TYPE_DESC[t] || [])) { if (text.includes(kw)) { hitKw = kw; break; } }
    if (hitKw) { recType = t; matched.push({ kind: 'type', value: hitKw, type: t }); break; }
  }
  // 未明确类型时，根据情感/规则推断
  if (!recType) {
    if (rules.some(r => r.rule.delta < 0) || /未完成|没交|未做|迟到|说话|违纪|不合格|捣乱|走神|睡觉|抄袭|作弊|打架/.test(text)) recType = 'critic';
    else if (rules.some(r => r.rule.delta > 0) || /完成|满分|优秀|帮助|主动|认真|进步|棒|突出|优秀|得奖/.test(text)) recType = 'praise';
    else if (/请假|病假|事假/.test(text)) recType = 'leave';
    else recType = 'chat';
  }
  // 清洗内容：保留完整事件描述，仅剔除引出词与首尾多余标点
  // 类型标签词用于识别类型，但不再从内容中删除（如「未完成」「迟到」等事实词需要保留）
  let content = text;
  REC_LEADIN.forEach(kw => { if (content.includes(kw)) content = content.split(kw).join(''); });
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
  const pointDelta = (recType === 'praise' ? 1 : recType === 'critic' ? -1 : 0);
  return { text, content, subjects, homework: !!homeworkHit, homeworkKeyword: homeworkHit, rules, recType, dim, pointDelta, enabled: true };
}

let qrDraft = null; // 当前确认草稿
let qrDeductDraft = null; // 一句话记录：待确认的关联扣分草稿
function openQuickRecord() {
  const tip = '输入一句话即可自动识别多名学生、多个事件。例如：\n「张明轩参加体育早训，提出表扬；秦梦茹月考满分，提出表扬；王浩然迟到批评」\n系统会按学生拆分为多条记录，并自动识别科目、作业、积分规则、类型等。你可以在识别结果中编辑或删除不满意的分项。';
  openModal('一句话记录', `
    <div class="space-y-3">
      ${(state.activeClass !== state.headTeacherClass) ? `<div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ 当前为任课视角（${esc(className(state.activeClass))}），一句话记录只会保存「课堂记录」与「作业」；行为 / 积分 / 请假请在班主任班（${esc(className(state.headTeacherClass))}）记录。</div>` : ''}
      <p class="text-xs text-gray-500 leading-relaxed whitespace-pre-line">${esc(tip)}</p>
      <textarea id="qrText" rows="3" class="w-full border rounded-lg p-3 text-sm" placeholder="输入一句话，例如：赵吉晨数学作业未完成且上语文课说话"></textarea>
      <button class="w-full bg-primary text-white py-2 rounded-full text-sm hover:bg-primaryDark" onclick="qrRecognize()">🔍 识别并预览</button>
      <div id="qrResult"></div>
    </div>`, 'lg');
}

function qrRecognize() {
  const text = document.getElementById('qrText').value;
  if (!text.trim()) return alert('请先输入内容');
  qrDraft = parseQuickRecord(text);
  // 关联扣分识别（沿职务树向上追责）
  qrDeductDraft = null;
  let dedNodeId = null;
  try { dedNodeId = pmFindNodeByKeyword(text); } catch (e) { dedNodeId = null; }
  if (dedNodeId) {
    const day = pmExtractDay(text);
    qrDeductDraft = { nodeId: dedNodeId, text, pts: state.positions.deductionPoints, day };
  }
  qrRenderDraft();
}

function qrRenderDraft() {
  const resultEl = document.getElementById('qrResult');
  if (!resultEl) return;
  if (!qrDraft || !qrDraft.segments.length) {
    resultEl.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">未识别到可记录的内容，请检查学生姓名或补充描述。</div>';
    return;
  }
  let dedHtml = '';
  if (qrDeductDraft) {
    const dPath = pmGetNodePath(state.positions.dutyTree, qrDeductDraft.nodeId).map(n => n.label).join(' → ');
    const chain = pmGetDeductionChain(qrDeductDraft.nodeId, qrDeductDraft.day);
    dedHtml = `<div class="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4 space-y-2 mb-3">
      <div class="text-sm font-bold text-indigo-700">⚠️ 识别到关联扣分</div>
      <div class="font-medium text-indigo-700 text-sm">${esc(dPath)} ${qrDeductDraft.day ? '（' + esc(qrDeductDraft.day) + '）' : ''}</div>
      <div class="flex flex-wrap gap-1.5">${chain.length ? chain.map(p => `<span class="bg-white border border-slate-200 rounded-full px-2.5 py-1 text-xs">${esc(p.name)} <span class="text-slate-400">(${esc(p.pos)})</span></span>`).join('') : '<span class="text-slate-400 text-xs">该路径上未安排人员</span>'}</div>
      <button class="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 hover:bg-red-600" onclick="pmConfirmQrDeduct()">确认每人扣 ${qrDeductDraft.pts} 分</button>
    </div>`;
  }
  let totalItems = 0;
  qrDraft.segments.forEach(seg => totalItems += seg.items.length);
  const use2Col = totalItems > 4;
  const hasUnknown = qrDraft.segments.some(seg => seg.unknownName);
  const list = qrDraft.segments.map((seg, si) => {
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
  }).join('');
  const unknownTip = hasUnknown ? `<div class="text-xs text-orange-600 bg-orange-50 rounded-lg p-2">检测到未在学生名册中识别到的姓名，请先点击卡片右上角的「添加到学生管理」，或直接在「学生管理」中补全名单后再记录。</div>` : '';
  const unmatched = (qrDraft.unmatchedWords || []).filter(w => !/^[，,、；;。.:：!！?？\s]+$/).slice(0, 5);
  const unmatchedTip = unmatched.length ? `<div class="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">以下词语暂未匹配到任何关键词，可到「设置」补充：<b>${esc(unmatched.join('、'))}</b></div>` : '';
  resultEl.innerHTML = dedHtml + `<div class="space-y-3">
    <div class="text-xs text-gray-500">识别到 ${qrDraft.segments.length} 名学生，共 ${totalItems} 条记录分项。已按姓名自动归入对应班级（标签显示在姓名后），可在卡片内修改文本、删除或停用。</div>
    ${unknownTip}
    ${unmatchedTip}
    <div class="grid grid-cols-1 ${use2Col ? 'md:grid-cols-2' : ''} gap-3">${list}</div>
    <div><div class="text-xs text-gray-500 mb-1">日期</div><input id="qrDate" class="w-full border rounded-lg p-2 text-sm" value="${todayLabel}"></div>
    <div class="flex gap-2 pt-1">
      <button class="flex-1 bg-primary text-white py-2 rounded-full text-sm hover:bg-primaryDark" onclick="qrSave()">✅ 一键记录</button>
      <button class="px-4 border border-gray-300 rounded-full text-sm hover:bg-gray-50" onclick="closeModal(); openFabDefault()">取消</button>
    </div>
  </div>`;
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
  const date = document.getElementById('qrDate').value.trim() || todayLabel;
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
    seg.items.forEach(item => {
      if (!item.enabled) return;
      const { recType, subjects, rules, homework, content, dim, pointDelta } = item;
      const isHead = s.class === state.headTeacherClass; // 仅班主任班(10班)记行为/积分/请假
      const stuClass = s.class || state.activeClass;
      // 学生行为记录 / 请假（仅班主任班）
      if (recType === 'leave') {
        if (isHead) { addLeave(s.name, content || '请假', true); nLeave++; }
      } else if (recType) {
        if (isHead) { s.records.unshift({ id: uid(), type: recType, date, content }); nRecord++; }
      }
      // 基础积分（表扬+1 / 批评-1）（仅班主任班）
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
        state.classRecords.unshift({ id: uid(), date, subject: sub.name, studentId: s.id, studentName: s.name, class: stuClass, content, auto: 'quick' });
        nClass++;
      });
      // 作业管理（仅当内容像布置/发布作业，而非未完成/未交；按学生所属班级归档）
      if (homework && !/未完成|没交|未做|不交/.test(content)) {
        const hwSubject = subjects[0]?.name || '未指定';
        state.homework.unshift({ id: uid(), subject: hwSubject, title: content || '作业布置', class: stuClass, due: date });
        nHomework++;
      }
    });
  });
  // 班级日志汇总
  let logContent = `一句话记录：${qrDraft.raw}`;
  if (autoPointLogs.length) logContent += `（${autoPointLogs.join('、')}）`;
  state.classLogs.unshift({ id: uid(), date, content: logContent });
  lastRecordContent = qrDraft.raw;
  save(); closeModal();
  let msg = '已记录';
  if (nRecord) msg += ` ${nRecord} 条行为`;
  if (nLeave) msg += ` ${nLeave} 条请假`;
  if (nPoint) msg += ` ${nPoint} 笔积分`;
  if (nClass) msg += ` ${nClass} 条课堂记录`;
  if (nHomework) msg += ` ${nHomework} 条作业`;
  toast(msg);
  render();
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
      <button class="w-full text-left p-4 rounded-xl bg-primary/10 hover:bg-primary/20 font-medium" onclick="closeModal(); openQuickRecord()">🤖 一句话记录</button>
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

// 班级显示名：内部用 id（如 '10班'），展示用 name（可自定义）
function className(id) {
  const c = (state.classes || []).find(x => x.id === id);
  return c ? c.name : (id || '');
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
    </div>
    <p class="text-[11px] text-gray-400 mt-4 text-center">修改密码需先验证固定口令，忘记口令请导出数据后重置应用</p>`, 'md');
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
        <div class="px-6 py-4 border-b flex items-center justify-between"><h3 class="font-bold text-gray-800">${esc(title)}</h3><button class="text-gray-400 hover:text-gray-600 text-xl" onclick="closeModal()">&times;</button></div>
        <div class="p-6 overflow-y-auto">${body}</div>
      </div>
    </div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// ===================== 职务与值日管理 =====================
const pmDays = ['周一','周二','周三','周四','周五'];
const pmDutyTasks = ['黑板（全部）','室内走廊','垃圾桶','室外走廊（含窗台）'];
let pmTab = 'roles';
let pmRolesEdit = false;
let curCtx = { mode:'role', key:null, day:null, task:null };
let pmDescId = null;
let pmTreeDragId = null;

function pmStudentNames(){ return (state.students||[]).filter(s=>s&&s.name).map(s=>s.name); }
function pmStudentIdByName(name){ const s=(state.students||[]).find(x=>x.name===name); return s?s.id:null; }
function pmSortPriority(a,b){
  const ap=(a.pts!=null||a.seat!=null)?1:0;
  const bp=(b.pts!=null||b.seat!=null)?1:0;
  if(bp!==ap) return bp-ap;
  return 0;
}
function pmRefreshAll(){ const b=document.getElementById('pm-body'); if(b) b.innerHTML=pmRenderTab(pmTab); }

/* ===== 页面框架 ===== */
function renderPositions(){
  const segs=[['roles','职务架构'],['duty','值日生'],['kedaibiao','课代表'],['points','职务积分'],['tree','职务树'],['deduct','关联扣分']];
  const segHtml=segs.map(([id,label])=>`<button class="pm-seg px-4 py-2 rounded-lg text-sm font-medium ${pmTab===id?'active':'text-slate-600 hover:bg-slate-100'}" data-pmtab="${id}" onclick="pmSwitch('${id}')">${label}</button>`).join('');
  return `<div>
    <div class="flex gap-1 mb-5 bg-white p-1 rounded-xl shadow-sm w-fit">${segHtml}</div>
    <div id="pm-body">${pmRenderTab(pmTab)}</div>
  </div>`;
}
function pmRenderTab(tab){
  if(tab==='duty') return pmRenderDuty();
  if(tab==='kedaibiao') return pmRenderKedaibiao();
  if(tab==='points') return pmRenderPoints();
  if(tab==='tree') return pmRenderTree();
  if(tab==='deduct') return pmRenderDeduct();
  return pmRenderRoles();
}
function pmSwitch(tab){
  pmTab=tab;
  const body=document.getElementById('pm-body');
  if(body) body.innerHTML=pmRenderTab(tab);
  document.querySelectorAll('.pm-seg').forEach(b=>{ const on=b.getAttribute('data-pmtab')===tab; b.className='pm-seg px-4 py-2 rounded-lg text-sm font-medium '+(on?'active':'text-slate-600 hover:bg-slate-100'); });
}

/* ===== 职务架构 ===== */
function pmChip(n,i,onRemove){ return `<span class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-full border border-indigo-200" onclick="${onRemove}">${esc(n)}<span class="text-indigo-400">×</span></span>`; }
function pmRenderRoles(){
  const P=state.positions;
  const list=P.structure.slice().sort(pmSortPriority);
  let html=`<div class="flex items-center justify-between mb-3">
    <div class="text-sm font-semibold text-slate-600">共 ${list.length} 个职务</div>
    <div class="flex items-center gap-2">
      ${pmRolesEdit?`<button class="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700" onclick="pmAddPosition()">＋ 添加职务</button>`:''}
      <button class="text-sm border rounded-lg px-3 py-1.5 hover:bg-gray-50" onclick="pmToggleRolesEdit()">${pmRolesEdit?'完成':'修改'}</button>
    </div>
  </div>`;
  html+=`<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">`;
  list.forEach(p=>{
    const names=P.assign[p.id]||[];
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
        ${names.map((n,i)=>pmChip(n,i,`pmRemoveRole('${p.id}',${i})`)).join('')}
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
  state.positions.structure=state.positions.structure.filter(p=>p.id!==id);
  delete state.positions.assign[id];
  save(); pmRefreshAll();
}
function pmRemoveRole(id,i){ state.positions.assign[id].splice(i,1); save(); pmRefreshAll(); }
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
  if(i>=0) cur.splice(i,1); else cur.push(name);
  if(curCtx.mode==='role') state.positions.assign[curCtx.key]=cur;
  else if(curCtx.mode==='rep'){
    const r=state.positions.representatives.find(x=>x.id===curCtx.key); if(r) r.names=cur; pmSyncKedaibiaoAssign();
  }
  else state.positions.dutyWeekly[curCtx.day][curCtx.task]=cur;
  pmBuildAssignBody(cur);
  save(); pmRefreshAll();
}

/* ===== 值日生轮换 ===== */
function pmAutoDuty(){
  const names=pmStudentNames(); state.positions.dutyWeekly={}; let i=0;
  pmDays.forEach(d=>{ state.positions.dutyWeekly[d]={}; pmDutyTasks.forEach(t=>{ state.positions.dutyWeekly[d][t]=[ names[i%names.length] ]; i++; }); });
  save(); pmRefreshAll();
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
    <div class="overflow-x-auto"><table class="w-full text-sm border-collapse">
      <thead><tr class="bg-slate-50"><th class="text-left p-2 font-medium text-slate-500">任务 / 日</th>${pmDays.map(d=>`<th class="p-2 font-medium text-slate-500">${d}</th>`).join('')}</tr></thead>
      <tbody>`;
  pmDutyTasks.forEach(t=>{
    html+=`<tr><td class="p-3 font-medium text-slate-600 bg-slate-50 whitespace-nowrap">${t}</td>`;
    pmDays.forEach(d=>{
      const names=(P.dutyWeekly[d]&&P.dutyWeekly[d][t])||[];
      const editing=P.dutyEditMode[d]&&P.dutyEditMode[d][t];
      const nameRows=names.length?names.map((n,i)=>`<div class="name-col"><span class="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-sm px-2.5 py-1 rounded border border-sky-200 cursor-pointer" onclick="pmRemoveDuty('${d}','${t}',${i})">${esc(n)}<span class="text-sky-400">×</span></span></div>`).join(''):`<div class="name-col"><span class="text-slate-300 text-sm">空</span></div>`;
      const addRow=editing?`<div class="name-col"><span class="inline-flex items-center justify-center bg-slate-100 text-slate-500 text-sm px-2 py-1 rounded border border-dashed border-slate-300 cursor-pointer" onclick="pmOpenAddDuty('${d}','${t}')">＋</span></div>`:'';
      const toggle=`<div class="edit-toggle" onclick="pmToggleDutyEdit('${d}','${t}')">${editing?'完成':'修改'}</div>`;
      html+=`<td class="border cell-edit duty-cell">${nameRows}${addRow}${toggle}</td>`;
    });
    html+=`</tr>`;
  });
  html+=`</tbody></table></div>
    <p class="text-xs text-slate-400 mt-3">点击任意格子可添加成员；点姓名上的 × 删除；每天人数随成员增减自动变化。</p>
  </div>`;
  return html;
}
function pmRemoveDuty(day,task,i){ state.positions.dutyWeekly[day][task].splice(i,1); save(); pmRefreshAll(); }
function pmToggleDutyEdit(day,task){ state.positions.dutyEditMode[day]=state.positions.dutyEditMode[day]||{}; state.positions.dutyEditMode[day][task]=!state.positions.dutyEditMode[day][task]; pmRefreshAll(); }
function pmExportDutyXlsx(){
  if(typeof XLSX==='undefined'){ return alert('导出组件未加载，请刷新后重试'); }
  const P=state.positions;
  const rows=[['值日生'].concat(pmDays)];
  pmDutyTasks.forEach(t=>{ rows.push([t].concat(pmDays.map(d=>{ const ns=(P.dutyWeekly[d]&&P.dutyWeekly[d][t])||[]; return ns.join('、'); }))); });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'值日生安排');
  XLSX.writeFile(wb,'值日生安排.xlsx');
}

/* ===== 课代表（按科目管理） ===== */
function pmSyncKedaibiaoAssign(){
  const all=[];
  (state.positions.representatives||[]).forEach(r=>{(r.names||[]).forEach(n=>{if(!all.includes(n)) all.push(n);});});
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
  const names=r.names||[];
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
  r.names.splice(idx,1);
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
  return `<tr><td class="p-2 font-medium">${esc(p.name)}</td><td class="p-2"><input type="number" step="0.5" class="inline-input" value="${p.pts==null?'':p.pts}" onchange="pmUpdatePoint('${p.id}','pts',this.value)"></td></tr>`;
}
function pmDutyPointRow(task){
  const v=state.positions.dutyTaskPoints[task];
  return `<tr><td class="p-2 font-medium">${esc(task)}</td><td class="p-2"><input type="number" step="0.5" class="inline-input" value="${v==null?'':v}" onchange="pmUpdateDutyPoint('${esc(task)}',this.value)"></td></tr>`;
}
function pmRepPointRow(r){
  return `<tr><td class="p-2 font-medium">${esc(r.subject)} 课代表</td><td class="p-2"><input type="number" step="0.5" class="inline-input" value="${r.pts==null?'':r.pts}" onchange="pmUpdateRepPoint('${r.id}',this.value)"></td></tr>`;
}
function pmRenderPoints(){
  const P=state.positions;
  const banWei=P.structure.filter(p=>p.pts!=null);
  const feiBanWei=P.structure.filter(p=>p.pts==null);
  const reps=P.representatives||[];
  const repRows=reps.map(pmRepPointRow).join('');
  let html=`<div class="bg-white rounded-2xl shadow-sm p-5">
    <div class="font-bold text-slate-700 mb-4">职务积分（修改后同步到职务架构）</div>
    <div class="grid lg:grid-cols-2 gap-5">
      <div><div class="text-sm font-semibold text-slate-600 mb-2">班委积分</div>
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr class="bg-slate-50 text-slate-500"><th class="text-left p-2">职务</th><th class="text-left p-2">日积分</th></tr></thead>
          <tbody>${banWei.map(pmPointRow).join('')}</tbody></table></div></div>
      <div><div class="text-sm font-semibold text-slate-600 mb-2">非班委职务</div>
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead><tr class="bg-slate-50 text-slate-500"><th class="text-left p-2">职务 / 值日任务</th><th class="text-left p-2">日积分</th></tr></thead>
          <tbody>${feiBanWei.map(pmPointRow).join('')}${pmDutyTasks.map(pmDutyPointRow).join('')}</tbody></table></div></div>
    </div>
    ${reps.length?`<div class="mt-5"><div class="text-sm font-semibold text-slate-600 mb-2">课代表积分</div>
      <div class="overflow-x-auto max-w-md"><table class="w-full text-sm">
        <thead><tr class="bg-slate-50 text-slate-500"><th class="text-left p-2">科目</th><th class="text-left p-2">日积分</th></tr></thead>
        <tbody>${repRows}</tbody></table></div></div>`:''}
    <p class="text-xs text-slate-400 mt-4">清空日积分则视为该职务不享受积分奖励。</p>
  </div>`;
  return html;
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
  for(const id in state.positions.deductionKeywords){ for(const kw of state.positions.deductionKeywords[id]){ if(lower.includes(kw.toLowerCase())) return id; } }
  return null;
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
  const batchId=uid();
  let cnt=0;
  chain.forEach(p=>{
    const sid=pmStudentIdByName(p.name);
    if(!sid) return;
    ptWriteLog(sid,'post',-Math.abs(pts),reason,batchId,'deduct');
    cnt++;
  });
  save(); render();
  alert('已对 '+cnt+' 人各扣 '+pts+' 分（任职赋分维度，可在积分管理-日志查看/撤销）。');
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
          <button onclick="enterOffline()" class="w-full text-gray-500 py-2 rounded-lg text-sm hover:bg-gray-50 transition">📴 本地离线使用（数据仅存本机，不上云）</button>
          <p id="login-err" class="text-xs text-red-500 text-center h-4"></p>
        </div>
        <p class="text-[11px] text-gray-300 text-center">默认账号 admin / admin123，登录后可在数据管理修改密码</p>
      </div>
    </div>`;
  const p = document.getElementById('login-pass');
  if (p) p.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

function enterOffline() {
  localStorage.setItem('ct_offline', '1');
  render();
  maybeOnboard();
}

function doLogin() {
  localStorage.removeItem('ct_offline');
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
} else if (localStorage.getItem('ct_offline') === '1') {
  render();
  maybeOnboard();
} else {
  showLogin();
}

