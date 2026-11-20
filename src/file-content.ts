// Turns a downloaded file into MCP tool-result content that a hosted client passes to
// the model. Hosted clients show images but silently drop every other binary resource,
// so documents become Markdown through Workers AI's toMarkdown, which runs outside the
// Worker and costs it almost no CPU. Runtime-neutral: the converter is passed in.

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
  toMarkdown(
    file: { name: string; blob: Blob },
    options?: { conversionOptions?: { pdf?: { metadata?: boolean } } },
  ): Promise<{ format: string; data?: string; error?: string }>;
}

export type FileContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string; name: string; mimeType: string };

export interface FileContent {
  /** image, text and markdown carry the file itself; link means the model only learns where it is. */
  readonly kind: "image" | "text" | "markdown" | "link";
  readonly content: FileContentBlock[];
}

// The image types Claude, ChatGPT and Gemini accept, at the Claude API's per-image cap.
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// toMarkdown's documented document formats. Images are left out on purpose: converting
// one runs two AI models and spends neurons, while an image block costs nothing.
const DOCUMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroenabled.12",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  xls: "application/vnd.ms-excel",
  et: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  csv: "text/csv",
  numbers: "application/vnd.apple.numbers",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
};

const DOCUMENT_MIME_TYPES = new Set(Object.values(DOCUMENT_TYPES));
const EXTENSION_TYPES: Record<string, string> = {
  ...DOCUMENT_TYPES, png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "yaml", "yml", "toml", "ini", "log", "tex",
  "py", "ipynb", "js", "mjs", "ts", "tsx", "jsx", "java", "kt", "c", "h", "cc", "cpp", "hpp",
  "cs", "go", "rs", "rb", "php", "swift", "scala", "hs", "ml", "r", "m", "sql", "sh", "css",
]);
const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-download", "application/force-download"]);

/**
 * The file as tool-result content: an image block for images, the text itself for
 * plain-text files, Markdown for documents when `ai` is given, else a resource_link
 * (or a note, without a uri) saying the model cannot read it.
 */
export async function fileContent(file: FileInput, options: { readonly ai?: MarkdownConverter | undefined } = {}): Promise<FileContent> {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const declared = file.mimeType.split(";")[0]!.trim().toLowerCase();
  const mimeType = GENERIC_TYPES.has(declared) ? EXTENSION_TYPES[extension] ?? declared : declared;

  if (IMAGE_TYPES.has(mimeType)) {
    if (file.bytes.byteLength <= MAX_IMAGE_BYTES) {
      return { kind: "image", content: [{ type: "image", data: base64(file.bytes), mimeType }] };
    }
    return link(file, mimeType, `${file.name} is larger than the 5 MiB a client accepts for one image.`);
  }

  const document = DOCUMENT_MIME_TYPES.has(mimeType);
  if (document && options.ai) {
    try {
      // slice() gives a copy backed by a plain ArrayBuffer, which Blob requires.
      const blob = new Blob([file.bytes.slice()], { type: mimeType });
      const result = await options.ai.toMarkdown({ name: file.name, blob }, { conversionOptions: { pdf: { metadata: false } } });
      if (result.format !== "error" && result.data?.trim()) {
        return { kind: "markdown", content: [{ type: "text", text: result.data }] };
      }
      return link(file, mimeType, `Could not convert ${file.name} to text${result.error ? `: ${result.error}` : "."}`);
    } catch (error) {
      return link(file, mimeType, `Could not convert ${file.name} to text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // HTML, CSV and XML are documents too, but without a converter their raw text still beats a link.
  if (mimeType.startsWith("text/") || mimeType.endsWith("/json") || mimeType.endsWith("/xml") || TEXT_EXTENSIONS.has(extension)) {
    try {
      return { kind: "text", content: [{ type: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(file.bytes) }] };
    } catch {
      // Not UTF-8 after all: fall through to a link.
    }
  }

  if (document) return link(file, mimeType, `This server cannot convert ${file.name} to text.`);
  return link(file, mimeType, `${file.name} (${mimeType || "unknown type"}) cannot be shown to the model.`);
}

function link(file: FileInput, mimeType: string, note: string): FileContent {
  const text = file.uri ? `${note} Open it at ${file.uri}, or download it with the local CLI.` : `${note} Download it with the local CLI.`;
  const content: FileContentBlock[] = [{ type: "text", text }];
  if (file.uri) content.push({ type: "resource_link", uri: file.uri, name: file.name, mimeType: mimeType || "application/octet-stream" });
  return { kind: "link", content };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
