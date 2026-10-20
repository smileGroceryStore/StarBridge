// Desktop profile workspace. No secret is stored in localStorage or returned by list APIs.
(() => {
  const dom = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const by = id => document.getElementById(id);
  const nav = dom('button', 'nav', '◈　API / 套餐库'); nav.id = 'profiles-nav'; document.querySelector('nav').prepend(nav);
  document.querySelector('.brand').firstChild.textContent = '⊞';
  document.querySelector('.brand small').textContent = 'AI WORKSPACE MANAGER';
  document.querySelector('.intro h1').textContent = '工具中心';
  document.querySelector('.intro .eyebrow').textContent = 'CONNECTED WORKSPACE';
  document.querySelector('.intro p').textContent = '发现、选择并管理这台设备上的 AI 工具。';
  document.querySelector('.notice b').textContent = '配置从这里开始';
  document.querySelector('.notice p').textContent = '先添加连接并分配模型，再到 Agent 模型页预览应用。OpenCode / Pi / Reasonix Studio 支持写入；其他工具仅保存预设。';
  const main = document.querySelector('main');
  const toolParts = [...main.children].filter(n => n.tagName !== 'HEADER');
  const pane = dom('section', 'profiles-pane'); pane.hidden = true; main.append(pane);
  const heading = dom('div', 'intro');
  const title = dom('div'); title.append(dom('div', 'eyebrow', 'PROVIDER LIBRARY'), dom('h1', '', 'API / 套餐库'), dom('p', '', '一份凭据，连接你的工作环境。'));
  const add = dom('button', 'primary', '＋ 新建配置'); heading.append(title, add); pane.append(heading);
  const stats = dom('div', 'profile-overview'); pane.append(stats);
  const bar = dom('div', 'provider-toolbar'); const query = dom('input'); query.type = 'search'; query.placeholder = '搜索名称、厂商、模型…'; query.setAttribute('aria-label', '搜索套餐'); bar.append(dom('h2', '', '我的配置'), query); pane.append(bar);
  const cards = dom('div', 'provider-cards'), message = dom('p', 'muted'); message.setAttribute('role', 'status'); pane.append(cards, message);
  const note = dom('div', 'library-note', '⌑  密钥由 Windows 系统加密后保存在当前用户目录。实际应用与文件状态请到 Agent 模型查看。'); pane.append(note);
  let state = { profiles: [], bindings: {} }, catalogue = [], editing = null, binding = null;
  const protocols = { 'openai-chat': 'OpenAI Chat', 'openai-responses': 'OpenAI Responses', anthropic: 'Anthropic', gemini: 'Gemini' };
  const billings = { api: '按量 API', 'coding-plan': 'Coding Plan', local: '本地服务' };
  async function action(method, input) { if (!window.allsetting) throw Error('套餐库仅在桌面应用中可用'); const r = await window.allsetting[method](input); if (!r.ok) throw Error(r.error); state = r.data; render(); window.dispatchEvent(new Event('profiles-updated')); return r.data; }
  window.starbridgeProfiles = { getState: () => state, getCatalogue: () => catalogue, action, render, includeArchived:false,sortMode:'favorite' };
  function render() {
    stats.replaceChildren();
    for (const [label, value] of [['全部配置', state.profiles.length], ['已启用', state.profiles.filter(p => p.enabled).length], ['已分配工具', Object.keys(state.bindings).length]]) { const item = dom('div'); item.append(dom('span', '', label), dom('strong', '', value)); stats.append(item); }
    cards.replaceChildren();
    const term = query.value.toLowerCase();
    for (const p of [...state.profiles].sort((a,b)=>window.starbridgeProfiles.sortMode==='name'?a.name.localeCompare(b.name,'zh-CN'):window.starbridgeProfiles.sortMode==='recent'?(b.lastUsedAt??'').localeCompare(a.lastUsedAt??''):Number(!!b.favorite)-Number(!!a.favorite)).filter(p => (window.starbridgeProfiles.includeArchived||!p.archived)&&`${p.name} ${p.vendor} ${p.models.join(' ')}`.toLowerCase().includes(term))) {
      const card = dom('article', `provider-card ${p.enabled ? '' : 'disabled'}`);card.dataset.profileId=p.id;
      const top = dom('div', 'provider-top'), identity = dom('div', 'provider-identity');
      const letters = dom('span', 'provider-logo', (p.vendor || p.name).slice(0, 2).toUpperCase());
      const names = dom('div'); names.append(dom('h3', '', p.name), dom('small', '', `${p.vendor || '自定义服务'} · ${billings[p.billing]}`)); identity.append(letters, names);
      const toggle = dom('button', `toggle ${p.enabled ? 'on' : ''}`, p.enabled ? '已启用' : '已停用'); toggle.setAttribute('aria-label', `${p.enabled ? '停用' : '启用'} ${p.name}`);
      toggle.onclick = async () => { toggle.disabled = true; try { await action('toggleProfile', { id: p.id, enabled: !p.enabled }); message.textContent = '状态已保存；未修改工具配置'; } catch (e) { message.textContent = e.message; toggle.disabled = false; } };
      if(p.archived){toggle.disabled=true;toggle.textContent='已归档';}const favorite=dom('button','text-button favorite-button',p.favorite?'已收藏':'收藏');favorite.setAttribute('aria-pressed',String(!!p.favorite));favorite.onclick=async()=>{favorite.disabled=true;try{await action('favoriteProfile',{id:p.id,favorite:!p.favorite});}catch(e){message.textContent=e.message;favorite.disabled=false;}};top.append(identity,favorite,toggle); card.append(top);
      const endpoint = dom('div', 'endpoint'); endpoint.append(dom('span', 'eyebrow', protocols[p.protocol]), dom('code', '', p.baseUrl)); card.append(endpoint);
      const models = dom('div', 'model-tags'); p.models.slice(0,5).forEach(m => models.append(dom('span', '', m))); if(p.models.length>5)models.append(dom('span','',`另有 ${p.models.length-5} 个模型`)); if (!p.models.length) models.append(dom('span', '', '模型待补充')); card.append(models);
      const bottom = dom('div', 'provider-bottom'); const ids = Object.keys(state.bindings).filter(id => state.bindings[id] === p.id||(state.toolModels?.[id]?.connections??[]).some(c=>c.profileId===p.id));
      bottom.append(dom('span', 'muted', `${p.hasKey ? '● 密钥已加密' : '○ 无密钥'} · ${ids.length} 个工具预设`));
      const buttons = dom('div'), edit = dom('button', 'text-button', '编辑'), assign = dom('button', 'text-button', '分配工具 →'), manage = dom('button','text-button',`模型 · ${p.models.length}`);
      manage.onclick=()=>window.dispatchEvent(new CustomEvent('manage-profile-models',{detail:p.id}));
      edit.onclick = () => editProfile(p); assign.disabled = !p.enabled; assign.onclick = () => bindProfile(p); buttons.append(manage,edit, assign); bottom.append(buttons); card.append(bottom); cards.append(card);
    }
    if (!cards.children.length) { const empty = dom('div', 'provider-empty'); empty.append(dom('div', 'empty-symbol', '◈'), dom('h2', '', state.profiles.length ? '没有匹配的配置' : '连接你的第一个模型服务'), dom('p', 'muted', '支持 Coding Plan、按量 API 和本地模型服务。')); const button = dom('button', 'primary', '＋ 新建配置'); button.onclick = () => editProfile(); empty.append(button); cards.append(empty); }
  }
  const modal = dom('dialog', 'profile-dialog');
  modal.innerHTML = `<form id="profile-form"><div class="dialog-top"><span class="eyebrow">PROVIDER CONFIGURATION</span><button type="button" id="profile-close" aria-label="关闭配置">×</button></div><h2 id="profile-heading">新建配置</h2><p class="muted">填写连接后可直接获取并选择模型，保存后再分配给工具。</p><div class="form-grid"><label>配置名称<input name="name" required maxlength="100" placeholder="例如：我的 Coding Plan"></label><label>厂商 / 服务商<input name="vendor" maxlength="100" placeholder="例如：智谱、DeepSeek、自建网关"></label><label>计费类型<select name="billing"><option value="api">按量 API</option><option value="coding-plan">Coding Plan</option><option value="local">本地服务（可无密钥）</option></select></label><label>接口协议<select name="protocol"><option value="openai-chat">OpenAI Chat Completions</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Gemini</option></select></label><label class="wide">Base URL<input name="baseUrl" type="url" required maxlength="2048" placeholder="https://你的服务地址/v1"></label><label class="wide">API Key<input name="key" type="password" autocomplete="new-password" maxlength="8192" placeholder="输入 API Key；编辑时留空保留原密钥"></label><label hidden><input name="models" type="hidden"></label><label class="wide">备注<textarea name="notes" rows="2" maxlength="4000" placeholder="套餐额度、到期时间或使用说明（不自动查询余额）"></textarea></label></div><label class="enabled-check"><input name="enabled" type="checkbox" checked> 保存后启用</label><p id="profile-error" class="form-error" role="alert"></p><div class="form-actions"><button type="button" id="profile-cancel">取消</button><button class="primary" id="profile-save">保存配置</button></div></form>`;
  document.body.append(modal); const form = by('profile-form');
  const modelEditor=window.createProfileModelEditor(form,()=>({id:editing,baseUrl:form.elements.baseUrl.value.trim(),key:form.elements.key.value,protocol:form.elements.protocol.value,billing:form.elements.billing.value}));
  const close = () => { form.reset(); form.elements.key.value = ''; modal.close(); };
  by('profile-close').onclick = by('profile-cancel').onclick = close; modal.addEventListener('close', () => { form.elements.key.value = ''; });
  function editProfile(p) { editing = p?.id ?? null; form.reset(); by('profile-error').textContent = ''; by('profile-heading').textContent = p ? '编辑配置' : '新建配置';
    for (const name of ['name', 'vendor', 'baseUrl', 'protocol', 'billing', 'notes']) if (p) form.elements[name].value = p[name];
    form.elements.models.value = p?.models.join('\n') ?? ''; modelEditor.load(p); form.elements.enabled.checked = p?.enabled ?? true; form.elements.key.placeholder = p?.hasKey ? '已保存加密密钥，留空保留；输入新值可替换' : '输入 API Key，本地服务可以留空'; const prior=by('profile-endpoint-impact');if(prior)prior.remove();if(p){const impact=dom('p','muted');impact.id='profile-endpoint-impact';const overrides=Object.values(p.modelDetails??{}).filter(d=>!d.inherit).length;impact.textContent=`默认地址修改影响 ${p.models.length-overrides} 个继承模型；${overrides} 个独立模型地址保持覆盖。可在模型库修改继承设置。`;form.elements.baseUrl.closest('label').append(impact);}modal.showModal(); }
  form.onsubmit = async event => { event.preventDefault(); const save = by('profile-save'); save.disabled = true;
    try { const data = Object.fromEntries(new FormData(form)); await action('saveProfile', { id: editing, name: data.name, vendor: data.vendor, baseUrl: data.baseUrl, protocol: data.protocol, billing: data.billing, notes: data.notes, key: data.key, enabled: form.elements.enabled.checked, ...modelEditor.value() }); close(); message.textContent = '配置已加密保存'; }
    catch (error) { by('profile-error').textContent = error.message; } finally { save.disabled = false; }
  };
  const assignModal = dom('dialog', 'profile-dialog'); assignModal.innerHTML = `<div class="dialog-top"><span class="eyebrow">TOOL ASSIGNMENT</span><button id="binding-close" aria-label="关闭分配">×</button></div><h2 id="binding-title"></h2><p class="muted">每个工具可预设一个当前套餐。选中已分配其他套餐的工具会替换预设；本次不会修改工具配置。</p><div id="binding-tools" class="binding-tools"></div><p id="binding-error" class="form-error" role="alert"></p><div class="form-actions"><button id="binding-save" class="primary">保存分配</button></div>`; document.body.append(assignModal);
  by('binding-close').onclick = () => assignModal.close();
  function bindProfile(p) { binding = p.id; by('binding-title').textContent = `分配工具 · ${p.name}`; by('binding-error').textContent = ''; by('binding-tools').replaceChildren();
    for (const t of catalogue) { const label = dom('label', 'binding-item'), box = dom('input'); box.type = 'checkbox'; box.value = t.id; box.checked = state.bindings[t.id] === p.id; const text = dom('span', '', t.name); const other = state.profiles.find(p => p.id === state.bindings[t.id]); if (other && other.id !== p.id) text.append(dom('small', '', `当前：${other.name}`)); label.append(box, text); by('binding-tools').append(label); } assignModal.showModal();
  }
  by('binding-save').onclick = async () => { const button = by('binding-save'); button.disabled = true; try { await action('bindProfile', { id: binding, toolIds: [...by('binding-tools').querySelectorAll('input:checked')].map(i => i.value) }); assignModal.close(); message.textContent = '工具分配已保存；尚未写入工具配置'; } catch (e) { by('binding-error').textContent = e.message; } finally { button.disabled = false; } };
  function switchView(isProfile) { toolParts.forEach(n => n.hidden = isProfile); pane.hidden = !isProfile; nav.classList.toggle('active', isProfile); const crumb = document.querySelector('header>span'); crumb.replaceChildren(document.createTextNode('工作空间'), dom('i', '', '/'), document.createTextNode(isProfile ? 'API / 套餐库' : '工具中心')); if (isProfile) { by('all-nav').classList.remove('active'); by('saved-nav').classList.remove('active'); } }
  nav.onclick = () => switchView(true); by('all-nav').addEventListener('click', () => switchView(false)); by('saved-nav').addEventListener('click', () => switchView(false)); add.onclick = () => editProfile(); query.oninput = render;
  window.profileWorkspaceReady = (async () => { try { if (window.allsetting) { catalogue = (await window.allsetting.catalog()).tools; await action('profiles'); } else render(); } catch (error) { message.textContent = error.message; add.disabled = true; } })();
  switchView(true);
})();

