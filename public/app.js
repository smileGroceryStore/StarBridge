const $ = id => document.getElementById(id);
const labels = { unscanned: '尚未扫描', candidate: '发现安装候选', detected: '发现扩展', 'trace-only': '仅有配置痕迹', 'not-found': '未发现', error: '检测失败', unsupported: '待适配检测' };
const kinds = { cli: '命令行工具', extension: '编辑器扩展', editor: '编辑器', 'editor-host': '编辑器宿主', desktop: '桌面应用', agent: 'Agent', unknown: '待确认' };
function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
const known = new Set();
let tools = [], filter = 'all', savedOnly = false, current = null, token, busy = false;
let selected = new Set(stored('allsetting-selected', []).filter?.(v => typeof v === 'string') ?? []);
let manual = stored('allsetting-paths', {});
if (!manual || typeof manual !== 'object' || Array.isArray(manual)) manual = {};
function persist() { try { localStorage.setItem('allsetting-selected', JSON.stringify([...selected])); localStorage.setItem('allsetting-paths', JSON.stringify(manual)); } catch { $('summary').textContent = '浏览器无法保存设置，当前选择仅在本次会话有效'; } }
function el(tag, className, text) { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; }
async function api(url, options = {}) {
  if (window.allsetting) {
    if (url === '/api/catalog') return window.allsetting.catalog();
    if (url === '/api/scan') return window.allsetting.scan(JSON.parse(options.body || '{}'));
    throw Error('未知桌面操作');
  }
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-AllSetting-Token': token, ...options.headers } });
  const data = await res.json(); if (!res.ok) throw Error(data.error ?? '请求失败'); return data;
}
function render() {
  $('total').textContent = tools.length;
  $('found').textContent = tools.filter(t => ['candidate', 'detected'].includes(t.status)).length;
  $('traces').textContent = tools.filter(t => t.status === 'trace-only').length;
  $('selected').textContent = $('saved-count').textContent = [...selected].filter(id => known.has(id)).length;
  const query = $('search').value.trim().toLowerCase(), kind = $('kind').value;
  const visible = tools.filter(t => (!savedOnly || selected.has(t.id)) && (!query || `${t.name} ${t.id}`.toLowerCase().includes(query)) && (kind === 'all' || t.kind === kind || (kind === 'editor' && t.kind === 'editor-host')) && (filter === 'all' || (filter === 'found' ? ['candidate', 'detected'].includes(t.status) : t.status === 'not-found')));
  $('list').replaceChildren();
  for (const tool of visible) {
    const row = el('div', 'tool-row'), info = el('div', 'tool-info'), text = el('div');
    info.append(el('span', 'monogram', tool.name.slice(0, 2).toUpperCase()));
    const name = el('button', 'tool-name', tool.name); name.onclick = () => showDetail(tool.id);
    text.append(name, el('div', 'tool-kind', `${kinds[tool.kind]} · ${['opencode','pi','reasonix'].includes(tool.id)?'可预览应用':'可保存预设 · 写入待核验'}`)); info.append(text);
    const status = el('div'); status.append(el('span', `badge ${tool.status}`, labels[tool.status]));
    const label = el('label', 'select-label'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(tool.id); check.setAttribute('aria-label', `选择管理 ${tool.name}`);
    check.onchange = () => { check.checked ? selected.add(tool.id) : selected.delete(tool.id); persist(); render(); };
    label.append(check, document.createTextNode('选择')); row.append(info, status, label); $('list').append(row);
  }
  if (!visible.length) $('list').append(el('div', 'empty', savedOnly ? '还没有符合条件的已选工具。可以回到工具目录勾选。' : '没有匹配的工具，试试其他名称或筛选条件。'));
  $('summary').textContent = `显示 ${visible.length} / ${tools.length} 个工具${savedOnly ? ' · 已选择' : ''}`;
}
function showDetail(id) {
  current = id; const t = tools.find(t => t.id === id); $('detail-name').textContent = t.name;
  $('detail-body').replaceChildren(el('span', `badge ${t.status}`, labels[t.status]), el('p', 'muted', `${['opencode','pi','reasonix'].includes(t.id)?'支持配置预览与应用，请前往 Agent 模型页。':'目录已收录，可保存模型预设；写入适配器待核验。'} 未发现时可打开官方安装入口，安装后重新扫描。`));
  for (const evidence of t.evidence ?? []) { const card = el('div', 'evidence'); card.append(el('b', '', evidence.note), el('code', '', evidence.path)); if (evidence.host) card.append(el('span', 'muted', `宿主：${evidence.host} · 版本：${evidence.version ?? '未知'}`)); $('detail-body').append(card); }
  for (const error of t.errors ?? []) $('detail-body').append(el('p', 'muted', `检查受阻：${error.code} · ${error.path}`));
  $('manual-path').value = ''; $('path-message').textContent = '';
  $('manual-list').replaceChildren();
  for (const p of Array.isArray(manual[id]) ? manual[id] : []) { const line = el('p', 'muted', p), remove = el('button', '', '移除'); remove.disabled = busy; remove.onclick = async () => { manual[id] = manual[id].filter(x => x !== p); persist(); await scan(); showDetail(id); }; line.append(remove); $('manual-list').append(line); }
  const valid = /^https:\/\//.test(t.source); $('official').hidden = !valid; if (valid) $('official').href = t.source;
  $('official').onclick = window.allsetting ? async event => { event.preventDefault(); try { await window.allsetting.openOfficial(t.source); } catch (error) { $('path-message').textContent = error.message; } } : null;
  if (!valid) $('detail-body').append(el('p', 'muted', '官方来源待确认，暂不提供安装入口。'));
  if (!$('detail').open) $('detail').showModal();
}
async function scan() {
  if (busy) return false;
  busy = true; $('scan').disabled = true; $('scan').textContent = '正在扫描…'; $('summary').textContent = '检查路径与扩展清单…';
  try {
    const result = await api('/api/scan', { method: 'POST', body: JSON.stringify({ manualPaths: manual }) });
    tools = result.tools; render();
    $('scope').textContent = `扫描完成 ${new Date(result.scannedAt).toLocaleString('zh-CN')} · ${result.scope}。命令候选尚未验证产品身份。`;
    return true;
  } catch (error) { $('summary').textContent = error.message; $('scope').textContent = '本次扫描未完成，列表保留上次结果。'; return false; }
  finally { busy = false; $('scan').disabled = false; $('scan').textContent = '↻ 重新扫描'; }
}
$('scan').onclick = scan;
$('close-detail').onclick = () => $('detail').close();
$('search').oninput = render; $('kind').onchange = render;
document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === b)); render(); });
function view(saved) { savedOnly = saved; $('all-nav').classList.toggle('active', !saved); $('saved-nav').classList.toggle('active', saved); render(); }
$('all-nav').onclick = () => view(false); $('saved-nav').onclick = () => view(true);
$('path-form').onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  const id = current, value = $('manual-path').value.trim();
  if (!value) return;
  const previous = Array.isArray(manual[id]) ? manual[id] : [];
  if (previous.length >= 10) { $('path-message').textContent = '每个工具最多保存 10 条路径'; return; }
  manual[id] = [...new Set([...previous, value])]; persist();
  const ok = await scan(); showDetail(id);
  $('path-message').textContent = ok ? '路径检查已完成，请查看上方证据或错误。' : '检查失败，路径已保留，可稍后重新扫描。';
};
async function init() {
  try { if (!window.allsetting) token = (await (await fetch('/api/session')).json()).token; const catalog = await api('/api/catalog'); tools = catalog.tools.map(t => ({ ...t, status: 'unscanned' })); tools.forEach(t => known.add(t.id)); render(); }
  catch (e) { $('summary').textContent = `无法连接本地服务：${e.message}`; }
}
if (window.allsetting) {
  const pick = el('button', '', '浏览文件…'); pick.type = 'button';
  pick.onclick = async () => { try { const file = await window.allsetting.pickExecutable(); if (file) $('manual-path').value = file; } catch (error) { $('path-message').textContent = error.message; } };
  document.querySelector('.path-row').append(pick);
  document.querySelector('.aside-bottom small').textContent = '桌面应用 · v0.2.0';
}
init();
