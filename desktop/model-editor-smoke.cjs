const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({window,store,temp})=>{
 const js=s=>window.webContents.executeJavaScript(s);
 const wait=s=>js(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(${s})resolve();else if(Date.now()>end)reject(Error('Model editor check failed'));else setTimeout(check,50)};check()})`);
 await js(`(async()=>{await window.profileWorkspaceReady;document.getElementById('profiles-nav').click();document.querySelector('.profiles-pane .intro .primary').click();const f=document.getElementById('profile-form');f.elements.baseUrl.value='https://example.com/v1';f.elements.key.value='fixture-key';document.getElementById('profile-fetch-models').click();})()`);
 await wait(`document.querySelector('.profile-model-picker').open`);
 if((await store.list()).profiles.length)throw Error('Fetching draft saved a connection');
 await js(`document.getElementById('profile-picker-search').value='deepseek';document.getElementById('profile-picker-search').dispatchEvent(new Event('input'));document.getElementById('profile-picker-all').click();document.getElementById('profile-picker-apply').click();`);
 if(!await js(`document.getElementById('profile-form').elements.models.value==='deepseek-v4-pro'`))throw Error('Selection failed');
 await js(`document.querySelector('.profile-one-m input').click()`);
 if(!await js(`document.getElementById('profile-form').modelEditor.value().modelMetadata['deepseek-v4-pro'].supports1M`))throw Error('1M declaration failed');
 await js(`document.querySelector('.profile-model-editor').scrollIntoView({block:'center'})`);
 await new Promise(r=>setTimeout(r,120));await fs.writeFile(path.join(temp,'starbridge-model-editor.png'),(await window.capturePage(undefined,{stayHidden:false,stayAwake:true})).toPNG());
 await js(`document.getElementById('profile-fetch-models').click();document.getElementById('profile-picker-none').click();document.getElementById('profile-picker-cancel').click()`);
 if(!await js(`document.getElementById('profile-form').elements.models.value==='deepseek-v4-pro'`))throw Error('Cancel modified selection');
 await js(`document.getElementById('profile-cancel').click()`);
 if((await store.list()).profiles.length)throw Error('Canceled draft saved data');
 await fs.writeFile(path.join(temp,'starbridge-model-editor-test.json'),JSON.stringify({draftFetch:true,selection:true,oneM:true,cancelPreserved:true,noPersistence:true}));
};
