# v0.10 Reasonix Studio

修复 Reasonix 原先仅作为待核验目录条目、保存预设却没有写入适配器的问题。

- 检测 Reasonix Studio 的安装位置，更新官方来源及产品名称。
- 新增 Reasonix Chat、Anthropic、Responses 模型协议过滤和多连接共存；暂不接入 Gemini。
- 写入 Reasonix 全局 config.toml 与 .env，TOML 仅保存凭据变量名。
- 用 TOML AST 范围修改默认模型、桌面可见提供商列表及托管提供商，保留无关字段和注释。凭据文件保留其他变量。
- 复用星桥配置预览、两文件加密备份、外部变更检查、原文恢复和启动异常恢复。
- 支持在应用设置中选择 Reasonix 配置目录。更新 Agent 模型页和使用方法。

核验：本机 Reasonix Studio 2.42.0。隔离原生引擎测试确认 openai / anthropic / responses 协议名称、生成提供商、显示名称和测试凭据均被识别；未调用付费推理接口。39 项测试通过，新增 TOML/凭据保护、往返恢复及新建配置验证。桌面测试覆盖 Reasonix 的模型预设、预览、应用与恢复。

本次按用户要求将已分配的 OpenCode Go 连接实际应用到 Reasonix，默认 deepseek-v4.1-flash，28 个协议兼容模型；跳过 Gemini。应用前保存原配置和加密库备份。实际模型账号权限和推理可用性仍需在 Reasonix 新会话中验证。

资料：

- https://github.com/esengine/DeepSeek-Reasonix/blob/studio/docs/CONFIG_PATHS.md
- https://github.com/esengine/DeepSeek-Reasonix/blob/studio/docs/GUIDE.md

research/reasonix-contract 保留公开源码片段与许可证，用于契约核对；不包含用户配置或密钥，不随安装包发布。
