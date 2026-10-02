// 발행이 올릴 영상 파일명을 고른다. 2026-10-02 회장 반려: 인트로/아웃트로를 적용한
// 뒤에도 발행 요청은 원본 파일명을 그대로 보내고 있었다 — 화면은 "적용됨"을 보여줘도
// 실제로 올라가는 파일은 인트로/아웃트로가 없는 원본이었다. videoEdit.introOutro가
// 있으면 그 합성 결과(resultFilename)를 우선한다.
import type { IntroOutroApplied } from "./video-edit-contract";

export function resolveVideoPublishFilename(originalFilename: string, introOutro: IntroOutroApplied): string {
  return introOutro?.resultFilename || originalFilename;
}
