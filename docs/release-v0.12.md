# 星桥 v0.12 — 共享资源工作流

本次按优先级补全五项能力，维持一次维护、多工具分配的结构。

## 1. 删除资源可视化恢复

扩展中心 → 删除恢复：显示删除/导入前的加密备份，按时间选择后勾选缺失资源。已存在条目不可选，不覆盖当前编辑。恢复保留原资源 ID、正文、附件与元数据，但默认停用、无分配；需重新编辑分配并预览同步。无法解密的备份单独标明，不删除原文件。

## 2. 从工具导入现有资源

扩展中心 → 从工具导入 → 选择 OpenCode / Pi / Claude Code / Gemini CLI。扫描全局配置和 Skills 目录，展示来源、资源类型、重复状态与跳过原因，勾选后复制入库。不会修改、删除或执行来源配置。已导入来源自动标为重复；原工具配置仍保留，避免在同一工具重复启用来源与导入副本。

MCP 仅转换本地 stdio 命令与远程 HTTP 基础字段。OAuth、SSE、工具专属参数、环境变量动态引用保留在原工具并标明跳过，不默默丢字段。OpenCode 固定本地 instructions 文件可导入，网络地址、通配符及动态引用不展开。提示词剔除星桥已有托管块。当前只处理全局位置，项目级覆盖与远程资源不在此扫描范围。

## 3. 同步前实际差异

逐文件显示新增、修改、删除与无变化。JSON/JSONC 展示实际变更字段，Markdown 显示增删文本；已知凭据字段隐藏。二进制附件显示字节数与 SHA-256，不输出附件内容。长预览明确标示截断。无变化文件跳过写入，完全无变化时保留原恢复点。新版本不再为仅包含 Skills 的同步创建空 MCP 配置文件。

## 4. 完整 Skill 目录

编辑 Skills 时点击选择完整 Skill 目录，读取 SKILL.md 的正文、名称、描述和其他元数据，附件目录保留相对层级，脚本和二进制文件按原字节保存到加密资源库。更换目录替换附件，单独编辑正文保留已有附件。正文 name/description 由星桥生成，附加元数据保留。

上限：64 个附件、8 层目录、单文件 512 KiB、目录总计 2 MiB；资源库总计 6 MiB。拒绝路径穿越、重名大小写碰撞、符号链接、Git/依赖目录和环境凭据文件。不会执行脚本或安装依赖。同步、删除、恢复、迁移、失败回滚与启动异常恢复均覆盖二进制附件。当前不保留 POSIX 可执行权限；Windows 桌面以文件内容同步为准。

## 5. 更多适配与统计来源

新增 Gemini CLI：settings.json 的 mcpServers（local → command/args/env；remote → httpUrl/headers）、skills 目录、GEMINI.md 全局提示词。保留用户配置和原有提示词，使用相同预览/备份/恢复流程。Gemini API / 模型配置写入仍未提供，不能把资源支持理解为 API 已适配。

会话和用量新增 ~/.gemini/tmp/*/chats 下 JSON / JSONL，重复消息快照按 ID 去重，相同文件名的迁移副本优先 JSONL。输入含缓存，输出含思考 tokens；费用未报告就不估算、不当作零费用。索引只返回元数据，不把对话正文或工具输出传给界面。仍有大小、数量、深度限制，读取失败或部分日志异常会显示不完整。只反映保留日志，不代表服务商账单或套餐余额。

## 验证

65 项 Node 测试通过。Electron 隔离目录验证新增恢复/导入完整 UI 流程、六个扩展页、同步恢复和托盘。18 个弹窗在 960×700 窗口下验证关闭按钮、底部操作及键盘焦点可见。真实模型未调用，真实 Agent 配置未参与测试。

## 适配依据

- [OpenCode MCP](https://opencode.ai/docs/mcp-servers/)
- [Gemini MCP](https://geminicli.com/docs/tools/mcp-server/)
- [Gemini Skills](https://geminicli.com/docs/cli/skills/)
- [Gemini 全局上下文](https://geminicli.com/docs/cli/gemini-md/)
- [Gemini 会话存储](https://geminicli.com/docs/cli/session-management/)
- [Gemini 日志实现](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts)
