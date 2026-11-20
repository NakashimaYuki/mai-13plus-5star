const STORAGE_KEYS = {
  TIER_CUSTOM: 'mai13p_tier_custom_v1',
  SCORES: 'mai13p_scores_v1',
  AUTH: 'mai13p_auth_v1',
  MANUAL: 'mai13p_manual_checks_v1',
  PREFS: 'mai13p_prefs_v1',
};

const DIFF_LABELS = { 0: 'BASIC', 1: 'ADVANCED', 2: 'EXPERT', 3: 'MASTER', 4: 'Re:MASTER' };
const LOCAL_JACKET_URL = (id) => `./assets/covers/${id}.webp`;
const REMOTE_JACKET_URL = (id) => `https://assets2.lxns.net/maimai/jacket/${id}.png`;
const METRONOME_SVG = '<svg class="icon-metronome" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.8 14L6.8 2.5h2.4L11.2 14H4.8z"/><path d="M3.2 14h9.6"/><path d="M8 11.5L12.6 4.2"/><circle cx="11.2" cy="6.4" r="1.25" fill="currentColor" stroke="none"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.6 3.6 7.4-7.8"/></svg>';

const state = {
  defaultTierList: null,
  tierList: null,
  songMeta: {},       // sid -> { title, artist, bpm, version, genre, diffs: { standard: [...], dx: [...] } }
  versions: [],       // [{ id, title, version }]
  versionMap: {},     // versionCode -> { title, order }
  scores: {},         // chartKey -> { dxScore, achievements, fc, fs, rate }
  playerInfo: null,   // { source, name, rating, syncedAt }
  manualChecks: {},   // chartKey -> true
  dualTypeSongs: new Set(),

  view: 'tier',       // tier | gap | ds | version
  statusFilter: 'all',
  bpmOnly: false,
  diffFilter: 'all',
  search: '',
  tileSize: 'md',
  editMode: false,
  collapsed: new Set(),
  dragPayload: null,
  liveCatalogReady: false,
};

const $ = (id) => document.getElementById(id);

function chartKey(id, type, difficulty) {
  return `${id}_${type}_${difficulty}`;
}

function getBpmInfo(bpm) {
  const n = Number(bpm);
  if (!n || !Number.isInteger(n) || 3600 % n !== 0) {
    return { isGood: false, bpm: n || 0, desc: n ? '普通 BPM' : '未知 BPM' };
  }
  const perBeat = 3600 / n;
  if (900 % n === 0) {
    return {
      isGood: true,
      is900: true,
      bpm: n,
      desc: `好BPM（16分音符对齐 ${900 / n}F，4分 ${perBeat}F）`,
    };
  }
  if (1800 % n === 0) {
    return {
      isGood: true,
      is900: false,
      bpm: n,
      desc: `好BPM（8分音符对齐 ${1800 / n}F，4分 ${perBeat}F）`,
    };
  }
  return {
    isGood: true,
    is900: false,
    bpm: n,
    desc: `好BPM（4分音符对齐 ${perBeat}F）`,
  };
}

function computeDxInfo(notesTotal, dxScore) {
  const maxDx = notesTotal > 0 ? notesTotal * 3 : 0;
  if (!maxDx) {
    return { maxDx: 0, target5: 0, stars: 0, gapTo5: null, pct: 0, is5Star: false };
  }
  const target5 = Math.floor((maxDx * 97 + 99) / 100);
  if (dxScore == null) {
    return { maxDx, target5, stars: null, gapTo5: null, pct: 0, is5Star: false };
  }
  const ratio100 = dxScore * 100;
  let stars = 0;
  if (ratio100 >= maxDx * 97) stars = 5;
  else if (ratio100 >= maxDx * 95) stars = 4;
  else if (ratio100 >= maxDx * 93) stars = 3;
  else if (ratio100 >= maxDx * 90) stars = 2;
  else if (ratio100 >= maxDx * 85) stars = 1;

  const gapTo5 = Math.max(0, target5 - dxScore);
  return {
    maxDx,
    target5,
    stars,
    gapTo5,
    pct: (dxScore / maxDx) * 100,
    is5Star: stars === 5,
  };
}

function getVersionInfo(verCode) {
  if (!verCode) return { title: '未知版本', order: -1, code: 0 };
  if (state.versionMap[verCode]) return state.versionMap[verCode];
  let best = { title: `v${verCode}`, order: -1, code: verCode };
  for (let i = 0; i < state.versions.length; i++) {
    const v = state.versions[i];
    if (verCode >= v.version) {
      best = { title: v.title, order: i, code: v.version };
    }
  }
  return best;
}

function getChartRecord(item, tierObj, indexInTier) {
  const key = chartKey(item.id, item.type, item.difficulty);
  const song = state.songMeta[String(item.id)];
  const diffList = song?.diffs?.[item.type] || [];
  const diff = diffList.find((d) => d.difficulty === item.difficulty);
  const title = song?.title || item.title || `#${item.id}`;
  const artist = song?.artist || '';
  const bpm = song?.bpm || 0;
  const levelValue = diff?.levelValue ?? 0;
  const notesTotal = diff?.notesTotal ?? 0;
  const versionCode = diff?.version || song?.version || 0;
  const noteDesigner = diff?.noteDesigner || '';

  const score = state.scores[key] || null;
  const dx = computeDxInfo(notesTotal, score ? score.dxScore : null);
  const manualDone = Boolean(state.manualChecks[key]);
  const completed = dx.is5Star || manualDone;

  return {
    ...item,
    key,
    tierId: tierObj.id,
    tierName: tierObj.name,
    tierColor: tierObj.color,
    indexInTier,
    title,
    artist,
    bpm,
    bpmInfo: getBpmInfo(bpm),
    levelValue,
    notesTotal,
    versionCode,
    versionInfo: getVersionInfo(versionCode),
    noteDesigner,
    score,
    dx,
    manualDone,
    completed,
    played: score !== null,
  };
}

function getAllRecords() {
  const out = [];
  if (!state.tierList) return out;
  for (const tier of state.tierList.tiers) {
    tier.charts.forEach((ch, idx) => {
      out.push(getChartRecord(ch, tier, idx));
    });
  }
  return out;
}

function rebuildDualTypeSet() {
  const seen = new Map();
  if (!state.tierList) return;
  for (const tier of state.tierList.tiers) {
    for (const ch of tier.charts) {
      if (!seen.has(ch.id)) seen.set(ch.id, new Set());
      seen.get(ch.id).add(ch.type);
    }
  }
  state.dualTypeSongs = new Set();
  for (const [id, types] of seen.entries()) {
    if (types.size > 1) state.dualTypeSongs.add(id);
  }
}

function ingestFallbackMeta(raw) {
  state.versions = raw.versions || [];
  state.versionMap = {};
  state.versions.forEach((v, i) => {
    state.versionMap[v.version] = { title: v.title, order: i, code: v.version };
  });
  const map = {};
  for (const [sid, s] of Object.entries(raw.songs || {})) {
    const diffs = {};
    for (const ct of ['standard', 'dx']) {
      if (s.diffs?.[ct]) {
        diffs[ct] = s.diffs[ct].map((d) => ({
          difficulty: d.d,
          level: d.l,
          levelValue: d.v,
          notesTotal: d.n,
          version: d.ver,
          noteDesigner: d.nd || '',
        }));
      }
    }
    map[sid] = {
      id: Number(sid),
      title: s.t,
      artist: s.a || '',
      bpm: s.b || 0,
      version: s.ver || 0,
      genre: s.g || '',
      diffs,
    };
  }
  state.songMeta = map;
}

function ingestLiveLxnsCatalog(raw) {
  if (Array.isArray(raw.versions) && raw.versions.length) {
    state.versions = raw.versions;
    state.versionMap = {};
    state.versions.forEach((v, i) => {
      state.versionMap[v.version] = { title: v.title, order: i, code: v.version };
    });
  }
  const map = { ...state.songMeta };
  for (const s of raw.songs || []) {
    if (s.id >= 100000) continue;
    const diffs = {};
    for (const ct of ['standard', 'dx']) {
      const list = s.difficulties?.[ct];
      if (Array.isArray(list) && list.length) {
        diffs[ct] = list.map((d) => ({
          difficulty: d.difficulty,
          level: d.level,
          levelValue: d.level_value,
          notesTotal: d.notes?.total || 0,
          version: d.version || s.version || 0,
          noteDesigner: d.note_designer || '',
        }));
      }
    }
    map[String(s.id)] = {
      id: s.id,
      title: s.title,
      artist: s.artist || '',
      bpm: s.bpm || 0,
      version: s.version || 0,
      genre: s.genre || '',
      diffs,
    };
  }
  state.songMeta = map;
  state.liveCatalogReady = true;
}

function loadLocalStorage() {
  try {
    const savedScores = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCORES) || 'null');
    if (savedScores && savedScores.scores) {
      state.scores = savedScores.scores;
      state.playerInfo = savedScores.playerInfo || null;
    }
  } catch {}

  try {
    const manual = JSON.parse(localStorage.getItem(STORAGE_KEYS.MANUAL) || '{}');
    if (manual && typeof manual === 'object') state.manualChecks = manual;
  } catch {}

  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFS) || '{}');
    if (prefs.tileSize) state.tileSize = prefs.tileSize;
    if (prefs.view) state.view = prefs.view;
  } catch {}
}

function savePrefs() {
  localStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify({
    tileSize: state.tileSize,
    view: state.view,
  }));
}

function saveCustomTierList() {
  localStorage.setItem(STORAGE_KEYS.TIER_CUSTOM, JSON.stringify(state.tierList));
}

function getSavedAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH) || '{}');
  } catch {
    return {};
  }
}

function saveAuth(auth) {
  localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(auth));
}

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function matchesFilters(rec) {
  if (state.bpmOnly && !rec.bpmInfo.isGood) return false;
  if (state.diffFilter !== 'all' && String(rec.difficulty) !== state.diffFilter) return false;

  if (state.statusFilter === 'completed' && !rec.completed) return false;
  if (state.statusFilter === 'uncompleted' && rec.completed) return false;
  if (state.statusFilter === 'unplayed' && (rec.played || rec.completed)) return false;
  if (state.statusFilter === 'near') {
    if (rec.completed || !rec.played || rec.dx.gapTo5 == null || rec.dx.gapTo5 > 15) return false;
  }

  if (state.search) {
    const q = state.search.toLowerCase();
    const hit =
      rec.title.toLowerCase().includes(q) ||
      rec.artist.toLowerCase().includes(q) ||
      String(rec.id) === q ||
      String(rec.bpm) === q;
    if (!hit) return false;
  }
  return true;
}

function updateStats(allRecs) {
  const total = allRecs.length;
  const done = allRecs.filter((r) => r.completed).length;
  const pct = total ? ((done / total) * 100).toFixed(1) : '0.0';
  $('overallDoneNum').textContent = String(done);
  $('overallTotalNum').textContent = `/ ${total}`;
  $('overallPctNum').textContent = `${pct}%`;
  $('overallProgressFill').style.width = `${pct}%`;

  const nearCount = allRecs.filter(
    (r) => !r.completed && r.played && r.dx.gapTo5 != null && r.dx.gapTo5 <= 15
  ).length;
  $('statNearCount').textContent = String(nearCount);

  const bpmAll = allRecs.filter((r) => r.bpmInfo.isGood);
  const bpmDone = bpmAll.filter((r) => r.completed).length;
  $('statBpmProgress').textContent = `${bpmDone} / ${bpmAll.length}`;

  const auth = getSavedAuth();
  const hasSavedAuth = Boolean(
    (auth.source === 'df' && auth.dfToken) || (auth.lxnsToken)
  );
  $('btnQuickRefresh').style.display = hasSavedAuth ? '' : 'none';

  if (state.playerInfo) {
    const srcName = state.playerInfo.source === 'df' ? '水鱼' : '落雪';
    const timeStr = state.playerInfo.syncedAt
      ? new Date(state.playerInfo.syncedAt).toLocaleString('zh-CN', { hour12: false })
      : '';
    const namePart = state.playerInfo.name ? `${state.playerInfo.name}` : '已连接';
    const ratingPart = state.playerInfo.rating ? `（Rating ${state.playerInfo.rating}）` : '';
    $('syncStatusText').textContent = `${srcName}账号 ${namePart}${ratingPart}${timeStr ? `，同步于 ${timeStr}` : ''}`;
  } else {
    $('syncStatusText').textContent = '未同步查分器，接入落雪或水鱼后自动记录进度';
  }
}

function createTileEl(rec, showTierMini = false) {
  const el = document.createElement('div');
  const isNear = !rec.completed && rec.played && rec.dx.gapTo5 != null && rec.dx.gapTo5 <= 10;
  const hasBottomBar = !rec.completed && (rec.played || state.playerInfo !== null);

  el.className = 'tile';
  if (rec.completed) el.classList.add('is-completed');
  if (isNear) el.classList.add('is-near');
  if (!hasBottomBar) el.classList.add('no-bottom-bar');

  el.dataset.key = rec.key;
  el.dataset.tierId = rec.tierId;
  el.title = `${rec.title} [${rec.type.toUpperCase()} ${DIFF_LABELS[rec.difficulty]} ${rec.levelValue || ''}] BPM ${rec.bpm || '?'}`;

  const img = document.createElement('img');
  img.className = 'tile-cover';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = rec.title;
  img.src = LOCAL_JACKET_URL(rec.id);
  img.onerror = () => {
    img.onerror = null;
    img.src = REMOTE_JACKET_URL(rec.id);
  };
  el.appendChild(img);

  if (rec.difficulty === 4) {
    const b = document.createElement('span');
    b.className = 'badge-diff badge-diff-rem';
    b.textContent = 'Re:M';
    el.appendChild(b);
  } else if (rec.difficulty === 2) {
    const b = document.createElement('span');
    b.className = 'badge-diff badge-diff-exp';
    b.textContent = 'EXP';
    el.appendChild(b);
  }

  if (rec.bpmInfo.isGood) {
    const b = document.createElement('span');
    b.className = 'badge-bpm' + (rec.bpmInfo.is900 ? ' badge-bpm-900' : '');
    b.innerHTML = `${METRONOME_SVG}<span>${rec.bpm}</span>`;
    b.title = rec.bpmInfo.desc;
    el.appendChild(b);
  }

  if (state.dualTypeSongs.has(rec.id) || state.tileSize === 'lg') {
    const b = document.createElement('span');
    b.className = `badge-ctype ${rec.type === 'dx' ? 'badge-ctype-dx' : 'badge-ctype-std'}`;
    b.textContent = rec.type === 'dx' ? 'DX' : 'SD';
    el.appendChild(b);
  }

  if (showTierMini) {
    const b = document.createElement('span');
    b.className = 'badge-tier-mini';
    b.style.background = rec.tierColor;
    b.textContent = rec.tierName;
    el.appendChild(b);
  }

  if (rec.completed) {
    const ov = document.createElement('div');
    ov.className = 'check-overlay';
    ov.innerHTML = `<div class="check-circle">${CHECK_SVG}</div>`;
    el.appendChild(ov);
  } else if (rec.played && rec.dx.gapTo5 != null) {
    const bar = document.createElement('div');
    let cls = 'score-bar ';
    if (rec.dx.gapTo5 <= 10) cls += 'near';
    else if (rec.dx.stars === 4) cls += 'star-4';
    else if (rec.dx.stars === 3) cls += 'star-3';
    else cls += 'star-low';
    bar.className = cls;
    bar.textContent = `5★ -${rec.dx.gapTo5}`;
    el.appendChild(bar);
  } else if (state.playerInfo !== null) {
    const bar = document.createElement('div');
    bar.className = 'score-bar unplayed';
    bar.textContent = '未玩';
    el.appendChild(bar);
  }

  el.addEventListener('click', () => openDetailModal(rec));

  if (state.editMode && state.view === 'tier') {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      state.dragPayload = { key: rec.key, fromTierId: rec.tierId };
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', rec.key);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('is-dragging');
      document.querySelectorAll('.drag-over-tile, .drag-over-section').forEach((n) => {
        n.classList.remove('drag-over-tile', 'drag-over-section');
      });
      state.dragPayload = null;
    });
    el.addEventListener('dragover', (e) => {
      if (!state.dragPayload || state.dragPayload.key === rec.key) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('drag-over-tile');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over-tile'));
    el.addEventListener('drop', (e) => {
      if (!state.dragPayload || state.dragPayload.key === rec.key) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over-tile');
      moveChartTo(state.dragPayload.key, rec.tierId, rec.key);
    });
  }

  return el;
}

function renderTierView(allRecs) {
  const container = $('boardContainer');
  container.innerHTML = '';
  const ledger = document.createElement('div');
  ledger.className = 'tier-ledger';
  const byTier = new Map();
  for (const t of state.tierList.tiers) byTier.set(t.id, []);
  for (const r of allRecs) byTier.get(r.tierId)?.push(r);

  let shownTotal = 0;
  for (const tier of state.tierList.tiers) {
    const tierAll = byTier.get(tier.id) || [];
    const tierDone = tierAll.filter((r) => r.completed).length;
    const filtered = tierAll.filter(matchesFilters);
    shownTotal += filtered.length;

    if (!state.editMode && filtered.length === 0 && (state.search || state.bpmOnly || state.statusFilter !== 'all' || state.diffFilter !== 'all')) {
      continue;
    }

    const sec = document.createElement('section');
    sec.className = 'tier-section' + (state.collapsed.has(tier.id) ? ' collapsed' : '');
    sec.dataset.tierId = tier.id;

    const label = document.createElement('div');
    label.className = 'tier-label';
    label.style.background = tier.color;
    label.innerHTML = `
      <div class="tier-label-name">${escapeHtml(tier.name)}</div>
      <div class="tier-label-stats">${tierDone} / ${tierAll.length}</div>
    `;
    label.addEventListener('click', () => {
      if (state.collapsed.has(tier.id)) state.collapsed.delete(tier.id);
      else state.collapsed.add(tier.id);
      sec.classList.toggle('collapsed');
    });

    const grid = document.createElement('div');
    grid.className = 'tier-grid';
    for (const rec of filtered) {
      grid.appendChild(createTileEl(rec, false));
    }

    if (state.editMode) {
      sec.addEventListener('dragover', (e) => {
        if (!state.dragPayload) return;
        e.preventDefault();
        sec.classList.add('drag-over-section');
      });
      sec.addEventListener('dragleave', (e) => {
        if (!sec.contains(e.relatedTarget)) sec.classList.remove('drag-over-section');
      });
      sec.addEventListener('drop', (e) => {
        if (!state.dragPayload) return;
        e.preventDefault();
        sec.classList.remove('drag-over-section');
        moveChartTo(state.dragPayload.key, tier.id, null);
      });
    }

    sec.appendChild(label);
    sec.appendChild(grid);
    ledger.appendChild(sec);
  }

  if (shownTotal === 0 && !state.editMode) {
    container.innerHTML = '<div class="empty-box">当前筛选条件下没有匹配的谱面。</div>';
  } else {
    container.appendChild(ledger);
  }
}

function renderGroupedView(groups) {
  const container = $('boardContainer');
  container.innerHTML = '';
  let shownTotal = 0;

  for (const g of groups) {
    const filtered = g.items.filter(matchesFilters);
    if (filtered.length === 0) continue;
    shownTotal += filtered.length;
    const doneCount = g.items.filter((r) => r.completed).length;

    const sec = document.createElement('section');
    sec.className = 'group-section' + (state.collapsed.has(g.id) ? ' collapsed' : '');

    const head = document.createElement('div');
    head.className = 'group-header';
    head.innerHTML = `
      <div class="group-title">${escapeHtml(g.title)}</div>
      <div class="group-stats">显示 ${filtered.length}，已 5★ ${doneCount} / ${g.items.length}</div>
    `;
    head.addEventListener('click', () => {
      if (state.collapsed.has(g.id)) state.collapsed.delete(g.id);
      else state.collapsed.add(g.id);
      sec.classList.toggle('collapsed');
    });

    const grid = document.createElement('div');
    grid.className = 'tier-grid';
    for (const rec of filtered) {
      grid.appendChild(createTileEl(rec, true));
    }

    sec.appendChild(head);
    sec.appendChild(grid);
    container.appendChild(sec);
  }

  if (shownTotal === 0) {
    container.innerHTML = '<div class="empty-box">当前筛选条件下没有匹配的谱面。</div>';
  }
}

function renderBoard() {
  if (!state.tierList) return;
  const allRecs = getAllRecords();
  updateStats(allRecs);

  const board = $('boardContainer');
  board.className = `board size-${state.tileSize}` + (state.editMode ? ' edit-mode' : '');

  if (state.view === 'tier') {
    renderTierView(allRecs);
    return;
  }

  if (state.view === 'gap') {
    const near = [];
    const restPlayed = [];
    const unplayed = [];
    const completed = [];
    for (const r of allRecs) {
      if (r.completed) completed.push(r);
      else if (r.played && r.dx.gapTo5 != null) {
        if (r.dx.gapTo5 <= 15) near.push(r);
        else restPlayed.push(r);
      } else {
        unplayed.push(r);
      }
    }
    const byGap = (a, b) => (a.dx.gapTo5 ?? 99999) - (b.dx.gapTo5 ?? 99999) || b.levelValue - a.levelValue;
    near.sort(byGap);
    restPlayed.sort(byGap);
    completed.sort((a, b) => (b.dx.pct || 0) - (a.dx.pct || 0));

    renderGroupedView([
      { id: 'gap_near', title: '5★ -15 以内', items: near },
      { id: 'gap_rest', title: '其余未 5★（按差值升序）', items: restPlayed },
      { id: 'gap_unplayed', title: '未游玩', items: unplayed },
      { id: 'gap_done', title: '已达成 5★', items: completed },
    ]);
    return;
  }

  if (state.view === 'ds') {
    const buckets = new Map();
    for (const r of allRecs) {
      const k = r.levelValue ? r.levelValue.toFixed(1) : '未知';
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }
    const sortedKeys = [...buckets.keys()].sort((a, b) => parseFloat(b) - parseFloat(a));
    const groups = sortedKeys.map((k) => {
      const items = buckets.get(k);
      items.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.dx.gapTo5 ?? 99999) - (b.dx.gapTo5 ?? 99999);
      });
      return { id: `ds_${k}`, title: `定数 ${k}`, items };
    });
    renderGroupedView(groups);
    return;
  }

  if (state.view === 'version') {
    const buckets = new Map();
    for (const r of allRecs) {
      const vi = r.versionInfo;
      const k = vi.title;
      if (!buckets.has(k)) buckets.set(k, { order: vi.order, items: [] });
      buckets.get(k).items.push(r);
    }
    const sortedEntries = [...buckets.entries()].sort((a, b) => b[1].order - a[1].order);
    const groups = sortedEntries.map(([title, data]) => {
      data.items.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.dx.gapTo5 ?? 99999) - (b.dx.gapTo5 ?? 99999);
      });
      return { id: `ver_${title}`, title, items: data.items };
    });
    renderGroupedView(groups);
  }
}

function openDetailModal(rec) {
  $('detailTitle').textContent = rec.title;
  const diffTagClass = rec.difficulty === 4 ? 'tag-rem' : rec.difficulty === 2 ? 'tag-exp' : 'tag-mas';

  const scoreSection = rec.played
    ? `
      <div class="detail-grid">
        <div>
          <div class="kv-k">当前 DX 分 / 满分</div>
          <div class="kv-v">${rec.score.dxScore} / ${rec.dx.maxDx || '?'} (${rec.dx.pct ? rec.dx.pct.toFixed(2) + '%' : '-'})</div>
        </div>
        <div>
          <div class="kv-k">当前星级 / 距 5★</div>
          <div class="kv-v ${rec.dx.is5Star ? 'good' : rec.dx.gapTo5 <= 15 ? 'hot' : ''}">
            ${rec.dx.stars}★ · ${rec.dx.is5Star ? `已 5★ (+${rec.score.dxScore - rec.dx.target5})` : `5★ -${rec.dx.gapTo5}（线 ${rec.dx.target5}）`}
          </div>
        </div>
        <div>
          <div class="kv-k">达成率</div>
          <div class="kv-v">${rec.score.achievements != null ? rec.score.achievements.toFixed(4) + '%' : '-'}</div>
        </div>
        <div>
          <div class="kv-k">总物量</div>
          <div class="kv-v">${rec.notesTotal || '?'} Notes</div>
        </div>
      </div>
    `
    : `
      <div class="detail-grid">
        <div>
          <div class="kv-k">游玩记录</div>
          <div class="kv-v">暂无记录</div>
        </div>
        <div>
          <div class="kv-k">5★ 门槛 / 满分</div>
          <div class="kv-v">${rec.dx.target5 || '?'} / ${rec.dx.maxDx || '?'} (${rec.notesTotal || '?'} Notes)</div>
        </div>
      </div>
    `;

  const tierOptions = state.tierList.tiers
    .map((t) => `<option value="${t.id}" ${t.id === rec.tierId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
    .join('');

  $('detailBody').innerHTML = `
    <div class="detail-top">
      <img class="detail-cover" src="${LOCAL_JACKET_URL(rec.id)}" onerror="this.onerror=null;this.src='${REMOTE_JACKET_URL(rec.id)}'" alt="${escapeHtml(rec.title)}" />
      <div class="detail-meta">
        <div class="detail-song-title">${escapeHtml(rec.title)}</div>
        <div class="detail-artist">${escapeHtml(rec.artist || '未知曲师')}${rec.noteDesigner ? ` · 谱师：${escapeHtml(rec.noteDesigner)}` : ''}</div>
        <div class="detail-tags">
          <span class="tag ${diffTagClass}">${DIFF_LABELS[rec.difficulty]} ${rec.levelValue ? rec.levelValue.toFixed(1) : ''}</span>
          <span class="tag">${rec.type === 'dx' ? 'DX 谱' : '标准谱'}</span>
          <span class="tag">${escapeHtml(rec.versionInfo.title)}</span>
          <span class="tag" style="background:${rec.tierColor};color:#11131a;border:none">${escapeHtml(rec.tierName)}</span>
        </div>
      </div>
    </div>

    <div class="detail-card">
      <div class="kv-k">BPM 与帧对齐</div>
      <div class="kv-v ${rec.bpmInfo.isGood ? 'gold' : ''}">
        BPM ${rec.bpm || '?'} · ${escapeHtml(rec.bpmInfo.desc)}
      </div>
    </div>

    <div class="detail-card">
      ${scoreSection}
    </div>

    <div class="detail-actions">
      <button class="btn btn-sm ${rec.manualDone ? 'btn-secondary' : 'btn-quiet'}" id="btnManualToggle">
        ${rec.manualDone ? '已手动标 5★（点击取消）' : '手动标为已 5★'}
      </button>
      <select class="select-input" id="selectMoveTier" title="调整难度档位">
        ${tierOptions}
      </select>
      <button class="btn btn-sm btn-primary" id="btnApplyTierMove">移至该档</button>
      ${state.editMode ? '<button class="btn btn-sm btn-danger" id="btnRemoveChart">移出榜单</button>' : ''}
    </div>
  `;

  $('btnManualToggle').addEventListener('click', () => {
    if (state.manualChecks[rec.key]) delete state.manualChecks[rec.key];
    else state.manualChecks[rec.key] = true;
    localStorage.setItem(STORAGE_KEYS.MANUAL, JSON.stringify(state.manualChecks));
    closeModal('detailModal');
    renderBoard();
    showToast(state.manualChecks[rec.key] ? '已手动标记为 5★' : '已取消手动标记');
  });

  $('btnApplyTierMove').addEventListener('click', () => {
    const targetTierId = $('selectMoveTier').value;
    if (targetTierId !== rec.tierId) {
      moveChartTo(rec.key, targetTierId, null);
      closeModal('detailModal');
      showToast('已调整档位（记得导出 JSON 保存）');
    } else {
      closeModal('detailModal');
    }
  });

  const rmBtn = $('btnRemoveChart');
  if (rmBtn) {
    rmBtn.addEventListener('click', () => {
      removeChartFromList(rec.key);
      closeModal('detailModal');
      showToast('已从榜单移除');
    });
  }

  $('detailModal').style.display = 'flex';
}

function moveChartTo(sourceKey, targetTierId, beforeKey) {
  let moving = null;
  for (const t of state.tierList.tiers) {
    const idx = t.charts.findIndex((c) => chartKey(c.id, c.type, c.difficulty) === sourceKey);
    if (idx !== -1) {
      moving = t.charts.splice(idx, 1)[0];
      break;
    }
  }
  if (!moving) return;

  const targetTier = state.tierList.tiers.find((t) => t.id === targetTierId);
  if (!targetTier) return;

  if (beforeKey) {
    const bIdx = targetTier.charts.findIndex((c) => chartKey(c.id, c.type, c.difficulty) === beforeKey);
    if (bIdx !== -1) {
      targetTier.charts.splice(bIdx, 0, moving);
    } else {
      targetTier.charts.push(moving);
    }
  } else {
    targetTier.charts.push(moving);
  }

  state.tierList.updatedAt = new Date().toISOString().slice(0, 10);
  saveCustomTierList();
  rebuildDualTypeSet();
  renderBoard();
}

function removeChartFromList(targetKey) {
  for (const t of state.tierList.tiers) {
    const idx = t.charts.findIndex((c) => chartKey(c.id, c.type, c.difficulty) === targetKey);
    if (idx !== -1) {
      t.charts.splice(idx, 1);
      break;
    }
  }
  state.tierList.updatedAt = new Date().toISOString().slice(0, 10);
  saveCustomTierList();
  rebuildDualTypeSet();
  renderBoard();
}

function openUpdatesModal() {
  const inList = new Set();
  for (const t of state.tierList.tiers) {
    for (const c of t.charts) inList.add(chartKey(c.id, c.type, c.difficulty));
  }

  const catalog13p = new Map();
  for (const song of Object.values(state.songMeta)) {
    for (const ct of ['standard', 'dx']) {
      for (const d of song.diffs?.[ct] || []) {
        if (d.level === '13+') {
          const k = chartKey(song.id, ct, d.difficulty);
          catalog13p.set(k, {
            id: song.id,
            type: ct,
            difficulty: d.difficulty,
            title: song.title,
            levelValue: d.levelValue,
            bpm: song.bpm,
          });
        }
      }
    }
  }

  const additions = [];
  for (const [k, item] of catalog13p.entries()) {
    if (!inList.has(k)) additions.push(item);
  }

  const removals = [];
  for (const t of state.tierList.tiers) {
    for (const c of t.charts) {
      const k = chartKey(c.id, c.type, c.difficulty);
      if (!catalog13p.has(k)) {
        removals.push({ ...c, key: k, tierName: t.name });
      }
    }
  }

  const tierOpts = state.tierList.tiers
    .map((t) => `<option value="${t.id}" ${t.id === 'yiban' ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
    .join('');

  let html = '';
  if (!additions.length && !removals.length) {
    html = `<div class="feedback-msg ok">当前榜单与最新曲库完全一致（共 ${catalog13p.size} 张国服 13+ 谱面），暂无新增或变动。</div>`;
  } else {
    if (additions.length) {
      html += `<h3 class="update-heading">新增的 13+ 谱面（${additions.length} 张）</h3><div class="update-list">`;
      for (const a of additions) {
        const k = chartKey(a.id, a.type, a.difficulty);
        html += `
          <div class="update-item" data-add-key="${k}">
            <img src="${LOCAL_JACKET_URL(a.id)}" onerror="this.onerror=null;this.src='${REMOTE_JACKET_URL(a.id)}'" alt="" />
            <div class="update-item-info">
              <div class="update-item-title">${escapeHtml(a.title)}</div>
              <div class="update-item-sub">${a.type.toUpperCase()} ${DIFF_LABELS[a.difficulty]} ${a.levelValue} · BPM ${a.bpm}</div>
            </div>
            <div class="update-item-ctrl">
              <select class="select-input" style="width:96px;padding:6px 8px;font-size:0.84rem">${tierOpts}</select>
              <button class="btn btn-sm btn-primary btn-do-add" data-id="${a.id}" data-type="${a.type}" data-diff="${a.difficulty}" data-title="${escapeHtml(a.title)}">加入</button>
            </div>
          </div>`;
      }
      html += '</div>';
    }

    if (removals.length) {
      html += `<h3 class="update-heading" style="margin-top:18px">已不再是 13+ 的谱面（${removals.length} 张）</h3><div class="update-list">`;
      for (const r of removals) {
        html += `
          <div class="update-item" data-rm-key="${r.key}">
            <img src="${LOCAL_JACKET_URL(r.id)}" onerror="this.onerror=null;this.src='${REMOTE_JACKET_URL(r.id)}'" alt="" />
            <div class="update-item-info">
              <div class="update-item-title">${escapeHtml(r.title)}</div>
              <div class="update-item-sub">当前位于「${escapeHtml(r.tierName)}」 · ${r.type.toUpperCase()} ${DIFF_LABELS[r.difficulty]}</div>
            </div>
            <button class="btn btn-sm btn-danger btn-do-rm" data-key="${r.key}">移除</button>
          </div>`;
      }
      html += '</div>';
    }
  }

  $('updatesBody').innerHTML = html;

  $('updatesBody').querySelectorAll('.btn-do-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.update-item');
      const tid = row.querySelector('select').value;
      const tier = state.tierList.tiers.find((t) => t.id === tid);
      if (tier) {
        tier.charts.push({
          id: Number(btn.dataset.id),
          type: btn.dataset.type,
          difficulty: Number(btn.dataset.diff),
          title: btn.dataset.title,
        });
        state.tierList.updatedAt = new Date().toISOString().slice(0, 10);
        saveCustomTierList();
        rebuildDualTypeSet();
        renderBoard();
        row.remove();
        showToast(`已加入「${tier.name}」`);
      }
    });
  });

  $('updatesBody').querySelectorAll('.btn-do-rm').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeChartFromList(btn.dataset.key);
      btn.closest('.update-item').remove();
      showToast('已移出榜单');
    });
  });

  $('updatesModal').style.display = 'flex';
}

async function syncFromLxns(token) {
  const headers = { 'X-User-Token': token.trim() };
  const [scoresRes, playerRes] = await Promise.all([
    fetch('https://maimai.lxns.net/api/v0/user/maimai/player/scores', { headers }),
    fetch('https://maimai.lxns.net/api/v0/user/maimai/player', { headers }).catch(() => null),
  ]);

  if (!scoresRes.ok) {
    let msg = `HTTP ${scoresRes.status}`;
    try {
      const err = await scoresRes.json();
      if (err?.message) msg = `${scoresRes.status}: ${err.message}`;
    } catch {}
    throw new Error(`落雪同步失败（${msg}），请检查个人 API 密钥是否正确`);
  }

  const scoresJson = await scoresRes.json();
  const list = Array.isArray(scoresJson?.data)
    ? scoresJson.data
    : Array.isArray(scoresJson?.data?.scores)
      ? scoresJson.data.scores
      : [];

  const scoreMap = {};
  for (const s of list) {
    if (s.level_index == null) continue;
    const ct = s.type === 'dx' ? 'dx' : 'standard';
    const k = chartKey(s.id, ct, s.level_index);
    scoreMap[k] = {
      dxScore: Number(s.dx_score || 0),
      achievements: Number(s.achievements || 0),
      fc: s.fc || '',
      fs: s.fs || '',
      rate: s.rate || '',
    };
  }

  let name = '';
  let rating = 0;
  if (playerRes && playerRes.ok) {
    try {
      const pj = await playerRes.json();
      name = pj?.data?.name || '';
      rating = pj?.data?.rating || 0;
    } catch {}
  }

  return {
    scores: scoreMap,
    playerInfo: { source: 'lxns', name, rating, syncedAt: Date.now() },
    count: list.length,
  };
}

async function syncFromDivingFish(token) {
  const res = await fetch('https://www.diving-fish.com/api/maimaidxprober/player/records', {
    headers: { 'Import-Token': token.trim() },
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.message) msg = `${res.status}: ${err.message}`;
    } catch {}
    throw new Error(`水鱼同步失败（${msg}），请检查 Import-Token 是否正确`);
  }

  const data = await res.json();
  const records = Array.isArray(data?.records) ? data.records : [];
  const scoreMap = {};
  for (const r of records) {
    const sid = Number(r.song_id);
    if (!sid || sid >= 100000) continue;
    const ct = r.type === 'DX' ? 'dx' : 'standard';
    const baseId = ct === 'dx' && sid >= 10000 ? sid - 10000 : sid;
    const k = chartKey(baseId, ct, Number(r.level_index));
    scoreMap[k] = {
      dxScore: Number(r.dxScore || 0),
      achievements: Number(r.achievements || 0),
      fc: r.fc || '',
      fs: r.fs || '',
      rate: r.rate || '',
    };
  }

  return {
    scores: scoreMap,
    playerInfo: {
      source: 'df',
      name: data.nickname || data.username || '',
      rating: data.rating || 0,
      syncedAt: Date.now(),
    },
    count: records.length,
  };
}

async function performSync(source, token, feedbackEl = null) {
  if (!token || !token.trim()) {
    throw new Error('请先输入 API 密钥 / Token');
  }
  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.className = 'feedback-msg ok';
    feedbackEl.textContent = '正在拉取最新成绩...';
  }

  const result = source === 'df'
    ? await syncFromDivingFish(token)
    : await syncFromLxns(token);

  state.scores = result.scores;
  state.playerInfo = result.playerInfo;
  localStorage.setItem(STORAGE_KEYS.SCORES, JSON.stringify({
    scores: state.scores,
    playerInfo: state.playerInfo,
  }));

  const auth = getSavedAuth();
  auth.source = source;
  if (source === 'df') auth.dfToken = token.trim();
  else auth.lxnsToken = token.trim();
  saveAuth(auth);

  renderBoard();
  return result;
}

function closeModal(id) {
  $(id).style.display = 'none';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function bindEvents() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) bd.style.display = 'none';
    });
  });

  // View mode
  $('viewModeGroup').querySelectorAll('.view-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      $('viewModeGroup').querySelectorAll('.view-tab').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      savePrefs();
      renderBoard();
    });
  });

  // Status filters
  $('statusFilterGroup').querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.statusFilter = btn.dataset.status;
      $('statusFilterGroup').querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderBoard();
    });
  });

  // Quick stat pills
  $('pillNear5').addEventListener('click', () => {
    const next = state.statusFilter === 'near' ? 'all' : 'near';
    state.statusFilter = next;
    $('statusFilterGroup').querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.status === next));
    if (next === 'near') {
      state.view = 'gap';
      $('viewModeGroup').querySelectorAll('.view-tab').forEach((b) => {
        const active = b.dataset.view === 'gap';
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      savePrefs();
    }
    renderBoard();
  });

  $('pillBpm3600').addEventListener('click', () => {
    state.bpmOnly = !state.bpmOnly;
    $('filterBpmToggle').classList.toggle('active', state.bpmOnly);
    $('filterBpmToggle').setAttribute('aria-pressed', String(state.bpmOnly));
    renderBoard();
  });

  $('filterBpmToggle').addEventListener('click', () => {
    state.bpmOnly = !state.bpmOnly;
    $('filterBpmToggle').classList.toggle('active', state.bpmOnly);
    $('filterBpmToggle').setAttribute('aria-pressed', String(state.bpmOnly));
    renderBoard();
  });

  // Diff filters
  $('diffFilterGroup').querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.diffFilter = btn.dataset.diff;
      $('diffFilterGroup').querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderBoard();
    });
  });

  // Tile size
  document.querySelectorAll('.density-group .filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tileSize = btn.dataset.size;
      document.querySelectorAll('.density-group .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      savePrefs();
      renderBoard();
    });
  });

  // Search
  $('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    renderBoard();
  });

  // Sync Modal
  let activeSource = 'lxns';
  const switchSourceTab = (src) => {
    activeSource = src;
    $('sourceTabs').querySelectorAll('.source-tab').forEach((b) => b.classList.toggle('active', b.dataset.source === src));
    $('panelLxns').style.display = src === 'lxns' ? '' : 'none';
    $('panelDf').style.display = src === 'df' ? '' : 'none';
    $('syncFeedback').style.display = 'none';
  };
  $('sourceTabs').querySelectorAll('.source-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchSourceTab(btn.dataset.source));
  });

  $('btnOpenSync').addEventListener('click', () => {
    const auth = getSavedAuth();
    $('lxnsTokenInput').value = auth.lxnsToken || '';
    $('dfTokenInput').value = auth.dfToken || '';
    switchSourceTab(auth.source || 'lxns');
    $('syncModal').style.display = 'flex';
  });

  $('btnDoSync').addEventListener('click', async () => {
    const btn = $('btnDoSync');
    const fb = $('syncFeedback');
    const token = activeSource === 'df' ? $('dfTokenInput').value : $('lxnsTokenInput').value;
    btn.disabled = true;
    try {
      const res = await performSync(activeSource, token, fb);
      fb.className = 'feedback-msg ok';
      fb.textContent = `同步成功，共拉取 ${res.count} 条成绩！`;
      setTimeout(() => closeModal('syncModal'), 600);
      showToast(`已同步 ${res.count} 条成绩`);
    } catch (err) {
      fb.style.display = 'block';
      fb.className = 'feedback-msg error';
      fb.textContent = err.message || '同步失败';
    } finally {
      btn.disabled = false;
    }
  });

  $('btnQuickRefresh').addEventListener('click', async () => {
    const auth = getSavedAuth();
    const src = auth.source || (auth.lxnsToken ? 'lxns' : 'df');
    const token = src === 'df' ? auth.dfToken : auth.lxnsToken;
    if (!token) {
      $('btnOpenSync').click();
      return;
    }
    const btn = $('btnQuickRefresh');
    btn.disabled = true;
    btn.textContent = '刷新中...';
    try {
      const res = await performSync(src, token);
      showToast(`刷新完成（${res.count} 条成绩）`);
    } catch (err) {
      showToast(err.message || '刷新失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '刷新成绩';
    }
  });

  $('btnClearSaved').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    localStorage.removeItem(STORAGE_KEYS.SCORES);
    state.scores = {};
    state.playerInfo = null;
    $('lxnsTokenInput').value = '';
    $('dfTokenInput').value = '';
    renderBoard();
    closeModal('syncModal');
    showToast('已清除本地凭据与成绩缓存');
  });

  // Edit mode
  $('btnToggleEdit').addEventListener('click', () => {
    state.editMode = !state.editMode;
    $('btnToggleEdit').classList.toggle('active', state.editMode);
    $('btnToggleEdit').textContent = state.editMode ? '退出编辑' : '编辑榜单';
    $('editBanner').style.display = state.editMode ? 'flex' : 'none';
    if (state.editMode && state.view !== 'tier') {
      state.view = 'tier';
      $('viewModeGroup').querySelectorAll('.view-tab').forEach((b) => {
        const active = b.dataset.view === 'tier';
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
    }
    renderBoard();
  });

  $('btnCheckUpdates').addEventListener('click', openUpdatesModal);

  $('btnExportJson').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.tierList, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tier_list_${state.tierList.updatedAt || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出最新 tier_list.json');
  });

  $('btnImportJson').addEventListener('click', () => $('fileImportJson').click());
  $('fileImportJson').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.tiers)) throw new Error('JSON 缺少 tiers 数组');
      state.tierList = parsed;
      saveCustomTierList();
      rebuildDualTypeSet();
      renderBoard();
      showToast('已导入自定义榜单 JSON');
    } catch (err) {
      showToast('导入失败：' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  $('btnResetDefault').addEventListener('click', () => {
    if (!confirm('确认恢复为仓库默认难度表？本地未导出的调档修改将被清除。')) return;
    localStorage.removeItem(STORAGE_KEYS.TIER_CUSTOM);
    state.tierList = structuredClone(state.defaultTierList);
    rebuildDualTypeSet();
    renderBoard();
    showToast('已恢复默认榜单');
  });
}

async function init() {
  loadLocalStorage();
  bindEvents();

  // Sync UI state with loaded prefs
  $('viewModeGroup').querySelectorAll('.view-tab').forEach((b) => {
    const active = b.dataset.view === state.view;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.density-group .filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.size === state.tileSize));

  try {
    const [tierRes, metaRes] = await Promise.all([
      fetch('./data/tier_list.json'),
      fetch('./data/song_meta.json'),
    ]);
    state.defaultTierList = await tierRes.json();
    const fallbackMeta = await metaRes.json();
    ingestFallbackMeta(fallbackMeta);

    const savedCustom = localStorage.getItem(STORAGE_KEYS.TIER_CUSTOM);
    if (savedCustom) {
      try {
        const parsed = JSON.parse(savedCustom);
        if (Array.isArray(parsed?.tiers)) state.tierList = parsed;
      } catch {}
    }
    if (!state.tierList) {
      state.tierList = structuredClone(state.defaultTierList);
    }

    rebuildDualTypeSet();
    renderBoard();
    $('catalogStatusText').textContent = `离线曲库已就绪 · 正在拉取落雪最新曲库...`;
  } catch (err) {
    $('boardContainer').innerHTML = `<div class="empty-box">加载数据失败：${escapeHtml(err.message)}（如直接双击本地文件，请用静态服务器打开或部署至 GitHub Pages）</div>`;
    return;
  }

  // Refresh live catalog in background from LXNS
  try {
    const res = await fetch('https://maimai.lxns.net/api/v0/maimai/song/list?notes=true');
    if (res.ok) {
      const live = await res.json();
      ingestLiveLxnsCatalog(live);
      renderBoard();
      $('catalogStatusText').textContent = `已同步落雪实时曲库（${Object.keys(state.songMeta).length} 曲）`;
    } else {
      $('catalogStatusText').textContent = '使用内置曲库快照';
    }
  } catch {
    $('catalogStatusText').textContent = '使用内置曲库快照（离线）';
  }
}

init();
