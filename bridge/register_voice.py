"""一次性配置：把语音请求的 sender 登记进 policy.sources.<source>.allowed。

为什么必须有这一步：superagent 的准入表里 unlistedAddressed 默认是 ignore，
没登记过的 source 发来的"明确的直接请求"会被静默丢弃，Decision 记 admission_ignored，
表现就是"说了半天，agent 完全没反应"。

只用标准库，所以 WSL 里没有 pip 也能跑。
"""
from __future__ import annotations

import json
import sys
import urllib.request

from config import Config, load, log


def _opener():
    # 显式绕过 http_proxy：WSL 里常配着指向 Windows 的代理，直连 loopback 必须跳过。
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(cfg: Config, method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{cfg.api}/{path.lstrip('/')}",
        data=data,
        method=method,
        headers={"x-orchestrator-request": "1", "content-type": "application/json"},
    )
    try:
        with _opener().open(request, timeout=10) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:200]
        raise SystemExit(f"superagent 返回 {exc.code}：{detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"连不上 superagent（{cfg.api}）：{exc.reason}") from exc


def main() -> int:
    cfg = load()
    view = call(cfg, "GET", "settings")
    blocks = view.get("blocks") if isinstance(view, dict) else None
    block = blocks.get("policy") if isinstance(blocks, dict) else None
    if not isinstance(block, dict) or "revision" not in block:
        log("settings.blocks 里没有 policy，确认 superagent 版本")
        return 1

    revision = int(block["revision"])
    value = block.get("value") or {}
    part = value.setdefault("sources", {}).setdefault(cfg.source, {})
    allowed = part.setdefault("allowed", [])
    part.setdefault("admission", {})

    if any(item.get("id") == cfg.actor_id for item in allowed if isinstance(item, dict)):
        print(f"已经登记过：{cfg.source} / {cfg.actor_id}")
        return 0

    allowed.append({"id": cfg.actor_id, "name": cfg.actor_name})
    call(cfg, "PUT", "settings/policy", {"value": value, "revision": revision})
    print(f"已登记 sender：{cfg.source} / {cfg.actor_id}（{cfg.actor_name}）")
    print("现在这个 sender 的直接请求会被当作 explicit，主 Session 会正常受理。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
