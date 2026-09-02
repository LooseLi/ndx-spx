# Cloudflare Worker：定时触发额度监控

在 Cloudflare Dashboard 新建 Worker 后，把下面整段粘进 **Edit code**，再 **Save and Deploy**。加完 Secret 也必须再 Deploy 一次，否则运行中的 Worker 读不到新变量。

Cron Trigger 填（UTC，对应北京时间工作日 09:15 / 12:15 / 14:15 / 18:15）：

```
15 1,4,6,10 * * MON-FRI
```

星期必须写 `MON-FRI`，不要写 `1-5`。Cloudflare 的 `1` 是周日，写成 `1-5` 会变成周日到周四跑。

Secret（Settings → Variables and Secrets，类型选 Secret）：

- `GITHUB_TOKEN`：fine-grained PAT，仅 `ndx-spx` 仓库、`Actions: Read and write`。这只是 Cloudflare 里的变量名，和 GitHub Actions 自动注入的那个 `GITHUB_TOKEN` 不是同一个东西
- `FEISHU_WEBHOOK`：与仓库 Secret 相同
- `FEISHU_SECRET`：飞书机器人签名密钥；没开签名校验就不要加

手动测试：浏览器打开 Worker 地址加 `?run=1`，例如 `https://ndx-spx.1329307562.workers.dev/?run=1`。预览会返回 GitHub 的状态码；`204` 表示触发成功。测通后不要把 `?run=1` 当日常入口，这个地址是公开的。

```js
const DISPATCH_URL =
  'https://api.github.com/repos/LooseLi/ndx-spx/actions/workflows/track.yml/dispatches'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const run = url.searchParams.get('run') === '1'
    const body = {
      secrets: {
        GITHUB_TOKEN: Boolean(env.GITHUB_TOKEN),
        FEISHU_WEBHOOK: Boolean(env.FEISHU_WEBHOOK),
        FEISHU_SECRET: Boolean(env.FEISHU_SECRET),
      },
    }
    if (run) body.result = await dispatch(env)
    else body.hint = 'add ?run=1 to trigger GitHub Actions once'
    return json(body)
  },

  async scheduled(_event, env) {
    await dispatch(env)
  },
}

async function dispatch(env) {
  if (!env.GITHUB_TOKEN) {
    await alert(env, '[额度监控] 缺少 GITHUB_TOKEN，无法触发 GitHub Actions')
    return { ok: false, status: 0, detail: 'missing GITHUB_TOKEN secret' }
  }

  const res = await fetch(DISPATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ndx-spx-cron',
    },
    body: JSON.stringify({ ref: 'main' }),
  })

  if (res.status === 204) {
    console.log('triggered track.yml')
    return { ok: true, status: 204, detail: 'dispatched' }
  }

  const detail = await res.text()
  console.error(`dispatch failed ${res.status}: ${detail}`)
  await alert(env, `[额度监控] 触发失败 ${res.status}：${detail}`)
  return { ok: false, status: res.status, detail }
}

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function alert(env, text) {
  if (!env.FEISHU_WEBHOOK) return

  const ts = Math.floor(Date.now() / 1000)
  const payload = {
    msg_type: 'text',
    content: { text },
  }
  if (env.FEISHU_SECRET) {
    payload.timestamp = String(ts)
    payload.sign = await sign(env.FEISHU_SECRET, ts)
  }

  await fetch(env.FEISHU_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function sign(secret, ts) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${ts}\n${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new Uint8Array())
  const bytes = new Uint8Array(mac)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
```
