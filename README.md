# 星桥 StarBridge · AI 编程工具配置管理器

**一次配置 API Key / Coding Plan，按需分配给多个 AI 编程工具。**

**Configure once, use across AI coding agents.** StarBridge is a local Windows desktop configuration manager for Claude Code, Codex, OpenCode, Pi, Reasonix Studio and DeepSeek Harness, with shared MCP servers, Agent Skills, prompts, encrypted migration and rollback.

[下载 Windows 安装包](https://github.com/smileGroceryStore/StarBridge/releases/latest) · [实际支持范围](#实际支持范围) · [快速开始](#快速开始) · [参与贡献](CONTRIBUTING.md) · [报告问题](https://github.com/smileGroceryStore/StarBridge/issues)

[![CI](https://github.com/smileGroceryStore/StarBridge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/smileGroceryStore/StarBridge/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/smileGroceryStore/StarBridge)](https://github.com/smileGroceryStore/StarBridge/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4)](https://github.com/smileGroceryStore/StarBridge/releases/latest)

## 为什么使用星桥

换设备、更换 API Key 或 Coding Plan 时，不用在每个工具里分别维护同一份连接。星桥集中保存服务来源，给各工具独立选择默认模型和可选模型，再预览、备份并应用。

- **API / 套餐库**：集中维护 API Key、接口、协议、模型和多个服务来源。
- **配置工作台**：查看待同步、已同步、外部变化和未完成操作，逐项预览或批量应用。
- **共享 MCP、Skills、提示词**：维护一份来源，分配给兼容工具；支持完整 Skill 目录及脚本、附件。
- **导入与完整迁移**：读取工具现有明确配置；通过密码加密包迁移连接、模型预设及共享资源。
- **备份与恢复**：系统加密保存本机库和备份，提供删除恢复、失败回滚及异常退出后的恢复检查。
- **会话、授权与用量**：索引受支持工具的本机日志，展示凭据来源与日志报告用量。

## 实际支持范围

| 能力 | 支持的工具 |
| --- | --- |
| 工具目录与只读发现 | 收录 31 项工具；目录收录不代表支持配置写入 |
| API / 默认模型写入 | OpenCode、Pi、Reasonix Studio、Claude Code、Codex |
| Harness API / 模型写入 | 仅已有 desktop profile 的原生 OpenCode Go 配置 |
| 共享 MCP | OpenCode、Claude Code、Gemini CLI |
| 共享 Skills / 提示词 | OpenCode、Pi、Claude Code、Gemini CLI |
| 导入现有 API 连接 | 六项 API 适配器中可识别的静态连接；OAuth、命令授权及未知结构不自动转换 |
| 导入现有全局资源 | OpenCode、Pi、Claude Code、Gemini CLI，按对应资源能力 |
| 本机会话 / 用量日志 | Codex、Claude Code、Pi、Gemini CLI |

Claude Code 接入 Anthropic 兼容协议，Codex 接入 Responses 协议。具体版本、套餐权限和代理的会话头转发仍需在原工具验证。**文件已同步不等于模型实际调用已验证。**

## 快速开始

1. 从 [GitHub Releases](https://github.com/smileGroceryStore/StarBridge/releases/latest) 下载 Windows x64 安装包，附带的 `SHA256SUMS` 可用于校验文件。
2. 安装后通过桌面或开始菜单的「星桥 Starbridge」启动，无需 Node.js，不会打开网页。
3. 在「API / 套餐库」添加连接，或从已配置的工具导入。
4. 到「Agent 模型」给工具选择连接、默认模型和可选模型。
5. 在「工作台」检查兼容性与差异，备份并应用；回到原工具新开会话验证。

共享资源在「扩展中心」添加或导入，启用并分配后逐工具同步。完整迁移、更新检查和脱敏诊断位于工作台。关闭窗口默认进入系统托盘；彻底退出请使用托盘菜单或应用设置。

## 配置与数据

- Windows 桌面应用，基于 Electron 和原生 HTML / CSS / JavaScript；当前发布包没有代码签名。
- 星桥的连接库、资源库和备份使用系统加密；工具要求的密钥仍会写入目标工具的本机配置。
- 只有主动点击模型测试才会发送短测试请求，可能消耗额度；保存、扫描和同步不自动发起推理请求。
- 迁入的连接与共享资源默认停用；现有工具预设不覆盖，本机安装和配置目录不迁移。
- 遇到外部修改或无法识别的格式会停止覆盖；恢复及备份清理均有明确入口。
- OAuth 登录、工具安装、历史对话不包含在完整迁移包内。日志用量不代表服务商账单或套餐余额。

## 本地开发

需要 Node.js 22 或更新版本；CI 使用 Node.js 24。

```powershell
npm ci
npm test
npm start
```

```powershell
npm run dist:win   # 生成 Windows x64 安装包，输出到 release/
npm run scan       # 本机只读发现，输出包含本机路径
```

桌面加载应用内文件，使用受限 IPC。`npm run start:web` 仅保留为开发调试入口。依赖、安装包、研究快照和本机数据不进入 Git 仓库。

## 开发与合并规则

`main` 为受保护的稳定分支：通过 PR、通过 `Core tests`、解决审核讨论后使用 Squash merge；禁止直接推送、强推和删除，管理员同样适用。当前不强制第二位审核者，便于单人维护。详见 [贡献指南](CONTRIBUTING.md)。

## 文档

- [v0.13：工作台、兼容性、批量应用、完整迁移与维护](docs/release-v0.13.md)
- [v0.12：资源恢复、现有资源导入与完整 Skills](docs/release-v0.12.md)
- [工具兼容性目录](docs/compatibility.md)
- [架构与上游研究](docs/architecture.md)
- [历史更新说明](docs/)
