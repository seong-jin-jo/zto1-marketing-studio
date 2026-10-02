import type { PreviewPlatform } from "@/components/studio/PlatformPreview";

/**
 * 2026-10-02 운영 사고: 발행실 미리보기 탭("전체 7곳 / Threads / X / Instagram …")은
 * 보기 필터일 뿐인데, 실제 발행 대상 체크박스와 생김새·자리가 비슷해 "Instagram 탭을
 * 눌렀으니 Instagram 이 선택됐다"로 착각했다. 이전 세션에 Threads 가 체크된 채 복원돼
 * 남아 있었는데 그 사실이 안 보여, "선택한 1곳에 지금 발행"을 누르자 Threads 로 실제
 * 게시됐다(운영 계정, 2026-10-02 05:5x KST).
 *
 * 숫자만으로는 "그 1곳이 무엇인지"를 말하지 않는다. 채널 이름을 그 자리에서 밝히면,
 * 방금 누른 미리보기 탭과 실제 선택이 다를 때 발행 버튼·상단 배너에서 바로 드러난다.
 *
 * 2026-10-03 독립 리뷰 MINOR-g 재수정: 채널이 4곳을 넘으면 "4곳"처럼 숫자로 줄이던
 * 종전 로직은 **가장 헷갈리는 경우(여러 곳에 동시 발행)에서 바로 이름을 감춰** 사고를
 * 막는 효과가 제일 필요한 자리에서 제일 약했다. 이름은 항상 전부 나열한다. 줄바꿈은
 * 괜찮다(화면이 줄바꿈 처리).
 *
 * 이 맵은 page.tsx 안에도 똑같은 내용으로 중복 선언돼 있었다. 여기 하나만 남기고
 * page.tsx는 이 export를 그대로 가져다 쓴다(두 곳이 갈라지면 한쪽만 고치고 다른 쪽을
 * 잊는 드리프트가 생긴다).
 */
export const PLATFORM_LABEL: Record<PreviewPlatform, string> = {
  threads: "Threads",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  shorts: "Shorts",
  reels: "Reels",
  tiktok: "TikTok",
};

export function channelNameList(platforms: readonly PreviewPlatform[]): string {
  if (platforms.length === 0) return "";
  return platforms.map((platform) => PLATFORM_LABEL[platform]).join(", ");
}
