"use client";

import { PlatformPreview, type PreviewPlatform } from "@/components/studio/PlatformPreview";

/**
 * app/studio/page.tsx 발행실 그리드(GROUPS.map)의 실제 마크업을 그대로 재현한다.
 * 헤더줄·그리드 클래스·카드 래퍼 클래스가 원본과 한 글자도 다르지 않아야 측정값이
 * 의미가 있다. 원본은 이번 위임에서 편집 금지 대상이라 여기서 복제해 측정한다.
 *
 * 2026-09-22 교차 코드리뷰(PR #77) 3라운드: 2라운드 하네스는 media={{}} 로 미디어를
 * 빼고 headerRight 를 아예 안 넘겨서, 진짜 기계적 원인(headerRight 가 채널마다
 * 44/72/124px 로 줄바꿈되는 것)을 측정에서 빼놓고 쟀다. 3라운드에서 headerRight 는
 * 채워 넣었지만 media={{}} 는 그대로였다.
 *
 * 4라운드: media 도 실제로 넣는다(모든 텍스트/카드뉴스 채널에 이미지, 영상 채널에
 * 영상+커버 이미지). headerRight 도 page.tsx:2354 와 같은 wrapping div 구조로
 * 감싼다(원본은 Fragment 가 아니라 `<div className="flex flex-wrap ...">` 하나가
 * 자식을 감싸 넘긴다. 구조가 다르면 실제 레이아웃과 다른 걸 재는 셈이다).
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
// 길이면 캡핑 효과를 측정할 수 없다. 일부러 들쭉날쭉하게 만든다.
const TEXT: Record<string, string> = {
  threads: "오늘 콘텐츠 초안입니다. 짧게 씁니다.",
  x: "이건 조금 더 긴 초안입니다. X 는 가중 문자라 한글이 두 배로 잡히니 실제로는 더 짧게 써야 발행이 됩니다. 그래도 테스트를 위해 이 정도 길이로 둡니다.",
  facebook: "Facebook 은 상한이 넉넉해서 사람들이 보통 길게 씁니다. 오늘 있었던 일, 제품 소식, 다음 주 일정까지 한 번에 다 적는 경우가 많고, 이 미리보기도 그런 실제 초안 길이를 흉내 냅니다. 문단이 두세 개는 되어야 실감이 납니다.",
};

// 채널별로 계정 연결 상태를 다르게 흉내 낸다(회장 실측: facebook 44px 은 "발행|계정
// 연결하기" 두 조각뿐인 미연결 상태였다).
const CONNECTED: Partial<Record<PreviewPlatform, boolean>> = { facebook: false };
const HAS_COVER_TIMESTAMP: Partial<Record<PreviewPlatform, boolean>> = { reels: true, tiktok: true };

function editorFor(platform: PreviewPlatform) {
  const connected = CONNECTED[platform] !== false;
  return {
    account: connected
      ? { status: "connected" as const, displayName: "운영 계정", username: "operator" }
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

/**
 * page.tsx 의 headerRight JSX 를 채널 상태까지 갖춰 재현한다(주석은 그쪽 원본 참고).
 * page.tsx:2354 는 이 내용을 Fragment 가 아니라 `<div className="flex flex-wrap
 * items-center justify-end gap-stack-tight">` 하나로 감싸 PlatformPreview 에 넘긴다.
 * 구조가 다르면 다른 것을 재는 셈이라 그대로 맞춘다(2026-09-22 4라운드).
 */
function HeaderRightFor({ platform }: { platform: PreviewPlatform }) {
  const connected = CONNECTED[platform] !== false;
  const hasCoverTimestamp = HAS_COVER_TIMESTAMP[platform] === true;
  const isVideo = platform === "shorts" || platform === "reels" || platform === "tiktok";
  return (
    <div className="flex flex-wrap items-center justify-end gap-stack-tight">
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
      ) : null}
      {!connected ? (
        <span className="inline-flex min-h-control-touch items-center rounded-control border border-accent/40 bg-accent-soft px-stack-tight text-caption font-semibold text-accent">
          계정 연결하기
        </span>
      ) : (
        <>
          <select aria-label={`${LABEL[platform]} 발행 계정`} className="min-h-control-touch max-w-32 rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text" defaultValue="">
            <option value="">기본 계정</option>
          </select>
          <span className="inline-flex min-h-control-touch items-center rounded-control border border-border bg-surface-2 px-stack-tight text-caption font-semibold text-muted">
            계정 관리
          </span>
        </>
      )}
    </div>
  );
}

// 2026-09-22 4라운드: media={{}} 로 이미지를 빼고 쟀다는 지적을 반영해 실제 이미지를
// 넘긴다. 레포에 안전하게 참조 가능한 정적 자산(public/logo.svg)을 쓴다. 네트워크
// 의존 없이 재현 가능해야 한다는 J6 요구와 같은 이유다. 영상(vidUrl)은 이 레포에 커밋된
// 샘플 영상 자산이 없어 이번 라운드에서 채우지 못했다(정직하게 밝힌다). headerRight
// 측정(이번 라운드의 핵심)에는 영상 여부가 영향을 주지 않는다. 헤더 영역은 media 와
// 무관하게 그려진다.
const PLACEHOLDER_IMAGE = "/logo.svg";

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
                  media={{ imgUrl: PLACEHOLDER_IMAGE }}
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
