'use strict';
// Calculator uses an explicit recursive-descent parser: no eval() or Function().
const $ = id => document.getElementById(id);
const resultEl = $('result'), previewEl = $('preview'), clearEl = $('clearButton');
const HISTORY_KEY = 'glasscalc-history-v1';
let expression = '', justEvaluated = false, error = false, memory = null, degreeMode = true;
let history = [];
try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); if (!Array.isArray(history)) history = []; } catch { history = []; }

function formatNumber(n) {
  if (!Number.isFinite(n)) throw Error('Invalid result');
  if (Object.is(n, -0) || Math.abs(n) < 1e-13) n = 0;
  const rounded = Number(n.toPrecision(12));
  return String(rounded);
}
function evaluate(source) {
  // Whitelist tokens, including Unicode calculator symbols and named functions.
  const normalized = source.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  const tokenRx = /\s*(sin|cos|tan|sqrt|√|π|ℯ|e|\d+(?:\.\d*)?|\.\d+|[()+*/^%\-])\s*/gy;
  let tokens = [], position = 0;
  while (position < normalized.length) {
    tokenRx.lastIndex = position;
    const m = tokenRx.exec(normalized);
    if (!m) throw Error('Invalid input');
    tokens.push(m[1]); position = tokenRx.lastIndex;
  }
  let i = 0;
  const peek = () => tokens[i];
  const accept = t => { if (peek() === t) { i++; return true; } return false; };
  const requireToken = t => { if (!accept(t)) throw Error('Missing ' + t); };
  function primary() {
    const t = peek();
    if (accept('(')) { const v = sum(); requireToken(')'); return v; }
    if (accept('π')) return Math.PI;
    if (accept('ℯ') || accept('e')) return Math.E;
    if (['sin','cos','tan','sqrt','√'].includes(t)) {
      i++; requireToken('('); const x = sum(); requireToken(')');
      if (t === 'sqrt' || t === '√') { if (x < 0) throw Error('Domain error'); return Math.sqrt(x); }
      const a = degreeMode ? x * Math.PI / 180 : x;
      if (t === 'sin') return Math.sin(a);
      if (t === 'cos') return Math.cos(a);
      if (Math.abs(Math.cos(a)) < 1e-12) throw Error('Undefined tangent');
      return Math.tan(a);
    }
    if (t && /^(?:\d|\.)/.test(t)) { i++; return Number(t); }
    throw Error('Incomplete expression');
  }
  function postfix() { let v = primary(); while (accept('%')) v /= 100; return v; }
  function power() { let v = postfix(); if (accept('^')) v = Math.pow(v, unary()); return v; }
  function unary() { if (accept('+')) return unary(); if (accept('-')) return -unary(); return power(); }
  function product() { let v = unary(); while (peek() === '*' || peek() === '/') { const op = tokens[i++], rhs = unary(); if (op === '/' && rhs === 0) throw Error('Division by zero'); v = op === '*' ? v * rhs : v / rhs; } return v; }
  function sum() { let v = product(); while (peek() === '+' || peek() === '-') { const op = tokens[i++], rhs = product(); v = op === '+' ? v + rhs : v - rhs; } return v; }
  if (!tokens.length) return 0;
  const result = sum();
  if (i !== tokens.length) throw Error('Unexpected symbol');
  if (!Number.isFinite(result)) throw Error('Invalid result');
  return result;
}
function tryValue() { try { return evaluate(expression); } catch { return null; } }
function show() {
  const shown = expression || '0';
  resultEl.textContent = error ? 'Error' : shown;
  resultEl.classList.toggle('error', error);
  resultEl.classList.toggle('small', shown.length > 14);
  const val = !error && !justEvaluated && expression ? tryValue() : null;
  previewEl.textContent = error ? 'Invalid operation' : justEvaluated ? 'Result' : val === null ? '' : '= ' + formatNumber(val);
  clearEl.textContent = expression && !justEvaluated && !error ? 'C' : 'AC';
  $('memoryStatus').textContent = memory === null ? '' : 'M  ' + formatNumber(memory);
  document.querySelectorAll('.key.operator[data-value]').forEach(btn => {
    btn.classList.toggle('active', !error && expression.endsWith(btn.dataset.value));
  });
}
function reset() { expression = ''; justEvaluated = false; error = false; show(); }
function backspace() { if (error || justEvaluated) return reset(); expression = expression.slice(0,-1); show(); }
function append(v) {
  if (error) reset();
  const operators = '+−×÷^';
  if (justEvaluated) { if (!operators.includes(v) && v !== '%') expression = ''; justEvaluated = false; }
  if (/^\d$/.test(v)) {
    if (/[πℯ)%]$/.test(expression)) expression += '×';
    // Replace leading zero in the active number.
    if (/(^|[+−×÷^(])0$/.test(expression)) expression = expression.slice(0,-1);
    expression += v;
  } else if (v === '.') {
    const lastNumber = expression.match(/(?:^|[+−×÷^(])(\d*\.?\d*)$/);
    if (lastNumber && lastNumber[1].includes('.')) return;
    if (/[πℯ)%]$/.test(expression)) expression += '×0';
    else if (!/\d$/.test(expression)) expression += '0';
    expression += '.';
  } else if (operators.includes(v)) {
    if (!expression) { if (v === '−') expression = '−'; else return; }
    else if (/[+−×÷^]$/.test(expression)) {
      // Permit a unary minus after multiplication, division or power.
      if (v === '−' && /[×÷^]$/.test(expression)) expression += v;
      else if (expression !== '−') expression = expression.replace(/[+−×÷^]+$/, v);
    } else if (expression.endsWith('(')) { if (v === '−') expression += v; }
    else expression += v;
  } else if (v === '(' || /^(sin|cos|tan|√)\($/.test(v) || v === 'π' || v === 'ℯ') {
    if (/(?:\d|[πℯ)%])$/.test(expression)) expression += '×';
    expression += v;
  } else if (v === ')') {
    const opens = (expression.match(/\(/g)||[]).length, closes = (expression.match(/\)/g)||[]).length;
    if (opens > closes && /[\dπℯ)%]$/.test(expression)) expression += ')';
  }
  show();
}
function currentValue() { const v = tryValue(); return v === null ? null : Number(formatNumber(v)); }
function equals() {
  if (error || !expression) return;
  try {
    const answer = formatNumber(evaluate(expression));
    history.unshift({ expr:expression, answer }); history = history.slice(0,60);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
    expression = answer.replace(/-/g,'−'); justEvaluated = true; renderHistory(); show();
  } catch { error = true; show(); }
}
function signToggle() {
  if (error) return;
  // Toggle the sign of the last numeric entry, preserving earlier operations.
  const m = expression.match(/(\d+(?:\.\d*)?|\.\d+)$/);
  if (!m) { if (!expression) append('−'); return; }
  const start = expression.length - m[0].length;
  const before = expression.slice(0,start);
  if (before.endsWith('−') && (before.length === 1 || /[+−×÷^(]/.test(before.at(-2)))) {
    expression = before.slice(0,-1) + m[0];
  } else if (before.endsWith('−') && before.length > 1 && !/[+−×÷^(]/.test(before.at(-2))) {
    expression = before.slice(0,-1) + '+' + m[0];
  } else if (before.endsWith('+')) {
    expression = before.slice(0,-1) + '−' + m[0];
  } else expression = before + '−' + m[0];
  justEvaluated = false; show();
}
function percent() {
  if (error) return;
  if (/(?:\d|\)|π|ℯ)$/.test(expression)) { expression += '%'; justEvaluated = false; show(); }
}
function clearEntry() {
  if (error || justEvaluated || !expression) return reset();
  // Clear only the most recent number, while AC resets the entire expression.
  const previous = expression;
  expression = expression.replace(/(?:\d+(?:\.\d*)?|\.\d+)$/, '');
  if (expression === previous) expression = '';
  show();
}
function operate(action) {
  if (action === 'clear') return clearEntry();
  if (action === 'backspace') return backspace();
  if (action === 'equals') return equals();
  if (action === 'sign') return signToggle();
  if (action === 'percent') return percent();
  if (action === 'square') { if (expression && /[\dπℯ)%]$/.test(expression)) { expression += '^2'; justEvaluated = false; show(); } return; }
  if (action === 'mc') memory = null;
  if (action === 'mr') { if (memory !== null) { if (error || justEvaluated) reset(); const v = '(' + formatNumber(memory).replace(/-/g,'−') + ')'; if (/[\dπℯ)%]$/.test(expression)) expression += '×'; expression += v; } }
  if (action === 'mplus' || action === 'mminus') {
    const v = currentValue(); if (v === null) { error = true; show(); return; }
    memory = Number(formatNumber((memory ?? 0) + (action === 'mplus' ? v : -v)));
  }
  show();
}
document.querySelector('.app').addEventListener('click', e => {
  const button = e.target.closest('button[data-value],button[data-action]');
  if (!button) return;
  if (button.dataset.value !== undefined) append(button.dataset.value);
  else operate(button.dataset.action);
});
// Physical keyboard, including numpad and scientific shortcuts.
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || $('drawer').classList.contains('open')) {
    if (e.key === 'Escape') closeHistory();
    return;
  }
  const map = {'*':'×','/':'÷','-':'−',',':'.'};
  if (/^[0-9.]$/.test(e.key) || ['+','-','*','/','^','(',')','%'].includes(e.key)) {
    e.preventDefault(); const v = map[e.key] || e.key; if (v === '%') percent(); else append(v);
  } else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); }
  else if (e.key === 'Escape') { e.preventDefault(); reset(); }
  else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
});
// Swipe left to remove the last character without obstructing vertical scrolling.
let touchX = null;
$('display').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, {passive:true});
$('display').addEventListener('touchend', e => {
  if (touchX !== null && e.changedTouches[0].clientX - touchX < -45) backspace();
  touchX = null;
}, {passive:true});
$('scienceButton').addEventListener('click', () => {
  const area = $('scienceKeys'); area.hidden = !area.hidden;
  $('scienceButton').setAttribute('aria-pressed', String(!area.hidden));
});
$('angleButton').addEventListener('click', () => { degreeMode = !degreeMode; $('angleButton').textContent = degreeMode ? 'DEG' : 'RAD'; show(); });
function openHistory() { $('drawer').classList.add('open'); $('scrim').classList.add('open'); $('drawer').setAttribute('aria-hidden','false'); renderHistory(); $('closeHistory').focus(); }
function closeHistory() { $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); $('drawer').setAttribute('aria-hidden','true'); $('historyButton').focus(); }
function renderHistory() {
  const list = $('historyList'); list.replaceChildren();
  if (!history.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No calculations yet'; list.append(empty); return; }
  history.forEach(entry => {
    const btn = document.createElement('button'); btn.className = 'history-item';
    const exp = document.createElement('span'); exp.className = 'old-exp'; exp.textContent = entry.expr;
    const ans = document.createElement('span'); ans.className = 'old-answer'; ans.textContent = '= ' + entry.answer;
    btn.append(exp,ans);
    btn.addEventListener('click', () => { expression = entry.answer.replace(/-/g,'−'); error = false; justEvaluated = true; show(); closeHistory(); });
    list.append(btn);
  });
}
$('historyButton').addEventListener('click',openHistory);
$('closeHistory').addEventListener('click',closeHistory);
$('closeHistoryBottom').addEventListener('click',closeHistory);
$('scrim').addEventListener('click',closeHistory);
$('clearHistory').addEventListener('click', () => { history = []; try { localStorage.removeItem(HISTORY_KEY); } catch {} renderHistory(); });
renderHistory(); show();