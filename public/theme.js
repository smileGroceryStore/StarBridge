/* Cache only the allowlisted appearance; credentials never enter localStorage. */
(() => {
 const allowed=new Set(['anime','frost']);
 let pending=null;
 function sync(){const frost=document.documentElement.dataset.theme!=='anime';document.querySelectorAll('[data-theme-icon]').forEach(img=>img.src=frost?'./assets/starbridge-frost.svg':'./assets/starbridge.svg');document.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.title=button.ariaLabel=`当前：${frost?'简约毛玻璃':'动漫暮色'}，点击切换为${frost?'动漫暮色':'简约毛玻璃'}`;button.disabled=!!pending;});document.querySelectorAll('input[name="theme"]').forEach(input=>{input.checked=input.value===(frost?'frost':'anime');input.disabled=!!pending;});}
 function apply(theme){const value=allowed.has(theme)?theme:'frost';document.documentElement.dataset.theme=value;try{localStorage.setItem('starbridge-theme',value);}catch{}sync();return value;}
 try{apply(localStorage.getItem('starbridge-theme'));}catch{apply('frost');}
 async function set(theme){if(pending)return pending;if(!allowed.has(theme))throw Error('主题设置无效');pending=(async()=>{await window.starbridgeTheme.ready;const result=await window.allsetting.deviceSettings({theme});if(!result.ok)throw Error(result.error);return apply(result.data.theme);})();sync();try{return await pending;}finally{pending=null;sync();}}
 window.starbridgeTheme={apply,sync,set,ready:null};
 window.starbridgeTheme.ready=(async()=>{try{const result=await window.allsetting.deviceSettings();if(result.ok)apply(result.data.theme);}catch{/* Keep the local appearance if IPC is unavailable. */}})();
})();
