(() => {
  const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  window.createProfileModelEditor=(form,getDraft)=>{
    const legacy=form.elements.models;legacy.closest('label').hidden=true;
    const section=make('section','profile-model-editor wide');section.setAttribute('aria-label','连接模型');
    section.innerHTML=`<div class="profile-model-heading"><h3>连接模型</h3><button type="button" id="profile-fetch-models" class="text-button">获取模型列表</button></div><p class="muted">填写接口和密钥后获取，勾选需要的模型。模型属性可编辑；1M 为手动能力声明。</p><div class="profile-model-manual"><label>手动添加模型<input id="profile-model-id" maxlength="200" placeholder="输入模型 ID"></label><button type="button" id="profile-model-add" class="text-button">添加</button></div><p id="profile-model-status" class="muted" role="status" aria-live="polite"></p><div id="profile-selected-models"></div>`;
    legacy.closest('label').after(section);
    const picker=make('dialog','profile-dialog profile-model-picker');picker.setAttribute('aria-label','选择连接模型');picker.innerHTML=`<div class="dialog-top"><span class="eyebrow">AVAILABLE MODELS</span><button type="button" id="profile-picker-close" aria-label="关闭模型选择">×</button></div><h2>选择模型</h2><p class="muted">点击应用后更新连接草稿，保存配置后生效。已配置但接口未返回的模型也会保留供选择。</p><label class="connection-field">搜索模型<input type="search" id="profile-picker-search" placeholder="搜索模型 ID"></label><div class="profile-model-heading"><button type="button" id="profile-picker-all" class="text-button">勾选搜索结果</button><button type="button" id="profile-picker-none" class="text-button">取消搜索结果</button><button type="button" id="profile-picker-refresh" class="text-button">重新获取</button></div><p id="profile-picker-count" role="status"></p><div id="profile-picker-list" class="profile-picker-list"></div><div class="form-actions"><button type="button" id="profile-picker-cancel">取消</button><button type="button" id="profile-picker-apply" class="primary">应用选择</button></div>`;document.body.append(picker);
    const by=id=>document.getElementById(id),status=by('profile-model-status'),fetchButton=by('profile-fetch-models');
    let selected=new Map(),available=new Map(),checked=new Set(),generation=0,loadedFor='',busy=false;
    const snapshot=()=>JSON.stringify(getDraft());
    const sync=()=>{legacy.value=[...selected.keys()].join('\n');};
    const format=n=>n?.toLocaleString('zh-CN')??'未知';
    function describe(m){return `上下文 ${format(m.contextWindow)} · 最大输出 ${format(m.maxOutputTokens)} · 工具 ${m.toolCall===undefined?'未知':m.toolCall?'支持':'不支持'} · 推理 ${m.reasoning===undefined?'未知':m.reasoning?'支持':'不支持'} · 输入 ${m.inputModalities?.join('/')??'未知'}`;}
    function render(){
      sync();const list=by('profile-selected-models');list.replaceChildren();
      if(!selected.size)list.append(make('p','muted','尚未选择模型。可获取模型列表，也可手动添加。'));
      for(const [id,meta]of selected){
        const row=make('div','profile-selected-model');row.dataset.modelId=id;const top=make('div','profile-model-heading');top.append(make('code','',id));const remove=make('button','text-button danger-button','移除');remove.type='button';remove.setAttribute('aria-label',`移除 ${id}`);remove.onclick=()=>{selected.delete(id);render();};top.append(remove);row.append(top);
        const fields=make('div','profile-model-fields');
        for(const [key,title]of [['contextWindow','上下文窗口（Tokens）'],['maxOutputTokens','最大输出（Tokens）']]){const label=make('label','',title),input=make('input');input.type='number';input.min='1';input.step='1';input.placeholder='未知';input.value=meta[key]??'';input.oninput=()=>{if(input.value==='')delete meta[key];else meta[key]=Number(input.value);delete meta.metadataSource;};label.append(input);fields.append(label);}
        const oneM=make('label','profile-one-m'),box=make('input');box.type='checkbox';box.checked=meta.supports1M??false;box.onchange=()=>{meta.supports1M=box.checked;};oneM.append(box,document.createTextNode('声明支持 1M'));oneM.title='手动声明供 Claude Code 使用 [1m] 标记，不会修改实际请求模型 ID，也不代表已验证上游额度。';fields.append(oneM);row.append(fields,make('small','muted',describe(meta)+(meta.metadataSource?' · '+meta.metadataSource:'')));list.append(row);
      }
      status.textContent=`已选择 ${selected.size} 个模型`;
    }
    function renderPicker(){const term=by('profile-picker-search').value.toLowerCase(),list=by('profile-picker-list');list.replaceChildren();let shown=0;for(const [id,meta]of available){if(!id.toLowerCase().includes(term))continue;if(shown++>=200)continue;const label=make('label','profile-picker-row'),box=make('input');box.type='checkbox';box.value=id;box.checked=checked.has(id);box.onchange=()=>{box.checked?checked.add(id):checked.delete(id);updateCount();};const info=make('span');info.append(make('code','',id),make('small','muted',describe(meta)));label.append(box,info);list.append(label);}if(!shown)list.append(make('p','muted','没有匹配的模型'));if(shown>200)list.append(make('p','muted',`匹配 ${shown} 个模型，显示前 200 个，请搜索缩小范围。`));updateCount();}
    function updateCount(){by('profile-picker-count').textContent=`可选 ${available.size} 个 · 已勾选 ${checked.size} 个`;}
    function openPicker(){for(const [id,m]of selected)if(!available.has(id))available.set(id,{...m});checked=new Set(selected.keys());by('profile-picker-search').value='';renderPicker();if(!picker.open)picker.showModal();}
    async function fetchModels(){
      const current=snapshot(),request=++generation;busy=true;fetchButton.disabled=true;by('profile-picker-refresh').disabled=true;fetchButton.textContent='正在获取…';status.textContent='正在获取当前接口的模型列表…';
      try{const result=await window.allsetting.previewModels(getDraft());if(request!==generation||snapshot()!==current||!form.closest('dialog').open)return;if(!result.ok)throw Error(result.error);available=new Map(result.data.entries.map(m=>[m.id,m]));loadedFor=current;openPicker();status.textContent=`获取到 ${available.size} 个模型，请选择后应用`;}
      catch(error){if(request===generation&&snapshot()===current)status.textContent=error.message;}
      finally{if(request===generation){busy=false;fetchButton.disabled=false;by('profile-picker-refresh').disabled=false;fetchButton.textContent=available.size?'选择模型':'获取模型列表';}}
    }
    fetchButton.onclick=()=>{if(available.size&&loadedFor===snapshot())openPicker();else fetchModels();};by('profile-picker-refresh').onclick=fetchModels;
    by('profile-picker-search').oninput=renderPicker;
    by('profile-picker-all').onclick=()=>{const term=by('profile-picker-search').value.toLowerCase();for(const id of available.keys())if(id.toLowerCase().includes(term))checked.add(id);renderPicker();};
    by('profile-picker-none').onclick=()=>{const term=by('profile-picker-search').value.toLowerCase();for(const id of available.keys())if(id.toLowerCase().includes(term))checked.delete(id);renderPicker();};
    by('profile-picker-close').onclick=by('profile-picker-cancel').onclick=()=>{if(busy)invalidate();picker.close();};
    by('profile-picker-apply').onclick=()=>{selected=new Map([...checked].map(id=>[id,{...available.get(id),...selected.get(id)}]));render();picker.close();};
    by('profile-model-add').onclick=()=>{const input=by('profile-model-id'),id=input.value.trim();if(!id||id.length>200||['__proto__','constructor','prototype'].includes(id)){status.textContent='请填写有效的模型 ID';return;}if(!selected.has(id))selected.set(id,{});input.value='';render();};
    by('profile-model-id').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();by('profile-model-add').click();}};
    function invalidate(){generation++;busy=false;fetchButton.disabled=false;by('profile-picker-refresh').disabled=false;fetchButton.textContent='获取模型列表';available.clear();loadedFor='';if(picker.open)picker.close();}
    for(const name of ['baseUrl','key','protocol','billing'])form.elements[name].addEventListener('input',invalidate);
    form.closest('dialog').addEventListener('close',()=>{if(form.closest('dialog').open)return;invalidate();selected.clear();});
    const api={load(p){invalidate();selected=new Map((p?.models??[]).map(id=>[id,{...p.modelDetails?.[id]}]));render();},value(){// Compatibility with templates and desktop fixtures using the hidden field.
      const ids=legacy.value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean);return {models:ids,modelMetadata:Object.fromEntries(ids.map(id=>[id,selected.get(id)??{}]))};},fromLegacy(){selected=new Map(legacy.value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean).map(id=>[id,{}]));invalidate();render();}};
    form.modelEditor=api;return api;
  };
})();
