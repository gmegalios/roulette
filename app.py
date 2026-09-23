from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
import json
import mimetypes
import os
import random
import re
import time
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "winnings.txt"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "1186"))


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
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/entries":
            self.send_json(200, {"entries": read_entries()})
            return

        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
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

    def do_DELETE(self):
        parsed = urlparse(self.path)
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
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    ensure_data_file()
    server = ThreadingHTTPServer((HOST, PORT), RouletteHandler)
    print(f"Roulette tracker running at http://{HOST}:{PORT}")
    print(f"From your Linux server, open http://192.168.101.150:{PORT}")
    print(f"Saving data in {DATA_FILE}")
    server.serve_forever()
