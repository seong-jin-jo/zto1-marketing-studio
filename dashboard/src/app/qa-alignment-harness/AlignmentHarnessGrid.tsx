"use client";

import { PlatformPreview, type PreviewPlatform } from "@/components/studio/PlatformPreview";

/**
 * app/studio/page.tsx 발행실 그리드(GROUPS.map)의 실제 마크업을 그대로 재현한다.
 * 헤더줄·그리드 클래스·카드 래퍼 클래스가 원본과 한 글자도 다르지 않아야 측정값이
 * 의미가 있다.
 *
 * 2026-09-22~23 교차 코드리뷰(PR #77) 라운드별 하네스 결함 이력(같은 실수를
 * 반복하지 않기 위해 전부 남긴다):
 * - 3라운드: media={{}} 로 이미지를 빼고 headerRight 를 아예 안 넘겨서 쟀다.
 * - 4라운드: headerRight 는 채웠지만 계정 select 옵션을 "기본 계정"이라는 짧은
 *   플레이스홀더로 넣었다. 실제 page.tsx:2419 는 "기본 {계정 label}" 로 진짜
 *   계정 이름이 들어가 select 가 max-w-32(128px)까지 자란다 — 그 폭이 줄바꿈을
 *   만드는 진짜 변수였는데 하네스가 짧은 문자열로 그 변수를 없앤 채 쟀다. 영상
 *   채널에는 imgUrl 만 넘겨 실제 video 분기가 렌더되지 않았고, instagram
 *   캐러셀도 1장만 넘겨 다장 캐러셀 분기를 안 쟀다.
 *
 * 5라운드에서 전부 고친다: 계정 이름을 실제 길이로(운영 계정처럼 짧은 것부터 긴
 * 것까지 채널마다 다르게), 영상 채널에 실제 vidUrl, instagram 에 imgUrls 여러
 * 장, 미연결·미지원 채널을 혼재시킨다.
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

// 실제 회장 계정에서 나올 법한, 서로 다른 길이의 초안을 채널마다 준다.
const TEXT: Record<string, string> = {
  threads: "오늘 콘텐츠 초안입니다. 짧게 씁니다.",
  x: "이건 조금 더 긴 초안입니다. X 는 가중 문자라 한글이 두 배로 잡히니 실제로는 더 짧게 써야 발행이 됩니다. 그래도 테스트를 위해 이 정도 길이로 둡니다.",
  facebook: "Facebook 은 상한이 넉넉해서 사람들이 보통 길게 씁니다. 오늘 있었던 일, 제품 소식, 다음 주 일정까지 한 번에 다 적는 경우가 많고, 이 미리보기도 그런 실제 초안 길이를 흉내 냅니다. 문단이 두세 개는 되어야 실감이 납니다.",
};

// 2026-09-23 5라운드: 회장이 9444 에서 잰 조건(계정 select 가 실제 이름으로 자란
// 상태)을 재현한다. 짧은 이름·긴 이름·미연결을 섞는다.
const ACCOUNT_LABEL: Partial<Record<PreviewPlatform, string>> = {
  threads: "오스무팩토리", x: "osmu_official_account", instagram: "osmu.factory.creator",
  shorts: "OSMU 공식 채널", reels: "osmu_reels_studio_2026", tiktok: "osmufactory",
};
const CONNECTED: Partial<Record<PreviewPlatform, boolean>> = { facebook: false };
const HAS_COVER_TIMESTAMP: Partial<Record<PreviewPlatform, boolean>> = { reels: true, tiktok: true };
const PLACEHOLDER_IMAGE = "/logo.svg";
// 레포에 커밋된 재생 가능한 샘플 영상이 없어 data: URI 로 최소 유효 mp4 를 만든다
// (1x1, 무음, 네트워크 의존 없음). video 분기가 실제로 렌더되는지 재는 것이
// 목적이라 재생 품질은 무관하다.
const SAMPLE_VIDEO =
  "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAt1tZGF0AAAC";

function editorFor(platform: PreviewPlatform) {
  const connected = CONNECTED[platform] !== false;
  const label = ACCOUNT_LABEL[platform] || "운영계정";
  return {
    account: connected
      ? { status: "connected" as const, displayName: label, username: label }
      : { status: "missing" as const },
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

function mediaFor(platform: PreviewPlatform) {
  const isVideo = platform === "shorts" || platform === "reels" || platform === "tiktok";
  if (isVideo) return { vidUrl: SAMPLE_VIDEO, imgUrl: PLACEHOLDER_IMAGE };
  if (platform === "instagram") return { imgUrls: [PLACEHOLDER_IMAGE, PLACEHOLDER_IMAGE, PLACEHOLDER_IMAGE] };
  return { imgUrl: PLACEHOLDER_IMAGE };
}

/**
 * page.tsx:2354 headerRight JSX 를 채널 상태까지 갖춰 재현한다. 2026-09-23
 * 5라운드에서 page.tsx 쪽을 고정 2행(발행/대문 · 계정) 구조로 바꿨으므로 여기도
 * 같은 구조 + 실제 계정명 길이로 맞춘다.
 */
function HeaderRightFor({ platform }: { platform: PreviewPlatform }) {
  const connected = CONNECTED[platform] !== false;
  const hasCoverTimestamp = HAS_COVER_TIMESTAMP[platform] === true;
  const isVideo = platform === "shorts" || platform === "reels" || platform === "tiktok";
  const label = ACCOUNT_LABEL[platform] || "운영계정";
  return (
    <div className="flex flex-col items-end gap-micro">
      <div className="flex items-center justify-end gap-stack-tight">
        <label className="ds-touch-target flex min-h-control-touch items-center gap-micro px-stack-tight text-caption text-muted">
          <input aria-label={`${LABEL[platform]} 발행`} type="checkbox" className="h-5 w-5 shrink-0" readOnly checked={false} />
          발행
        </label>
        {hasCoverTimestamp ? (
          <label className="flex items-center gap-micro text-caption text-muted" title="영상에서 이 시점 화면을 대문으로 씁니다">
            대문
            <input
              type="number"
              aria-label={`${LABEL[platform]} 대문 시점(초)`}
              defaultValue={0}
              className="min-h-control-touch w-16 rounded-control border border-border bg-surface px-stack-tight text-caption text-text"
            />
            초
          </label>
        ) : isVideo ? (
          <span className="text-caption text-subtle">대문 자동</span>
        ) : (
          <span aria-hidden="true" className="text-caption text-transparent select-none">대문 자동</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-stack-tight">
        {!connected ? (
          <span className="inline-flex min-h-control-touch items-center rounded-control border border-accent/40 bg-accent-soft px-stack-tight text-caption font-semibold text-accent">
            계정 연결하기
          </span>
        ) : (
          <>
            <select aria-label={`${LABEL[platform]} 발행 계정`} className="min-h-control-touch w-28 truncate rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text" defaultValue="">
              <option value="">기본 {label}</option>
            </select>
            <span className="inline-flex min-h-control-touch items-center rounded-control border border-border bg-surface-2 px-stack-tight text-caption font-semibold text-muted">
              계정 관리
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function AlignmentHarnessGrid() {
  return (
    <div className="mx-auto max-w-[var(--alignment-harness-max-w)] p-stack-section" data-alignment-harness-root>
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
                  media={mediaFor(platform)}
                  editor={editorFor(platform)}
                  headerRight={<HeaderRightFor platform={platform} />}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
