"""假的 superagent 管理 API：不接 DSH 也能把整条链路跑通。

用法：
    python mock_superagent.py            # 监听 127.0.0.1:8099
    SUPERAGENT_BASE=http://127.0.0.1:8099/orchestrator/api python voice_mcp.py --selftest

它和真 API 的差别只有一处：这里 ask 之后立刻建工单；
真 superagent 要先过 Eval，工单是主 Session 决定接受后才出现的。
"""
from __future__ import annotations

import json
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

TICKETS: dict[str, dict] = {}
LOCK = threading.Lock()

STAGE_REVIEW = 6.0  # 秒
STAGE_DONE = 24.0


def _log(message: str) -> None:
    print(f"[mock] {message}", file=sys.stderr, flush=True)


def _ticket_view(ticket: dict) -> dict:
    age = time.monotonic() - ticket["_born"]
    pull = f"https://github.com/example/repo/pull/{ticket['_pr']}"
    if age < STAGE_REVIEW:
        stage, action, ended = "working", None, None
    elif age < STAGE_DONE:
        stage, action, ended = "person", "review", None
    else:
        stage, action, ended = "ended", None, {
            "at": ticket["_at"], "by": "thread", "reason": [], "outcome": "merged"
        }
    return {
        "id": ticket["id"],
        "title": ticket["title"],
        "state": "ended" if ended else "open",
        "stage": stage,
        **({"action": action} if action else {}),
        "summary": "已改完并提交 PR" if action == "review" else "正在改",
        "createdAt": ticket["_at"],
        "updatedAt": ticket["_at"],
        **({"ended": ended} if ended else {}),
        "threads": [
            {"key": f"github:example/repo#{ticket['_pr']}", "source": "github",
             "title": f"PR #{ticket['_pr']}", **({"url": pull} if age >= STAGE_REVIEW else {})}
        ],
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 - 覆盖基类
        _log(fmt % args)

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        length = int(self.headers.get("content-length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return {}

    def _path(self) -> tuple[str, dict]:
        parsed = urlparse(self.path)
        prefix = "/orchestrator/api/"
        path = parsed.path[len(prefix):] if parsed.path.startswith(prefix) else parsed.path
        return path.strip("/"), parse_qs(parsed.query)

    # ---- 路由 ----------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        path, _ = self._path()
        if path == "tickets":
            with LOCK:
                items = [_ticket_view(t) for t in TICKETS.values()]
            items = [i for i in items if i["state"] == "open"]
            self._send(200, {"items": items, "total": len(items)})
            return
        if path.startswith("tickets/"):
            ticket_id = path.split("/", 1)[1]
            with LOCK:
                ticket = TICKETS.get(ticket_id)
            if not ticket:
                self._send(404, {"error": "Ticket not found"})
                return
            self._send(200, _ticket_view(ticket))
            return
        if path == "settings":
            self._send(200, {"policy": {"value": {"rules": [], "sources": {}}, "revision": 0}})
            return
        if path == "state":
            self._send(200, {"paused": False, "health": {}, "masterId": "mock"})
            return
        self._send(404, {"error": "Unknown operation"})

    def do_POST(self) -> None:  # noqa: N802
        path, _ = self._path()
        if path == "device/ask":
            body = self._body()
            text = str(body.get("text") or "").strip()
            if not text:
                self._send(400, {"error": "text is required"})
                return
            ticket_id = uuid.uuid4().hex[:8]
            with LOCK:
                TICKETS[ticket_id] = {
                    "id": ticket_id,
                    "title": text[:40],
                    "_born": time.monotonic(),
                    "_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "_pr": 10 + len(TICKETS),
                }
            _log(f"ask -> {ticket_id}: {text[:40]}")
            self._send(200, {"result": "stored", "triggerId": f"mock-{ticket_id}"})
            return
        if path.startswith("tickets/") and path.endswith("/stop"):
            ticket_id = path.split("/")[1]
            with LOCK:
                ticket = TICKETS.pop(ticket_id, None)
            self._send(200 if ticket else 404, {"stopped": bool(ticket)})
            return
        self._send(404, {"error": "Unknown operation"})

    def do_PUT(self) -> None:  # noqa: N802
        path, _ = self._path()
        if path == "settings/policy":
            self._body()
            self._send(200, {"revision": 1})
            return
        self._send(404, {"error": "Unknown operation"})


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    _log(f"mock superagent 在 http://127.0.0.1:{port}/orchestrator/api")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
