(() => {
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;},$=id=>document.getElementById(id);
 const call=async(method,input)=>{const r=await window.allsetting[method](input);if(!r.ok)throw Error(r.error);return r.data;};
 const button=el('button','nav','应用设置');button.id='desktop-settings-button';document.querySelector('nav').append(button);
 const modal=el('dialog','profile-dialog desktop-settings-dialog');modal.setAttribute('aria-label','应用设置');
 modal.innerHTML=`<form id="desktop-settings-form"><div class="dialog-top"><span class="eyebrow">DESKTOP / BACKGROUND</span><button type="button" id="desktop-settings-close" aria-label="关闭应用设置">×</button></div><h2>应用设置</h2><p class="muted">关闭窗口后可在托盘重新打开。后台保留进程，不自动调用模型。</p><label class="binding-item"><input name="closeToTray" type="checkbox">关闭窗口后在后台运行</label><label class="binding-item"><input name="minimizeToTray" type="checkbox">最小化时隐藏到托盘</label><label class="binding-item"><input name="startAtLogin" type="checkbox">登录 Windows 后在后台启动</label><h3>工具配置目录与支持状态</h3><p class="muted">目录仅保存在本机。已支持的工具可更换目录，应用前仍会预览并备份；其他工具列在下方，待适配后开放写入。</p><label class="config-search-label">查找工具<input id="desktop-config-search" type="search" placeholder="名称，如 Harness、Claude、Codex" autocomplete="off"></label><p id="desktop-config-summary" class="muted" role="status"></p><div id="desktop-config-paths"></div><details id="desktop-pending-tools"><summary id="desktop-pending-summary">其他已收录工具</summary><p class="muted">这些工具的 API 连接写入仍待适配；部分已支持共享资源，具体能力见下方。资源同步请到扩展中心，手动安装或设置可查看官方入口。</p><div id="desktop-pending-list"></div></details><p id="desktop-settings-message" class="form-error" role="status"></p><div class="form-actions"><button type="button" id="desktop-hide">隐藏到托盘</button><button type="button" id="desktop-quit">彻底退出</button><button class="primary">保存后台设置</button></div></form>`;
 document.body.append(modal);let tools=[];
 function renderPaths(){
  const query=$('desktop-config-search').value.trim().toLowerCase(),matched=tools.filter(t=>(t.name+' '+t.id).toLowerCase().includes(query));
  $('desktop-config-summary').textContent=`API 配置写入 ${tools.filter(t=>t.writable).length} 项 / 已收录 ${tools.length} 项${query?' · 匹配 '+matched.length+' 项':''}`;
  $('desktop-config-paths').replaceChildren();$('desktop-pending-list').replaceChildren();
  for(const tool of matched){
   const row=el('section',tool.writable?'file-preview config-tool':'config-pending-row');row.dataset.configTool=tool.id;
   const title=el('div','config-tool-title');title.append(el('h4','',tool.name),el('span','badge',tool.writable?'支持 API 配置写入':tool.resourceKinds?.length?'支持部分共享资源':'待适配'));row.append(title);
   if(tool.writable){
    row.append(el('small','muted',tool.custom?'自定义目录 · 已保存':'默认目录 · 当前生效'),el('code','recovery-path',tool.directory??'路径暂无法确认'),el('p','muted',tool.message));
    if(tool.files)row.append(el('small','muted',tool.files.map(f=>f.name+(f.exists?' · 已存在':' · 应用时新建')).join(' / ')));
    const actions=el('div','config-tool-actions');
    for(const reset of [false,true]){const b=el('button','text-button',reset?'使用默认':'选择目录');b.type='button';b.disabled=reset&&!tool.custom;b.onclick=async()=>{
     document.querySelectorAll('#desktop-config-paths button').forEach(n=>n.disabled=true);
     try{const result=await call('pickConfigDirectory',{toolId:tool.id,reset});if(!result.canceled){tools=await call('configurationInfo');$('desktop-settings-message').textContent=`${tool.name} 的目录设置已保存；还需预览并应用配置。`;window.dispatchEvent(new Event('config-operation-finished'));window.starbridgeRefreshStatus?.();}}
     catch(e){$('desktop-settings-message').textContent=e.message;}finally{renderPaths();}
    };actions.append(b);}row.append(actions);$('desktop-config-paths').append(row);
   }else{
    row.append(el('p','muted',tool.resourceKinds?.length?'API 连接写入待适配；共享资源支持：'+tool.resourceKinds.map(k=>({mcp:'MCP',skill:'Skills',prompt:'提示词'}[k])).join(' / ')+'，请在扩展中心管理。':'尚未开放自动写入与配置目录修改'));
    if(tool.source?.startsWith('https://')){const official=el('button','text-button','官方入口');official.type='button';official.onclick=()=>window.allsetting.openOfficial(tool.source).catch(()=>$('desktop-settings-message').textContent='无法打开官方入口，请稍后重试');row.append(official);}
    $('desktop-pending-list').append(row);
   }
  }
  const pending=matched.filter(t=>!t.writable).length;$('desktop-pending-summary').textContent=`其他已收录工具 · ${pending} 项待适配`;$('desktop-pending-tools').hidden=!pending;if(query&&pending)$('desktop-pending-tools').open=true;
  if(!matched.length)$('desktop-config-paths').append(el('p','muted','没有匹配的工具，请尝试其他名称。'));
 }
 $('desktop-config-search').oninput=renderPaths;
 async function load(){const[s,info]=await Promise.all([call('deviceSettings'),call('configurationInfo')]);for(const key of ['closeToTray','minimizeToTray','startAtLogin'])$('desktop-settings-form').elements[key].checked=s[key];$('desktop-hide').disabled=!s.backgroundAvailable;tools=info;renderPaths();}
 button.onclick=async()=>{if(!modal.open)modal.showModal();$('desktop-settings-message').textContent='';$('desktop-config-search').value='';$('desktop-config-summary').textContent='正在检查目录与支持状态…';try{await load();}catch(e){$('desktop-settings-message').textContent=e.message;}};
 $('desktop-settings-close').onclick=()=>modal.close();$('desktop-settings-form').onsubmit=async e=>{e.preventDefault();const data={};for(const key of ['closeToTray','minimizeToTray','startAtLogin'])data[key]=e.target.elements[key].checked;try{await call('deviceSettings',data);$('desktop-settings-message').textContent='后台设置已保存。';}catch(error){$('desktop-settings-message').textContent=error.message;}};
 $('desktop-hide').onclick=async()=>{try{modal.close();await call('hideToTray');}catch(e){modal.showModal();$('desktop-settings-message').textContent=e.message;}};$('desktop-quit').onclick=()=>call('quitApp');
})();
