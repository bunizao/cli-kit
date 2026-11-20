export interface FileInput {
    /** File name with its extension; the extension decides when mimeType is generic. */
    readonly name: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array;
    /** Where the user can open the file; becomes a resource_link when the model cannot read it. */
    readonly uri?: string;
}
/** The part of a Workers AI binding (`env.AI`) this module calls. */
export interface MarkdownConverter {
    toMarkdown(file: {
        name: string;
        blob: Blob;
    }, options?: {
        conversionOptions?: {
            pdf?: {
                metadata?: boolean;
            };
        };
    }): Promise<{
        format: string;
        data?: string;
        error?: string;
    }>;
}
export type FileContentBlock = {
    type: "text";
    text: string;
} | {
    type: "image";
    data: string;
    mimeType: string;
} | {
    type: "resource_link";
    uri: string;
    name: string;
    mimeType: string;
};
export interface FileContent {
    /** image, text and markdown carry the file itself; link means the model only learns where it is. */
    readonly kind: "image" | "text" | "markdown" | "link";
    readonly content: FileContentBlock[];
}
/**
 * The file as tool-result content: an image block for images, the text itself for
 * plain-text files, Markdown for documents when `ai` is given, else a resource_link
 * (or a note, without a uri) saying the model cannot read it.
 */
export declare function fileContent(file: FileInput, options?: {
    readonly ai?: MarkdownConverter | undefined;
}): Promise<FileContent>;
