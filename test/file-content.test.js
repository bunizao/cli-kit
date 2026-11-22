import assert from "node:assert/strict";
import test from "node:test";
import { fileContent } from "../dist/file-content.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new TextEncoder().encode("%PDF-1.4\n");

function converter(result) {
  const calls = [];
  const ai = {
    async toMarkdown(file, options) {
      calls.push({ name: file.name, type: file.blob.type, size: file.blob.size, options });
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { ai, calls };
}

test("images pass through as image blocks without touching the converter", async () => {
  const { ai, calls } = converter({ format: "markdown", data: "never" });
  const result = await fileContent({ name: "diagram.png", mimeType: "image/png", bytes: PNG }, { ai });
  assert.deepEqual(result, { kind: "image", content: [{ type: "image", data: Buffer.from(PNG).toString("base64"), mimeType: "image/png" }] });
  assert.equal(calls.length, 0);
});

test("a generic content type is typed from the extension", async () => {
  const result = await fileContent({ name: "photo.JPG", mimeType: "application/octet-stream", bytes: PNG });
  assert.equal(result.kind, "image");
  assert.equal(result.content[0].mimeType, "image/jpeg");
});

test("an image over 5 MiB becomes a link", async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
  const result = await fileContent({ name: "huge.png", mimeType: "image/png", bytes, uri: "https://lms.example/huge.png" });
  assert.equal(result.kind, "link");
  assert.match(result.content[0].text, /larger than the 5 MiB/u);
  assert.deepEqual(result.content[1], { type: "resource_link", uri: "https://lms.example/huge.png", name: "huge.png", mimeType: "image/png" });
});

test("a PDF becomes Markdown, with its metadata turned off", async () => {
  const { ai, calls } = converter({ format: "markdown", data: "# sheet.pdf\n\nBuild a heap.", tokens: 6 });
  const result = await fileContent({ name: "sheet.pdf", mimeType: "application/pdf; charset=binary", bytes: PDF }, { ai });
  assert.deepEqual(result, { kind: "markdown", content: [{ type: "text", text: "# sheet.pdf\n\nBuild a heap." }] });
  assert.deepEqual(calls, [{ name: "sheet.pdf", type: "application/pdf", size: PDF.byteLength, options: { conversionOptions: { pdf: { metadata: false } } } }]);
});

test("a PDF served as octet-stream is still converted", async () => {
  const { ai, calls } = converter({ format: "markdown", data: "text" });
  assert.equal((await fileContent({ name: "Week 3.pdf", mimeType: "application/octet-stream", bytes: PDF }, { ai })).kind, "markdown");
  assert.equal(calls[0].type, "application/pdf");
});

test("a failed or empty conversion becomes a link that says why", async () => {
  const file = { name: "scan.pdf", mimeType: "application/pdf", bytes: PDF, uri: "https://lms.example/scan.pdf" };
  const refused = await fileContent(file, converter({ format: "error", error: "Unsupported PDF" }));
  assert.equal(refused.kind, "link");
  assert.equal(refused.content[0].text, "Could not convert scan.pdf to text: Unsupported PDF Open it at https://lms.example/scan.pdf, or download it with the local CLI.");
  assert.equal(refused.content[1].type, "resource_link");

  assert.equal((await fileContent(file, converter({ format: "markdown", data: "  \n" }))).kind, "link");
  const thrown = await fileContent(file, converter(new Error("4006: daily free allocation exceeded")));
  assert.match(thrown.content[0].text, /daily free allocation exceeded/u);
});

test("without a converter a PDF is a link and an HTML page is its own text", async () => {
  const pdf = await fileContent({ name: "sheet.pdf", mimeType: "application/pdf", bytes: PDF });
  assert.deepEqual(pdf, { kind: "link", content: [{ type: "text", text: "This server cannot convert sheet.pdf to text. Download it with the local CLI." }] });
  const html = await fileContent({ name: "notes.html", mimeType: "text/html", bytes: new TextEncoder().encode("<p>hi</p>") });
  assert.deepEqual(html, { kind: "text", content: [{ type: "text", text: "<p>hi</p>" }] });
});

test("source files are returned as text, and invalid UTF-8 becomes a link", async () => {
  const code = await fileContent({ name: "heap.py", mimeType: "application/octet-stream", bytes: new TextEncoder().encode("print('hi')\n") });
  assert.deepEqual(code, { kind: "text", content: [{ type: "text", text: "print('hi')\n" }] });
  const binary = await fileContent({ name: "data.txt", mimeType: "text/plain", bytes: new Uint8Array([0xff, 0xfe, 0x00]) });
  assert.equal(binary.kind, "link");
});

test("PowerPoint is not something toMarkdown reads, so it becomes a link", async () => {
  const { ai, calls } = converter({ format: "markdown", data: "never" });
  const result = await fileContent({
    name: "Week 1.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    bytes: PDF,
    uri: "https://lms.example/w1.pptx",
  }, { ai });
  assert.equal(result.kind, "link");
  assert.match(result.content[0].text, /^Week 1\.pptx \(application\/vnd\.openxmlformats/u);
  assert.equal(calls.length, 0);
});
