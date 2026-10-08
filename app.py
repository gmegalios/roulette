from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, unquote, urlparse
from http.cookies import SimpleCookie
from html import escape
import json
import mimetypes
import os
import random
import re
import secrets
import ssl
import threading
import time
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "winnings.txt"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "1186"))
TLS_CERT_FILE = os.environ.get("TLS_CERT_FILE", "").strip()
TLS_KEY_FILE = os.environ.get("TLS_KEY_FILE", "").strip()
DEFAULT_SCHEME = "https" if TLS_CERT_FILE and TLS_KEY_FILE else "http"
AUTH_MODE = os.environ.get("AUTH_MODE", "off").strip().lower()
MICROSOFT_CLIENT_ID = os.environ.get("MICROSOFT_CLIENT_ID", "").strip()
MICROSOFT_CLIENT_SECRET = os.environ.get("MICROSOFT_CLIENT_SECRET", "").strip()
MICROSOFT_TENANT_ID = os.environ.get("MICROSOFT_TENANT_ID", "").strip()
MICROSOFT_REDIRECT_URI = os.environ.get(
    "MICROSOFT_REDIRECT_URI", f"{DEFAULT_SCHEME}://localhost:{PORT}/auth/callback"
).strip()
MICROSOFT_POST_LOGOUT_REDIRECT_URI = os.environ.get(
    "MICROSOFT_POST_LOGOUT_REDIRECT_URI", f"{DEFAULT_SCHEME}://localhost:{PORT}/signed-out"
).strip()
MICROSOFT_ALLOWED_USERS = {
    value.strip().lower()
    for value in os.environ.get("MICROSOFT_ALLOWED_USERS", "").split(",")
    if value.strip()
}
SESSION_COOKIE = "roulette_session"
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", str(8 * 60 * 60)))
MAX_SESSIONS = int(os.environ.get("MAX_SESSIONS", "10000"))
COOKIE_SECURE = os.environ.get(
    "COOKIE_SECURE", "true" if MICROSOFT_REDIRECT_URI.startswith("https://") else "false"
).strip().lower() in {"1", "true", "yes", "on"}
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()


def microsoft_auth_enabled():
    return AUTH_MODE == "microsoft"


def tls_enabled():
    return bool(TLS_CERT_FILE and TLS_KEY_FILE)


def validate_tls_config():
    if bool(TLS_CERT_FILE) != bool(TLS_KEY_FILE):
        raise RuntimeError("Set both TLS_CERT_FILE and TLS_KEY_FILE to enable HTTPS.")
    for name, value in (("TLS_CERT_FILE", TLS_CERT_FILE), ("TLS_KEY_FILE", TLS_KEY_FILE)):
        if value and not Path(value).expanduser().is_file():
            raise RuntimeError(f"{name} does not exist: {value}")


def enable_tls(server):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(
        certfile=str(Path(TLS_CERT_FILE).expanduser()),
        keyfile=str(Path(TLS_KEY_FILE).expanduser()),
    )
    server.socket = context.wrap_socket(server.socket, server_side=True)


def validate_auth_config():
    if AUTH_MODE not in {"off", "microsoft"}:
        raise RuntimeError("AUTH_MODE must be either 'off' or 'microsoft'.")
    if not microsoft_auth_enabled():
        return

    missing = [
        name
        for name, value in (
            ("MICROSOFT_CLIENT_ID", MICROSOFT_CLIENT_ID),
            ("MICROSOFT_CLIENT_SECRET", MICROSOFT_CLIENT_SECRET),
            ("MICROSOFT_TENANT_ID", MICROSOFT_TENANT_ID),
            ("MICROSOFT_REDIRECT_URI", MICROSOFT_REDIRECT_URI),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(f"Microsoft authentication is missing: {', '.join(missing)}")

    try:
        import msal  # noqa: F401
    except ImportError as error:
        raise RuntimeError(
            "Microsoft authentication requires the 'msal' package. "
            "Run: python3 -m pip install -r requirements.txt"
        ) from error


def microsoft_client():
    import msal

    return msal.ConfidentialClientApplication(
        MICROSOFT_CLIENT_ID,
        authority=f"https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}",
        client_credential=MICROSOFT_CLIENT_SECRET,
    )


def new_session(values=None):
    session_id = secrets.token_urlsafe(32)
    session = {
        "created_at": time.time(),
        "csrf_token": secrets.token_urlsafe(32),
    }
    if values:
        session.update(values)
    with SESSIONS_LOCK:
        now = time.time()
        expired = [
            key
            for key, value in SESSIONS.items()
            if now - value["created_at"] > SESSION_TTL_SECONDS
        ]
        for key in expired:
            SESSIONS.pop(key, None)
        if len(SESSIONS) >= MAX_SESSIONS:
            oldest = min(SESSIONS, key=lambda key: SESSIONS[key]["created_at"])
            SESSIONS.pop(oldest, None)
        SESSIONS[session_id] = session
    return session_id, session


def get_session(session_id):
    if not session_id:
        return None
    with SESSIONS_LOCK:
        session = SESSIONS.get(session_id)
        if not session:
            return None
        if time.time() - session["created_at"] > SESSION_TTL_SECONDS:
            SESSIONS.pop(session_id, None)
            return None
        return session


def delete_session(session_id):
    if session_id:
        with SESSIONS_LOCK:
            SESSIONS.pop(session_id, None)


def ensure_data_file():
    DATA_DIR.mkdir(exist_ok=True)
    DATA_FILE.touch(exist_ok=True)


def encode_field(value):
    return quote(str(value or "").replace("\n", " ").replace("\r", " ").strip(), safe="")


def decode_field(value):
    return unquote(value or "")


def parse_entry(line):
    parts = line.rstrip("\n").split("|")
    if len(parts) < 5:
        return None

    entry_id, date, amount, note, created_at = parts[:5]
    try:
        amount_value = float(amount)
    except ValueError:
        return None

    return {
        "id": entry_id,
        "date": date,
        "amount": amount_value,
        "note": decode_field(note),
        "createdAt": created_at,
    }


def read_entries():
    ensure_data_file()
    entries = []
    for line in DATA_FILE.read_text(encoding="utf-8").splitlines():
        if line.strip():
            entry = parse_entry(line)
            if entry:
                entries.append(entry)

    return sorted(entries, key=lambda item: (item["date"], item["createdAt"]), reverse=True)


def write_entries(entries):
    lines = []
    for entry in entries:
        lines.append(
            "|".join(
                [
                    entry["id"],
                    entry["date"],
                    f'{float(entry["amount"]):.2f}',
                    encode_field(entry.get("note", "")),
                    entry["createdAt"],
                ]
            )
        )

    DATA_FILE.write_text(("\n".join(lines) + "\n") if lines else "", encoding="utf-8")


def is_valid_date(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value or ""):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def clean_entry(body):
    date = str(body.get("date", "")).strip()
    note = str(body.get("note", "")).strip()[:140]

    try:
        amount = float(body.get("amount"))
    except (TypeError, ValueError):
        return None, "Enter a valid win or loss amount."

    if not is_valid_date(date):
        return None, "Choose a valid date."

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {
        "id": f"{int(time.time() * 1000)}-{random.randrange(16**8):08x}",
        "date": date,
        "amount": amount,
        "note": note,
        "createdAt": now,
    }, None


class RouletteHandler(SimpleHTTPRequestHandler):
    def session_id(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return ""
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else ""

    def current_session(self):
        return get_session(self.session_id())

    def cookie_header(self, session_id, max_age=None):
        parts = [
            f"{SESSION_COOKIE}={session_id}",
            "Path=/",
            "HttpOnly",
            "SameSite=Lax",
        ]
        if COOKIE_SECURE:
            parts.append("Secure")
        if max_age is not None:
            parts.append(f"Max-Age={max_age}")
        return "; ".join(parts)

    def redirect(self, location, cookie=None):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def send_html(self, status, title, message, action_url="/login", action_label="Sign in"):
        body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title><style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e312a;color:#fffaf0;font:16px system-ui}}
main{{width:min(460px,calc(100% - 40px));padding:36px;border:1px solid #ffffff38;border-radius:12px;background:#143830;box-shadow:0 22px 64px #0005}}
h1{{margin:0 0 14px}}p{{color:#cfddd4;line-height:1.55}}a{{display:inline-block;margin-top:12px;padding:12px 18px;border-radius:8px;background:#ffd76a;color:#17372f;font-weight:800;text-decoration:none}}
</style></head><body><main><h1>{escape(title)}</h1><p>{escape(message)}</p><a href="{escape(action_url, quote=True)}">{escape(action_label)}</a></main></body></html>""".encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def require_authentication(self, path):
        if not microsoft_auth_enabled():
            return None
        session = self.current_session()
        if session and session.get("user"):
            return session
        if path.startswith("/api/"):
            self.send_json(401, {"error": "Sign in with Microsoft to continue."})
        else:
            self.redirect(f"/login?{urlencode({'next': path})}")
        return False

    def require_csrf(self, session):
        if not microsoft_auth_enabled():
            return True
        supplied = self.headers.get("X-CSRF-Token", "")
        expected = session.get("csrf_token", "") if session else ""
        if supplied and expected and secrets.compare_digest(supplied, expected):
            return True
        self.send_json(403, {"error": "The request could not be verified. Refresh and try again."})
        return False

    def start_microsoft_login(self, parsed):
        query = parse_qs(parsed.query)
        next_path = query.get("next", ["/"])[-1]
        if not next_path.startswith("/") or next_path.startswith("//"):
            next_path = "/"
        try:
            flow = microsoft_client().initiate_auth_code_flow(
                scopes=[],
                redirect_uri=MICROSOFT_REDIRECT_URI,
            )
        except Exception as error:
            print(f"Microsoft sign-in could not start: {error}")
            self.send_html(503, "Sign-in unavailable", "Microsoft sign-in is temporarily unavailable.")
            return
        if "auth_uri" not in flow:
            self.send_html(503, "Sign-in unavailable", "Microsoft sign-in could not be started.")
            return
        session_id, _ = new_session({"auth_flow": flow, "next": next_path})
        self.redirect(
            flow["auth_uri"],
            self.cookie_header(session_id, SESSION_TTL_SECONDS),
        )

    def complete_microsoft_login(self, parsed):
        old_session_id = self.session_id()
        session = get_session(old_session_id)
        if not session or not session.get("auth_flow"):
            self.send_html(400, "Sign-in expired", "Start the Microsoft sign-in process again.")
            return

        query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        try:
            result = microsoft_client().acquire_token_by_auth_code_flow(
                session["auth_flow"], query
            )
        except ValueError:
            self.send_html(400, "Sign-in could not be verified", "Start the Microsoft sign-in process again.")
            return
        except Exception as error:
            print(f"Microsoft sign-in could not finish: {error}")
            self.send_html(503, "Sign-in unavailable", "Microsoft sign-in is temporarily unavailable.")
            return

        claims = result.get("id_token_claims")
        if not claims:
            detail = result.get("error_description") or "Microsoft did not return a valid identity."
            self.send_html(401, "Microsoft sign-in failed", detail)
            return

        username = (claims.get("preferred_username") or claims.get("email") or "").lower()
        if MICROSOFT_ALLOWED_USERS and username not in MICROSOFT_ALLOWED_USERS:
            delete_session(old_session_id)
            self.send_html(403, "Access denied", "This Microsoft account is not allowed to use the app.")
            return

        user = {
            "name": claims.get("name") or username or "Microsoft user",
            "username": username,
            "tenantId": claims.get("tid", ""),
            "objectId": claims.get("oid", ""),
        }
        next_path = session.get("next", "/")
        delete_session(old_session_id)
        new_session_id, _ = new_session({"user": user})
        self.redirect(
            next_path,
            self.cookie_header(new_session_id, SESSION_TTL_SECONDS),
        )

    def sign_out(self):
        delete_session(self.session_id())
        logout_url = (
            f"https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/logout?"
            + urlencode({"post_logout_redirect_uri": MICROSOFT_POST_LOGOUT_REDIRECT_URI})
        )
        self.redirect(logout_url, self.cookie_header("", 0))

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/login" and microsoft_auth_enabled():
            self.start_microsoft_login(parsed)
            return
        if parsed.path == "/auth/callback" and microsoft_auth_enabled():
            self.complete_microsoft_login(parsed)
            return
        if parsed.path == "/logout" and microsoft_auth_enabled():
            self.sign_out()
            return
        if parsed.path == "/signed-out" and microsoft_auth_enabled():
            self.send_html(200, "Signed out", "Your Roulette session has ended.")
            return

        session = self.require_authentication(parsed.path)
        if session is False:
            return

        if parsed.path == "/api/auth":
            self.send_json(200, {
                "enabled": microsoft_auth_enabled(),
                "user": session.get("user") if session else None,
                "csrfToken": session.get("csrf_token") if session else None,
            })
            return
        if parsed.path == "/api/entries":
            self.send_json(200, {"entries": read_entries()})
            return

        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        session = self.require_authentication(parsed.path)
        if session is False or not self.require_csrf(session):
            return
        if parsed.path != "/api/entries":
            self.send_json(404, {"error": "Not found."})
            return

        try:
            body = self.read_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"error": "The entry could not be read."})
            return

        entry, error = clean_entry(body)
        if error:
            self.send_json(400, {"error": error})
            return

        entries = read_entries()
        entries.append(entry)
        write_entries(entries)
        self.send_json(201, {"entry": entry})

    def do_PUT(self):
        parsed = urlparse(self.path)
        session = self.require_authentication(parsed.path)
        if session is False or not self.require_csrf(session):
            return
        entry_prefix = "/api/entries/"
        day_prefix = "/api/day/"

        if parsed.path.startswith(entry_prefix):
            entry_id = unquote(parsed.path[len(entry_prefix):])
            entries = read_entries()
            original = next((item for item in entries if item["id"] == entry_id), None)
            if not original:
                self.send_json(404, {"error": "Entry not found."})
                return

            try:
                body = self.read_json_body()
            except json.JSONDecodeError:
                self.send_json(400, {"error": "The entry could not be read."})
                return

            entry, error = clean_entry(body)
            if error:
                self.send_json(400, {"error": error})
                return

            entry["id"] = original["id"]
            entry["createdAt"] = original["createdAt"]
            next_entries = [entry if item["id"] == entry_id else item for item in entries]
            write_entries(next_entries)
            self.send_json(200, {"entry": entry})
            return

        if not parsed.path.startswith(day_prefix):
            self.send_json(404, {"error": "Not found."})
            return

        date = unquote(parsed.path[len(day_prefix):])
        if not is_valid_date(date):
            self.send_json(400, {"error": "Choose a valid date."})
            return

        try:
            body = self.read_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"error": "The entry could not be read."})
            return

        body["date"] = date
        entry, error = clean_entry(body)
        if error:
            self.send_json(400, {"error": error})
            return

        entries = [item for item in read_entries() if item["date"] != date]
        if entry["amount"] != 0 or entry["note"]:
            entries.append(entry)

        write_entries(entries)
        self.send_json(200, {"entry": entry})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        session = self.require_authentication(parsed.path)
        if session is False or not self.require_csrf(session):
            return
        prefix = "/api/entries/"
        if not parsed.path.startswith(prefix):
            self.send_json(404, {"error": "Not found."})
            return

        entry_id = unquote(parsed.path[len(prefix):])
        entries = read_entries()
        next_entries = [entry for entry in entries if entry["id"] != entry_id]
        if len(next_entries) == len(entries):
            self.send_json(404, {"error": "Entry not found."})
            return

        write_entries(next_entries)
        self.send_json(200, {"ok": True})

    def serve_static(self, request_path):
        relative = "index.html" if request_path == "/" else request_path.lstrip("/")
        file_path = (PUBLIC_DIR / relative).resolve()

        if PUBLIC_DIR not in file_path.parents and file_path != PUBLIC_DIR:
            self.send_error(403)
            return

        if file_path.is_dir():
            file_path = file_path / "index.html"

        if not file_path.exists():
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        message = format % args
        message = re.sub(r"(/auth/callback)\?[^ ]+", r"\1?[redacted]", message)
        print(f"{self.address_string()} - {message}")


if __name__ == "__main__":
    validate_tls_config()
    validate_auth_config()
    ensure_data_file()
    server = ThreadingHTTPServer((HOST, PORT), RouletteHandler)
    if tls_enabled():
        enable_tls(server)
    scheme = "https" if tls_enabled() else "http"
    print(f"Roulette tracker running at {scheme}://{HOST}:{PORT}")
    print(f"From your Linux server, open {scheme}://192.168.101.150:{PORT}")
    print(f"Saving data in {DATA_FILE}")
    print(f"Authentication: {AUTH_MODE}")
    server.serve_forever()
