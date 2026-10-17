# v0.11 扩展中心

核心仍是「一次维护来源，按工具分配」：API 和套餐使用现有连接库；MCP、Skills、提示词使用新增的系统加密共享资源库。目标文件中必要的副本由适配器生成，不要求重复维护多份来源。

## 入口与能力

侧栏「扩展中心」包含六个页签。此版能力与限制如下。

| 模块 | 已实现 | 当前范围 |
|---|---|---|
| MCP | 共享条目增删改、启停、多工具分配、本地 command/env 与远程 url/headers、凭据掩码保留、预览/备份/应用/恢复 | OpenCode / Claude Code |
| Skills | Markdown 正文与描述管理、生成有效 SKILL.md、多工具分配、移除同步与恢复 | OpenCode / Pi / Claude Code；仅单文件，不复制脚本、引用文件或安装依赖 |
| 提示词 | 共享 Markdown、多工具分配、保留原有全局指令、独立托管区更新 | OpenCode / Pi / Claude Code；项目或 override 文件可能影响实际生效 |
| 会话 | 读取本机 JSONL 会话索引、来源/模型/更新时间搜索、在文件夹中显示 | Codex / Claude Code / Pi；不读取聊天正文到界面，不跨工具迁移、恢复运行或删除会话 |
| 授权中心 | API 连接启停、凭据是否保存、工具分配、本机凭据文件存在状态 | 不是 OAuth 登录有效性验证；不自动登录、注销或复制 OAuth token |
| 用量统计 | 从相同会话索引汇总输入/输出/缓存 tokens、来源工具、日志报告费用 | 是本机日志统计，不是官方账单、套餐余额或按 API Key 归属的完整统计 |

同一 MCP、Skill 或提示词可勾选多个兼容工具。保存仅更新共享库；在「同步到工具」分别预览和应用该工具全部已分配资源。资源更新后可看到预设变化，需重新同步。全局兼容目录可能被其他工具发现，分配不构成工具权限隔离。

共享资源提供独立的密码加密导入/导出。导入会建立新条目、默认停用且不分配工具；API 连接仍使用套餐库迁移包。删除和导入前保留加密库备份。此版不包含 GitHub Skill 安装、已有资源自动导入或在线 MCP 市场。

## 写入与保护

- MCP 的环境变量和请求头只在系统加密库及目标工具必要的配置副本中保存；列表与编辑表单中的这两类凭据返回掩码。将密钥放在 env/headers 中，不建议塞入命令参数。
- OpenCode MCP 使用 mcp.local.command/environment 或 mcp.remote.url/headers；Claude Code 使用用户 ~/.claude.json 的 mcpServers。
- OpenCode 提示词写入专用 starbridge-instructions.md 并加入 instructions 列表；Pi 的 AGENTS.md 与 Claude 的 CLAUDE.md 仅更新带明确标记的星桥托管区。
- Skills 使用稳定的 starbridge-UUID 目录及同名 frontmatter；删除分配后只移除该托管 SKILL.md，不递归删除用户目录。
- 复用文件哈希校验、系统加密备份、多文件失败回滚、启动未完成操作发现与恢复。不同模块共享写入队列，避免同时写同一配置文件。
- API 配置与资源配置可能共享 OpenCode 文件。一个模块写入后，另一模块的旧文件快照会提示变化并阻止直接恢复；重新预览会保留当前非托管内容。此版没有按字段合并旧恢复点。
- 星桥不执行 MCP 命令、Skill 代码，也不自动调用模型。目标工具启动 MCP 时可能执行其配置命令，预览中明确提示核对。

## 统计口径

每个来源最多索引 200 个 JSONL 文件，总数最多 600，单文件最多 8 MiB，总读取最多 64 MiB；跳过符号链接，达到限制会显示不完整提示。活跃或不支持的日志格式可能无法纳入。Claude 流式重复消息按消息 ID 取累计快照，Codex token_count 采用最后累计量；缓存计入输入总数但不重复计入总 tokens。费用仅合计日志明确报告的 USD 金额，无金额时显示「未报告」。

## 验证

55 项核心测试通过，包括多工具同步、非托管配置保留、凭据加密与掩码、Skill 删除及失败回滚、资源预览失效、启动恢复、迁移默认停用和统计去重。桌面测试通过三个资源编辑表单、两个工具资源应用/恢复、会话/授权/用量页读取，使用隔离目录和虚拟凭据。测试不启动真实 MCP，不写入真实 Agent 配置，不调用收费推理。

参考官方说明：[CC Switch](https://github.com/farion1231/cc-switch)、[OpenCode MCP](https://opencode.ai/docs/mcp-servers/)、[OpenCode Skills](https://opencode.ai/docs/skills/)、[Claude MCP](https://code.claude.com/docs/en/mcp)、[Claude Skills](https://code.claude.com/docs/en/skills)、[Pi Skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)。CC Switch 当前也有统一管理能力，星桥的实现以自己的共享来源与工具绑定结构为准，不以未经核实的竞品限制作为前提。
