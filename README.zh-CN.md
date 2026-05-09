# 🔖 Favewise · 悦藏™

**让书签重新有用起来。**

[🇺🇸 English](./README.md) · [隐私](./PRIVACY.zh-CN.md) · [安全](./SECURITY.zh-CN.md) · [许可证](./LICENSE) · [商标](./TRADEMARK.md) · [更新记录](./CHANGELOG.md)

---

> **商标声明。** "Favewise™"、文字标识、图标,以及配色(铜色 `#CC785C` + 暖米灰 `#FAF9F5`)是 Callum([@0xca1x](https://github.com/0xca1x))的未注册商标,由 JoyX 运营使用。首次公开使用:2026-05-09。代码采用 AGPL-3.0,欢迎按该协议 fork,但**必须改名改标识**。完整政策见 [TRADEMARK.md](./TRADEMARK.md)。

Favewise · 悦藏是一款本地优先、零账号的浏览器扩展,**站在浏览器原生书签旁边**配合工作 —— 它不接管保存流程,只负责把你多年攒下的那一堆帮你理清。支持 Chrome、Edge 和 Firefox。

## 项目状态

Favewise 1.0.0 是首次公开版本。Chrome 和 Edge 使用 Manifest V3；Firefox 当前使用 WXT 的 Firefox MV2 构建。

## ✨ 功能

- 🔗 **死链检测** — 标记 404、超时、可疑跳转;能区分真失效和登录 / SSO / VPN 门户重定向。
- 🧮 **去重** — 标准化 URL 匹配(去 UTM 参数、`www`、尾部斜线),支持"保留最新 / 保留最旧",或用**安全文件夹**一键批量处理上千条。
- 🧠 **智能整理** — 按站点**功能**聚类(代码、安全审计、DeFi、研究论文、开发工具…)。基于内置 ~300 个域名的分类表。
- 📥 **新书签收件箱** — 你刚 ⭐ 一个页面,Favewise 立刻归类并弹出一键"移动到 X?"建议。
- ✨ **回顾** — 浮出积灰的老书签,带个性化理由("从未访问过"、"你在 X 收藏了 N 条"、"3 年前收藏")。
- 🧹 **空文件夹清扫** — 找出整棵子树都没书签的空夹并删除。
- 🛡 **受保护文件夹** — 手动整理好的子树可标为"受保护", Favewise 永远不会建议移动、回收或改动其中任何东西。
- 📊 **洞察** — 年龄分布、主要域名、死链率、分类表覆盖率,一眼看懂书签库健康状况。
- 🗂 **书签库浏览器** — 浏览整棵树、拖拽排序(文件夹也能拖)、右键完整 CRUD、改名、建子文件夹。**所有改动实时同步到浏览器原生书签。**

## 🛡 隐私设计

- **无账号、无埋点、不会上传到 JoyX 服务器。**聚类用内置站点分类表。死链检测是唯一会访问书签 URL 的功能,且只在你主动开始检查后发生。
- **永不永久删除。**破坏性操作走可恢复回收站,5 秒 Undo 提示兜底。
- **只整理、不保管。**浏览器的 ⭐ 继续负责创建书签, Favewise 处理后续一切。

完整声明:[PRIVACY.zh-CN.md](./PRIVACY.zh-CN.md)。

## 权限说明

Favewise 只请求运行所需的权限：

| 权限 | 用途 |
|---|---|
| `bookmarks` | 在你使用整理、去重、回收、恢复、改名、拖拽排序等功能时读取和更新浏览器书签树。 |
| `storage` / `unlimitedStorage` | 在本地保存扫描结果、撤销/回收站状态、设置、受保护文件夹、标签和分析缓存，不上传到 JoyX 服务器。 |
| `sidePanel` | 打开 Chrome/Edge 的主侧边栏界面。 |
| `activeTab` | 在用户手势后读取当前标签页标题和 URL，用于快速保存流程。 |
| `favicon` | 在 Chrome/Edge 界面中显示浏览器管理的站点图标。 |
| `alarms` | 运行用户启用的定时本地扫描。 |
| 可选 `<all_urls>` | 仅在用户启动死链检测时请求，用于检查书签中的 HTTP(S) URL。本地、私有和非 HTTP(S) URL 会跳过。 |

Firefox 当前 MV2 构建未使用 optional host permissions，因此需要在 manifest 中声明 `<all_urls>`。

## 🚀 安装

**本地加载(开发者模式):**

```bash
pnpm install
pnpm build          # Chrome / Edge
pnpm build:firefox  # Firefox
```

- **Chrome / Edge:** 打开 `chrome://extensions`(或 `edge://extensions`) → 开启"开发者模式" → **加载已解压的扩展程序** → 选 `.output/chrome-mv3`
- **Firefox:** 打开 `about:debugging#/runtime/this-firefox` → **临时载入附加组件** → 选 `.output/firefox-mv2` 中的任意文件

## 🧰 快捷键

| 操作 | 快捷键 |
|---|---|
| 打开命令面板 | `⌘K` / `Ctrl+K` |
| 快捷键与提示 | `?` |
| 地址栏搜索书签 | `fave` ␣ 搜索词 |
| 地址栏跳转视图 | `fave` ␣ `:dashboard` / `:library` / `:organize` / … |
| 书签库键盘导航 | `j/k` 或 `↑/↓`,`h/l` 折叠 / 展开,`Enter`、`Space`、`Delete` |
| 书签库区间选择 | 按住 Shift 点书签,即可从上次点的位置扩选到当前行 |

## 🏗 技术栈

- [WXT](https://wxt.dev/)(Chrome / Edge MV3, Firefox MV2 build)+ React 19 + TypeScript 6
- Radix UI + Tailwind CSS v4
- 铜色 + 暖米灰产品配色，完整明暗主题，shadcn 风组件约定

## 🧪 开发

```bash
pnpm dev              # Chrome / Edge 热重载
pnpm dev:firefox      # Firefox 热重载
pnpm compile          # tsc --noEmit
pnpm test             # vitest(单元测试)
pnpm e2e              # Playwright 侧边栏自动化(用隔离 profile)
pnpm build            # 生产构建 → .output/chrome-mv3
pnpm zip              # Chrome / Edge 商店打包 zip
pnpm zip:firefox      # Firefox 商店打包 zip
```

e2e 的截图和逐视图日志会出现在 `test-results/`。

## ⚠️ 免责声明

Favewise 会修改浏览器的书签数据。**首次使用前请通过浏览器的书签导出功能先备份一次。**对于非预期的数据丢失,开发者与 JoyX 不承担责任。

校园门户、SSO 流程、CAS 网关、VPN 页面在自动 HEAD 检查下可能被识别成"可疑"链接,删除前请先看看**可疑**分页。

## 📄 许可 & 商标

- **代码:** [GNU AGPL v3](./LICENSE)。欢迎 fork 与修改,前提是 fork 同样以 AGPL-3.0 发布**并**按商标政策更名 / 换标识。
- **商标:** "Favewise™"、文字标识、图标与配色 —— 详见 [TRADEMARK.md](./TRADEMARK.md)。
- **版权:** 个人持有者为 Callum,JoyX 为运营方而非所有者。相关条款见 [COPYRIGHT.zh-CN.md](./COPYRIGHT.zh-CN.md)、[CLA.zh-CN.md](./CLA.zh-CN.md)、[LEGAL-SIGNOFF.zh-CN.md](./LEGAL-SIGNOFF.zh-CN.md)。

## 🤝 参与贡献

详见 [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md) 及其引用的文件。

## 🧯 支持与安全

- 产品问题和 bug：[GitHub Issues](https://github.com/joyxhq/favewise/issues)
- 安全漏洞报告：见 [SECURITY.zh-CN.md](./SECURITY.zh-CN.md)
- 隐私问题：`privacy@joyx.io`
