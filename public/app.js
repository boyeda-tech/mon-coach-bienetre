/* ============================================
   Mon Coach Bien-Être — app.js
   Pas de SDK Supabase — auth via token Bearer
   ============================================ */

let currentUser, userProfile, weightHistory = [], weightChart;
let authToken = null;

// Helper : appel API authentifié
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

const QUOTES = [
  { text: "Chaque pas en avant est un pas loin de là où vous étiez.", author: "— Unknown" },
  { text: "Le secret pour avancer est de commencer.", author: "— Mark Twain" },
  { text: "Prenez soin de votre corps, c'est le seul endroit où vous devez vivre.", author: "— Jim Rohn" },
  { text: "La santé est la vraie richesse, pas les pièces d'or et d'argent.", author: "— Mahatma Gandhi" },
  { text: "Investir dans sa santé, c'est investir dans son avenir.", author: "— Unknown" },
  { text: "Votre corps peut presque tout supporter. C'est votre esprit que vous devez convaincre.", author: "— Unknown" },
  { text: "Un voyage de mille lieues commence toujours par un premier pas.", author: "— Lao Tseu" },
];

const WORKOUT_PROGRAM = [
  { day: 'Lun', label: 'Vélo home trainer', duration: '30 min', intensity: 1, detail: 'Intensité légère, résistance modérée', icon: '🚴' },
  { day: 'Mar', label: 'TRX + Haut du corps', duration: '25 min', intensity: 2, detail: 'Tirage, gainage, épaules', icon: '🔗' },
  { day: 'Mer', label: 'Repos actif / Marche', duration: '20 min', intensity: 1, detail: 'Promenade légère, étirements', icon: '🚶' },
  { day: 'Jeu', label: 'Vélo home trainer', duration: '40 min', intensity: 2, detail: 'Intensité modérée, intervalles', icon: '🚴' },
  { day: 'Ven', label: 'TRX Full Body adapté', duration: '30 min', intensity: 2, detail: 'Circuit complet adapté genou', icon: '🔗' },
  { day: 'Sam', label: 'Vélo ou Step', duration: '30-45 min', intensity: 1, detail: 'Séance libre à intensité légère', icon: '🏃' },
  { day: 'Dim', label: 'Repos complet', duration: '—', intensity: 0, detail: 'Récupération, sommeil', icon: '😴' },
];

// ---- INIT ----

async function init() {
  authToken = sessionStorage.getItem('_sb_at');
  if (!authToken) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const data = await api('/api/profile');
    currentUser   = data.user;
    userProfile   = data.profile;
    weightHistory = data.weightHistory;

    const initials = (userProfile.first_name || 'U').charAt(0).toUpperCase();
    document.getElementById('userAvatar').textContent = initials;

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('newWeightDate').value = today;
    document.getElementById('journalDateLabel').textContent = formatDate(today);

    renderHomePage();
    renderProgram();
    renderWeightPage();
    renderAiProfile();

  } catch (e) {
    if (e.message === 'Non authentifié' || e.message === 'Token invalide' || e.message === 'Profil non trouvé') {
      sessionStorage.removeItem('_sb_at');
      sessionStorage.removeItem('_sb_rt');
      window.location.href = 'index.html';
      return;
    }
    console.error('[MonCoach] init() error:', e);
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;font-family:-apple-system,system-ui,sans-serif"><div style="text-align:center"><p style="color:#6b7280;margin-bottom:8px">Impossible de charger l'application.</p><p style="color:#9ca3af;font-size:13px;margin-bottom:20px">${e.message}</p><a href="index.html" style="background:#1D9E75;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">Retour à la connexion</a></div></div>`;
  }
}

// ---- NAVIGATION ----

let currentPage = 'home';

function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.getElementById(`nav-${page}`).classList.add('active');
  currentPage = page;
  window.scrollTo(0, 0);
}

function switchJournalTab(section) {
  document.querySelectorAll('#page-journal .profile-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`journal-${section}`).classList.add('active');
  const tabs = ['hygiene','alim','sport','sante'];
  const idx = tabs.indexOf(section);
  document.querySelectorAll('.tab-btn')[idx]?.classList.add('active');
}

// ---- HOME PAGE ----

function renderHomePage() {
  const dayIdx = new Date().getDay();
  const quote = QUOTES[dayIdx % QUOTES.length];
  document.getElementById('quoteText').textContent = `"${quote.text}"`;
  document.getElementById('quoteAuthor').textContent = quote.author;

  const currentWeight = weightHistory.length
    ? weightHistory[weightHistory.length - 1].weight
    : userProfile.weight_start;

  const start = parseFloat(userProfile.weight_start) || 0;
  const target = parseFloat(userProfile.weight_target) || 0;
  const current = parseFloat(currentWeight) || start;
  const height = parseFloat(userProfile.height) || 170;
  const bmi = current ? (current / Math.pow(height / 100, 2)).toFixed(1) : '--';
  const lost = start ? Math.max(0, start - current).toFixed(1) : '--';
  const remaining = target ? Math.max(0, current - target).toFixed(1) : '--';
  const pct = start && target && start > target
    ? Math.min(100, Math.round(((start - current) / (start - target)) * 100))
    : 0;

  document.getElementById('kpiWeight').textContent = current ? current.toFixed(1) : '--';
  document.getElementById('kpiBmi').textContent = bmi;
  document.getElementById('kpiLost').textContent = lost;
  document.getElementById('kpiTarget').textContent = remaining;
  document.getElementById('progressFill').style.width = `${pct}%`;
  document.getElementById('progressLabel').textContent = `${pct}% atteint`;
  document.getElementById('progressGoal').textContent = target ? `Objectif : ${target} kg` : '';

  const todayDow = new Date().getDay();
  const weekDayMap = [6, 0, 1, 2, 3, 4, 5];
  const workoutIdx = weekDayMap[todayDow];
  const workout = WORKOUT_PROGRAM[workoutIdx];
  document.getElementById('todayWorkoutDay').textContent = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'][workoutIdx];
  document.getElementById('todayWorkoutDesc').textContent = `${workout.icon} ${workout.label}`;
  document.getElementById('todayWorkoutMeta').textContent = workout.duration !== '—' ? `${workout.duration} — ${workout.detail}` : workout.detail;

  renderTreatmentCard();
  checkJournalStatus();
}

async function renderTreatmentCard() {
  if (!userProfile.treatment || userProfile.treatment_frequency === 'aucun') {
    document.getElementById('treatmentCard').innerHTML = '<p class="text-muted text-sm">Aucun traitement renseigné.</p>';
    return;
  }

  const logs = await api('/api/treatment-logs').catch(() => []);
  const lastDate = logs[0]?.date;
  const nextDate = computeNextTreatment(lastDate, userProfile.treatment_frequency);
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = nextDate && nextDate < today;
  const isDueToday = nextDate === today;

  document.getElementById('lastTreatment').textContent = lastDate ? formatDate(lastDate) : 'Non enregistrée';
  document.getElementById('nextTreatment').textContent = nextDate ? formatDate(nextDate) : '—';

  const badge = document.getElementById('treatmentBadge');
  if (isOverdue) badge.innerHTML = '<span class="badge badge-red">⚠️ En retard</span>';
  else if (isDueToday) badge.innerHTML = '<span class="badge badge-orange">📅 Aujourd\'hui</span>';
  else badge.innerHTML = '<span class="badge badge-green">✓ À jour</span>';
}

function computeNextTreatment(lastDate, frequency) {
  if (!lastDate) return null;
  const d = new Date(lastDate);
  if (frequency === 'quotidien') d.setDate(d.getDate() + 1);
  else if (frequency === 'hebdomadaire') d.setDate(d.getDate() + 7);
  else if (frequency === 'mensuel') d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString().split('T')[0];
}

async function confirmTreatment() {
  const btn = document.getElementById('confirmTreatmentBtn');
  btn.disabled = true;
  const today = new Date().toISOString().split('T')[0];
  try {
    await api('/api/treatment-logs', {
      method: 'POST',
      body: JSON.stringify({ date: today, treatment_name: userProfile.treatment }),
    });
    showToast('Prise confirmée !', 'success');
    renderTreatmentCard();
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
    btn.disabled = false;
  }
}

async function checkJournalStatus() {
  const today = new Date().toISOString().split('T')[0];
  const data = await api(`/api/journals?date=${today}`).catch(() => []);

  const icon = document.getElementById('journalStatusIcon');
  const text = document.getElementById('journalStatusText');
  const sub  = document.getElementById('journalStatusSub');
  if (data.length > 0) {
    icon.textContent = '✅';
    icon.className = 'status-icon done';
    text.textContent = 'Journal rempli aujourd\'hui';
    sub.textContent = 'Bien joué ! Continuez ainsi.';
  } else {
    icon.textContent = '📋';
    icon.className = 'status-icon pending';
    text.textContent = 'Journal non rempli';
    sub.textContent = 'Complétez votre journal quotidien';
  }
}

// ---- JOURNAL ----

let mealCount = 0;

function addMeal() {
  mealCount++;
  const list = document.getElementById('mealList');
  const div = document.createElement('div');
  div.className = 'meal-item';
  div.id = `meal-${mealCount}`;
  div.innerHTML = `
    <input type="time" class="form-input meal-time" style="max-width:110px">
    <input type="text" class="form-input meal-content" placeholder="Ex: riz, poulet, salade...">
    <button class="btn btn-danger" onclick="document.getElementById('meal-${mealCount}').remove()">✕</button>
  `;
  list.appendChild(div);
}

function toggleSportDetails() {
  const val = document.querySelector('input[name="j_did_sport"]:checked')?.value;
  document.getElementById('sportDetails').classList.toggle('hidden', val !== 'oui');
}

function toggleWorkHours() {
  const val = document.getElementById('j_day_type').value;
  document.getElementById('workHoursGroup').style.display = (val === 'repos') ? 'none' : '';
}

function updateSlider(input, spanId) {
  document.getElementById(spanId).textContent = input.value;
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const val = parseFloat(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  input.style.setProperty('--pct', `${pct}%`);
}

async function saveJournal() {
  const btn = document.getElementById('saveJournalBtn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';

  const meals = [];
  document.querySelectorAll('.meal-item').forEach(item => {
    const time = item.querySelector('.meal-time')?.value;
    const content = item.querySelector('.meal-content')?.value;
    if (content) meals.push({ time, content });
  });

  const didSport = document.querySelector('input[name="j_did_sport"]:checked')?.value === 'oui';

  const entry = {
    date: new Date().toISOString().split('T')[0],
    hygiene: {
      coucher: document.getElementById('j_coucher').value,
      lever: document.getElementById('j_lever').value,
      qualite_sommeil: parseInt(document.getElementById('j_sleep_quality').value),
      type_journee: document.getElementById('j_day_type').value,
      work_start: document.getElementById('j_work_start').value,
      work_end: document.getElementById('j_work_end').value,
      stress: parseInt(document.getElementById('j_stress').value),
    },
    alim: {
      hydratation: parseFloat(document.getElementById('j_water').value),
      repas: meals,
      grignotages: document.getElementById('j_snacks').value,
      alcool: parseInt(document.getElementById('j_alcohol').value),
    },
    sport: {
      fait: didSport,
      type: didSport ? document.getElementById('j_sport_type').value : null,
      duree: didSport ? parseInt(document.getElementById('j_sport_duration').value) : null,
      intensite: didSport ? parseInt(document.getElementById('j_intensity').value) : null,
      douleur_genou: didSport ? parseInt(document.getElementById('j_knee_pain').value) : null,
      ressenti: didSport ? document.getElementById('j_sport_feeling').value : null,
    },
    sante: {
      poids: parseFloat(document.getElementById('j_weight').value) || null,
      fatigue: parseInt(document.getElementById('j_fatigue').value),
      douleur_genou: parseInt(document.getElementById('j_knee_rest').value),
      symptomes: document.getElementById('j_symptoms').value,
      traitement_pris: document.getElementById('j_treatment_taken').value,
      traitement_effets: document.getElementById('j_treatment_effects').value,
    },
  };

  try {
    await api('/api/journal', { method: 'POST', body: JSON.stringify(entry) });

    if (entry.sante.poids) {
      await api('/api/weight', {
        method: 'POST',
        body: JSON.stringify({ date: entry.date, weight: entry.sante.poids }),
      });
      await loadWeightHistory();
      renderWeightPage();
    }

    showToast('Journal enregistré !', 'success');
    checkJournalStatus();
    switchPage('home');
    renderHomePage();
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Enregistrer le journal';
  }
}

// ---- PROGRAM ----

function renderProgram() {
  const grid = document.getElementById('weekGrid');
  const todayDow = new Date().getDay();
  const weekDayMap = [6, 0, 1, 2, 3, 4, 5];
  const todayIdx = weekDayMap[todayDow];
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  grid.innerHTML = WORKOUT_PROGRAM.map((w, i) => {
    const isToday = i === todayIdx;
    const isRest = w.intensity === 0;
    const dots = [1,2,3].map(d => `<div class="dot${d <= w.intensity ? ' filled' : ''}"></div>`).join('');

    return `
      <div class="day-card ${isToday ? 'today' : ''} ${isRest ? 'rest' : ''}">
        <div class="day-name">${w.day}${isToday ? '<br>⭐' : ''}</div>
        <div class="day-content">
          <div class="day-title">${w.icon} ${w.label}</div>
          <div class="day-details">${w.duration !== '—' ? `⏱ ${w.duration} — ` : ''}${w.detail}</div>
          ${w.intensity > 0 ? `<div class="intensity-dot">${dots}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const rules = document.getElementById('sportRules');
  if (userProfile?.knee_issue) {
    rules.innerHTML = `
      <li>Arrêtez si douleur genou > 2/5</li>
      <li>Pas de course à pied — vélo ou natation privilégiés</li>
      <li>Évitez les squats profonds et la montée de genoux</li>
      <li>Hydratez-vous avant, pendant et après</li>
      <li>Échauffement 5 min avant chaque séance</li>
    `;
  }
}

function exportICS() {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Mon Coach Bien-Être//FR\nCALSCALE:GREGORIAN\n`;

  WORKOUT_PROGRAM.forEach((w, i) => {
    if (w.intensity === 0) return;
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const uid = `${dateStr}-${i}@moncoachbienetre`;
    ics += `BEGIN:VEVENT\nUID:${uid}\nDTSTART;VALUE=DATE:${dateStr}\nSUMMARY:🏋️ ${w.icon} ${w.label} — ${w.duration}\nDESCRIPTION:${w.detail}\nEND:VEVENT\n`;
  });

  ics += 'END:VCALENDAR';
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'programme-sport.ics';
  a.click();
  showToast('Calendrier exporté !', 'success');
}

// ---- WEIGHT ----

async function loadWeightHistory() {
  weightHistory = await api('/api/weights').catch(() => []);
}

function renderWeightPage() {
  const start = parseFloat(userProfile.weight_start) || 0;
  const target = parseFloat(userProfile.weight_target) || 0;
  const height = parseFloat(userProfile.height) || 170;
  const current = weightHistory.length ? weightHistory[weightHistory.length - 1].weight : start;
  const bmi = current ? (current / Math.pow(height / 100, 2)).toFixed(1) : '--';
  const lost = start ? Math.max(0, start - current).toFixed(1) : '--';
  const remaining = target ? Math.max(0, current - target).toFixed(1) : '--';

  document.getElementById('wKpiCurrent').textContent = current ? parseFloat(current).toFixed(1) : '--';
  document.getElementById('wKpiBmi').textContent = bmi;
  document.getElementById('wKpiLost').textContent = lost;
  document.getElementById('wKpiLeft').textContent = remaining;

  renderWeightChart();
  renderWeightTable();
}

function renderWeightChart() {
  const ctx = document.getElementById('weightChart').getContext('2d');
  if (weightChart) weightChart.destroy();

  const labels = weightHistory.map(w => formatDateShort(w.date));
  const data = weightHistory.map(w => w.weight);

  if (!data.length) return;

  weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Poids (kg)',
        data,
        borderColor: '#1D9E75',
        backgroundColor: 'rgba(29,158,117,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#1D9E75',
        pointRadius: 4,
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} kg` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
        y: { grid: { color: '#f0f0f0' }, ticks: { callback: v => `${v} kg` } },
      },
    },
  });
}

function renderWeightTable() {
  const tbody = document.getElementById('weightTableBody');
  if (!weightHistory.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-center" style="padding:20px">Aucune pesée enregistrée</td></tr>';
    return;
  }

  const reversed = [...weightHistory].reverse();
  tbody.innerHTML = reversed.map((w, i) => {
    const prev = reversed[i + 1];
    let deltaHtml = '—';
    if (prev) {
      const delta = parseFloat(w.weight) - parseFloat(prev.weight);
      const sign = delta < 0 ? '↓' : delta > 0 ? '↑' : '=';
      const cls = delta < 0 ? 'loss' : delta > 0 ? 'gain' : '';
      deltaHtml = `<span class="weight-delta ${cls}">${sign} ${Math.abs(delta).toFixed(1)} kg</span>`;
    }
    return `<tr><td>${formatDate(w.date)}</td><td><strong>${parseFloat(w.weight).toFixed(1)} kg</strong></td><td>${deltaHtml}</td></tr>`;
  }).join('');
}

async function addWeight() {
  const val = parseFloat(document.getElementById('newWeight').value);
  const date = document.getElementById('newWeightDate').value;
  if (!val || !date) { showToast('Veuillez saisir un poids et une date', 'error'); return; }

  try {
    await api('/api/weight', { method: 'POST', body: JSON.stringify({ date, weight: val }) });
    document.getElementById('newWeight').value = '';
    showToast('Poids enregistré !', 'success');
    await loadWeightHistory();
    renderWeightPage();
    renderHomePage();
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ---- COACH AI ----

function renderAiProfile() {
  const p = userProfile;
  const age = p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000) : '?';
  const bmi = p.weight_start && p.height
    ? (p.weight_start / Math.pow(p.height / 100, 2)).toFixed(1)
    : '?';
  const equipment = Array.isArray(p.equipment) ? p.equipment.join(', ') : p.equipment || 'non renseigné';

  document.getElementById('aiProfileSummary').innerHTML = `
    <strong>${p.first_name || 'Patient'}</strong>, ${age} ans — ${p.gender || ''}<br>
    📏 ${p.height || '?'} cm | ⚖️ ${p.weight_start || '?'} kg → objectif ${p.weight_target || '?'} kg (IMC ${bmi})<br>
    💊 Traitement : ${p.treatment || 'aucun'} (${p.treatment_frequency || ''})<br>
    🦵 Genou : ${p.knee_issue ? 'Problème arthrosique' : 'Pas de problème'}<br>
    🏋️ Équipement : ${equipment}<br>
    📊 Niveau : ${p.fitness_level || 'sédentaire'}
  `;
}

async function generateSynthesis() {
  const btn = document.getElementById('synthesisBtn');
  const loading = document.getElementById('synthesisLoading');
  const result = document.getElementById('synthesisResult');

  btn.disabled = true;
  loading.classList.remove('hidden');
  result.classList.add('hidden');

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString().split('T')[0];

  const journals = await api(`/api/journals?since=${since}`).catch(() => []);
  const recentWeights = weightHistory.filter(w => w.date >= since);

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'synthesis',
        profile: userProfile,
        journals,
        weightHistory: recentWeights,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erreur API');
    result.textContent = json.response;
    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    showToast('Erreur IA: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    loading.classList.add('hidden');
  }
}

async function askQuestion() {
  const question = document.getElementById('aiQuestion').value.trim();
  if (!question) { showToast('Veuillez écrire une question', 'error'); return; }

  const btn = document.getElementById('askBtn');
  const loading = document.getElementById('questionLoading');
  const result = document.getElementById('questionResult');

  btn.disabled = true;
  loading.classList.remove('hidden');
  result.classList.add('hidden');

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'question', profile: userProfile, question }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erreur API');
    result.textContent = json.response;
    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    showToast('Erreur IA: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    loading.classList.add('hidden');
  }
}

// ---- LOGOUT ----

async function handleLogout() {
  await fetch('/api/signout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
  }).catch(() => {});
  sessionStorage.removeItem('_sb_at');
  sessionStorage.removeItem('_sb_rt');
  window.location.href = 'index.html';
}

// ---- UTILITIES ----

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className = `toast ${type} show`;
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ---- START ----
init();
