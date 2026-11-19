export interface SiteIconOptions {
    /** Defaults to the global fetch. */
    readonly fetch?: typeof fetch;
    /** Per request; defaults to 3 seconds. */
    readonly timeoutMs?: number;
}
/**
 * The site's icon as a data: URI, or undefined when it has none worth showing.
 * Prefers an SVG icon, then the largest declared one, then /favicon.ico. Results
 * are cached for the life of the isolate; failures are retried after 5 minutes.
 */
export declare function siteIcon(site: string | URL, options?: SiteIconOptions): Promise<string | undefined>;
/** `<link rel="…icon…">` hrefs, best first. */
export declare function iconLinks(html: string, base: string): string[];
