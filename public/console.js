(() => {
  const ns = 'http://www.w3.org/2000/svg';
  const shapes = {
    grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    layers: ['m12 3 9 5-9 5-9-5 9-5Z', 'm3 12 9 5 9-5M3 16l9 5 9-5'],
    star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z'],
    plus: ['M12 5v14M5 12h14'],
    refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9'],
    shield: ['M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z', 'm8 12 3 3 5-6'],
    arrow: ['M5 12h14m-5-5 5 5-5 5'],
    close: ['m6 6 12 12M6 18 18 6'],
    terminal: ['m5 7 5 5-5 5M13 17h6'],
    search: ['M21 21l-5-5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z']
  };
  function icon(name) { const svg = document.createElementNS(ns, 'svg'); for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v); (shapes[name] ?? shapes.grid).forEach(d => { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); svg.append(p); }); return svg; }
  const by = id => document.getElementById(id);
  function button(id, symbol, text) { const b = by(id); if (!b) return; const count = b.querySelector('b'); b.replaceChildren(icon(symbol), document.createTextNode(text)); if (count) b.append(count); }
  const brandLink=document.querySelector('.brand'),brand=document.createElement('div');brand.className='brand';brand.append(...brandLink.childNodes);brandLink.replaceWith(brand);
  function themeButton(compact=false){const button=document.createElement('button');button.type='button';button.className=compact?'theme-toggle theme-toggle-caption':'theme-toggle';button.dataset.themeToggle='';const img=document.createElement('img');img.dataset.themeIcon='';img.alt='';button.append(img);button.onclick=async()=>{try{await window.starbridgeTheme.ready;await window.starbridgeTheme.set(document.documentElement.dataset.theme==='frost'?'anime':'frost');document.getElementById('theme-feedback').textContent='主题已切换并保存';}catch(error){document.getElementById('theme-feedback').textContent=error.message;}};return button;}
  brand.firstChild.replaceWith(themeButton());
  const feedback=document.createElement('span');feedback.id='theme-feedback';feedback.className='theme-feedback';feedback.setAttribute('role','status');document.body.append(feedback);
  brand.querySelector('span').firstChild.textContent = '星桥';
  document.querySelector('.brand small').textContent = 'STARBRIDGE';
  document.title = '星桥 Starbridge';
  const titlebar = document.createElement('div'); titlebar.className = 'window-titlebar'; const titleIcon = themeButton(true); const caption = document.createElement('span'); caption.textContent = '星桥 Starbridge'; titlebar.append(titleIcon, caption); document.body.prepend(titlebar);window.starbridgeTheme.sync();
  document.querySelector('.section-label').textContent = '工作空间';
  button('desktop-settings-button','shield','应用设置');button('user-guide-button','layers','使用方法');
  button('profiles-nav', 'layers', 'API / 套餐库'); button('all-nav', 'grid', '工具目录'); button('saved-nav', 'star', '已选工具');
  button('agent-model-nav', 'terminal', 'Agent 模型');button('extension-center-nav','layers','扩展中心');button('workspace-nav','grid','工作台');
  const header = document.querySelector('header'); header.lastElementChild.textContent = '本地工作空间';
  const note = document.querySelector('.notice'); note.firstElementChild.replaceWith(icon('shield'));
  document.querySelector('.intro .eyebrow').textContent = 'TOOLS / DISCOVERY';
  document.querySelector('.profiles-pane .eyebrow').textContent = 'CONNECTIONS / PROVIDERS';
  document.querySelector('.profiles-pane .intro h1').textContent = '模型连接';
  document.querySelector('.profiles-pane .intro p').textContent = '集中管理 API 与 Coding Plan，按工具分配使用。';
  const add = document.querySelector('.profiles-pane .intro .primary'); add.replaceChildren(icon('plus'), document.createTextNode('添加连接'));
  const content = document.createElement('div'); content.className = 'connections-layout';
  const list = document.createElement('div'); list.className = 'connections-main';
  const pane = document.querySelector('.profiles-pane');
  for (const child of [...pane.children].slice(2)) list.append(child);
  const help = document.createElement('aside'); help.className = 'connection-guide';
  const cap = document.createElement('div'); cap.className = 'guide-cap'; cap.append(icon('terminal'), document.createTextNode('配置工作流')); help.append(cap);
  for (const [num, title, detail] of [['01', '添加模型服务', '填写接口地址、API Key 与模型 ID，或添加本地服务。'], ['02', '分配给工具', '选择 Claude Code、ZCode 等需要使用此连接的工具。'], ['03', '预览、备份与应用', '到工作台预览并逐项应用，查看兼容性与未完成事项。各工具的实际适配范围以设置为准。']]) { const step = document.createElement('div'); step.className = 'guide-step'; const number = document.createElement('span'); number.textContent = num; const body = document.createElement('div'); const h = document.createElement('h3'); h.textContent = title; const p = document.createElement('p'); p.textContent = detail; body.append(h, p); step.append(number, body); help.append(step); }
  const security = document.createElement('div'); security.className = 'guide-security'; security.append(icon('shield')); const securityText = document.createElement('p'); securityText.textContent = '密钥由 Windows 加密保护，仅保存在当前用户目录。'; security.append(securityText); help.append(security);
  content.append(list, help); pane.append(content);
  const bottom = document.querySelector('.aside-bottom'); bottom.replaceChildren(icon('shield')); const bottomText = document.createElement('span'); bottomText.textContent = '本机加密存储'; const version = document.createElement('small'); version.textContent = 'Starbridge 0.14.5 · Desktop'; bottomText.append(version); bottom.append(bottomText);
  const setNav = () => { document.querySelectorAll('.nav').forEach(b => { if (b.classList.contains('active')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); };
  const observer = new MutationObserver(setNav); document.querySelectorAll('.nav').forEach(b => observer.observe(b, { attributes: true, attributeFilter: ['class'] })); setNav();
  const scanButton = by('scan'); const polishScan = () => { const label = scanButton.textContent.includes('正在') ? '正在扫描…' : scanButton.textContent.includes('重新') ? '重新扫描' : '扫描本机'; if (scanButton.querySelector('svg') && scanButton.lastChild.textContent === label) return; scanButton.replaceChildren(icon('refresh'), document.createTextNode(label)); }; new MutationObserver(polishScan).observe(scanButton, { childList: true }); polishScan();
  ['close-detail', 'profile-close', 'binding-close','model-manager-close','agent-config-close','application-close','migration-close','check-close','delete-close','recovery-close','import-preview-close','desktop-settings-close','scheme-close','user-guide-close'].forEach(id => by(id)?.replaceChildren(icon('close')));
  const emptyIcon = () => { document.querySelectorAll('.empty-symbol').forEach(n => { if (!n.querySelector('svg')) n.replaceChildren(icon('layers')); }); document.querySelectorAll('.provider-empty .primary').forEach(n => { if (n.textContent.startsWith('＋')) n.replaceChildren(icon('plus'), document.createTextNode('添加第一个连接')); }); };
  new MutationObserver(emptyIcon).observe(document.querySelector('.provider-cards'), { childList: true }); emptyIcon();
  document.querySelectorAll('dialog:not([aria-label]):not([aria-labelledby])').forEach(d => { d.setAttribute('aria-label', d.classList.contains('profile-dialog') ? '连接配置' : '工具详情'); });
  document.querySelectorAll('.tab').forEach(b => { const update = () => b.setAttribute('aria-pressed', String(b.classList.contains('active'))); new MutationObserver(update).observe(b, { attributes: true, attributeFilter: ['class'] }); update(); });
})();

