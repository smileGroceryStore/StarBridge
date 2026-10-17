# 工具兼容性清单

调研日期：2026-10-17。v0.10 支持 OpenCode / Pi / Reasonix Studio 配置预览、应用和恢复；其他工具仅保存预设。下表为来源核验状态，不代表写入能力。

- configuration-documented：已找到官方自定义供应商配置说明；自动写入仍待验证。
- identity-checked：本次已打开官方仓库确认身份；字段、平台、版本与安装方式待逐项核验。
- candidate：拟收录，来源入口待复核，不作为安装脚本来源。
- identity-pending：身份尚未确定，暂不提供自动检测或安装。
- 优先级 1：首批适配；2：下一批；3：目录收录和后续研究。

ZCode 指 Z.ai 产品，不匹配其他同名项目。DeepSeek Harness 命令名 dsh。Kimi 旧仓库 https://github.com/MoonshotAI/kimi-cli 已归档，应跟进 kimi-code。Goose 的旧 block/goose 地址重定向至 aaif-goose/goose。

编辑器本体与扩展必须分别建模：发现 VS Code 不代表已经安装 Cline；同一个插件在不同编辑器中的安装实例也分别管理。工具支持官方账号登录不等于允许接入任意 API。

| 工具 | 类型 | 核验状态 | 优先级 | 来源 |
|---|---|---|---|---|
| Claude Code | cli | candidate | 1 | [来源](https://code.claude.com/docs/en/settings) |
| Codex | cli | candidate | 2 | [来源](https://github.com/openai/codex) |
| Gemini CLI | cli | identity-checked | 2 | [来源](https://github.com/google-gemini/gemini-cli) |
| OpenCode | cli | configuration-documented | 1 | [来源](https://docs.opencode.ai/docs/config/) |
| Pi | cli | identity-checked | 2 | [来源](https://github.com/earendil-works/pi) |
| Kimi Code CLI | cli | identity-checked | 2 | [来源](https://github.com/MoonshotAI/kimi-code) |
| DeepSeek Harness | cli | identity-checked | 2 | [来源](https://github.com/deepseek-ai/deepseek-harness) |
| Qwen Code | cli | identity-checked | 2 | [来源](https://github.com/QwenLM/qwen-code) |
| Aider | cli | identity-checked | 2 | [来源](https://github.com/Aider-AI/aider) |
| Goose | agent | identity-checked | 3 | [来源](https://github.com/aaif-goose/goose) |
| ZCode (Z.ai) | desktop | configuration-documented | 1 | [来源](https://zcode.z.ai/cn/docs/configuration) |
| Cline | extension | configuration-documented | 2 | [来源](https://docs.cline.bot/provider-config/openai-compatible) |
| Continue | extension | configuration-documented | 2 | [来源](https://docs.continue.dev/customize/model-providers/overview) |
| Roo Code | extension | candidate | 3 | [来源](https://github.com/RooCodeInc/Roo-Code) |
| Kilo Code | extension | candidate | 3 | [来源](https://github.com/Kilo-Org/kilocode) |
| OpenHands | agent | candidate | 3 | [来源](https://github.com/OpenHands/OpenHands) |
| Hermes Agent | agent | candidate | 3 | [来源](https://github.com/NousResearch/hermes-agent) |
| OpenClaw | agent | candidate | 3 | [来源](https://github.com/openclaw/openclaw) |
| Cursor | editor | candidate | 3 | [来源](https://cursor.com) |
| Windsurf | editor | candidate | 3 | [来源](https://windsurf.com) |
| Trae | editor | candidate | 3 | [来源](https://www.trae.ai) |
| Qoder | editor | candidate | 3 | [来源](https://qoder.com) |
| Zed | editor | candidate | 3 | [来源](https://zed.dev) |
| Visual Studio Code | editor-host | candidate | 3 | [来源](https://code.visualstudio.com) |
| VSCodium | editor-host | candidate | 3 | [来源](https://vscodium.com) |
| JetBrains IDEs | editor-host | candidate | 3 | [来源](https://www.jetbrains.com) |
| GitHub Copilot | extension | candidate | 3 | [来源](https://github.com/features/copilot) |
| Amp | agent | candidate | 3 | [来源](https://ampcode.com) |
| Droid (Factory) | agent | candidate | 3 | [来源](https://factory.ai) |
| MiniMax Code | agent | identity-pending | 3 | 待确认 |
| Reasonix Studio | desktop | configuration-documented（写入已实现） | 1 | [来源](https://github.com/esengine/DeepSeek-Reasonix) |
