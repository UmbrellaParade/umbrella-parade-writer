export type WritingDirection = "horizontal" | "vertical";

export type PreviewTarget = "standard" | "kindle" | "shimauma";

export type WorkspaceTab = "write" | "qr" | "settings";

export type AiProviderKey = "openai" | "anthropic" | "gemini";

export interface AiProviderConfig {
  key: AiProviderKey;
  label: string;
  apiKey: string;
  selectedModel: string;
}

export interface TocItem {
  id: string;
  title: string;
  level: 1 | 2;
}

export interface ManuscriptImage {
  id: string;
  alt: string;
  src: string;
  mimeType: string;
  extension: "png" | "jpg" | "gif" | "bmp";
}

export interface RenderedManuscript {
  html: string;
  toc: TocItem[];
  images: ManuscriptImage[];
  wordCount: number;
}
