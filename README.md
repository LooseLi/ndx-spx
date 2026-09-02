# 纳指100 / 标普500 场外基金额度监控

跟踪纳斯达克100与标普500场外基金（QDII）的申购状态和单日限额，**额度放开时第一时间推送到飞书或微信**。

场外 QDII 常年受外汇额度管制，大部分时间限购到 10 元/天甚至直接暂停。额度放开往往只持续几天且没有预告，所以这个项目的重点是提醒的时效性，网页只是顺带的看板。

## 功能

- 自动维护基金池，覆盖全市场纳指100 / 标普500 场外基金（当前 82 只，含人民币与美元份额）
- 定时抓取每只基金的申购状态、单日累计限额、申购起点、定投状态
- 与上次快照比对，识别代销恢复申购、代销额度升降、暂停申购、直销开放等变更
- 页面标注代销额度与仅直销份额；推送只报变更和当前最宽松的代销额度，详情去网页看
- 变更推送到飞书 / 企业微信 / 个人微信，无变更时完全静默
- 静态网页展示当前全部额度与近期变动，支持按指数、币种、可申购状态筛选
- 每日快照进 git，历史可追溯

## 快速开始

```bash
npm install
npm run pool         # 构建基金池，生成 data/pool.json
npm run track        # 抓取一次，首次运行只建立基线不推送
npm run dev          # 本地预览网页 http://localhost:3000
```

其他命令：

```bash
npm run track:dry        # 只抓取和比对，不写文件不推送
npm run notify:preview   # 预览推送消息长什么样
npm run notify:test      # 向已配置渠道真实发一条测试消息
npm test                 # 跑 diff 逻辑测试
```

## 配置推送

复制 `.env.example` 为 `.env` 填写，本地用 `npm run notify:test` 验证。部署到 GitHub Actions 时把同名变量填到仓库的 Secrets 里。

推荐**飞书自定义机器人**，获取步骤：

1. 飞书里新建一个群（可以只有自己，用来当通知收件箱）
2. 群右上角 `···` → 设置 → 群机器人 → 添加机器人 → 选「自定义机器人」
3. 填名称如"基金额度提醒"，下一步会给出一个 `https://open.feishu.cn/open-apis/bot/v2/hook/xxxx` 地址
4. 复制该地址填到 `FEISHU_WEBHOOK`

「安全设置」三个选项按需处理：**签名校验**需把密钥填到 `FEISHU_SECRET`；**自定义关键词**要求消息里必须含该词，建议不填或填"额度"；IP 白名单在 GitHub Actions 上不可用（出口 IP 不固定），不要勾。

个人微信没有官方接口，需要经 [Server 酱](https://sct.ftqq.com) 或 [WxPusher](https://wxpusher.zjiecode.com) 中转，扫码绑定后填 key。

所有渠道都是配了才启用，一个渠道失败不影响其他渠道。新增渠道只要实现 `scripts/notifiers/types.ts` 里的 `Notifier` 接口并注册进 `scripts/notifiers/index.ts`，不用改抓取和比对逻辑。

## 部署

**抓取**由 Cloudflare Worker 在交易日北京时间 09:15 / 12:15 / 14:15 / 18:15 触发 GitHub Actions（`workflow_dispatch`）。配置步骤和 Worker 代码见 [docs/cloudflare-worker.md](docs/cloudflare-worker.md)。抓完把 `data/` 提交回仓库。GitHub 上也可手动 Run workflow，并可勾选同时重建基金池。

**网页**是纯静态导出，由 `.github/workflows/deploy.yml` 部署到 GitHub Pages。首次使用需要到 Settings → Pages 把 Source 选为「GitHub Actions」。人工 push 代码会触发部署；额度监控 bot 用 `GITHUB_TOKEN` push 数据不会触发 push 事件，因此在监控 workflow 完成后通过 `workflow_run` 自动衔接部署。

默认地址是 `https://<用户名>.github.io/ndx-spx/`。但如果账号下的 `<用户名>.github.io` 仓库绑定了自定义域名，GitHub 会让所有 project site 都走那个域名，地址变成 `https://<自定义域名>/ndx-spx/`——路径部分不变，所以 `BASE_PATH` 无需调整。本项目当前部署在 https://resume.looseli.top/ndx-spx/ 。

页面地址确定后，建议到 Settings → Secrets and variables → Actions → **Variables** 添加 `SITE_URL`（注意是 Variables 不是 Secrets，它不敏感），值为页面地址，这样推送消息末尾会带上可点击的链接。

Pages 的 project site 在子路径下，所以构建时通过 `BASE_PATH=/ndx-spx` 给资源加前缀，漏掉会导致 JS/CSS 全部 404；产物里还要有 `.nojekyll`，否则 Jekyll 会忽略 `_next` 目录。这两点 workflow 里都处理了。

改用 Vercel 的话（private 仓库免费账户不能用 Pages，需要 Vercel），导入仓库即可，此时部署在根路径，要把 `BASE_PATH` 留空。

## 数据源

数据来自天天基金移动端公开接口：

```
https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBasicInformation?FCODE=040046
```

关键字段 `SGZT`（申购状态）、`MAXSG`（单日累计限额）、`MINSG`（申购起点）、`DTZT`（定投状态）、`BUY`（该渠道是否可买）。

接口有几个坑，改代码前建议先看 `scripts/lib/eastmoney.ts` 里的注释：

1. `MAXSG` 用 `100000000000`（1000 亿）表示不限额，而不是留空
2. **暂停申购时 `MAXSG` 会残留上一次的额度值**，必须按状态覆盖成 0，否则会把买不进去的基金报成"可买 100 元"
3. **状态文案会和 `BUY` 打架**：F、I 类份额常见 `SGZT` 写着"限大额"但 `BUY=false` 且 `MAXSG='--'`。原因是这些份额只在基金公司自家 App 卖，代销渠道拿不到额度，**并非基金暂停申购**。本项目把这类归为独立状态 `direct_only` 而不是 `suspended`——场外额度紧张时直销往往比代销宽松，标成暂停会让人错过唯一买得进去的通道
4. `direct_only` 的 `limit` 恒为 `null`，语义是"拿不到"而非"不限额"。展示和比对都必须走 `formatFundLimit()` 之类的状态分支，直接格式化会把买不到的渠道显示成额度无限制
5. 明确"限大额"却取不到额度数值时，状态降级为 `unknown` 并在比对时跳过，避免误报成利好
6. 天天基金的基金分类互斥，纳指/标普场外基金主要落在"指数型(zs)"而不是"QDII"分类下，构建基金池时容易漏

比对逻辑还有两条防误报设计：抓取失败率超过 30% 时直接放弃本轮、不写入基线（否则下一轮会把缺失基金当成新增或额度归零疯狂误报）；任一侧状态为 `unknown` 的基金跳过比对。

## 目录结构

```
lib/            前后端共享的类型与格式化
scripts/
  build-pool.ts   构建基金池
  track.ts        主任务：抓取 -> 比对 -> 推送 -> 落盘
  notify-test.ts  推送自检
  lib/            接口封装、比对引擎及其测试
  notifiers/      推送渠道，按 Notifier 接口实现
app/            Next.js 页面
components/     页面组件
data/
  pool.json       基金池，可手工校订，重建时保留人工新增条目
  latest.json     最新快照，作为下次比对的基线
  changes.json    变更事件日志，网页时间线用
  history/        每日快照
```

## 免责声明

额度数据来自第三方公开接口，可能存在延迟或错误，基金公司公告通常早于接口更新。实际能否申购及具体额度请以基金公司公告和销售平台为准。本项目仅做信息聚合，不构成任何投资建议。
