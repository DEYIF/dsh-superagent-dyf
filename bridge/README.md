# 语音桥：小智音箱 → superagent → PR 回话

对着 ESP32 说一句需求，superagent 开一张工单、改代码、开 PR；下次你问"好了吗"，
音箱把结果念给你。

```
ESP32(小智固件) ──麦克风──> 小智云 ASR ──> 小智 agent(LLM)
                                              │ 意图识别："他在提需求"
                                              ▼ tools/call
                              wss://api.xiaozhi.me/mcp/?token=…
                                              │
                                    pipe.py（WS 客户端，反向注册）
                                              │ stdio JSON-RPC
                                    voice_mcp.py（MCP server）
                                      ├ ask_superagent ──> POST /orchestrator/api/device/ask
                                      ├ superagent_status ─> GET  /orchestrator/api/tickets
                                      └ watcher 线程 ──> 每 20s 轮询，攒"新 PR / 完成 / 卡住"
                                              │
                                    superagent（DSH 插件）
                                    Trigger → Eval → Ticket → worker → PR
```

**先看清一件事**：接入点不是给 ESP32 连的，是给你的主机进程连的。固件里那套 MCP 是
"设备把工具暴露给云"，方向相反。所以这个方案里 **ESP32 一行代码都不用改**。

---

## 文件

| 文件 | 干什么 |
| --- | --- |
| `pipe.py` | 把 stdio MCP server 挂到 `wss://…/mcp/?token=…` 上，负责重连 |
| `voice_mcp.py` | MCP server 本体，三个工具：ask / status / stop |
| `superagent_client.py` | 调 superagent 管理 API，带同源头和错误翻译 |
| `watcher.py` | 轮询工单，把状态变化攒成待播报队列 |
| `register_voice.py` | 一次性：把 sender 登记进 `policy.sources.voice.allowed` |
| `mock_superagent.py` | 假 API，不接 DSH 也能把整条链路跑通 |
| `superagent_side/` | superagent 侧那条 `device/ask` 路由的改动记录与验证方法 |

---

## 快速开始（WSL，和 superagent 同一台机器）

> 端口别猜：`SUPERAGENT_BASE` 要指向**加载了 bundle 的那个 DSH 实例**。
> SETUP.md 的独立 profile 用 **3082**，跑在默认 profile 里才是 6272。
> 用 `curl -s http://127.0.0.1:<端口>/orchestrator/api/state -H "x-orchestrator-request: 1"` 试一下，
> 返回 JSON 就对了，404 说明这个端口上没有 superagent。

WSL 里通常没有 pip，用 uv 建一个独立环境，不需要 sudo：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh            # 一次性，装到 ~/.local/bin
~/.local/bin/uv venv ~/.venvs/superagent-voice
~/.local/bin/uv pip install --python ~/.venvs/superagent-voice/bin/python -r requirements.txt
```

然后（`.env` 里填好 `MCP_ENDPOINT`）：

```bash
cd bridge
~/.venvs/superagent-voice/bin/python register_voice.py    # 一次性
~/.venvs/superagent-voice/bin/python pipe.py --check      # 只看 token 和握手，不起服务
```

握手成功会看到 `{"method":"initialize", ... "clientInfo":{"name":"xz-mcp-broker"}}` ——
接入点是 MCP 客户端，你是 server，方向就对了。

正式常驻（放在 tmux 里，WSL 关掉就没了）：

```bash
tmux new-session -d -s voice-bridge \
  "/home/$USER/.venvs/superagent-voice/bin/python $(pwd)/pipe.py >> $(pwd)/bridge.log 2>&1"
tmux attach -t voice-bridge     # 或者 tail -f bridge.log
```

正常日志长这样：

```
接入点已连接，启动 MCP server
← initialize
← notifications/initialized
← tools/list
← ping
```

`tools/list` 之后去小智控制台点"刷新 MCP 接入状态"，就能看到三个工具。

### 不接 superagent 也能先跑一遍

```bash
~/.venvs/superagent-voice/bin/python mock_superagent.py                     # 终端 A
SUPERAGENT_BASE=http://127.0.0.1:8099/orchestrator/api \
  ~/.venvs/superagent-voice/bin/python voice_mcp.py --selftest              # 终端 B
```

mock 的工单 6 秒后"提交 PR"、24 秒后"合并"，隔一会儿再跑一次 `--selftest`，
status 里就会出现 PR 链接——待播报队列的雏形。

---

## 接真的 superagent

**第 1 步，编译 superagent。** `POST /orchestrator/api/device/ask` 已经加进源码
（`src/app/http.ts`、`src/app/api.ts`、`tests/http.spec.ts`），但 DSH 加载的是 `lib/`，
所以要 `pnpm build` 再重启 DSH。细节见 [`superagent_side/README.md`](superagent_side/README.md)。

**第 2 步，登记 sender。** 这一步不做，语音请求会被**静默丢弃**：

```bash
~/.venvs/superagent-voice/bin/python register_voice.py
```

原因是 `src/policy.ts` 的准入表里 `unlistedAddressed` 默认是 `ignore`：
一个没登记过的 source 发来的"明确的直接请求"不会进 Eval，Decision 只记一条
`admission_ignored`，表现就是"我说了半天，它完全没反应"。
登记后 `addressed: 'direct'` 会走 `explicit` 分支，主 Session 当成人明确要求处理。

**第 3 步，配 `.env` 并起管道。**

```powershell
Copy-Item .env.example .env   # 填 MCP_ENDPOINT 和 DEVICE_ID
python pipe.py
```

**第 4 步，小智控制台刷新 MCP 接入状态**，应该能看到这三个工具。

**第 5 步，验证。**

```bash
curl -s "http://127.0.0.1:3082/orchestrator/api/tickets?state=open" -H "x-orchestrator-request: 1"
```

---

## 为什么"PR 好了"不能立刻响

MCP 是**工具调用**：只有模型主动调 `tools/call` 时，你的代码才在链路上。
服务端没有"往设备念一句话"的通道——那是小智服务端 TTS 的活，不是 MCP 的。

所以默认走**拉模式**：

1. `watcher.py` 每 20 秒轮询一次，把"PR 提交了 / 改完了 / 卡住了 / 合并了"攒进队列；
2. 你下次说话时，模型只要调用 `superagent_status`，就会拿到这批消息并念出来。

三条可以改善体验的路：

- **改工具描述**：`superagent_status` 的 docstring 里已经写了"当用户问进展/有消息吗时调用"。
  小智的意图识别模型看到这类描述，会在闲聊时也顺手查一次。
- **在超级提示里加一句**：让 agent 每次开场先问一句"有没有要汇报的"。
- **自建小智服务端**：如果你换成 `xiaozhi-esp32-server`，它有服务端主动下发的能力，
  把接口填进 `XIAOZHI_PUSH_URL`，`watcher.py` 就会在 PR 出现时立刻推。官方云没有这个口子。

---

## 排错

| 现象 | 大概原因 |
| --- | --- |
| `device/ask` 报 404 | 源码改了但没 `pnpm build`，或者 DSH 没重启 |
| 报 403 | base 写成了域名/局域网 IP，同源校验只认 `127.0.0.1:<端口>` |
| 接入点连不上 | token 过期或已在控制台重置；`--check` 会直接告诉你握手结果 |
| 工具列表是空的 | 管道没起、或者控制台没点"刷新 MCP 接入状态" |
| 说了需求，agent 只聊不干 | 没跑 `register_voice.py`，请求被 `admission_ignored` 丢了 |
| 念出来的内容很长 | 已在 `voice_mcp.py` 里截到 260 字，按需调 `SPOKEN_LIMIT` |

---

## 安全

- **你贴出来的那个 JWT 现在算泄露了**，有效期到 2027-11。去小智控制台重置接入点 token，
  然后只放进 `.env`。别写进固件：flash 里的字符串是能读出来的。
- 桥只连 `127.0.0.1`，不对外开端口；`.env` 别提交。
- 工具描述、返回值都会进云端 LLM 上下文再被念出来。别在描述里放密钥；
  返回值已经限长，但工单标题/摘要仍然可能带仓库内容，自己判断。
- **语音是最弱的身份认证**：谁对着音箱喊一句都能触发。所以默认只给低风险能力
  （提需求、查状态、停止）。别在这条路上开"自动合并 PR"这类动作。
