import {
  InteractionRequiredAuthError,
  PublicClientApplication
} from "@azure/msal-browser";

export const config = { ...(window.ROULETTE_CONFIG || {}) };

let instancePromise;
let activeAccount;

function appRoot() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

function validateConfig() {
  const required = ["clientId", "tenantId", "apiScope", "apiBaseUrl"];
  const missing = required.filter((key) => {
    const value = String(config[key] || "");
    return !value || value.startsWith("YOUR_");
  });
  if (missing.length) {
    throw new Error(`Complete ${missing.join(", ")} in public/config.js before using the app.`);
  }
}

async function loadServerConfig() {
  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
  if (!apiBaseUrl || apiBaseUrl.startsWith("YOUR_")) {
    throw new Error("Complete apiBaseUrl in public/config.js before using the app.");
  }
  const response = await fetch(`${apiBaseUrl}/config`);
  if (!response.ok) throw new Error("Could not load Microsoft settings from the Roulette API.");
  Object.assign(config, await response.json(), { apiBaseUrl });
}

async function initialize() {
  await loadServerConfig();
  validateConfig();
  const instance = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: appRoot(),
      postLogoutRedirectUri: appRoot(),
      navigateToLoginRequestUrl: false
    },
    cache: { cacheLocation: "localStorage" }
  });

  await instance.initialize();
  const redirectResult = await instance.handleRedirectPromise();
  activeAccount = redirectResult?.account || instance.getActiveAccount() || instance.getAllAccounts()[0];
  if (activeAccount) instance.setActiveAccount(activeAccount);
  return instance;
}

export function getMsal() {
  if (!instancePromise) instancePromise = initialize();
  return instancePromise;
}

export async function getSignedInAccount() {
  await getMsal();
  return activeAccount || null;
}

export async function signIn() {
  const instance = await getMsal();
  await instance.loginRedirect({
    scopes: [config.apiScope],
    prompt: "select_account"
  });
}

export async function signOut() {
  const instance = await getMsal();
  await instance.logoutRedirect({
    account: activeAccount,
    postLogoutRedirectUri: appRoot()
  });
}

async function accessToken() {
  const instance = await getMsal();
  if (!activeAccount) throw new Error("Sign in is required.");
  const request = { account: activeAccount, scopes: [config.apiScope] };

  try {
    return (await instance.acquireTokenSilent(request)).accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect(request);
      return "";
    }
    throw error;
  }
}

export async function apiFetch(path, options = {}) {
  const token = await accessToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const apiRoot = String(config.apiBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${apiRoot}${path}`, { ...options, headers });
  if (response.status === 401) {
    throw new Error("Your session expired. Sign out and sign in again.");
  }
  return response;
}
