import * as logos from "./client-logos.js";

// The approval page a remote MCP server shows when an MCP client (Claude, ChatGPT,
// Cursor, ...) asks for access through OAuth. Plain strings in, HTML out: no Node or
// DOM APIs, so a Cloudflare Worker can import "@bunizao/cli-kit/consent" alone.

export interface ConsentSecret {
  /** Form field name the secret is posted under. */
  readonly name: string;
  readonly label: string;
  /** Shown under the field; `backticks` become a command chip that copies on click. */
  readonly hint?: string;
  /** "code" for a short one-time pairing code shown as typed; "password" (the default) hides it. */
  readonly kind?: "password" | "code";
  readonly placeholder?: string;
}

export interface ConsentPageOptions {
  /** The service being connected, e.g. "OnTrack". */
  readonly app: string;
  /** The client's self-declared name, or its client_id when it has none. */
  readonly client: string;
  /** Where the authorization code goes; decides the logo and the "access goes to" line. */
  readonly redirectUri: string;
  /** What the client will be able to do, one short sentence each. `backticks` become command chips. */
  readonly access: readonly string[];
  /** What it will not be able to do, one short sentence each. */
  readonly limits?: readonly string[];
  /** The form's POST target. */
  readonly action: string;
  /** Hidden fields posted back with the decision, e.g. a consent handle. */
  readonly fields?: Readonly<Record<string, string>>;
  /** A field the owner fills to approve, e.g. a pairing code. */
  readonly secret?: ConsentSecret;
  /** Shown above the form; `backticks` become command chips. */
  readonly error?: string;
}

export interface KnownClient {
  readonly name: string;
  readonly logo: string;
}

interface ClientEntry extends KnownClient {
  /** https redirect hosts that prove the client; subdomains count. */
  readonly hosts?: readonly string[];
  /** Custom URL schemes of desktop apps, with the colon. */
  readonly schemes?: readonly string[];
  /** Matched against the declared name, only when the redirect cannot prove anything. */
  readonly names?: RegExp;
}

// Order matters for names: "Claude Code" before "Claude".
const CLIENTS: readonly ClientEntry[] = [
  { name: "Claude Code", logo: logos.claudeCode, names: /claude[ -]?code/iu },
  { name: "Claude", logo: logos.claude, hosts: ["claude.ai", "claude.com"], names: /claude/iu },
  { name: "ChatGPT", logo: logos.openai, hosts: ["chatgpt.com", "chat.openai.com"], names: /chatgpt|openai/iu },
  { name: "Codex", logo: logos.codex, names: /codex/iu },
  { name: "Cursor", logo: logos.cursor, schemes: ["cursor:"], names: /cursor/iu },
  { name: "Windsurf", logo: logos.windsurf, schemes: ["windsurf:"], names: /windsurf|codeium/iu },
  { name: "VS Code", logo: logos.copilot, hosts: ["vscode.dev"], schemes: ["vscode:", "vscode-insiders:"], names: /visual studio code|vs ?code|copilot/iu },
  { name: "Gemini", logo: logos.gemini, hosts: ["gemini.google.com"], names: /gemini/iu },
  { name: "Goose", logo: logos.goose, names: /goose/iu },
  { name: "Cline", logo: logos.cline, names: /cline/iu },
  { name: "Kiro", logo: logos.kiro, schemes: ["kiro:"], names: /kiro/iu },
  { name: "Trae", logo: logos.trae, schemes: ["trae:"], names: /\btrae\b/iu },
  { name: "LM Studio", logo: logos.lmStudio, names: /lm ?studio/iu },
  { name: "Perplexity", logo: logos.perplexity, hosts: ["perplexity.ai"], names: /perplexity/iu },
  { name: "Le Chat", logo: logos.mistral, hosts: ["chat.mistral.ai"], names: /le chat|mistral/iu },
];

/**
 * The client a redirect URI belongs to. Anyone can register a client called
 * "Claude", so a public redirect is matched by its host alone; the declared name
 * only counts for a loopback or app-scheme redirect, which stays on this machine.
 */
export function knownClient(client: string, redirectUri: string): KnownClient | undefined {
  const url = parseUrl(redirectUri);
  if (!url) return undefined;
  const web = url.protocol === "https:" || url.protocol === "http:";
  const found = web && !isLoopback(url.hostname)
    ? url.protocol === "https:"
      ? CLIENTS.find((entry) => entry.hosts?.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))
      : undefined
    : CLIENTS.find((entry) => entry.schemes?.includes(url.protocol) || entry.names?.test(client));
  return found ? { name: found.name, logo: found.logo } : undefined;
}

export function consentPage(options: ConsentPageOptions): string {
  const known = knownClient(options.client, options.redirectUri);
  // A name that claims a known client, on a redirect that does not prove it.
  const impostor = known ? undefined : CLIENTS.find((entry) => entry.names?.test(options.client))?.name;
  const client = escapeHtml(options.client);
  const app = escapeHtml(options.app);
  const hidden = Object.entries(options.fields ?? {})
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join("");
  const secret = options.secret ? secretField(options.secret) : "";
  const list = (lines: readonly string[], kind: "can" | "cannot") =>
    `<ul>${lines.map((line) => `<li class="${kind}">${kind === "can" ? ICON.check : ICON.cross}<span>${rich(line)}</span></li>`).join("")}</ul>`;
  const body = `<div class="pair">
<div class="tile">${known ? known.logo : `<b>${escapeHtml(initial(options.client))}</b>`}</div>
<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="tile app"><b>${escapeHtml(initial(options.app))}</b></div>
</div>
<h1>Allow ${client} to use your ${app}?</h1>
<p class="dest"><span>${ICON.lock}${destination(options.redirectUri, known)}</span></p>
${options.error ? `<p class="notice error" role="alert">${ICON.alert}<span>${rich(options.error)}</span></p>` : ""}
${impostor ? `<p class="notice warn">${ICON.alert}<span>This app calls itself ${escapeHtml(impostor)}, but its access does not go to ${escapeHtml(impostor)}. Deny it unless you know why.</span></p>` : ""}
<p class="label">${client} can</p>
${list(options.access, "can")}
${options.limits?.length ? `<p class="label">It can't</p>${list(options.limits, "cannot")}` : ""}
<form method="post" action="${escapeHtml(options.action)}">${hidden}${secret}
<div class="actions">
<button type="submit" name="decision" value="deny" class="secondary" formnovalidate>Deny</button>
<button type="submit" name="decision" value="approve">Allow</button>
</div>
</form>
<p class="foot">Only allow this if you just connected ${client} yourself.</p>`;
  return document(`Allow ${options.client} to use your ${options.app}?`, body);
}

/** A one-message page in the same style, for errors and dead ends. `backticks` become command chips. */
export function messagePage(title: string, message: string): string {
  return document(title, `<h1>${escapeHtml(title)}</h1><p class="message">${rich(message)}</p>`);
}

// Copies a command chip's text, or selects it when the clipboard is refused. Only this exact script may run: its hash is in the CSP.
const SCRIPT = `document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var done=function(){b.classList.add("done");setTimeout(function(){b.classList.remove("done")},1500)};var select=function(){var r=document.createRange();r.selectNodeContents(b.querySelector("code"));var s=getSelection();s.removeAllRanges();s.addRange(r)};if(navigator.clipboard)navigator.clipboard.writeText(b.getAttribute("data-copy")).then(done,select);else select()})`;
/** sha256 of SCRIPT, base64; a test recomputes it. */
export const SCRIPT_HASH = "sha256-KAN0IlD3YFbP9PEr43Rzy7ChYfGlJu8Yv+tKxJsCLak=";

/**
 * Headers a consent page wants: no caching, no framing, nothing loaded from elsewhere.
 * No form-action: browsers apply it to the redirect after approval, which leaves for the client.
 */
export const CONSENT_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "content-security-policy": `default-src 'none'; script-src '${SCRIPT_HASH}'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'`,
  "referrer-policy": "no-referrer",
};

function secretField(secret: ConsentSecret): string {
  const id = `f-${escapeHtml(secret.name)}`;
  const input = secret.kind === "code"
    ? 'type="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" class="code"'
    : 'type="password" autocomplete="current-password"';
  return `<div class="field"><label for="${id}">${escapeHtml(secret.label)}</label>
<input ${input} name="${escapeHtml(secret.name)}" id="${id}"${secret.placeholder ? ` placeholder="${escapeHtml(secret.placeholder)}"` : ""} required autofocus>
${secret.hint ? `<p class="hint">${rich(secret.hint)}</p>` : ""}</div>`;
}

function destination(redirectUri: string, known: KnownClient | undefined): string {
  const url = parseUrl(redirectUri);
  if (!url) return `Access goes to <b>${escapeHtml(redirectUri)}</b>`;
  if (isLoopback(url.hostname)) return "Access stays on <b>this computer</b>";
  if (url.protocol === "https:" || url.protocol === "http:") return `Access goes to <b>${escapeHtml(url.host)}</b>`;
  return known
    ? `Access goes to the <b>${escapeHtml(known.name)}</b> app`
    : `Access goes to the app that opens <b>${escapeHtml(url.protocol)}//</b> links`;
}

/** Escapes text and turns each `command` into a chip that copies it. */
function rich(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/gu, (_, command: string) =>
    `<button type="button" class="cmd" data-copy="${command}" title="Copy"><code>${command}</code>${ICON.copy}${ICON.done}</button>`);
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || /^127\./u.test(hostname);
}

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => `&#${character.charCodeAt(0)};`);
}

const svg = (paths: string, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;

const ICON = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  cross: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>', ' class="copy"'),
  done: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' class="done"'),
};

const FOOTER = `<footer><span>🦄</span><a href="https://unicorn.tuuhub.com">Part of unicorn</a><i>·</i><a href="https://github.com/TuuHub/unicorn">GitHub</a><i>·</i><span>Made by <a href="https://github.com/bunizao">bunizao</a></span></footer>`;

function document(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
<main><section class="card">${body}</section>${FOOTER}</main>
<script>${SCRIPT}</script>
</html>`;
}

const STYLE = `
:root{color-scheme:light dark;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
--bg:#f7f7f8;--card:#fff;--fg:#0c0c0e;--muted:#64646e;--faint:#9c9ca6;--line:#ebebef;--soft:#f5f5f7;
--primary:#0c0c0e;--on-primary:#fff;--ok:#12805c;--no:#c4320a;--ring:rgba(12,12,14,.12);
--error:#b42318;--error-bg:#fef3f2;--warn:#a15c07;--warn-bg:#fffaeb;--glow-a:rgba(168,140,255,.20);--glow-b:rgba(255,128,191,.14)}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--card:#131316;--fg:#f4f4f6;--muted:#a1a1aa;--faint:#6b6b75;--line:#24242a;--soft:#1b1b1f;
--primary:#f4f4f6;--on-primary:#0c0c0e;--ok:#47cd89;--no:#f97066;--ring:rgba(244,244,246,.16);
--error:#fda29b;--error-bg:#2b1412;--warn:#fec84b;--warn-bg:#2a1f0b;--glow-a:rgba(140,110,255,.16);--glow-b:rgba(255,100,170,.08)}}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;color:var(--fg);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased;
background:radial-gradient(56rem 28rem at 50% -12rem,var(--glow-a),transparent 70%),radial-gradient(32rem 20rem at 90% -6rem,var(--glow-b),transparent 70%),var(--bg)}
main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:40px 16px 28px}
.card{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:32px 28px 24px;
box-shadow:0 1px 1px rgba(0,0,0,.03),0 10px 24px -12px rgba(0,0,0,.10),0 32px 64px -32px rgba(0,0,0,.16)}
.pair{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:22px}
.tile{width:60px;height:60px;border-radius:18px;background:var(--soft);border:1px solid var(--line);display:grid;place-items:center;color:var(--fg)}
.tile svg{width:32px;height:32px}
.tile b{font-size:24px;font-weight:600}
.tile.app{background:var(--primary);border-color:var(--primary);color:var(--on-primary)}
.dots{display:flex;gap:5px}
.dots i{width:5px;height:5px;border-radius:50%;background:var(--faint);animation:pulse 1.4s ease-in-out infinite}
.dots i:nth-child(2){animation-delay:.18s}.dots i:nth-child(3){animation-delay:.36s}
@keyframes pulse{0%,70%,100%{opacity:.25;transform:scale(.75)}35%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.dots i{animation:none;opacity:.5}}
h1{font-size:21px;line-height:1.3;font-weight:650;text-align:center;margin:0 0 12px;letter-spacing:-.015em;text-wrap:balance;overflow-wrap:anywhere}
.dest{display:flex;justify-content:center;margin:0 0 24px}
.dest span{display:inline-block;max-width:100%;text-align:center;font-size:12.5px;line-height:1.5;color:var(--muted);background:var(--soft);
border:1px solid var(--line);border-radius:14px;padding:4px 12px;overflow-wrap:anywhere}
.dest svg{width:13px;height:13px;vertical-align:-2px;margin-right:6px}
.dest b{color:var(--fg);font-weight:550}
.label{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:0 0 10px}
ul{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:10px}
li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.45}
li>svg{width:16px;height:16px;flex:none;margin-top:2px;stroke-width:2.4}
li.can>svg{color:var(--ok)}
li.cannot{color:var(--muted)}
li.cannot>svg{color:var(--no)}
.notice{display:flex;gap:10px;align-items:flex-start;border-radius:12px;padding:11px 12px;font-size:13.5px;line-height:1.5;margin:0 0 20px}
.notice>svg{width:16px;height:16px;flex:none;margin-top:2px}
.notice.error{background:var(--error-bg);color:var(--error)}
.notice.warn{background:var(--warn-bg);color:var(--warn)}
.field{border-top:1px solid var(--line);padding-top:20px;margin:4px 0 20px}
.field label{display:block;font-size:13.5px;font-weight:600;margin-bottom:8px}
.field input{width:100%;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 13px;
transition:border-color .15s,box-shadow .15s}
.field input.code{font:600 22px/1.2 var(--mono);letter-spacing:.32em;text-indent:.32em;text-align:center;text-transform:uppercase;padding:13px}
.field input::placeholder{color:var(--faint);opacity:.55}
.field input:focus{outline:none;border-color:var(--faint);box-shadow:0 0 0 4px var(--ring)}
.hint{color:var(--muted);font-size:13px;line-height:1.55;margin:10px 0 0}
.message{color:var(--muted);text-align:center;margin:0;line-height:1.75;overflow-wrap:anywhere}
.cmd{display:inline-flex;align-items:center;gap:7px;vertical-align:middle;font:500 12.5px/1 var(--mono);color:var(--fg);background:var(--soft);
border:1px solid var(--line);border-radius:7px;padding:5px 7px 5px 8px;margin:0 1px;cursor:pointer;transition:border-color .15s,background .15s}
.cmd:hover{border-color:var(--faint)}
.cmd:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ring)}
.cmd code{font:inherit;user-select:all}
.hint .cmd,.message .cmd{display:flex;width:100%;margin:8px 0;padding:10px 10px 10px 12px;font-size:13px;border-radius:10px;text-align:left}
.hint .cmd::before,.message .cmd::before{content:"$";color:var(--faint)}
.hint .cmd code,.message .cmd code{flex:1}
.cmd svg{width:13px;height:13px;color:var(--faint);flex:none}
.cmd .done{display:none;color:var(--ok)}
.cmd.done .copy{display:none}.cmd.done .done{display:block}
.actions{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}
.actions button{font:inherit;font-weight:550;border-radius:12px;padding:11px 14px;border:1px solid var(--primary);background:var(--primary);color:var(--on-primary);
cursor:pointer;transition:opacity .15s,background .15s}
.actions button:hover{opacity:.88}
.actions button.secondary{background:transparent;color:var(--fg);border-color:var(--line)}
.actions button.secondary:hover{opacity:1;background:var(--soft)}
.actions button:focus-visible{outline:none;box-shadow:0 0 0 4px var(--ring)}
@media (max-width:420px){.card{padding:28px 20px 20px;border-radius:20px}h1{font-size:20px}}
.foot{color:var(--faint);font-size:12px;text-align:center;margin:16px 0 0}
footer{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;font-size:12px;color:var(--faint)}
footer a{color:var(--muted);text-decoration:none;border-bottom:1px solid transparent;transition:color .15s,border-color .15s}
footer a:hover{color:var(--fg);border-color:var(--line)}
footer i{font-style:normal;opacity:.6}
`;
