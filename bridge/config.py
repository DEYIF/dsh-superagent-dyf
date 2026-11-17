"""环境变量配置。其它模块只读 Config，不再直接看 os.environ。

注意：MCP 走 stdio 时 stdout 是协议通道，任何调试输出都必须去 stderr。
"""
from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

_HERE = Path(__file__).resolve().parent

# .env 是可选的；没有 python-dotenv 也能用系统环境变量跑。
try:  # pragma: no cover - 依赖可选
    from dotenv import load_dotenv

    load_dotenv(_HERE / ".env")
except Exception:  # noqa: BLE001 - 缺依赖不算错误
    pass


def log(message: str) -> None:
    """写 stderr。stdout 留给 MCP 帧。"""
    print(f"[{time.strftime('%H:%M:%S')}] {message}", file=sys.stderr, flush=True)


def _get(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if value is None or not value.strip() else value.strip()


@dataclass(frozen=True)
class Config:
    #: 小智 MCP 接入点地址，形如 wss://api.xiaozhi.me/mcp/?token=...
    endpoint: str
    #: superagent 管理 API，必须走 loopback（它只绑 127.0.0.1）
    base: str
    device_id: str
    #: 语音请求的 sender。必须出现在 policy.sources.voice.allowed 里，否则请求会被 ignore。
    actor_id: str
    actor_name: str
    #: Trigger 的 source id，和 allowed 列表、Source 配置里的名字保持一致
    source: str
    poll_seconds: float
    #: 可选：能主动播报的小智服务端接口；官方云没有，留空即走"下次提问时汇报"
    push_url: str | None
    state_file: Path
    debug: bool

    @property
    def api(self) -> str:
        return self.base.rstrip("/")


def load() -> Config:
    return Config(
        endpoint=_get("MCP_ENDPOINT", ""),
        base=_get("SUPERAGENT_BASE", "http://127.0.0.1:3082/orchestrator/api"),
        device_id=_get("DEVICE_ID", "esp32-01"),
        actor_id=_get("ACTOR_ID", "owner"),
        actor_name=_get("ACTOR_NAME", "客厅音箱"),
        source=_get("SOURCE_ID", "voice"),
        poll_seconds=max(5.0, float(_get("POLL_SECONDS", "20"))),
        push_url=os.environ.get("XIAOZHI_PUSH_URL") or None,
        state_file=Path(_get("STATE_FILE", str(_HERE / "state.json"))),
        debug=_get("DEBUG", "0").lower() in ("1", "true", "yes", "on"),
    )


def redact(url: str) -> str:
    """日志里不能出现 token。"""
    if "token=" not in url:
        return url
    head, _, _ = url.partition("token=")
    return f"{head}token=***"
