import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { RenderedManuscript, TocItem } from "../types";
import { createKindleNav, escapeHtml, stripMarkupForDocx } from "./manuscript";

export async function exportDocx(markdown: string, title: string) {
  const children = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith("# ")) {
        return new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 480, after: 240 },
          children: [new TextRun(stripMarkupForDocx(line.replace(/^#\s+/, "")))],
        });
      }

      if (line.startsWith("## ")) {
        return new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 360, after: 180 },
          children: [new TextRun(stripMarkupForDocx(line.replace(/^##\s+/, "")))],
        });
      }

      return new Paragraph({
        spacing: { line: 360, after: 160 },
        children: [new TextRun(stripMarkupForDocx(line))],
      });
    });

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

export async function exportEpub(rendered: RenderedManuscript, title: string) {
  const zip = new JSZip();
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

  zip.file("OEBPS/content.xhtml", wrapXhtml(title, rendered.html));
  zip.file("OEBPS/nav.xhtml", createNavXhtml(title, rendered.toc));
  zip.file("OEBPS/content.opf", createOpf(title));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
  saveAs(blob, `${safeFilename(title)}.epub`);
}

function wrapXhtml(title: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" lang="ja">
  <head>
    <title>${escapeHtml(title)}</title>
    <meta charset="UTF-8" />
    <style>
      body { font-family: serif; line-height: 1.8; }
      a { color: #0b61d8; text-decoration: underline; }
      h1 { break-before: page; font-size: 1.5em; }
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

function createOpf(title: string) {
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
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`;
}

function safeFilename(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "_") || "manuscript";
}
