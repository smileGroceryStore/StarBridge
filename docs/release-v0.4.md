# v0.4 — 动漫暮色与玻璃拟态

根据用户明确指定的视觉方向，使用 UI UX Pro Max 的 glassmorphism 检索结果与 imagegen 原创背景插画重设计。背景资产位于 public/assets/anime-dusk.png，随安装包本地分发，不需要联网加载。

使用 backdrop-filter: blur(18px)、半透明紫色表面、细边框与内高光。侧栏采用 24px 模糊。渐变和动漫场景透过模糊层显现，表单、接口地址与模态框背景加深。提供 backdrop-filter 不支持时的实色回退，以及 prefers-reduced-transparency 样式。保留减少动画偏好支持。

验证：隔离目录内使用虚拟凭据完成新增和分配流程；1440、1024 宽度及 125% 缩放无横向溢出，已检查合成截图。玻璃主题的实际对比度依背景变化，不复用 v0.3 实色主题的对比度数值。

功能未扩大：API / 套餐库、工具只读扫描与分配预设保留，尚未写入 Agent 配置。
