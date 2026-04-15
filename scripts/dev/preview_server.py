#!/usr/bin/env python3

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPErrorProcessor
from urllib.error import HTTPError, URLError
import json
import os
import subprocess
import threading
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parents[2] / "out"
PROJECT_ROOT = ROOT.parent
BIND_HOST = "0.0.0.0"
LOCAL_PUBLIC_HOST = "127.0.0.1"
PORT = 3008
STATUS_PATH = PROJECT_ROOT / ".preview-admin-status.json"
REFERENCE_SYNC_OUTPUT_PATH = PROJECT_ROOT / "public" / "reference-price-sync.json"
REFERENCE_SYNC_COMMAND = ["npm", "run", "reference:sync"]
NEWS_IMPORT_COMMAND = ["npm", "run", "news:import"]
RSS_SOURCES = [
    "https://thewhiskeywash.com/feed/",
    "https://whiskyadvocate.com/Tag/news",
    "https://www.thespiritsbusiness.com/feed/",
    "https://www.drinkhacker.com/feed/",
]
REFERENCE_SYNC_SCHEDULE = "Weekly · Monday 9:00 AM KST"
state_lock = threading.Lock()


def load_project_env() -> None:
    env_path = PROJECT_ROOT / ".env.local"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_status() -> dict:
    return {
        "referenceSync": {
            "running": False,
            "status": "idle",
            "lastStartedAt": None,
            "lastFinishedAt": None,
            "lastSuccessAt": None,
            "lastError": None,
            "message": "",
        },
        "newsImport": {
            "running": False,
            "status": "idle",
            "lastStartedAt": None,
            "lastFinishedAt": None,
            "lastSuccessAt": None,
            "lastError": None,
            "message": "",
        }
    }


def load_status() -> dict:
    defaults = default_status()
    if STATUS_PATH.exists():
        try:
            saved = json.loads(STATUS_PATH.read_text())
            if not isinstance(saved, dict):
                return defaults
            merged = dict(defaults)
            for key, value in saved.items():
                if isinstance(value, dict) and isinstance(merged.get(key), dict):
                    merged[key] = {**merged[key], **value}
                else:
                    merged[key] = value
            return merged
        except Exception:
            return defaults
    return defaults


def save_status(data: dict) -> None:
    STATUS_PATH.write_text(json.dumps(data, indent=2))


STATUS = load_status()
load_project_env()


class NoRedirectHandler(HTTPErrorProcessor):
    def http_response(self, request, response):
        return response

    https_response = http_response


def probe_google_oauth() -> dict:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    anon_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not supabase_url or not anon_key:
        return {"configured": False, "label": "Not configured"}

    probe_url = f"{supabase_url}/auth/v1/authorize?provider=google&redirect_to=http://{LOCAL_PUBLIC_HOST}:{PORT}/login"
    request = Request(
        probe_url,
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "accept": "application/json",
        },
    )
    opener = build_opener(NoRedirectHandler)

    try:
        response = opener.open(request, timeout=10)
        location = response.headers.get("Location", "")
        if "accounts.google.com" in location:
            return {"configured": True, "label": "Configured"}
    except HTTPError as error:
        location = error.headers.get("Location", "")
        if "accounts.google.com" in location:
            return {"configured": True, "label": "Configured"}
        try:
            payload = json.loads(error.read().decode("utf-8") or "{}")
        except Exception:
            payload = {}
        if "Unsupported provider" in str(payload.get("msg", "")):
            return {"configured": False, "label": "Disabled"}
        return {"configured": False, "label": "Unavailable"}
    except URLError:
        return {"configured": False, "label": "Unavailable"}

    return {"configured": False, "label": "Unavailable"}


def get_news_ingestion_status() -> dict:
    news_path = PROJECT_ROOT / "public" / "news.json"
    if not news_path.exists():
        return {"available": False, "count": 0, "lastUpdatedAt": None, "label": "Unavailable"}

    try:
        payload = json.loads(news_path.read_text())
    except Exception:
        payload = []

    last_updated = datetime.fromtimestamp(news_path.stat().st_mtime, timezone.utc).isoformat()
    return {
        "available": True,
        "count": len(payload) if isinstance(payload, list) else 0,
        "lastUpdatedAt": last_updated,
        "label": "Healthy",
    }


def get_reference_sync_summary() -> dict:
    if not REFERENCE_SYNC_OUTPUT_PATH.exists():
        return {"matchedCount": None, "failedCount": None, "updatedAt": None}

    try:
        payload = json.loads(REFERENCE_SYNC_OUTPUT_PATH.read_text())
    except Exception:
        return {"matchedCount": None, "failedCount": None, "updatedAt": None}

    return {
        "matchedCount": payload.get("matched"),
        "failedCount": payload.get("failed", payload.get("fallback")),
        "updatedAt": payload.get("updatedAt"),
    }


def build_admin_status_payload() -> dict:
    with state_lock:
        reference_status = dict(STATUS.get("referenceSync", {}))
    reference_summary = get_reference_sync_summary()
    reference_status["matchedCount"] = reference_summary.get("matchedCount")
    reference_status["failedCount"] = reference_summary.get("failedCount")
    if reference_summary.get("updatedAt"):
        reference_status["lastSuccessAt"] = reference_summary.get("updatedAt")

    return {
        "referenceSync": reference_status,
        "newsImport": dict(STATUS.get("newsImport", {})),
        "settings": {
            "googleOAuth": probe_google_oauth(),
            "rssSources": RSS_SOURCES,
            "referenceSyncSchedule": REFERENCE_SYNC_SCHEDULE,
            "lastSyncTime": reference_summary.get("updatedAt") or reference_status.get("lastSuccessAt"),
            "newsIngestion": get_news_ingestion_status(),
        },
    }


def mark_reference_sync_running() -> None:
    STATUS["referenceSync"] = {
        "running": True,
        "status": "running",
        "lastStartedAt": iso_now(),
        "lastFinishedAt": None,
        "lastSuccessAt": STATUS.get("referenceSync", {}).get("lastSuccessAt"),
        "lastError": None,
        "message": "Reference sync is running.",
    }
    save_status(STATUS)


def run_reference_sync() -> None:
    with state_lock:
        if STATUS.get("referenceSync", {}).get("status") != "running":
            mark_reference_sync_running()

    try:
        result = subprocess.run(
            REFERENCE_SYNC_COMMAND,
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
        stdout = (result.stdout or "").strip()
        stderr = (result.stderr or "").strip()
        combined = stderr or stdout or "Reference sync finished."

        with state_lock:
            STATUS["referenceSync"] = {
                "running": False,
                "status": "success" if result.returncode == 0 else "failure",
                "lastStartedAt": STATUS.get("referenceSync", {}).get("lastStartedAt"),
                "lastFinishedAt": iso_now(),
                "lastSuccessAt": iso_now() if result.returncode == 0 else STATUS.get("referenceSync", {}).get("lastSuccessAt"),
                "lastError": None if result.returncode == 0 else combined[-400:],
                "message": combined[-400:],
            }
            save_status(STATUS)
    except Exception as error:
        with state_lock:
            STATUS["referenceSync"] = {
                "running": False,
                "status": "failure",
                "lastStartedAt": STATUS.get("referenceSync", {}).get("lastStartedAt"),
                "lastFinishedAt": iso_now(),
                "lastSuccessAt": STATUS.get("referenceSync", {}).get("lastSuccessAt"),
                "lastError": str(error),
                "message": str(error),
            }
            save_status(STATUS)


def mark_news_import_running() -> None:
    STATUS["newsImport"] = {
        "running": True,
        "status": "running",
        "lastStartedAt": iso_now(),
        "lastFinishedAt": None,
        "lastSuccessAt": STATUS.get("newsImport", {}).get("lastSuccessAt"),
        "lastError": None,
        "message": "News import is running.",
    }
    save_status(STATUS)


def run_news_import() -> None:
    with state_lock:
        if STATUS.get("newsImport", {}).get("status") != "running":
            mark_news_import_running()

    try:
        import_result = subprocess.run(
            NEWS_IMPORT_COMMAND,
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )

        build_result = None
        if import_result.returncode == 0:
            build_result = subprocess.run(
                ["npm", "run", "build"],
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                timeout=900,
                check=False,
            )

        outputs = [part.strip() for part in [
            import_result.stderr if import_result else "",
            import_result.stdout if import_result else "",
            build_result.stderr if build_result else "",
            build_result.stdout if build_result else "",
        ] if part and part.strip()]
        combined = "\n".join(outputs) or "News import finished."
        success = import_result.returncode == 0 and (build_result is None or build_result.returncode == 0)
        import_summary = ""
        if import_result and import_result.stdout:
            for line in reversed(import_result.stdout.splitlines()):
                line = line.strip()
                if line.startswith("[news-import]"):
                    import_summary = line.replace("[news-import] ", "", 1)
                    break
        message = (
            f"News import completed. {import_summary}" if success and import_summary else
            "News import completed and site rebuilt." if success else
            combined[-400:]
        )

        with state_lock:
            STATUS["newsImport"] = {
                "running": False,
                "status": "success" if success else "failure",
                "lastStartedAt": STATUS.get("newsImport", {}).get("lastStartedAt"),
                "lastFinishedAt": iso_now(),
                "lastSuccessAt": iso_now() if success else STATUS.get("newsImport", {}).get("lastSuccessAt"),
                "lastError": None if success else combined[-400:],
                "message": message,
            }
            save_status(STATUS)
    except Exception as error:
        with state_lock:
            STATUS["newsImport"] = {
                "running": False,
                "status": "failure",
                "lastStartedAt": STATUS.get("newsImport", {}).get("lastStartedAt"),
                "lastFinishedAt": iso_now(),
                "lastSuccessAt": STATUS.get("newsImport", {}).get("lastSuccessAt"),
                "lastError": str(error),
                "message": str(error),
            }
            save_status(STATUS)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = False
    request_queue_size = 64

    def handle_error(self, request, client_address):
        print(f"Preview server error from {client_address}", flush=True)
        super().handle_error(request, client_address)


class PreviewHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send_json(self, payload: dict, status_code: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/__health"):
            self._send_json({"ok": True, "time": iso_now()})
            return
        if self.path.startswith("/__admin/status"):
            self._send_json(build_admin_status_payload())
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/__admin/reference-sync"):
            with state_lock:
                if STATUS.get("referenceSync", {}).get("running"):
                    self._send_json(build_admin_status_payload(), 202)
                    return
                mark_reference_sync_running()
                thread = threading.Thread(target=run_reference_sync, daemon=True)
                thread.start()
            self._send_json(build_admin_status_payload(), 202)
            return
        if self.path.startswith("/__admin/news-import"):
            with state_lock:
                if STATUS.get("newsImport", {}).get("running"):
                    self._send_json(build_admin_status_payload(), 202)
                    return
                mark_news_import_running()
                thread = threading.Thread(target=run_news_import, daemon=True)
                thread.start()
            self._send_json(build_admin_status_payload(), 202)
            return
        self.send_error(404, "Not found")

    def translate_path(self, path: str) -> str:
        parts = urlsplit(path)
        clean_path = parts.path

        if clean_path in ("", "/"):
            target = ROOT / "index.html"
        else:
            stripped = clean_path.lstrip("/")
            direct_target = ROOT / stripped
            html_target = ROOT / f"{stripped}.html"

            if direct_target.exists():
                target = direct_target
            elif html_target.exists():
                target = html_target
            else:
                target = ROOT / stripped

        return str(target)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        print(f"[preview] {self.address_string()} - {format % args}", flush=True)


def main() -> None:
    handler = partial(PreviewHandler, directory=str(ROOT))
    server = ReusableThreadingHTTPServer((BIND_HOST, PORT), handler)
    print(
        f"Preview server running at http://{LOCAL_PUBLIC_HOST}:{PORT} (bound to {BIND_HOST})",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
