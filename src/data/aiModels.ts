import type { AiProviderKey } from "../types";

export interface AiModelOption {
  id: string;
  label: string;
  note: string;
}

export interface AiProviderDefinition {
  key: AiProviderKey;
  label: string;
  defaultModel: string;
  models: AiModelOption[];
  docsUrl: string;
}

export const AI_PROVIDERS: AiProviderDefinition[] = [
  {
    key: "openai",
    label: "ChatGPT / OpenAI",
    defaultModel: "gpt-5.5",
    docsUrl: "https://developers.openai.com/api/docs/models",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", note: "OpenAIの最新フラッグシップ既定候補" },
      { id: "gpt-5.4", label: "GPT-5.4", note: "日常的な執筆補助に使いやすい汎用候補" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", note: "軽い相談や短い変換向け" },
    ],
  },
  {
    key: "anthropic",
    label: "Claude",
    defaultModel: "claude-fable-5-20260601",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    models: [
      { id: "claude-fable-5-20260601", label: "Claude Fable 5", note: "Anthropicの最新フラッグシップ既定候補" },
      { id: "claude-opus-4-8-20260320", label: "Claude Opus 4.8", note: "高度な構成相談や長文検討向け" },
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", note: "速度と品質のバランス候補" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "短い整形や軽量タスク向け" },
    ],
  },
  {
    key: "gemini",
    label: "Gemini",
    defaultModel: "gemini-3.5-flash",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    models: [
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Gemini APIの最新Flash既定候補" },
      { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", note: "長めの相談や構成案向け" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "互換性を見たい時の候補" },
    ],
  },
];

export const getDefaultAiSettings = () =>
  AI_PROVIDERS.map((provider) => ({
    key: provider.key,
    label: provider.label,
    apiKey: "",
    selectedModel: provider.defaultModel,
  }));
