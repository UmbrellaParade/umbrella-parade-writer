import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import {
  BookOpen,
  Download,
  FileText,
  Heading1,
  Link,
  QrCode,
  Settings,
  Sparkles,
  Type,
} from "lucide-react";
import QRCode from "qrcode";
import { AI_PROVIDERS, getDefaultAiSettings } from "./data/aiModels";
import { exportDocx, exportEpub, exportPdf } from "./lib/exporters";
import { renderManuscript, sampleManuscript } from "./lib/manuscript";
import type { AiProviderConfig, PreviewTarget, WorkspaceTab, WritingDirection } from "./types";

const storageKeys = {
  manuscript: "umbrella-parade-writer:manuscript",
  title: "umbrella-parade-writer:title",
  aiSettings: "umbrella-parade-writer:ai-settings",
};

const previewLabels: Record<PreviewTarget, string> = {
  standard: "標準",
  kindle: "Kindle",
  shimauma: "しまうま",
};

function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("write");
  const [title, setTitle] = useState(() => localStorage.getItem(storageKeys.title) || "Umbrella Parade Manuscript");
  const [manuscript, setManuscript] = useState(() => localStorage.getItem(storageKeys.manuscript) || sampleManuscript);
  const [direction, setDirection] = useState<WritingDirection>("horizontal");
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>("kindle");
  const [qrUrl, setQrUrl] = useState("https://example.com");
  const [qrTitle, setQrTitle] = useState("Glamorous Shadow");
  const [qrSubtitle, setQrSubtitle] = useState("ヴェル13世×カーラ・マンソン デュエットver");
  const [qrFrame, setQrFrame] = useState("ornament");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [aiSettings, setAiSettings] = useState<AiProviderConfig[]>(loadAiSettings);
  const [status, setStatus] = useState("保存済み");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const qrCardRef = useRef<HTMLDivElement>(null);

  const rendered = useMemo(() => renderManuscript(manuscript), [manuscript]);

  useEffect(() => {
    localStorage.setItem(storageKeys.title, title);
    localStorage.setItem(storageKeys.manuscript, manuscript);
    setStatus("保存済み");
  }, [title, manuscript]);

  useEffect(() => {
    localStorage.setItem(storageKeys.aiSettings, JSON.stringify(aiSettings));
  }, [aiSettings]);

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

  const insertAtSelection = (value: string, selectOffset = 0) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${manuscript.slice(0, start)}${value}${manuscript.slice(end)}`;
    setManuscript(next);
    window.requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + value.length - selectOffset;
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const addHeading = () => insertAtSelection("\n# 新しい章\n\n");

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

  const handleExportDocx = async () => {
    setStatus("DOCX作成中");
    await exportDocx(manuscript, title);
    setStatus("DOCXを書き出しました");
  };

  const handleExportEpub = async () => {
    setStatus("EPUB作成中");
    await exportEpub(rendered, title);
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
                <a key={item.id} className={`toc-link level-${item.level}`} href={`#${item.id}`}>
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
          <section className="writer-grid" aria-label="manuscript editor">
            <div className="control-strip">
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

              <div className="tool-buttons">
                <button title="見出し1を追加" onClick={addHeading}>
                  <Heading1 size={17} aria-hidden />
                </button>
                <button title="ルビを振る" onClick={addRuby}>
                  <Type size={17} aria-hidden />
                </button>
                <button title="リンクに変換" onClick={addLink}>
                  <Link size={17} aria-hidden />
                </button>
              </div>
            </div>

            <div className="editor-pane">
              <textarea
                ref={editorRef}
                value={manuscript}
                spellCheck={false}
                onChange={(event) => {
                  setStatus("編集中");
                  setManuscript(event.target.value);
                }}
              />
            </div>

            <article
              ref={previewRef}
              className={`preview-page ${direction} ${previewTarget}`}
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
              {qrDataUrl && <img src={qrDataUrl} alt="" />}
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
