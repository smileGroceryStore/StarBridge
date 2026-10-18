const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({window, store, temp}) => {
  await store.mutate(data => { data.toolModels.zcode = structuredClone(data.toolModels.pi); data.bindings.zcode=data.toolModels.pi.profileId; });
  await window.webContents.executeJavaScript(`(async()=>{
    await window.starbridgeProfiles.action('profiles');
    document.getElementById('agent-model-nav').click();
    await window.starbridgeRefreshStatus();
    await new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('[data-tool-id="zcode"]')?.dataset.syncState==='unsupported')resolve();else if(Date.now()>end)reject(Error('ZCode status did not load'));else setTimeout(check,50);};check();});
    const row=document.querySelector('[data-tool-id="zcode"]');
    if(row.dataset.syncState!=='unsupported'||!row.querySelector('.sync-badge').textContent.includes('不支持同步'))throw Error('ZCode unsupported badge missing');
    row.querySelector('button').click();
    const warning=document.getElementById('agent-sync-warning');
    if(warning.hidden||!warning.textContent.includes('不会写入工具'))throw Error('ZCode write warning missing');
    if(!document.getElementById('agent-config-save').textContent.includes('不写入工具'))throw Error('ZCode save button misleading');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  })()`);
  fs.writeFileSync(path.join(temp, 'starbridge-zcode-warning.png'), (await window.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.getElementById('agent-config-close').click();document.getElementById('workspace-nav').click()`);
  await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{
    const card=document.querySelector('#workspace-rows input[value="api:zcode"]')?.closest('article');
    if(card){if(card.dataset.syncState!=='unsupported'||!card.querySelector('[data-sync-id]').disabled)return reject(Error('Unsupported workspace row is actionable'));resolve();}
    else if(Date.now()>end)reject(Error('Unsupported workspace row missing'));else setTimeout(check,50);
  };check();})`);
  await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  fs.writeFileSync(path.join(temp, 'starbridge-sync-status.png'), (await window.capturePage()).toPNG());
  await store.mutate(data => { delete data.toolModels.zcode; delete data.bindings.zcode; });
  await window.webContents.executeJavaScript(`window.starbridgeProfiles.action('profiles')`);
};
