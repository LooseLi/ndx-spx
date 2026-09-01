# 纳指100 / 标普500 场外基金额度监控

跟踪纳斯达克100与标普500场外基金（QDII）的申购状态和单日限额，**额度放开时第一时间推送到飞书或微信**。

场外 QDII 常年受外汇额度管制，大部分时间限购到 10 元/天甚至直接暂停。额度放开往往只持续几天且没有预告，所以这个项目的重点是提醒的时效性，网页只是顺带的看板。

## 功能

- 自动维护基金池，覆盖全市场纳指100 / 标普500 场外基金（当前 82 只，含人民币与美元份额）
- 定时抓取每只基金的申购状态、单日累计限额、申购起点、定投状态
- 与上次快照比对，识别恢复申购、额度提升、取消限额、额度下调、暂停申购、定投恢复
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

推荐**飞书自定义机器人**：群设置 → 群机器人 → 添加自定义机器人，复制 webhook 填到 `FEISHU_WEBHOOK` 即可，免审核、支持卡片。

个人微信没有官方接口，需要经 [Server 酱](https://sct.ftqq.com) 或 [WxPusher](https://wxpusher.zjiecode.com) 中转，扫码绑定后填 key。

所有渠道都是配了才启用，一个渠道失败不影响其他渠道。新增渠道只要实现 `scripts/notifiers/types.ts` 里的 `Notifier` 接口并注册进 `scripts/notifiers/index.ts`，不用改抓取和比对逻辑。

## 部署

**抓取**走 GitHub Actions，`.github/workflows/track.yml` 已配好，交易日北京时间 08:30 / 11:40 / 14:10 / 20:10 各跑一次，抓完把 `data/` 提交回仓库。手动触发时可勾选同时重建基金池。

**网页**是纯静态导出，仓库导入 Vercel 即可，Actions 提交数据后会自动触发重新部署。部署到 GitHub Pages 需要设置 `BASE_PATH` 环境变量为仓库名。

## 数据源

数据来自天天基金移动端公开接口：

```
https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBasicInformation?FCODE=040046
```

关键字段 `SGZT`（申购状态）、`MAXSG`（单日累计限额）、`MINSG`（申购起点）、`DTZT`（定投状态）、`BUY`（该渠道是否可买）。

接口有几个坑，改代码前建议先看 `scripts/lib/eastmoney.ts` 里的注释：

1. `MAXSG` 用 `100000000000`（1000 亿）表示不限额，而不是留空
2. **暂停申购时 `MAXSG` 会残留上一次的额度值**，必须按状态覆盖成 0，否则会把买不进去的基金报成"可买 100 元"
3. **状态文案会和 `BUY` 打架**：机构或特定渠道份额（I、F 类）常见 `SGZT` 写着"限大额"但 `BUY=false` 且 `MAXSG='--'`，实际根本买不了
4. 明确"限大额"却取不到额度数值时，本项目把状态降级为 `unknown` 并在比对时跳过，避免误报成利好
5. 天天基金的基金分类互斥，纳指/标普场外基金主要落在"指数型(zs)"而不是"QDII"分类下，构建基金池时容易漏

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
