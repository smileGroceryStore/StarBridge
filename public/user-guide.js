(() => {
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;},$=id=>document.getElementById(id);
 const nav=el('button','nav','使用方法');nav.id='user-guide-button';document.querySelector('nav').append(nav);
 const guide=el('dialog','profile-dialog user-guide');guide.setAttribute('aria-labelledby','user-guide-title');guide.innerHTML=`<div class="dialog-top"><span class="eyebrow">STARBRIDGE / QUICK START</span><button id="user-guide-close" aria-label="关闭使用方法">×</button></div><h2 id="user-guide-title">使用方法</h2>
 <p class="guide-lead">星桥管理连接与配置；实际聊天、编程和模型切换在对应的 Agent 工具中进行。</p>
 <section class="file-preview"><h3>OpenCode 和 Pi 是什么？</h3><p>它们是两个独立的 AI 编程工具。选择 OpenCode 或 Pi，是决定给哪个工具配置，不是在切换大模型。你只使用其中一个，就只配置那个工具。</p><p>同一份 API 或套餐可以分配给多个工具，各工具的默认模型互不影响；实际请求仍使用对应连接的账号和额度。</p></section>
 <h3>第一次配置，按这个顺序</h3><ol class="guide-steps">
 <li><strong>确认使用的工具。</strong>在「工具目录」扫描本机；未安装时打开官方入口安装，再重新扫描。目录收录不代表支持写入。</li>
 <li><strong>添加连接。</strong>在「API / 套餐库」填写地址、密钥和模型 ID，也可使用模板或「从工具导入」。导入会先预览、去重；Go 连接可在模型库获取官方模型目录，目录不代表账号拥有全部权限。</li>
 <li><strong>给工具选模型。</strong>到「Agent 模型」，找到实际使用的工具，点击「配置模型」。选择默认连接、默认模型与可选模型，保存预设。</li>
 <li><strong>预览并应用。</strong>OpenCode / Pi / Reasonix Studio 点击「预览应用」，核对目标文件和脱敏差异，再点「备份并应用」。仅保存或启用连接，不会自动修改工具配置。</li>
 <li><strong>回到工具验证。</strong>应用后新开会话，在对应工具里使用或选择模型。文件已写入不等于运行能力已验证；项目级设置也可能覆盖全局默认值。</li></ol>
 <h3>几个容易混淆的概念</h3><div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>名称</th><th>作用</th></tr></thead><tbody>
 <tr><td>连接 / 套餐</td><td>模型来源，包含接口地址、密钥和模型目录。</td></tr>
 <tr><td>默认模型</td><td>应用配置后，该工具新会话优先使用的模型；工具或项目设置可能覆盖它。</td></tr>
 <tr><td>可选模型</td><td>提供给该工具使用的模型列表，保存列表不会发起推理请求。</td></tr>
 <tr><td>附加连接（共存）</td><td>OpenCode / Pi / Reasonix Studio 可同时接入多个来源，例如套餐与本地服务；默认连接之外的模型在对应工具内选择。</td></tr>
 <tr><td>继承 / 独立覆盖</td><td>继承模型跟随连接的默认地址和协议；独立覆盖模型使用自己的地址和协议。检查时以实际生效地址为准。</td></tr>
 <tr><td>模型预设方案</td><td>保存各工具的连接与模型选择。切换方案只更新星桥预设，仍需预览应用；方案仅保存在当前设备。</td></tr></tbody></table></div>
 <section class="file-preview"><h3>一个分配示例</h3><p>同一个套餐，可以给 OpenCode 选择「模型 A」为默认、给 Pi 选择「模型 B」为默认。只用 OpenCode 时，无需配置 Pi。示例中的模型名不代表真实账号权限。</p></section>
 <section class="file-preview"><h3>扩展中心：一次维护，多工具分配</h3><p>MCP、Skills、提示词先保存在共享库，勾选兼容工具后保存，再到「同步到工具」预览、备份并应用。更新资源后需分别重新应用到已分配工具。MCP 支持 OpenCode / Claude Code / Gemini CLI；Skills 和提示词还支持 Pi。「从工具导入」扫描现有全局资源，勾选后复制入库，默认停用、未分配。Skill 可在编辑窗口选择完整目录，携带脚本、模板、二进制附件和元数据（最多 64 个附件、2 MiB），不安装依赖。同步预览逐文件显示新增、修改、删除与无变化，凭据值隐藏。误删时点「删除恢复」，选备份并勾选缺失条目找回。</p><p>会话和用量只读取 Codex / Claude Code / Pi / Gemini CLI 本机日志；Gemini 同时支持 JSON 和 JSONL，输出统计包含思考 tokens。费用仅汇总明确报告的金额，并显示报告覆盖数量。授权中心的凭据文件提示不代表登录有效；OAuth 登录、注销与服务端撤销仍在原工具进行。全局兼容目录可能被多个工具同时发现，资源分配不构成权限隔离。</p></section>
 <h3>检查、恢复与后台运行</h3><ul class="guide-steps"><li>「检查地址」不发送密钥；「测试模型」会发送密钥和短测试消息，可能消耗额度。修改连接后，旧结果会提示重新测试。</li><li>配置异常时，在 Agent 页「恢复备份」；误删连接或启动发现未完成操作时，打开「备份与恢复」。发现外部改动会停止覆盖。</li><li>关闭窗口默认进入系统托盘。点击托盘图标重新打开；彻底退出使用托盘菜单或「应用设置」。开机后台启动需主动开启。</li></ul>
 <p class="muted">当前 API 连接写入适配：OpenCode / Pi / Reasonix Studio。其他工具可保存预设，写入功能待核验。星桥不会替你启动 Agent 或自动发起模型请求。</p>
 <div class="form-actions"><button id="guide-open-library" class="text-button">去添加连接</button><button id="guide-open-agents" class="primary">去配置 Agent</button></div>`;
 document.body.append(guide);const open=()=>{if(!guide.open)guide.showModal();};nav.onclick=open;$('user-guide-close').onclick=()=>guide.close();$('guide-open-library').onclick=()=>{guide.close();$('profiles-nav').click();};$('guide-open-agents').onclick=()=>{guide.close();$('agent-model-nav').click();};
 const shortcut=el('button','text-button','使用方法');shortcut.id='agent-guide-button';shortcut.onclick=open;document.querySelector('.agent-toolbar').append(shortcut);
 const hint=el('p','agent-usage-hint','这里选择要配置的工具，不是在切换大模型。保存预设后，OpenCode / Pi / Reasonix Studio 还需「预览应用」；实际使用请回到对应工具。');document.querySelector('.agent-pane .intro').after(hint);
})();
