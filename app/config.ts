import type { AppConfig } from "@/core/application/di/types";

export const content: Omit<AppConfig, "appUrl"> = {
  siteName: "hollow",
  defaultTitle: "hollow",
  defaultDescription:
    "静かで個人的なテキストアーカイブ。ノートを保存・整理し、必要に応じて公開・限定共有できる Web サービスです。",
  themeColor: "#ffffff",
  locale: "ja_JP",
  // twitterHandle: "@example",
};
