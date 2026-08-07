'use strict';

// ── 熱量估算係數（大卡／單位）─────────────────────────────────
// 粗略估算值，假設中等強度、約 70 公斤成年人；依個人體重/強度可自行調整。
// 次數類型（每下）僅為概估，個體差異較大。
// 這個表是唯一資料來源：下拉選單、單位顯示、熱量計算、月度總結都由此衍生。
const EXERCISE_TYPES = {
  abMachine: { label: '健腹機', unit: '個', kcalPerUnit: 0.3 },
  kettlebell: { label: '壺鈴', unit: '個', kcalPerUnit: 0.5 },
  spinBike: { label: '飛輪', unit: 'KM', kcalPerUnit: 30 },
  jogging: { label: '慢跑', unit: 'KM', kcalPerUnit: 60 },
  roadBike: { label: '公路車', unit: 'KM', kcalPerUnit: 25 },
};

const STORAGE_KEY = 'workout_records_v1';
const WEIGHT_STORAGE_KEY = 'daily_weights_v1';
const REFERENCE_WEIGHT_KG = 70; // EXERCISE_TYPES 的 kcalPerUnit 是以此體重校準
const WEEKLY_GOAL_KCAL = 2500;

// ── 資料層 ─────────────────────────────────────────────────
function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadWeights() {
  const raw = localStorage.getItem(WEIGHT_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveWeights(weights) {
  localStorage.setItem(WEIGHT_STORAGE_KEY, JSON.stringify(weights));
}

// 精確符合當天 -> 沿用更早日期中最近一筆 -> 參考體重預設值。絕不往未來找。
function getWeightForDate(dateStr, weightsMap) {
  const map = weightsMap || loadWeights();
  if (Object.prototype.hasOwnProperty.call(map, dateStr)) {
    return { value: map[dateStr], source: 'exact' };
  }
  const priorDates = Object.keys(map)
    .filter((d) => d < dateStr)
    .sort();
  if (priorDates.length > 0) {
    const fromDate = priorDates[priorDates.length - 1];
    return { value: map[fromDate], source: 'carry-forward', fromDate };
  }
  return { value: REFERENCE_WEIGHT_KG, source: 'default' };
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeCalories(type, amount, weightKg) {
  const def = EXERCISE_TYPES[type];
  if (!def || !isFinite(amount)) return 0;
  const weight = isFinite(weightKg) && weightKg > 0 ? weightKg : REFERENCE_WEIGHT_KG;
  return Math.round(def.kcalPerUnit * (weight / REFERENCE_WEIGHT_KG) * amount * 10) / 10;
}

// ── DOM 參照 ───────────────────────────────────────────────
const form = document.getElementById('record-form');
const formTitle = document.getElementById('form-title');
const idInput = document.getElementById('record-id');
const dateInput = document.getElementById('date');
const weightInput = document.getElementById('weight');
const weightHint = document.getElementById('weight-hint');
const errorWeight = document.getElementById('error-weight');
const typeSelect = document.getElementById('type');
const amountInput = document.getElementById('amount');
const unitLabel = document.getElementById('unit-label');
const caloriePreview = document.getElementById('calorie-preview');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const errorDate = document.getElementById('error-date');
const errorAmount = document.getElementById('error-amount');
const recordsListEl = document.getElementById('records-list');
const weeklyGoalContent = document.getElementById('weekly-goal-content');
const monthPicker = document.getElementById('month-picker');
const summaryContent = document.getElementById('summary-content');

// ── 初始化表單控制項 ────────────────────────────────────────
function populateTypeSelect() {
  typeSelect.innerHTML = '';
  Object.entries(EXERCISE_TYPES).forEach(([key, def]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = def.label;
    typeSelect.appendChild(opt);
  });
}

function updateCaloriePreview() {
  const type = typeSelect.value;
  const def = EXERCISE_TYPES[type];
  unitLabel.textContent = def ? def.unit : '';

  const amount = parseFloat(amountInput.value);
  const weight = parseFloat(weightInput.value);
  const validWeight = isFinite(weight) && weight > 0;

  if (def && isFinite(amount) && amount > 0 && validWeight) {
    caloriePreview.textContent = `預估消耗熱量：約 ${computeCalories(type, amount, weight)} 大卡（體重 ${weight} kg）`;
  } else if (def && isFinite(amount) && amount > 0) {
    caloriePreview.textContent = `預估消耗熱量：約 ${computeCalories(type, amount, REFERENCE_WEIGHT_KG)} 大卡（尚未輸入有效體重，暫以 ${REFERENCE_WEIGHT_KG} kg 估算）`;
  } else {
    caloriePreview.textContent = '';
  }
}

function updateWeightForDate() {
  const date = dateInput.value || todayStr();
  const result = getWeightForDate(date);
  weightInput.value = result.value;

  if (result.source === 'default') {
    weightHint.textContent = `尚無體重紀錄，預設採用參考體重 ${REFERENCE_WEIGHT_KG} kg（可修改）`;
  } else if (result.source === 'carry-forward') {
    weightHint.textContent = `沿用 ${result.fromDate} 的體重紀錄（可修改）`;
  } else {
    weightHint.textContent = '';
  }

  updateCaloriePreview();
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayStr() {
  return formatDate(new Date());
}

function currentMonthStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

// 週一為錨點的週範圍，dateStr 為 'YYYY-MM-DD'
function getWeekRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=週日..6=週六
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
}

function computeWeeklyTotal(records, weekStart, weekEnd) {
  return records
    .filter((r) => r.date >= weekStart && r.date <= weekEnd)
    .reduce((sum, r) => sum + r.calories, 0);
}

function computeWeeklyBreakdown(monthRecords) {
  const weeks = {};
  monthRecords.forEach((r) => {
    const { start, end } = getWeekRange(r.date);
    if (!weeks[start]) weeks[start] = { start, end, calories: 0 };
    weeks[start].calories += r.calories;
  });
  return Object.values(weeks).sort((a, b) => (a.start < b.start ? -1 : 1));
}

// ── 表單模式切換 ───────────────────────────────────────────
function resetForm() {
  idInput.value = '';
  form.reset();
  dateInput.value = todayStr();
  typeSelect.selectedIndex = 0;
  updateWeightForDate();
  formTitle.textContent = '新增紀錄';
  submitBtn.textContent = '儲存';
  cancelBtn.classList.add('hidden');
  errorDate.textContent = '';
  errorAmount.textContent = '';
  errorWeight.textContent = '';
}

function enterEditMode(record) {
  idInput.value = record.id;
  dateInput.value = record.date;
  typeSelect.value = record.type;
  amountInput.value = record.amount;
  updateWeightForDate();
  formTitle.textContent = '編輯紀錄';
  submitBtn.textContent = '更新';
  cancelBtn.classList.remove('hidden');
  errorDate.textContent = '';
  errorAmount.textContent = '';
  errorWeight.textContent = '';
  document.getElementById('form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 表單送出 ───────────────────────────────────────────────
function validateForm() {
  let valid = true;
  errorDate.textContent = '';
  errorAmount.textContent = '';
  errorWeight.textContent = '';

  if (!dateInput.value) {
    errorDate.textContent = '請選擇日期';
    valid = false;
  }

  const weight = parseFloat(weightInput.value);
  if (weightInput.value === '' || !isFinite(weight) || weight <= 0) {
    errorWeight.textContent = '請輸入大於 0 的體重';
    valid = false;
  }

  const amount = parseFloat(amountInput.value);
  if (amountInput.value === '' || !isFinite(amount) || amount <= 0) {
    errorAmount.textContent = '請輸入大於 0 的數量';
    valid = false;
  }

  return valid;
}

function handleSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const records = loadRecords();
  const weights = loadWeights();
  const type = typeSelect.value;
  const amount = parseFloat(amountInput.value);
  const weight = parseFloat(weightInput.value);
  const date = dateInput.value;

  // Upsert 當日體重；此動作不會回頭重算其他已存紀錄的 calories(包含同一天的其他紀錄)——
  // calories 是儲存當下的快照，只有這次正在儲存/編輯的紀錄會用到新輸入的體重。
  weights[date] = weight;
  saveWeights(weights);

  const calories = computeCalories(type, amount, weight);
  const now = new Date().toISOString();
  const editingId = idInput.value;

  if (editingId) {
    const idx = records.findIndex((r) => r.id === editingId);
    if (idx !== -1) {
      records[idx] = {
        ...records[idx],
        date,
        type,
        amount,
        calories,
        updatedAt: now,
      };
    }
  } else {
    records.push({
      id: generateId(),
      date: dateInput.value,
      type,
      amount,
      calories,
      createdAt: now,
      updatedAt: now,
    });
  }

  saveRecords(records);
  resetForm();
  renderAll();
}

// ── 每日紀錄列表 ───────────────────────────────────────────
function renderRecordsList() {
  const records = loadRecords();

  if (records.length === 0) {
    recordsListEl.innerHTML = '<p class="empty-state">尚無紀錄，新增你的第一筆運動紀錄吧！</p>';
    return;
  }

  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));

  const html = dates
    .map((date) => {
      const dayRecords = byDate[date].slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const dayTotal = dayRecords.reduce((sum, r) => sum + r.calories, 0);

      const rowsHtml = dayRecords
        .map((r) => {
          const def = EXERCISE_TYPES[r.type] || { label: r.type, unit: '' };
          return `
            <div class="record-row" data-id="${r.id}">
              <div class="record-info">
                <span class="type-label">${def.label}</span>
                <span class="amount">${r.amount} ${def.unit}</span>
                <span class="kcal">${r.calories} 大卡</span>
              </div>
              <div class="record-actions">
                <button type="button" class="edit-btn" data-id="${r.id}">編輯</button>
                <button type="button" class="delete-btn" data-id="${r.id}">刪除</button>
              </div>
            </div>`;
        })
        .join('');

      return `
        <div class="day-group">
          <div class="day-header">
            <span>${date}</span>
            <span class="day-total">當日小計：${Math.round(dayTotal * 10) / 10} 大卡</span>
          </div>
          ${rowsHtml}
        </div>`;
    })
    .join('');

  recordsListEl.innerHTML = html;
}

function handleListClick(e) {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');

  if (editBtn) {
    const records = loadRecords();
    const record = records.find((r) => r.id === editBtn.dataset.id);
    if (record) enterEditMode(record);
    return;
  }

  if (deleteBtn) {
    const confirmed = window.confirm('確定要刪除這筆紀錄嗎？');
    if (!confirmed) return;
    const records = loadRecords().filter((r) => r.id !== deleteBtn.dataset.id);
    saveRecords(records);
    if (idInput.value === deleteBtn.dataset.id) resetForm();
    renderAll();
  }
}

// ── 本週目標 ───────────────────────────────────────────────
function renderWeeklyGoal() {
  const today = todayStr();
  const { start, end } = getWeekRange(today);
  const total = computeWeeklyTotal(loadRecords(), start, end);
  const barPct = Math.min((total / WEEKLY_GOAL_KCAL) * 100, 100);
  const pct = Math.round((total / WEEKLY_GOAL_KCAL) * 100);
  const metGoal = total >= WEEKLY_GOAL_KCAL;

  weeklyGoalContent.innerHTML = `
    <div class="week-range">${start} ～ ${end}</div>
    <div class="goal-progress-track ${metGoal ? 'goal-met' : ''}">
      <div class="goal-progress-fill" style="width:${barPct}%"></div>
    </div>
    <div class="goal-progress-label">
      <span>${Math.round(total * 10) / 10} / ${WEEKLY_GOAL_KCAL} 大卡</span>
      <span>${pct}%</span>
    </div>`;
}

// ── 月度週彙整長條圖 ─────────────────────────────────────────
function renderWeeklyBarChart(weeklyBreakdown) {
  if (weeklyBreakdown.length === 0) return '';
  const maxCalories = Math.max(...weeklyBreakdown.map((w) => w.calories), WEEKLY_GOAL_KCAL);

  const rows = weeklyBreakdown
    .map((w) => {
      const pct = Math.max((w.calories / maxCalories) * 100, 2);
      const goalPct = Math.min((WEEKLY_GOAL_KCAL / maxCalories) * 100, 100);
      const met = w.calories >= WEEKLY_GOAL_KCAL;
      const calories = Math.round(w.calories * 10) / 10;
      return `
        <div class="bar-row">
          <span class="bar-label">${w.start.slice(5)}~${w.end.slice(5)}</span>
          <div class="bar-track goal-track">
            <div class="bar-fill ${met ? 'goal-met' : ''}" style="width:${pct}%"></div>
            <div class="goal-marker" style="left:${goalPct}%"></div>
          </div>
          <span class="bar-value">${calories} 大卡</span>
        </div>`;
    })
    .join('');

  return `
    <h3 class="subsection-title">每週熱量（目標 ${WEEKLY_GOAL_KCAL} 大卡）</h3>
    <p class="chart-note">註：月初/月底的週次可能橫跨兩個月，此處僅計入所選月份內的天數</p>
    <div class="bar-chart weekly">${rows}</div>`;
}

// ── 體重趨勢圖 ─────────────────────────────────────────────
function renderWeightTrendChart(month) {
  const weights = loadWeights();
  const points = Object.keys(weights)
    .filter((d) => d.startsWith(month))
    .sort()
    .map((d) => ({ date: d, weight: weights[d] }));

  if (points.length === 0) {
    return '<p class="empty-state">這個月沒有體重紀錄。</p>';
  }

  const W = 600;
  const H = 200;
  const padX = 40;
  const padY = 24;
  const values = points.map((p) => p.weight);
  const minW = Math.min(...values);
  const maxW = Math.max(...values);

  const xFor = (i) => (points.length === 1 ? W / 2 : padX + (i / (points.length - 1)) * (W - padX * 2));
  const yFor = (w) => (maxW === minW ? H / 2 : H - padY - ((w - minW) / (maxW - minW)) * (H - padY * 2));

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.weight), ...p }));
  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const circles = coords
    .map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" class="weight-point"><title>${c.date}: ${c.weight} kg</title></circle>`)
    .join('');

  const first = points[0];
  const last = points[points.length - 1];

  return `
    <svg class="weight-trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="體重趨勢圖">
      <polyline points="${polylinePoints}" class="weight-trend-line" fill="none" />
      ${circles}
      <text x="4" y="${yFor(maxW).toFixed(1)}" class="weight-axis-label">${maxW} kg</text>
      <text x="4" y="${yFor(minW).toFixed(1)}" class="weight-axis-label">${minW} kg</text>
      <text x="${padX}" y="${H - 4}" class="weight-axis-label">${first.date.slice(5)}</text>
      <text x="${W - padX}" y="${H - 4}" class="weight-axis-label" text-anchor="end">${last.date.slice(5)}</text>
    </svg>`;
}

function renderWeightTrendSection(month) {
  return `<h3 class="subsection-title">體重趨勢</h3>${renderWeightTrendChart(month)}`;
}

// ── 月度總結 ───────────────────────────────────────────────
function renderSummary() {
  const month = monthPicker.value || currentMonthStr();
  const records = loadRecords().filter((r) => r.date.startsWith(month));

  if (records.length === 0) {
    summaryContent.innerHTML =
      '<p class="empty-state">這個月還沒有紀錄。</p>' + renderWeightTrendSection(month);
    return;
  }

  const totalsByType = {};
  Object.keys(EXERCISE_TYPES).forEach((key) => {
    totalsByType[key] = { amount: 0, calories: 0 };
  });

  records.forEach((r) => {
    if (!totalsByType[r.type]) totalsByType[r.type] = { amount: 0, calories: 0 };
    totalsByType[r.type].amount += r.amount;
    totalsByType[r.type].calories += r.calories;
  });

  const activeTypes = Object.entries(totalsByType).filter(([, v]) => v.calories > 0 || v.amount > 0);
  const grandTotalCalories = activeTypes.reduce((sum, [, v]) => sum + v.calories, 0);

  const tableRows = activeTypes
    .map(([key, v]) => {
      const def = EXERCISE_TYPES[key];
      const amount = Math.round(v.amount * 10) / 10;
      const calories = Math.round(v.calories * 10) / 10;
      return `<tr><td>${def.label}</td><td>${amount} ${def.unit}</td><td>${calories} 大卡</td></tr>`;
    })
    .join('');

  const maxCalories = Math.max(...activeTypes.map(([, v]) => v.calories), 1);
  const barRows = activeTypes
    .map(([key, v]) => {
      const def = EXERCISE_TYPES[key];
      const pct = Math.max((v.calories / maxCalories) * 100, 2);
      const calories = Math.round(v.calories * 10) / 10;
      return `
        <div class="bar-row">
          <span class="bar-label">${def.label}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="bar-value">${calories} 大卡</span>
        </div>`;
    })
    .join('');

  const weeklyChartHtml = renderWeeklyBarChart(computeWeeklyBreakdown(records));
  const weightTrendHtml = renderWeightTrendSection(month);

  summaryContent.innerHTML = `
    <table class="summary-table">
      <thead>
        <tr><th>運動類型</th><th>總數量</th><th>總熱量</th></tr>
      </thead>
      <tbody>
        ${tableRows}
        <tr class="total-row"><td>總計</td><td></td><td>${Math.round(grandTotalCalories * 10) / 10} 大卡</td></tr>
      </tbody>
    </table>
    <div class="bar-chart">${barRows}</div>
    ${weeklyChartHtml}
    ${weightTrendHtml}
  `;
}

// ── 整體渲染 ───────────────────────────────────────────────
function renderAll() {
  renderRecordsList();
  renderWeeklyGoal();
  renderSummary();
}

// ── 事件綁定與初始化 ───────────────────────────────────────
function init() {
  populateTypeSelect();
  dateInput.value = todayStr();
  monthPicker.value = currentMonthStr();
  updateWeightForDate();

  form.addEventListener('submit', handleSubmit);
  cancelBtn.addEventListener('click', resetForm);
  dateInput.addEventListener('change', updateWeightForDate);
  typeSelect.addEventListener('change', updateCaloriePreview);
  amountInput.addEventListener('input', updateCaloriePreview);
  weightInput.addEventListener('input', updateCaloriePreview);
  recordsListEl.addEventListener('click', handleListClick);
  monthPicker.addEventListener('change', renderSummary);

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
