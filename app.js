'use strict';

/* ============================================================================
 * SIP-Scheduler — Gantt Chart & Project Scheduler (vanilla JS)
 * Studi kasus : Arsitektur Sistem Informasi
 * Proyek      : Perencanaan & Pengembangan Perangkat Lunak PT XYZ
 * Kalender    : Senin–Jumat kerja, Sabtu & Minggu libur, + 1 libur custom 17 Juli
 * ==========================================================================*/

/* ---------------------------- KONFIGURASI ------------------------------- */

const COL_W = 36;   // lebar 1 kolom hari (px)  — harus sama dengan --col-w
const ROW_H = 46;   // tinggi 1 baris tugas (px) — harus sama dengan --row-h
const PALETTE = ['#2f5fe0', '#0e9d8b', '#7c4ddb', '#e08a16', '#d63d76', '#12876f', '#5b6bd6'];

const CONFIG = {
  name: 'Perencanaan & Pengembangan Perangkat Lunak PT XYZ',
  course: 'Studi Kasus — Arsitektur Sistem Informasi',
  start: '2025-06-30',   // 30 Juni
  deadline: '2025-07-31', // 31 Juli
  holidays: [{ date: '2025-07-17', label: 'Acara internal tim' }]
};

const TEAM = [
  { id: 'r1', name: 'Ali',   role: 'Project Manager',      init: 'AL' },
  { id: 'r2', name: 'Budi',  role: 'System Analyst',       init: 'BU' },
  { id: 'r3', name: 'Citra', role: 'System Analyst',       init: 'CI' },
  { id: 'r4', name: 'Dika',  role: 'Programmer/Developer', init: 'DI' },
  { id: 'r5', name: 'Eka',   role: 'Programmer/Developer', init: 'EK' },
  { id: 'r6', name: 'Fajar', role: 'Tester',               init: 'FA' },
  { id: 'r7', name: 'Gita',  role: 'Tester',               init: 'GI' }
];

const DEFAULT_TASKS = [
  { id: 'T1', name: 'Analisis Kebutuhan',            dur: 5, pred: null, type: 'FS', lag: 0, res: ['r1', 'r2', 'r3'] },
  { id: 'T2', name: 'Analisis Sistem',               dur: 8, pred: 'T1', type: 'SS', lag: 3, res: ['r2', 'r3'] },
  { id: 'T3', name: 'Perancangan System & UI/DB',    dur: 7, pred: 'T2', type: 'SS', lag: 5, res: ['r3', 'r4'] },
  { id: 'T4', name: 'Implementasi / Coding',         dur: 5, pred: 'T3', type: 'FS', lag: 0, res: ['r4', 'r5'] },
  { id: 'T5', name: 'Pengujian / Testing',           dur: 2, pred: 'T4', type: 'FS', lag: 0, res: ['r6', 'r7'] },
  { id: 'T6', name: 'Penerapan & Pemeliharaan',      dur: 2, pred: 'T5', type: 'FS', lag: 0, res: ['r1', 'r4', 'r6'] }
];

const DEP_LABEL = { FS: 'Finish-to-Start', SS: 'Start-to-Start', FF: 'Finish-to-Finish', SF: 'Start-to-Finish' };

/* ---------------------------- STATE ------------------------------------- */

let state = freshState();
let schedule = null;
let showCritical = false;

function freshState() {
  return {
    name: CONFIG.name,
    course: CONFIG.course,
    start: CONFIG.start,
    deadline: CONFIG.deadline,
    holidays: CONFIG.holidays.map(h => ({ ...h })),
    tasks: DEFAULT_TASKS.map(t => ({ ...t, res: t.res.slice() }))
  };
}

/* ---------------------------- UTIL TANGGAL ------------------------------ */

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_PENDEK = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function key(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function addDays(dt, n) {
  const x = new Date(dt.getTime());
  x.setDate(x.getDate() + n);
  return x;
}
function diffDays(a, b) { // b - a (hari kalender)
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B - A) / 86400000);
}
function fmt(dt, withYear) {
  if (!dt) return '—';
  return dt.getDate() + ' ' + BULAN[dt.getMonth()] + (withYear ? ' ' + dt.getFullYear() : '');
}
function fmtLong(dt) {
  return HARI[dt.getDay()] + ', ' + dt.getDate() + ' ' + BULAN[dt.getMonth()] + ' ' + dt.getFullYear();
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function clip(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/* ---------------------------- KALENDER KERJA ---------------------------- */

function isWeekend(dt) { return dt.getDay() === 0 || dt.getDay() === 6; }
function isCustomHoliday(k) { return state.holidays.some(h => h.date === k); }

/**
 * Membangun daftar hari dari start → end.
 * rec = { date, k, dow, off, wd (indeks hari kerja, -1 bila libur), cal (indeks kalender) }
 */
function buildCalendar(startStr, endStr) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  const days = [], byKey = {}, workdays = [];
  let wd = 0;
  for (let dt = new Date(start); dt <= end; dt = addDays(dt, 1)) {
    const k = key(dt);
    const off = isWeekend(dt) || isCustomHoliday(k);
    const rec = { date: new Date(dt), k, dow: dt.getDay(), off, wd: off ? -1 : wd, cal: days.length };
    if (!off) { workdays.push(rec); wd++; }
    days.push(rec);
    byKey[k] = rec;
  }
  return { start, end, days, byKey, workdays, workCount: wd };
}

function holidayOn(k) {
  const h = state.holidays.find(x => x.date === k);
  return h ? h.label : 'Libur';
}

/* ---------------------------- ENGINE PENJADWALAN ------------------------ */

/**
 * Forward pass (ES/EF) + Backward pass (LS/LF) dengan aturan dependensi
 * FS / SS / FF / SF + lag, dihitung pada indeks hari kerja.
 */
function computeSchedule() {
  const tasks = state.tasks;
  const byId = {};
  tasks.forEach(t => { byId[t.id] = t; });

  const durOf = t => Math.max(1, parseInt(t.dur, 10) || 1);
  const lagOf = t => Math.max(0, parseInt(t.lag, 10) || 0);

  /* ---- dependensi ---- */
  const preds = {};
  tasks.forEach(t => {
    if (t.pred && byId[t.pred] && t.pred !== t.id) preds[t.id] = t.pred;
    else preds[t.id] = null;
    t._pred = preds[t.id];
  });
  const succ = {};
  tasks.forEach(t => { if (t._pred) (succ[t._pred] = succ[t._pred] || []).push(t); });

  /* ---- cycle detection ---- */
  let cyclic = false;
  (function checkCycle() {
    const seen = {};
    const walk = id => {
      if (seen[id] === 1) { cyclic = true; return; }
      if (seen[id] === 2) return;
      seen[id] = 1;
      (succ[id] || []).forEach(s => walk(s.id));
      seen[id] = 2;
    };
    tasks.forEach(t => walk(t.id));
  })();

  /* ---- forward pass ---- */
  const ES = {}, EF = {}, visF = {};
  function calcES(id) {
    if (ES[id] != null) return ES[id];
    if (visF[id]) { cyclic = true; return 0; }
    visF[id] = true;
    const t = byId[id];
    let es = 0;
    const p = t._pred;
    if (p) {
      const pes = calcES(p), pef = EF[p];
      const lag = lagOf(t), dur = durOf(t);
      if (t.type === 'SS') es = pes + lag;
      else if (t.type === 'FF') es = pef + lag - dur;
      else if (t.type === 'SF') es = pes + lag - dur;
      else es = pef + lag;                       // FS
    }
    es = Math.max(0, es);
    ES[id] = es;
    EF[id] = es + durOf(t);
    return es;
  }
  tasks.forEach(t => calcES(t.id));

  const projectEF = tasks.length ? Math.max.apply(null, tasks.map(t => EF[t.id])) : 0;

  /* ---- backward pass ---- */
  const LF = {}, visB = {};
  function calcLF(id) {
    if (LF[id] != null) return LF[id];
    if (visB[id]) return projectEF;   // guard cycle
    visB[id] = true;
    const t = byId[id];
    let lf = projectEF;
    const list = succ[id];
    if (list && list.length) {
      let m = Infinity;
      list.forEach(s => {
        const lag = lagOf(s), sdur = durOf(s);
        const slf = calcLF(s.id), sls = slf - sdur;
        let cand;
        if (s.type === 'FS') cand = sls - lag;
        else if (s.type === 'SS') cand = sls - lag + durOf(t);
        else if (s.type === 'FF') cand = slf - lag;
        else cand = slf - lag + durOf(t);        // SF
        if (cand < m) m = cand;
      });
      lf = m;
    }
    LF[id] = lf;
    return lf;
  }
  tasks.forEach(t => calcLF(t.id));

  /* ---- kalender & konversi indeks → tanggal ---- */
  const finishWD = projectEF;
  const projStart = parseDate(state.start);
  const deadlineD = parseDate(state.deadline);
  // horizon kalender yang cukup luas: 600 hari, batas proyek, atau kebutuhan total durasi
  const needDays = state.tasks.reduce((a, t) => a + Math.max(1, parseInt(t.dur, 10) || 1), 0) * 3 + 30;
  const horizon = new Date(Math.max(
    addDays(projStart, 600).getTime(),
    deadlineD.getTime(),
    addDays(projStart, needDays).getTime()
  ));
  const cal = buildCalendar(state.start, key(horizon));
  const lastWork = finishWD > 0 ? cal.workdays[Math.min(finishWD - 1, cal.workdays.length - 1)] : null;
  const realFinish = lastWork ? lastWork.date : projStart;

  const calOf = k => (cal.byKey[k] ? cal.byKey[k].cal : 0);

  /* ---- entitas tugas ---- */
  const rows = tasks.map((t, i) => {
    const es = ES[t.id], ef = EF[t.id], ls = LF[t.id] - durOf(t), lf = LF[t.id];
    const slack = ls - es;
    const startRec = cal.workdays[es] || cal.workdays[cal.workdays.length - 1];
    const finishRec = cal.workdays[ef - 1] || startRec;
    return {
      ...t,
      no: i + 1,
      color: PALETTE[i % PALETTE.length],
      dur: durOf(t), lag: lagOf(t), pred: t._pred,
      es, ef, ls, lf, slack,
      critical: slack === 0 && !cyclic,
      start: startRec.date, finish: finishRec.date,
      startCal: calOf(key(startRec.date)),
      endCal: calOf(key(finishRec.date)) + 1,
      res: (t.res || []).filter(r => TEAM.some(m => m.id === r))
    };
  });

  /* ---- kapasitas vs batas ---- */
  const dlRec = cal.byKey[state.deadline];
  let capacityWD = cal.workdays.filter(w => w.cal <= (dlRec ? dlRec.cal : Infinity)).length;
  const overrun = Math.max(0, finishWD - capacityWD);

  const criticalCount = rows.filter(r => r.critical).length;

  // kalender tampilan (Gantt): hanya dari mulai proyek → maks(batas, tanggal selesai)
  const displayEnd = new Date(Math.max(realFinish.getTime(), deadlineD.getTime()));
  const display = buildCalendar(state.start, key(displayEnd));

  return {
    cal, display, rows, cyclic,
    finishWD, finishDate: realFinish,
    capacityWD, overrun,
    criticalCount,
    duration: rows.reduce((a, t) => a + t.dur, 0),
    start: projStart,
    deadline: deadlineD
  };
}

/* ---------------------------- SUMBER DAYA ------------------------------ */

function resourceLoad() {
  const rows = schedule.rows;
  return TEAM.map(m => {
    const mine = rows.filter(t => t.res.includes(m.id));
    const load = mine.reduce((a, t) => a + t.dur, 0);
    // deteksi bentrok: dua tugas berjalan paralel untuk orang yang sama
    const conflicts = [];
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        const a = mine[i], b = mine[j];
        if (a.es < b.ef && b.es < a.ef) conflicts.push(a.name + ' ↔ ' + b.name);
      }
    }
    return { ...m, tasks: mine, load, conflicts };
  });
}

/* ============================ RENDERING ================================= */

const $ = sel => document.querySelector(sel);

function renderAll() {
  const sl = (() => { const el = $('#ganttScroll'); return el ? el.scrollLeft : 0; })();
  schedule = computeSchedule();
  renderHead();
  renderSummary();
  renderAlerts();
  renderGantt();
  renderCpm();
  renderPert();
  renderResources();
  renderManage();
  const el = $('#ganttScroll');
  if (el) el.scrollLeft = sl;
}

/* ------------------------------ HEAD ----------------------------------- */
function renderHead() {
  $('#courseLabel').textContent = state.course;
  $('#projectName').textContent = state.name;
  $('#projectSub').innerHTML =
    'Jangka waktu <b>' + fmt(schedule.start, true) + '</b> — <b>' + fmt(schedule.deadline, true) + '</b>' +
    ' · Kalender kerja: <b>Senin–Jumat</b>, Sabtu & Minggu libur' +
    (state.holidays.length
      ? ' · Libur custom: <b>' + state.holidays.map(h => fmt(parseDate(h.date), true) + ' (' + esc(h.label) + ')').join(', ') + '</b>'
      : '');
  $('#footStamp').textContent = 'Dirender ' + new Date().toLocaleString('id-ID');
}

/* ------------------------------ SUMMARY -------------------------------- */
function renderSummary() {
  const s = schedule;
  const diff = s.overrun;
  const badges = [
    { k: 'Mulai Proyek', v: fmt(s.start, true), c: '' },
    { k: 'Batas Akhir', v: fmt(s.deadline, true), c: '' },
    { k: 'Tanggal Selesai', v: fmt(s.finishDate, true), c: diff ? 'bad' : 'good' },
    { k: 'Durasi Total', v: s.finishWD + ' hari kerja', c: '' },
    { k: 'Hari Kerja Tersedia', v: s.capacityWD + ' hari', c: '' },
    { k: 'Selisih vs Batas', v: diff ? '+' + diff + ' hari (lewat)' : 'Tepat waktu', c: diff ? 'bad' : 'good' },
    { k: 'Tugas Kritis', v: s.criticalCount + ' / ' + s.rows.length, c: 'warn' },
    { k: 'Sumber Daya', v: TEAM.length + ' orang', c: '' }
  ];
  $('#summary').innerHTML = badges.map(b =>
    '<div class="badge ' + b.c + '"><span>' + b.k + '</span><b>' + esc(b.v) + '</b></div>'
  ).join('');
}

/* ------------------------------ ALERTS --------------------------------- */
function renderAlerts() {
  const s = schedule;
  const out = [];
  if (s.cyclic) {
    out.push('<div class="alert error"><span>⛔</span><div><b>Dependensi tidak valid</b>Terjadi siklus (loop) pada predecessor tugas. Periksa kolom Predecessor.</div></div>');
  }
  if (s.overrun > 0) {
    out.push('<div class="alert warn"><span>⚠️</span><div><b>Jadwal melewati batas proyek</b>' +
      'Rencana selesai <b>' + fmt(s.finishDate, true) + '</b>, sedangkan batas proyek <b>' + fmt(s.deadline, true) + '</b> ' +
      '— terlambat <b>' + s.overrun + ' hari kerja</b>. Hari libur 17 Juli memangkas 1 hari kerja dari total ' +
      s.capacityWD + ' hari kerja dalam periode 30 Juni – 31 Juli.</div></div>');
  }
  const res = resourceLoad();
  const bad = res.filter(r => r.conflicts.length);
  if (bad.length) {
    out.push('<div class="alert warn"><span>👥</span><div><b>Bentrok penugasan sumber daya</b>' +
      bad.map(r => esc(r.name) + ' ditugaskan pada tugas yang berjalan paralel (' + r.conflicts.map(esc).join('; ') + ')').join('<br>') +
      '</div></div>');
  }
  if (!s.cyclic && s.criticalCount === s.rows.length && s.rows.length) {
    out.push('<div class="alert info"><span>ℹ️</span><div><b>Seluruh tugas berada di jalur kritis (float = 0)</b>' +
      'Rantai dependensi SS + lag membuat setiap tugas saling mendorong: keterlambatan 1 hari di tugas mana pun akan ' +
      'menggeser tanggal selesai proyek. Tekan tombol <b>Show Critical Path</b> untuk menyorotnya.</div></div>');
  }
  $('#alerts').innerHTML = out.join('');
}

/* ============================== GANTT ================================== */

function renderGantt() {
  const s = schedule, days = s.display.days, W = days.length * COL_W;

  /* --- header bulan --- */
  let months = [], cur = null;
  days.forEach(d => {
    const label = BULAN[d.date.getMonth()] + ' ' + d.date.getFullYear();
    if (!cur || cur.label !== label) { cur = { label, n: 0 }; months.push(cur); }
    cur.n++;
  });
  const monthsHTML = months.map(m => '<div class="g-month" style="width:' + (m.n * COL_W) + 'px">' + m.label + '</div>').join('');

  /* --- header hari --- */
  const daysHTML = days.map(d => {
    const cls = ['g-day'];
    if (d.off) cls.push('off');
    if (d.dow === 1) cls.push('mon');
    if (d.off && d.dow !== 0 && d.dow !== 6) cls.push('holiday');
    const title = d.off ? esc(fmtLong(d.date) + ' — ' + holidayOn(d.k)) : esc(fmtLong(d.date) + ' — hari kerja');
    return '<div class="' + cls.join(' ') + '" title="' + title + '">' +
      '<span class="d">' + d.date.getDate() + '</span>' +
      '<span class="w">' + HARI_PENDEK[d.dow] + '</span></div>';
  }).join('');

  /* --- baris kiri (info tugas) --- */
  const leftRows = s.rows.map(t => {
    const crit = showCritical && t.critical;
    const dot = crit ? '' : ' style="background:' + t.color + '"';
    const names = t.res.map(id => (TEAM.find(m => m.id === id) || {}).name).filter(Boolean).join(', ');
    const tip = t.name + ' — ' + fmt(t.start, true) + ' → ' + fmt(t.finish, true) +
      (t.pred ? ' | setelah ' + (s.rows.find(x => x.id === t.pred) || {}).name + ' · ' + t.type + (t.lag ? '+' + t.lag : '') : ' | tanpa predecessor') +
      (names ? ' | ' + names : '');
    return '<div class="g-row' + (crit ? ' is-crit' : '') + '" title="' + esc(tip) + '">' +
      '<span class="idx"' + dot + '>' + t.no + '</span>' +
      '<span class="tname"><b>' + esc(t.name) + '</b><small>' +
        esc(names || 'belum ada resource') +
      '</small></span>' +
      '<span class="chip">' + t.dur + ' hr</span>' +
      '</div>';
  }).join('');

  /* --- lane kanan (kolom hari + bar + panah) --- */
  const lanes = s.rows.map((t, i) => {
    const crit = showCritical && t.critical;
    const cells = days.map(d => {
      const cls = ['g-cell'];
      if (d.off) cls.push('off');
      if (d.dow === 1) cls.push('mon');
      if (d.off && d.dow !== 0 && d.dow !== 6) cls.push('holiday');
      return '<i class="' + cls.join(' ') + '"></i>';
    }).join('');

    const left = t.startCal * COL_W;
    const width = Math.max(COL_W * 0.6, (t.endCal - t.startCal) * COL_W);

    // segmen libur di dalam bar (weekend / hari libur custom)
    let segs = '';
    for (let c = t.startCal; c < t.endCal; c++) {
      const d = days[c];
      if (d && d.off) {
        segs += '<i class="seg-off" style="left:' + ((c - t.startCal) * COL_W) + 'px;width:' + COL_W + 'px"></i>';
      }
    }

    const title = t.name + ' — ' + fmt(t.start, true) + ' → ' + fmt(t.finish, true) +
      ' (' + t.dur + ' hari kerja) | ES ' + t.es + ' / EF ' + t.ef + ' | LS ' + t.ls + ' / LF ' + t.lf +
      ' | Float ' + t.slack + (t.critical ? ' | JALUR KRITIS' : '') +
      ' | ' + (t.res.map(id => (TEAM.find(m => m.id === id) || {}).name).join(', ') || 'tanpa resource');

    const bar =
      '<div class="g-bar' + (crit ? ' crit' : '') + '" style="left:' + left + 'px;width:' + width + 'px;background:' + t.color + '" title="' + esc(title) + '">' +
        segs +
        '<span class="lbl">' + esc(t.name) + '</span>' +
        '<span class="dur">' + t.dur + 'h</span>' +
      '</div>';

    return '<div class="g-lane' + (crit ? ' is-crit' : '') + '">' + cells + bar + '</div>';
  }).join('');

  /* --- panah dependensi --- */
  const idxOf = id => s.rows.findIndex(t => t.id === id);
  const cy = i => i * ROW_H + ROW_H / 2;
  const links = s.rows.map((t, i) => {
    if (!t.pred) return '';
    const pi = idxOf(t.pred);
    if (pi < 0) return '';
    const p = s.rows[pi];
    const x1 = t.type === 'SS' || t.type === 'SF' ? p.startCal * COL_W : p.endCal * COL_W;
    const y1 = cy(pi), x2 = t.startCal * COL_W, y2 = cy(i);
    const gap = x2 - x1;
    let d;
    if (Math.abs(y2 - y1) < 1) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + Math.max(x1 + 14, x2 - 8) + ' ' + y2;
    } else if (gap >= 24) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + (x1 + 12) + ' ' + y1 + ' L ' + (x1 + 12) + ' ' + y2 + ' L ' + (x2 - 8) + ' ' + y2;
    } else {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + (y2 - 16);
    }
    const crit = showCritical && t.critical && p.critical;
    const lbl = t.type + (t.lag ? '+' + t.lag : '');
    const lx = (x1 + x2) / 2, ly = Math.min(y1, y2) - 6;
    return '<path d="' + d + '" class="' + (crit ? 'crit' : '') + '" marker-end="url(#arw' + (crit ? 'C' : 'N') + ')"></path>' +
      '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" class="' + (crit ? 'crit' : '') + '">' + lbl + '</text>';
  }).join('');

  const svgLinks = '<svg class="g-links" width="' + W + '" height="' + (s.rows.length * ROW_H) + '">' +
    '<defs>' +
      '<marker id="arwN" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#9aa5c2"/></marker>' +
      '<marker id="arwC" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#e0393f"/></marker>' +
    '</defs>' + links + '</svg>';

  /* --- garis batas proyek --- */
  const dlRec = s.display.byKey[state.deadline];
  const dlX = dlRec ? (dlRec.cal + 1) * COL_W : -1;
  const dlLine = dlX >= 0 ? '<div class="g-dl" style="left:' + dlX + 'px"><span>Batas ' + fmt(s.deadline) + '</span></div>' : '';

  const note = '<div class="gantt-note">' +
    '📅 Kalender kerja: <b>Sabtu & Minggu libur</b>' +
    state.holidays.map(h => ' · 1 hari libur custom: <b>' + fmtLong(parseDate(h.date)) + '</b> — ' + esc(h.label)).join('') +
    ' · Total hari kerja pada periode proyek: <b>' + s.capacityWD + ' hari</b>' +
    ' · Posisi batang = rentang tanggal kalender (bagian bergaris = hari libur di tengah tugas).' +
    '</div>';

  $('#gantt').innerHTML =
    '<div class="g-left">' +
      '<div class="gl-head">Tugas / Tahapan SDLC</div>' + leftRows +
    '</div>' +
    '<div class="g-scroll" id="ganttScroll">' +
      '<div class="g-inner" style="width:' + W + 'px">' +
        '<div class="g-months">' + monthsHTML + '</div>' +
        '<div class="g-days">' + daysHTML + '</div>' +
        '<div style="position:relative">' +
          lanes + svgLinks + dlLine +
        '</div>' +
      '</div>' +
    '</div>' + note;
}

/* ============================== CPM TABLE ============================== */

function renderCpm() {
  const s = schedule;
  $('#cpmHint').innerHTML = '<span class="pill ' + (s.criticalCount ? 'crit' : 'n') + '">' +
    s.criticalCount + ' tugas kritis</span> <span>Float 0 = tugas penentu tanggal selesai</span>';

  const body = s.rows.map(t => {
    const rel = (t.pred ? (s.rows.find(x => x.id === t.pred) || {}).name + ' · ' : '—') +
      (t.pred ? t.type + (t.lag ? ' + ' + t.lag + ' hari' : '') : '');
    return '<tr class="' + (t.critical ? 'crit' : '') + '">' +
      '<td class="num">' + t.no + '</td>' +
      '<td><b>' + esc(t.name) + '</b></td>' +
      '<td class="num">' + t.dur + '</td>' +
      '<td>' + esc(rel) + '</td>' +
      '<td>' + fmt(t.start, true) + '<span class="cellsub">hari kerja ke-' + (t.es + 1) + '</span></td>' +
      '<td>' + fmt(t.finish, true) + '<span class="cellsub">hari kerja ke-' + t.ef + '</span></td>' +
      '<td class="num">' + t.es + '</td><td class="num">' + t.ef + '</td>' +
      '<td class="num">' + t.ls + '</td><td class="num">' + t.lf + '</td>' +
      '<td class="num"><b>' + t.slack + '</b></td>' +
      '<td><span class="pill ' + (t.critical ? 'crit' : 'ok') + '">' + (t.critical ? 'KRITIS' : 'NORMAL') + '</span></td>' +
    '</tr>';
  }).join('');

  $('#cpmTable').innerHTML =
    '<table><thead><tr>' +
      '<th class="num">#</th><th>Tugas</th><th class="num">Durasi (hr)</th><th>Predecessor · Relasi</th>' +
      '<th>Mulai (ES)</th><th>Selesai (EF)</th>' +
      '<th class="num">ES</th><th class="num">EF</th><th class="num">LS</th><th class="num">LF</th>' +
      '<th class="num">Float</th><th>Status</th>' +
    '</tr></thead><tbody>' + body + '</tbody>' +
    '<tfoot><tr>' +
      '<td colspan="2">Total / Proyek</td>' +
      '<td class="num">' + s.duration + '</td>' +
      '<td colspan="3">' + fmt(s.start, true) + ' → ' + fmt(s.finishDate, true) +
        (s.overrun ? ' <span class="pill crit">lewat ' + s.overrun + ' hr</span>' : ' <span class="pill ok">tepat batas</span>') + '</td>' +
      '<td class="num">0</td><td class="num">' + s.finishWD + '</td>' +
      '<td class="num">' + (s.rows.length ? Math.min.apply(null, s.rows.map(t => t.ls)) : 0) + '</td><td class="num">' + s.finishWD + '</td>' +
      '<td class="num">0</td><td><span class="pill crit">' + s.criticalCount + ' kritis</span></td>' +
    '</tr></tfoot></table>';
}

/* =============================== PERT ================================== */

function renderPert() {
  const s = schedule;
  const NW = 216, NH = 96, GAP = 78, CAPW = 78, CAPH = 60;
  const nodes = [{ cap: true, label: 'START', w: CAPW }]
    .concat(s.rows.map(t => ({ t, w: NW })))
    .concat([{ cap: true, label: 'END', w: CAPW }]);

  let x = 26;
  nodes.forEach(n => { n.x = x; x += n.w + GAP; });
  const W = x - GAP + 26;
  const H = NH + 88;
  const NY = 40, CY = NY + (NH - CAPH) / 2;

  /* edges — digambar dari relasi predecessor sesungguhnya, bukan urutan array */
  const nodeOf = id => nodes.find(n => n.t && n.t.id === id);
  const startNode = nodes[0], endNode = nodes[nodes.length - 1];
  const centerY = n => (n.cap ? CY + CAPH / 2 : NY + NH / 2);
  const edges = [];

  function mkEdge(a, b, lbl) {
    if (!a || !b) return;
    const x1 = a.x + a.w, x2 = b.x, y1 = centerY(a), y2 = centerY(b);
    const crit = showCritical && a.t && b.t && a.t.critical && b.t.critical;
    const d = 'M ' + x1 + ' ' + y1 +
      ' C ' + (x1 + 38) + ' ' + y1 + ' ' + (x2 - 38) + ' ' + y2 + ' ' + (x2 - 9) + ' ' + y2;
    edges.push(
      '<path class="pert-edge' + (crit ? ' crit' : '') + '" d="' + d + '" marker-end="url(#parw' + (crit ? 'C' : 'N') + ')"></path>' +
      (lbl ? '<text class="' + (crit ? 'crit' : '') + '" x="' + ((x1 + x2) / 2) + '" y="' + ((y1 + y2) / 2 - 9) +
        '" text-anchor="middle" fill="' + (crit ? '#e0393f' : '#7b86a6') + '">' + lbl + '</text>' : '')
    );
  }

  s.rows.forEach(t => {
    const b = nodeOf(t.id);
    if (t.pred) mkEdge(nodeOf(t.pred), b, t.type + (t.lag ? ' + ' + t.lag : ''));
    else mkEdge(startNode, b, '');
  });
  s.rows.forEach(t => {
    if (!s.rows.some(x => x.pred === t.id)) mkEdge(nodeOf(t.id), endNode, '');
  });

  /* node tugas */
  const nodeHTML = nodes.map(n => {
    if (n.cap) {
      return '<g class="pert-node">' +
        '<rect x="' + n.x + '" y="' + CY + '" width="' + n.w + '" height="' + CAPH + '" rx="30" fill="' + (n.label === 'START' ? '#2f5fe0' : '#161c2c') + '"></rect>' +
        '<text x="' + (n.x + n.w / 2) + '" y="' + (CY + CAPH / 2 + 4) + '" text-anchor="middle" fill="#fff" font-size="12.5" font-weight="700" letter-spacing="1">' + n.label + '</text>' +
        '</g>';
    }
    const t = n.t, crit = showCritical && t.critical;
    const initials = (t.res.map(id => (TEAM.find(m => m.id === id) || {}).init).filter(Boolean).join(' ')) || '—';
    return '<g class="pert-node' + (crit ? ' crit' : '') + '">' +
      '<rect class="box" x="' + n.x + '" y="' + NY + '" width="' + NW + '" height="' + NH + '" rx="10"></rect>' +
      '<rect x="' + n.x + '" y="' + NY + '" width="5" height="' + NH + '" rx="2.5" fill="' + (crit ? '#e0393f' : t.color) + '"></rect>' +
      '<text class="nid" x="' + (n.x + 16) + '" y="' + (NY + 22) + '">' + t.id + ' · ' + (t.critical ? 'KRITIS' : 'NORMAL') + '</text>' +
      '<text class="nmeta" x="' + (n.x + NW - 14) + '" y="' + (NY + 22) + '" text-anchor="end">' + t.dur + ' hari kerja</text>' +
      '<text class="nname" x="' + (n.x + 16) + '" y="' + (NY + 44) + '">' + esc(clip(t.name, 25)) + '</text>' +
      '<text class="nmeta" x="' + (n.x + 16) + '" y="' + (NY + 63) + '">Mulai ' + fmt(t.start) + '  →  Selesai ' + fmt(t.finish) + '</text>' +
      '<text class="nmeta" x="' + (n.x + 16) + '" y="' + (NY + 81) + '">ES ' + t.es + '/' + t.ef + ' · LS ' + t.ls + '/' + t.lf + ' · Float ' + t.slack + '</text>' +
      '<text class="nmeta" x="' + (n.x + NW - 14) + '" y="' + (NY + 81) + '" text-anchor="end">' + esc(initials) + '</text>' +
      '</g>';
  }).join('');

  $('#pert').innerHTML =
    '<svg width="' + W + '" height="' + H + '" style="min-width:' + W + 'px">' +
      '<defs>' +
        '<marker id="parwN" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto"><path d="M0,0 L7,3.2 L0,6.4 z" fill="#93a0bd"/></marker>' +
        '<marker id="parwC" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto"><path d="M0,0 L7,3.2 L0,6.4 z" fill="#e0393f"/></marker>' +
      '</defs>' +
      '<text class="pert-cap" x="26" y="20">ALUR PERT — ' + s.rows.length + ' TAHAPAN SDLC</text>' +
      edges.join('') + nodeHTML +
    '</svg>';
}

/* ============================= RESOURCES =============================== */

function renderResources() {
  const list = resourceLoad();
  const cap = Math.max(1, schedule.finishWD);
  const conflicts = list.reduce((a, r) => a + r.conflicts.length, 0);
  $('#resHint').innerHTML = '<span class="pill ' + (conflicts ? 'crit' : 'ok') + '">' +
    (conflicts ? conflicts + ' bentrok' : 'tanpa bentrok') + '</span> <span>' + TEAM.length + ' anggota tim</span>';

  const cards = list.map((r, i) => {
    const pct = Math.min(100, Math.round(r.load / cap * 100));
    const tags = r.tasks.map(t =>
      '<span class="tag" title="' + esc(t.name + ' · ' + fmt(t.start, true) + ' → ' + fmt(t.finish, true)) + '">' +
      esc(t.name) + '</span>').join('') || '<span class="tag">belum ditugaskan</span>';
    return '<div class="res-card r' + ((i % 5) + 1) + '">' +
      '<div class="res-top">' +
        '<span class="avatar">' + r.init + '</span>' +
        '<div><b>' + esc(r.name) + '</b><small>' + esc(r.role) + '</small></div>' +
      '</div>' +
      '<div class="load"><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="txt"><span>' + r.tasks.length + ' tugas · ' + r.load + ' hari kerja</span><span>' + pct + '% dari ' + cap + ' hr</span></div>' +
      '</div>' +
      '<div class="res-tasks">' + tags + '</div>' +
      (r.conflicts.length
        ? '<div class="conflict">⚠ Bentrok: ' + r.conflicts.map(esc).join('; ') + '</div>'
        : '<div class="ok-note">✓ Tidak ada tugas paralel</div>') +
    '</div>';
  }).join('');

  /* matriks penugasan */
  const head = '<tr><th>Tugas</th>' + TEAM.map(m =>
    '<th style="text-align:center" title="' + esc(m.name + ' — ' + m.role) + '">' + m.init + '</th>').join('') +
    '<th class="num">Durasi</th></tr>';
  const body = schedule.rows.map(t =>
    '<tr' + (showCritical && t.critical ? ' class="crit"' : '') + '><td><b>' + esc(t.name) + '</b></td>' +
    TEAM.map(m => {
      const on = t.res.includes(m.id);
      return '<td style="text-align:center;color:' + (on ? '#2f5fe0' : '#d3d9e8') + ';font-weight:700">' + (on ? '●' : '·') + '</td>';
    }).join('') +
    '<td class="num">' + t.dur + ' hr</td></tr>').join('');

  $('#resources').innerHTML =
    '<div class="res-grid">' + cards + '</div>' +
    '<div class="res-table-wrap"><h3>Matriks Alokasi Tugas → Anggota Tim</h3>' +
      '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
    '</div>';
}

/* ============================== MANAGE ================================= */

function renderManage() {
  const s = schedule;
  const predOpts = (t) => {
    let o = '<option value="">— Tanpa predecessor —</option>';
    state.tasks.forEach(x => {
      if (x.id === t.id) return;
      o += '<option value="' + x.id + '"' + (t.pred === x.id ? ' selected' : '') + '>' + x.id + ' · ' + esc(x.name) + '</option>';
    });
    return o;
  };

  const rowsHTML = state.tasks.map((t, i) => {
    const cur = s.rows.find(r => r.id === t.id);
    return '<tr>' +
      '<td class="num">' + (i + 1) + '</td>' +
      '<td><input type="text" data-scope="task" data-id="' + t.id + '" data-field="name" value="' + esc(t.name) + '"></td>' +
      '<td><input type="number" min="1" max="60" data-scope="task" data-id="' + t.id + '" data-field="dur" value="' + (parseInt(t.dur, 10) || 1) + '"></td>' +
      '<td><select data-scope="task" data-id="' + t.id + '" data-field="pred">' + predOpts(t) + '</select></td>' +
      '<td><select data-scope="task" data-id="' + t.id + '" data-field="type">' +
        Object.keys(DEP_LABEL).map(k => '<option value="' + k + '"' + (t.type === k ? ' selected' : '') + '>' + k + ' — ' + DEP_LABEL[k] + '</option>').join('') +
      '</select></td>' +
      '<td><input type="number" min="0" max="60" data-scope="task" data-id="' + t.id + '" data-field="lag" value="' + (parseInt(t.lag, 10) || 0) + '"></td>' +
      '<td><div class="res-pick">' + TEAM.map(m =>
        '<button type="button" class="res-btn' + ((t.res || []).includes(m.id) ? ' on' : '') + '" ' +
        'data-act="toggle-res" data-id="' + t.id + '" data-res="' + m.id + '" title="' + esc(m.name + ' — ' + m.role) + '">' + m.init + '</button>'
      ).join('') + '</div></td>' +
      '<td>' + (cur ? '<span class="pill ' + (cur.critical ? 'crit' : 'n') + '">' + fmt(cur.start) + ' → ' + fmt(cur.finish) + '</span>' : '—') + '</td>' +
      '<td><button type="button" class="icon-btn" data-act="del-task" data-id="' + t.id + '" title="Hapus tugas">✕</button></td>' +
    '</tr>';
  }).join('');

  const holHTML = state.holidays.map(h =>
    '<span class="hol-chip">🎌 ' + fmtLong(parseDate(h.date)) + ' — ' + esc(h.label) +
    '<button type="button" data-act="del-hol" data-date="' + h.date + '" title="Hapus libur">✕</button></span>').join('');

  $('#manage').innerHTML =
    '<div class="manage-pad">' +
      '<div class="mgrid">' +
        '<div class="field"><label>Nama Proyek</label>' +
          '<input type="text" data-scope="project" data-field="name" value="' + esc(state.name) + '"></div>' +
        '<div class="field"><label>Mulai Proyek</label>' +
          '<input type="date" data-scope="project" data-field="start" value="' + state.start + '"></div>' +
        '<div class="field"><label>Batas Akhir Proyek</label>' +
          '<input type="date" data-scope="project" data-field="deadline" value="' + state.deadline + '"></div>' +
      '</div>' +

      '<div class="field"><label>Kalender — Hari Libur Custom (One-off Holiday)</label>' +
        '<div class="holidays">' + (holHTML || '<span class="tag">tidak ada libur custom</span>') +
          '<span class="hol-add">' +
            '<input type="date" id="holDate" value="2025-07-17">' +
            '<input type="text" id="holLabel" placeholder="Keterangan (opsional)" value="Acara internal tim">' +
            '<button type="button" class="mini-btn primary" data-act="add-hol">+ Tambah Libur</button>' +
          '</span>' +
        '</div>' +
        '<small style="color:var(--muted)">Sabtu & Minggu selalu libur (fixed). Tugas tidak boleh berjalan pada hari libur — otomatis digeser ke hari kerja berikutnya.</small>' +
      '</div>' +

      '<div class="field"><label>Daftar Tugas & Dependensi</label>' +
        '<div class="table-wrap"><table class="tasks-table"><thead><tr>' +
          '<th class="num">#</th><th>Nama Tugas</th><th>Durasi (hr)</th><th>Predecessor</th>' +
          '<th>Tipe Dependensi</th><th>Delay (hr)</th><th>Resource (klik inisial)</th><th>Jadwal</th><th></th>' +
        '</tr></thead><tbody>' + rowsHTML + '</tbody></table></div>' +
      '</div>' +

      '<div class="manage-actions">' +
        '<button type="button" class="mini-btn primary" data-act="add-task">+ Tambah Tugas</button>' +
        '<button type="button" class="mini-btn" data-act="reset">↺ Reset Data Studi Kasus</button>' +
        '<span style="color:var(--muted);font-size:12.5px;align-self:center">' +
          'Perubahan otomatis menghitung ulang Gantt, CPM, PERT & resource.</span>' +
      '</div>' +
    '</div>';
}

/* ============================ INTERAKSI ================================ */

function onManageChange(e) {
  const el = e.target;
  const scope = el.dataset.scope;
  if (!scope) return;
  const field = el.dataset.field;

  if (scope === 'project') {
    if (field === 'name') state.name = el.value.trim() || CONFIG.name;
    if (field === 'start') state.start = el.value || CONFIG.start;
    if (field === 'deadline') state.deadline = el.value || CONFIG.deadline;
    renderAll();
    return;
  }

  const t = state.tasks.find(x => x.id === el.dataset.id);
  if (!t) return;
  if (field === 'name') t.name = el.value.trim() || t.id;
  if (field === 'dur') t.dur = Math.max(1, parseInt(el.value, 10) || 1);
  if (field === 'lag') t.lag = Math.max(0, parseInt(el.value, 10) || 0);
  if (field === 'type') t.type = el.value;
  if (field === 'pred') t.pred = el.value || null;
  renderAll();
}

function onManageClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act, id = btn.dataset.id;

  if (act === 'toggle-res') {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.res = t.res || [];
    const rid = btn.dataset.res;
    t.res = t.res.includes(rid) ? t.res.filter(r => r !== rid) : t.res.concat(rid);
    renderAll();
  }

  if (act === 'del-task') {
    if (state.tasks.length <= 1) { toast('Minimal harus ada 1 tugas', true); return; }
    state.tasks = state.tasks.filter(x => x.id !== id);
    state.tasks.forEach(t => { if (t.pred === id) { t.pred = null; t.type = 'FS'; t.lag = 0; } });
    renderAll();
    toast('Tugas dihapus');
  }

  if (act === 'add-task') {
    let n = 1;
    while (state.tasks.some(t => t.id === 'T' + n)) n++;
    const last = state.tasks[state.tasks.length - 1];
    state.tasks.push({
      id: 'T' + n, name: 'Tugas Baru ' + n, dur: 3,
      pred: last ? last.id : null, type: 'FS', lag: 0, res: []
    });
    renderAll();
    toast('Tugas T' + n + ' ditambahkan');
  }

  if (act === 'add-hol') {
    const d = $('#holDate').value;
    if (!d) { toast('Pilih tanggal libur terlebih dahulu', true); return; }
    if (isWeekend(parseDate(d))) { toast('Tanggal tersebut sudah libur (weekend)', true); return; }
    if (state.holidays.some(h => h.date === d)) { toast('Tanggal sudah masuk daftar libur', true); return; }
    state.holidays.push({ date: d, label: ($('#holLabel').value || 'Libur custom').trim() });
    state.holidays.sort((a, b) => a.date < b.date ? -1 : 1);
    renderAll();
    toast('Libur custom ditambahkan');
  }

  if (act === 'del-hol') {
    state.holidays = state.holidays.filter(h => h.date !== btn.dataset.date);
    renderAll();
    toast('Libur custom dihapus');
  }

  if (act === 'reset') {
    state = freshState();
    renderAll();
    toast('Data studi kasus dikembalikan');
  }
}

/* ---------------------------- EKSPOR / IMPOR --------------------------- */

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJSON() {
  const data = {
    app: 'SIP-Scheduler', version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: state.name, course: state.course,
      start: state.start, deadline: state.deadline,
      holidays: state.holidays
    },
    team: TEAM,
    tasks: state.tasks.map(t => ({ id: t.id, name: t.name, dur: t.dur, pred: t.pred, type: t.type, lag: t.lag, res: t.res }))
  };
  download(slug(state.name) + '-jadwal.json', JSON.stringify(data, null, 2), 'application/json');
  toast('Data proyek disimpan ke JSON');
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'proyek';
}

function importJSON(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      const p = d.project || {};
      if (!Array.isArray(d.tasks) || !d.tasks.length) throw new Error('File tidak memuat daftar tugas.');
      state = {
        name: p.name || CONFIG.name,
        course: p.course || CONFIG.course,
        start: p.start || CONFIG.start,
        deadline: p.deadline || CONFIG.deadline,
        holidays: Array.isArray(p.holidays) ? p.holidays.map(h => ({ date: h.date, label: h.label || 'Libur' })) : [],
        tasks: d.tasks.map((t, i) => ({
          id: t.id || 'T' + (i + 1),
          name: t.name || 'Tugas ' + (i + 1),
          dur: Math.max(1, parseInt(t.dur, 10) || 1),
          pred: t.pred || null,
          type: DEP_LABEL[t.type] ? t.type : 'FS',
          lag: Math.max(0, parseInt(t.lag, 10) || 0),
          res: Array.isArray(t.res) ? t.res : []
        }))
      };
      renderAll();
      toast('Data proyek dimuat dari ' + file.name);
    } catch (err) {
      toast('Gagal memuat: ' + err.message, true);
    }
  };
  fr.onerror = () => toast('Gagal membaca file', true);
  fr.readAsText(file);
}

function exportCSV() {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const head = ['ID', 'Tugas', 'Durasi (hari kerja)', 'Predecessor', 'Tipe Dependensi', 'Delay',
    'Mulai', 'Selesai', 'ES', 'EF', 'LS', 'LF', 'Float', 'Status', 'Resource'];
  const lines = [head.map(q).join(',')];
  schedule.rows.forEach(t => {
    lines.push([
      t.id, t.name, t.dur, t.pred || '', t.type + ' (' + DEP_LABEL[t.type] + ')', t.lag,
      fmt(t.start, true), fmt(t.finish, true),
      t.es, t.ef, t.ls, t.lf, t.slack,
      t.critical ? 'JALUR KRITIS' : 'Normal',
      t.res.map(id => (TEAM.find(m => m.id === id) || {}).name).join('; ')
    ].map(q).join(','));
  });
  lines.push('');
  lines.push(q('Ringkasan') + ',' + q(
    'Mulai ' + fmt(schedule.start, true) + ' | Selesai ' + fmt(schedule.finishDate, true) +
    ' | Durasi ' + schedule.finishWD + ' hari kerja | Batas ' + fmt(schedule.deadline, true) +
    (schedule.overrun ? ' | LEWAT ' + schedule.overrun + ' hari kerja' : ' | Tepat batas')
  ));
  download(slug(state.name) + '-jadwal.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Jadwal diekspor ke CSV');
}


/* ---------------------------- TOAST ------------------------------------ */
let toastTimer = null;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------------------------- INIT ------------------------------------- */

function init() {
  $('#btnCritical').addEventListener('click', e => {
    showCritical = !showCritical;
    const b = e.currentTarget;
    b.setAttribute('aria-pressed', String(showCritical));
    b.innerHTML = '<span class="dot"></span> ' + (showCritical ? 'Sembunyikan Jalur Kritis' : 'Show Critical Path');
    renderAll();
  });
  $('#btnExportJson').addEventListener('click', exportJSON);
  $('#btnExportCsv').addEventListener('click', exportCSV);
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnReset').addEventListener('click', () => { state = freshState(); renderAll(); toast('Data studi kasus dikembalikan'); });
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) importJSON(f);
    e.target.value = '';
  });
  $('#manage').addEventListener('change', onManageChange);
  $('#manage').addEventListener('click', onManageClick);

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
