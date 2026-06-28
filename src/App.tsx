import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, MouseEvent } from "react";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import {
  BookOpen,
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
  ImageAsset,
  PreviewTarget,
  TypographySettings,
  WorkspaceTab,
  WritingDirection,
} from "./types";

const storageKeys = {
  manuscript: "umbrella-parade-writer:manuscript",
  title: "umbrella-parade-writer:title",
  aiSettings: "umbrella-parade-writer:ai-settings",
  imageAssets: "umbrella-parade-writer:image-assets",
  typography: "umbrella-parade-writer:typography",
};

const previewLabels: Record<PreviewTarget, string> = {
  standard: "標準",
  kindle: "Kindle",
  shimauma: "しまうま",
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

function App() {
  const initialDraftRef = useRef<ReturnType<typeof loadInitialDraft> | null>(null);
  if (!initialDraftRef.current) initialDraftRef.current = loadInitialDraft();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("write");
  const [title, setTitle] = useState(() => localStorage.getItem(storageKeys.title) || "Umbrella Parade Manuscript");
  const [manuscript, setManuscript] = useState(initialDraftRef.current.manuscript);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>(initialDraftRef.current.imageAssets);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [direction, setDirection] = useState<WritingDirection>("horizontal");
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>("kindle");
  const [typography, setTypography] = useState<TypographySettings>(loadTypographySettings);
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
  const manuscriptImageInputRef = useRef<HTMLInputElement>(null);
  const qrImageInputRef = useRef<HTMLInputElement>(null);

  const rendered = useMemo(() => renderManuscript(manuscript, imageAssets), [imageAssets, manuscript]);
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
    localStorage.setItem(storageKeys.manuscript, manuscript);
    setStatus("保存済み");
  }, [title, manuscript]);

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
    setUndoStack((current) => [...current.slice(-99), manuscript]);
    setRedoStack([]);
    setManuscript(next);
  };

  const undoManuscript = () => {
    setUndoStack((current) => {
      const previous = current.at(-1);
      if (previous === undefined) return current;
      setRedoStack((redo) => [...redo.slice(-99), manuscript]);
      setManuscript(previous);
      return current.slice(0, -1);
    });
  };

  const redoManuscript = () => {
    setRedoStack((current) => {
      const next = current.at(-1);
      if (next === undefined) return current;
      setUndoStack((undo) => [...undo.slice(-99), manuscript]);
      setManuscript(next);
      return current.slice(0, -1);
    });
  };

  const insertAtSelection = (value: string, selectOffset = 0) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${manuscript.slice(0, start)}${value}${manuscript.slice(end)}`;
    updateManuscript(next);
    window.requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + value.length - selectOffset;
      editor.setSelectionRange(cursor, cursor);
    });
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

  const handleExportDocx = async () => {
    setStatus("DOCX作成中");
    await exportDocx(manuscript, title, rendered, typography);
    setStatus("DOCXを書き出しました");
  };

  const handleExportEpub = async () => {
    setStatus("EPUB作成中");
    await exportEpub(rendered, title, typography);
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

  const updateAiSetting = (providerKey: string, field: "apiKey" | "selectedModel", value: string) => {
    setAiSettings((current) =>
      current.map((item) => (item.key === providerKey ? { ...item, [field]: value } : item)),
    );
  };

  const jumpToHeading = (id: string) => {
    setActiveTab("write");
    setActiveHeadingId(id);

    window.setTimeout(() => {
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
          <button className={activeTab === "qr" ? "active" : ""} onClick={() => setActiveTab("qr")}>
            <QrCode size={18} aria-hidden />
            QR
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
        </aside>

        {activeTab === "write" && (
          <section className="writer-grid" style={typographyStyle} aria-label="manuscript editor">
            <div className="control-strip">
              <div className="tool-buttons primary-tools">
                <button title="選択行を見出し1にする" onClick={applyHeadingOne}>
                  <Heading1 size={17} aria-hidden />
                </button>
                <button title="元に戻す" onClick={undoManuscript} disabled={!undoStack.length}>
                  <Undo2 size={17} aria-hidden />
                </button>
                <button title="やり直す" onClick={redoManuscript} disabled={!redoStack.length}>
                  <Redo2 size={17} aria-hidden />
                </button>
                <button title="ルビを振る" onClick={addRuby}>
                  <Type size={17} aria-hidden />
                </button>
                <button title="リンクに変換" onClick={addLink}>
                  <Link size={17} aria-hidden />
                </button>
                <button title="本文目次を挿入" onClick={insertInlineToc}>
                  <ListTree size={17} aria-hidden />
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

              <div className="segmented">
                <button className={direction === "horizontal" ? "active" : ""} onClick={() => setDirection("horizontal")}>
                  横書き
                </button>
                <button className={direction === "vertical" ? "active" : ""} onClick={() => setDirection("vertical")}>
                  縦書き
                </button>
              </div>

              <div className="segmented">
                {(Object.keys(previewLabels) as PreviewTarget[]).map((target) => (
                  <button
                    key={target}
                    className={previewTarget === target ? "active" : ""}
                    onClick={() => setPreviewTarget(target)}
                  >
                    {previewLabels[target]}
                  </button>
                ))}
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
              <textarea
                ref={editorRef}
                value={manuscript}
                spellCheck={false}
                onChange={(event) => {
                  setStatus("編集中");
                  updateManuscript(event.target.value);
                }}
                onKeyDown={(event) => {
                  const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
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
              {rendered.images.length > 0 && (
                <div className="editor-image-strip" aria-label="本文画像">
                  {rendered.images.map((image) => (
                    <figure className="editor-image-card" key={image.id}>
                      <img src={image.src} alt="" />
                      <figcaption>{image.alt || image.id}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            <article
              ref={previewRef}
              className={`preview-page ${direction} ${previewTarget}`}
              onClick={handlePreviewClick}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          </section>
        )}

        {activeTab === "qr" && (
          <section className="qr-workspace" aria-label="qr maker">
            <div className="settings-panel">
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

function loadInitialDraft() {
  const storedManuscript = localStorage.getItem(storageKeys.manuscript) || sampleManuscript;
  const storedAssets = loadImageAssets();
  return migrateInlineImages(storedManuscript, storedAssets);
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
