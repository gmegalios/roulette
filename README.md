# Roulette Winnings

The tracker is a React single-page app hosted by GitHub Pages. Users sign in with Microsoft Entra ID, and a Node.js API on the Linux server validates their Microsoft access token and stores the shared history in PostgreSQL.

## Architecture

- **React/Vite frontend:** `https://gmegalios.github.io/roulette/`
- **Node API:** runs on the Linux server, normally `https://192.168.101.150:1188`
- **PostgreSQL:** accessed only by the Node API
- **Microsoft SSO:** MSAL Browser authorization-code flow with PKCE

Database passwords and Microsoft client secrets must never be placed in `public/config.js` or committed. A browser SPA does not use a client secret.

## 1. Create the PostgreSQL table

Run [database/schema.sql](database/schema.sql) in the target PostgreSQL database. If a previous query left the transaction in an error state, run `ROLLBACK;` first.

## 2. Finish the Microsoft Entra registration

Open the existing **Risk** app registration.

1. Open **Authentication** and add a **Single-page application** platform.
2. Add this SPA redirect URI exactly:

   ```text
   https://gmegalios.github.io/roulette/
   ```

3. Open **Expose an API**.
4. Set the Application ID URI to:

   ```text
   api://165ff163-b87e-4146-a275-4d4dab68b733
   ```

5. Add a delegated scope named `access_as_user`. Allow admins and users to consent, then enable the scope.
6. Open **API permissions**, add the app's `access_as_user` delegated permission, and grant admin consent if your tenant requires it.

The older Web redirect URLs and client secret are not used by the React app. They may be removed after the old Python service is retired.

The API returns the public tenant ID, client ID, and API scope to the React app from `/config`. Only the API URL is stored in `public/config.js`.

## 3. Run the API on Linux

Install Node.js 22.12 or newer, pull the repository, and install dependencies:

```bash
git pull
npm ci --omit=dev
cp .env.example .env
nano .env
```

Set `DATABASE_URL` and `MICROSOFT_TENANT_ID` in `.env`. Do not paste `.env` or the database password into GitHub.

If the PostgreSQL server requires TLS, use:

```text
DATABASE_SSL=require
```

For the existing HTTPS certificate on the Linux server, keep:

```text
TLS_CERT_FILE=certs/dev-cert.pem
TLS_KEY_FILE=certs/dev-key.pem
```

Start the API:

```bash
npm run start:api
```

Test its public health endpoint from a browser that can reach the Linux server:

```text
https://192.168.101.150:1188/health
```

It should return `{"ok":true}`. The certificate must be trusted by every browser that opens the GitHub Page. The API accepts cross-origin calls only from `https://gmegalios.github.io` by default.

## 4. Publish GitHub Pages

Every push to `main` runs `.github/workflows/pages.yml`, builds the React app, and deploys `dist` to GitHub Pages. In the repository settings, **Pages > Build and deployment > Source** must be set to **GitHub Actions**.

## Local development

```bash
npm install
npm run dev
```

The Vite development URL also needs to be registered as an Entra SPA redirect and added to `ALLOWED_ORIGINS` before Microsoft login and API calls will work locally.

## Features

- Add, edit, and delete wins or losses.
- Shared PostgreSQL history with the creator's Microsoft name and username.
- All-time, monthly, and best-entry totals.
- Continuous weekly profit chart and detailed daily chart.
- Date selection, week navigation, daily targets, and result alerts.
- Tenant-restricted Microsoft SSO and bearer-token API authorization.
