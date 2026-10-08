# Roulette Winnings Tracker

A tiny roulette winnings tracker with no database. It saves entries as plain text in `data/winnings.txt`.

## Run locally

```bash
python3 app.py
```

Then open:

```text
http://127.0.0.1:1186
```

## Run on the Linux server

On `192.168.101.150`, clone the repo and start the app:

```bash
git clone <your-repo-url>
cd Roulette
python3 app.py
```

Then open:

```text
http://192.168.101.150:1186
```

You can change the host or port:

```bash
HOST=0.0.0.0 PORT=8080 python3 app.py
```

## Run with HTTPS

The server can terminate HTTPS itself when `TLS_CERT_FILE` and `TLS_KEY_FILE` are set. To create a self-signed certificate for local testing:

```bash
./scripts/generate-dev-cert.sh localhost
cp .env.example .env
set -a
source .env
set +a
python3 app.py
```

Open `https://localhost:1186`. Because this is a self-signed development certificate, trust `certs/dev-cert.pem` on the computer or device opening the app. The generated certificate and private key are excluded from Git.

For the current Linux server IP, generate the certificate on that server with:

```bash
./scripts/generate-dev-cert.sh 192.168.101.150
```

Then change both Microsoft URLs in `.env` to use `https://192.168.101.150:1186`. Every client device must trust that self-signed certificate. A DNS name with a certificate issued by a trusted internal or public CA avoids browser certificate warnings. Existing CA-issued certificate and key files can be used directly through `TLS_CERT_FILE` and `TLS_KEY_FILE`.

## Microsoft SSO

The app supports Microsoft Entra ID sign-in using the authorization-code flow. When enabled, the page and every data API require an authenticated Microsoft session. By default, authentication is off so the app still runs locally without Entra credentials.

### 1. Register the app in Microsoft Entra

In the [Microsoft Entra admin center](https://entra.microsoft.com/):

1. Open **Entra ID > App registrations > New registration**.
2. Choose **Accounts in this organizational directory only** for an internal company app.
3. Under **Authentication**, add these two **Web** redirect URIs for local testing:

   ```text
   https://localhost:1186/auth/callback
   https://localhost:1186/signed-out
   ```

4. Under **Certificates & secrets**, create a client secret. Copy its **Value** immediately.
5. Copy the **Application (client) ID** and **Directory (tenant) ID** from the app overview.

The app requests only the standard OpenID Connect sign-in claims. It does not request Microsoft Graph access.

### 2. Configure and run it

Install the Microsoft authentication library:

```bash
python3 -m pip install -r requirements.txt
```

Copy the example configuration and fill in the three values from Entra. Change `AUTH_MODE=off` to `AUTH_MODE=microsoft`, then load it into the shell:

```bash
cp .env.example .env
set -a
source .env
set +a
python3 app.py
```

Then open `https://localhost:1186`. The app redirects to Microsoft, returns through `/auth/callback`, and creates an eight-hour local session.

The required settings are:

| Setting | Meaning |
| --- | --- |
| `AUTH_MODE=microsoft` | Enables Microsoft sign-in. |
| `MICROSOFT_CLIENT_ID` | Application (client) ID. |
| `MICROSOFT_CLIENT_SECRET` | Client secret **value**, not its ID. |
| `MICROSOFT_TENANT_ID` | Directory (tenant) ID. |
| `MICROSOFT_REDIRECT_URI` | Exact callback registered in Entra. |
| `MICROSOFT_POST_LOGOUT_REDIRECT_URI` | Page Microsoft returns to after logout. |

`MICROSOFT_ALLOWED_USERS` is optional. Set it to a comma-separated list such as `alex@example.com,sam@example.com` to limit access further. If omitted, any account in the configured tenant can sign in. All signed-in users currently share the same `data/winnings.txt` data.

### Production URL

Microsoft allows plain HTTP for localhost development. For a longer-lived Linux deployment, use a DNS name with a CA-issued certificate, either through the app's TLS settings or an HTTPS reverse proxy, and register exact production URLs such as:

```text
https://roulette.example.com/auth/callback
https://roulette.example.com/signed-out
```

Set `MICROSOFT_REDIRECT_URI` and `MICROSOFT_POST_LOGOUT_REDIRECT_URI` to those URLs and leave `COOKIE_SECURE=true`. Keep `.env` and the client secret out of Git. For a longer-lived production deployment, use a certificate credential instead of a client secret and use a persistent/shared session store if the app will run in more than one process.

## Data

Entries are saved in:

```text
data/winnings.txt
```

## Features

- Add daily roulette wins or losses.
- History shows the latest 10 events while totals and charts still use all saved entries.
- See totals for all time, this month, and best day.
- Browse the continuous profit line by week with previous and next controls.
- Switch between Week and Today chart tabs.
- Pick any date from the chart calendar to inspect that day only.
- Click a weekly chart point to zoom into that day.
- Click a day-chart point or history row edit button to update that timestamped entry.
- Track the daily goal of beating the previous day's winnings.
- Get playful alerts for wins, losses, chart edits, and clear days.
