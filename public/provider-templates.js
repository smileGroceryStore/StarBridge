(() => {
 const templates=[
  {name:'OpenCode Go · Coding Plan',vendor:'OpenCode',baseUrl:'https://opencode.ai/inference/go/openai/v1',protocol:'openai-chat',billing:'coding-plan',models:'deepseek-v4.1-flash',source:'https://opencode.ai/docs/go/'},
  {name:'DeepSeek · 官方 API',vendor:'DeepSeek',baseUrl:'https://api.deepseek.com',protocol:'openai-chat',billing:'api',models:'',source:'https://api-docs.deepseek.com/'},
  {name:'OpenAI · 官方 API（Responses）',vendor:'OpenAI',baseUrl:'https://api.openai.com/v1',protocol:'openai-responses',billing:'api',models:'',source:'https://developers.openai.com/api/reference/responses/overview'},
  {name:'Anthropic · 官方 API',vendor:'Anthropic',baseUrl:'https://api.anthropic.com',protocol:'anthropic',billing:'api',models:'',source:'https://platform.claude.com/docs/en/api/overview'},
  {name:'本地 OpenAI 兼容服务',vendor:'Local',baseUrl:'http://127.0.0.1:11434/v1',protocol:'openai-chat',billing:'local',models:'',source:'端口和模型需按本机服务调整'}
 ];
 const form=document.getElementById('profile-form'),section=document.createElement('section');section.className='template-picker';const label=document.createElement('label');label.textContent='供应商 / 套餐模板';const select=document.createElement('select');select.setAttribute('aria-label','供应商套餐模板');const empty=document.createElement('option');empty.value='';empty.textContent='选择模板（不会自动保存）';select.append(empty);templates.forEach((t,i)=>{const o=document.createElement('option');o.value=i;o.textContent=t.name;select.append(o);});const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='填入模板';const note=document.createElement('p');note.className='muted';note.textContent='模板只填写默认端点和协议，不代表账号拥有模型权限。核验于 2026-10-17；模型 ID 需按账号填写。';label.append(select);section.append(label,button,note);form.querySelector('.form-grid').before(section);button.onclick=()=>{if(select.value==='')return;const t=templates[Number(select.value)];for(const key of ['name','vendor','baseUrl','protocol','billing','models'])form.elements[key].value=t[key];form.modelEditor?.fromLegacy();form.elements.notes.value='模板核验：2026-10-17；来源：'+t.source;};
 const imp=document.createElement('button');imp.id='existing-import-open';imp.type='button';imp.className='text-button';imp.textContent='从工具导入';document.querySelector('.library-actions').append(imp);
 const dialog=document.createElement('dialog');dialog.className='profile-dialog';dialog.setAttribute('aria-labelledby','existing-import-title');
 dialog.innerHTML=`<form id="existing-import-form"><div class="dialog-top"><span class="eyebrow">IMPORT FROM TOOL</span><button type="button" id="existing-import-close" aria-label="关闭工具导入">×</button></div><h2 id="existing-import-title">从工具导入连接</h2><p class="muted">选择要读取配置的来源工具。扫描后可预览并勾选导入到星桥的连接。</p><label class="connection-field" for="existing-import-source">来源工具<select id="existing-import-source" required></select></label><p class="muted">此操作读取已有配置，不会切换当前模型或修改来源工具。OAuth 登录和无法识别的动态凭据不会导入。</p><p id="existing-import-message" class="form-error" role="status" aria-live="polite"></p><div class="form-actions"><button type="button" id="existing-import-cancel">取消</button><button type="submit" id="existing-import-scan" class="primary">扫描并预览</button></div></form>`;
 document.body.append(dialog);
 const tool=document.getElementById('existing-import-source'),status=document.getElementById('existing-import-message'),scan=document.getElementById('existing-import-scan');
 for(const[name,id]of [['OpenCode','opencode'],['Pi','pi'],['Reasonix Studio','reasonix'],['Claude Code','claude-code'],['Codex','codex'],['Harness（原生 Go）','deepseek-harness']]){const option=document.createElement('option');option.value=id;option.textContent=name;tool.append(option);}
 let generation=0;
 imp.onclick=()=>{generation++;tool.disabled=false;scan.disabled=false;scan.textContent='扫描并预览';status.textContent='';delete status.dataset.state;dialog.showModal();tool.focus();};
 document.getElementById('existing-import-close').onclick=document.getElementById('existing-import-cancel').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(dialog.open)return;generation++;tool.disabled=false;scan.disabled=false;scan.textContent='扫描并预览';});
 tool.onchange=()=>{status.textContent='';delete status.dataset.state;};
 document.getElementById('existing-import-form').onsubmit=async event=>{
  event.preventDefault();if(scan.disabled)return;const request=++generation,sourceName=tool.selectedOptions[0].textContent;
  scan.disabled=true;tool.disabled=true;scan.textContent='正在扫描…';status.dataset.state='info';status.textContent=`正在读取 ${sourceName} 的已有配置…`;
  try{const r=await window.allsetting.importExisting({toolId:tool.value});if(request!==generation||!dialog.open)return;if(!r.ok)throw Error(r.error);if(!r.data.rows.length){status.dataset.state='warning';status.textContent=`未找到可导入的连接。${r.data.skipped.length?`${r.data.skipped.length} 项引用或协议未识别，已跳过。`:'请先在来源工具中配置 API 连接，或在应用设置中检查配置目录。'}`;return;}dialog.close();window.dispatchEvent(new CustomEvent('import-preview',{detail:r.data}));}
  catch(error){if(request===generation&&dialog.open){status.dataset.state='error';status.textContent=error.message;}}
  finally{if(request===generation){scan.disabled=false;tool.disabled=false;scan.textContent='扫描并预览';}}
 };
})();
