# 星桥 StarBridge v0.14.1

- 修复 Claude Code 应用连接后仍读取旧 `ANTHROPIC_MODEL`、模型别名和子代理模型的问题。
- 同步星桥选定的 `availableModels` 与 Claude Code 原生 `modelPicker`，模型选择器展示明确的模型 ID（`modelPicker` 需要 Claude Code 2.1.242 或更新版本）。
- Claude Code 可选模型必须使用同一 Anthropic 接口，避免列表中的模型实际发往错误地址。
- 应用前预览、加密备份与完整恢复沿用现有流程，保留权限与无关设置。

验证：88 项核心测试通过，包括旧 DeepSeek 映射清理、可选列表、权限保留及原文件完整恢复；本机 Claude Code 2.1.302 配置校验通过。
