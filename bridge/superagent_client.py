"""superagent 管理 API 的极简客户端。

约束（来自 src/app/http.ts）：
- 只监听 127.0.0.1，所以桥必须跑在同一台机器上；
- 每个请求都要带 x-orchestrator-request: 1，否则 403；
- 除 GET 外没有"提交需求"的入口，POST device/ask 需要照 superagent_side/ 补上。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import requests

from config import Config


class SuperagentError(RuntimeError):
    """message 会被直接念给用户，所以写成人话。"""


@dataclass
class Ticket:
    id: str
    title: str
    state: str
    stage: str
    action: str | None
    note: str | None
    summary: str
    url: str | None
    ended: dict[str, Any] | None
    updated_at: str
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @classmethod
    def of(cls, data: dict[str, Any]) -> "Ticket":
        threads = data.get("threads") or []
        url = next((t.get("url") for t in threads if t.get("url")), None)
        note = data.get("note") or {}
        return cls(
            id=str(data.get("id", "")),
            title=str(data.get("title") or "未命名工单"),
            state=str(data.get("state") or "open"),
            stage=str(data.get("stage") or ""),
            action=data.get("action"),
            note=note.get("text") if isinstance(note, dict) else None,
            summary=str(data.get("summary") or ""),
            url=url,
            ended=data.get("ended"),
            updated_at=str(data.get("updatedAt") or data.get("createdAt") or ""),
            raw=data,
        )

    def sentence(self) -> str:
        """一句话状态，用于 TTS。"""
        if self.state == "ended":
            outcome = (self.ended or {}).get("outcome") or "结束"
            return f"{self.title} 已经结束（{outcome}）"
        if self.action == "review":
            return f"{self.title} 改完了，PR 等你 review"
        if self.action == "answer":
            return f"{self.title} 有个问题要问你：{self.note or '需要你回复'}"
        if self.action == "blocked":
            return f"{self.title} 卡住了：{self.note or '需要你处理'}"
        if self.action == "failed":
            return f"{self.title} 失败了：{self.note or '需要你重试'}"
        if self.action == "queued":
            return f"{self.title} 在排队等 worker"
        if self.action == "delivery":
            return f"{self.title} 的消息没送到 worker"
        if self.stage == "working":
            return f"{self.title} 正在改代码"
        if self.stage == "idle":
            return f"{self.title} 暂时空闲"
        return f"{self.title} 状态是 {self.stage or '未知'}"


class Client:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.http = requests.Session()
        self.http.headers.update(
            {"x-orchestrator-request": "1", "accept": "application/json"}
        )

    # ---- 底层 ----------------------------------------------------------
    def _call(self, method: str, path: str, body: dict | None = None) -> Any:
        url = f"{self.cfg.api}/{path.lstrip('/')}"
        try:
            response = self.http.request(method, url, json=body, timeout=(2, 8))
        except requests.RequestException as exc:
            raise SuperagentError(
                f"连不上 superagent（{self.cfg.api}），确认 DSH 在跑"
            ) from exc

        if response.status_code == 403:
            raise SuperagentError("superagent 拒绝了请求（403）：同源校验没过，别把 base 换成域名")
        if response.status_code == 404:
            if path.startswith("device/ask"):
                raise SuperagentError(
                    "这个 superagent 还没有 device/ask 入口，先照 superagent_side/ 加上那条路由"
                )
            raise SuperagentError("superagent 里查不到这条记录")
        if response.status_code == 409:
            raise SuperagentError("设置被别人改过了，重跑一次 register_voice.py")
        if response.status_code >= 400:
            raise SuperagentError(
                f"superagent 返回 {response.status_code}：{response.text[:120]}"
            )
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise SuperagentError("superagent 返回的不是 JSON") from exc

    # ---- 业务 ----------------------------------------------------------
    def ask(self, text: str) -> dict:
        """提交一句需求。返回 {result, triggerId}；工单由主 Session 评估后创建。"""
        return self._call(
            "POST",
            "device/ask",
            {"text": text, "deviceId": self.cfg.device_id, "sender": self.cfg.actor_id},
        )

    def open_tickets(self) -> list[Ticket]:
        data = self._call("GET", "tickets?state=open&limit=50")
        items = data.get("items") if isinstance(data, dict) else data
        return [Ticket.of(item) for item in (items or [])]

    def ticket(self, ticket_id: str) -> Ticket:
        return Ticket.of(self._call("GET", f"tickets/{ticket_id}"))

    def stop(self, ticket_id: str) -> dict:
        return self._call("POST", f"tickets/{ticket_id}/stop")

    def state(self) -> dict:
        return self._call("GET", "state")

    def settings(self) -> dict:
        return self._call("GET", "settings")

    def save_policy(self, value: dict, revision: int) -> dict:
        """带 revision 的乐观并发；冲突时 API 返回 409。"""
        return self._call("PUT", "settings/policy", {"value": value, "revision": revision})
