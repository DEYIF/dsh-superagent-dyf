"""MCP stdio server：三个语音友好的工具，背后接 superagent。

工具刻意做粗：语音场景下意图识别模型只会调少数几个工具，参数必须是自然语言。
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

from mcp.server.fastmcp import FastMCP

import config
from config import Config, log
from superagent_client import Client, SuperagentError, Ticket
from watcher import Watcher

SPOKEN_LIMIT = 260


def _clip(text: str, limit: int = SPOKEN_LIMIT) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


class Bridge:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.client = Client(cfg)
        self.watcher = Watcher(self.client, cfg)
        self.watcher.start()

    # ---- 工具实现 ------------------------------------------------------
    def ask(self, request: str) -> str:
        text = (request or "").strip()
        if not text:
            return "我没听清需求，再说一遍？"
        if len(text) > 2000:
            text = text[:2000]
        try:
            self.client.ask(text)
        except SuperagentError as exc:
            return f"没送出去：{exc}"
        return (
            f"收到了，已经交给 superagent 评估：{_clip(text, 60)}。"
            "它要开一张工单再动手，过几分钟问我「进展怎么样」就行。"
        )

    def status(self, ticket_id: str = "") -> str:
        news = self.watcher.drain()
        parts: list[str] = []
        if news:
            parts.append("；".join(item["text"] for item in news[-3:]))

        try:
            ticket = self._resolve(ticket_id)
        except SuperagentError as exc:
            ticket = None
            parts.append(f"查状态失败：{exc}")

        if ticket is not None:
            parts.append(ticket.sentence())
            if ticket.url and ticket.action != "review":
                parts.append(f"链接 {ticket.url}")

        if not parts:
            return "现在没有在跑的任务，也没有新消息。"
        return _clip("。".join(parts))

    def stop(self, ticket_id: str = "") -> str:
        try:
            ticket = self._resolve(ticket_id)
        except SuperagentError as exc:
            return f"查不到要停的工单：{exc}"
        if ticket is None:
            return "现在没有在跑的工单，不用停。"
        try:
            self.client.stop(ticket.id)
        except SuperagentError as exc:
            return f"停不下来：{exc}"
        return f"已经让 superagent 停下 {ticket.title} 了。"

    # ---- 内部 ----------------------------------------------------------
    def _resolve(self, ticket_id: str) -> Ticket | None:
        wanted = (ticket_id or "").strip()
        tickets = self.client.open_tickets()
        if not wanted:
            if not tickets:
                return None
            return max(tickets, key=lambda t: t.updated_at)
        for ticket in tickets:
            if ticket.id == wanted or ticket.id.startswith(wanted):
                return ticket
        # 已经结束的也要能查
        return self.client.ticket(wanted)


def build(cfg: Config | None = None) -> tuple[FastMCP, Bridge]:
    cfg = cfg or config.load()
    bridge = Bridge(cfg)
    server = FastMCP("superagent-voice")

    @server.tool()
    def ask_superagent(request: str) -> str:
        """把用户的一句话开发需求交给 superagent，开一张工单去改代码。

        当用户说出"帮我改/修/加/优化某某"、"把这个需求交给 agent"时调用。
        request 用用户原话，不要翻译、不要补全、不要加 ID。
        这是非阻塞的：返回受理成功即可，真正的结果要之后用 superagent_status 查。
        """
        return bridge.ask(request)

    @server.tool()
    def superagent_status(ticket_id: str = "") -> str:
        """汇报 superagent 的进展：有没有新 PR、做完了没、卡在哪、有没有要问你的。

        当用户问"进展怎么样""做好了吗""有消息吗""刚才那个改完没""PR 提了吗"时调用。
        ticket_id 留空表示最近那个工单；用户说出编号时原样传入。
        返回里可能带未播报的消息，照原话念给用户，不要自己编造进度。
        """
        return bridge.status(ticket_id)

    @server.tool()
    def stop_superagent(ticket_id: str = "") -> str:
        """停掉正在跑的工单。当用户说"别做了""停下来""取消刚才那个"时调用。"""
        return bridge.stop(ticket_id)

    return server, bridge


def _selftest(cfg: Config) -> int:
    """只读跑一遍：不动 superagent，也不产生工单。"""
    _, bridge = build(cfg)
    print("== 待播报 ==")
    print(bridge.status())
    print("== 只读自检完成，没有提交任何需求 ==")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="superagent 语音桥（MCP stdio server）")
    parser.add_argument("--selftest", action="store_true", help="不启动 MCP，直接跑一遍三个工具")
    args = parser.parse_args(argv)

    cfg = config.load()
    if args.selftest:
        return _selftest(cfg)

    server, bridge = build(cfg)
    log(f"MCP server 就绪：source={cfg.source} device={cfg.device_id} api={cfg.api}")
    try:
        server.run()
    finally:
        bridge.watcher.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
