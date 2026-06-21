/* app.js – Resume Screening Dashboard */
const API = 'http://127.0.0.1:5002';
let barChart = null, doughnutChart = null, scatterChart = null;
let allCandidates = [];

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initUpload();
  initPresets();
  bindButtons();
  checkHealth();
});

// ── Theme ─────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('rsTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rsTheme', next);
    if (allCandidates.length) renderCharts(allCandidates);
  });
}

// ── Health check ──────────────────────────────────────────────────────────────
async function checkHealth() {
  const pill = document.getElementById('serverStatus');
  const lbl  = pill.querySelector('.status-lbl');
  try {
    const r = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) { pill.classList.add('online'); lbl.textContent = 'Backend Online'; }
    else throw new Error();
  } catch {
    pill.classList.add('offline'); lbl.textContent = 'Backend Offline';
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
function initUpload() {
  const zone    = document.getElementById('uploadZone');
  const input   = document.getElementById('csvFile');
  const preview = document.getElementById('uploadPreview');
  const inner   = document.getElementById('uploadInner');
  const nameEl  = document.getElementById('uploadName');

  const show = (file) => {
    if (file) { nameEl.textContent = file.name; preview.classList.remove('hidden'); inner.classList.add('hidden'); input.style.pointerEvents = 'none'; }
    else       { preview.classList.add('hidden'); inner.classList.remove('hidden'); input.style.pointerEvents = 'auto'; }
  };

  input.addEventListener('change', () => input.files[0] && show(input.files[0]));
  document.getElementById('removeFile').addEventListener('click', e => { e.stopPropagation(); input.value = ''; show(null); });
  document.getElementById('useDefaultBtn').addEventListener('click', () => { input.value = ''; show(null); });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; show(f); }
  });
}

// ── Presets ───────────────────────────────────────────────────────────────────
function initPresets() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('jobDesc').value = btn.dataset.jd;
      document.querySelectorAll('.preset-btn').forEach(b => b.style.borderColor = '');
      btn.style.borderColor = 'var(--primary)';
    });
  });
}

// ── Buttons ───────────────────────────────────────────────────────────────────
function bindButtons() {
  document.getElementById('screenBtn').addEventListener('click', runScreening);
  document.getElementById('exportBtn').addEventListener('click', exportCSV);
  document.getElementById('tableSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = allCandidates.filter(c => c.candidate.toLowerCase().includes(q));
    if (allCandidates.length) renderTable(filtered);
  });
}

// ── Run screening ─────────────────────────────────────────────────────────────
async function runScreening() {
  const jd   = document.getElementById('jobDesc').value.trim();
  const file = document.getElementById('csvFile').files[0];
  if (!jd) { showError('Please enter a job description or required skills.'); return; }

  hideAlerts();
  showLoading(true, `Running TF-IDF on job description…`);

  try {
    const fd = new FormData();
    fd.append('job_description', jd);
    if (file) fd.append('file', file);

    const r = await fetch(`${API}/api/screen`, { method: 'POST', body: fd });
    const res = await r.json();
    if (!res.ok) throw new Error(res.error);

    allCandidates = res.candidates;
    populateDashboard(res);
    showSuccess(`Ranked ${res.total} candidates from ${res.source}.`);

    // mark server online
    const pill = document.getElementById('serverStatus');
    pill.classList.remove('offline'); pill.classList.add('online');
    pill.querySelector('.status-lbl').textContent = 'Backend Online';

  } catch (err) {
    const msg = err.message.includes('fetch') || err.message.includes('Failed')
      ? 'Cannot reach backend. Run: python app.py'
      : err.message;
    showError(msg);
  } finally {
    showLoading(false);
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function populateDashboard(res) {
  const { candidates, total } = res;

  // Pool stats
  const avg  = candidates.reduce((s, c) => s + c.match_score, 0) / total;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statTop').textContent   = candidates[0]?.match_score.toFixed(1) + '%' || '—';
  document.getElementById('statAvg').textContent   = avg.toFixed(1) + '%';
  document.getElementById('poolStats').classList.remove('hidden');

  // Sections
  document.getElementById('results-section').classList.remove('hidden');
  document.getElementById('analytics-section').classList.remove('hidden');

  // Results meta
  document.getElementById('resultsMeta').textContent = `${total} candidates ranked · Source: ${res.source}`;
  document.getElementById('tableSubtitle').textContent = `${total} candidates sorted by match score`;

  renderPodium(candidates.slice(0, 3));
  renderTable(candidates);
  renderCharts(candidates);

  // scroll to results
  setTimeout(() => document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
}

// ── Podium ────────────────────────────────────────────────────────────────────
function renderPodium(top) {
  const pod = document.getElementById('podium');
  pod.innerHTML = '';
  const icons = ['🥇', '🥈', '🥉'];
  top.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = `podium-card rank-${i + 1}`;
    div.innerHTML = `
      <div class="podium-rank">${icons[i]}</div>
      <div class="podium-name">${c.candidate}</div>
      <div class="podium-score">${c.match_score.toFixed(1)}%</div>
      <div class="podium-bar-wrap"><div class="podium-bar" style="width:0%" data-target="${c.match_score}"></div></div>
      <div class="podium-exp"><i class="fa-solid fa-briefcase"></i> ${c.experience} yrs exp</div>
      <span class="podium-badge grade-${c.grade}">${c.grade}</span>
    `;
    pod.appendChild(div);
  });
  // animate bars
  requestAnimationFrame(() => {
    document.querySelectorAll('.podium-bar').forEach(b => {
      b.style.width = b.dataset.target + '%';
    });
  });
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(candidates) {
  const tbody = document.getElementById('rankTableBody');
  tbody.innerHTML = '';

  candidates.forEach(c => {
    const scoreColor = c.match_score >= 80 ? 'var(--green)' : c.match_score >= 60 ? 'var(--primary)' : c.match_score >= 40 ? 'var(--gold)' : 'var(--danger)';
    const kwHtml = c.keywords.length
      ? c.keywords.map(k => `<span class="kw-chip">${k}</span>`).join('')
      : '<span style="color:var(--muted);font-size:.78rem">none</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="font-family:var(--font);font-size:1rem">#${c.rank}</strong></td>
      <td><strong style="font-size:.95rem">${c.candidate}</strong></td>
      <td><span style="display:flex;align-items:center;gap:.3rem"><i class="fa-solid fa-briefcase" style="color:var(--muted);font-size:.75rem"></i>${c.experience} yrs</span></td>
      <td>
        <div class="score-wrap">
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:0%;background:${scoreColor}" data-w="${c.match_score}"></div></div>
          <span class="score-val" style="color:${scoreColor}">${c.match_score.toFixed(1)}%</span>
        </div>
      </td>
      <td><span class="podium-badge grade-${c.grade}">${c.grade}</span></td>
      <td><div class="kw-chips">${kwHtml}</div></td>
      <td><span class="resume-snippet" title="${c.resume}">${c.resume}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // Animate score bars
  requestAnimationFrame(() => {
    document.querySelectorAll('.score-bar-fill').forEach(b => { b.style.width = b.dataset.w + '%'; });
  });
}

// ── Charts ────────────────────────────────────────────────────────────────────
function getTC() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    grid: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    text: dark ? 'hsl(215,20%,70%)' : 'hsl(215,25%,35%)',
    bg:   dark ? 'rgba(10,20,40,0.95)' : 'rgba(255,255,255,0.95)',
    title:dark ? '#fff' : '#0f172a'
  };
}

function renderCharts(candidates) {
  const tc = getTC();
  const names  = candidates.map(c => c.candidate);
  const scores = candidates.map(c => c.match_score);
  const colors = scores.map(s => s >= 80 ? 'rgba(34,197,94,0.8)' : s >= 60 ? 'rgba(59,130,246,0.8)' : s >= 40 ? 'rgba(234,179,8,0.8)' : 'rgba(239,68,68,0.8)');

  // Bar chart
  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: names,
      datasets: [{
        label: 'Match Score (%)',
        data: scores,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8','1')),
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 800 },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: tc.bg, titleColor: tc.title, bodyColor: tc.text, padding: 10, titleFont: { family: 'Outfit', weight: 700 }, bodyFont: { family: 'Plus Jakarta Sans' } }
      },
      scales: {
        x: { grid: { color: tc.grid }, ticks: { color: tc.text } },
        y: { grid: { color: tc.grid }, ticks: { color: tc.text, callback: v => v + '%' }, max: 100 }
      }
    }
  });

  // Doughnut
  const grades = { Excellent: 0, Good: 0, Fair: 0, Low: 0 };
  candidates.forEach(c => grades[c.grade]++);
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(document.getElementById('doughnutChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(grades),
      datasets: [{ data: Object.values(grades), backgroundColor: ['rgba(34,197,94,0.8)','rgba(59,130,246,0.8)','rgba(234,179,8,0.8)','rgba(239,68,68,0.8)'], borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: tc.text, font: { family: 'Plus Jakarta Sans', size: 12 }, padding: 12 } },
        tooltip: { backgroundColor: tc.bg, titleColor: tc.title, bodyColor: tc.text, padding: 10, titleFont: { family: 'Outfit', weight: 700 } }
      }
    }
  });

  // Scatter
  if (scatterChart) scatterChart.destroy();
  scatterChart = new Chart(document.getElementById('scatterChart'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Candidates',
        data: candidates.map(c => ({ x: c.experience, y: c.match_score, name: c.candidate })),
        backgroundColor: 'rgba(139,92,246,0.7)',
        borderColor: 'rgba(139,92,246,1)',
        pointRadius: 8,
        pointHoverRadius: 11
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.bg, titleColor: tc.title, bodyColor: tc.text, padding: 10,
          callbacks: {
            title: items => items[0].raw.name,
            label: item => [`Experience: ${item.raw.x} yrs`, `Match: ${item.raw.y.toFixed(1)}%`]
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Experience (years)', color: tc.text }, grid: { color: tc.grid }, ticks: { color: tc.text } },
        y: { title: { display: true, text: 'Match Score (%)', color: tc.text }, grid: { color: tc.grid }, ticks: { color: tc.text, callback: v => v + '%' }, max: 105 }
      }
    }
  });
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportCSV() {
  if (!allCandidates.length) return;
  const rows = [['Rank','Candidate','Experience (yrs)','Match Score (%)','Grade','Keywords Matched','Resume']];
  allCandidates.forEach(c => rows.push([c.rank, c.candidate, c.experience, c.match_score.toFixed(2), c.grade, c.keywords.join(' | '), c.resume]));
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'screening_results.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showLoading(show, msg = '') {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
  if (msg) document.getElementById('loadMsg').textContent = msg;
  document.getElementById('screenBtn').disabled = show;
  document.getElementById('screenBtnText').textContent = show ? 'Screening…' : 'Screen & Rank Candidates';
}
function showError(msg) { document.getElementById('errorText').textContent = msg; document.getElementById('errorBanner').classList.remove('hidden'); }
function showSuccess(msg) { document.getElementById('successText').textContent = msg; document.getElementById('successBanner').classList.remove('hidden'); }
function hideAlerts() { document.getElementById('errorBanner').classList.add('hidden'); document.getElementById('successBanner').classList.add('hidden'); }
