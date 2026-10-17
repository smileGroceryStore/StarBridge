# 星桥 Starbridge

面向多设备、多 API 和 Coding Plan 的本地 AI 工具配置中心。

当前阶段：v0.12 Windows 桌面应用。支持工具扫描、加密连接库、独立模型预设、OpenCode / Pi / Reasonix Studio 配置预览与应用、启动异常恢复、备份管理、连接检查和密码加密迁移。扩展中心可集中管理并分配 MCP、完整 Skills 和提示词；API 连接与共享资源的适配范围分别列出。

## 运行

普通用户：运行 `release/Starbridge-Setup-0.12.0-x64.exe` 安装，通过桌面或开始菜单的 星桥 Starbridge 快捷方式启动。安装包自带运行环境，不需要 Node，不会打开浏览器，也不会启动 HTTP 服务。可在 Windows 已安装的应用中卸载。

开发：需要 Node.js 22 或更高版本，先 `npm ci`，再执行 `npm start` 打开桌面窗口。`npm run dist:win` 生成 Windows x64 安装包。`npm run start:web` 仅保留为开发调试入口。

`npm test` 运行核心与本地服务测试；`npm run scan` 在终端输出只读扫描结果，结果包含本机路径，请自行决定是否分享。

当前提供：31 项工具目录、名称搜索、类型与状态筛选、选择工具、检测证据详情、手动可执行文件路径、官方项目入口。选择与手动路径保存在桌面应用本地。迁移包只迁移连接库与模型预设，不迁移本机工具安装路径。

扫描范围：PATH、部分 Windows 常见应用位置、当前用户配置痕迹和编辑器扩展清单。未扫描注册表、WSL、自定义扩展目录或全部磁盘；未发现不代表未安装。命令路径只标记安装候选，不执行或读取其内容。配置目录仅检查是否存在。

桌面使用 Electron，加载应用内文件，以受限 IPC 调用扫描和文件选择功能。界面采用原生 HTML/CSS/JavaScript。当前安装包未配置代码签名证书。

- [工具兼容性清单](docs/compatibility.md)
- [CC Switch 源码评估与技术决策](docs/architecture.md)
- [第一版开发范围与验收](docs/mvp.md)
- `catalog/tools.json`：机器可读的候选工具目录。
- 上游研究快照、本机数据、操作截图、依赖和安装包不进入 Git 仓库。安装包在本机 `release/` 生成。

应用配置前会显示脱敏差异并保存系统加密备份；发现外部修改会阻止覆盖。模型测试由用户主动触发，可能消耗额度。开发与安装验证使用临时配置目录，未修改真实 Agent 配置。

详见 [v0.7 更新与验证](docs/release-v0.7.md)。





v0.7.1：连接卡片支持删除，确认受影响工具后移除连接及引用；删除前自动备份加密库，不改动真实 Agent 文件。17 项测试与复制删除桌面流程通过。

当前更新：[v0.8 更新与恢复机制](docs/release-v0.8.md)。

当前更新：[v0.9 后台运行与多连接](docs/release-v0.9.md)。关闭窗口默认进入托盘；彻底退出请用托盘菜单或应用设置。开机启动默认关闭。

v0.9.1：侧栏「使用方法」和 Agent 页快捷帮助，说明工具、连接、模型、预设与应用的区别，以及完整配置步骤。

v0.10：新增 Reasonix Studio 写入、备份和恢复适配，支持 Chat / Anthropic / Responses，更新检测、协议筛选与使用说明。详见 [更新说明](docs/release-v0.10.md)。

v0.10.1：相同配置重复应用保留原恢复点，Reasonix 重复生成保持原格式，非 UTF-8 文件停止写入。详见 [排查与验证](docs/release-v0.10.1.md)。


v0.10.2：Reasonix OpenCode Go 使用官方兼容路由，使原生引擎自动提供会话标识。详见 [Go 会话兼容修复](docs/release-v0.10.2.md)。


v0.10.3：应用设置展示全部工具的配置支持状态，已支持工具显示实际目录及文件名，待适配工具可搜索并查看官方入口。


v0.10.4：全部弹窗采用固定关闭区、内容独立滚动和底部操作区，长页面无需滚回顶部关闭。


v0.11：新增「扩展中心」：共享 MCP / Skills / 提示词、会话索引、连接授权状态和日志用量统计。共享资源一次编辑，按兼容工具分配并分别预览应用。详见 [支持范围与使用说明](docs/release-v0.11.md)。


v0.12：[扩展资源恢复、原有配置导入、逐文件差异和完整 Skill 目录](docs/release-v0.12.md)。新增 Gemini CLI 资源同步、资源导入及 JSON / JSONL 会话用量来源。

| 能力 | 已支持工具 |
| --- | --- |
| API / 模型配置写入 | OpenCode、Pi、Reasonix Studio |
| 共享 MCP | OpenCode、Claude Code、Gemini CLI |
| 共享 Skills / 提示词 | OpenCode、Pi、Claude Code、Gemini CLI |
| 导入原有全局资源 | OpenCode、Pi、Claude Code、Gemini CLI（按对应资源能力） |
| 本机会话 / 用量日志 | Codex、Claude Code、Pi、Gemini CLI |

资源操作入口：扩展中心 → MCP / Skills / 提示词。误删后点「删除恢复」；迁入现有资源点「从工具导入」；完整 Skill 在编辑窗口点「选择完整 Skill 目录」。导入、恢复默认停用且未分配，需启用分配并逐工具预览同步。
