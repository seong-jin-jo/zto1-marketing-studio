// 발행이 올릴 영상 파일명을 고른다. 2026-10-02 회장 반려: 인트로/아웃트로를 적용한
// 뒤에도 발행 요청은 원본 파일명을 그대로 보내고 있었다 — 화면은 "적용됨"을 보여줘도
// 실제로 올라가는 파일은 인트로/아웃트로가 없는 원본이었다. videoEdit.introOutro가
// 있으면 그 합성 결과(resultFilename)를 우선한다.
//
// 2026-10-02 독립 리뷰 M-4: 합성 당시의 원본과 지금 원본이 다르면(생성실에서 영상을
// 다시 만든 뒤) 그 합성은 더 이상 지금 영상의 인트로/아웃트로가 아니다 — 낡은 합성을
// 그대로 발행하면 전혀 다른(또는 지워진) 옛 영상이 올라간다. isIntroOutroStale로
// 걸러 원본으로 되돌린다.
import { isIntroOutroStale, type IntroOutroApplied } from "./video-edit-contract";

/** 본문 편집을 굽거나 발행할 때 쓸 현재 최종 영상 파일을 고른다. */
export function resolveVideoRenderSourceFilename(currentSourceFilename: string, introOutro: IntroOutroApplied): string {
  if (isIntroOutroStale(introOutro, currentSourceFilename)) return currentSourceFilename;
  return introOutro?.resultFilename || currentSourceFilename;
}

/** 기존 발행 호출부의 이름을 유지한다. 선택 규칙의 정본은 위 함수 하나다. */
export function resolveVideoPublishFilename(currentSourceFilename: string, introOutro: IntroOutroApplied): string {
  return resolveVideoRenderSourceFilename(currentSourceFilename, introOutro);
}
