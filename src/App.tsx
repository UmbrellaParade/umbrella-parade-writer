import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, ClipboardEvent, MouseEvent, WheelEvent } from "react";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Heading1,
  ImageIcon,
  Link,
  ListTree,
  QrCode,
  Redo2,
  Settings,
  Sparkles,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { AI_PROVIDERS, getDefaultAiSettings } from "./data/aiModels";
import { exportDocx, exportEpub, exportPdf } from "./lib/exporters";
import { escapeHtml, renderManuscript, sampleManuscript, toAnchorId } from "./lib/manuscript";
import type {
  AiProviderConfig,
  AplusImageItem,
  AplusSettings,
  EditorMode,
  ImageAsset,
  LegacyAplusSettings,
  PageBreakSettings,
  SalesChannel,
  TypographySettings,
  WorkspaceTab,
  WritingDirection,
} from "./types";

const storageKeys = {
  manuscript: "umbrella-parade-writer:manuscript",
  manuscripts: "umbrella-parade-writer:manuscripts",
  title: "umbrella-parade-writer:title",
  aiSettings: "umbrella-parade-writer:ai-settings",
  imageAssets: "umbrella-parade-writer:image-assets",
  typography: "umbrella-parade-writer:typography",
  pageBreaks: "umbrella-parade-writer:page-breaks",
  coverImage: "umbrella-parade-writer:cover-image",
  aplus: "umbrella-parade-writer:aplus",
  salesChannel: "umbrella-parade-writer:sales-channel",
};

const defaultTypography: TypographySettings = {
  fontFamily: "shippori-mincho",
  fontSize: 16,
};

const fontOptions: { value: TypographySettings["fontFamily"]; label: string }[] = [
  { value: "shippori-mincho", label: "Shippori Mincho" },
  { value: "noto-sans-jp", label: "Noto Sans JP" },
];

const fontSizeOptions = [14, 16, 18, 20, 22];

const defaultPageBreaks: PageBreakSettings = {
  chapterHead: true,
  pageGuide: true,
};

const salesChannelLabels: Record<SalesChannel, string> = {
  kindle: "Kindle",
  shimauma: "しまうま",
};

const defaultAplusItems: AplusImageItem[] = [1, 2, 3, 4].map((number) => ({
  id: `aplus-${number}`,
  imageSrc: "",
  imageName: "",
  altText: "",
  caption: "",
  heading: number === 1 ? "雨の記憶をたどる物語" : "",
  description:
    number === 1
      ? "Umbrella Paradeの世界観、登場人物、楽曲や記録室へつながる余韻を紹介します。"
      : "",
}));

const defaultAplus: AplusSettings = {
  items: defaultAplusItems,
};

type CoverImageState = {
  src: string;
  name: string;
};

const defaultCoverImage: CoverImageState = {
  src: "",
  name: "",
};

const storageWriteErrorMessage =
  "画像が大きすぎてブラウザに保存できません。小さめの画像にしてもう一度試してください。";
const coverImageMaxSide = 1600;
const aplusImageMaxSide = 1000;

type ManuscriptsByChannel = Record<SalesChannel, string>;
type ManuscriptHistory = Record<SalesChannel, string[]>;

type DocsSnapshotSegment = {
  text?: string;
  url?: string;
};

type DocsSnapshotBlock = {
  type?: string;
  text?: string;
  segments?: DocsSnapshotSegment[];
  headingLevel?: number;
};

type DocsSnapshot = {
  title?: string;
  blocks?: DocsSnapshotBlock[];
  toc?: Array<{
    id?: string;
    title?: string;
    level?: number;
  }>;
  updatedAt?: string;
};

type DocsBridgeMessage = {
  source?: string;
  type?: string;
  snapshot?: DocsSnapshot;
  target?: SalesChannel;
  direction?: WritingDirection;
};

function createEmptyHistory(): ManuscriptHistory {
  return {
    kindle: [],
    shimauma: [],
  };
}

function App() {
  const initialDraftRef = useRef<ReturnType<typeof loadInitialDraft> | null>(null);
  if (!initialDraftRef.current) initialDraftRef.current = loadInitialDraft();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("write");
  const [title, setTitle] = useState(() => readStorageValue(storageKeys.title, "Umbrella Parade Manuscript"));
  const [docsBridgeActive, setDocsBridgeActive] = useState(isDocsBridgeMode);
  const [docsBridgeStatus, setDocsBridgeStatus] = useState(() => (isDocsBridgeMode() ? "Docs連携待機中" : ""));
  const [salesChannel, setSalesChannel] = useState<SalesChannel>(loadSalesChannel);
  const [manuscripts, setManuscripts] = useState<ManuscriptsByChannel>(initialDraftRef.current.manuscripts);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>(initialDraftRef.current.imageAssets);
  const [undoStacks, setUndoStacks] = useState<ManuscriptHistory>(createEmptyHistory);
  const [redoStacks, setRedoStacks] = useState<ManuscriptHistory>(createEmptyHistory);
  const [editorMode] = useState<EditorMode>("visual");
  const [direction, setDirection] = useState<WritingDirection>("horizontal");
  const [typography, setTypography] = useState<TypographySettings>(loadTypographySettings);
  const [pageBreaks, setPageBreaks] = useState<PageBreakSettings>(loadPageBreakSettings);
  const [coverImage, setCoverImage] = useState<CoverImageState>(loadCoverImage);
  const [aplus, setAplus] = useState<AplusSettings>(loadAplusSettings);
  const [qrUrl, setQrUrl] = useState("https://example.com");
  const [qrTitle, setQrTitle] = useState("Glamorous Shadow");
  const [qrSubtitle, setQrSubtitle] = useState("ヴェル13世×カーラ・マンソン デュエットver");
  const [qrFrame, setQrFrame] = useState("ornament");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [externalQrDataUrl, setExternalQrDataUrl] = useState("");
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [aiSettings, setAiSettings] = useState<AiProviderConfig[]>(loadAiSettings);
  const [status, setStatus] = useState("保存済み");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const visualEditorRef = useRef<HTMLDivElement>(null);
  const isSyncingVisualEditorRef = useRef(false);
  const previewRef = useRef<HTMLElement>(null);
  const qrCardRef = useRef<HTMLDivElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const aplusImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const aplusCardRef = useRef<HTMLDivElement>(null);
  const manuscriptImageInputRef = useRef<HTMLInputElement>(null);
  const qrImageInputRef = useRef<HTMLInputElement>(null);

  const manuscript = manuscripts[salesChannel] ?? sampleManuscript;
  const previewTarget = salesChannel;
  const rendered = useMemo(() => renderManuscript(manuscript, imageAssets), [imageAssets, manuscript]);
  const previewPages = useMemo(
    () => paginatePreviewHtml(rendered.html, typography, direction, previewTarget, pageBreaks.chapterHead),
    [direction, pageBreaks.chapterHead, previewTarget, rendered.html, typography],
  );
  const typographyStyle = useMemo(
    () =>
      ({
        "--writer-font-family": getWriterFontStack(typography.fontFamily),
        "--writer-font-size": `${typography.fontSize}px`,
      }) as CSSProperties,
    [typography],
  );
  const qrImageSrc = externalQrDataUrl || qrDataUrl;

  useEffect(() => {
    const visualEditor = visualEditorRef.current;
    if (!visualEditor || editorMode !== "visual") return;
    if (visualEditor.contains(document.activeElement)) return;

    const nextHtml = rendered.html || "<p><br /></p>";
    if (visualEditor.innerHTML !== nextHtml) {
      isSyncingVisualEditorRef.current = true;
      visualEditor.innerHTML = nextHtml;
      isSyncingVisualEditorRef.current = false;
    }
  }, [editorMode, rendered.html]);

  useEffect(() => {
    if (docsBridgeActive) {
      setStatus(docsBridgeStatus || "Docs連携中");
      return;
    }

    const saved = [
      writeStorageValue(storageKeys.title, title),
      writeStorageJson(storageKeys.manuscripts, manuscripts),
      writeStorageValue(storageKeys.manuscript, manuscript),
    ].every(Boolean);
    setStatus(saved ? "保存済み" : storageWriteErrorMessage);
  }, [docsBridgeActive, docsBridgeStatus, title, manuscript, manuscripts]);

  useEffect(() => {
    if (!writeStorageJson(storageKeys.aiSettings, aiSettings)) setStatus(storageWriteErrorMessage);
  }, [aiSettings]);

  useEffect(() => {
    if (!writeStorageJson(storageKeys.imageAssets, imageAssets)) setStatus(storageWriteErrorMessage);
  }, [imageAssets]);

  useEffect(() => {
    if (!writeStorageJson(storageKeys.typography, typography)) setStatus(storageWriteErrorMessage);
  }, [typography]);

  useEffect(() => {
    if (!writeStorageJson(storageKeys.pageBreaks, pageBreaks)) setStatus(storageWriteErrorMessage);
  }, [pageBreaks]);

  useEffect(() => {
    if (!writeStorageValue(storageKeys.salesChannel, salesChannel)) setStatus(storageWriteErrorMessage);
  }, [salesChannel]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !pageBreaks.pageGuide) return;

    let secondFrame = 0;
    const alignPageStart = () => {
      preview.scrollTop = 0;
      preview.scrollLeft =
        direction === "vertical"
          ? Math.max(0, preview.scrollWidth - preview.clientWidth)
          : 0;
    };
    const firstFrame = window.requestAnimationFrame(() => {
      alignPageStart();
      secondFrame = window.requestAnimationFrame(alignPageStart);
    });
    const timeout = window.setTimeout(alignPageStart, 80);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timeout);
    };
  }, [direction, pageBreaks.pageGuide, previewPages.length, previewTarget]);

  useEffect(() => {
    if (!writeStorageJson(storageKeys.coverImage, coverImage)) setStatus(storageWriteErrorMessage);
  }, [coverImage]);

  useEffect(() => {
    if (!writeStorageJson(storageKeys.aplus, aplus)) setStatus(storageWriteErrorMessage);
  }, [aplus]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrUrl || " ", {
      width: 620,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#050505", light: "#ffffff" },
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  useEffect(() => {
    const handleDocsBridgeMessage = (event: MessageEvent<DocsBridgeMessage>) => {
      if (!isAllowedDocsBridgeOrigin(event.origin)) return;
      const data = event.data;
      if (data?.source !== "umbrella-parade-docs-addon" || data.type !== "docsSnapshot" || !data.snapshot) return;

      const channel = data.target === "kindle" || data.target === "shimauma" ? data.target : undefined;
      const nextDirection = data.direction === "vertical" || data.direction === "horizontal" ? data.direction : undefined;
      const nextManuscript = convertDocsSnapshotToManuscript(data.snapshot);
      const receivedAt = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      setDocsBridgeActive(true);
      setDocsBridgeStatus(`Docsから受信 ${receivedAt}`);
      if (data.snapshot.title) setTitle(data.snapshot.title);
      if (channel) setSalesChannel(channel);
      if (nextDirection) setDirection(nextDirection);
      setActiveTab("write");
      setUndoStacks(createEmptyHistory());
      setRedoStacks(createEmptyHistory());
      setManuscripts((current) => ({
        ...current,
        ...(channel
          ? { [channel]: nextManuscript }
          : {
              kindle: nextManuscript,
              shimauma: nextManuscript,
            }),
      }));
    };

    window.addEventListener("message", handleDocsBridgeMessage);
    return () => window.removeEventListener("message", handleDocsBridgeMessage);
  }, []);

  const updateManuscript = (next: string) => {
    if (next === manuscript) return;
    setUndoStacks((current) => ({
      ...current,
      [salesChannel]: [...current[salesChannel].slice(-99), manuscript],
    }));
    setRedoStacks((current) => ({
      ...current,
      [salesChannel]: [],
    }));
    setManuscripts((current) => ({
      ...current,
      [salesChannel]: next,
    }));
  };

  const undoManuscript = () => {
    setUndoStacks((current) => {
      const activeStack = current[salesChannel];
      const previous = activeStack.at(-1);
      if (previous === undefined) return current;
      setRedoStacks((redo) => ({
        ...redo,
        [salesChannel]: [...redo[salesChannel].slice(-99), manuscript],
      }));
      setManuscripts((drafts) => ({
        ...drafts,
        [salesChannel]: previous,
      }));
      return {
        ...current,
        [salesChannel]: activeStack.slice(0, -1),
      };
    });
  };

  const redoManuscript = () => {
    setRedoStacks((current) => {
      const activeStack = current[salesChannel];
      const next = activeStack.at(-1);
      if (next === undefined) return current;
      setUndoStacks((undo) => ({
        ...undo,
        [salesChannel]: [...undo[salesChannel].slice(-99), manuscript],
      }));
      setManuscripts((drafts) => ({
        ...drafts,
        [salesChannel]: next,
      }));
      return {
        ...current,
        [salesChannel]: activeStack.slice(0, -1),
      };
    });
  };

  const syncVisualEditorToManuscript = () => {
    const visualEditor = visualEditorRef.current;
    if (!visualEditor || isSyncingVisualEditorRef.current) return;

    const next = convertVisualEditorToManuscript(visualEditor, imageAssets);
    setStatus("編集中");
    updateManuscript(next);
  };

  const insertVisualHtml = (html: string) => {
    const visualEditor = visualEditorRef.current;
    if (!visualEditor) return;

    visualEditor.focus();
    ensureSelectionInside(visualEditor);
    document.execCommand("insertHTML", false, html);
    syncVisualEditorToManuscript();
  };

  const getVisualSelectionText = () => {
    const visualEditor = visualEditorRef.current;
    const selection = window.getSelection();
    if (!visualEditor || !selection?.rangeCount || !selection.anchorNode) return "";
    return visualEditor.contains(selection.anchorNode) ? selection.toString() : "";
  };

  const formatVisualBlock = (tagName: "h1" | "h2" | "p") => {
    const visualEditor = visualEditorRef.current;
    if (!visualEditor) return false;

    visualEditor.focus();
    ensureSelectionInside(visualEditor);
    document.execCommand("formatBlock", false, tagName);
    syncVisualEditorToManuscript();
    return true;
  };

  const insertVisualChapterBreak = () => {
    const visualEditor = visualEditorRef.current;
    const block = visualEditor ? getSelectedVisualBlock(visualEditor) : null;
    if (!visualEditor || !block) return;

    const previous = block.previousElementSibling;
    if (!previous?.matches(".chapter-page-break")) {
      const breakElement = document.createElement("div");
      breakElement.className = "chapter-page-break";
      breakElement.dataset.chapterBreak = "true";
      breakElement.setAttribute("aria-hidden", "true");
      block.before(breakElement);
    }
  };

  const insertVisualPageBreak = () => {
    const visualEditor = visualEditorRef.current;
    if (!visualEditor) return;

    visualEditor.focus();
    ensureSelectionInside(visualEditor);
    const block = getSelectedVisualBlock(visualEditor);
    const breakElement = document.createElement("div");
    breakElement.className = "manual-page-break";
    breakElement.dataset.pageBreak = "true";
    breakElement.setAttribute("role", "separator");
    breakElement.textContent = "改ページ";

    if (block) {
      block.before(breakElement);
    } else {
      visualEditor.append(breakElement);
    }

    syncVisualEditorToManuscript();
  };

  const insertBeforeTextSelection = (value: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const scrollTop = editor.scrollTop;
    const selected = manuscript.slice(start, end);
    const next = `${manuscript.slice(0, start)}${value}${selected}${manuscript.slice(end)}`;
    updateManuscript(next);
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + value.length, end + value.length);
      editor.scrollTop = scrollTop;
    });
  };

  const insertAtSelection = (value: string, selectOffset = 0) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const scrollTop = editor.scrollTop;
    const next = `${manuscript.slice(0, start)}${value}${manuscript.slice(end)}`;
    updateManuscript(next);
    window.requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + value.length - selectOffset;
      editor.setSelectionRange(cursor, cursor);
      editor.scrollTop = scrollTop;
    });
  };

  const handleVisualPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const pasted = html ? convertHtmlToManuscriptMarkdown(html) : text;
    if (!pasted.trim()) return;

    event.preventDefault();
    insertVisualHtml(renderManuscript(pasted, imageAssets).html || `<p>${escapeHtml(text)}</p>`);
    setStatus(html ? "見出し付きで貼り付けました" : "貼り付けました");
  };

  const applyHeadingOne = () => {
    if (editorMode === "visual" && formatVisualBlock("h1")) return;

    const editor = editorRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const scrollTop = editor.scrollTop;
    const lineStart = start === end ? manuscript.lastIndexOf("\n", Math.max(0, start - 1)) + 1 : start;
    const nextBreak = manuscript.indexOf("\n", end);
    const lineEnd = start === end ? (nextBreak === -1 ? manuscript.length : nextBreak) : end;
    const selected = manuscript.slice(lineStart, lineEnd);
    const replacement = selected
      .split("\n")
      .map((line) => {
        if (!line.trim()) return line;
        const leading = line.match(/^\s*/)?.[0] || "";
        return `${leading}# ${line.replace(/^\s*#{1,6}\s*/, "").trimStart()}`;
      })
      .join("\n");

    updateManuscript(`${manuscript.slice(0, lineStart)}${replacement}${manuscript.slice(lineEnd)}`);
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(lineStart, lineStart + replacement.length);
      editor.scrollTop = scrollTop;
    });
  };

  const applyChapterTitle = () => {
    if (editorMode === "visual") {
      insertVisualChapterBreak();
      if (formatVisualBlock("h1")) {
        setStatus("章タイトルにしました");
        return;
      }
    }

    const editor = editorRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const scrollTop = editor.scrollTop;
    const lineStart = start === end ? manuscript.lastIndexOf("\n", Math.max(0, start - 1)) + 1 : start;
    const nextBreak = manuscript.indexOf("\n", end);
    const lineEnd = start === end ? (nextBreak === -1 ? manuscript.length : nextBreak) : end;
    const selected = manuscript.slice(lineStart, lineEnd);
    const replacement = selected
      .split("\n")
      .flatMap((line) => {
        if (!line.trim() || /^\s*\[\[CHAPTER_BREAK\]\]\s*$/i.test(line)) return [line];
        const leading = line.match(/^\s*/)?.[0] || "";
        const title = line.replace(/^\s*#{1,6}\s*/, "").trimStart();
        return [`${leading}[[CHAPTER_BREAK]]`, `${leading}# ${title}`];
      })
      .join("\n");

    updateManuscript(`${manuscript.slice(0, lineStart)}${replacement}${manuscript.slice(lineEnd)}`);
    setStatus("章タイトルにしました");
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(lineStart, lineStart + replacement.length);
      editor.scrollTop = scrollTop;
    });
  };

  const addRuby = () => {
    if (editorMode === "visual") {
      const selected = getVisualSelectionText();
      const base = selected || "漢字";
      const ruby = window.prompt("ルビ", "");
      if (ruby === null) return;
      insertVisualHtml(`<ruby>${escapeHtml(base)}<rp>（</rp><rt>${escapeHtml(ruby || "ふりがな")}</rt><rp>）</rp></ruby>`);
      return;
    }

    const editor = editorRef.current;
    const selected = editor ? manuscript.slice(editor.selectionStart, editor.selectionEnd) : "";
    const base = selected || "漢字";
    const ruby = window.prompt("ルビ", "");
    if (ruby === null) return;
    insertAtSelection(`｜${base}《${ruby || "ふりがな"}》`, selected ? 0 : 6);
  };

  const addLink = () => {
    if (editorMode === "visual") {
      const selected = getVisualSelectionText();
      const label = selected || "リンク";
      const url = window.prompt("URL", "https://");
      if (!url) return;
      insertVisualHtml(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
      return;
    }

    const editor = editorRef.current;
    const selected = editor ? manuscript.slice(editor.selectionStart, editor.selectionEnd) : "";
    const label = selected || "リンク";
    const url = window.prompt("URL", "https://");
    if (!url) return;
    insertAtSelection(`[${label}](${url})`);
  };

  const insertInlineToc = () => {
    if (editorMode === "visual") {
      insertVisualHtml(createVisualTocHtml(rendered.toc));
      return;
    }

    insertAtSelection("\n\n[[TOC]]\n\n");
  };

  const insertPageBreak = () => {
    if (editorMode === "visual") {
      insertVisualPageBreak();
      setStatus("改ページを挿入しました");
      return;
    }

    insertBeforeTextSelection("\n\n[[PAGE_BREAK]]\n\n");
    setStatus("改ページを挿入しました");
  };

  const applyInlineSize = (size: "small" | "large") => {
    if (editorMode === "visual") {
      const selected = getVisualSelectionText();
      const fallback = size === "small" ? "小さめ文字" : "大きめ文字";
      const className = size === "small" ? "inline-size-small" : "inline-size-large";
      insertVisualHtml(`<span class="${className}">${escapeHtml(selected || fallback)}</span>`);
      return;
    }

    const editor = editorRef.current;
    const selected = editor ? manuscript.slice(editor.selectionStart, editor.selectionEnd) : "";
    const fallback = size === "small" ? "小さめ文字" : "大きめ文字";
    insertAtSelection(`[[${size}:${selected || fallback}]]`, selected ? 0 : 2);
  };

  const insertManuscriptImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const imageSource = typeof reader.result === "string" ? reader.result : "";
      const alt = file.name.replace(/\.[^.]+$/, "");
      const asset = createImageAsset(file, imageSource, alt);
      setImageAssets((current) => upsertImageAsset(current, asset));
      if (editorMode === "visual") {
        insertVisualHtml(createVisualImageHtml(asset));
      } else {
        insertAtSelection(`\n\n![${alt}](asset:${asset.id})\n\n`);
      }
      setStatus("画像を挿入しました");
    };
    reader.readAsDataURL(file);
  };

  const importQrImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setExternalQrDataUrl(typeof reader.result === "string" ? reader.result : "");
      setStatus("外部QR画像を読み込みました");
    };
    reader.readAsDataURL(file);
  };

  const importCoverImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const source = typeof reader.result === "string" ? reader.result : "";
      const imageSrc = await compactImageDataUrl(source, coverImageMaxSide);
      setCoverImage({
        src: imageSrc,
        name: file.name,
      });
      setStatus("表紙を読み込みました");
    };
    reader.readAsDataURL(file);
  };

  const importAplusImage = (itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const source = typeof reader.result === "string" ? reader.result : "";
      const imageSrc = await compactImageDataUrl(source, aplusImageMaxSide);
      updateAplusItemFields(itemId, {
        imageSrc,
        imageName: file.name,
      });
      validateAplusImageSize(imageSrc, file.name, setStatus);
      setStatus("A+画像を読み込みました");
    };
    reader.readAsDataURL(file);
  };

  const handleExportDocx = async () => {
    setStatus("DOCX作成中");
    await exportDocx(manuscript, title, rendered, typography, pageBreaks);
    setStatus("DOCXを書き出しました");
  };

  const handleExportEpub = async () => {
    setStatus("EPUB作成中");
    await exportEpub(rendered, title, typography, pageBreaks);
    setStatus("EPUBを書き出しました");
  };

  const handleExportPdf = async () => {
    if (!previewRef.current) return;
    setStatus("PDF作成中");
    await exportPdf(previewRef.current, title);
    setStatus("PDFを書き出しました");
  };

  const handleQrDownload = async () => {
    if (!qrCardRef.current) return;
    const canvas = await html2canvas(qrCardRef.current, { backgroundColor: "#ffffff", scale: 2 });
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${qrTitle.replace(/[\\/:*?"<>|]/g, "_") || "qr-code"}.png`);
    });
  };

  const handleCoverDownload = () => {
    if (!coverImage.src) return;
    downloadDataUrl(coverImage.src, coverImage.name || `${title}-cover.png`);
  };

  const handleAplusImageDownload = (item: AplusImageItem, index: number) => {
    if (!item.imageSrc) return;
    downloadDataUrl(item.imageSrc, item.imageName || `${title}-aplus-${index + 1}.png`);
  };

  const handleAplusDownload = async () => {
    if (!aplusCardRef.current) return;
    const canvas = await html2canvas(aplusCardRef.current, { backgroundColor: "#ffffff", scale: 2 });
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${safeDownloadName(title)}-aplus.png`);
    });
  };

  const updateAiSetting = (providerKey: string, field: "apiKey" | "selectedModel", value: string) => {
    setAiSettings((current) =>
      current.map((item) => (item.key === providerKey ? { ...item, [field]: value } : item)),
    );
  };

  const updateAplusItem = <K extends keyof AplusImageItem>(itemId: string, field: K, value: AplusImageItem[K]) => {
    setAplus((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    }));
  };

  const updateAplusItemFields = (itemId: string, fields: Partial<AplusImageItem>) => {
    setAplus((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, ...fields } : item)),
    }));
  };

  const chooseSalesChannel = (channel: SalesChannel) => {
    setSalesChannel(channel);
    if (channel === "kindle" && activeTab === "qr") {
      setActiveTab("write");
    }
  };

  const scrollVerticalPreview = (side: "left" | "right") => {
    const preview = previewRef.current;
    if (!preview) return;

    const amount = Math.max(220, Math.round(preview.clientWidth * 0.72));
    preview.scrollBy({
      left: side === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const handlePreviewWheel = (event: WheelEvent<HTMLElement>) => {
    const preview = previewRef.current;
    if (!preview || !pageBreaks.pageGuide || preview.scrollWidth <= preview.clientWidth) return;

    event.preventDefault();
    event.stopPropagation();

    const dominantDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    const delta = direction === "vertical" ? -dominantDelta : dominantDelta;
    preview.scrollBy({ left: delta, behavior: "auto" });
    preview.scrollTop = 0;
  };

  const focusEditorHeading = (id: string) => {
    if (editorMode === "visual") {
      const visualEditor = visualEditorRef.current;
      const heading = Array.from(visualEditor?.querySelectorAll<HTMLElement>("[id]") || []).find(
        (element) => element.id === id,
      );
      if (!visualEditor || !heading) return;

      visualEditor.focus();
      heading.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      heading.classList.add("jump-highlight");
      window.setTimeout(() => heading.classList.remove("jump-highlight"), 1800);
      return;
    }

    const editor = editorRef.current;
    const tocIndex = rendered.toc.findIndex((item) => item.id === id);
    if (!editor || tocIndex < 0) return;

    const normalized = manuscript.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    let cursor = 0;
    let headingIndex = 0;

    for (const line of lines) {
      if (/^#{1,2}\s+/.test(line)) {
        if (headingIndex === tocIndex) {
          const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 30;
          const lineNumber = normalized.slice(0, cursor).split("\n").length - 1;
          editor.focus();
          editor.setSelectionRange(cursor, cursor + line.length);
          editor.scrollTop = Math.max(0, lineNumber * lineHeight - 80);
          return;
        }
        headingIndex += 1;
      }

      cursor += line.length + 1;
    }
  };

  const focusPreviewHeading = (heading: HTMLElement) => {
    const preview = previewRef.current;
    if (!preview) return;

    preview.querySelectorAll(".jump-highlight").forEach((element) => {
      element.classList.remove("jump-highlight");
    });
    heading.classList.add("jump-highlight");

    const sheet = heading.closest<HTMLElement>(".preview-sheet");
    if (sheet) {
      const previewRect = preview.getBoundingClientRect();
      const sheetRect = sheet.getBoundingClientRect();
      const nextLeft = preview.scrollLeft + sheetRect.left - previewRect.left - 12;
      preview.scrollTo({ left: Math.max(0, nextLeft), top: 0, behavior: "smooth" });
    } else {
      heading.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }

    window.setTimeout(() => heading.classList.remove("jump-highlight"), 1800);
  };

  const jumpToHeading = (id: string) => {
    setActiveTab("write");
    setActiveHeadingId(id);

    window.setTimeout(() => {
      focusEditorHeading(id);
      const headings = Array.from(previewRef.current?.querySelectorAll<HTMLElement>("[id]") || []);
      const heading = headings.find((element) => element.id === id);
      if (!heading) return;

      focusPreviewHeading(heading);
      window.history.replaceState(null, "", `#${id}`);
    }, 40);
  };

  const handlePreviewClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
    const href = anchor?.getAttribute("href") || "";
    const id = href.slice(1);
    if (!id || !rendered.toc.some((item) => item.id === id)) return;

    event.preventDefault();
    jumpToHeading(id);
  };

  const handleVisualEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("#")) {
      const id = href.slice(1);
      if (rendered.toc.some((item) => item.id === id)) {
        event.preventDefault();
        jumpToHeading(id);
      }
      return;
    }

    event.preventDefault();
    setStatus("リンクはプレビューか書き出しで開けます");
  };

  return (
    <div className={`app-shell ${docsBridgeActive ? "docs-bridge-mode" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <BookOpen size={24} aria-hidden />
          <div>
            <p className="eyebrow">Umbrella Parade</p>
            <h1>Writer</h1>
          </div>
        </div>

        <nav className="tabbar" aria-label="workspace">
          <button className={activeTab === "write" ? "active" : ""} onClick={() => setActiveTab("write")}>
            <FileText size={18} aria-hidden />
            原稿
          </button>
          <div className="channel-tabs" aria-label="原稿種別">
            {(Object.keys(salesChannelLabels) as SalesChannel[]).map((channel) => (
              <button
                key={channel}
                className={salesChannel === channel ? "active" : ""}
                onClick={() => {
                  setActiveTab("write");
                  chooseSalesChannel(channel);
                }}
              >
                {salesChannelLabels[channel]}
              </button>
            ))}
          </div>
          <button
            className={activeTab === "qr" ? "active" : ""}
            onClick={() => setActiveTab("qr")}
            disabled={salesChannel !== "shimauma"}
            title={salesChannel === "shimauma" ? "しまうま用QRを作る" : "Kindleでは本文リンクを使います"}
          >
            <QrCode size={18} aria-hidden />
            QR
          </button>
          <button className={activeTab === "aplus" ? "active" : ""} onClick={() => setActiveTab("aplus")}>
            <Sparkles size={18} aria-hidden />
            A+
          </button>
          <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>
            <Settings size={18} aria-hidden />
            設定
          </button>
        </nav>

        <div className="exportbar">
          <button title="DOCXを書き出す" onClick={handleExportDocx}>
            <Download size={17} aria-hidden />
            DOCX
          </button>
          <button title="EPUBを書き出す" onClick={handleExportEpub}>
            <Download size={17} aria-hidden />
            EPUB
          </button>
          <button title="PDFを書き出す" onClick={handleExportPdf}>
            <Download size={17} aria-hidden />
            PDF
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="outline-panel">
          <label className="field-label" htmlFor="book-title">
            作品名
          </label>
          <input id="book-title" value={title} onChange={(event) => setTitle(event.target.value)} />

          <div className="active-channel-note">
            <p className="panel-title">制作先：{salesChannelLabels[salesChannel]}</p>
            <p className="mode-hint">
              {salesChannel === "kindle"
                ? "Kindleは本文リンクで誘導。QRは紙面用です。"
                : "しまうまは紙面用。リンク先はQRで案内します。"}
            </p>
          </div>

          <div className="stats-row">
            <span>{rendered.wordCount.toLocaleString()}字</span>
            <span>{rendered.toc.filter((item) => item.level === 1).length}章</span>
          </div>

          <div className="outline-list">
            <p className="panel-title">目次</p>
            {rendered.toc.length ? (
              rendered.toc.map((item) => (
                <a
                  key={item.id}
                  className={`toc-link level-${item.level} ${activeHeadingId === item.id ? "active" : ""}`}
                  href={`#${item.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    jumpToHeading(item.id);
                  }}
                >
                  {item.title}
                </a>
              ))
            ) : (
              <span className="muted">見出しなし</span>
            )}
          </div>

          <div className="status-pill">{docsBridgeActive ? docsBridgeStatus || status : status}</div>

          {rendered.images.length > 0 && (
            <div className="sidebar-image-panel" aria-label="本文画像">
              <p className="panel-title">本文画像</p>
              <div className="sidebar-image-list">
                {rendered.images.map((image) => (
                  <figure className="sidebar-image-card" key={image.id}>
                    <img src={image.src} alt="" />
                    <figcaption>{image.alt || image.id}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </aside>

        {activeTab === "write" && (
          <section
            className={`writer-grid ${docsBridgeActive ? "docs-bridge-grid" : ""}`}
            style={typographyStyle}
            aria-label="manuscript editor"
          >
            <div className="control-strip">
              <div className="tool-buttons primary-tools" onMouseDown={(event) => event.preventDefault()}>
                <button title="選択行を見出し1にする" onClick={applyHeadingOne}>
                  <Heading1 size={17} aria-hidden />
                </button>
                <button className="wide-tool-button" title="選択行を章タイトルにする" onClick={applyChapterTitle}>
                  <FileText size={17} aria-hidden />
                  章タイトル
                </button>
                <button title="元に戻す" onClick={undoManuscript} disabled={!undoStacks[salesChannel].length}>
                  <Undo2 size={17} aria-hidden />
                </button>
                <button title="やり直す" onClick={redoManuscript} disabled={!redoStacks[salesChannel].length}>
                  <Redo2 size={17} aria-hidden />
                </button>
                <button title="ルビを振る" onClick={addRuby}>
                  <Type size={17} aria-hidden />
                </button>
                <button title="選択文字を小さくする" onClick={() => applyInlineSize("small")}>
                  小
                </button>
                <button title="選択文字を大きくする" onClick={() => applyInlineSize("large")}>
                  大
                </button>
                <button
                  title={salesChannel === "kindle" ? "Kindle用リンクを埋め込む" : "紙面ではQR案内も確認してください"}
                  onClick={addLink}
                >
                  <Link size={17} aria-hidden />
                </button>
                <button title="本文目次を挿入" onClick={insertInlineToc}>
                  <ListTree size={17} aria-hidden />
                </button>
                <button className="wide-tool-button" title="改ページを挿入" onClick={insertPageBreak}>
                  <FileText size={17} aria-hidden />
                  改ページ
                </button>
                <button title="画像を挿入" onClick={() => manuscriptImageInputRef.current?.click()}>
                  <ImageIcon size={17} aria-hidden />
                </button>
                <input
                  ref={manuscriptImageInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={insertManuscriptImage}
                />
              </div>

              <div className="preview-control-group" aria-label="preview controls">
                <span className="control-label">プレビュー：{salesChannelLabels[salesChannel]}</span>
                <div className="segmented">
                  <button
                    className={direction === "horizontal" ? "active" : ""}
                    onClick={() => setDirection("horizontal")}
                  >
                    横書き
                  </button>
                  <button className={direction === "vertical" ? "active" : ""} onClick={() => setDirection("vertical")}>
                    縦書き
                  </button>
                </div>
                <label className="toggle-control">
                  <input
                    type="checkbox"
                    checked={pageBreaks.chapterHead}
                    onChange={(event) =>
                      setPageBreaks((current) => ({
                        ...current,
                        chapterHead: event.target.checked,
                      }))
                    }
                  />
                  改ページ反映
                </label>
                <label className="toggle-control">
                  <input
                    type="checkbox"
                    checked={pageBreaks.pageGuide}
                    onChange={(event) =>
                      setPageBreaks((current) => ({
                        ...current,
                        pageGuide: event.target.checked,
                      }))
                    }
                  />
                  ページガイド
                </label>
                {direction === "vertical" && (
                  <div className="vertical-scroll-buttons" aria-label="縦書き移動">
                    <button title="左へ移動" onClick={() => scrollVerticalPreview("left")}>
                      <ChevronLeft size={17} aria-hidden />
                    </button>
                    <button title="右へ移動" onClick={() => scrollVerticalPreview("right")}>
                      <ChevronRight size={17} aria-hidden />
                    </button>
                  </div>
                )}
              </div>

              <div className="typography-controls" aria-label="typography">
                <label>
                  <span>フォント</span>
                  <select
                    value={typography.fontFamily}
                    onChange={(event) =>
                      setTypography((current) => ({
                        ...current,
                        fontFamily: event.target.value as TypographySettings["fontFamily"],
                      }))
                    }
                  >
                    {fontOptions.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>サイズ</span>
                  <select
                    value={typography.fontSize}
                    onChange={(event) =>
                      setTypography((current) => ({
                        ...current,
                        fontSize: Number(event.target.value),
                      }))
                    }
                  >
                    {fontSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {!docsBridgeActive && (
              <div className="editor-pane">
                <div
                  ref={visualEditorRef}
                  className="visual-editor"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  aria-label="ビジュアル原稿エディタ"
                  onInput={syncVisualEditorToManuscript}
                  onPaste={handleVisualPaste}
                  onClick={handleVisualEditorClick}
                  onKeyDown={(event) => {
                    const isUndo =
                      (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
                    const isRedo =
                      (event.ctrlKey || event.metaKey) &&
                      (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"));
                    const isCut =
                      (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "x";

                    if (isUndo) {
                      event.preventDefault();
                      undoManuscript();
                    }

                    if (isRedo) {
                      event.preventDefault();
                      redoManuscript();
                    }

                    if (isCut) {
                      window.setTimeout(syncVisualEditorToManuscript, 0);
                    }
                  }}
                />
              </div>
            )}

            <article
              ref={previewRef}
              className={`preview-page ${direction} ${previewTarget} ${pageBreaks.chapterHead ? "reflect-page-breaks" : ""} ${
                pageBreaks.pageGuide ? "show-page-guides" : ""
              }`}
              onClick={handlePreviewClick}
              onWheelCapture={handlePreviewWheel}
            >
              {pageBreaks.pageGuide ? (
                <div className="preview-page-list">
                  {previewPages.map((page) => (
                    <section className={`preview-sheet ${direction} ${previewTarget}`} key={page.pageNumber}>
                      <div className="preview-sheet-body" dangerouslySetInnerHTML={{ __html: page.html }} />
                      <span className="page-number">{page.pageNumber}</span>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="continuous-preview-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />
              )}
            </article>
          </section>
        )}

        {activeTab === "qr" && (
          <section className="qr-workspace" aria-label="qr maker">
            <div className="settings-panel">
              <p className="mode-note">しまうまマルシェ用のQRを作ります。Kindleでは本文リンクを使います。</p>

              <label className="field-label" htmlFor="qr-url">
                URL
              </label>
              <input id="qr-url" value={qrUrl} onChange={(event) => setQrUrl(event.target.value)} />

              <input
                ref={qrImageInputRef}
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={importQrImage}
              />
              <div className="inline-actions">
                <button className="secondary-action" onClick={() => qrImageInputRef.current?.click()}>
                  <Upload size={16} aria-hidden />
                  外部QR画像
                </button>
                {externalQrDataUrl && (
                  <button className="secondary-action" onClick={() => setExternalQrDataUrl("")}>
                    <X size={16} aria-hidden />
                    生成QRに戻す
                  </button>
                )}
              </div>

              <label className="field-label" htmlFor="qr-title">
                タイトル
              </label>
              <input id="qr-title" value={qrTitle} onChange={(event) => setQrTitle(event.target.value)} />

              <label className="field-label" htmlFor="qr-subtitle">
                サブタイトル
              </label>
              <input id="qr-subtitle" value={qrSubtitle} onChange={(event) => setQrSubtitle(event.target.value)} />

              <label className="field-label" htmlFor="qr-frame">
                外枠
              </label>
              <select id="qr-frame" value={qrFrame} onChange={(event) => setQrFrame(event.target.value)}>
                <option value="archive">記録室</option>
                <option value="ornament">装飾</option>
                <option value="classic">クラシック</option>
                <option value="minimal">ミニマル</option>
              </select>

              <button className="primary-action" onClick={handleQrDownload}>
                <Download size={18} aria-hidden />
                PNG
              </button>
            </div>

            <div className={`qr-card ${qrFrame}`} ref={qrCardRef}>
              <span className="corner top-left" />
              <span className="corner top-right" />
              <span className="corner bottom-left" />
              <span className="corner bottom-right" />
              {qrFrame === "archive" && (
                <>
                  <span className="archive-line top" />
                  <span className="archive-line bottom" />
                </>
              )}
              {qrImageSrc && <img src={qrImageSrc} alt="" />}
              <h2>{qrTitle}</h2>
              <p>{qrSubtitle}</p>
            </div>
          </section>
        )}

        {activeTab === "aplus" && (
          <section className="aplus-workspace" aria-label="a plus maker">
            <div className="settings-panel">
              <div>
                <p className="panel-title">表紙</p>
                <input
                  ref={coverImageInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={importCoverImage}
                />
                <div className="inline-actions">
                  <button className="secondary-action" onClick={() => coverImageInputRef.current?.click()}>
                    <Upload size={16} aria-hidden />
                    表紙画像
                  </button>
                  <button className="secondary-action" onClick={handleCoverDownload} disabled={!coverImage.src}>
                    <Download size={16} aria-hidden />
                    表紙保存
                  </button>
                </div>
              </div>

              <div className="aplus-item-editor-list">
                {aplus.items.map((item, index) => (
                  <section className="aplus-item-editor" key={item.id}>
                    <div className="aplus-item-heading">
                      <p className="panel-title">A+ 画像 {index + 1}</p>
                      <span>300px×300px以上</span>
                    </div>
                    <input
                      ref={(element) => {
                        aplusImageInputRefs.current[item.id] = element;
                      }}
                      className="visually-hidden"
                      type="file"
                      accept="image/*"
                      onChange={(event) => importAplusImage(item.id, event)}
                    />
                    <div className="inline-actions">
                      <button
                        className="secondary-action"
                        onClick={() => aplusImageInputRefs.current[item.id]?.click()}
                      >
                        <Upload size={16} aria-hidden />
                        画像
                      </button>
                      <button
                        className="secondary-action"
                        onClick={() => handleAplusImageDownload(item, index)}
                        disabled={!item.imageSrc}
                      >
                        <Download size={16} aria-hidden />
                        画像保存
                      </button>
                    </div>

                    <label className="field-label" htmlFor={`${item.id}-alt`}>
                      代替テキスト <span>{item.altText.length}/100</span>
                    </label>
                    <input
                      id={`${item.id}-alt`}
                      value={item.altText}
                      maxLength={100}
                      onChange={(event) => updateAplusItem(item.id, "altText", event.target.value)}
                    />

                    <label className="field-label" htmlFor={`${item.id}-caption`}>
                      画像キャプション <span>{item.caption.length}/200</span>
                    </label>
                    <input
                      id={`${item.id}-caption`}
                      value={item.caption}
                      maxLength={200}
                      onChange={(event) => updateAplusItem(item.id, "caption", event.target.value)}
                    />

                    <label className="field-label" htmlFor={`${item.id}-heading`}>
                      見出し <span>{item.heading.length}/160</span>
                    </label>
                    <input
                      id={`${item.id}-heading`}
                      value={item.heading}
                      maxLength={160}
                      onChange={(event) => updateAplusItem(item.id, "heading", event.target.value)}
                    />

                    <label className="field-label" htmlFor={`${item.id}-description`}>
                      説明 <span>{item.description.length}/1000</span>
                    </label>
                    <textarea
                      id={`${item.id}-description`}
                      className="compact-textarea"
                      value={item.description}
                      maxLength={1000}
                      onChange={(event) => updateAplusItem(item.id, "description", event.target.value)}
                    />
                  </section>
                ))}
              </div>

              <button className="primary-action" onClick={handleAplusDownload}>
                <Download size={18} aria-hidden />
                A+ PNG
              </button>
            </div>

            <div className="aplus-preview-column">
              <div className="cover-preview">
                {coverImage.src ? (
                  <img src={coverImage.src} alt="" />
                ) : (
                  <div className="empty-preview">表紙</div>
                )}
              </div>

              <div ref={aplusCardRef} className="aplus-gallery">
                {aplus.items.map((item, index) => (
                  <article className="aplus-gallery-card" key={item.id}>
                    <div className="aplus-square">
                      {item.imageSrc ? (
                        <img src={item.imageSrc} alt={item.altText} />
                      ) : (
                        <div className="aplus-placeholder">A+ {index + 1}</div>
                      )}
                    </div>
                    <div className="aplus-gallery-copy">
                      {item.caption && <p className="aplus-caption">{item.caption}</p>}
                      <h2>{item.heading || `A+ 画像 ${index + 1}`}</h2>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="settings-grid" aria-label="settings">
            {AI_PROVIDERS.map((provider) => {
              const setting = aiSettings.find((item) => item.key === provider.key);
              return (
                <div className="provider-card" key={provider.key}>
                  <div className="provider-heading">
                    <Sparkles size={18} aria-hidden />
                    <h2>{provider.label}</h2>
                  </div>
                  <label className="field-label" htmlFor={`${provider.key}-api-key`}>
                    API key
                  </label>
                  <input
                    id={`${provider.key}-api-key`}
                    type="password"
                    value={setting?.apiKey || ""}
                    onChange={(event) => updateAiSetting(provider.key, "apiKey", event.target.value)}
                    autoComplete="off"
                  />
                  <label className="field-label" htmlFor={`${provider.key}-model`}>
                    Model
                  </label>
                  <select
                    id={`${provider.key}-model`}
                    value={setting?.selectedModel || provider.defaultModel}
                    onChange={(event) => updateAiSetting(provider.key, "selectedModel", event.target.value)}
                  >
                    {provider.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label} - {model.note}
                      </option>
                    ))}
                  </select>
                  <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                    公式モデル一覧
                  </a>
                </div>
              );
            })}

            <div className="provider-card future-card">
              <div className="provider-heading">
                <Sparkles size={18} aria-hidden />
                <h2>AI原稿取り込み</h2>
              </div>
              <label className="field-label" htmlFor="import-source">
                取り込み元
              </label>
              <select id="import-source" defaultValue="custom-gpt">
                <option value="custom-gpt">Custom GPT</option>
                <option value="gem">Gem</option>
                <option value="claude-project">Claude Project</option>
              </select>
              <label className="field-label" htmlFor="import-token">
                Import token
              </label>
              <input id="import-token" disabled placeholder="将来対応" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

type PreviewPage = {
  html: string;
  pageNumber: number;
};

function paginatePreviewHtml(
  html: string,
  typography: TypographySettings,
  direction: WritingDirection,
  target: SalesChannel,
  reflectManualBreaks: boolean,
): PreviewPage[] {
  const queue = html
    .split("\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitPreviewBlock(block, typography, direction, target));
  const capacity = getPreviewPageCapacity(typography, direction, target);
  const pages: PreviewPage[] = [];
  let currentBlocks: string[] = [];
  let currentUnits = 0;

  const flushPage = () => {
    if (!currentBlocks.length) return;
    pages.push({
      html: currentBlocks.join("\n"),
      pageNumber: pages.length + 1,
    });
    currentBlocks = [];
    currentUnits = 0;
  };

  while (queue.length) {
    const block = queue.shift() || "";
    if (!block) continue;

    if (block.includes('data-page-break="true"') || block.includes('data-chapter-break="true"')) {
      if (reflectManualBreaks) flushPage();
      continue;
    }

    if (reflectManualBreaks && block.includes('data-chapter-start="true"')) {
      flushPage();
    }

    const blockUnits = estimatePreviewBlockUnits(block, typography, direction, target);
    if (currentBlocks.length && currentUnits + blockUnits > capacity) {
      const remainingUnits = Math.max(0, capacity - currentUnits);
      const fragments = splitPreviewBlockForUnits(block, remainingUnits, typography, direction, target);
      if (fragments.length > 1) {
        const firstUnits = estimatePreviewBlockUnits(fragments[0], typography, direction, target);
        if (firstUnits <= remainingUnits + 0.25) {
          currentBlocks.push(fragments[0]);
          flushPage();
          queue.unshift(...fragments.slice(1));
          continue;
        }
      }

      flushPage();
    }

    const nextBlockUnits = estimatePreviewBlockUnits(block, typography, direction, target);
    if (!currentBlocks.length && nextBlockUnits > capacity) {
      const fragments = splitPreviewBlockForUnits(block, capacity, typography, direction, target);
      if (fragments.length > 1) {
        queue.unshift(...fragments);
        continue;
      }
    }

    currentBlocks.push(block);
    currentUnits += nextBlockUnits;
  }

  flushPage();
  return pages.length ? pages : [{ html: "", pageNumber: 1 }];
}

function getPreviewPageCapacity(
  typography: TypographySettings,
  direction: WritingDirection,
  target: SalesChannel,
) {
  const fontScaleFromMinimum = 14 / typography.fontSize;
  const fontScale = 16 / typography.fontSize;

  if (target === "kindle" && direction === "horizontal") {
    return Math.max(24, Math.floor(45 * fontScaleFromMinimum));
  }

  if (direction === "vertical") {
    return Math.max(7, Math.floor((target === "shimauma" ? 10 : 22) * fontScale));
  }

  return Math.max(10, Math.floor((target === "shimauma" ? 16 : 32) * fontScale));
}

function estimatePreviewBlockUnits(
  block: string,
  typography: TypographySettings,
  direction: WritingDirection,
  target: SalesChannel,
) {
  if (block.includes("manuscript-image")) return target === "shimauma" ? 13 : 11;
  if (block.includes("manuscript-toc")) {
    const entryCount = (block.match(/toc-level-/g) || []).length;
    return Math.max(4, Math.ceil(entryCount * 0.85) + 2);
  }

  const textLength = getVisibleTextLength(block);
  const charsPerLine = getPreviewCharsPerLine(typography, direction, target);

  if (direction === "vertical") {
    const columns = Math.max(1, Math.ceil(textLength / charsPerLine));
    if (/^<h1\b/.test(block)) return columns + 1.4;
    if (/^<h2\b/.test(block)) return columns + 0.9;
    return columns + 0.35;
  }

  const lines = Math.max(1, Math.ceil(textLength / charsPerLine));
  if (/^<h1\b/.test(block)) return target === "kindle" ? lines + 1.8 : lines + 2.8;
  if (/^<h2\b/.test(block)) return target === "kindle" ? lines + 1.2 : lines + 1.8;
  return target === "kindle" ? lines + 0.85 : lines + 0.95;
}

function getPreviewCharsPerLine(
  typography: TypographySettings,
  direction: WritingDirection,
  target: SalesChannel,
) {
  const fontScaleFromMinimum = 14 / typography.fontSize;
  const fontScale = 16 / typography.fontSize;

  if (target === "kindle" && direction === "horizontal") {
    return Math.max(18, Math.floor(32 * fontScaleFromMinimum));
  }

  if (direction === "vertical") {
    return Math.max(18, Math.floor((target === "shimauma" ? 34 : 44) * fontScale));
  }

  return Math.max(14, Math.floor((target === "shimauma" ? 22 : 28) * fontScale));
}

function splitPreviewBlock(
  block: string,
  typography: TypographySettings,
  direction: WritingDirection,
  target: SalesChannel,
) {
  if (!/^<p\b/i.test(block)) return [block];

  const capacity = getPreviewPageCapacity(typography, direction, target);
  const units = estimatePreviewBlockUnits(block, typography, direction, target);
  if (units <= capacity) return [block];

  return splitPreviewBlockForUnits(block, capacity, typography, direction, target);
}

function splitPreviewBlockForUnits(
  block: string,
  availableUnits: number,
  typography: TypographySettings,
  direction: WritingDirection,
  target: SalesChannel,
) {
  if (!/^<p\b/i.test(block) || availableUnits < 2) return [block];

  const charsPerLine = getPreviewCharsPerLine(typography, direction, target);
  const usableUnits = Math.max(1, availableUnits - (target === "kindle" ? 1.25 : 1.5));
  const maxChars = Math.max(charsPerLine * 2, Math.floor(charsPerLine * usableUnits));
  const fragments = splitParagraphBlock(block, maxChars);
  return fragments.length ? fragments : [block];
}

function splitParagraphBlock(block: string, maxChars: number) {
  const parsed = new DOMParser().parseFromString(block, "text/html");
  const paragraph = parsed.body.firstElementChild;
  if (!paragraph) return [];

  const tokens = createPreviewInlineTokens(Array.from(paragraph.childNodes), maxChars);
  const chunks: string[] = [];
  let currentHtml = "";
  let currentChars = 0;

  tokens.forEach((token) => {
    if (currentHtml && currentChars + token.length > maxChars) {
      chunks.push(`<p>${currentHtml}</p>`);
      currentHtml = "";
      currentChars = 0;
    }

    currentHtml += token.html;
    currentChars += token.length;
  });

  if (currentHtml) chunks.push(`<p>${currentHtml}</p>`);
  return chunks;
}

function createPreviewInlineTokens(nodes: Node[], maxChars: number): { html: string; length: number }[] {
  return nodes.flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return splitPreviewText(node.textContent || "", maxChars).map((text) => ({
        html: escapeHtml(text),
        length: text.replace(/\s/g, "").length,
      }));
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return [];

    const element = node as Element;
    return splitPreviewInlineElement(element, maxChars);
  });
}

function splitPreviewInlineElement(element: Element, maxChars: number): { html: string; length: number }[] {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "br") return [{ html: "<br />", length: 1 }];

  const html = element.outerHTML;
  const length = Math.max(1, getVisibleTextLength(html));
  if (length <= maxChars) return [{ html, length }];

  if (tagName === "a") {
    const href = element.getAttribute("href") || "";
    const target = element.getAttribute("target") || "";
    const rel = element.getAttribute("rel") || "";
    const attrs = [
      href ? `href="${escapeHtml(href)}"` : "",
      target ? `target="${escapeHtml(target)}"` : "",
      rel ? `rel="${escapeHtml(rel)}"` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return splitPreviewText(element.textContent || "", maxChars).map((text) => ({
      html: `<a ${attrs}>${escapeHtml(text)}</a>`,
      length: text.replace(/\s/g, "").length,
    }));
  }

  if (tagName === "span") {
    const className = element.getAttribute("class") || "";
    const attrs = className ? ` class="${escapeHtml(className)}"` : "";
    return splitPreviewText(element.textContent || "", maxChars).map((text) => ({
      html: `<span${attrs}>${escapeHtml(text)}</span>`,
      length: text.replace(/\s/g, "").length,
    }));
  }

  return createPreviewInlineTokens(Array.from(element.childNodes), maxChars);
}

function splitPreviewText(text: string, maxChars: number) {
  const parts = text.match(/[^。！？!?]+[。！？!?]?|[。！？!?]+|\s+/g) || [text];
  const chunks: string[] = [];
  let current = "";
  let currentLength = 0;

  const pushCurrent = () => {
    if (!current) return;
    chunks.push(current);
    current = "";
    currentLength = 0;
  };

  parts.forEach((part) => {
    const partLength = part.replace(/\s/g, "").length;

    if (partLength > maxChars) {
      pushCurrent();
      for (let index = 0; index < part.length; index += maxChars) {
        chunks.push(part.slice(index, index + maxChars));
      }
      return;
    }

    if (current && currentLength + partLength > maxChars) {
      pushCurrent();
    }

    current += part;
    currentLength += partLength;
  });

  pushCurrent();
  return chunks;
}

function getVisibleTextLength(html: string) {
  return html
    .replace(/<rt\b[^>]*>.*?<\/rt>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "あ")
    .replace(/\s/g, "").length;
}

function isDocsBridgeMode() {
  try {
    return new URLSearchParams(window.location.search).get("docsBridge") === "1";
  } catch {
    return false;
  }
}

function isAllowedDocsBridgeOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "script.google.com" || hostname === "script.googleusercontent.com" || hostname.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

function convertDocsSnapshotToManuscript(snapshot: DocsSnapshot) {
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const tocItems = normalizeDocsTocItems(snapshot.toc);
  const usedInferredHeadings = new Map<string, number>();
  const lines: string[] = [];
  let looseTocInserted = false;
  let insideLooseToc = false;

  blocks.forEach((block) => {
    if (block.type === "pageBreak") {
      insideLooseToc = false;
      lines.push("[[PAGE_BREAK]]");
      return;
    }

    if (block.type === "toc") {
      insideLooseToc = false;
      lines.push("[[TOC]]");
      return;
    }

    const text = docsSegmentsToMarkdown(block.segments, block.text || "", tocItems);
    const plainText = stripMarkdownLinks(text).trim();

    if (isDocsTocBlockText(text, tocItems) || isStandaloneDocsTocHeading(plainText, tocItems)) {
      if (!looseTocInserted) {
        lines.push("[[TOC]]");
        looseTocInserted = true;
      }
      insideLooseToc = true;
      return;
    }

    if (insideLooseToc && !block.headingLevel && isDocsTocEntryText(text, tocItems)) {
      return;
    }

    insideLooseToc = false;

    const headingLevel = getDocsHeadingLevel(block, plainText, tocItems, usedInferredHeadings);
    if (headingLevel === 1) {
      lines.push(`# ${plainText || "無題の見出し"}`);
      return;
    }
    if (headingLevel >= 2) {
      lines.push(`## ${plainText || "無題の見出し"}`);
      return;
    }
    if (block.type === "listItem") {
      lines.push(text ? `- ${text}` : "");
      return;
    }
    lines.push(text);
  });

  return lines.join("\n\n").replace(/\n{4,}/g, "\n\n\n").trim() || sampleManuscript;
}

type NormalizedDocsTocItem = {
  id: string;
  title: string;
  level: 1 | 2;
  normalizedTitle: string;
};

function normalizeDocsTocItems(toc: DocsSnapshot["toc"]): NormalizedDocsTocItem[] {
  if (!Array.isArray(toc)) return [];

  return toc
    .map((item, index) => {
      const title = String(item.title || "").trim();
      if (!title) return null;
      return {
        id: toAnchorId(title, index + 1),
        title,
        level: item.level === 2 ? 2 : 1,
        normalizedTitle: normalizeDocsTitle(title),
      };
    })
    .filter((item): item is NormalizedDocsTocItem => Boolean(item?.title));
}

function getDocsHeadingLevel(
  block: DocsSnapshotBlock,
  plainText: string,
  tocItems: NormalizedDocsTocItem[],
  usedInferredHeadings: Map<string, number>,
) {
  if (block.headingLevel) return block.headingLevel;

  const normalizedText = normalizeDocsTitle(plainText);
  if (!normalizedText) return 0;

  const matches = tocItems.filter((item) => item.normalizedTitle === normalizedText);
  if (!matches.length) return 0;

  const usedCount = usedInferredHeadings.get(normalizedText) || 0;
  const match = matches[Math.min(usedCount, matches.length - 1)];
  usedInferredHeadings.set(normalizedText, usedCount + 1);
  return match.level;
}

function isDocsTocBlockText(text: string, tocItems: NormalizedDocsTocItem[]) {
  if (!tocItems.length) return false;

  const plainText = stripMarkdownLinks(text).trim();
  if (!plainText) return false;

  const normalizedText = normalizeDocsTitle(plainText);
  const titleMatches = tocItems.filter(
    (item) => item.normalizedTitle && normalizedText.includes(item.normalizedTitle),
  ).length;
  const looksLikeToc = /目次|contents|tableofcontents/i.test(normalizedText);

  return (looksLikeToc && titleMatches >= 1) || titleMatches >= 3;
}

function isStandaloneDocsTocHeading(text: string, tocItems: NormalizedDocsTocItem[]) {
  if (!tocItems.length) return false;
  const normalizedText = normalizeDocsTitle(text);
  return /^目次/.test(normalizedText) || normalizedText === "contents" || normalizedText === "tableofcontents";
}

function isDocsTocEntryText(text: string, tocItems: NormalizedDocsTocItem[]) {
  const normalizedText = normalizeDocsTitle(stripMarkdownLinks(text));
  return Boolean(normalizedText && tocItems.some((item) => item.normalizedTitle === normalizedText));
}

function docsSegmentsToMarkdown(
  segments: DocsSnapshotSegment[] | undefined,
  fallback: string,
  tocItems: NormalizedDocsTocItem[],
) {
  const source = Array.isArray(segments) && segments.length ? segments : [{ text: fallback, url: "" }];
  return source
    .map((segment) => {
      const text = String(segment.text || "");
      const url = String(segment.url || "").trim();
      if (!text) return "";
      const internalId = resolveDocsInternalLink(text, url, tocItems);
      if (internalId) return `[${escapeMarkdownLinkLabel(text)}](#${internalId})`;
      if (!/^https?:\/\//i.test(url)) return text;
      return `[${escapeMarkdownLinkLabel(text)}](${url})`;
    })
    .join("");
}

function resolveDocsInternalLink(text: string, url: string, tocItems: NormalizedDocsTocItem[]) {
  if (!url || !tocItems.length) return "";
  const normalizedText = normalizeDocsTitle(text);
  if (!normalizedText) return "";

  const looksInternal =
    !/^https?:\/\//i.test(url) || isGoogleDocsHeadingLink(url) || /#heading=|heading=h\.|heading\./i.test(url);
  if (!looksInternal) return "";

  return tocItems.find((item) => item.normalizedTitle === normalizedText)?.id || "";
}

function stripMarkdownLinks(value: string) {
  return value.replace(/\[([^\]]+)\]\((?:#[^)]+|https?:\/\/[^)\s]+)\)/g, "$1");
}

function normalizeDocsTitle(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, "")
    .replace(/[「」『』【】\[\]（）()・:：,，.．\-‐ー―–—]/g, "")
    .trim()
    .toLowerCase();
}

function escapeMarkdownLinkLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function readStorageValue(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (error) {
    console.warn(`Unable to read ${key} from localStorage`, error);
    return fallback;
  }
}

function writeStorageValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Unable to write ${key} to localStorage`, error);
    return false;
  }
}

function writeStorageJson(key: string, value: unknown) {
  try {
    return writeStorageValue(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Unable to serialize ${key} for localStorage`, error);
    return false;
  }
}

function compactImageDataUrl(dataUrl: string, maxSide: number, quality = 0.86): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return Promise.resolve(dataUrl);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      if (!longestSide) {
        resolve(dataUrl);
        return;
      }

      const scale = Math.min(1, maxSide / longestSide);
      if (scale === 1 && dataUrl.length < 700_000) {
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      try {
        const compact = canvas.toDataURL("image/jpeg", quality);
        resolve(compact.length < dataUrl.length || dataUrl.length > 700_000 ? compact : dataUrl);
      } catch (error) {
        console.warn("Unable to compact image", error);
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function loadInitialDraft() {
  const storedAssets = loadImageAssets();
  const storedManuscripts = loadStoredManuscripts();
  const kindleDraft = migrateInlineImages(storedManuscripts.kindle, storedAssets);
  const shimaumaDraft = migrateInlineImages(storedManuscripts.shimauma, kindleDraft.imageAssets);

  return {
    manuscripts: {
      kindle: kindleDraft.manuscript,
      shimauma: shimaumaDraft.manuscript,
    },
    imageAssets: shimaumaDraft.imageAssets,
  };
}

function loadStoredManuscripts(): ManuscriptsByChannel {
  const legacyManuscript = readStorageValue(storageKeys.manuscript, sampleManuscript);
  const stored = readStorageValue(storageKeys.manuscripts);
  if (!stored) {
    return {
      kindle: legacyManuscript,
      shimauma: legacyManuscript,
    };
  }

  try {
    const parsed = JSON.parse(stored) as Partial<ManuscriptsByChannel>;
    return {
      kindle: typeof parsed.kindle === "string" ? parsed.kindle : legacyManuscript,
      shimauma: typeof parsed.shimauma === "string" ? parsed.shimauma : legacyManuscript,
    };
  } catch {
    return {
      kindle: legacyManuscript,
      shimauma: legacyManuscript,
    };
  }
}

function loadImageAssets(): ImageAsset[] {
  const stored = readStorageValue(storageKeys.imageAssets);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored) as ImageAsset[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.id && item.src) : [];
  } catch {
    return [];
  }
}

function migrateInlineImages(manuscript: string, imageAssets: ImageAsset[]) {
  let nextManuscript = manuscript;
  let nextAssets = imageAssets;
  const inlineImagePattern = /!\[([^\]]*)\]\((data:image\/(png|jpe?g|gif|bmp);base64,[^)]+)\)/gi;

  nextManuscript = nextManuscript.replace(inlineImagePattern, (_match, alt: string, src: string) => {
    const existing = nextAssets.find((asset) => asset.src === src);
    if (existing) return `![${alt || existing.alt}](asset:${existing.id})`;

    const asset = createImageAsset(undefined, src, alt || "画像");
    nextAssets = upsertImageAsset(nextAssets, asset);
    return `![${alt || asset.alt}](asset:${asset.id})`;
  });

  return {
    manuscript: nextManuscript,
    imageAssets: nextAssets,
  };
}

function convertHtmlToManuscriptMarkdown(html: string) {
  const documentFromClipboard = new DOMParser().parseFromString(html, "text/html");
  const anchorMap = createClipboardAnchorMap(documentFromClipboard);
  const blocks: string[] = [];

  const appendBlock = (value: string) => {
    const normalized = value
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (normalized) blocks.push(normalized);
  };

  const walkElement = (element: Element) => {
    const tagName = element.tagName.toLowerCase();
    const headingLevel = getClipboardHeadingLevel(element);

    if (tagName === "nav" || /toc|table-of-contents|目次/i.test(`${element.className || ""} ${element.getAttribute("aria-label") || ""}`)) {
      appendBlock("[[TOC]]");
      return;
    }

    if (headingLevel === 1) {
      appendBlock(`# ${getClipboardInlineText(element, anchorMap)}`);
      return;
    }

    if (headingLevel && headingLevel >= 2) {
      appendBlock(`## ${getClipboardInlineText(element, anchorMap)}`);
      return;
    }

    if (tagName === "p" || tagName === "li") {
      const prefix = tagName === "li" ? "- " : "";
      appendBlock(`${prefix}${getClipboardInlineText(element, anchorMap)}`);
      return;
    }

    const children = Array.from(element.children);
    if (tagName === "div" && children.some((child) => getClipboardHeadingLevel(child) || isClipboardBlockElement(child))) {
      children.forEach(walkElement);
      return;
    }

    if (isClipboardBlockElement(element)) {
      appendBlock(getClipboardInlineText(element, anchorMap));
      return;
    }

    children.forEach(walkElement);
  };

  Array.from(documentFromClipboard.body.children).forEach(walkElement);
  return blocks.join("\n\n");
}

function getClipboardHeadingLevel(element: Element) {
  const tagName = element.tagName.toLowerCase();
  const tagMatch = tagName.match(/^h([1-6])$/);
  if (tagMatch) return Number(tagMatch[1]);

  if (element.getAttribute("role") === "heading") {
    const ariaLevel = Number(element.getAttribute("aria-level"));
    if (ariaLevel >= 1 && ariaLevel <= 6) return ariaLevel;
  }

  const descriptor = `${element.getAttribute("style") || ""} ${element.className || ""}`;
  if (/mso-outline-level:\s*1|heading\s*1/i.test(descriptor)) return 1;
  if (/mso-outline-level:\s*2|heading\s*2/i.test(descriptor)) return 2;

  return 0;
}

function isClipboardBlockElement(element: Element) {
  return /^(address|article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|header|main|nav|ol|p|section|table|ul)$/i.test(
    element.tagName,
  );
}

type ClipboardAnchorMap = {
  byHref: Map<string, string>;
  byTitle: Map<string, string>;
};

function createClipboardAnchorMap(documentFromClipboard: Document): ClipboardAnchorMap {
  const byHref = new Map<string, string>();
  const byTitle = new Map<string, string>();
  let headingIndex = 0;

  Array.from(documentFromClipboard.body.querySelectorAll("*")).forEach((element) => {
    if (!getClipboardHeadingLevel(element)) return;

    const title = normalizeClipboardWhitespace(element.textContent || "");
    if (!title) return;

    headingIndex += 1;
    const internalId = toAnchorId(title, headingIndex);
    byTitle.set(normalizeClipboardLinkLabel(title), internalId);

    const rawIds = [
      element.id,
      element.getAttribute("name"),
      element.getAttribute("data-heading-id"),
      element.getAttribute("data-id"),
    ].filter(Boolean) as string[];

    rawIds.forEach((rawId) => {
      normalizeClipboardHrefVariants(rawId).forEach((href) => byHref.set(href, internalId));
    });
  });

  return { byHref, byTitle };
}

function getClipboardInlineText(element: Element, anchorMap: ClipboardAnchorMap): string {
  const readNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const child = node as Element;
    const tagName = child.tagName.toLowerCase();
    if (tagName === "br") return "\n";

    const text = Array.from(child.childNodes).map(readNode).join("");
    if (tagName === "a") {
      const href = child.getAttribute("href");
      const label = normalizeClipboardWhitespace(text);
      const internalId = href && label ? resolveClipboardInternalLink(href, label, anchorMap) : "";
      if (internalId && label) return `[${label}](#${internalId})`;
      if (href && isGoogleDocsHeadingLink(href)) return label;
      return href && /^https?:\/\//i.test(href) && label ? `[${label}](${href})` : text;
    }

    return text;
  };

  return normalizeClipboardWhitespace(Array.from(element.childNodes).map(readNode).join(""));
}

function normalizeClipboardWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
}

function resolveClipboardInternalLink(href: string, label: string, anchorMap: ClipboardAnchorMap) {
  for (const variant of normalizeClipboardHrefVariants(href)) {
    const internalId = anchorMap.byHref.get(variant);
    if (internalId) return internalId;
  }

  const titleMatch = anchorMap.byTitle.get(normalizeClipboardLinkLabel(label));
  if (titleMatch && isGoogleDocsHeadingLink(href)) return titleMatch;

  return "";
}

function normalizeClipboardHrefVariants(href: string) {
  const values = new Set<string>();
  const decoded = decodeURIComponent(href).trim();
  const add = (value: string) => {
    if (!value) return;
    values.add(value);
    values.add(value.startsWith("#") ? value.slice(1) : `#${value}`);
    values.add(value.replace(/^#heading=/, "#"));
    values.add(value.replace(/^heading=/, ""));
  };

  add(decoded);

  try {
    const url = new URL(decoded, window.location.href);
    add(url.hash);
    add(url.hash.replace(/^#heading=/, "#"));
    add(url.hash.replace(/^#/, ""));
  } catch {
    // Plain fragment values are common in pasted document HTML.
  }

  return Array.from(values);
}

function normalizeClipboardLinkLabel(value: string) {
  return normalizeClipboardWhitespace(value).replace(/\s+/g, "");
}

function isGoogleDocsHeadingLink(href: string) {
  return /docs\.google\.com\/document|#heading=|heading=h\.|heading\./i.test(href);
}

function isVisuallyEmptyBlock(element: Element) {
  const text = element.textContent?.replace(/\u00a0/g, " ").trim() || "";
  if (text) return false;
  return Array.from(element.childNodes).every((node) => {
    if (node.nodeType === Node.TEXT_NODE) return !(node.textContent || "").trim();
    if (node.nodeType !== Node.ELEMENT_NODE) return true;
    const child = node as Element;
    return child.tagName.toLowerCase() === "br";
  });
}

function convertVisualEditorToManuscript(root: HTMLElement, imageAssets: ImageAsset[]) {
  const blocks: string[] = [];

  const appendBlock = (value: string) => {
    const normalized = value
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (normalized) blocks.push(normalized);
  };

  const serializeBlock = (element: Element) => {
    const tagName = element.tagName.toLowerCase();

    if (element.matches(".manual-page-break,[data-page-break='true']")) {
      appendBlock("[[PAGE_BREAK]]");
      return;
    }

    if (element.matches(".chapter-page-break,[data-chapter-break='true']")) {
      appendBlock("[[CHAPTER_BREAK]]");
      return;
    }

    if (element.matches(".blank-line,[data-blank-line='true']")) {
      appendBlock("[[BLANK_LINE]]");
      return;
    }

    if (element.matches(".manuscript-toc")) {
      appendBlock("[[TOC]]");
      return;
    }

    if (tagName === "figure" && element.classList.contains("manuscript-image")) {
      const image = element.querySelector("img");
      const assetId = element.getAttribute("data-image-id") || "";
      const asset = imageAssets.find((item) => item.id === assetId || item.src === image?.getAttribute("src"));
      const alt = image?.getAttribute("alt") || asset?.alt || "";
      const src = asset ? `asset:${asset.id}` : image?.getAttribute("src") || "";
      if (src) appendBlock(`![${alt}](${src})`);
      return;
    }

    if (tagName === "h1") {
      appendBlock(`# ${serializeInlineNodes(Array.from(element.childNodes))}`);
      return;
    }

    if (tagName === "h2") {
      appendBlock(`## ${serializeInlineNodes(Array.from(element.childNodes))}`);
      return;
    }

    if (tagName === "p" || tagName === "div" || tagName === "li") {
      if (isVisuallyEmptyBlock(element)) {
        appendBlock("[[BLANK_LINE]]");
        return;
      }

      appendBlock(serializeInlineNodes(Array.from(element.childNodes)));
      return;
    }

    appendBlock(serializeInlineNodes(Array.from(element.childNodes)));
  };

  Array.from(root.children).forEach(serializeBlock);

  if (!blocks.length) {
    appendBlock(serializeInlineNodes(Array.from(root.childNodes)));
  }

  return blocks.join("\n\n");
}

function serializeInlineNodes(nodes: Node[]): string {
  return nodes.map(serializeInlineNode).join("").replace(/[ \t]+/g, " ").trim();
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === "br") return "\n";

  if (tagName === "a") {
    const label = serializeInlineNodes(Array.from(element.childNodes));
    const href = element.getAttribute("href") || "";
    if (!label) return "";
    if (href.startsWith("#")) return `[${label}](${href})`;
    if (/^https?:\/\//i.test(href)) return `[${label}](${href})`;
    return label;
  }

  if (tagName === "ruby") {
    const rubyText = Array.from(element.querySelectorAll("rt"))
      .map((rt) => rt.textContent || "")
      .join("");
    const base = Array.from(element.childNodes)
      .filter((child) => child.nodeType === Node.TEXT_NODE || (child as Element).tagName?.toLowerCase() !== "rt")
      .map((child) => {
        if (child.nodeType === Node.TEXT_NODE) return child.textContent || "";
        const childElement = child as Element;
        return childElement.tagName.toLowerCase() === "rp" ? "" : childElement.textContent || "";
      })
      .join("");
    return rubyText ? `｜${base}《${rubyText}》` : base;
  }

  if (element.classList.contains("inline-size-small")) {
    return `[[small:${serializeInlineNodes(Array.from(element.childNodes))}]]`;
  }

  if (element.classList.contains("inline-size-large")) {
    return `[[large:${serializeInlineNodes(Array.from(element.childNodes))}]]`;
  }

  return serializeInlineNodes(Array.from(element.childNodes));
}

function ensureSelectionInside(root: HTMLElement) {
  const selection = window.getSelection();
  if (selection?.rangeCount && selection.anchorNode && root.contains(selection.anchorNode)) return;

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getSelectedVisualBlock(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !root.contains(selection.anchorNode)) return null;

  const startElement =
    selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? (selection.anchorNode as Element)
      : selection.anchorNode.parentElement;

  const block = startElement?.closest("h1,h2,p,div,li,figure") || null;
  if (block === root) return root.querySelector("h1,h2,p,div,li,figure");
  return block;
}

function createVisualTocHtml(toc: { id: string; title: string; level: 1 | 2 }[]) {
  const entries = toc
    .map((item) => `<li class="toc-level-${item.level}"><a href="#${item.id}">${escapeHtml(item.title)}</a></li>`)
    .join("");

  return `<nav class="manuscript-toc" aria-label="目次"><h2>目次</h2>${
    entries ? `<ol>${entries}</ol>` : "<p>見出し1を追加すると目次が作られます。</p>"
  }</nav><p><br /></p>`;
}

function createVisualImageHtml(asset: ImageAsset) {
  return `<figure class="manuscript-image" data-image-id="${escapeHtml(asset.id)}"><img src="${escapeHtml(
    asset.src,
  )}" alt="${escapeHtml(asset.alt)}" />${
    asset.alt ? `<figcaption>${escapeHtml(asset.alt)}</figcaption>` : ""
  }</figure><p><br /></p>`;
}

function createImageAsset(file: File | undefined, src: string, alt: string): ImageAsset {
  const mimeType = file?.type || src.match(/^data:(image\/[^;]+);base64,/)?.[1] || "image/png";
  const extension = normalizeImageExtension(file?.name.split(".").pop() || mimeType.split("/")[1] || "png");

  return {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    alt: alt || file?.name.replace(/\.[^.]+$/, "") || "画像",
    src,
    mimeType,
    extension,
  };
}

function upsertImageAsset(assets: ImageAsset[], asset: ImageAsset) {
  const withoutSame = assets.filter((item) => item.id !== asset.id && item.src !== asset.src);
  return [...withoutSame, asset];
}

function normalizeImageExtension(value: string): ImageAsset["extension"] {
  const extension = value.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpg";
  if (extension === "gif") return "gif";
  if (extension === "bmp") return "bmp";
  return "png";
}

function loadTypographySettings(): TypographySettings {
  const stored = readStorageValue(storageKeys.typography);
  if (!stored) return defaultTypography;

  try {
    const parsed = JSON.parse(stored) as Partial<TypographySettings>;
    const fontFamily =
      parsed.fontFamily === "noto-sans-jp" || parsed.fontFamily === "shippori-mincho"
        ? parsed.fontFamily
        : defaultTypography.fontFamily;
    const fontSize =
      typeof parsed.fontSize === "number" && fontSizeOptions.includes(parsed.fontSize)
        ? parsed.fontSize
        : defaultTypography.fontSize;

    return {
      fontFamily,
      fontSize,
    };
  } catch {
    return defaultTypography;
  }
}

function loadPageBreakSettings(): PageBreakSettings {
  const stored = readStorageValue(storageKeys.pageBreaks);
  if (!stored) return defaultPageBreaks;

  try {
    const parsed = JSON.parse(stored) as Partial<PageBreakSettings>;
    return {
      chapterHead: typeof parsed.chapterHead === "boolean" ? parsed.chapterHead : defaultPageBreaks.chapterHead,
      pageGuide: typeof parsed.pageGuide === "boolean" ? parsed.pageGuide : defaultPageBreaks.pageGuide,
    };
  } catch {
    return defaultPageBreaks;
  }
}

function loadSalesChannel(): SalesChannel {
  const stored = readStorageValue(storageKeys.salesChannel);
  return stored === "shimauma" ? "shimauma" : "kindle";
}

function loadCoverImage(): CoverImageState {
  const stored = readStorageValue(storageKeys.coverImage);
  if (!stored) return defaultCoverImage;

  try {
    const parsed = JSON.parse(stored) as Partial<CoverImageState>;
    return {
      src: parsed.src || "",
      name: parsed.name || "",
    };
  } catch {
    return defaultCoverImage;
  }
}

function loadAplusSettings(): AplusSettings {
  const stored = readStorageValue(storageKeys.aplus);
  if (!stored) return defaultAplus;

  try {
    const parsed = JSON.parse(stored) as Partial<AplusSettings & LegacyAplusSettings>;
    if (Array.isArray(parsed.items)) {
      return {
        items: normalizeAplusItems(parsed.items),
      };
    }

    return {
      items: normalizeAplusItems([
        {
          id: "aplus-1",
          imageSrc: parsed.imageSrc || "",
          imageName: parsed.imageName || "",
          altText: parsed.imageKeyword || "",
          caption: parsed.imageKeyword || "",
          heading: parsed.headline || "",
          description: parsed.body || "",
        },
      ]),
    };
  } catch {
    return defaultAplus;
  }
}

function normalizeAplusItems(items: Partial<AplusImageItem>[]): AplusImageItem[] {
  return defaultAplusItems.map((defaultItem, index) => {
    const storedItem = items[index] || items.find((item) => item.id === defaultItem.id) || {};
    return {
      ...defaultItem,
      ...storedItem,
      id: defaultItem.id,
      imageSrc: storedItem.imageSrc || "",
      imageName: storedItem.imageName || "",
      altText: (storedItem.altText || "").slice(0, 100),
      caption: (storedItem.caption || "").slice(0, 200),
      heading: (storedItem.heading || "").slice(0, 160),
      description: (storedItem.description || "").slice(0, 1000),
    };
  });
}

function getWriterFontStack(fontFamily: TypographySettings["fontFamily"]) {
  if (fontFamily === "noto-sans-jp") {
    return '"Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", "BIZ UDPGothic", sans-serif';
  }

  return '"Shippori Mincho", "Yu Mincho", "Hiragino Mincho ProN", "BIZ UDPMincho", serif';
}

async function downloadDataUrl(dataUrl: string, filename: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  saveAs(blob, safeDownloadName(filename));
}

function validateAplusImageSize(dataUrl: string, filename: string, setStatus: (value: string) => void) {
  const image = new Image();
  image.onload = () => {
    if (image.naturalWidth < 300 || image.naturalHeight < 300) {
      setStatus(`${filename} は300px×300px未満です`);
    }
  };
  image.src = dataUrl;
}

function safeDownloadName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "_") || "umbrella-parade";
}

function loadAiSettings(): AiProviderConfig[] {
  const stored = readStorageValue(storageKeys.aiSettings);
  if (!stored) return getDefaultAiSettings();

  try {
    const parsed = JSON.parse(stored) as AiProviderConfig[];
    return getDefaultAiSettings().map((defaultItem) => {
      const storedItem = parsed.find((item) => item.key === defaultItem.key);
      return storedItem ? { ...defaultItem, ...storedItem } : defaultItem;
    });
  } catch {
    return getDefaultAiSettings();
  }
}

export default App;
