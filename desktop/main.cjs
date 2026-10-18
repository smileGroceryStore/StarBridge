const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, net, Tray, Menu } = require('electron');
const path = require('node:path');
let mainWindow;
// Keep the existing encrypted library and browser preferences after the product rename.
app.setPath('userData', path.join(app.getPath('appData'), 'allsetting'));
if (process.argv.includes('--profile-test')) app.setPath('userData', path.join(app.getPath('temp'), 'allsetting-profile-test-' + Date.now()));
app.setAppUserModelId('com.allsetting.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event,argv) => { if(argv.includes('--quit')){app.quit();return;}if(argv.includes('--background'))return;if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    const { loadCatalog } = await import('../src/catalog.js');
    const { scanTools } = await import('../src/scanner.js');
    const allowedLinks = new Set((await loadCatalog()).tools.map(t => t.source).filter(s => s.startsWith('https://')));
    const trusted = event => event.sender === mainWindow?.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
    const { ProfileStore } = await import('../src/profile-store.js');
    const encryptedStore = new ProfileStore(path.join(app.getPath('userData'), 'profiles.enc'), {
      encrypt: text => { if (!safeStorage.isEncryptionAvailable()) throw Error('系统加密不可用，不能保存密钥'); return safeStorage.encryptString(text); },
      decrypt: bytes => { if (!safeStorage.isEncryptionAvailable()) throw Error('系统加密不可用'); return safeStorage.decryptString(bytes); }
    }, (await loadCatalog()).tools.map(t => t.id));
    const {DeviceSettings}=await import('../src/device-settings.js');
    const deviceSettings=new DeviceSettings(path.join(app.getPath('userData'),'device-settings.json'));let background=null;
    const {ConfigEngine}=await import('../src/config-engine.js');
    const configEngine=new ConfigEngine({home:process.argv.includes('--profile-test')?path.join(app.getPath('userData'),'fixture-home'):app.getPath('home'),stateDir:path.join(app.getPath('userData'),'configuration-backups'),store:encryptedStore,crypto:{encrypt:s=>safeStorage.encryptString(s),decrypt:b=>safeStorage.decryptString(b)},env:process.argv.includes('--profile-test')?{}:process.env,getLocations:async()=>(await deviceSettings.read()).toolDirs});
    const {ResourceStore}=await import('../src/resource-store.js');const{ResourceEngine}=await import('../src/resource-engine.js');
    const resourceStore=new ResourceStore(path.join(app.getPath('userData'),'shared-resources.enc'),encryptedStore.crypto);
    const resourceEngine=new ResourceEngine({apiEngine:configEngine,store:resourceStore});
    const{ResourceImporter}=await import('../src/resource-import.js');const resourceImporter=new ResourceImporter(resourceEngine,resourceStore);let pendingSkillBundle=null;
    const{WorkspaceService}=await import('../src/workspace-service.js');const workspaceService=new WorkspaceService({engine:configEngine,resources:resourceEngine,settings:deviceSettings,version:app.getVersion()});
    const{backupInventory,cleanupInventory,releaseInfo}=await import('../src/maintenance.js');
    const versionPaths={'claude-code':path.join(app.getPath('appData'),'npm/node_modules/@anthropic-ai/claude-code/package.json'),codex:path.join(app.getPath('appData'),'npm/node_modules/@openai/codex/package.json'),pi:path.join(app.getPath('appData'),'npm/node_modules/@mariozechner/pi-coding-agent/package.json'),'deepseek-harness':path.join(process.env.LOCALAPPDATA||'','Programs/DeepSeek Harness/resources/app.asar/package.json')};
    configEngine.getVersion=async tool=>{if(process.argv.includes('--profile-test'))return 'fixture';try{const file=versionPaths[tool];if(!file)return null;const d=JSON.parse(await require('node:fs/promises').readFile(file,'utf8'));return /^\d+\.\d+/.test(d.version)?d.version:null;}catch{return null;}};
    for(const engine of [configEngine,resourceEngine]){const settled=engine.ensureSettled.bind(engine);engine.ensureSettled=async tool=>{if(await workspaceService.migrationPending())throw Error('发现未完成迁移，请先在工作台恢复检查');return settled(tool);};}
    const{sessionIndex,authOverview}=await import('../src/session-index.js');let indexedSessions=null;
    const{PricingStore,priceSessions}=await import('../src/model-pricing.js');const pricingSeed=JSON.parse(await require('node:fs/promises').readFile(path.join(__dirname,'../catalog/model-pricing.json'),'utf8'));const pricingStore=new PricingStore(path.join(app.getPath('userData'),'model-pricing.json'),pricingSeed);
    const {checkConnection}=await import('../src/connection-check.js');const {encryptPortable,decryptPortable}=await import('../src/portable.js');
    let pendingImport=null;
    const extraOps={
      'pricing-list':()=>pricingStore.read(),'pricing-save':input=>pricingStore.save(input),'pricing-delete':input=>pricingStore.remove(input.id),'pricing-preview':()=>pricingStore.prepare(process.argv.includes('--profile-test')?async()=>new Response(JSON.stringify({'fixture-provider':{models:{'fixture-import-model':{id:'fixture-import-model',name:'导入测试模型',cost:{input:1,output:2,cache_read:0.1}}}}})):net.fetch.bind(net)),'pricing-import':input=>pricingStore.import(input),
      'workspace-status':()=>workspaceService.status(),'workspace-compatibility':async input=>{const{assessCompatibility}=await import('../src/compatibility.js');const p=(await encryptedStore.read()).profiles.find(p=>p.id===input.profileId);return assessCompatibility(input.toolId,p,{models:input.models??[],defaultModel:input.defaultModel},await configEngine.getVersion(input.toolId));},'workspace-batch-preview':input=>workspaceService.previewBatch(input.ids),'workspace-batch-apply':input=>workspaceService.applyBatch(input.id),
      'workspace-export':async input=>{const selected=await dialog.showSaveDialog(mainWindow,{title:'完整工作空间加密导出',defaultPath:'Starbridge-workspace.starbridge',filters:[{name:'完整工作空间',extensions:['starbridge']}]});if(selected.canceled)return{canceled:true};await require('node:fs/promises').writeFile(selected.filePath,await encryptPortable(await workspaceService.portable(),input.password),{mode:0o600});return{exported:true};},
      'workspace-import-preview':async input=>{if(process.argv.includes('--profile-test'))return workspaceService.previewMigration(await workspaceService.portable());const selected=await dialog.showOpenDialog(mainWindow,{title:'选择完整工作空间迁移包',properties:['openFile'],filters:[{name:'完整工作空间',extensions:['starbridge']}]});if(selected.canceled)return{canceled:true};const fs=require('node:fs/promises'),file=selected.filePaths[0];if((await fs.stat(file)).size>10*1024*1024)throw Error('迁移包超过 10 MiB');return workspaceService.previewMigration(await decryptPortable(await fs.readFile(file),input.password));},
      'workspace-import-commit':input=>workspaceService.commitMigration(input.id,input.profileIds,input.resourceIds),'workspace-migration-recover':()=>workspaceService.recoverMigration(),
      'workspace-diagnostic':async()=>{const selected=await dialog.showSaveDialog(mainWindow,{title:'导出脱敏诊断报告',defaultPath:'Starbridge-diagnostic.json',filters:[{name:'脱敏诊断',extensions:['json']}]});if(selected.canceled)return{canceled:true};await require('node:fs/promises').writeFile(selected.filePath,JSON.stringify(await workspaceService.diagnostic(),null,2),{mode:0o600});return{exported:true};},
      'workspace-cleanup-preview':async()=>{const days=(await deviceSettings.read()).backupRetentionDays??30,r=await backupInventory({engine:configEngine,resources:resourceEngine,profiles:encryptedStore,days});return{days,count:r.candidates.length,bytes:r.bytes,retained:r.retained};},
      'workspace-cleanup':()=>configEngine.serial(async()=>{await encryptedStore.queue;await resourceStore.queue;return cleanupInventory(await backupInventory({engine:configEngine,resources:resourceEngine,profiles:encryptedStore,days:(await deviceSettings.read()).backupRetentionDays??30}));}),
      'workspace-update':async()=>{const response=await net.fetch('https://api.github.com/repos/smileGroceryStore/StarBridge/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'Starbridge/'+app.getVersion()},signal:AbortSignal.timeout(20000)});if(response.status===404)return{current:app.getVersion(),message:'仓库尚未发布正式版本'};if(!response.ok)throw Error('更新检查失败，HTTP '+response.status);const text=await response.text();if(text.length>1024*1024)throw Error('更新信息过大');return releaseInfo(JSON.parse(text),app.getVersion());},
      'workspace-open-release':async input=>{if(typeof input.url!=='string'||!/^https:\/\/github\.com\/smileGroceryStore\/StarBridge\/releases\/tag\/v?\d+\.\d+\.\d+$/.test(input.url))throw Error('无效版本链接');await shell.openExternal(input.url);return{opened:true};},
      'resources-list':()=>resourceStore.list(),'resources-save':async input=>{let data=input;if(input.bundleId){if(input.kind!=='skill'||!pendingSkillBundle||input.bundleId!==pendingSkillBundle.id||Date.now()-pendingSkillBundle.created>600000)throw Error('Skill 目录预览过期，请重新选择');data={...input,files:pendingSkillBundle.bundle.files,metadata:pendingSkillBundle.bundle.metadata};}const result=await resourceStore.save(data);pendingSkillBundle=null;return result;},'resources-delete':input=>resourceStore.remove(input.id),
      'resources-backups':()=>resourceStore.backups(),'resources-backup-restore':input=>resourceStore.restoreBackup(input.id,input.ids),
      'resources-existing-scan':input=>resourceImporter.scan(input.toolId),'resources-existing-commit':input=>resourceImporter.commit(input.id,input.ids),
      'resources-skill-directory':async()=>{const selected=await dialog.showOpenDialog(mainWindow,{title:'选择包含 SKILL.md 的 Skill 目录',properties:['openDirectory']});if(selected.canceled)return{canceled:true};const{readSkillDirectory}=await import('../src/skill-bundle.js');const bundle=await readSkillDirectory(selected.filePaths[0]);resourceStore.validateItems([{kind:'skill',...bundle}]);const id=require('node:crypto').randomUUID();pendingSkillBundle={id,bundle,created:Date.now()};return{id,name:bundle.name,description:bundle.description,content:bundle.content,fileNames:bundle.files.map(f=>f.path),size:bundle.files.reduce((n,f)=>n+f.size,0)};},
      'resources-preview':input=>resourceEngine.preview('asset-'+input.toolId),'resources-apply':input=>resourceEngine.apply(input.id),'resources-restore':input=>resourceEngine.restore('asset-'+input.toolId),
      'resources-status':async()=>Promise.all(resourceEngine.supportedTools.map(async id=>{try{return await resourceEngine.status(id);}catch{return{toolId:id,status:'error',message:'共享资源状态检查失败'};}})),
      'sessions-index':async()=>{indexedSessions=await sessionIndex(configEngine.home,await configEngine.getLocations());try{return priceSessions(indexedSessions,(await pricingStore.read()).items);}catch(error){return{...indexedSessions,pricingError:error.message};}},
      'session-reveal':async input=>{const item=indexedSessions?.sessions.find(s=>s.id===input.id);if(!item)throw Error('请先刷新会话索引');shell.showItemInFolder(item.path);return{shown:true};},
      'auth-overview':async()=>authOverview(configEngine.home,await encryptedStore.list(),await configEngine.getLocations()),
      'resources-export':async input=>{const selected=await dialog.showSaveDialog(mainWindow,{title:'导出加密共享资源',defaultPath:'Starbridge-resources.starbridge',filters:[{name:'星桥共享资源',extensions:['starbridge']}]});if(selected.canceled)return{canceled:true};const bytes=await encryptPortable(await resourceStore.portable(),input.password);await require('node:fs/promises').writeFile(selected.filePath,bytes,{mode:0o600});return{exported:true};},
      'resources-import':async input=>{const selected=await dialog.showOpenDialog(mainWindow,{title:'导入加密共享资源',properties:['openFile'],filters:[{name:'星桥共享资源',extensions:['starbridge']}]});if(selected.canceled)return{canceled:true};const fs=require('node:fs/promises'),file=selected.filePaths[0];if((await fs.stat(file)).size>10*1024*1024)throw Error('迁移包过大');const data=await decryptPortable(await fs.readFile(file),input.password);await resourceStore.import(data);return{imported:true};},
      'configuration-info':async()=>{const{configurationInfo}=await import('../src/configuration-info.js');return configurationInfo(await loadCatalog(),configEngine);},
      'existing-import':async input=>{if(!configEngine.supportedTools.includes(input.toolId))throw Error('此工具暂不支持导入');const {parseExisting}=await import('../src/existing-import.js');const{parseAdditionalImport}=await import('../src/additional-import.js');const {payload,skipped}=(['opencode','pi'].includes(input.toolId)?parseExisting:parseAdditionalImport)(input.toolId,await configEngine.targets(input.toolId),process.argv.includes('--profile-test')?{}:process.env);const rows=await encryptedStore.previewImport(payload);pendingImport={id:require('node:crypto').randomUUID(),createdAt:Date.now(),data:payload};return{preview:true,id:pendingImport.id,rows,skipped};},
      'device-settings':async input=>{if(input){await deviceSettings.update(input);if('theme' in input){mainWindow?.setIcon(path.join(__dirname,input.theme==='anime'?'../public/assets/starbridge.ico':'../public/assets/starbridge-frost.ico'));mainWindow?.setTitleBarOverlay({symbolColor:input.theme==='frost'?'#344a65':'#f4e5ff'});mainWindow?.setBackgroundColor(input.theme==='frost'?'#edf2f6':'#17182d');}if('startAtLogin' in input&&!process.argv.includes('--profile-test'))app.setLoginItemSettings({openAtLogin:input.startAtLogin,path:app.getPath('exe'),args:['--background']});await background?.refresh();}return{...await deviceSettings.read(),backgroundAvailable:!!background?.tray};},
      'device-config-dir':async input=>{if(!configEngine.supportedTools.includes(input.toolId))throw Error('工具不支持自定义目录');if(input.reset)return deviceSettings.update({toolDirs:{[input.toolId]:''}});const selected=await dialog.showOpenDialog(mainWindow,{title:'选择 '+input.toolId+' 配置目录',properties:['openDirectory']});if(selected.canceled)return{canceled:true};return deviceSettings.update({toolDirs:{[input.toolId]:selected.filePaths[0]}});},
      'window-background':async()=>{if(!background?.tray)throw Error('系统托盘不可用，请保持窗口打开');mainWindow.hide();return{hidden:true};},
      'app-quit':()=>{app.quit();return{quitting:true};},
      'recovery-open-folder':async()=>{await require('node:fs/promises').mkdir(configEngine.stateDir,{recursive:true});const error=await shell.openPath(configEngine.stateDir);if(error)throw Error('无法打开备份目录');return{opened:true};},
      'library-backups':()=>encryptedStore.backups(),'library-restore':input=>encryptedStore.restoreBackup(input.id,input.profileIds),'library-cleanup':()=>encryptedStore.cleanupBackups(),
      'model-delete':input=>encryptedStore.deleteModel(input.id,input.model),
      'recovery-list':async()=>[...await configEngine.pending(),...await resourceEngine.pending()],'recovery-run':input=>input.id?.startsWith('asset-')?resourceEngine.recover(input.id):configEngine.recover(input.id),
      'library-import-commit':async input=>{const plan=pendingImport;if(!plan||plan.id!==input.id||Date.now()-plan.createdAt>600000)throw Error('迁移预览已过期，请重新选择文件');if(!Array.isArray(input.choices))throw Error('迁移选择无效');const rows=await encryptedStore.previewImport(plan.data);for(const c of input.choices??[])if(c.mode==='update'&&!rows.find(r=>r.id===c.id)?.matches.some(m=>m.id===c.targetId))throw Error('迁移目标已变化，请重新预览');await encryptedStore.importPortable(plan.data,input.choices);pendingImport=null;return{imported:true,count:input.choices.filter(c=>c.mode!=='skip').length};},
      'profile-favorite':input=>encryptedStore.preference(input.id,input.favorite),
      'scheme-save':async input=>{const r=await encryptedStore.saveScheme(input.name);await background?.refresh();return r;},'scheme-activate':input=>encryptedStore.activateScheme(input.id),'scheme-delete':async input=>{const r=await encryptedStore.deleteScheme(input.id);await background?.refresh();return r;},
      'profile-delete':input=>encryptedStore.remove(input.id),
      'profile-clone':input=>encryptedStore.clone(input.id),'profile-archive':input=>encryptedStore.archive(input.id,input.archived),
      'connection-check':input=>checkConnection(encryptedStore,input,(url,options)=>net.fetch(url,options)),
      'library-export':async input=>{const selected=await dialog.showSaveDialog(mainWindow,{title:'导出加密迁移包',defaultPath:'Starbridge-library.starbridge',filters:[{name:'星桥加密迁移包',extensions:['starbridge']}]});if(selected.canceled)return{canceled:true};const bytes=await encryptPortable(await encryptedStore.portable(),input.password);await require('node:fs/promises').writeFile(selected.filePath,bytes,{mode:0o600});return{exported:true,count:(await encryptedStore.list()).profiles.length};},
      'library-import':async input=>{const selected=await dialog.showOpenDialog(mainWindow,{title:'导入加密迁移包',properties:['openFile'],filters:[{name:'星桥加密迁移包',extensions:['starbridge']}]});if(selected.canceled)return{canceled:true};const fs=require('node:fs/promises'),file=selected.filePaths[0];if((await fs.stat(file)).size>10*1024*1024)throw Error('迁移包超过大小限制');const data=await decryptPortable(await fs.readFile(file),input.password);const rows=await encryptedStore.previewImport(data);pendingImport={id:require('node:crypto').randomUUID(),createdAt:Date.now(),data};return{preview:true,id:pendingImport.id,rows};}
    };
    const operationBusy=new Set();for(const[channel,operation]of Object.entries(extraOps))ipcMain.handle(channel,async(event,input)=>{if(!trusted(event))throw Error('无效窗口');if(workspaceService.busy)return{ok:false,error:'完整迁移正在进行，请稍候'};if(operationBusy.has(channel))return{ok:false,error:'操作正在进行，请稍候'};operationBusy.add(channel);try{if(/^(?:resources-(?:save|delete|apply|restore|import|existing-commit|backup-restore)|library-(?:import-commit|restore)|profile-(?:delete|clone|archive)|workspace-batch-apply)$/.test(channel)&&await workspaceService.migrationPending())throw Error('请先处理工作台的未完成迁移');return{ok:true,data:await operation(input)};}catch(error){return{ok:false,error:channel.startsWith('library-')?(error.code?'文件操作失败，请检查权限；原数据保留':error.message):error.message};}finally{operationBusy.delete(channel);}});
    for(const [channel,operation]of Object.entries({'config-preview':input=>configEngine.preview(input.toolId),'config-apply':async input=>{const r=await configEngine.apply(input.id);try{const c=(await encryptedStore.read()).toolModels[r.toolId];await encryptedStore.markUsed((c?.connections??[{profileId:c?.profileId}]).map(x=>x.profileId));}catch{}return r;},'config-restore':input=>configEngine.restore(input.toolId),'config-status':async()=>Promise.all([...configEngine.supportedTools,'zcode'].map(async toolId=>{try{return await configEngine.status(toolId);}catch{return{toolId,status:'error',message:'状态检查失败，请检查配置文件权限'};}}))}))ipcMain.handle(channel,async(event,input)=>{if(!trusted(event))throw Error('无效窗口');try{if(workspaceService.busy)throw Error('迁移正在进行，请稍候');return{ok:true,data:await operation(input)};}catch(error){return{ok:false,error:error.message};}});
    const { parseGoModels, GO_MODELS_URL } = await import('../src/model-catalog.js');
    const refreshGoModels = async id => {
      const p = (await encryptedStore.list()).profiles.find(p=>p.id===id);
      if (!p || new URL(p.baseUrl).origin !== 'https://opencode.ai' || p.billing !== 'coding-plan') throw Error('自动发现目前仅支持 OpenCode Go；其他连接请手动添加模型');
      const response = await net.fetch(GO_MODELS_URL, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) throw Error(`官方模型目录返回 ${response.status}`);
      const body = await response.text(); if (body.length > 1024*1024) throw Error('目录响应过大');
      const {entries, skipped} = parseGoModels(JSON.parse(body));
      const data = await encryptedStore.addModels(id, entries, GO_MODELS_URL);
      return { ...data, discovery: { count: entries.length, skipped, authenticated: false } };
    };
    for (const [channel, operation] of Object.entries({ 'profiles-list': () => encryptedStore.list(), 'profiles-save': input => encryptedStore.save(input), 'profiles-toggle': input => encryptedStore.toggle(input.id, input.enabled), 'profiles-bind': input => encryptedStore.bind(input.id, input.toolIds), 'profiles-models': input => encryptedStore.addModels(input.id, input.entries), 'profiles-discover': input => refreshGoModels(input.id), 'tool-model-save': input => encryptedStore.configureTool(input), 'tool-model-clear': input => encryptedStore.clearTool(input.toolId) })) {
      ipcMain.handle(channel, async (event, input) => { if (!trusted(event)) throw Error('无效窗口'); try { if(workspaceService.busy||channel!=='profiles-list'&&await workspaceService.migrationPending())throw Error('请先处理工作台的未完成迁移');return { ok: true, data: await operation(input) }; } catch (error) { return { ok: false, error: error.message }; } });
    }
    ipcMain.handle('catalog', async event => { if (!trusted(event)) throw Error('无效窗口'); return loadCatalog(); });
    let scanning = false;
    ipcMain.handle('scan', async (event, payload = {}) => {
      if (!trusted(event)) throw Error('无效窗口');
      if (scanning) throw Error('扫描正在进行');
      const manualPaths = payload.manualPaths ?? {};
      if (!manualPaths || typeof manualPaths !== 'object' || Array.isArray(manualPaths) || Object.keys(manualPaths).length > 100 || Object.values(manualPaths).some(v => !Array.isArray(v) || v.length > 10 || v.some(p => typeof p !== 'string' || p.length > 4096))) throw Error('路径格式错误');
      scanning = true;
      try { return await scanTools((await loadCatalog()).tools, { manualPaths }); } finally { scanning = false; }
    });
    ipcMain.handle('pick-executable', async event => {
      if (!trusted(event)) throw Error('无效窗口');
      const result = await dialog.showOpenDialog(mainWindow, { title: '选择工具可执行文件', properties: ['openFile'], filters: [{ name: '可执行文件', extensions: ['exe', 'cmd', 'bat', 'com'] }] });
      return result.canceled ? null : result.filePaths[0];
    });
    ipcMain.handle('open-official', async (event, url) => { if (!trusted(event) || !allowedLinks.has(url)) throw Error('链接未收录'); await shell.openExternal(url); });
    if(process.argv.includes('--reasonix-report')||process.argv.includes('--configure-reasonix')||process.argv.includes('--repair-reasonix-go')){
      let applied;
      if(process.argv.includes('--repair-reasonix-go')){const preview=await configEngine.preview('reasonix');const result=await configEngine.apply(preview.id);applied={status:result.status,defaultModel:preview.defaultModel,profileName:preview.profileName,files:preview.files.map(f=>f.path)};}
      if(process.argv.includes('--configure-reasonix')){
        const data=await encryptedStore.read(),preset=data.toolModels.reasonix,profile=data.profiles.find(p=>p.id===(preset?.profileId??data.bindings.reasonix));
        if(!profile?.enabled)throw Error('Reasonix 尚未选择有效连接，请先在星桥选择连接');
        const{compatibleModels}=await import('../src/model-catalog.js');const allowed=compatibleModels(profile,'reasonix');const models=(preset?.models??profile.models).filter(m=>allowed.includes(m));if(!models.length)throw Error('当前连接没有 Reasonix 支持的模型');
        const storeFile=path.join(app.getPath('userData'),'profiles.enc');require('node:fs').copyFileSync(storeFile,storeFile+'.before-reasonix-adapter-'+Date.now()+'.bak');
        const defaultModel=models.includes(preset?.defaultModel)?preset.defaultModel:models[0];
        await encryptedStore.configureTool({toolId:'reasonix',profileId:profile.id,models,defaultModel});
        const preview=await configEngine.preview('reasonix');const result=await configEngine.apply(preview.id);await encryptedStore.markUsed([profile.id]);
        applied={status:result.status,defaultModel,profileName:profile.name,models:models.length,skipped:profile.models.filter(m=>!allowed.includes(m)),files:preview.files.map(f=>f.path)};
      }
      const data=await encryptedStore.list();const report={applied,binding:data.bindings.reasonix,preset:data.toolModels.reasonix,profiles:data.profiles.map(p=>({id:p.id,name:p.name,vendor:p.vendor,enabled:p.enabled,modelCount:p.models.length})),targets:(await configEngine.targets('reasonix')).map(f=>({path:f.file,exists:f.exists}))};require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-reasonix-report.json'),JSON.stringify(report,null,2));app.quit();return;
    }
    const frostTheme=(await deviceSettings.read()).theme==='frost';
    mainWindow = new BrowserWindow({ width: 1380, height: 920, minWidth: 960, minHeight: 700, title: '星桥 Starbridge', icon: path.join(__dirname, frostTheme?'../public/assets/starbridge-frost.ico':'../public/assets/starbridge.ico'), titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: frostTheme?'#344a65':'#f4e5ff', height: 40 }, backgroundColor: frostTheme?'#edf2f6':'#17182d', show: false, autoHideMenuBar: true, webPreferences: { backgroundThrottling: !process.argv.includes('--profile-test'), preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    mainWindow.removeMenu();
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', event => event.preventDefault());
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    if(!process.argv.includes('--profile-test')||process.argv.includes('--background-test')){
      background=require('./background.cjs')({app,Menu,Tray,window:mainWindow,notify:!process.argv.includes('--profile-test'),settings:deviceSettings,showPage:page=>mainWindow.webContents.executeJavaScript(page==='agents'?"document.getElementById('agent-model-nav').click()":"document.getElementById('desktop-settings-button').click()"),getExtraMenu:async()=>{const schemes=(await encryptedStore.list()).schemes;return schemes.length?[{label:'切换模型预设方案（不写入工具）',submenu:schemes.map(s=>({label:s.name,click:async()=>{try{await encryptedStore.activateScheme(s.id);background.show();await mainWindow.webContents.executeJavaScript("window.starbridgeProfiles.action('profiles').then(()=>document.getElementById('agent-model-nav').click())");}catch(error){dialog.showErrorBox('方案切换失败',error.message);}}}))}]:[];},drain:async()=>{await configEngine.queue;await encryptedStore.queue;await resourceStore.queue;await deviceSettings.queue;await pricingStore.queue;},onError:()=>dialog.showErrorBox('星桥','后台设置或退出操作失败，请稍后重试')});
      try{await background.refresh();}catch{background?.disable();background=null;}
    }
    mainWindow.once('ready-to-show', () => {if(!background||!process.argv.includes('--background'))mainWindow.show();});
    if(process.argv.includes('--profile-test')){const fs=require('node:fs/promises'),file=path.join(configEngine.home,'.pi/agent/settings.json'),text='{}\n';await configEngine.write(file,text);await configEngine.saveRecord('pi-11111111-1111-4111-8111-111111111111.enc',{toolId:'pi',phase:'prepared',createdAt:new Date().toISOString(),files:[{file,exists:false,text:'{}\n',beforeHash:null,afterHash:require('node:crypto').createHash('sha256').update(text).digest('hex')}]});}
    await mainWindow.loadFile(path.join(__dirname, '../public/index.html'));
    if (process.argv.includes('--expand-go-models')) {
      const storeFile=path.join(app.getPath('userData'),'profiles.enc');require('node:fs').copyFileSync(storeFile,`${storeFile}.before-model-expansion-${Date.now()}.bak`);
      const profiles = (await encryptedStore.list()).profiles.filter(p=>p.vendor==='OpenCode'&&p.billing==='coding-plan'&&new URL(p.baseUrl).origin==='https://opencode.ai');
      const reports=[];for(const p of profiles){const r=await refreshGoModels(p.id);reports.push({name:p.name,...r.discovery});}
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-model-expansion.json'),JSON.stringify(reports));app.quit();return;
    }
    if (process.argv.includes('--profile-test')) {
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{const b=document.querySelector('.recovery-banner');if(b&&!b.hidden)resolve();else if(Date.now()>end)reject(Error('Startup recovery banner missing'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.querySelector('.recovery-banner button').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('#recovery-items button'))resolve();else if(Date.now()>end)reject(Error('Recovery item missing'));else setTimeout(check,100)};check()})`);
      await new Promise(resolve=>setTimeout(resolve,250));
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v08-recovery.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`document.querySelector('#recovery-items button').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('recovery-message').textContent.includes('已恢复到'))resolve();else if(Date.now()>end)reject(Error('Startup recovery failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('recovery-close').click()`);
      await mainWindow.webContents.executeJavaScript(`(async()=>{await window.profileWorkspaceReady;document.getElementById('profiles-nav').click();document.querySelector('.profiles-pane .intro .primary').click();const f=document.getElementById('profile-form');for(const [k,v] of Object.entries({name:'测试套餐 · 演示数据',vendor:'Example',baseUrl:'https://example.com/v1',key:'fake-test-key',models:'example-model',notes:'仅用于验证，不是真实凭据'}))f.elements[k].value=v;f.requestSubmit();})()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('.provider-card'))resolve();else if(Date.now()>end)reject(Error('Profile save failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.querySelector('.provider-card .provider-bottom button:last-child').click()`);
      await mainWindow.webContents.executeJavaScript(`document.querySelector('#binding-tools input[value="opencode"]').checked=true;document.getElementById('binding-save').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('.provider-card').textContent.includes('1 个工具预设'))resolve();else if(Date.now()>end)reject(Error('Binding save failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
      // Exercise model-library form and two independently selected Agent defaults.
      await mainWindow.webContents.executeJavaScript(`document.querySelector('.provider-bottom button:first-child').click();const f=document.getElementById('manual-model-form');f.elements.modelId.value='example-fast';f.requestSubmit();`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(window.starbridgeProfiles.getState().profiles[0].models.includes('example-fast'))resolve();else if(Date.now()>end)reject(Error('Model library save failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`{([...document.querySelectorAll('.model-library-row')].find(r=>r.querySelector('code').textContent==='example-fast')).querySelector('button').click();const f=document.getElementById('manual-model-form');if(!f.elements.modelId.readOnly)throw Error('Model ID should remain stable');document.getElementById('model-inherit').checked=false;document.getElementById('model-inherit').dispatchEvent(new Event('change'));f.elements.baseUrl.value='https://example.com/v2';f.requestSubmit();}`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(window.starbridgeProfiles.getState().profiles[0].modelDetails?.['example-fast']?.baseUrl==='https://example.com/v2')resolve();else if(Date.now()>end)reject(Error('Model edit failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('model-manager-close').click();document.getElementById('agent-model-nav').click();`);
      for (const [toolName,toolId,defaultModel] of [['OpenCode','opencode','example-model'],['Pi','pi','example-fast'],['Reasonix Studio','reasonix','example-model']]) {
        await mainWindow.webContents.executeJavaScript(`([...document.querySelectorAll('.agent-model-row')].find(r=>r.querySelector('strong').textContent===${JSON.stringify(toolName)})).querySelector('button').click();document.getElementById('agent-default-model').value=${JSON.stringify(defaultModel)};document.getElementById('agent-config-form').requestSubmit();`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(window.starbridgeProfiles.getState().toolModels?.[${JSON.stringify(toolId)}]?.defaultModel===${JSON.stringify(defaultModel)})resolve();else if(Date.now()>end)reject(Error('Agent default save failed'));else setTimeout(check,100)};check()})`);
      }
      await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
      await new Promise(resolve => setTimeout(resolve, 350));
      // All configuration writes in this mode are restricted to fixture-home.
      const applicationChecks=[];
      for(const toolId of ['opencode','pi','reasonix']) {
        await mainWindow.webContents.executeJavaScript(`([...document.querySelectorAll('.agent-model-row')].find(r=>r.dataset.toolId==='${toolId}')).querySelector('[data-application="preview"]').click()`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('application-confirm').disabled)resolve();else if(Date.now()>end)reject(Error('Preview failed'));else setTimeout(check,100)};check()})`);
        if(toolId==='opencode')require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v07-preview.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
        await mainWindow.webContents.executeJavaScript(`document.getElementById('application-confirm').click()`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('application-result').textContent.includes('文件已写入'))resolve();else if(Date.now()>end)reject(Error('Apply failed'));else setTimeout(check,100)};check()})`);
        applicationChecks.push({toolId,applied:(await configEngine.status(toolId)).status});
        const originalBackup=(await configEngine.record(toolId)).backupName;
        await mainWindow.webContents.executeJavaScript(`document.getElementById('application-close').click();([...document.querySelectorAll('.agent-model-row')].find(r=>r.dataset.toolId==='${toolId}')).querySelector('[data-application="preview"]').click()`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('application-confirm').disabled)resolve();else if(Date.now()>end)reject(Error('Repeat preview failed'));else setTimeout(check,100)};check()})`);
        await mainWindow.webContents.executeJavaScript(`document.getElementById('application-confirm').click()`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('application-result').textContent.includes('配置未变化'))resolve();else if(Date.now()>end)reject(Error('Repeat apply failed'));else setTimeout(check,100)};check()})`);
        if((await configEngine.record(toolId)).backupName!==originalBackup)throw Error('Repeated apply replaced original backup');
        applicationChecks[applicationChecks.length-1].unchangedBackupPreserved=true;
        await mainWindow.webContents.executeJavaScript(`document.getElementById('application-close').click();([...document.querySelectorAll('.agent-model-row')].find(r=>r.dataset.toolId==='${toolId}')).querySelector('[data-application="restore"]').click();document.getElementById('application-confirm').click()`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('application-result').textContent.includes('已恢复'))resolve();else if(Date.now()>end)reject(Error('Restore failed'));else setTimeout(check,100)};check()})`);
        applicationChecks[applicationChecks.length-1].restored=(await configEngine.status(toolId)).status;
        await mainWindow.webContents.executeJavaScript(`document.getElementById('application-close').click()`);
      }
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v07-applications.json'),JSON.stringify(applicationChecks));
      const shot = await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true}); require('node:fs').writeFileSync(path.join(app.getPath('temp'), 'allsetting-v02.png'), shot.toPNG());
      const layouts = [];
      for (const width of [1440, 1024]) {
        mainWindow.setContentSize(width, 860);
        await new Promise(resolve => setTimeout(resolve, 200));
        layouts.push(await mainWindow.webContents.executeJavaScript(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,nav:document.querySelector('.nav.active').getAttribute('aria-current')})`));
        require('node:fs').writeFileSync(path.join(app.getPath('temp'), `allsetting-v03-${width}.png`), (await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      }
      mainWindow.webContents.setZoomFactor(1.25);
      layouts.push(await mainWindow.webContents.executeJavaScript(`({zoom:1.25,overflow:document.documentElement.scrollWidth>innerWidth})`));
      mainWindow.webContents.setZoomFactor(1);
      if (layouts.some(l => l.overflow)) throw Error('Horizontal overflow in desktop UI');
      require('node:fs').writeFileSync(path.join(app.getPath('temp'), 'allsetting-v03-layouts.json'), JSON.stringify(layouts));
      await mainWindow.webContents.executeJavaScript(`document.getElementById('profiles-nav').click();document.querySelector('.profile-more summary').click();document.querySelector('.profile-more button:first-of-type').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelectorAll('.provider-card').length===2)resolve();else if(Date.now()>end)reject(Error('Clone failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.provider-card')[1].querySelector('.profile-more summary').click();document.querySelectorAll('.provider-card')[1].querySelector('.danger-button').click();document.getElementById('delete-confirm').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelectorAll('.provider-card').length===1&&!document.querySelector('dialog[open]'))resolve();else if(Date.now()>end)reject(Error('Delete copy failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('backup-center-button').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('#backup-items button:not(:disabled)'))resolve();else if(Date.now()>end)reject(Error('Deleted profile backup missing'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.querySelector('#backup-items button:not(:disabled)').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(window.starbridgeProfiles.getState().profiles.length===2)resolve();else if(Date.now()>end)reject(Error('Deleted profile restore failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('recovery-close').click()`);
      const migrationPayload=await encryptedStore.portable();pendingImport={id:'fixture-import',createdAt:Date.now(),data:migrationPayload};const migrationRows=await encryptedStore.previewImport(migrationPayload);
      await mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('import-preview',{detail:${JSON.stringify({preview:true,id:'fixture-import',rows:migrationRows})}}));document.getElementById('import-preview-confirm').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('import-preview-message').textContent.includes('已处理 0'))resolve();else if(Date.now()>end)reject(Error('Duplicate import skip failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('import-preview-close').click()`);
      const pair=(await encryptedStore.list()).profiles;await encryptedStore.toggle(pair[1].id,true);
      await mainWindow.webContents.executeJavaScript(`window.starbridgeProfiles.action('profiles')`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('agent-model-nav').click();([...document.querySelectorAll('.agent-model-row')].find(r=>r.dataset.toolId==='opencode')).querySelector('button').click();document.querySelector('#agent-extra-connections input').checked=true;document.getElementById('agent-config-form').requestSubmit()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(window.starbridgeProfiles.getState().toolModels.opencode.connections?.length===2)resolve();else if(Date.now()>end)reject(Error('Multi-provider UI save failed'));else setTimeout(check,100)};check()})`);
      const coexist=await configEngine.preview('opencode');await configEngine.apply(coexist.id);
      const imported=await extraOps['existing-import']({toolId:'opencode'});if(imported.rows.length<2)throw Error('Existing providers import failed');
      await mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('import-preview',{detail:${JSON.stringify(imported)}}));document.querySelectorAll('#import-preview-rows select').forEach(s=>s.value='skip');document.getElementById('import-preview-confirm').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('import-preview-message').textContent.includes('已处理 0'))resolve();else if(Date.now()>end)reject(Error('Existing provider import preview failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('import-preview-close').click()`);await configEngine.restore('opencode');
      await mainWindow.webContents.executeJavaScript(`document.getElementById('schemes-button').click();document.getElementById('scheme-name').value='测试方案';document.getElementById('scheme-form').requestSubmit()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(window.starbridgeProfiles.getState().schemes.length===1)resolve();else if(Date.now()>end)reject(Error('Scheme UI failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('scheme-close').click();document.getElementById('desktop-settings-button').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelectorAll('#desktop-config-paths [data-config-tool]').length===6&&document.querySelector('#desktop-pending-list [data-config-tool="qoder"]'))resolve();else if(Date.now()>end)reject(Error('Complete configuration support list missing'));else setTimeout(check,100)};check()})`);
      await new Promise(resolve=>setTimeout(resolve,250));require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v09-settings.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`{const s=document.getElementById('desktop-config-search');s.value='qoder';s.dispatchEvent(new Event('input'));if(document.querySelectorAll('#desktop-pending-list [data-config-tool]').length!==1||!document.getElementById('desktop-pending-tools').open)throw Error('Pending tool search failed');if(document.querySelectorAll('#desktop-config-paths button').length)throw Error('Unsupported tool offered write controls');if(document.querySelector('.desktop-settings-dialog').scrollWidth>document.querySelector('.desktop-settings-dialog').clientWidth)throw Error('Settings horizontal overflow');}`);
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v0103-harness-settings.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`document.getElementById('desktop-settings-close').click()`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('user-guide-button').click();if(!document.querySelector('.user-guide').open)throw Error('User guide failed to open');if(document.querySelector('.user-guide').scrollWidth>document.querySelector('.user-guide').clientWidth)throw Error('User guide overflow');`);
      await new Promise(resolve=>setTimeout(resolve,200));require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v091-guide.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`document.getElementById('guide-open-agents').click();if(document.querySelector('.agent-pane').hidden)throw Error('Guide navigation failed');document.getElementById('agent-guide-button').click();document.getElementById('user-guide-close').click();`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('extension-center-nav').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('#extension-content h2')?.textContent==='同步到工具')resolve();else if(Date.now()>end)reject(Error('Extension center failed'));else setTimeout(check,100)};check()})`);
      for(const kind of ['mcp','skill','prompt']){
        await mainWindow.webContents.executeJavaScript(`window.starbridgeExtensions.switchTab('${kind}')`);
        await new Promise(r=>setTimeout(r,200));
        await mainWindow.webContents.executeJavaScript(`document.getElementById('extension-add').click();{const f=document.getElementById('resource-form');f.elements.name.value='Fixture ${kind}';f.elements.content.value=${JSON.stringify(kind==='mcp'?'{"type":"local","command":["fixture-never-executed"],"env":{"FIXTURE_KEY":"fixture-resource-secret"}}':'Shared fixture instructions.')};document.querySelectorAll('#resource-tools input').forEach(i=>i.checked=true);f.requestSubmit();}`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('resource-form').closest('dialog').open&&[...document.querySelectorAll('#extension-content h2')].some(n=>n.textContent==='Fixture ${kind}'))resolve();else if(Date.now()>end)reject(Error('Shared ${kind} save failed'));else setTimeout(check,100)};check()})`);
      }
      const assetPreview=await resourceEngine.preview('asset-opencode');if(JSON.stringify(assetPreview).includes('fixture-resource-secret'))throw Error('Resource preview leaked secret');await resourceEngine.apply(assetPreview.id);await resourceEngine.restore('asset-opencode');
      await mainWindow.webContents.executeJavaScript(`window.starbridgeExtensions.switchTab('mcp')`);await new Promise(r=>setTimeout(r,250));
      await mainWindow.webContents.executeJavaScript(`([...document.querySelectorAll('#extension-content .extension-card')].find(n=>n.querySelector('h3')?.textContent==='Claude Code')).querySelector('button').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('resource-apply-confirm').disabled)resolve();else if(Date.now()>end)reject(Error('Resource UI preview failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('resource-apply-confirm').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('resource-apply-message').textContent.includes('文件已写入'))resolve();else if(Date.now()>end)reject(Error('Resource UI apply failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('resource-apply-close').click()`);await resourceEngine.restore('asset-claude-code');
      const fixtureSession=path.join(configEngine.home,'.pi/agent/sessions/fixture/one.jsonl');await require('node:fs/promises').mkdir(path.dirname(fixtureSession),{recursive:true});await require('node:fs/promises').writeFile(fixtureSession,JSON.stringify({type:'message',message:{role:'assistant',model:'fixture-model',usage:{input:10,output:2,cost:{total:0.01}}}}));
      for(const tab of ['sessions','usage','auth']){
        await mainWindow.webContents.executeJavaScript(`window.starbridgeExtensions.switchTab('${tab}')`);
        await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('extension-message').textContent&&document.getElementById('extension-content').children.length)resolve();else if(Date.now()>end)reject(Error('Extension ${tab} failed'));else setTimeout(check,100)};check()})`);
      }
      await mainWindow.webContents.executeJavaScript(`window.starbridgeExtensions.switchTab('mcp')`);await new Promise(r=>setTimeout(r,200));require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v011-extensions.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      // Exercise the recovery and native-import UI against the isolated fixture home.
      const removedResource=(await resourceStore.read()).items.find(i=>i.kind==='prompt');await resourceStore.remove(removedResource.id);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('extension-backups').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('#resource-library-rows input:checked:not(:disabled)'))resolve();else if(Date.now()>end)reject(Error('Resource recovery list missing'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('resource-library-confirm').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('resource-library-close').closest('dialog').open)resolve();else if(Date.now()>end)reject(Error('Resource recovery UI failed'));else setTimeout(check,100)};check()})`);
      const recoveredResource=(await resourceStore.read()).items.find(i=>i.id===removedResource.id);if(!recoveredResource||recoveredResource.enabled||recoveredResource.tools.length)throw Error('Unsafe resource recovery defaults');
      const nativeGeminiFile=path.join(configEngine.home,'.gemini/settings.json');await configEngine.write(nativeGeminiFile,JSON.stringify({mcpServers:{nativeFixture:{command:'native-fixture-never-executed',env:{API_KEY:'private-native-import-fixture'}}}}));
      await mainWindow.webContents.executeJavaScript(`document.getElementById('extension-existing').click();([...document.querySelectorAll('#resource-library-sources button')].find(b=>b.textContent==='Gemini CLI')).click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('#resource-library-rows input:checked')&&!document.getElementById('resource-library-confirm').disabled)resolve();else if(Date.now()>end)reject(Error('Native resource scan UI failed'));else setTimeout(check,100)};check()})`);
      if(await mainWindow.webContents.executeJavaScript(`document.getElementById('resource-library-rows').textContent.includes('private-native-import-fixture')`))throw Error('Native import preview leaked credential');
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v012-import.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`document.getElementById('resource-library-confirm').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('resource-library-close').closest('dialog').open)resolve();else if(Date.now()>end)reject(Error('Native import commit UI failed'));else setTimeout(check,100)};check()})`);
      if(!(await resourceStore.read()).items.some(i=>i.name==='nativeFixture'&&!i.enabled&&!i.tools.length))throw Error('Native import defaults incorrect');
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-extension-test.json'),JSON.stringify({sharedResources:(await resourceStore.list()).items.length,sessions:(await sessionIndex(configEngine.home)).sessions.length,application:'applied-and-restored',centers:6,resourceRecovery:true,nativeImport:true}));
      await mainWindow.webContents.executeJavaScript(`document.getElementById('workspace-nav').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('#workspace-rows input[value="api:pi"]'))resolve();else if(Date.now()>end)reject(Error('Workspace status UI failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`{const box=document.querySelector('#workspace-rows input[value="api:pi"]');box.checked=true;box.dispatchEvent(new Event('change'));document.getElementById('workspace-preview').click();}`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('workspace-batch-confirm').disabled)resolve();else if(Date.now()>end)reject(Error('Batch preview UI failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.getElementById('workspace-batch-confirm').click()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.getElementById('workspace-batch-message').textContent.includes('成功 1'))resolve();else if(Date.now()>end)reject(Error('Batch apply UI failed'));else setTimeout(check,100)};check()})`);
      if(await mainWindow.webContents.executeJavaScript(`document.getElementById('workspace-batch-message').dataset.state`)!=='success')throw Error('Successful batch result has incorrect severity');
      await new Promise(r=>setTimeout(r,150));require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-batch-success.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`document.getElementById('workspace-batch-close').click();document.getElementById('workspace-import').click();{const f=document.getElementById('workspace-transfer-form');f.elements.password.value='fixture-password-123';f.requestSubmit();}`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelectorAll('#workspace-transfer-items input').length)resolve();else if(Date.now()>end)reject(Error('Workspace migration preview UI failed'));else setTimeout(check,100)};check()})`);
      await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('#workspace-transfer-items input').forEach((b,i)=>b.checked=i===0);document.getElementById('workspace-transfer-form').requestSubmit()`);
      await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!document.getElementById('workspace-transfer-form').closest('dialog').open)resolve();else if(Date.now()>end)reject(Error('Workspace migration commit UI failed'));else setTimeout(check,100)};check()})`);
      if(await workspaceService.migrationPending())throw Error('Completed migration still pending');await new Promise(r=>setTimeout(r,300));await mainWindow.webContents.executeJavaScript(`window.starbridgeWorkspace.refresh()`);
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-workspace-test.json'),JSON.stringify({status:true,batchApply:true,migrationPreview:true,migrationSelection:true}));
      await new Promise(r=>setTimeout(r,200));require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-v013-workspace.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await require('./pricing-smoke.cjs')({window:mainWindow,store:pricingStore,home:configEngine.home,temp:app.getPath('temp')});
      await mainWindow.webContents.executeJavaScript(`(async()=>{await window.starbridgeTheme.ready;if(document.documentElement.dataset.theme!=='frost')throw Error('Fresh installation must default to frost');async function clickTheme(selector,expected){document.querySelector(selector).click();await new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(document.documentElement.dataset.theme===expected&&!document.querySelector(selector).disabled)resolve();else if(Date.now()>end)reject(Error('Icon theme toggle failed'));else setTimeout(check,30)};check()});if((await window.allsetting.deviceSettings()).data.theme!==expected)throw Error('Icon toggle not persisted');if([...document.querySelectorAll('[data-theme-icon]')].some(img=>!img.src.endsWith(expected==='frost'?'starbridge-frost.svg':'starbridge.svg')))throw Error('Theme icons out of sync');}await clickTheme('.brand [data-theme-toggle]','anime');await clickTheme('.window-titlebar [data-theme-toggle]','frost');})()`);
      await mainWindow.webContents.executeJavaScript(`(async()=>{await window.starbridgeTheme.ready;document.getElementById('desktop-settings-button').click();await new Promise(r=>setTimeout(r,300));const radio=document.querySelector('input[name="theme"][value="frost"]');radio.click();await new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{if(document.documentElement.dataset.theme==='frost'&&!radio.disabled)resolve();else if(Date.now()>end)reject(Error('Theme switch failed'));else setTimeout(check,50)};check()});if((await window.allsetting.deviceSettings()).data.theme!=='frost')throw Error('Theme not persisted');document.getElementById('desktop-settings-close').click();})()`);
      await new Promise(r=>setTimeout(r,200));require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-frost-workspace.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`document.getElementById('desktop-settings-button').click()`);await new Promise(r=>setTimeout(r,300));require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-frost-settings.png'),(await mainWindow.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
      await mainWindow.webContents.executeJavaScript(`document.getElementById('desktop-settings-close').click()`);
      mainWindow.setSize(960,700);
      const dialogChecks=await mainWindow.webContents.executeJavaScript(`(async()=>{
        const results=[];
        for(const dialog of document.querySelectorAll('dialog')){
          if(!dialog.classList.contains('dialog-shell'))throw Error('Dialog layout missing');
          const body=dialog.querySelector('.dialog-scroll'),close=dialog.querySelector('.dialog-top button');
          const filler=document.createElement('div');for(let i=0;i<60;i++){const p=document.createElement('p');p.textContent='滚动验证 '+i;filler.append(p);}const focusTarget=document.createElement('button');focusTarget.type='button';focusTarget.textContent='键盘聚焦验证';filler.append(focusTarget);body.append(filler);
          dialog.showModal();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          body.scrollTop=body.scrollHeight;await new Promise(r=>requestAnimationFrame(r));
          const d=dialog.getBoundingClientRect(),c=close.getBoundingClientRect();
          if(body.scrollTop<1||dialog.scrollTop!==0)throw Error('Dialog content is not scrolling independently');
          if(c.top<d.top||c.bottom>d.bottom||!close.contains(document.elementFromPoint(c.x+c.width/2,c.y+c.height/2)))throw Error('Close button is not reachable after scrolling: '+(dialog.getAttribute('aria-label')??dialog.id));
          const footer=dialog.querySelector('.dialog-footer');if(footer){const f=footer.getBoundingClientRect();if(f.top<d.top||f.bottom>d.bottom)throw Error('Dialog actions are offscreen');}
          focusTarget.focus();const focused=focusTarget.getBoundingClientRect(),scrollArea=body.getBoundingClientRect();if(focused.top<scrollArea.top||focused.bottom>scrollArea.bottom)throw Error('Focused content obscured by dialog controls');
          results.push({dialog:dialog.getAttribute('aria-label')??dialog.id,closeVisible:true,footerVisible:!!footer,focusVisible:true});
          close.click();if(dialog.open)throw Error('Close control did not close dialog');filler.remove();
        }
        return results;
      })()`);
      require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-dialog-layout-test.json'),JSON.stringify(dialogChecks));
      const result = await encryptedStore.list(); require('node:fs').writeFileSync(path.join(app.getPath('temp'), 'allsetting-profile-test.json'), JSON.stringify({ profiles: result.profiles.length, masked: result.profiles[0].key === undefined, bindings: Object.keys(result.bindings).length, userData: app.getPath('userData') }));
      if(process.argv.includes('--background-test')){if(!background?.tray)throw Error('System tray missing');mainWindow.close();if(mainWindow.isDestroyed()||mainWindow.isVisible())throw Error('Close-to-tray failed');background.show();if(!mainWindow.isVisible())throw Error('Tray reopen failed');require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-background-test.json'),JSON.stringify({tray:true,closeHides:true,reopen:true}));}
      app.quit();
    }
    if (process.argv.includes('--smoke-test')) {
      const data = await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelectorAll('.tool-row').length===31)resolve({title:document.title,tools:31,desktop:!!window.allsetting});else if(Date.now()>end)reject(Error('UI did not load'));else setTimeout(check,100)};check()})`);
      const scanResult = await mainWindow.webContents.executeJavaScript(`window.allsetting.scan({}).then(r=>({total:r.tools.length,found:r.tools.filter(t=>t.status==='candidate'||t.status==='detected').length}))`);
      data.scan = scanResult;
      require('node:fs').writeFileSync(path.join(app.getPath('temp'), 'allsetting-desktop-smoke.json'), JSON.stringify(data));
      app.quit();
    }
  }).catch(error => { if(process.argv.includes('--profile-test')){require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-profile-failure.txt'),error.stack??error.message);app.exit(1);return;}if(process.argv.includes('--configure-reasonix')||process.argv.includes('--reasonix-report')||process.argv.includes('--repair-reasonix-go')){require('node:fs').writeFileSync(path.join(app.getPath('temp'),'starbridge-reasonix-report.json'),JSON.stringify({error:error.message}));app.exit(1);return;}dialog.showErrorBox('AllSetting 启动失败', error.message); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
}
