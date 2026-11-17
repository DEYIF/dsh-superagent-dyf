"""stdio MCP server <-> 小智 MCP 接入点 的双向管道。

你写的是 MCP server（提供工具），但接入点要求用 WebSocket 客户端的方式连出去。
这个进程负责：起 server 子进程、把 WS 上的 JSON-RPC 转发到它的 stdin、
再把它的 stdout 原样发回 WS。协议细节都在这里，voice_mcp.py 不用管。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

try:  # websockets >= 13
    from websockets.asyncio.client import connect as ws_connect
except Exception:  # noqa: BLE001 - websockets 12
    from websockets.client import connect as ws_connect

import config
from config import log

HERE = Path(__file__).resolve().parent
DEFAULT_SERVER = HERE / "voice_mcp.py"


async def _ws_to_child(ws, proc) -> None:
    async for message in ws:
        if isinstance(message, (bytes, bytearray)):
            message = message.decode("utf-8", "replace")
        payload = str(message).strip()
        if not payload:
            continue
        # 接入点可能把多条 JSON-RPC 塞进一帧，stdio 那边必须一行一条。
        for line in payload.splitlines():
            line = line.strip()
            if line:
                _log_method(line)
                proc.stdin.write((line + "\n").encode())
        await proc.stdin.drain()


def _log_method(payload: str) -> None:
    """只记方法名：调用很稀疏，出问题时这一行足够定位。"""
    try:
        message = json.loads(payload)
    except ValueError:
        return
    method = message.get("method")
    if method:
        params = message.get("params") or {}
        name = params.get("name") if isinstance(params, dict) else None
        log(f"← {method}{f' {name}' if name else ''}")


async def _child_to_ws(proc, ws) -> None:
    while True:
        line = await proc.stdout.readline()
        if not line:
            raise ConnectionError("MCP server 的子进程退出了")
        text = line.decode("utf-8", "replace").strip()
        if text:  # 空行不是协议消息
            await ws.send(text)


async def _run_once(endpoint: str, server: Path) -> None:
    async with ws_connect(
        endpoint, max_size=None, ping_interval=20, ping_timeout=20, close_timeout=5
    ) as ws:
        log("接入点已连接，启动 MCP server")
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            str(server),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=None,  # 子进程日志直接进当前终端，不污染协议
        )
        tasks = [
            asyncio.create_task(_ws_to_child(ws, proc)),
            asyncio.create_task(_child_to_ws(proc, ws)),
        ]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                exc = task.exception()
                if exc is not None:
                    log(f"管道结束：{exc.__class__.__name__}: {exc}")
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            if proc.returncode is None:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=3)
                except asyncio.TimeoutError:
                    proc.kill()


async def _run(endpoint: str, server: Path) -> None:
    delay = 1.0
    while True:
        try:
            await _run_once(endpoint, server)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - 网络断了就重连
            log(f"接入点断开：{exc.__class__.__name__}: {exc}")
        log(f"{delay:.0f} 秒后重连")
        await asyncio.sleep(delay)
        delay = min(30.0, delay * 2)


async def _check(endpoint: str) -> None:
    log("只检查连接，不启动 MCP server")
    async with ws_connect(endpoint, max_size=None, open_timeout=10) as ws:
        log("WebSocket 握手成功（说明 token 有效）")
        try:
            message = await asyncio.wait_for(ws.recv(), timeout=8)
            log(f"收到第一帧：{str(message)[:300]}")
        except asyncio.TimeoutError:
            log("8 秒内没收到任何消息：接入点应该在等你这端说话，属正常")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="stdio MCP server <-> 小智接入点")
    parser.add_argument("--check", action="store_true", help="只验证 token 与握手")
    parser.add_argument("--server", default=str(DEFAULT_SERVER), help="MCP server 脚本")
    args = parser.parse_args(argv)

    cfg = config.load()
    if not cfg.endpoint:
        log("缺少 MCP_ENDPOINT：把 .env.example 复制成 .env 并填上接入点地址")
        return 2
    log(f"接入点 {config.redact(cfg.endpoint)}")
    log(f"superagent {cfg.api}")
    try:
        if args.check:
            asyncio.run(_check(cfg.endpoint))
        else:
            asyncio.run(_run(cfg.endpoint, Path(args.server)))
    except KeyboardInterrupt:
        log("退出")
    return 0


if __name__ == "__main__":
    sys.exit(main())
