# 小程序国际化（i18n）实施方案

> 决策：自研轻量 i18n（语言包 + WXS 查表 + TS 层 `t()`），中英文案与 letletme-web `messages/` 对齐复用，不重新翻译。
>
> 本文是实施方案，不代表任何页面已经完成改造。
>
> 原稿写在 `codex/miniprogram-performance-audit-docs`。2026-08-18 已按明确要求合入 `main`。

## 1. 背景与现状盘点

2026-08-14 对当前代码的实际扫描结果：

| 项目 | 现状 |
|---|---|
| 页面 | 27 个注册路由（`app.json`） |
| 组件 | 14+ 个（含自定义 `bottomNavBar`，vant 仅此一处使用） |
| 页面标题 | 25 个页面 `.json` 含中文 `navigationBarTitleText` |
| 中文文案规模 | 约 500–1000 条独立中文串（wxml 文本/属性、ts 错误提示/toast/标签、组件默认 props、工具格式化） |
| 现有 i18n 设施 | 零（无 i18n 库、无 computed/behavior 体系） |
| 工程基础 | TypeScript、`utils/` 23 个模块、`getApp().globalData` 模式成熟、`tests/*.test.ts` 单测体系、`scripts/check-style-drift.mjs` 防回归先例 |

现成落点：`utils/i18n.ts` 放 TS 层逻辑、`globalData.locale` 放当前语言、`bottomNavBar` 单组件集中改标签。

## 2. 方案选型

### 2.1 不采用官方 `miniprogram-i18n`

官方仓库 `wechat-miniprogram/miniprogram-i18n` 已多年停止活跃维护，公认痛点：

- 依赖 Gulp 构建语言包，改文案必须重新构建，不能热更；
- 全语言集中打包，占用主包体积；
- 不支持 Skyline 渲染引擎；
- 对目录结构有侵入要求，老项目改造成本高。

### 2.2 不引入跨端框架

项目为原生小程序 + TypeScript，工程体系（lint/typecheck/test/check:style）已成型。为 i18n 引入 Taro/uni-app/Mpx 的收益远小于迁移成本。

### 2.3 采用自研轻量方案

```text
miniprogram/i18n/
  locales/zh-CN.ts        # 中文真相源（嵌套对象，namespace 与 web 对齐）
  locales/en-US.ts        # 英文真相源
  index.ts                # TS 层：t() / getLocale() / setLocale() / 最小 ICU
  i18n.wxs                # 构建产物（入库），供 wxml 查表
scripts/build-i18n-wxs.mjs  # 语言包 -> i18n.wxs 生成脚本
scripts/check-i18n.mjs      # 防回归校验（见第 7 节）
tests/i18n.test.ts          # t() 插值/fallback/plural 单测
```

两条使用路径：

| 路径 | 覆盖场景 | 机制 |
|---|---|---|
| WXML 查表 | 模板静态文案（占大头） | `<wxs module="t">` + `{{t.t('ns.key', locale)}}` |
| TS 层 `t()` | toast、错误提示、`setNavigationBarTitle`、动态拼接、日期格式化 | `import { t } from '../../utils/i18n'` |

## 3. 与 web 文案对齐规范

web 仓库（letletme-web）家底，2026-08-14 实测：

- `next-intl`，`messages/en.json` + `messages/zh-CN.json`；
- **2,233 个 leaf keys，中英 key 结构 1:1 严格对齐**；
- 约 78% 为 FPL 领域通用词条，与小程序页面域高度重叠：PlayerStats 352 / TeamStats 171 / TournamentStats 157 / LiveTournament 141 / TournamentCreate 143 / Market 125 / LivePoints 109 / Fixtures 84 / Selections 78；
- 术语已经过 codex review + 两轮润色定稿（你/持有率/道具/身价/对战/GW{n}/全角括号）。

对齐规则：

1. **namespace 与 key 命名沿用 web**（如 `Market.title`、`LivePoints.*`、`Common.*`、`Navigation.*`、`States.*`），小程序特有领域才新建 namespace（候选：`TabBar`、`Binding`、`PerfMonitor`）。
2. **占位符变量名与 web 一致**（`{count}`、`{email}`、`{id}`），同一 key 中英占位符必须相同。
3. **value 匹配优先复用**：小程序中文串与 web `zh-CN.json` value 相同（或仅大小写/标点差异）时，直接复用 web 的 key 与英文翻译，不新造。
4. **新增 key 必须 zh/en 1:1**，由 `check:i18n` 强制（见第 7 节）。
5. **新译文案遵循既定术语清单**，不偏离 web 已定结论。

匹配工作流：

```text
脚本拍平 web zh-CN.json -> value → key 索引
  -> 抽取小程序中文串逐条 exact match      # 命中：复用 web key，英文白拿
  -> 未命中走 fuzzy match -> 人工确认       # 近似：确认后复用或改写对齐
  -> 仍无匹配 -> 新 key，按术语规范补译英文
```

预估 60–80% 小程序中文串可命中或近似命中 web 词条，剩余为小程序特有短文案（tabbar 副标题、绑定流程、性能监控页等）。

## 4. 技术设计

### 4.1 locale 解析与切换

- `app.onLaunch` 解析优先级：`storage` 用户覆盖值 > `wx.getAppBaseInfo().language`；`zh*` → `zh-CN`，其余 → `en-US`（兜底）。
- 当前语言存 `globalData.locale`，页面 `data.locale` 在 `onLoad` 时读取（供 WXML WXS 查表使用）。
- 切换语言：写 storage → `wx.restartMiniProgram`（能力检测失败则 `wx.reLaunch` 回首页）。语言切换是低频操作，整站重建是最可靠的刷新方式，不做逐页热刷。

### 4.2 WXML 查表（WXS）

- `scripts/build-i18n-wxs.mjs` 把两个语言包 + 查表函数编译为 `miniprogram/i18n/i18n.wxs`，产物入库。
- 页面/组件 wxml 顶部引入：`<wxs module="t" src="<相对路径>/i18n/i18n.wxs" />`，文案写作 `{{t.t('Market.title', locale)}}`。
- WXS 是无状态沙箱（不能 require TS/JS、不能读 storage），语言包必须编译进 wxs；因此换语言后必须重建页面（与 4.1 的 restart 策略自洽）。
- 不采用 behavior 注入 `setData` 路线：全量语言包进 `setData` 体积不可接受，子集注入则每个页面要维护 key 清单，切换语言还需逐页重刷。

### 4.3 TS 层 `t()`

```ts
t('Market.title')                    // 查表，缺 key 回退中文再回退 key 本身
t('Auth.forgotSent', { email })      // {var} 插值
t('Common.playerCount', { count })   // 最小 ICU plural（one/other）
```

- `{var}` 插值与最小 plural 仅在 TS 层实现；WXS 层只支持 `{var}`。
- web 现有 8 处 ICU plural（已核实：`personalLeaguesCount`、`personalLeagueUp/Down`、`personalLeagueTeams`、`playerCount` 等，均为 `one/other` 形式）：若小程序用到这些 key，在 TS 层格式化后 `setData`，不进 WXS。

### 4.4 导航栏标题

25 个页面 `.json` 的静态 `navigationBarTitleText` 无法随语言切换。统一改为页面 `onShow` 中：

```ts
wx.setNavigationBarTitle({ title: t('LiveMatches.title') });
```

页面 `.json` 中的 `navigationBarTitleText` 保留中文作为首帧兜底（避免标题闪烁），`onShow` 覆盖。

### 4.5 日期与数字格式化

`utils/date.ts` 的 `WEEKDAYS`（周日…周六）、`年/月/日` 格式串等按 `getLocale()` 分支输出；其余 utils（`summary-format.ts` 等）抽取时逐文件处理。格式化函数不读全局可变状态的，改为接收 locale 参数或从 i18n 模块读取，抽取时逐个定夺并记录。

### 4.6 vant 与三方组件

vant 仅被 `bottomNavBar` 使用（`van-tabbar`），标签由组件 data 传入，无 vant 内部文案泄漏面。`bottomNavBar` 的菜单名/副标题（我的 FPL/实时/赛事/探索/性能、总览/球队/联赛等）在 TS 层用 `t()` 生成。

### 4.7 服务端动态文案

接口返回的中文（新闻、伤病、动态 phase 名等）**不在本方案范围**，不做映射层。列为明确债务，未来如需要再单独立项。

## 5. 执行分期与成本

```text
Gate 0 基建
  -> Gate 1 试点全链路
  -> Gate 2 分 Section 抽取映射
  -> Gate 3 新 key 补译与术语 review
  -> Gate 4 切换入口与全页面回归
```

| Gate | 内容 | 完成条件 | 估算 |
|---|---|---|---|
| 0 | `i18n/` 目录、语言包骨架、构建脚本、`t()`/插值/plural、locale 初始化、`check:i18n`、单测 | `npm run check:i18n` 与 `npm test` 通过 | 0.5–1 天 |
| 1 | 试点：home 页 + `bottomNavBar` + `app-error-state`，跑通 WXML 查表/标题/toast/日期四条路径 | 试点页无裸中文，中英文切换目检通过 | 0.5 天 |
| 2 | 按 Section 抽取（我的 FPL → 实时 → 赛事 → 探索 → 共享组件/utils），先跑 web value 匹配脚本再人工确认 | wxml/ts 无裸中文（check:i18n 白名单收敛为空） | 2–3 天 |
| 3 | 未命中 key 补译英文，对照术语清单 review，zh/en 1:1 校验 | `check:i18n` 全绿 | 0.5 天 |
| 4 | 语言切换入口（账户区）、restart 流程、25 页语义终态 smoke（口径复用性能 Checklist） | 双语言 25/25 页面 smoke 通过 | 0.5–1 天 |

**合计约 3.5–5.5 人日。** 翻译成本已被 web 对齐消掉大半，剩余主要是抽取体力活（Gate 2）。

分期原则沿用性能审计文档的约定：实施、提交和 review 按 Section 分包，不做"全站一把梭"的大 PR；每个 Section 包可独立回滚。

## 6. key 与占位符规范

1. 嵌套对象组织，namespace 对齐 web（`Common` / `Navigation` / `States` / `Filters` / `PlayerStats` / `Market` / `LivePoints` / `TeamStats` / `TournamentStats` / …）。
2. 整句进语言包，禁止代码里拼接半句（沿用 web 标点约定：中文语境全角括号由文案自带，不靠代码拼）。
3. 占位符 `{var}` 同名同义；含 plural 的 key 必须在注释或 key 清单中标注"仅 TS 层"。
4. 缺 key 行为：回退中文 → 再缺回退 key 字符串本身，并在 console 打 warning（生产静默）。

## 7. 防回归：`scripts/check-i18n.mjs`

照 `check-style-drift.mjs` 模式，提供 `npm run check:i18n`，校验：

- [ ] zh-CN 与 en-US 拍平后 key 集 1:1（多/少 key 即失败）；
- [ ] 同一 key 中英占位符变量名集合一致；
- [ ] `i18n.wxs` 产物与语言源同步（内容 hash 对比，防止手改产物或忘跑构建）；
- [ ] wxml 禁止裸中文文本节点/属性（白名单机制，Gate 2 期间逐步收敛）；
- [ ] 页面 `.json` 不再新增中文 `navigationBarTitleText`（存量随 Gate 2 转为 `setNavigationBarTitle`）。

## 8. 风险与边界

| 风险 | 应对 |
|---|---|
| WXS 能力限制（无递归、ES5 子集、无状态） | `t()` 保持纯查表 + 插值；复杂格式化一律在 TS 层做完 `setData` |
| ICU plural 仅 8 处且 WXS 不支持 | TS 层实现最小 one/other；涉及 key 标注"仅 TS 层" |
| 语言包体积进主包 | 小程序只收录自己用到的 key（估 600–900 条，wxs 约几十 KB）；Gate 4 记录主包体积前后对照 |
| `wx.restartMiniProgram` 低基础库不可用 | 能力检测 + `wx.reLaunch` 兜底 |
| 标题首帧闪烁 | 页面 `.json` 保留中文标题兜底，`onShow` 覆盖 |
| `libVersion: trial` 与真机差异 | Gate 4 真机双语言验证（iOS/Android） |

明确不做：

- 服务端动态中文的映射层（新闻/伤病等）；
- RTL 语言与布局镜像；
- 第三种语言（架构上加语言 = 加一个语言包文件 + check 自动覆盖，但本轮不做）；
- 语言自动检测之外的"智能"推荐逻辑。

## 9. 验证与回归口径

- 单测：`tests/i18n.test.ts` 覆盖查表、fallback 链、`{var}` 插值、plural one/other、缺 key warning。
- 页面回归：复用《小程序全页面性能排查执行 Checklist》的语义终态口径，双语言各跑 25/25 页面 smoke（最终渲染状态、错误态、空态、异常网络）。
- 真机：P0 页面（home、live、我的 FPL）iOS/Android 双语言冷启 + 切换语言路径。

## 10. 文档与分支规则

- 本方案已按明确要求从 `codex/miniprogram-performance-audit-docs` 合入 `main`。
- 实施分支从执行时的最新 `main` 创建，commit 信息记录其与本方案文档的关系。
- Gate 2 的抽取映射结果（web 匹配率、新 key 清单）以独立 Run 记录追加，不覆盖本文。
