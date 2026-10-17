# v0.10.2 OpenCode Go 会话兼容

用户报告 DeepSeek Harness、Reasonix Studio 返回缺少 x-opencode-session 的 HTTP 400。

Reasonix Studio 2.42.0 的自动 Go 身份逻辑识别 opencode.ai/zen/go 路径，但原先生成的配置使用 /inference/go 路径，因此不会触发自动身份处理。Reasonix 适配器现在将已知 Go Chat / Responses / Anthropic 路由映射到 OpenCode 官方维护的对应 /zen/go 兼容入口，由 Reasonix 原生引擎生成会话标识及客户端标识。保留实际模型 ID、协议、凭据、默认模型和可选列表；不写入固定全局会话 ID。不匹配其他主机、普通按量接口、含查询参数或未知路径。

已有 Reasonix 配置已通过星桥的备份、预览与应用流程修复，连接库校验和未变化。新增适配器修订标识，使旧应用记录提示重新应用。

验证：46 项测试通过；本地 Reasonix 原生 CLI 虚拟凭据与回环代理测试捕获三种协议的会话头与 Reasonix 客户端标识。Chat 重试保持同一个会话头。测试 HTTP 请求全部由回环代理返回模拟错误，未调用真实 Go 推理接口。CLI 与 Studio 均为 2.42.0；此测试验证协议请求构造，不代表线上账号权限或会话上下文已验证。

DeepSeek Harness 本机版本 0.2.0-rc.2，默认配置是内置 opencode-go，默认 mimo-v2.6-flash，未显式覆盖协议。使用其安装包中的实际 PiAiAdapter 和原生 Go Provider 配合本地模拟服务，三种协议均正确发送会话头；同会话两次请求一致，不同会话不同，并保留 deepseek-harness 客户端标识。没有复现用户反馈的 Harness 400；不据此宣称所有旧会话、辅助请求及模型路径已修复，也未修改 Harness 的软件代码或凭据。应重新启动后新建会话复查，仍失败时需定位具体模型和请求路径。

公开资料：

- [OpenCode Go 客户端要求](https://opencode.ai/docs/go/#where-can-i-use-it)
- [OpenCode 官方兼容路由转发](https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/lib/inference-proxy.ts)
- [Reasonix Go 会话标识处理](https://github.com/esengine/DeepSeek-Reasonix/blob/studio/internal/contract/provider/opencode_session.go)
- [Harness 上游跟踪](https://github.com/deepseek-ai/deepseek-harness/discussions/5495)

research/go-session 中仅保留使用虚拟凭据的检查脚本，不包含用户配置和密钥，不随安装包发布。
