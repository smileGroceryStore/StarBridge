/* Cache only the allowlisted appearance; credentials never enter localStorage. */
(() => {
 const allowed=new Set(['anime','frost']);
 function apply(theme){const value=allowed.has(theme)?theme:'anime';document.documentElement.dataset.theme=value;try{localStorage.setItem('starbridge-theme',value);}catch{}return value;}
 try{apply(localStorage.getItem('starbridge-theme'));}catch{apply('anime');}
 window.starbridgeTheme={apply,ready:null};
 window.starbridgeTheme.ready=(async()=>{try{const result=await window.allsetting.deviceSettings();if(result.ok)apply(result.data.theme);}catch{/* Keep the local appearance if IPC is unavailable. */}})();
})();
