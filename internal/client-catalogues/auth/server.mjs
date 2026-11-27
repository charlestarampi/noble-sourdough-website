import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { authCss, authFormScript, authPage } from "./pages.mjs";

const accessCookie = "__Host-noble-access";
const refreshCookie = "__Host-noble-refresh";
const formCookie = "__Host-noble-form";
const roleKey = "product_profile_role";
const sharedEmail = process.env.PRODUCT_PROFILE_SHARED_EMAIL?.trim().toLowerCase();
const individualAccounts = process.env.PRODUCT_PROFILE_ACCOUNT_MODE === "individual";
const loginMode = individualAccounts ? "individual" : sharedEmail ? "shared" : "invite";
const dashboardManaged = loginMode !== "invite";
const roles = new Set(["admin", "viewer"]);
const appOrigin = process.env.PRODUCT_PROFILE_ORIGIN || "https://admin.noblesourdough.com";
const trustedOrigins = new Set([appOrigin]);
if (process.env.VERCEL_URL) trustedOrigins.add(`https://${process.env.VERCEL_URL}`);
const contentRoot = process.env.PRODUCT_PROFILE_CONTENT || join(dirname(fileURLToPath(import.meta.url)), "catalogue");
const backend = process.env.SUPABASE_URL;
const apiKey = process.env.SUPABASE_ANON_KEY;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const types = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  webp: "image/webp",
  otf: "font/otf",
  ttf: "font/ttf"
};
const guestPages = new Set(dashboardManaged ? ["/sign-in"] : ["/sign-in", "/forgot-password", "/set-password"]);
const productActions = `
  <div class="profile-actions">
    <a href="/download.csv">Download products</a>
    {{ADMIN_LINK}}
    <form action="/sign-out" method="post">{{FORM_TOKEN}}<button type="submit">Sign out</button></form>
  </div>`;
const actionCss = `
.profile-actions { display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; }
.profile-actions a, .profile-actions button { color:#0d3d99; font:inherit; font-weight:700; }
.profile-actions button { border:1px solid currentColor; border-radius:99px; padding:5px 12px; background:transparent; cursor:pointer; }
.page-header:has(.profile-actions) { gap:8px 16px; flex-wrap:wrap; }
`;

function send(response, status, content, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type });
  response.end(content);
}

function redirect(response, path) {
  response.writeHead(303, { Location: path });
  response.end();
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function addCookies(response, ...cookies) {
  const existing = response.getHeader("Set-Cookie");
  response.setHeader("Set-Cookie", [].concat(existing || [], cookies));
}

function saveSession(response, session) {
  addCookies(response,
    cookie(accessCookie, session.access_token, session.expires_in || 3600),
    cookie(refreshCookie, session.refresh_token, 7 * 86400)
  );
}

function clearSession(response) {
  addCookies(response, cookie(accessCookie, "", 0), cookie(refreshCookie, "", 0));
}

function readCookie(request, name) {
  const value = request.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  try {
    return value && decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function validFormToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function formToken(request, response) {
  const existing = readCookie(request, formCookie);
  if (validFormToken(existing)) return existing;
  const token = randomBytes(32).toString("hex");
  addCookies(response, `${formCookie}=${token}; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Strict`);
  return token;
}

function verifyForm(request, token) {
  const existing = readCookie(request, formCookie);
  return validFormToken(existing) && validFormToken(token) &&
    timingSafeEqual(Buffer.from(existing, "hex"), Buffer.from(token, "hex"));
}

async function authRequest(path, { method = "GET", payload, access, admin = false } = {}) {
  if (!backend || !apiKey || (admin && !adminKey)) return { status: 503 };
  const key = admin ? adminKey : apiKey;
  const headers = { apikey: key };
  if (access || (admin && !key.startsWith("sb_secret_"))) headers.Authorization = `Bearer ${access || key}`;
  if (payload) headers["Content-Type"] = "application/json";

  try {
    const result = await fetch(`${backend.replace(/\/$/, "")}/auth/v1${path}`, {
      method, headers, body: payload && JSON.stringify(payload), signal: AbortSignal.timeout(7000)
    });
    const data = result.status === 204 ? undefined : await result.json();
    return { status: result.status, data };
  } catch {
    return { status: 503 };
  }
}

function profileRole(user) {
  if (!user?.email_confirmed_at) return;
  if (individualAccounts) return validEmail(user.email) ? "viewer" : undefined;
  if (sharedEmail) return user.email?.toLowerCase() === sharedEmail ? "viewer" : undefined;
  const role = user.app_metadata?.[roleKey];
  return roles.has(role) ? role : undefined;
}

function refreshSession(refresh) {
  return authRequest("/token?grant_type=refresh_token", {
    method: "POST", payload: { refresh_token: refresh }
  });
}

async function authenticate(request, response, renew) {
  const access = readCookie(request, accessCookie);
  if (access) {
    const result = await authRequest("/user", { access });
    if (result.status === 200) return profileRole(result.data);
    if (result.status >= 500) return;
  }
  const refresh = readCookie(request, refreshCookie);
  if (renew && refresh) {
    const result = await refreshSession(refresh);
    const role = profileRole(result.data?.user);
    if (result.status === 200 && role) {
      saveSession(response, result.data);
      return role;
    }
    if (result.status < 500) clearSession(response);
  }
}

async function formValues(request) {
  if (!request.headers["content-type"]?.startsWith("application/x-www-form-urlencoded") ||
      Number(request.headers["content-length"]) > 2048) return;
  if (request.body instanceof URLSearchParams) return request.body;
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return new URLSearchParams(Object.entries(request.body).filter(([, value]) => typeof value === "string"));
  }
  if (request.body !== undefined) {
    return Buffer.byteLength(request.body) <= 2048 ? new URLSearchParams(request.body.toString()) : undefined;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) return;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function validEmail(value) {
  return value && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validLink(token, type) {
  return /^[A-Za-z0-9_-]{20,256}$/.test(token || "") && ["invite", "recovery"].includes(type);
}

async function guestPost(response, path, form) {
  const username = form.get("username")?.trim().toLowerCase();
  const email = dashboardManaged && username === "admin"
    ? sharedEmail
    : (individualAccounts ? username : loginMode === "invite" ? form.get("email")?.trim() : undefined);
  const password = form.get("password");
  if (path === "/sign-in") {
    if (validEmail(email) && password && Buffer.byteLength(password) <= 72) {
      const result = await authRequest("/token?grant_type=password", {
        method: "POST", payload: { email, password }
      });
      if (result.status === 200 && profileRole(result.data?.user)) {
        saveSession(response, result.data);
        return redirect(response, dashboardManaged ? "/#raiz" : "/");
      }
      const reason = new Set(["invalid_credentials", "email_not_confirmed", "over_request_rate_limit"]).has(result.data?.error_code)
        ? result.data.error_code
        : "other";
      if (result.status >= 500) {
        console.error("product-profile provider unavailable", { providerStatus: result.status, reason });
        return send(response, 503, "Sign-in is temporarily unavailable. Please try again.");
      }
    }
    return redirect(response, "/sign-in?notice=incorrect");
  }

  if (path === "/forgot-password") {
    if (validEmail(email)) await authRequest("/recover", { method: "POST", payload: { email } });
    return redirect(response, "/forgot-password?notice=recovery");
  }

  const token = form.get("token");
  const type = form.get("type");
  if (!validLink(token, type) || !password || password.length < 14 || Buffer.byteLength(password) > 72) {
    return send(response, 400, "Use a valid invitation or reset link and a password of at least 14 characters and at most 72 bytes.");
  }

  const verified = await authRequest("/verify", {
    method: "POST", payload: { token_hash: token, type }
  });
  const access = verified.data?.access_token;
  if (verified.status !== 200 || !access || !profileRole(verified.data.user)) {
    return send(response, 400, authPage("/set-password"), types.html);
  }

  const updated = await authRequest("/user", { method: "PUT", access, payload: { password } });
  await authRequest("/logout?scope=global", { method: "POST", access });
  if (updated.status !== 200) {
    return send(response, 400, "The password could not be saved. Request a new reset link and choose a different password.");
  }
  clearSession(response);
  return redirect(response, "/sign-in?notice=updated");
}

async function invite(response, email) {
  if (!validEmail(email) || !adminKey) return redirect(response, "/manage-access?notice=inviteFailed");
  const invited = await authRequest("/invite", { method: "POST", admin: true, payload: { email } });
  const userId = invited.data?.id;
  if (invited.status >= 300 || !/^[a-f0-9-]{36}$/i.test(userId || "")) {
    return redirect(response, "/manage-access?notice=inviteFailed");
  }
  const granted = await authRequest(`/admin/users/${userId}`, {
    method: "PUT", admin: true, payload: { app_metadata: { [roleKey]: "viewer" } }
  });
  return redirect(response, `/manage-access?notice=${granted.status === 200 ? "invited" : "inviteFailed"}`);
}

function quoteCsv(value) {
  let text = String(value ?? "");
  if (/^(?:\s*[=+@-]|[\t\r\n])/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function download(response) {
  const catalogue = JSON.parse(await readFile(join(contentRoot, "catalogues.json"), "utf8"));
  const rows = [["Client", "Range", "Product", "Internal SKU", "Customer SKU", "Dimensions (cm)", "Estimated dimensions", "Weight (g)"]];
  for (const range of catalogue.ranges) {
    for (const product of range.products) {
      rows.push([range.client, range.label, product.name, product.internalSku, product.customerSku,
        product.dimensions?.valuesCm?.join(" × "), product.dimensions?.estimated ? "Yes" : "", product.weightG]);
    }
  }
  response.setHeader("Content-Disposition", 'attachment; filename="noble-product-profile.csv"');
  send(response, 200, "\uFEFF" + rows.map((row) => row.map(quoteCsv).join(",")).join("\r\n"), "text/csv; charset=utf-8");
}

async function serveFile(response, path, headOnly) {
  const relativePath = path.slice(1);
  const file = join(contentRoot, relativePath);
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) return send(response, 404, "Not found");
  const type = types[file.split(".").at(-1)];
  response.writeHead(200, { "Content-Type": type, "Content-Length": info.size });
  if (headOnly) return response.end();
  await pipeline(createReadStream(file), response);
}

export default async function handle(request, response) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  // Preserve the origin on browser form submissions without sharing the URL path.
  response.setHeader("Referrer-Policy", "strict-origin");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  try {
    const url = new URL(request.url, appOrigin);
    const path = url.pathname;
    const method = request.method;
    if (dashboardManaged && ["/forgot-password", "/set-password", "/manage-access"].includes(path)) {
      return send(response, 404, "Not found");
    }

    if (method === "POST") {
      const origin = request.headers.origin;
      if (origin && origin !== "null" && !trustedOrigins.has(origin)) {
        return send(response, 403, "Invalid request origin");
      }
      const form = await formValues(request);
      if (!form) return send(response, 400, "Invalid form");
      if (!verifyForm(request, form.get("form_token"))) {
        return path === "/sign-in" ? redirect(response, "/sign-in?notice=reload") : send(response, 403, "Reload the page and try again.");
      }
      if (guestPages.has(path)) return await guestPost(response, path, form);
      if (path === "/sign-out") {
        const access = readCookie(request, accessCookie);
        const result = access && await authRequest("/logout?scope=local", { method: "POST", access });
        const refresh = readCookie(request, refreshCookie);
        if (refresh && (!result || result.status === 401 || result.status === 403)) {
          const renewed = await refreshSession(refresh);
          if (renewed.data?.access_token) {
            await authRequest("/logout?scope=local", { method: "POST", access: renewed.data.access_token });
          }
        }
        clearSession(response);
        return redirect(response, "/sign-in");
      }
      if (path === "/manage-access") {
        if (await authenticate(request, response, false) !== "admin") return send(response, 403, "Administrator access required");
        return await invite(response, form.get("email")?.trim());
      }
    }
    if (method !== "GET" && method !== "HEAD") return send(response, 405, "Method not allowed");

    if (path === "/sign-in.css") return send(response, 200, authCss, types.css);
    if (path === "/sign-in.js") return send(response, 200, authFormScript, types.js);
    if (path === "/favicon.png") return await serveFile(response, path, method === "HEAD");
    if (guestPages.has(path)) {
      const token = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      return send(response, 200, authPage(path, url.searchParams.get("notice"), validLink(token, type) ? token : "", type, loginMode, formToken(request, response)), types.html);
    }
    const isPage = path === "/" || path === "/index.html" || path === "/manage-access";
    const role = await authenticate(request, response, isPage && method === "GET");
    if (!role) return isPage ? redirect(response, "/sign-in") : send(response, 401, "Sign-in required");

    if (path === "/manage-access") {
      if (role !== "admin") return send(response, 403, "Administrator access required");
      return send(response, 200, authPage(path, url.searchParams.get("notice"), "", "", "invite", formToken(request, response)), types.html);
    }
    if (path === "/download.csv") return await download(response);
    if (isPage) {
      const html = await readFile(join(contentRoot, "index.html"), "utf8");
      const controls = productActions
        .replace("{{ADMIN_LINK}}", role === "admin" ? '<a href="/manage-access">Manage access</a>' : "")
        .replace("{{FORM_TOKEN}}", `<input type="hidden" name="form_token" value="${formToken(request, response)}">`);
      return send(response, 200, html.replace("<span>Local preview</span>", controls).replace("<span>Internal preview</span>", "<span>Internal catalogue</span>"), types.html);
    }
    if (path === "/site.css") return send(response, 200, (await readFile(join(contentRoot, "site.css"), "utf8")) + actionCss, types.css);
    if (path === "/site.js" || path === "/catalogues.json" || /^\/assets\/[A-Za-z0-9_.-]+\.(?:webp|otf|ttf)$/.test(path)) {
      return await serveFile(response, path, method === "HEAD");
    }
    return send(response, 404, "Not found");
  } catch {
    if (!response.headersSent) return send(response, 503, "The Product Profile is temporarily unavailable.");
    response.destroy();
  }
}
