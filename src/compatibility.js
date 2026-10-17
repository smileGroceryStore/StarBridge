import {modelFor,compatibleModels,goModelDetail} from './model-catalog.js';
export const apiTools=['opencode','pi','reasonix','claude-code','codex','deepseek-harness'];
export function isGo(profile){return profile.models.some(id=>{try{const u=new URL(modelFor(profile,id).baseUrl);return u.hostname==='opencode.ai'&&/\/go\//.test(u.pathname);}catch{return false;}});}
export function assessCompatibility(tool,profile,config,version=null){
 const issues=[];const add=(level,message)=>issues.push({level,message});
 if(!apiTools.includes(tool))add('error','此工具还没有 API 写入适配器');
 if(!profile?.enabled||profile.archived)add('error','连接已停用、归档或不存在');
 if(profile){if((config.models??[]).some(id=>!compatibleModels(profile,tool).includes(id)))add('error','所选模型协议与工具不兼容');if(!config.models?.includes(config.defaultModel))add('error','默认模型未包含在可选模型中');
  if(tool==='deepseek-harness'&&(!isGo(profile)||(config.models??[]).some(id=>!goModelDetail(id))))add('error','Harness 当前仅适配已有 desktop profile 的原生 OpenCode Go，请在原工具配置其他服务');
  if(isGo(profile)){add('warning','OpenCode Go 要求编程代理请求、客户端标识和每会话稳定的 session header；模型目录不代表套餐可用权限。');if(tool==='pi')add('warning','Pi 请使用包含 Go 会话支持的当前版本；旧版本可能返回缺少 x-opencode-session 的 400。');if(tool==='reasonix')add('info','Reasonix 使用已核验的 Go 原生兼容路由；本机 2.42 版本验证过会话行为，其他版本需在新会话检查。');if(['codex','claude-code'].includes(tool))add('warning','Go 可识别该工具的原生会话信息；代理转发必须保留会话头，旧版本需升级。');if(tool==='deepseek-harness')add('info','保留 opencode-go 原生 provider，以使用 Harness 的会话头实现。');}
 }
 if(!version)add('warning','未读取到安装版本：按配置结构检查，无法保证当前安装版本运行兼容。');
 if(['codex','claude-code'].includes(tool))add('info','写入默认模型和连接；可选模型列表保存在星桥，不修改工具的内置模型目录，也不改 OAuth 登录文件。');
 return{toolId:tool,version:version??'未知',compatible:!issues.some(i=>i.level==='error'),runtimeVerified:false,issues};
}
