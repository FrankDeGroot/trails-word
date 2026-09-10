// ── Theme toggle logic ──────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;
const THEME_KEY = 'word-finder-theme';

const THEMES = [
  { key: 'system', icon: '🌓', title: 'System theme — switch to dark' },
  { key: 'dark',   icon: '🌙', title: 'Dark mode — switch to light' },
  { key: 'light',  icon: '☀️', title: 'Light mode — switch to system' },
];

function applyTheme(key) {
  html.classList.toggle('dark-mode',  key === 'dark');
  html.classList.toggle('light-mode', key === 'light');
  html.style.colorScheme = key === 'dark' ? 'dark' : key === 'light' ? 'light' : 'light dark';
  const t = THEMES.find(t => t.key === key);
  themeToggle.textContent = t.icon;
  themeToggle.title = t.title;
  themeToggle.setAttribute('aria-label', t.title);
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'system');
}

themeToggle.addEventListener('click', () => {
  const current = localStorage.getItem(THEME_KEY) || 'system';
  const idx = THEMES.findIndex(t => t.key === current);
  const next = THEMES[(idx + 1) % THEMES.length].key;
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

initTheme();

const LETTERS_KEY   = 'word-finder-letters';
const LENGTH_KEY    = 'word-finder-length';
const POSITIONS_KEY = 'word-finder-positions';

const MAX_DISPLAY = 500;

let allWords = [];
const dimmedWords = new Set();
let ready = false;

const lettersInput  = document.getElementById('letters-input');
const lengthSlider  = document.getElementById('length-slider');
const lengthDisplay = document.getElementById('length-display');
const posFilters    = document.getElementById('position-filters');
const statusEl      = document.getElementById('status');
const countEl       = document.getElementById('results-count');
const wordsEl       = document.getElementById('words-container');
const toastEl       = document.getElementById('toast');

let toastTimer = null;
function showToast(message, type = '', duration = 3000) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = 'toast' + (type ? ` ${type}` : '');
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, duration);
}

// ── Load word list (API with fallback) ──────────────────────────
async function initWordList() {
  statusEl.textContent = 'Loading word list…';
  let text = null;
  let source = '';

  try {
    const apiRes = await fetch('/api/words');
    if (apiRes.ok) {
      text = await apiRes.text();
      source = 'api';
    }
  } catch (_) {
    // API not available, fall back to static text file
  }

  if (!text) {
    try {
      const staticRes = await fetch('word_trails.txt');
      if (staticRes.ok) {
        text = await staticRes.text();
        source = 'local';
      }
    } catch (_) {
      // both failed
    }
  }

  if (!text) {
    statusEl.textContent = 'Failed to load word list – ensure API or word_trails.txt is accessible.';
    return;
  }

  allWords = text.split('\n').map(w => w.trim()).filter(Boolean);
  ready = true;

  const restoredLength = lettersInput.value.trim().toLowerCase().replace(/[^a-z]/g, '').length;
  if (restoredLength > 0) {
    const max = Math.max(restoredLength, 3);
    lengthSlider.max = max;
    const savedLength = parseInt(localStorage.getItem(LENGTH_KEY), 10);
    const length = (savedLength >= 3 && savedLength <= max) ? savedLength : max;
    lengthSlider.value = length;
    lengthDisplay.textContent = length;
  }
  buildPositionInputs(+lengthSlider.value);
  runFilter();
}

initWordList();

// ── Position inputs ─────────────────────────────────────────────
function buildPositionInputs(n) {
  const prev = [...posFilters.querySelectorAll('.pos-input')].map(el => el.value);
  const stored = prev.some(v => v) ? [] : JSON.parse(localStorage.getItem(`${POSITIONS_KEY}-${n}`) || '[]');
  posFilters.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const cell = document.createElement('div');
    cell.className = 'pos-cell';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 1;
    inp.className = 'pos-input';
    inp.dataset.index = i;
    inp.value = prev[i] || stored[i] || '';
    inp.autocapitalize = 'none';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    if (inp.value) inp.classList.add('filled');

    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('input', () => {
      const rawLetters = lettersInput.value.trim().toLowerCase().replace(/[^a-z]/g, '');
      const ch = inp.value.toLowerCase().replace(/[^a-z]/g, '').slice(-1);
      inp.value = (ch && rawLetters && !rawLetters.includes(ch)) ? '' : ch;
      inp.classList.toggle('filled', inp.value !== '');
      savePositions();
      dimmedWords.clear();
      runFilter();
      // auto-advance
      if (inp.value) {
        const next = posFilters.querySelector(`.pos-input[data-index="${i + 1}"]`);
        if (next) next.focus();
      }
    });

    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && inp.value === '') {
        const prev = posFilters.querySelector(`.pos-input[data-index="${i - 1}"]`);
        if (prev) { prev.focus(); prev.value = ''; prev.classList.remove('filled'); savePositions(); dimmedWords.clear(); runFilter(); }
      } else if (e.key === 'ArrowLeft') {
        const p = posFilters.querySelector(`.pos-input[data-index="${i - 1}"]`);
        if (p) p.focus();
      } else if (e.key === 'ArrowRight') {
        const nx = posFilters.querySelector(`.pos-input[data-index="${i + 1}"]`);
        if (nx) nx.focus();
      }
    });

    const idx = document.createElement('div');
    idx.className = 'pos-index';
    idx.textContent = i + 1;

    cell.append(inp, idx);
    posFilters.append(cell);
  }
}

function savePositions() {
  const n = +lengthSlider.value;
  const values = [...posFilters.querySelectorAll('.pos-input')].map(el => el.value);
  localStorage.setItem(`${POSITIONS_KEY}-${n}`, JSON.stringify(values));
}

function resetPositionFilters(n) {
  posFilters.querySelectorAll('.pos-input').forEach(el => {
    el.value = '';
    el.classList.remove('filled');
  });
  localStorage.setItem(`${POSITIONS_KEY}-${n}`, JSON.stringify([]));
  buildPositionInputs(n);
}

// ── Filter logic ────────────────────────────────────────────────
function letterCounts(str) {
  const c = {};
  for (const ch of str) c[ch] = (c[ch] || 0) + 1;
  return c;
}

function fitsInBag(word, bag) {
  const wc = letterCounts(word);
  for (const ch of Object.keys(wc)) {
    if ((wc[ch] || 0) > (bag[ch] || 0)) return false;
  }
  return true;
}

// ── Word Deletion Logic ─────────────────────────────────────────
async function deleteWord(w) {
  const idx = allWords.indexOf(w);
  if (idx === -1) return;

  // Optimistic removal from active state
  allWords.splice(idx, 1);
  dimmedWords.delete(w);
  runFilter();
  showToast(`Deleting "${w}"…`);

  try {
    const res = await fetch('/api/words', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: w })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || `Server returned ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    showToast(data.message || `Deleted "${w}" successfully.`, 'success');
  } catch (err) {
    // Rollback on failure
    allWords.splice(idx, 0, w);
    runFilter();
    showToast(`Failed to delete "${w}": ${err.message}`, 'error', 4000);
  }
}

function runFilter() {
  if (!ready) return;

  const length     = +lengthSlider.value;
  const rawLetters = lettersInput.value.trim().toLowerCase().replace(/[^a-z]/g, '');
  const bag        = rawLetters ? letterCounts(rawLetters) : null;
  const pattern    = [...posFilters.querySelectorAll('.pos-input')].map(el => el.value.toLowerCase());

  if (!rawLetters) {
    statusEl.textContent = `${allWords.length.toLocaleString()} words loaded`;
    countEl.textContent = '';
    wordsEl.innerHTML = '';
    return;
  }

  const matched = [];
  for (const word of allWords) {
    if (word.length !== length) continue;
    // position filter
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] && word[i] !== pattern[i]) { ok = false; break; }
    }
    if (!ok) continue;
    // bag filter (only when letters provided)
    if (bag && !fitsInBag(word, bag)) continue;
    matched.push(word);
  }

  const total = matched.length;
  statusEl.textContent = total === 0
    ? 'No matches'
    : `${total.toLocaleString()} match${total === 1 ? '' : 'es'}${total > MAX_DISPLAY ? ` — showing first ${MAX_DISPLAY}` : ''}`;
  countEl.textContent = '';

  wordsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const w of matched.slice(0, MAX_DISPLAY)) {
    const span = document.createElement('span');
    span.className = 'word-tag';
    if (dimmedWords.has(w)) span.classList.add('dimmed');

    const textSpan = document.createElement('span');
    textSpan.className = 'word-text';
    textSpan.textContent = w;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'word-delete-btn';
    delBtn.title = `Delete "${w}" from word list`;
    delBtn.setAttribute('aria-label', `Delete "${w}" from word list`);
    delBtn.innerHTML = '&times;';

    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWord(w);
    });

    span.addEventListener('click', () => {
      if (dimmedWords.has(w)) { dimmedWords.delete(w); span.classList.remove('dimmed'); }
      else                    { dimmedWords.add(w);    span.classList.add('dimmed'); }
    });

    span.append(textSpan, delBtn);
    frag.append(span);
  }
  wordsEl.append(frag);
}

// ── Event wiring ────────────────────────────────────────────────
lengthSlider.addEventListener('input', () => {
  const n = +lengthSlider.value;
  localStorage.setItem(LENGTH_KEY, n);
  lengthDisplay.textContent = n;
  dimmedWords.clear();
  resetPositionFilters(n);
  runFilter();
});

lettersInput.value = localStorage.getItem(LETTERS_KEY) || '';

lettersInput.addEventListener('focus', () => {
  lettersInput.select();
});

lettersInput.addEventListener('input', () => {
  localStorage.setItem(LETTERS_KEY, lettersInput.value);
  const rawLetters = lettersInput.value.trim().toLowerCase().replace(/[^a-z]/g, '');
  const letterCount = rawLetters.length;

  if (letterCount > 0) {
    const max = Math.max(letterCount, 3);
    lengthSlider.max = max;
    lengthSlider.value = max;
    lengthDisplay.textContent = max;
  } else {
    lengthSlider.max = 30;
  }

  dimmedWords.clear();
  resetPositionFilters(+lengthSlider.value);
  runFilter();
});
