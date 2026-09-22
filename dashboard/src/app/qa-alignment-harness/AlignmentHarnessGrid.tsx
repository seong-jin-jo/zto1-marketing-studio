"use client";

import { PlatformPreview, type PreviewPlatform } from "@/components/studio/PlatformPreview";

/**
 * app/studio/page.tsx 발행실 그리드(GROUPS.map)의 실제 마크업을 그대로 재현한다.
 * 헤더줄·그리드 클래스·카드 래퍼 클래스가 원본과 한 글자도 다르지 않아야 측정값이
 * 의미가 있다 — 원본은 이번 위임에서 편집 금지 대상이라 여기서 복제해 측정한다.
 */
const GROUPS: { title: string; platforms: PreviewPlatform[] }[] = [
  { title: "텍스트", platforms: ["threads", "x", "facebook"] },
  { title: "세로 영상", platforms: ["shorts", "reels", "tiktok"] },
  { title: "카드뉴스", platforms: ["instagram"] },
];

const LABEL: Record<PreviewPlatform, string> = {
  threads: "Threads", x: "X", facebook: "Facebook", instagram: "Instagram",
  shorts: "Shorts", reels: "Reels", tiktok: "TikTok",
};

// 실제 회장 계정에서 나올 법한, 서로 다른 길이의 초안을 채널마다 준다. 전부 같은
// 길이면 line-clamp 캡핑 효과를 측정할 수 없다 — 일부러 들쭉날쭉하게 만든다.
const TEXT: Record<string, string> = {
  threads: "오늘 콘텐츠 초안입니다. 짧게 씁니다.",
  x: "이건 조금 더 긴 초안입니다. X 는 가중 문자라 한글이 두 배로 잡히니 실제로는 더 짧게 써야 발행이 됩니다. 그래도 테스트를 위해 이 정도 길이로 둡니다.",
  facebook: "Facebook 은 상한이 넉넉해서 사람들이 보통 길게 씁니다. 오늘 있었던 일, 제품 소식, 다음 주 일정까지 한 번에 다 적는 경우가 많고, 이 미리보기도 그런 실제 초안 길이를 흉내 냅니다. 문단이 두세 개는 되어야 실감이 납니다.",
};

function editorFor(platform: PreviewPlatform) {
  return {
    account: { status: "connected" as const, displayName: "운영 계정", username: "operator" },
    title: platform === "shorts" ? "제목 예시" : "",
    caption: platform === "shorts" ? "숏폼 설명입니다" : platform === "reels" ? "" : platform === "tiktok" ? "틱톡 캡션 예시로 조금 더 긴 문장을 넣어 봅니다" : (TEXT[platform] ?? ""),
    hashtags: platform === "instagram" ? "#카드뉴스 #예시" : "",
    topicTag: platform === "threads" ? "예시태그" : "",
    firstComment: "",
    firstCommentSupported: platform === "threads" || platform === "facebook" || platform === "instagram" || platform === "reels",
    onTitleChange: () => {},
    onCaptionChange: () => {},
    onHashtagsChange: () => {},
    onTopicTagChange: () => {},
    onFirstCommentChange: () => {},
  };
}

export function AlignmentHarnessGrid() {
  return (
    <div className="mx-auto max-w-[1760px] p-stack-section" data-alignment-harness-root>
      {GROUPS.map((group) => (
        <section key={group.title} className="mb-stack-section">
          <div className="mb-stack flex items-center gap-stack-tight border-b border-border pb-stack">
            <b className="text-body text-text">{group.title}</b>
            <span className="text-caption text-subtle">{group.platforms.map((p) => LABEL[p]).join(" · ")}</span>
          </div>
          <div className="grid gap-stack-section md:grid-cols-2 xl:grid-cols-3">
            {group.platforms.map((platform) => (
              <div key={platform} data-room-preview={platform} className="flex min-w-0 flex-col rounded-surface border border-border bg-surface p-stack">
                <PlatformPreview
                  platform={platform}
                  text={{ threads: TEXT.threads, facebook: TEXT.facebook, x: TEXT.x, instagram: { caption: "카드뉴스 캡션 예시", hashtags: ["카드뉴스", "예시"] } }}
                  media={{}}
                  editor={editorFor(platform)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
