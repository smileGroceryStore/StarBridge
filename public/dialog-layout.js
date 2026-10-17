(() => {
 function enhance(dialog){
  if(dialog.classList.contains('dialog-shell'))return;
  const frame=dialog.firstElementChild?.tagName==='FORM'?dialog.firstElementChild:dialog;
  const header=[...frame.children].find(n=>n.classList.contains('dialog-top'));
  if(!header)return;
  const actions=[...frame.children].find(n=>n.classList.contains('form-actions'));
  const statuses=actions?[...frame.children].filter(n=>n.classList.contains('form-error')):[];
  const body=document.createElement('div');body.className='dialog-scroll';
  const contents=[...frame.childNodes].filter(n=>n!==header&&n!==actions&&!statuses.includes(n));
  body.append(...contents);frame.append(header,body);
  if(actions){const footer=document.createElement('div');footer.className='dialog-footer';footer.append(...statuses,actions);frame.append(footer);}
  dialog.classList.add('dialog-shell');if(frame!==dialog)frame.classList.add('dialog-frame');
  // Each opening starts at the beginning; scrolling never moves the close control.
  new MutationObserver(()=>{if(dialog.open)body.scrollTop=0;}).observe(dialog,{attributes:true,attributeFilter:['open']});
 }
 document.querySelectorAll('dialog').forEach(enhance);
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;if(node.matches('dialog'))enhance(node);node.querySelectorAll('dialog').forEach(enhance);}}).observe(document.body,{childList:true,subtree:true});
})();
