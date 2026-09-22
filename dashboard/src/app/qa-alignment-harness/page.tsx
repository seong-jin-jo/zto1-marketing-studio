import { notFound } from "next/navigation";
import { AlignmentHarnessGrid } from "./AlignmentHarnessGrid";

/**
 * 발행실 카드 정렬 실측 전용 개발 도구. 운영에서는 열리지 않는다(ADR-004 계열
 * 운영 노출 금지 관례와 동일하게 NODE_ENV 로 막는다).
 *
 * 2026-09-22 교차 코드리뷰(PR #77) C3: "동어반복 소스 문자열 테스트로는 증거가 안 된다.
 * 실제로 브라우저에서 렌더해 폭 1792 기준 같은 줄 세 칸의 편집 블록 y 좌표를 재고 그
 * 수치를 보고에 붙여라." 이 라우트는 app/studio/page.tsx 의 실제 발행실 그리드
 * 마크업(`grid gap-stack-section md:grid-cols-2 xl:grid-cols-3` + 카드 래퍼
 * `flex min-w-0 flex-col rounded-surface border border-border bg-surface p-stack`)을
 * 그대로 재현해, 실제 PlatformPreview 컴포넌트를 실제 브라우저 레이아웃 엔진으로
 * 그리고 좌표를 잴 수 있게 한다. 인증 흐름을 타지 않고도(발행실은 로그인 뒤 화면이라
 * 자동화가 매번 로그인을 통과해야 한다) 같은 컴포넌트·같은 CSS 로 측정한다.
 * 측정 스크립트: scripts/measure-publish-room-alignment.mjs.
 */
export default function AlignmentHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AlignmentHarnessGrid />;
}
