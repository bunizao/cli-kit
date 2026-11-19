import * as logos from "./client-logos.js";

// The approval page a remote MCP server shows when an MCP client (Claude, ChatGPT,
// Cursor, ...) asks for access through OAuth. Plain strings in, HTML out: no Node or
// DOM APIs, so a Cloudflare Worker can import "@bunizao/cli-kit/consent" alone.

export interface ConsentSecret {
  /** Form field name the secret is posted under. */
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  /** "code" for a short one-time pairing code shown as typed; "password" (the default) hides it. */
  readonly kind?: "password" | "code";
}

export interface ConsentPageOptions {
  /** The service being connected, e.g. "OnTrack". */
  readonly app: string;
  /** The client's self-declared name, or its client_id when it has none. */
  readonly client: string;
  /** Where the authorization code goes; decides the logo and the "tokens go to" line. */
  readonly redirectUri: string;
  /** What the client will be able to do, one short sentence each. */
  readonly access: readonly string[];
  /** The form's POST target. */
  readonly action: string;
  /** Hidden fields posted back with the decision, e.g. a consent handle. */
  readonly fields?: Readonly<Record<string, string>>;
  /** A password field the owner fills to approve, e.g. an owner token. */
  readonly secret?: ConsentSecret;
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
 * "Claude", so a public https redirect is matched by its host alone; the declared
 * name only counts for a loopback or app-scheme redirect, which stays on this machine.
 */
export function knownClient(client: string, redirectUri: string): KnownClient | undefined {
  const url = parseUrl(redirectUri);
  const found = url?.protocol === "https:" && !isLoopback(url.hostname)
    ? CLIENTS.find((entry) => entry.hosts?.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))
    : CLIENTS.find((entry) => (url && entry.schemes?.includes(url.protocol)) || entry.names?.test(client));
  return found ? { name: found.name, logo: found.logo } : undefined;
}

export function consentPage(options: ConsentPageOptions): string {
  const known = knownClient(options.client, options.redirectUri);
  // A public redirect that proves nothing, under a name that claims a known client.
  const impostor = known ? undefined : CLIENTS.find((entry) => entry.hosts && entry.names?.test(options.client))?.name;
  const client = escapeHtml(options.client);
  const app = escapeHtml(options.app);
  const hidden = Object.entries(options.fields ?? {})
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join("");
  const secret = options.secret
    ? `<label class="field"><span>${escapeHtml(options.secret.label)}</span>
<input ${options.secret.kind === "code"
    ? 'type="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" class="code"'
    : 'type="password" autocomplete="current-password"'} name="${escapeHtml(options.secret.name)}" required autofocus>
${options.secret.hint ? `<small>${escapeHtml(options.secret.hint)}</small>` : ""}</label>`
    : "";
  const body = `<div class="pair">
<div class="tile">${known ? known.logo : `<b>${escapeHtml(initial(options.client))}</b>`}</div>
<svg class="link" viewBox="0 0 40 8" aria-hidden="true"><path d="M2 4h36" stroke-dasharray="2 4"/></svg>
<div class="tile app"><b>${escapeHtml(initial(options.app))}</b></div>
</div>
<h1>Connect ${client} to ${app}</h1>
<p class="lead">${escapeHtml(destination(options.redirectUri, known))}</p>
${options.error ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>` : ""}
${impostor ? `<p class="error">This client calls itself ${escapeHtml(impostor)}, but its tokens do not go to ${escapeHtml(impostor)}.</p>` : ""}
<p class="label">${client} will be able to</p>
<ul>${options.access.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
<form method="post" action="${escapeHtml(options.action)}">${hidden}${secret}
<div class="actions">
<button type="submit" name="decision" value="deny" class="secondary" formnovalidate>Deny</button>
<button type="submit" name="decision" value="approve">Approve</button>
</div>
</form>
<p class="foot">Approve only if you started this from ${client}. You can revoke it later.</p>`;
  return document(`Connect ${options.client} to ${options.app}`, body);
}

/** A one-message page in the same style, for errors and dead ends. */
export function messagePage(title: string, message: string): string {
  return document(title, `<h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(message)}</p>`);
}

/**
 * Headers a consent page wants: no caching, no framing, nothing loaded from elsewhere.
 * No form-action: browsers apply it to the redirect after approval, which leaves for the client.
 */
export const CONSENT_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'",
  "referrer-policy": "no-referrer",
};

function destination(redirectUri: string, known: KnownClient | undefined): string {
  const url = parseUrl(redirectUri);
  if (!url) return `Tokens go to ${redirectUri}`;
  if (isLoopback(url.hostname)) return "Tokens stay on this computer";
  if (url.protocol === "https:" || url.protocol === "http:") return `Tokens go to ${url.host}`;
  return known ? `Tokens go to the ${known.name} app` : `Tokens go to the app that opens ${url.protocol}// links`;
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

function document(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
<main><section class="card">${body}</section></main>
</html>`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f6f7;--card:#fff;--fg:#111113;--muted:#6b6b76;--line:#e6e6ea;--tile:#f2f2f4;
--primary:#111113;--on-primary:#fff;--error:#b42318;--error-bg:#fef3f2;--ring:rgba(17,17,19,.14)}
@media (prefers-color-scheme:dark){:root{--bg:#0d0d0f;--card:#17171a;--fg:#f4f4f6;--muted:#9a9aa6;--line:#2a2a30;--tile:#222227;
--primary:#f4f4f6;--on-primary:#111113;--error:#fda29b;--error-bg:#2a1513;--ring:rgba(244,244,246,.18)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:32px 28px 24px;
box-shadow:0 1px 2px rgba(0,0,0,.04),0 16px 40px rgba(0,0,0,.06)}
.pair{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:22px}
.tile{width:56px;height:56px;border-radius:16px;background:var(--tile);display:grid;place-items:center;color:var(--fg)}
.tile svg{width:30px;height:30px}
.tile b{font-size:22px;font-weight:600}
.tile.app{background:var(--primary);color:var(--on-primary)}
.link{width:40px;height:8px;stroke:var(--muted);stroke-width:2;stroke-linecap:round;fill:none}
h1{font-size:20px;line-height:1.3;font-weight:600;text-align:center;margin:0 0 4px;letter-spacing:-.01em}
.lead{color:var(--muted);text-align:center;margin:0 0 22px;font-size:14px;overflow-wrap:anywhere}
.label{font-size:13px;color:var(--muted);margin:0 0 8px}
ul{list-style:none;padding:0;margin:0 0 22px;border-top:1px solid var(--line)}
li{padding:10px 0 10px 26px;border-bottom:1px solid var(--line);position:relative}
li::before{content:"";position:absolute;left:4px;top:16px;width:10px;height:5px;border:solid var(--fg);border-width:0 0 2px 2px;transform:rotate(-45deg)}
.field{display:block;margin:0 0 18px}
.field span{display:block;font-size:13px;font-weight:500;margin-bottom:6px}
.field input{width:100%;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.field input.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase}
.field input:focus{outline:none;border-color:var(--muted);box-shadow:0 0 0 4px var(--ring)}
.field small{display:block;color:var(--muted);font-size:12px;margin-top:6px}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
button{font:inherit;font-weight:500;border-radius:10px;padding:10px 14px;border:1px solid var(--primary);background:var(--primary);color:var(--on-primary);cursor:pointer}
button.secondary{background:transparent;color:var(--fg);border-color:var(--line)}
button:focus-visible{outline:none;box-shadow:0 0 0 4px var(--ring)}
.error{background:var(--error-bg);color:var(--error);border-radius:10px;padding:10px 12px;font-size:14px;margin:0 0 18px}
.foot{color:var(--muted);font-size:12px;text-align:center;margin:18px 0 0}
`;
