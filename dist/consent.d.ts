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
/**
 * The client a redirect URI belongs to. Anyone can register a client called
 * "Claude", so a public redirect is matched by its host alone; the declared name
 * only counts for a loopback or app-scheme redirect, which stays on this machine.
 */
export declare function knownClient(client: string, redirectUri: string): KnownClient | undefined;
export declare function consentPage(options: ConsentPageOptions): string;
/** A one-message page in the same style, for errors and dead ends. `backticks` become command chips. */
export declare function messagePage(title: string, message: string): string;
/** sha256 of SCRIPT, base64; a test recomputes it. */
export declare const SCRIPT_HASH = "sha256-KAN0IlD3YFbP9PEr43Rzy7ChYfGlJu8Yv+tKxJsCLak=";
/**
 * Headers a consent page wants: no caching, no framing, nothing loaded from elsewhere.
 * No form-action: browsers apply it to the redirect after approval, which leaves for the client.
 */
export declare const CONSENT_HEADERS: Readonly<Record<string, string>>;
