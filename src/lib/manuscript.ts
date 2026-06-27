import type { RenderedManuscript, TocItem } from "../types";

const headingOne = /^#\s+(.+)$/;
const headingTwo = /^##\s+(.+)$/;

export const sampleManuscript = `# 第一章　傘の下の約束

雨の匂いが、石畳の街を静かに包んでいた。

｜ヴェル13世《ヴぇるじゅうさんせい》は、古い劇場の前で黒い傘を閉じる。

「カーラ、今夜の曲は決まっている？」

## Glamorous Shadow

[Glamorous Shadow](https://example.com) は、ふたりの記憶をつなぐ合図だった。

# 第二章　銀色の招待状

招待状には、細い青の下線でリンクが引かれていた。`;

export function renderManuscript(markdown: string): RenderedManuscript {
  const toc: TocItem[] = [];
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

    if (h1) {
      flushParagraph();
      const title = h1[1].trim();
      const id = toAnchorId(title, toc.length + 1);
      toc.push({ id, title, level: 1 });
      htmlBlocks.push(`<h1 id="${id}">${formatInline(title)}</h1>`);
      return;
    }

    if (h2) {
      flushParagraph();
      const title = h2[1].trim();
      const id = toAnchorId(title, toc.length + 1);
      toc.push({ id, title, level: 2 });
      htmlBlocks.push(`<h2 id="${id}">${formatInline(title)}</h2>`);
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
    .map((item) => `<li><a href="#${item.id}">${escapeHtml(item.title)}</a></li>`)
    .join("");
}

export function stripMarkupForDocx(text: string): string {
  return text
    .replace(/｜([^《]+)《([^》]+)》/g, "$1（$2）")
    .replace(/([一-龯々ぁ-んァ-ヴーA-Za-z0-9０-９]+)《([^》]+)》/g, "$1（$2）")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1（$2）");
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
