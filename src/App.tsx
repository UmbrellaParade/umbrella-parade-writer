import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, ClipboardEvent, MouseEvent } from "react";
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
import { renderManuscript, sampleManuscript } from "./lib/manuscript";
import type {
  AiProviderConfig,
  AplusSettings,
  ImageAsset,
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

const defaultAplus: AplusSettings = {
  headline: "雨の記憶をたどる物語",
  body: "Umbrella Paradeの世界観、登場人物、楽曲や記録室へつながる余韻を1枚にまとめます。",
  imageKeyword: "幻想的な雨の街、傘、銀色の光",
  imageSrc: "",
  imageName: "",
  overlayStyle: "dark",
  textPosition: "left",
};

type CoverImageState = {
  src: string;
  name: string;
};

const defaultCoverImage: CoverImageState = {
  src: "",
  name: "",
};

type ManuscriptsByChannel = Record<SalesChannel, string>;
type ManuscriptHistory = Record<SalesChannel, string[]>;

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
  const [title, setTitle] = useState(() => localStorage.getItem(storageKeys.title) || "Umbrella Parade Manuscript");
  const [salesChannel, setSalesChannel] = useState<SalesChannel>(loadSalesChannel);
  const [manuscripts, setManuscripts] = useState<ManuscriptsByChannel>(initialDraftRef.current.manuscripts);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>(initialDraftRef.current.imageAssets);
  const [undoStacks, setUndoStacks] = useState<ManuscriptHistory>(createEmptyHistory);
  const [redoStacks, setRedoStacks] = useState<ManuscriptHistory>(createEmptyHistory);
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
  const previewRef = useRef<HTMLElement>(null);
  const qrCardRef = useRef<HTMLDivElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const aplusImageInputRef = useRef<HTMLInputElement>(null);
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
    localStorage.setItem(storageKeys.title, title);
    localStorage.setItem(storageKeys.manuscripts, JSON.stringify(manuscripts));
    localStorage.setItem(storageKeys.manuscript, manuscript);
    setStatus("保存済み");
  }, [title, manuscript, manuscripts]);

  useEffect(() => {
    localStorage.setItem(storageKeys.aiSettings, JSON.stringify(aiSettings));
  }, [aiSettings]);

  useEffect(() => {
    localStorage.setItem(storageKeys.imageAssets, JSON.stringify(imageAssets));
  }, [imageAssets]);

  useEffect(() => {
    localStorage.setItem(storageKeys.typography, JSON.stringify(typography));
  }, [typography]);

  useEffect(() => {
    localStorage.setItem(storageKeys.pageBreaks, JSON.stringify(pageBreaks));
  }, [pageBreaks]);

  useEffect(() => {
    localStorage.setItem(storageKeys.salesChannel, salesChannel);
  }, [salesChannel]);

  useEffect(() => {
    localStorage.setItem(storageKeys.coverImage, JSON.stringify(coverImage));
  }, [coverImage]);

  useEffect(() => {
    localStorage.setItem(storageKeys.aplus, JSON.stringify(aplus));
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

  const handleEditorPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData("text/html");
    if (!hasClipboardHeadingMarkup(html)) return;

    const pasted = convertHtmlToManuscriptMarkdown(html);
    if (!pasted.trim()) return;

    event.preventDefault();
    insertAtSelection(pasted);
    setStatus("見出し付きで貼り付けました");
  };

  const cutSelection = () => {
    const editor = editorRef.current;
    if (!editor) return false;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (start === end) return false;

    copyTextToClipboard(manuscript.slice(start, end));
    updateManuscript(`${manuscript.slice(0, start)}${manuscript.slice(end)}`);
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start, start);
    });
    return true;
  };

  const applyHeadingOne = () => {
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
    const editor = editorRef.current;
    const selected = editor ? manuscript.slice(editor.selectionStart, editor.selectionEnd) : "";
    const base = selected || "漢字";
    const ruby = window.prompt("ルビ", "");
    if (ruby === null) return;
    insertAtSelection(`｜${base}《${ruby || "ふりがな"}》`, selected ? 0 : 6);
  };

  const addLink = () => {
    const editor = editorRef.current;
    const selected = editor ? manuscript.slice(editor.selectionStart, editor.selectionEnd) : "";
    const label = selected || "リンク";
    const url = window.prompt("URL", "https://");
    if (!url) return;
    insertAtSelection(`[${label}](${url})`);
  };

  const insertInlineToc = () => {
    insertAtSelection("\n\n[[TOC]]\n\n");
  };

  const insertPageBreak = () => {
    insertAtSelection("\n\n[[PAGE_BREAK]]\n\n");
    setStatus("改ページを挿入しました");
  };

  const applyInlineSize = (size: "small" | "large") => {
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
      insertAtSelection(`\n\n![${alt}](asset:${asset.id})\n\n`);
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
    reader.onload = () => {
      setCoverImage({
        src: typeof reader.result === "string" ? reader.result : "",
        name: file.name,
      });
      setStatus("表紙を読み込みました");
    };
    reader.readAsDataURL(file);
  };

  const importAplusImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAplus((current) => ({
        ...current,
        imageSrc: typeof reader.result === "string" ? reader.result : "",
        imageName: file.name,
      }));
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

  const handleAplusImageDownload = () => {
    if (!aplus.imageSrc) return;
    downloadDataUrl(aplus.imageSrc, aplus.imageName || `${title}-aplus-background.png`);
  };

  const handleAplusDownload = async () => {
    if (!aplusCardRef.current) return;
    const canvas = await html2canvas(aplusCardRef.current, { backgroundColor: "#ffffff", scale: 2 });
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${safeDownloadName(title)}-aplus-1940x600.png`);
    });
  };

  const updateAiSetting = (providerKey: string, field: "apiKey" | "selectedModel", value: string) => {
    setAiSettings((current) =>
      current.map((item) => (item.key === providerKey ? { ...item, [field]: value } : item)),
    );
  };

  const updateAplusSetting = <K extends keyof AplusSettings>(field: K, value: AplusSettings[K]) => {
    setAplus((current) => ({
      ...current,
      [field]: value,
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

  const focusEditorHeading = (id: string) => {
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

  const jumpToHeading = (id: string) => {
    setActiveTab("write");
    setActiveHeadingId(id);

    window.setTimeout(() => {
      focusEditorHeading(id);
      const headings = Array.from(previewRef.current?.querySelectorAll<HTMLElement>("[id]") || []);
      const heading = headings.find((element) => element.id === id);
      if (!heading) return;

      previewRef.current?.querySelectorAll(".jump-highlight").forEach((element) => {
        element.classList.remove("jump-highlight");
      });
      heading.classList.add("jump-highlight");
      heading.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      window.history.replaceState(null, "", `#${id}`);
      window.setTimeout(() => heading.classList.remove("jump-highlight"), 1800);
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

  return (
    <div className="app-shell">
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

          <div className="status-pill">{status}</div>

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
          <section className="writer-grid" style={typographyStyle} aria-label="manuscript editor">
            <div className="control-strip">
              <div className="tool-buttons primary-tools">
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

            <div className="editor-pane">
              <div className="source-editor">
                <textarea
                  ref={editorRef}
                  value={manuscript}
                  spellCheck={false}
                  onChange={(event) => {
                    setStatus("編集中");
                    updateManuscript(event.target.value);
                  }}
                  onPaste={handleEditorPaste}
                  onKeyDown={(event) => {
                    const isUndo =
                      (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
                    const isRedo =
                      (event.ctrlKey || event.metaKey) &&
                      (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"));
                    const isCut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "x";

                    if (isUndo) {
                      event.preventDefault();
                      undoManuscript();
                    }

                    if (isRedo) {
                      event.preventDefault();
                      redoManuscript();
                    }

                    if (isCut && cutSelection()) {
                      event.preventDefault();
                    }
                  }}
                />
              </div>
              <div
                className={`editor-visual ${direction}`}
                onClick={handlePreviewClick}
                dangerouslySetInnerHTML={{ __html: rendered.html }}
              />
            </div>

            <article
              ref={previewRef}
              className={`preview-page ${direction} ${previewTarget} ${pageBreaks.chapterHead ? "reflect-page-breaks" : ""} ${
                pageBreaks.pageGuide ? "show-page-guides" : ""
              }`}
              onClick={handlePreviewClick}
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

              <div>
                <p className="panel-title">A+ 画像</p>
                <input
                  ref={aplusImageInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={importAplusImage}
                />
                <div className="inline-actions">
                  <button className="secondary-action" onClick={() => aplusImageInputRef.current?.click()}>
                    <Upload size={16} aria-hidden />
                    背景画像
                  </button>
                  <button className="secondary-action" onClick={handleAplusImageDownload} disabled={!aplus.imageSrc}>
                    <Download size={16} aria-hidden />
                    背景保存
                  </button>
                </div>
              </div>

              <label className="field-label" htmlFor="aplus-keyword">
                画像キーワード
              </label>
              <input
                id="aplus-keyword"
                value={aplus.imageKeyword}
                onChange={(event) => updateAplusSetting("imageKeyword", event.target.value)}
              />

              <label className="field-label" htmlFor="aplus-headline">
                見出し
              </label>
              <input
                id="aplus-headline"
                value={aplus.headline}
                onChange={(event) => updateAplusSetting("headline", event.target.value)}
              />

              <label className="field-label" htmlFor="aplus-body">
                説明文
              </label>
              <textarea
                id="aplus-body"
                className="compact-textarea"
                value={aplus.body}
                onChange={(event) => updateAplusSetting("body", event.target.value)}
              />

              <label className="field-label" htmlFor="aplus-position">
                文字位置
              </label>
              <select
                id="aplus-position"
                value={aplus.textPosition}
                onChange={(event) => updateAplusSetting("textPosition", event.target.value as AplusSettings["textPosition"])}
              >
                <option value="left">左</option>
                <option value="right">右</option>
              </select>

              <label className="field-label" htmlFor="aplus-overlay">
                文字枠
              </label>
              <select
                id="aplus-overlay"
                value={aplus.overlayStyle}
                onChange={(event) => updateAplusSetting("overlayStyle", event.target.value as AplusSettings["overlayStyle"])}
              >
                <option value="dark">黒</option>
                <option value="light">白</option>
              </select>

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

              <div
                ref={aplusCardRef}
                className={`aplus-card ${aplus.overlayStyle} text-${aplus.textPosition}`}
                style={aplus.imageSrc ? { backgroundImage: `url(${aplus.imageSrc})` } : undefined}
              >
                {!aplus.imageSrc && <div className="aplus-placeholder">A+ 1940x600</div>}
                <div className="aplus-text-panel">
                  <p>{aplus.imageKeyword}</p>
                  <h2>{aplus.headline}</h2>
                  <span>{aplus.body}</span>
                </div>
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
  const blocks = html
    .split("\n")
    .map((block) => block.trim())
    .filter(Boolean);
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

  blocks.forEach((block) => {
    if (block.includes('data-page-break="true"') || block.includes('data-chapter-break="true"')) {
      if (reflectManualBreaks) flushPage();
      return;
    }

    if (reflectManualBreaks && block.includes('data-chapter-start="true"')) {
      flushPage();
    }

    const blockUnits = estimatePreviewBlockUnits(block, typography, direction, target);
    if (currentBlocks.length && currentUnits + blockUnits > capacity) {
      flushPage();
    }

    currentBlocks.push(block);
    currentUnits += blockUnits;
  });

  flushPage();
  return pages.length ? pages : [{ html: "", pageNumber: 1 }];
}

function getPreviewPageCapacity(
  typography: TypographySettings,
  direction: WritingDirection,
  target: SalesChannel,
) {
  const fontScale = 16 / typography.fontSize;
  if (direction === "vertical") {
    return Math.max(12, Math.floor((target === "shimauma" ? 18 : 16) * fontScale));
  }

  return Math.max(14, Math.floor((target === "shimauma" ? 24 : 20) * fontScale));
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
  const fontScale = 16 / typography.fontSize;

  if (direction === "vertical") {
    const charsPerColumn = Math.max(22, Math.floor((target === "shimauma" ? 44 : 38) * fontScale));
    const columns = Math.max(1, Math.ceil(textLength / charsPerColumn));
    if (/^<h1\b/.test(block)) return columns + 1.4;
    if (/^<h2\b/.test(block)) return columns + 0.9;
    return columns + 0.35;
  }

  const charsPerLine = Math.max(12, Math.floor((target === "shimauma" ? 27 : 24) * fontScale));
  const lines = Math.max(1, Math.ceil(textLength / charsPerLine));
  if (/^<h1\b/.test(block)) return lines + 2.8;
  if (/^<h2\b/.test(block)) return lines + 1.8;
  return lines + 0.7;
}

function getVisibleTextLength(html: string) {
  return html
    .replace(/<rt\b[^>]*>.*?<\/rt>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "あ")
    .replace(/\s/g, "").length;
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
  const legacyManuscript = localStorage.getItem(storageKeys.manuscript) || sampleManuscript;
  const stored = localStorage.getItem(storageKeys.manuscripts);
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
  const stored = localStorage.getItem(storageKeys.imageAssets);
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

    if (headingLevel === 1) {
      appendBlock(`# ${getClipboardInlineText(element)}`);
      return;
    }

    if (headingLevel && headingLevel >= 2) {
      appendBlock(`## ${getClipboardInlineText(element)}`);
      return;
    }

    if (tagName === "p" || tagName === "li") {
      const prefix = tagName === "li" ? "- " : "";
      appendBlock(`${prefix}${getClipboardInlineText(element)}`);
      return;
    }

    const children = Array.from(element.children);
    if (tagName === "div" && children.some((child) => getClipboardHeadingLevel(child) || isClipboardBlockElement(child))) {
      children.forEach(walkElement);
      return;
    }

    if (isClipboardBlockElement(element)) {
      appendBlock(getClipboardInlineText(element));
      return;
    }

    children.forEach(walkElement);
  };

  Array.from(documentFromClipboard.body.children).forEach(walkElement);
  return blocks.join("\n\n");
}

function hasClipboardHeadingMarkup(html: string) {
  return /<h[1-6]\b|role=["']heading["']|mso-outline-level:\s*[1-6]|heading\s*[1-6]/i.test(html);
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

function getClipboardInlineText(element: Element): string {
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
      return href && /^https?:\/\//i.test(href) && label ? `[${label}](${href})` : text;
    }

    return text;
  };

  return normalizeClipboardWhitespace(Array.from(element.childNodes).map(readNode).join(""));
}

function normalizeClipboardWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
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
  const stored = localStorage.getItem(storageKeys.typography);
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
  const stored = localStorage.getItem(storageKeys.pageBreaks);
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
  const stored = localStorage.getItem(storageKeys.salesChannel);
  return stored === "shimauma" ? "shimauma" : "kindle";
}

function loadCoverImage(): CoverImageState {
  const stored = localStorage.getItem(storageKeys.coverImage);
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
  const stored = localStorage.getItem(storageKeys.aplus);
  if (!stored) return defaultAplus;

  try {
    const parsed = JSON.parse(stored) as Partial<AplusSettings>;
    return {
      ...defaultAplus,
      ...parsed,
      overlayStyle: parsed.overlayStyle === "light" || parsed.overlayStyle === "dark" ? parsed.overlayStyle : "dark",
      textPosition: parsed.textPosition === "right" || parsed.textPosition === "left" ? parsed.textPosition : "left",
      imageSrc: parsed.imageSrc || "",
      imageName: parsed.imageName || "",
    };
  } catch {
    return defaultAplus;
  }
}

function getWriterFontStack(fontFamily: TypographySettings["fontFamily"]) {
  if (fontFamily === "noto-sans-jp") {
    return '"Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", "BIZ UDPGothic", sans-serif';
  }

  return '"Shippori Mincho", "Yu Mincho", "Hiragino Mincho ProN", "BIZ UDPMincho", serif';
}

function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).catch(() => fallbackCopyText(value));
    return;
  }

  fallbackCopyText(value);
}

function fallbackCopyText(value: string) {
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

async function downloadDataUrl(dataUrl: string, filename: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  saveAs(blob, safeDownloadName(filename));
}

function safeDownloadName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "_") || "umbrella-parade";
}

function loadAiSettings(): AiProviderConfig[] {
  const stored = localStorage.getItem(storageKeys.aiSettings);
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
