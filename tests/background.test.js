import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import setupBackground from '../desktop/background.cjs';
test('tray keeps window alive, reopens it and quits only after pending work drains',async()=>{
 const app=new EventEmitter();let exited=false,drained=false,release;const drain=new Promise(r=>release=r);app.quit=()=>{const e={prevented:false,preventDefault(){this.prevented=true;}};app.emit('before-quit',e);if(!e.prevented)exited=true;};
 const window=new EventEmitter();window.visible=true;window.isMinimized=()=>false;window.show=()=>window.visible=true;window.focus=()=>{};window.hide=()=>window.visible=false;
 class Tray extends EventEmitter{setToolTip(){}setContextMenu(menu){this.menu=menu;}destroy(){this.destroyed=true;}}
 const data={closeToTray:true,minimizeToTray:false},settings={read:async()=>({...data}),update:async patch=>Object.assign(data,patch)};
 const bg=setupBackground({app,Menu:{buildFromTemplate:x=>x},Tray,window,settings,showPage:()=>{},drain:async()=>{await drain;drained=true;},onError:e=>{throw e;}});await bg.refresh();let prevented=false;window.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(window.visible,false);bg.tray.emit('click');assert.equal(window.visible,true);
 await bg.tray.menu.find(m=>m.type==='checkbox').click({checked:false});prevented=false;window.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,false);
 app.quit();assert.equal(exited,false);release();await new Promise(r=>setImmediate(r));assert.equal(drained,true);assert.equal(exited,true);assert.equal(bg.tray,null);
});
