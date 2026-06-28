export type WritingDirection = "horizontal" | "vertical";

export type PreviewTarget = "kindle" | "shimauma";

export type WorkspaceTab = "write" | "qr" | "aplus" | "settings";

export type WriterFontFamily = "noto-sans-jp" | "shippori-mincho";

export type AiProviderKey = "openai" | "anthropic" | "gemini";

export interface AiProviderConfig {
  key: AiProviderKey;
  label: string;
  apiKey: string;
  selectedModel: string;
}

export interface TypographySettings {
  fontFamily: WriterFontFamily;
  fontSize: number;
}

export interface PageBreakSettings {
  chapterHead: boolean;
}

export interface AplusSettings {
  headline: string;
  body: string;
  imageKeyword: string;
  imageSrc: string;
  imageName: string;
  overlayStyle: "dark" | "light";
  textPosition: "left" | "right";
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

export type ImageAsset = ManuscriptImage;

export interface RenderedManuscript {
  html: string;
  toc: TocItem[];
  images: ManuscriptImage[];
  wordCount: number;
}
