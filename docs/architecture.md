# 技术评估与决策

调研日期：2026-10-17。以下是静态源码评估，未编译或运行上游。

## CC Switch 的适用性

来源：[上游仓库](https://github.com/farion1231/cc-switch)。本次完整 git clone 未完成，改为下载五个关键文件，保存在 research/cc-switch-snapshot。快照来自当日 main，未锁定提交，因此结论属于初步评估。

读取的入口：

- package.json：桌面框架为 Tauri 2，界面采用 React、TypeScript 与 Vite。
- src-tauri/src/app_config.rs：AppType 以及客户端启用字段使用固定类型。
- src-tauri/src/lib.rs：不同工具拥有专门配置模块。
- src-tauri/src/services/provider/mod.rs：多个供应商处理分支依赖 AppType。
- LICENSE：MIT，复制或分发实质代码时需保留版权和许可声明；本次仅保存调研样本。

源码链接：[类型](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/app_config.rs)、[模块入口](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/lib.rs)、[供应商服务](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/services/provider/mod.rs)、[许可证](https://github.com/farion1231/cc-switch/blob/main/LICENSE)。

推论：它适合快速扩展少数已支持工具，但若要持续维护大量编辑器、插件和 Agent，每增加工具可能涉及类型、配置服务与界面联动。未做全仓调用分析，不能据此断言其所有扩展都困难。

## 推荐决策

独立建立 AllSetting 的工具目录、检测器和适配器层；桌面采用 Tauri 2 + React + TypeScript + Rust。借鉴已验证的处理方式，按需复用且保留许可，不整体 fork 为首版产品。后续若完整源码评估证明复用更省成本，可调整该决策。

本机检测到 Node、npm、pnpm；本次 PATH 未发现 cargo/rustc，不能宣称已具备桌面构建环境。开发阶段先完成独立核心和界面，再补齐 Rust 与 Windows 构建依赖。

## 核心数据关系

ProviderProfile：名称、供应商、计费类型、端点、协议、模型、密钥引用。

ToolDefinition：稳定 ID、官方来源、别名、平台、检测规则、安装指引、适配器和已验证版本。

Installation：设备、工具 ID、实际路径、版本、检测证据和置信度。

Binding：工具安装实例、ProviderProfile、模型映射、作用域、默认状态。

ChangePlan：目标文件、修改前哈希、脱敏差异、备份、适配器版本、执行结果。

一份 API 可分配给多个工具；每个工具单独指定默认配置。供应商参数更新后计算受影响的绑定，再批量生成变更。

## 适配器合同

detect → inspect → validate → plan → apply → verify → rollback。

目录元数据可更新；配置写入逻辑随软件版本发布。第一版不允许远端目录任意执行脚本。

detect 组合 PATH、安装记录、可执行文件、配置痕迹和插件目录；配置存在只能证明有痕迹。版本命令必须限时，不能因为扫描而启动交互式 Agent。Windows 原生与 WSL 安装分别展示。

plan 保留未知字段，区分全局与项目配置；apply 前复核文件哈希，出现并发修改则停止该项。每个文件先备份，再临时写入与替换；多文件更新记录部分成功并按需回滚，不宣称跨文件原子事务。

密钥主库使用系统凭据存储。目标工具必须使用明文文件时，界面如实说明存储位置并限制文件权限；不能宣称密钥永不落地。日志、预览和故障报告全部脱敏。迁移包需要独立密码加密，不能直接搬运设备绑定的凭据库。

## 其他项目

- [aide](https://github.com/jskswamy/aide)：参考项目与 Agent、凭据的关联，以及命令发现。
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)：代理层参考，第一版不集成。
- [LiteLLM](https://github.com/BerriAI/litellm)：多供应商网关参考，第一版不集成。

上述项目没有经过运行或完整安全审计。正式引入前需单独核对版本、依赖、许可证和所用接口。
