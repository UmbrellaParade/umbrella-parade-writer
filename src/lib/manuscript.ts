import type { ImageAsset, ManuscriptImage, RenderedManuscript, TocItem } from "../types";

const headingOne = /^#\s+(.+)$/;
const headingTwo = /^##\s+(.+)$/;
const imageLine = /^!\[([^\]]*)\]\((asset:[A-Za-z0-9_-]+|data:image\/(png|jpe?g|gif|bmp);base64,[^)]+|https?:\/\/[^)\s]+)\)$/i;

export const sampleManuscript = `# 第一章　傘の下の約束

雨の匂いが、石畳の街を静かに包んでいた。

｜ヴェル13世《ヴぇるじゅうさんせい》は、古い劇場の前で黒い傘を閉じる。

「カーラ、今夜の曲は決まっている？」

## Glamorous Shadow

[Glamorous Shadow](https://example.com) は、ふたりの記憶をつなぐ合図だった。

# 第二章　銀色の招待状

招待状には、細い青の下線でリンクが引かれていた。`;

export function renderManuscript(markdown: string, imageAssets: ImageAsset[] = []): RenderedManuscript {
  const toc: TocItem[] = [];
  const images: ManuscriptImage[] = [];
  const htmlBlocks: string[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let paragraph: string[] = [];
  let wordCount = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const body = paragraph.join("<br />");
    htmlBlocks.push(`<p>${formatInline(body)}</p>`);
    paragraph = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    wordCount += countJapaneseCharacters(line);

    const h1 = line.match(headingOne);
    const h2 = line.match(headingTwo);
    const image = parseMarkdownImageLine(line, images.length + 1, imageAssets);

    if (h1) {
      flushParagraph();
      const title = h1[1].trim();
      const id = toAnchorId(title, toc.length + 1);
      toc.push({ id, title, level: 1 });
      htmlBlocks.push(`<h1 id="${id}" class="chapter-heading">${formatInline(title)}</h1>`);
      return;
    }

    if (h2) {
      flushParagraph();
      const title = h2[1].trim();
      const id = toAnchorId(title, toc.length + 1);
      toc.push({ id, title, level: 2 });
      htmlBlocks.push(`<h2 id="${id}" class="section-heading">${formatInline(title)}</h2>`);
      return;
    }

    if (image) {
      flushParagraph();
      if (!images.some((item) => item.id === image.id)) images.push(image);
      htmlBlocks.push(
        `<figure class="manuscript-image"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(
          image.alt,
        )}" />${image.alt ? `<figcaption>${escapeHtml(image.alt)}</figcaption>` : ""}</figure>`,
      );
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      return;
    }

    paragraph.push(escapeHtml(line));
  });

  flushParagraph();

  return {
    html: htmlBlocks.join("\n"),
    toc,
    images,
    wordCount,
  };
}

export function formatInline(escapedText: string): string {
  return escapedText
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, url: string) => {
      return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
    })
    .replace(/｜([^《]+)《([^》]+)》/g, (_match, base: string, ruby: string) => {
      return `<ruby>${base}<rp>（</rp><rt>${ruby}</rt><rp>）</rp></ruby>`;
    })
    .replace(/([一-龯々ぁ-んァ-ヴーA-Za-z0-9０-９]+)《([^》]+)》/g, (_match, base: string, ruby: string) => {
      return `<ruby>${base}<rp>（</rp><rt>${ruby}</rt><rp>）</rp></ruby>`;
    });
}

export function createKindleNav(toc: TocItem[]) {
  return toc
    .filter((item) => item.level === 1)
    .map((item) => `<li><a href="content.xhtml#${item.id}">${escapeHtml(item.title)}</a></li>`)
    .join("");
}

export function stripMarkupForDocx(text: string): string {
  return text
    .replace(/｜([^《]+)《([^》]+)》/g, "$1（$2）")
    .replace(/([一-龯々ぁ-んァ-ヴーA-Za-z0-9０-９]+)《([^》]+)》/g, "$1（$2）")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1（$2）");
}

export function parseMarkdownImageLine(
  line: string,
  index = 1,
  imageAssets: ImageAsset[] = [],
): ManuscriptImage | undefined {
  const match = line.trim().match(imageLine);
  if (!match) return undefined;

  const rawSrc = match[2];
  const assetId = rawSrc.startsWith("asset:") ? rawSrc.replace("asset:", "") : "";
  const asset = assetId ? imageAssets.find((item) => item.id === assetId) : undefined;
  const src = asset?.src || rawSrc;
  const mimeMatch = src.match(/^data:(image\/(png|jpe?g|gif|bmp));base64,/i);
  const mimeType = asset?.mimeType || mimeMatch?.[1]?.toLowerCase() || "image/png";
  const rawExtension = asset?.extension || mimeMatch?.[2]?.toLowerCase() || src.split(".").pop()?.toLowerCase() || "png";
  const extension = rawExtension === "jpeg" ? "jpg" : normalizeImageExtension(rawExtension);

  return {
    id: asset?.id || `image-${index}`,
    alt: match[1].trim() || asset?.alt || "",
    src,
    mimeType,
    extension,
  };
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countJapaneseCharacters(value: string): number {
  return value.replace(/\s/g, "").length;
}

function toAnchorId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "");

  return `${slug || "chapter"}-${index}`;
}

function normalizeImageExtension(value: string): ManuscriptImage["extension"] {
  if (value === "jpg" || value === "gif" || value === "bmp") return value;
  return "png";
}
