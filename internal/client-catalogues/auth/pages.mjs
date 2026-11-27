const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const emailField = '<label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label>';
const usernameField = (mode) => `<label>${mode === "individual" ? "Email or username" : "Username"}
  <input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="254" required></label>`;
const passwordField = (isNew) =>
  `<label>${isNew ? "New password" : "Password"}<input name="password" type="password"
    autocomplete="${isNew ? "new-password" : "current-password"}" ${isNew ? 'minlength="14" aria-describedby="password-hint"' : ""} maxlength="128" required></label>
    ${isNew ? '<p id="password-hint" class="hint">Use at least 14 characters.</p>' : ""}`;
const button = (label, pending) => `<button type="submit" data-pending="${pending}">${label}</button>`;
const notices = {
  reload: "The sign-in form was refreshed. Enter your sign-in details again.",
  incorrect: "Check your email and password or ask your administrator for access.",
  recovery: "If that account has access, you’ll receive a password reset email.",
  updated: "Your password is ready. Sign in to continue.",
  invited: "Access was granted and an invitation was requested.",
  inviteFailed: "The invitation could not be completed. Check the account in the authentication dashboard."
};

export const authCss = `
  :root {
    color-scheme: light; font: 16px/1.5 system-ui, sans-serif;
    --navy: #00163a; --blue: #093fa4; --paper: #f8f6f0; --ink: #172640; --muted: #505d6d;
    --line: #dadfe7; --control: 44px; --radius: 12px; --speed-control: 170ms;
    color: var(--ink); background: var(--navy);
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); display: grid; place-items: center; }
  main { width: min(100%, 460px); background: var(--paper); padding: clamp(24px, 6vw, 40px); border-radius: var(--radius); animation: enter 200ms cubic-bezier(.22, 1, .36, 1); }
  @keyframes enter { from { opacity: 0; transform: translateY(4px); } }
  .brand { margin: 0; color: var(--blue); font-size: .83rem; font-weight: 750; }
  h1 { margin: .4em 0 .3em; font-size: clamp(1.85rem, 5vw, 2.35rem); line-height: 1.12; }
  .summary { margin: 0 0 20px; color: var(--muted); }
  form, label { display: grid; gap: 8px; }
  form { gap: 16px; }
  label { font-weight: 650; }
  input { min-width: 0; width: 100%; min-height: var(--control); font: inherit; color: var(--ink); background: white; border: 1px solid #7b8ba3; border-radius: 8px; padding: 8px 12px; }
  input:user-invalid { border-color: #ac292c; }
  button { min-height: var(--control); font: inherit; font-weight: 750; cursor: pointer; color: white; background: var(--blue); padding: 8px 14px; border: 0; border-radius: 8px; transition: background-color var(--speed-control), transform 120ms; }
  @media (hover: hover) { button:hover { background: #002e89; } }
  button:active { transform: translateY(1px); }
  button:disabled { opacity: .7; cursor: wait; }
  a { color: var(--blue); text-underline-offset: 3px; }
  p > a:only-child { display: inline-flex; align-items: center; min-height: var(--control); }
  a:focus-visible, input:focus-visible, button:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  [hidden] { display: none; }
  .hint { margin: -8px 0 0; color: var(--muted); font-size: .84rem; }
  #form-status { margin: 8px 0 0; }
  #form-status:empty { margin: 0; }
  .notice { background: #edf3ff; padding: 10px 14px; border-inline-start: 4px solid var(--blue); border-radius: 6px; }
  .notice.error { background: #fbeeea; border-color: #ac292c; }
  .notice.success { background: #ebf4ed; border-color: #25754c; }
  .notice.warning { background: #fff4d4; border-color: #79500b; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

export const authFormScript = `
  const form = document.querySelector('form');
  if (form) {
    const submit = form.querySelector('button[type="submit"]');
    const status = document.getElementById('form-status');
    const label = submit.textContent;
    const confirmLeave = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const markDirty = () => {
      if (!form.hasAttribute('data-warn-unsaved')) return;
      const filled = Array.from(form.querySelectorAll('input:not([type="hidden"])')).some(input => input.value.length);
      if (filled) window.addEventListener('beforeunload', confirmLeave);
      else window.removeEventListener('beforeunload', confirmLeave);
      status.textContent = filled ? 'Unsaved changes' : '';
    };
    form.addEventListener('input', markDirty);
    form.addEventListener('submit', (event) => {
      if (submit.disabled) {
        event.preventDefault();
        return;
      }
      window.removeEventListener('beforeunload', confirmLeave);
      submit.disabled = true;
      submit.textContent = submit.dataset.pending;
      status.textContent = submit.dataset.pending;
    });
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      submit.disabled = false;
      submit.textContent = label;
      status.textContent = '';
      markDirty();
    });
  }
`;

export function authPage(path, notice, token = "", type = "", mode = "invite", formToken = "") {
  const formField = `<input type="hidden" name="form_token" value="${escapeHtml(formToken)}">`;
  let title = "Sign in";
  let summary = "Access the client catalogues and product details.";
  let body = `<form method="post" action="/sign-in">${formField}${mode === "invite" ? emailField : usernameField(mode)}${passwordField(false)}${button("Sign in", "Signing in…")}</form>
    ${mode === "invite" ? '<p><a href="/forgot-password">Forgot your password?</a></p>' : ""}`;

  if (path === "/forgot-password") {
    title = "Reset your password";
    summary = "Enter the email address associated with your account.";
    body = `<form method="post" action="/forgot-password">${formField}${emailField}${button("Send reset link", "Requesting link…")}</form>
      <p><a href="/sign-in">Back to sign-in</a></p>`;
  }

  if (path === "/set-password") {
    title = "Set your password";
    summary = "";
    body = token
      ? `<form method="post" action="/set-password" data-warn-unsaved>${formField}
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="type" value="${escapeHtml(type)}">
          ${passwordField(true)}${button("Save password", "Saving password…")}
        </form>`
      : '<p>This link is invalid or has expired. <a href="/forgot-password">Request a new link</a> or contact your administrator.</p>';
  }

  if (path === "/manage-access") {
    title = "Invite a viewer";
    summary = "Viewers can browse the catalogue and download product information.";
    body = `<form method="post" action="/manage-access" data-warn-unsaved>${formField}${emailField}${button("Send invitation", "Requesting invitation…")}</form>
      <p><a href="/">Back to Product Profile</a></p>`;
  }

  const siteTitle = "Noble Sourdough Product Profile";
  const pageTitle = path === "/sign-in" ? siteTitle : `${siteTitle} | ${title}`;
  const tone = {
    incorrect: "error", inviteFailed: "error", updated: "success", invited: "success", reload: "warning"
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>${pageTitle}</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png">
<link rel="stylesheet" href="/sign-in.css"><script src="/sign-in.js" defer></script></head>
<body><main><p class="brand">${siteTitle}</p><h1>${title}</h1>
${summary ? `<p class="summary">${summary}</p>` : ""}
${Object.hasOwn(notices, notice) ? `<p class="notice ${tone[notice] || ""}" role="${tone[notice] === "error" ? "alert" : "status"}">${mode !== "invite" && notice === "incorrect" ? "Check your sign-in details and try again." : notices[notice]}</p>` : ""}
${body}<p id="form-status" class="hint" role="status" aria-atomic="true"></p></main></body></html>`;
}
