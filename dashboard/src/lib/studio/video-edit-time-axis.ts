import {
  COMP_FPS,
  INTRO_OUTRO_COMPS,
  type IntroOutroCompId,
} from "../../../remotion/IntroOutroComps";
import { mergedCutRanges, type PlaybackRange } from "./playback-edit-plan";
import type { IntroOutroApplied } from "./video-edit-contract";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isIntroOutroCompId(compId: string): compId is IntroOutroCompId {
  return compId in INTRO_OUTRO_COMPS;
}

function compDurationSec(compId: string | null | undefined): number {
  if (!compId) return 0;
  if (!isIntroOutroCompId(compId)) return 0;
  const comp = INTRO_OUTRO_COMPS[compId];
  return comp ? comp.durationInFrames / COMP_FPS : 0;
}

/** Remotion 컴포지션 등록부가 인트로 길이의 정본이다. 저장값은 구데이터 호환 fallback뿐이다. */
export function introDurationSec(applied: IntroOutroApplied): number {
  if (!applied) return 0;
  return compDurationSec(applied.introCompId) || applied.introDurationSec || 0;
}

export function outroDurationSec(applied: IntroOutroApplied): number {
  return applied ? compDurationSec(applied.outroCompId) : 0;
}

function isBakedResult(applied: IntroOutroApplied): applied is NonNullable<IntroOutroApplied> {
  return Boolean(
    applied?.compositeFilename
      && applied.resultFilename
      && applied.resultFilename !== applied.compositeFilename,
  );
}

function renderedCuts(applied: IntroOutroApplied, bodyDurationSec: number): PlaybackRange[] {
  if (!isBakedResult(applied)) return [];
  return mergedCutRanges(bodyDurationSec, applied.renderedCutRanges || []);
}

function removedDuration(cuts: PlaybackRange[]): number {
  return cuts.reduce((sum, cut) => sum + cut.endSec - cut.startSec, 0);
}

/** 현재 재생 파일 길이를 편집 계약의 본문 원본 길이로 복원한다. */
export function bodyDurationFromPlaybackDuration(
  playbackDurationSec: number,
  applied: IntroOutroApplied,
): number {
  const visibleBodyDuration = Math.max(
    0,
    playbackDurationSec - introDurationSec(applied) - outroDurationSec(applied),
  );
  if (!isBakedResult(applied)) return visibleBodyDuration;
  return visibleBodyDuration + removedDuration(applied.renderedCutRanges || []);
}

/** 컷이 반영된 출력 본문 위치를 컷 전 본문 원본 위치로 되돌린다. */
function sourceTimeFromCompactTime(compactTimeSec: number, bodyDurationSec: number, cuts: PlaybackRange[]): number {
  let outputCursor = 0;
  let sourceCursor = 0;
  for (const cut of cuts) {
    const keptSpan = Math.max(0, cut.startSec - sourceCursor);
    if (compactTimeSec <= outputCursor + keptSpan) {
      return clamp(sourceCursor + compactTimeSec - outputCursor, 0, bodyDurationSec);
    }
    outputCursor += keptSpan;
    sourceCursor = cut.endSec;
  }
  return clamp(sourceCursor + compactTimeSec - outputCursor, 0, bodyDurationSec);
}

/** 합성본·구운 결과의 플레이어 시각을 본문 원본 시각으로 바꿔 저장한다. */
export function bodyTimeFromPlaybackTime(
  playbackTimeSec: number,
  bodyDurationSec: number,
  applied: IntroOutroApplied,
): number {
  const compactBodyTime = playbackTimeSec - introDurationSec(applied);
  if (compactBodyTime <= 0) return 0;
  const cuts = renderedCuts(applied, bodyDurationSec);
  const visibleBodyDuration = Math.max(0, bodyDurationSec - removedDuration(cuts));
  if (compactBodyTime >= visibleBodyDuration) return bodyDurationSec;
  return sourceTimeFromCompactTime(compactBodyTime, bodyDurationSec, cuts);
}

/** 현재 재생 위치가 인트로·아웃트로가 아닌 본문 화면인지 판정한다. */
export function isPlaybackTimeWithinBody(
  playbackTimeSec: number,
  bodyDurationSec: number | null,
  applied: IntroOutroApplied,
): boolean {
  const bodyStart = introDurationSec(applied);
  if (playbackTimeSec < bodyStart) return false;
  if (bodyDurationSec === null) return true;
  const visibleBodyDuration = Math.max(
    0,
    bodyDurationSec - removedDuration(renderedCuts(applied, bodyDurationSec)),
  );
  return playbackTimeSec < bodyStart + visibleBodyDuration;
}

/** 본문 원본 시각을 현재 재생 파일의 표시 시각으로 바꿔 탐색한다. */
export function playbackTimeFromBodyTime(
  bodyTimeSec: number,
  bodyDurationSec: number,
  applied: IntroOutroApplied,
): number {
  const sourceTime = clamp(bodyTimeSec, 0, bodyDurationSec);
  const cuts = renderedCuts(applied, bodyDurationSec);
  let removed = 0;
  for (const cut of cuts) {
    if (sourceTime >= cut.endSec) {
      removed += cut.endSec - cut.startSec;
      continue;
    }
    if (sourceTime > cut.startSec) {
      return introDurationSec(applied) + cut.startSec - removed;
    }
    break;
  }
  return introDurationSec(applied) + sourceTime - removed;
}
