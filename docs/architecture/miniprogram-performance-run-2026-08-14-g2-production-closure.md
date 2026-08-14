# 小程序性能 Run：2026-08-14 G2 生产分段闭环

> 状态：G2-C 已完成生产 `client -> Web GraphQL proxy -> GraphQL` 同 request-ID 分段；G2-B 的 iOS/Android 真机项由用户在本轮明确选择跳过。
>
> Gate 2 当前为“本轮授权范围内检查闭环”，不是“产品验收全绿”。Refresh 门槛失败和已确认的正确性/语义缺陷继续保留为红色发现。
>
> 本 Run 只做正常公开查询、只读 Vercel Runtime Logs、只读 SSH/container logs 和两个精确 Redis manifest key 读取；没有改代码、部署、清缓存、改 TTL 或改生产数据。

## 1. 本轮决定与历史证据纠正

用户在 2026-08-14 明确决定：

1. iOS/Android 真机项本轮跳过；
2. 使用已有 SSH 能力读取生产 GraphQL runtime logs。

因此：

- iOS、Android 标记为 `⚪ 用户明确跳过`，不是 `🟢 通过`，也不以 DevTools 模拟器补证；
- 旧 Run 中“本机没有 VPS SSH 私钥/没有日志读取通道”的判断被本文件取代。旧判断只检查了空的 `ssh-agent`，没有识别本机已有的任务专用 identity；
- 任务专用 identity 已使用 `IdentitiesOnly=yes`、`BatchMode=yes` 和严格 host-key 校验成功连接 `deploy@VPS`；没有输出、复制或修改私钥内容；
- 用户的跳过决定只关闭本轮检查范围。若未来发布标准仍要求真机，必须另建 iOS/Android Run，不能回填成通过。

## 2. 生产冻结

采样前后确认的是同一组运行版本：

| 层 | 冻结值 | 证据 |
|---|---|---|
| Mini | `ca8fcac430411823f0c659de81f0938c089b824e` | `codex/miniprogram-performance-g2-observability` tracked clean |
| Web 采样版本 | deployment `dpl_5eDGHmMTrNppjj2A4LPi1MAMQSEJ`；Git `0e943401ac144d6f3c70a24c37a895aa09f40f3b`；`READY`；`sin1` | 30 条成功样本的 Runtime Logs 均为该 deployment |
| Web proxy blob | `d48b53d1d663c9f84b3d97ba3d2c51d4099ef68b` | 当前 Web SHA 与前序 `e3480e0d...`、`ecea1a3f...` 的 `app/api/graphql/route.ts` blob 相同 |
| Web 采样后部署 | `dpl_Bfu1eCa95ivWxt5CymhTt2kMrBdm`；Git `33674993b28f9122889a79a46f50452374e54413`；ready `2026-08-14T10:31:12.086Z` | 最终审计时已成为 production；proxy blob 仍为 `d48b53d1...` |
| GraphQL | deploy run `31777549843`；Git `bb444163416b8500efb0b7c707c8a3ca54ecae25` | deploy 成功于 `2026-08-14T06:48:41Z` |
| GraphQL image | `sha256:958da0880ce30527a4971bb3c85eed3554ae680be10d165a23a26e081392ece5` | 采样前后只有一个 compose `graphql` container，状态 `running/healthy` |
| GraphQL container | `26524fe90aed...`；started `2026-08-14T06:48:30.158Z` | `/health` 为 Redis/PostgreSQL/season 全部 `ok` |
| Core publication | season `2627`；revision `4`；state `active` | 只读精确 key `llm:data:fpl:core:2627:active` |
| Market publication | season `2627`；revision `5`；state `active` | 只读精确 key `llm:data:fpl:market:2627:active` |

GraphQL image 的 OCI `revision` label 来自 Bun base image，不能当应用 Git SHA。应用 SHA 使用同一时间的成功 deploy run `headSha`、远端 clean worktree 和实际运行 image digest 三者固定。

采样使用的 Web deployment 是前序 G5 之后的新部署；采样结束后 Web 又发布 `33674993...`。两次变化中 Mini 使用的 GraphQL proxy blob 均未变化，GraphQL SHA、Core/Market revision 和 Mini SHA 也未变化。因此 30 条样本仍是同一 deployment 内的有效冻结分布，但不与采样后 deployment 的 runtime 样本混算；也不把 Web 页面/测试提交误写成 Mini transport 变化或新一轮 25-page 真机验收。

## 3. 采样设计与关联完整性

所有请求从 Perth 经生产 `https://www.letletme.top/api/graphql` 发起，使用合法唯一 `X-Request-Id`：

| operation | 成功 request IDs | 条件 | 业务结果 |
|---|---|---|---|
| `GetPlayerValues` | `g4-gpv-20260814-01` 到 `-10` | `changeDate=2026-08-14` | 10/10 HTTP 200；0 rows；合法当前空态 |
| `FixtureWindow` | `g4-fw-20260814-01` 到 `-10` | event 1-5，固定 5 aliases | 10/10 HTTP 200；每个 alias 10 rows |
| `PlayersForPicker` | `g4-pfpb-20260814-01` 到 `-10` | `search=Saka`、limit 50 | 10/10 HTTP 200；2 rows / total 2 |

成功分布为 `30/30`：

- client response 全部回显相同 request ID；
- Vercel `graphql_proxy_timing` 每个 ID 恰好 1 条，且全部来自同一 Web deployment；
- VPS `GraphQL request timing` 每个 ID 恰好 1 条，且全部来自同一 GraphQL container/image；
- HTTP failure、GraphQL error、request-ID mismatch、敏感 query/variables/token 日志均为 0；
- 下表按 request-ID 数字后缀从 `01` 到 `10` 保留原始顺序，单位均为 ms。

| operation | client total 01 -> 10 | Web total 01 -> 10 | Web upstream 01 -> 10 | GraphQL total 01 -> 10 |
|---|---|---|---|---|
| `GetPlayerValues` | `2612.99, 309.85, 325.33, 228.36, 240.80, 238.11, 265.12, 264.50, 283.48, 351.45` | `755.49, 64.48, 39.98, 29.20, 35.21, 32.95, 33.52, 31.20, 37.08, 27.01` | `736.90, 62.92, 29.73, 27.89, 33.76, 31.87, 32.58, 30.00, 35.61, 26.00` | `443.52, 11.43, 10.45, 10.00, 10.51, 10.02, 9.91, 11.17, 9.93, 10.48` |
| `FixtureWindow` | `237.43, 222.68, 309.62, 275.73, 234.92, 220.81, 238.78, 226.70, 239.64, 223.98` | `44.55, 33.51, 36.81, 34.27, 34.99, 30.16, 36.20, 34.43, 32.06, 34.84` | `41.69, 31.90, 34.97, 32.68, 33.21, 28.67, 34.78, 32.88, 30.13, 32.96` | `20.72, 13.40, 13.53, 13.67, 12.55, 12.07, 12.95, 13.40, 12.78, 14.30` |
| `PlayersForPicker` | `640.27, 235.08, 288.02, 234.61, 213.62, 278.00, 226.75, 249.93, 225.53, 227.80` | `386.90, 28.12, 37.32, 40.98, 26.87, 29.41, 33.11, 28.23, 26.27, 28.02` | `384.48, 26.48, 35.67, 38.42, 25.23, 27.79, 30.42, 26.54, 24.85, 25.91` | `325.33, 10.27, 17.95, 10.25, 9.82, 10.46, 10.50, 10.39, 10.30, 9.93` |

## 4. 冷/热与分位数

分位数沿用项目的 nearest-rank 口径。`n=10` 的 p95 等于该组最大值；为避免首样本掩盖稳定态，同时单列首样本和随后 9 次同批暖样本。

| operation / 层 | 首样本 | 全部 n=10 p50 / p95 / max | 后 9 次 p50 / p95 / max |
|---|---:|---:|---:|
| `GetPlayerValues` client | 2612.99 | 265.12 / 2612.99 / 2612.99 | 265.12 / 351.45 / 351.45 |
| `GetPlayerValues` Web total | 755.49 | 33.52 / 755.49 / 755.49 | 33.52 / 64.48 / 64.48 |
| `GetPlayerValues` Web upstream | 736.90 | 31.87 / 736.90 / 736.90 | 31.87 / 62.92 / 62.92 |
| `GetPlayerValues` GraphQL | 443.52 | 10.45 / 443.52 / 443.52 | 10.45 / 11.43 / 11.43 |
| `FixtureWindow` client | 237.43 | 234.92 / 309.62 / 309.62 | 234.92 / 309.62 / 309.62 |
| `FixtureWindow` Web total | 44.55 | 34.43 / 44.55 / 44.55 | 34.43 / 36.81 / 36.81 |
| `FixtureWindow` Web upstream | 41.69 | 32.88 / 41.69 / 41.69 | 32.88 / 34.97 / 34.97 |
| `FixtureWindow` GraphQL | 20.72 | 13.40 / 20.72 / 20.72 | 13.40 / 14.30 / 14.30 |
| `PlayersForPicker` client | 640.27 | 234.61 / 640.27 / 640.27 | 234.61 / 288.02 / 288.02 |
| `PlayersForPicker` Web total | 386.90 | 28.23 / 386.90 / 386.90 | 28.23 / 40.98 / 40.98 |
| `PlayersForPicker` Web upstream | 384.48 | 26.54 / 384.48 / 384.48 | 26.54 / 38.42 / 38.42 |
| `PlayersForPicker` GraphQL | 325.33 | 10.30 / 325.33 / 325.33 | 10.30 / 17.95 / 17.95 |

这里的“首样本”是同一冻结版本下该 operation 的首个样本，不自动等同进程冷启动。只有 stage 明确出现 cache miss/DB 才按该路径归因。

## 5. GraphQL 内部分段结论

| operation | 首样本关键 stage | 暖态关键 stage | 结论 |
|---|---|---|---|
| `GetPlayerValues` | `databaseChanges=424.61`、`cacheWrite=1.80`、Apollo `433.57` | `cacheRead` p50 `1.49`、p95 `1.56`；Apollo p50 `2.27`、p95 `2.83`；GraphQL total p95 `11.43` | 冷首样本的主应用成本已证实在 reporting DB path；暖 negative cache 正常 |
| `FixtureWindow` | GraphQL `20.72`；Apollo `15.43` | GraphQL p50 `13.40`、p95 `14.30`；Apollo p50 `7.89`、p95 `9.09` | GraphQL 稳定；`fixtures.coreAcquisition` 是 5 个并行 aliases 的累计 stage，不能当 wall-clock |
| `PlayersForPicker` | GraphQL `325.33`；Apollo `320.28` | GraphQL p50 `10.30`、p95 `17.95`；Apollo p50 `5.56`、p95 `9.12` | 正常有结果条件暖态稳定；首样本慢落在 Apollo execute，但现有日志没有 picker repository/SQL 子 stage，不能继续给 SQL 定责 |

新的生产证据把此前“Web upstream 慢”的大盒子拆开：

1. `GetPlayerValues` 首样本中，Web upstream `736.90`、GraphQL `443.52`，其中 `databaseChanges=424.61`；同时仍有约 `293ms` 位于 Web/VPS 往返和 GraphQL wall-clock 之外。冷慢同时包含 DB path 与跨服务段，不是二选一。
2. 同 operation 暖态 GraphQL p95 只有 `11.43ms`，Web upstream p95 `62.92ms`，Perth client p95 `351.45ms`。暖态端到端主要不能归到 resolver/SQL。
3. `FixtureWindow` 暖态 GraphQL p95 `14.30ms`、Web upstream p95 `34.97ms`，client p95 `309.62ms`；同样显示公网/edge/client 段大于应用执行。
4. `PlayersForPicker` 首样本的 GraphQL/Apollo 冷尾已确认，但 repository/SQL 子 stage 仍缺失。该缺口现在是精确到一个 resolver 的低范围观测改进项，不再是整个生产 GraphQL 日志不可见。

## 6. 额外捕获的复杂度加权限流边界

最初在一个 60 秒窗口内连续发送三组请求。前 20 条成功后，`g4-pfp-20260814-01` 到 `-10` 全部返回 429。它们不进入成功耗时分布，但提供了有效边界证据：

| 层 | 证据 |
|---|---|
| client | 10/10 回显相同 request ID；HTTP 429；GraphQL error `Too many requests` |
| Web | 10/10 有 `graphql_proxy_timing`；Web total `20.61–25.02ms`；`responseBodyOk=false` |
| GraphQL | 10/10 有 `GraphQL request timing`；`outcome=principal_admission_rejected`；total `4.34–4.98ms` |
| 定位 | `ingressClass=signed`、`rateLimitAudience=anonymous`；拒绝发生在 `principalAdmission`，没有进入 picker resolver |

GraphQL 使用 60 秒、复杂度加权的 admission budget，不能把“请求条数”直接等同额度。此结果纠正了“Web 匿名代理按 20 次限流”的初步判断：Web 只是转发上游 429，真正拒绝点在 GraphQL。窗口恢复后，新的 `g4-pfpb-*` 10 条全部成功。

后续生产性能脚本必须按 weighted budget 分批或使用合适的已授权测试主体；429 样本要单列，不得混入 resolver 性能分布。

## 7. G2 退出状态

| 条件 | 最终状态 |
|---|---|
| G2-A 观测契约 | 🟢 已完成 |
| G2-B DevTools 页面/身份/韧性/包体矩阵 | 🟢 已完成 |
| G2-B iOS 真机 | ⚪ 用户本轮明确跳过；无通过声明 |
| G2-B Android 真机 | ⚪ 用户本轮明确跳过；无通过声明 |
| G2-C Mini/client -> Web request ID | 🟢 30/30 |
| G2-C Web -> GraphQL request ID | 🟢 30/30 |
| G2-C GraphQL 内部分段 | 🟢 生产 stdout 已读取；3 类 operation 各 n=10 |
| Redis/Data publication 与 PostgreSQL 路径 | 🟢 manifest/revision 与既有只读 DB 证据闭合 |
| G2 检查闭环 | 🟢 按用户明确范围完成 |
| G2 产品性能全绿 | 🔴 五个 P0 Refresh 页面仍未达到既定门槛 |
| 任何优化实现 | ⚪ 本轮未授权 |

`miniprogram/config/mock-mode.ts` 不在根因路径，也不是退出条件。

## 8. 对后续优化方案的影响

优先级调整为：

1. `P0`：修 Mini Refresh 请求 ownership/重复强刷；五个失败页仍以现有 n=10 为回归基线。
2. `P0`：修 Players 无命中 count fallback 参数断层；本 Run 的正常有结果样本不覆盖该正确性缺陷。
3. `P0`：修 Live Tournament 将合法季前空态显示为网络错误的语义缺陷。
4. `P1`：Market 使用 publication revision 区分稳定空结果与未封口日期；当前暖 negative cache 已快，但冷 miss 仍有 DB path。
5. `P1`：为 `PlayersForPicker` 增加 repository/SQL 低基数 stage；现有 SSH/Vercel 查询方式可直接做修改前后同 request-ID 回归。
6. `P2`：再评估 Web/VPS keep-alive、连接复用或 region；先采更多跨时段样本，不能只凭首样本迁移架构。

本轮只把观测缺口变成了可证实结论，没有修改 Mini、Web、GraphQL、Data 或 PostgreSQL，也没有人工清理/修改 Redis；正常 GraphQL 读取按产品契约写入 query cache。产品红项必须在独立实现授权中逐个修复和回归。
