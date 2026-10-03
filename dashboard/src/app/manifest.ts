import type { MetadataRoute } from "next";

// PWA manifest. 설치 가능(installable) + standalone 실행까지만 범위(회장 2026-09-22
// "pwa 만들어서 배포는 빨리 해놓고" — 오프라인 캐시 고도화·푸시 알림은 범위 밖).
// 색 토큰은 DESIGN.md v37 tokens.color 를 그대로 쓴다(accent / bg) — 임의 hex 신설 금지.
// 참고: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OSMU 스튜디오",
    short_name: "OSMU",
    description: "혼자 일하는 사람이 담당과 대화하며 콘텐츠를 만들고 여러 채널로 내보내는 마케팅 자동화 스튜디오",
    start_url: "/studio",
    scope: "/",
    display: "standalone",
    background_color: "#fbfbfc",
    theme_color: "#2563eb",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
