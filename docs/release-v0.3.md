# v0.3 — UI UX Pro Max redesign

已安装技能：C:/Users/hushu/.codex/skills/ui-ux-pro-max，来源 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill 。使用官方 skill-installer 下载 .claude/skills/ui-ux-pro-max，包含检索脚本、数据与参考规则。

设计决策记录在 design-system/allsetting/MASTER.md。界面改为石墨暗色与薄荷绿强调，统一 SVG、导航选中语义、按钮尺寸、表单与状态标签；连接区使用单列配置列表和工作流侧栏。移除之前累加的 CSS，用统一语义颜色与间距重建样式。无远程字体依赖。

核验：1440/1024 CSS 像素与 125% 缩放均无横向溢出；导航 aria-current 正常。截图人工检查通过。正文/表面对比度 14.90，次文/表面 8.80，辅助文/高层表面 5.95，按钮文字/主色 10.15。仅检查以上代表性配色，未声称完成所有 WCAG 项目的完整审计。减少动态偏好有样式处理。

已在隔离用户目录内验证打包版新增套餐和分配工具，使用虚拟凭据，不污染用户正式库。原有 6 项测试继续通过。

本轮功能范围未扩大：分配仍为 AllSetting 内预设，尚未写入工具配置。
