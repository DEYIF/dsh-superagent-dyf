# @local/superagent-monitor

监视一个**独立运行**的 `dsh-superagent` 实例，并从这里启动、重启它或修改它监听的 GitHub 仓库。

它装在**你平时工作的那个 DSH profile**（例如 `desktop`），而不是 `superagent` profile——superagent 挂掉时，
它必须还活着，才能把服务拉起来。

## 面板

在侧边栏点「Superagent 监控」，页面显示：

- 页面自己持有滚动区（`height: 100%; overflow: auto`），内容超出主面板高度时用滚轮滚动。
- **运行状态**：`运行正常` / `等待配置` / `有分项异常` / `处理已暂停` / `启动中` / `已停止` /
  `进程在运行但无应答` / `无法判断`，以及运行时就绪时间、延迟、PID、手动停止标记。
- **Watchdog（主进程守护）**：守护状态、连续失败、本小时重启次数、上次/下次检查、自动重启事件；
  可启用/停用、立即检查、重置计数。
- **健康分项**：`GET /orchestrator/api/state` 的每个 `health` 分项（runtime、github、feishu、history、
  delivery、sync:… 等）；有分项报错时显示它的 detail。
- **负载**：执行器 `running / maxWorkers`、排队工单数、处理开关。
- **消息来源**：每个 Source 的状态、今日接收/过滤数、最近一次事件。
- **监听的仓库**：当前值，以及输入框 + 保存。保存走 superagent 的管理 API：先检查智能体账号能否推送到
  新仓库，再重启 dsh-superagent；失败时显示 setup 检查的原因。
- **最近操作**：最近一次启动/重启的命令、退出码和输出。
- **状态变化**：本次打开面板期间记录到的状态迁移（最多 20 条）。
- **监测配置**：管理接口、profile、启动方式、检出目录、状态目录、实际会执行的启动命令。

顶部按钮：**刷新**、**启动**、**重启**（需二次确认，防止误触）；服务可达时还有**暂停处理 / 恢复处理**。

## 默认值

配置为空时：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3082`（或 `$DSH_SUPERAGENT_URL`） | superagent 管理接口的 loopback 地址 |
| `profile` | `superagent`（或 `$DSH_SUPERAGENT_PROFILE`） | superagent 的 DSH profile |
| `checkout` | 本包的上级目录 | 包含 `scripts/dsh-superagent` 的检出目录；本包放在检出目录内，所以默认就能用 |
| `runner` | Windows 上 `wsl`，其他平台 `direct` | `wsl` 用 `wsl.exe -- bash -lc`；`direct` 用 `bash -lc` |
| `wslDistro` | 空 = WSL 默认发行版 | 需要固定发行版时填写，例如 `Ubuntu` |
| `pollSeconds` | `5` | 面板自动刷新间隔（秒） |
| `httpTimeoutSeconds` | `10` | 读取管理接口的超时 |
| `statusTimeoutSeconds` | `15` | API 不可达时执行 `status` 的超时 |
| `startTimeoutSeconds` | `180` | 启动操作的超时 |
| `restartTimeoutSeconds` | `420` | 重启操作的超时（要等执行器收尾） |
| `watchdog.enabled` | `true` | 是否后台自动恢复主进程；面板里的开关只在本次 DSH 进程内生效 |
| `watchdog.intervalSeconds` | `30` | 后台探活间隔（秒） |
| `watchdog.failureThreshold` | `3` | 连续多少次判定为异常后自动重启 |
| `watchdog.restartCooldownSeconds` | `300` | 两次自动重启之间的冷却（秒） |
| `watchdog.maxRestartsPerHour` | `3` | 每小时自动重启上限，超过后进入 blocked |
| `watchdog.respectStop` | `true` | 手动停止后是否跳过自动恢复 |

需要覆盖时，在**桌面 profile** 的用户层 `cordis.patch.yml`（`~/.dsh/profiles/<profile>/cordis.patch.yml`）
里按 id 覆盖：

```yaml
- id: superagent-monitor
  config:
    baseUrl: http://127.0.0.1:3082
    profile: superagent
    checkout: /mnt/e/HUAWEI工作/dsh-superagent-prototype
    wslDistro: Ubuntu
    watchdog:
      enabled: true
      intervalSeconds: 30
      failureThreshold: 3
      restartCooldownSeconds: 300
      maxRestartsPerHour: 3
      respectStop: true
```

本插件没有导出 Schemastery `Config`，所以 Plugin Manager 不会生成配置表单；上面是唯一支持的配置入口。

## 安装

在**工作 profile** 里安装（示例为 `desktop`）：

```sh
dsh plugin --profile desktop add "link:/path/to/dsh-superagent-prototype/superagent-monitor"
```

或者让智能体用 `plugin_manager` 的 `install_bundle`，`target` 指向本目录。

安装后刷新一次 Web 页面，侧边栏会出现「Superagent 监控」。只会在 `127.0.0.1` 的页面上工作：路由拒绝
非 loopback 的 socket、跨站 Origin、以及没有 `x-superagent-monitor-request: 1` 的请求。

## 行为

- **启动**只在服务未运行时可用；运行中会禁用（按钮 title 会说明原因）。启动命令是
  `scripts/dsh-superagent ... start`，和 docs/006-deployment.md 的运维脚本完全一致，会清除此前的
  「手动停止」标记。
- **重启**是恢复手段：脚本先优雅停止（最多 5 分钟等执行器完成当前步骤），再启动；不会强杀进程。
- **暂停处理**调用 `POST executor/pause`，只暂停工单处理，不停止服务。
- **修改仓库**要求管理接口可达；保存会触发一次账号推送权限检查，成功后 dsh-superagent 会重启自身，
  页面会短暂显示启动中。
- **不提供停止按钮**：停止会写「手动停止」标记，影响自动恢复；需要停时请用运维脚本，避免误触。

## Watchdog（主进程守护）

这里的“主进程”指运行 `superagent` profile 的那个 DSH 进程（`dsh --profile superagent`），不是桌面 GUI 本身。
插件激活后，watchdog 在后台循环：

1. 每 `watchdog.intervalSeconds` 秒用 `GET /orchestrator/api/state` 探活；
2. 管理接口不可达时运行 `scripts/dsh-superagent status`，区分“已停止”和“在运行但无应答”；
3. `ready`、`paused`、`setup`、`error` 都算“进程还在”：配置等待和分项错误重启也修不好，不重启；
4. 连续 `watchdog.failureThreshold` 次判定为 `stopped` / `unreachable` / `unknown` 后，执行
   `scripts/dsh-superagent restart --respect-stop`；
5. 手动停止（`manually-stopped` 标记）永不撤销；有冷却和每小时上限，超出后进入 blocked，
   面板可「重置计数」；
6. 仓库保存导致 superagent 自身重启时，watchdog 自动暂停 120 秒，避免把正常重启误判为崩溃。

「立即检查」只探活，不会触发重启；自动恢复只由后台定时器执行。面板里的开关只对当前 DSH 进程生效，
持久值是 `watchdog.enabled`。DSH 重启后 watchdog 从配置值重新开始，事件不持久化。

## 安全

- 管理接口和本插件路由都只走 loopback；路由额外校验 `Origin`/`Host`/socket 地址。
- 面板不保存、不显示任何 token；读取的 `state` 里没有凭据。
- 「修改仓库」等价于 superagent 管理面板的权限：能改 Source 配置，也能改执行环境；只在你自己的
  DSH 页面上暴露。

## 限制

- **Watchdog 只守护 superagent 主进程**，不守护桌面 DSH 本身；桌面 DSH 挂了需要外部 supervisor。
- 自动恢复依赖检出目录里的 `scripts/dsh-superagent`；找不到时 watchdog 进入 blocked，不会反复尝试。
- 不对 `setup` 等待和分项错误重启（重启不修复），也不对重复进程做选择：`scripts/dsh-superagent` 会拒绝。
- 不强制 kill；优雅停止超时后 watchdog 只报告失败，需要人工处理。
- **Watchdog 事件只在内存里**，DSH 重启后清空；面板的「状态变化」也只在面板打开期间采样。
- 需要检出目录里存在 `scripts/dsh-superagent`（或通过 `checkout` 指向它）；否则启动按钮会禁用并给出原因。
- Windows 上的默认启动方式是 WSL；如果 superagent 跑在别的机器或容器里，把 `runner`/`checkout` 配成
  实际方式，或者只使用监控（不点启动）。
- `status` 只在管理接口不可达时执行，用来区分「已停止」和「在运行但无应答」；它和 start/restart 共用
  `scripts/dsh-superagent` 的锁，启动进行中的短暂检查会显示为「无法判断」。
- 读取 `sources` 失败不会影响主状态，只在来源卡片里显示错误。

## 开发与验证

```sh
cd superagent-monitor
node --test test/runner.test.mjs test/monitor.test.mjs test/watchdog.test.mjs   # 纯函数与策略单测
node test/live-check.mjs                                                        # 只读地检查真实实例
```

`test/live-check.mjs` 接收相同的配置键：`--baseUrl ... --profile ... --checkout ...`。

## 卸载

```sh
dsh plugin --profile desktop remove @local/superagent-monitor
```

然后刷新页面。卸载不会影响 superagent 本身。
