// 발행이 올릴 영상 파일명을 고른다. 2026-10-02 회장 반려: 인트로/아웃트로를 적용한
// 뒤에도 발행 요청은 원본 파일명을 그대로 보내고 있었다 — 화면은 "적용됨"을 보여줘도
// 실제로 올라가는 파일은 인트로/아웃트로가 없는 원본이었다. videoEdit.introOutro가
// 있으면 그 합성 결과(resultFilename)를 우선한다.
//
// 2026-10-02 독립 리뷰 M-4: 합성 당시의 원본과 지금 원본이 다르면(생성실에서 영상을
// 다시 만든 뒤) 그 합성은 더 이상 지금 영상의 인트로/아웃트로가 아니다 — 낡은 합성을
// 그대로 발행하면 전혀 다른(또는 지워진) 옛 영상이 올라간다. isIntroOutroStale로
// 걸러 원본으로 되돌린다.
import { isIntroOutroStale, type IntroOutroApplied, type VideoEdit } from "./video-edit-contract";
import { introDurationSec } from "./video-edit-time-axis";

export type UnbakedVideoSource = { filename: string; url: string };
export type VideoBakedLineage = {
  /** 현재 file/url 산출물에 자막·오버레이가 이미 픽셀로 들어갔는지. */
  subtitlesBaked?: boolean;
  /** 다시 편집하고 구울 때 쓸 글자 없는 기준 영상. */
  editSource?: UnbakedVideoSource;
};

/** 현재 파일이 인트로·아웃트로 계보상 이미 글자를 구운 최종 결과인지 판정한다. */
export function isLegacyIntroOutroBakedResult(currentFilename: string, introOutro: IntroOutroApplied): boolean {
  return Boolean(introOutro
    && introOutro.compositeFilename
    && introOutro.resultFilename !== introOutro.compositeFilename
    && currentFilename === introOutro.resultFilename);
}

/**
 * 자막 굽기는 언제나 글자 없는 입력에서 시작한다. 원본 URL과 파일명이 같은 계보로
 * 확인되지 않으면 구운 파일을 원본인 것처럼 다시 쓰지 않고 호출자가 중단한다.
 */
export function resolveUnbakedVideoSource(input: {
  currentFilename: string;
  currentUrl: string;
  lineage: VideoBakedLineage;
  introOutro: IntroOutroApplied;
}): { ok: true } & UnbakedVideoSource | { ok: false; reason: "unbaked_source_missing" } {
  const legacyBakedResult = isLegacyIntroOutroBakedResult(input.currentFilename, input.introOutro);
  // 이전 구현은 compositeDeliverUrl이 없는 상태에서 글자 없는 합성본 파일명과 이미 구운
  // deliverUrl을 editSource 한 쌍으로 저장할 수 있었다. 값의 존재만으로 신뢰하지 않고,
  // 현재 구운 결과 URL과 같은 URL을 가리키는 오염 계보는 원본 없음으로 처리한다.
  const editSourceAliasesBakedResult = Boolean(legacyBakedResult
    && input.lineage.editSource?.url
    && input.lineage.editSource.url === input.introOutro?.deliverUrl);
  if (input.lineage.editSource?.filename && input.lineage.editSource.url && !editSourceAliasesBakedResult) {
    return { ok: true, ...input.lineage.editSource };
  }

  const currentIsBaked = input.lineage.subtitlesBaked === true
    || legacyBakedResult;
  if (currentIsBaked) return { ok: false, reason: "unbaked_source_missing" };

  if (input.introOutro && !isIntroOutroStale(input.introOutro, input.currentFilename)) {
    const compositeFilename = input.introOutro.compositeFilename || input.introOutro.resultFilename;
    const compositeUrl = input.introOutro.compositeDeliverUrl
      || (input.introOutro.resultFilename === compositeFilename ? input.introOutro.deliverUrl : "");
    if (compositeFilename !== input.currentFilename) {
      return compositeUrl
        ? { ok: true, filename: compositeFilename, url: compositeUrl }
        : { ok: false, reason: "unbaked_source_missing" };
    }
  }

  return input.currentFilename && input.currentUrl
    ? { ok: true, filename: input.currentFilename, url: input.currentUrl }
    : { ok: false, reason: "unbaked_source_missing" };
}

/** 본문 편집을 굽거나 발행할 때 쓸 현재 최종 영상 파일을 고른다. */
export function resolveVideoRenderSourceFilename(currentSourceFilename: string, introOutro: IntroOutroApplied): string {
  if (isIntroOutroStale(introOutro, currentSourceFilename)) return currentSourceFilename;
  return introOutro?.compositeFilename || introOutro?.resultFilename || currentSourceFilename;
}

/** 발행은 자막까지 반영된 최신 결과를 쓴다. */
export function resolveVideoPublishFilename(currentSourceFilename: string, introOutro: IntroOutroApplied): string {
  if (isIntroOutroStale(introOutro, currentSourceFilename)) return currentSourceFilename;
  return introOutro?.resultFilename || currentSourceFilename;
}

/** 원본 시간축의 컷·자막·오버레이를 인트로가 앞에 붙은 합성본 시간축으로 옮긴다. */
export function alignVideoEditToRenderSource(
  edit: VideoEdit,
  introOutro: IntroOutroApplied,
  currentSourceFilename: string,
): VideoEdit {
  if (!introOutro || isIntroOutroStale(introOutro, currentSourceFilename)) return edit;
  const offset = introDurationSec(introOutro);
  if (offset <= 0) return edit;
  const shift = <T extends { startSec: number; endSec: number }>(item: T): T => ({
    ...item,
    startSec: item.startSec + offset,
    endSec: item.endSec + offset,
  });
  return {
    ...edit,
    subtitles: edit.subtitles.map(shift),
    overlays: edit.overlays.map(shift),
    comments: edit.comments.map(shift),
  };
}
