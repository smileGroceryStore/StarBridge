const text=value=>typeof value==='string'&&value.trim().length>0;
export function validateModelResponse(protocol,json){
 if(!json||typeof json!=='object'||json.error)return{valid:false,empty:false};
 let shaped=false,visible=false;
 if(protocol==='openai-chat'&&Array.isArray(json.choices)){const messages=json.choices.map(c=>c?.message).filter(m=>m&&typeof m==='object');shaped=messages.length>0;visible=messages.some(m=>text(m.content)||(Array.isArray(m.content)&&m.content.some(p=>text(p?.text)))||(Array.isArray(m.tool_calls)&&m.tool_calls.some(t=>text(t?.function?.name))));}
 if(protocol==='openai-responses'&&Array.isArray(json.output)){shaped=!!json.id&&json.output.every(o=>typeof o?.type==='string');visible=json.output.some(o=>(o.type==='message'&&o.content?.some(p=>p.type==='output_text'&&text(p.text)))||(o.type==='function_call'&&text(o.name)));if(json.status==='failed')shaped=false;}
 if(protocol==='anthropic'&&Array.isArray(json.content)){shaped=json.type==='message'&&json.content.every(c=>typeof c?.type==='string');visible=json.content.some(c=>(c.type==='text'&&text(c.text))||(c.type==='tool_use'&&text(c.name)));}
 if(protocol==='gemini'&&Array.isArray(json.candidates)){const parts=json.candidates.flatMap(c=>c?.content?.parts??[]);shaped=json.candidates.some(c=>Array.isArray(c?.content?.parts));visible=parts.some(p=>text(p?.text)||text(p?.functionCall?.name));}
 return{valid:shaped&&visible,empty:shaped&&!visible};
}
