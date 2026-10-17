const path=require('node:path');
module.exports=function setupBackground({app,Menu,Tray,window,notify=true,settings,showPage,drain,onError,getExtraMenu=async()=>[]}){
 let tray=null,quitting=false,exitReady=false,notified=false;
 const show=()=>{if(window.isMinimized())window.restore();window.show();window.focus();};
 const update=async()=>{const s=await settings.read();if(!tray){tray=new Tray(path.join(__dirname,s.theme==='anime'?'../public/assets/starbridge.ico':'../public/assets/starbridge-frost.ico'));tray.setToolTip('星桥 Starbridge · 后台运行');tray.on('click',show);tray.on('double-click',show);}tray.setImage?.(path.join(__dirname,s.theme==='anime'?'../public/assets/starbridge.ico':'../public/assets/starbridge-frost.ico'));tray.setContextMenu(Menu.buildFromTemplate([{label:'打开星桥',click:show},{label:'Agent 模型',click:()=>{show();showPage('agents');}},{label:'应用设置',click:()=>{show();showPage('settings');}},...await getExtraMenu(),{type:'separator'},{label:'关闭窗口后在后台运行',type:'checkbox',checked:s.closeToTray,click:item=>settings.update({closeToTray:item.checked}).then(refresh).catch(onError)},{type:'separator'},{label:'彻底退出星桥',click:()=>app.quit()}]));return s;};
 let current={closeToTray:true,minimizeToTray:false};
 const refresh=async()=>{current=await update();return current;};
 window.on('close',event=>{if(!quitting&&tray&&current.closeToTray){event.preventDefault();window.hide();if(notify&&!notified&&tray.displayBalloon){notified=true;tray.displayBalloon({title:'星桥正在后台运行',content:'点击托盘图标重新打开；右键菜单可彻底退出。',respectQuietTime:true});}}});
 window.on('minimize',()=>{if(current.minimizeToTray&&tray)window.hide();});
 app.on('before-quit',event=>{if(exitReady)return;event.preventDefault();if(quitting)return;quitting=true;Promise.resolve().then(drain).then(()=>{exitReady=true;tray?.destroy();tray=null;app.quit();}).catch(error=>{quitting=false;show();onError(error);});});
 return{show,refresh,disable(){tray?.destroy();tray=null;},get tray(){return tray;}};
};
