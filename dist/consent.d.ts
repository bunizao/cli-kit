export interface ConsentSecret {
    /** Form field name the secret is posted under. */
    readonly name: string;
    readonly label: string;
    readonly hint?: string;
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
/**
 * The client a redirect URI belongs to. Anyone can register a client called
 * "Claude", so a public https redirect is matched by its host alone; the declared
 * name only counts for a loopback or app-scheme redirect, which stays on this machine.
 */
export declare function knownClient(client: string, redirectUri: string): KnownClient | undefined;
export declare function consentPage(options: ConsentPageOptions): string;
/** A one-message page in the same style, for errors and dead ends. */
export declare function messagePage(title: string, message: string): string;
/**
 * Headers a consent page wants: no caching, no framing, nothing loaded from elsewhere.
 * No form-action: browsers apply it to the redirect after approval, which leaves for the client.
 */
export declare const CONSENT_HEADERS: Readonly<Record<string, string>>;
