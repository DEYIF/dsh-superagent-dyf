"""后台轮询 superagent，把"新 PR / 完成 / 卡住 / 结束"攒成待播报的消息。

MCP 工具是同步调用，语音助手没法被服务端主动推送，所以这里的产物是一个
待播报队列：用户下次问"进展怎么样"时由 superagent_status 取走并念出来。
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from config import Config, log
from superagent_client import Client, SuperagentError, Ticket


def _clip(text: str, limit: int = 200) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


class Watcher(threading.Thread):
    def __init__(self, client: Client, cfg: Config) -> None:
        super().__init__(daemon=True, name="superagent-watcher")
        self.client = client
        self.cfg = cfg
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._news: list[dict[str, Any]] = []
        self._seen: dict[str, dict[str, Any]] = {}
        self._load()

    # ---- 生命周期 ------------------------------------------------------
    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:  # pragma: no cover - 线程体
        log(f"watcher 启动，每 {self.cfg.poll_seconds:.0f}s 查一次")
        while not self._stop.is_set():
            try:
                self.tick()
            except SuperagentError as exc:
                log(f"轮询失败：{exc}")
            except Exception as exc:  # noqa: BLE001 - 线程不能死
                log(f"轮询异常：{exc.__class__.__name__}: {exc}")
            self._stop.wait(self.cfg.poll_seconds)

    def tick(self) -> None:
        open_tickets = self.client.open_tickets()
        open_ids = [ticket.id for ticket in open_tickets]
        # 已经盯过、现在不在 open 列表里的，可能刚刚结束，还要看一眼。
        ids = open_ids + [tid for tid in self._seen if tid not in open_ids]
        for ticket_id in ids:
            try:
                detail = self.client.ticket(ticket_id)
            except SuperagentError:
                with self._lock:
                    self._seen.pop(ticket_id, None)
                continue
            self._observe(detail)

    # ---- 状态迁移 ------------------------------------------------------
    def _observe(self, ticket: Ticket) -> None:
        current = {
            "state": ticket.state,
            "stage": ticket.stage,
            "action": ticket.action,
            "url": ticket.url or "",
        }
        with self._lock:
            previous = self._seen.get(ticket.id)
            self._seen[ticket.id] = current

        if previous == current:
            return

        if previous is None:
            # 第一次见到：只播报已经值得说话的状态，别把排队也念出来。
            if ticket.action in ("review", "blocked", "failed", "answer") or ticket.state == "ended":
                self._push(ticket)
            return

        if current["url"] and current["url"] != previous.get("url"):
            self._push(ticket, text=f"PR 提交了：{ticket.title}，{ticket.url}")
            return
        if current["action"] != previous.get("action") or current["state"] != previous.get("state"):
            self._push(ticket)

    def _push(self, ticket: Ticket, text: str | None = None) -> None:
        item = {
            "at": ticket.updated_at,
            "ticket": ticket.id,
            "title": ticket.title,
            "url": ticket.url,
            "text": _clip(text or ticket.sentence()),
        }
        with self._lock:
            self._news.append(item)
            self._news = self._news[-20:]
        log(f"排入播报：{item['text']}")
        self._save()
        self._maybe_push(item)

    # ---- 待播报队列 ----------------------------------------------------
    def drain(self) -> list[dict[str, Any]]:
        with self._lock:
            items, self._news = self._news, []
        if items:
            self._save()
        return items

    def pending(self) -> int:
        with self._lock:
            return len(self._news)

    # ---- 持久化 --------------------------------------------------------
    def _load(self) -> None:
        path: Path = self.cfg.state_file
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001 - 首次运行没有文件
            return
        if isinstance(data.get("news"), list):
            self._news = [item for item in data["news"] if isinstance(item, dict)]
        if isinstance(data.get("seen"), dict):
            self._seen = {k: v for k, v in data["seen"].items() if isinstance(v, dict)}

    def _save(self) -> None:
        path: Path = self.cfg.state_file
        payload = json.dumps({"news": self._news, "seen": self._seen}, ensure_ascii=False, indent=2)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(payload, encoding="utf-8")
            os.replace(tmp, path)
        except OSError as exc:
            log(f"状态写盘失败：{exc}")

    # ---- 可选：主动播报 ------------------------------------------------
    def _maybe_push(self, item: dict[str, Any]) -> None:
        """官方小智云没有服务端主动 TTS；自建 server 若有回灌接口，填 XIAOZHI_PUSH_URL。"""
        if not self.cfg.push_url:
            return
        import requests

        try:
            requests.post(
                self.cfg.push_url,
                json={"text": item["text"], "device": self.cfg.device_id},
                timeout=3,
            )
        except requests.RequestException as exc:
            log(f"主动播报失败（不影响下次提问）：{exc.__class__.__name__}")
