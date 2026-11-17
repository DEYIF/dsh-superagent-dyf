# superagent 侧的改动：`POST /orchestrator/api/device/ask`

**状态：已写进源码，`tsc --noEmit` 通过，`pnpm build` 通过，新增测试通过。**
整套 `pnpm test` 有 43 个失败——把这三个改动 stash 掉再跑，**同样 43 个失败**，
所以是本来就有的环境问题（`tests/service-script.spec.ts` 这类要 spawn 进程的用例），
不是这条路由引入的。

## 改了什么

| 文件 | 改动 |
| --- | --- |
| `src/app/api.ts` | `Api` 里加一条路由类型 |
| `src/app/http.ts` | 导入 `key` / `Trigger`；`HttpHost.engine` 放宽出 `receive`；`routes()` 里加处理函数 |
| `tests/fixtures/panel-server.ts` | 面板测试的假服务器要实现全部路由，补一条返回固定值 |
| `tests/http.spec.ts` | 新增一个用例：设备请求变成一个 Trigger |

```ts
'POST device/ask': async ({ body }) => {
  const input = z.object({ text: z.string().trim().min(1).max(4000), deviceId: z.string().trim().min(1).max(64).default('device'),
    sender: z.string().trim().min(1).max(200).default('owner') }).strict().parse(await body())
  const at = new Date().toISOString()
  const trigger: Trigger = { id: key('trigger', 'voice', input.deviceId, at, input.text), source: 'voice',
    threads: [{ source: 'voice', id: input.deviceId }], actor: { source: 'voice', id: input.sender }, human: true,
    addressed: 'direct', at, text: input.text, meta: { deviceId: input.deviceId } }
  return { result: runtime.engine.receive(trigger), triggerId: trigger.id }
}
```

三个设计取舍：

- **`addressed: 'direct'` 不能省。** `src/policy.ts` 的 `gate` 只认 `addressed` 或 `scope.observed`，
  缺了它一律 `not_human`，请求直接掉地。
- **一个设备一个 Thread。** `threads[0].id = deviceId`，所以后续追问能关联到这台设备开过的工单。
- **`sender` 可传，但不是身份认证。** 它只决定 Policy 去哪一栏查 `allowed`；管理 API 本身只绑
  loopback + 同源校验，本地进程本来就能调 stop/retry，所以这里不额外加权限。

## 语义：返回的是 triggerId，不是 ticketId

`Engine.receive` 只做三件事：存 Trigger、按 Thread 分发、排一次 Eval（`src/core/intake.ts`）。
**工单是主 Session 评估后才创建的**，所以这一刻还没有 ticketId。
桥那边的 `ask_superagent` 就是按这个语义写的："已受理，过几分钟问进展"。

想要"同步拿到工单"就得走 `decide(triggerId, 'accept')`，等于绕过主 Session 的评估。
不建议：语音转写错一个字就让 agent 直接开工，代价太大。

## 生效前提

```powershell
pnpm build      # 产出 lib/，DSH 加载的是它，不是 src/
```

然后重启 DSH。`device/ask` 报 404 基本就是这两步没做。

## 一个已知的噪音

`voice` 没有注册成 SourceKind，就没有 Channel。主 Session 如果要发确认/结果消息，
Outbox 会尝试经 Source 发送但找不到 Channel，回执会停在 waiting 并不断重试。
桥不依赖这些回执（它直接轮询工单），但面板里可能看到几条等不到的回执。
真要干净，就得把 `voice` 升级成正式的 SourceKind（照 `docs/008-cookbook.md` 的 11 步），
准入、Channel、健康检查、热插拔都能补齐——先用路由验体验，值得了再升级。

## 手工验证

```powershell
curl.exe -s -X POST http://127.0.0.1:6272/orchestrator/api/device/ask `
  -H "x-orchestrator-request: 1" -H "content-type: application/json" `
  -d "{\"text\":\"把 README 里的 typo 改掉\",\"deviceId\":\"esp32-01\"}"
```

期望 `{"result":"stored","triggerId":"..."}`。返回 `filtered` 说明 `policy.sources.voice.allowed`
里没有这个 sender —— 跑 `bridge/register_voice.py`。
