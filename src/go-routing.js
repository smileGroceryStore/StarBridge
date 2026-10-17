// Reasonix 2.42 recognizes Go session routing on the official legacy endpoint.
// OpenCode forwards these paths to the matching /inference/go protocol routes.
export function reasonixGoBase(baseUrl,protocol){
 let u;try{u=new URL(baseUrl);}catch{return baseUrl;}
 if(u.origin!=='https://opencode.ai'||u.search||u.hash||u.username||u.password)return baseUrl;
 const route=u.pathname.replace(/\/$/,'');
 if((protocol==='openai-chat'||protocol==='openai-responses')&&route==='/inference/go/openai/v1')return'https://opencode.ai/zen/go/v1';
 if(protocol==='anthropic'&&['/inference/go/anthropic','/inference/go/anthropic/v1'].includes(route))return'https://opencode.ai/zen/go';
 return baseUrl;
}
