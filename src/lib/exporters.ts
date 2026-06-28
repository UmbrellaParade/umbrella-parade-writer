import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { PageBreakSettings, RenderedManuscript, TocItem, TypographySettings } from "../types";
import {
  createKindleNav,
  dataUrlToBytes,
  escapeHtml,
  parseMarkdownImageLine,
  stripMarkupForDocx,
} from "./manuscript";

const fallbackTypography: TypographySettings = {
  fontFamily: "shippori-mincho",
  fontSize: 16,
};

const fallbackPageBreaks: PageBreakSettings = {
  chapterHead: true,
  pageGuide: true,
};

export async function exportDocx(
  markdown: string,
  title: string,
  rendered: RenderedManuscript,
  typography: TypographySettings = fallbackTypography,
  pageBreaks: PageBreakSettings = fallbackPageBreaks,
) {
  const children = await createDocxChildren(markdown, rendered, typography, pageBreaks);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeFilename(title)}.docx`);
}

export async function exportPdf(previewElement: HTMLElement, title: string) {
  const canvas = await html2canvas(previewElement, {
    backgroundColor: "#ffffff",
    scale: 2,
  });
  const image = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });

  pdf.addImage(image, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${safeFilename(title)}.pdf`);
}

export async function exportEpub(
  rendered: RenderedManuscript,
  title: string,
  typography: TypographySettings = fallbackTypography,
  pageBreaks: PageBreakSettings = fallbackPageBreaks,
) {
  const zip = new JSZip();
  let contentHtml = rendered.html;

  rendered.images.forEach((image) => {
    const path = `images/${image.id}.${image.extension}`;
    contentHtml = contentHtml.replaceAll(image.src, path);
    zip.file(`OEBPS/${path}`, dataUrlToBytes(image.src));
  });

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file("OEBPS/content.xhtml", wrapXhtml(title, contentHtml, typography, pageBreaks));
  zip.file("OEBPS/nav.xhtml", createNavXhtml(title, rendered.toc));
  zip.file("OEBPS/content.opf", createOpf(title, rendered));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
  saveAs(blob, `${safeFilename(title)}.epub`);
}

function wrapXhtml(
  title: string,
  body: string,
  typography: TypographySettings,
  pageBreaks: PageBreakSettings,
) {
  const pageBreakCss = pageBreaks.chapterHead
    ? ".manual-page-break { break-before: page; page-break-before: always; height: 0; overflow: hidden; }"
    : ".manual-page-break { display: none; }";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" lang="ja">
  <head>
    <title>${escapeHtml(title)}</title>
    <meta charset="UTF-8" />
    <style>
      body { font-family: ${epubFontFamily(typography)}; font-size: ${typography.fontSize}px; line-height: 1.8; }
      a { color: #0b61d8; text-decoration: underline; }
      h1 { font-size: 1.5em; }
      ${pageBreakCss}
      .inline-size-small { font-size: 0.86em; }
      .inline-size-large { font-size: 1.18em; }
      .manuscript-toc { margin: 1.5em 0 2em; }
      .manuscript-toc ol { padding-inline-start: 1.5em; }
      .manuscript-toc .toc-level-2 { margin-inline-start: 1em; }
      figure { margin: 1.5em 0; text-align: center; }
      figure img { max-width: 100%; height: auto; }
      figcaption { font-size: 0.85em; color: #555; }
      ruby rt { font-size: 0.5em; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function createNavXhtml(title: string, toc: TocItem[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
  <head>
    <title>${escapeHtml(title)} 目次</title>
    <meta charset="UTF-8" />
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>目次</h1>
      <ol>${createKindleNav(toc)}</ol>
    </nav>
  </body>
</html>`;
}

async function createDocxChildren(
  markdown: string,
  rendered: RenderedManuscript,
  typography: TypographySettings,
  pageBreaks: PageBreakSettings,
) {
  const children: Paragraph[] = [];
  let pendingPageBreak = false;

  for (const line of markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((value) => value.trimEnd())
    .filter((value) => value.length > 0)) {
    const image = parseMarkdownImageLine(line, undefined, rendered.images);

    if (/^\[\[PAGE_BREAK\]\]$/i.test(line.trim())) {
      pendingPageBreak = pageBreaks.chapterHead;
      continue;
    }

    if (image?.src.startsWith("data:image/")) {
      const size = await getDataImageSize(image.src);
      const maxWidth = 420;
      const scale = Math.min(1, maxWidth / size.width);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: pendingPageBreak,
          spacing: { before: 240, after: 240 },
          children: [
            new ImageRun({
              type: image.extension,
              data: dataUrlToBytes(image.src),
              transformation: {
                width: Math.round(size.width * scale),
                height: Math.round(size.height * scale),
              },
              altText: {
                name: image.alt || image.id,
                title: image.alt || image.id,
                description: image.alt || image.id,
              },
            }),
          ],
        }),
      );
      pendingPageBreak = false;
      continue;
    }

    if (/^\[\[TOC\]\]$/i.test(line.trim())) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          pageBreakBefore: pendingPageBreak,
          spacing: { before: 360, after: 180 },
          children: [createTextRun("目次", typography, 2)],
        }),
      );
      pendingPageBreak = false;
      rendered.toc.forEach((item) => {
        children.push(
          new Paragraph({
            indent: { left: item.level === 2 ? 360 : 0 },
            spacing: { after: 80 },
            children: [createTextRun(item.title, typography)],
          }),
        );
      });
      continue;
    }

    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: pendingPageBreak,
          spacing: { before: 480, after: 240 },
          children: [createTextRun(stripMarkupForDocx(line.replace(/^#\s+/, "")), typography, 6)],
        }),
      );
      pendingPageBreak = false;
      continue;
    }

    if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          pageBreakBefore: pendingPageBreak,
          spacing: { before: 360, after: 180 },
          children: [createTextRun(stripMarkupForDocx(line.replace(/^##\s+/, "")), typography, 3)],
        }),
      );
      pendingPageBreak = false;
      continue;
    }

    children.push(
      new Paragraph({
        pageBreakBefore: pendingPageBreak,
        spacing: { line: 360, after: 160 },
        children: [createTextRun(stripMarkupForDocx(line), typography)],
      }),
    );
    pendingPageBreak = false;
  }

  return children;
}

function createTextRun(text: string, typography: TypographySettings, sizeOffset = 0) {
  return new TextRun({
    text,
    font: docxFontName(typography),
    size: Math.round((typography.fontSize + sizeOffset) * 2),
  });
}

function docxFontName(typography: TypographySettings) {
  return typography.fontFamily === "noto-sans-jp" ? "Noto Sans JP" : "Shippori Mincho";
}

function epubFontFamily(typography: TypographySettings) {
  if (typography.fontFamily === "noto-sans-jp") {
    return '"Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif';
  }

  return '"Shippori Mincho", "Yu Mincho", "Hiragino Mincho ProN", serif';
}

function getDataImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 420, height: image.naturalHeight || 420 });
    image.onerror = () => resolve({ width: 420, height: 420 });
    image.src = src;
  });
}

function createOpf(title: string, rendered: RenderedManuscript) {
  const imageItems = rendered.images
    .map(
      (image) =>
        `<item id="${image.id}" href="images/${image.id}.${image.extension}" media-type="${image.mimeType}"/>`,
    )
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:umbrella-parade-writer</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:language>ja</dc:language>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${imageItems}
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`;
}

function safeFilename(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "_") || "manuscript";
}
