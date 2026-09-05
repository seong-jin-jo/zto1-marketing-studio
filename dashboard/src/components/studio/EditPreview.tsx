"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import type { EditContentKind } from "./StudioRooms";
import styles from "./EditPreview.module.css";

// 편집실 미리보기.
//
// 회장 지적: "컨텐츠가 미리볼 수 있는게 없는데 내가 어떻게 확인하냐."
// 그리고 "올릴 플랫폼을 선택해서 규격에 맞게 미리보기 하면서 편집해야하지 않을까?"
//
// 영상 파일이 아직 안 나왔어도 장면과 대사와 자막이 그 플랫폼 규격 안에서 어떻게 보이는지는
// 지금 그릴 수 있다. 그래서 빈 상자를 두지 않는다. 고른 규격의 비율 그대로 틀을 잡고,
// 그 플랫폼이 화면을 덮는 자리(위 상태줄, 아래 버튼줄)를 같이 그려 자막이 가리는지 보여준다.

export interface PreviewSpec {
  key: string;
  label: string;
  /** 세로 비율. width / height */
  ratio: string;
  size: string;
  /** 플랫폼 UI가 덮는 위쪽 비율(퍼센트) */
  safeTop: number;
  /** 플랫폼 UI가 덮는 아래쪽 비율(퍼센트) */
  safeBottom: number;
  kinds: EditContentKind[];
}

export const PREVIEW_SPECS: readonly PreviewSpec[] = [
  { key: "video-vertical", label: "세로형 9:16", ratio: "9 / 16", size: "1080 × 1920", safeTop: 8, safeBottom: 24, kinds: ["video"] },
  { key: "video-square", label: "정사각형 1:1", ratio: "1 / 1", size: "1080 × 1080", safeTop: 0, safeBottom: 0, kinds: ["video"] },
  { key: "video-horizontal", label: "가로형 16:9", ratio: "16 / 9", size: "1920 × 1080", safeTop: 0, safeBottom: 0, kinds: ["video"] },
  { key: "card-portrait", label: "세로 카드 4:5", ratio: "4 / 5", size: "1080 × 1350", safeTop: 0, safeBottom: 0, kinds: ["card"] },
  { key: "card-square", label: "정사각형 카드 1:1", ratio: "1 / 1", size: "1080 × 1080", safeTop: 0, safeBottom: 0, kinds: ["card"] },
  { key: "card-horizontal", label: "가로 카드 1.91:1", ratio: "1.91 / 1", size: "1200 × 628", safeTop: 0, safeBottom: 0, kinds: ["card"] },
] as const;

export type CardTextPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

const CARD_POSITION_CLASS: Record<CardTextPosition, string> = {
  "top-left": styles.cardTopLeft,
  "top-center": styles.cardTopCenter,
  "top-right": styles.cardTopRight,
  "center-left": styles.cardCenterLeft,
  center: styles.cardCenter,
  "center-right": styles.cardCenterRight,
  "bottom-left": styles.cardBottomLeft,
  "bottom-center": styles.cardBottomCenter,
  "bottom-right": styles.cardBottomRight,
};

function cardPositionAt(clientY: number, bounds: DOMRect): CardTextPosition {
  const row = clientY < bounds.top + bounds.height / 3
    ? "top"
    : clientY > bounds.top + (bounds.height * 2) / 3 ? "bottom" : "center";
  return row === "top" ? "top-center" : row === "bottom" ? "bottom-center" : "center";
}

const SUBTITLE_CLASS: Record<string, string> = {
  작게: "text-caption",
  보통: "text-body-sm",
  크게: "text-body",
};

const RATIO_CLASS: Record<string, string> = {
  "9 / 16": styles.ratioPortrait,
  "4 / 5": styles.ratioFeed,
  "1 / 1": styles.ratioSquare,
  "16 / 9": styles.ratioLandscape,
  "1.91 / 1": styles.ratioFacebook,
};

const SAFE_AREA_HEIGHT_CLASS: Record<number, string> = {
  8: styles.height8,
  10: styles.height10,
  12: styles.height12,
  16: styles.height16,
  18: styles.height18,
  22: styles.height22,
  24: styles.height24,
};

const SUBTITLE_BOTTOM_CLASS: Record<number, string> = {
  8: styles.bottom8,
  18: styles.bottom18,
  20: styles.bottom20,
  24: styles.bottom24,
  26: styles.bottom26,
};

export function EditPreview({
  kind,
  lines,
  activeLine,
  onActiveLine,
  subtitleSize = "보통",
  renderReady = false,
  onLinesChange,
  cardTextPositions = [],
  onCardTextPositionsChange,
  aspectRatio,
  onAspectRatioChange,
}: {
  kind: EditContentKind;
  /** 화면에 남아 있는 대사만 넘긴다 */
  lines: string[];
  activeLine: number;
  onActiveLine: (index: number) => void;
  subtitleSize?: string;
  /** 실제 미디어 파일이 나왔는지 */
  renderReady?: boolean;
  onLinesChange?: (lines: string[]) => void;
  cardTextPositions?: CardTextPosition[];
  onCardTextPositionsChange?: (positions: CardTextPosition[]) => void;
  aspectRatio?: string;
  onAspectRatioChange?: (aspectRatio: string) => void;
}) {
  const specs = useMemo(() => PREVIEW_SPECS.filter((spec) => spec.kinds.includes(kind)), [kind]);
  const matchingSpec = specs.find((one) => one.ratio.replaceAll(" ", "").replace("/", ":") === aspectRatio);
  const [specKey, setSpecKey] = useState(matchingSpec?.key ?? specs[0]?.key ?? "shorts");
  useEffect(() => {
    setSpecKey(matchingSpec?.key ?? specs[0]?.key ?? "shorts");
  }, [matchingSpec?.key, specs]);
  const spec = specs.find((one) => one.key === specKey) ?? specs[0] ?? PREVIEW_SPECS[0];
  const line = lines[activeLine] ?? lines[0] ?? "";
  const unit = kind === "card" ? "장" : kind === "text" ? "문단" : "장면";
  const cardPosition = cardTextPositions[activeLine] ?? "center";
  const cardVerticalPosition = cardPosition.startsWith("top") ? "top" : cardPosition.startsWith("bottom") ? "bottom" : "center";
  const movingCardText = useRef(false);
  // 자막이 아래 UI가 덮는 자리 안으로 들어가면 실제 업로드 화면에서 가린다.
  const subtitleHidden = spec.safeBottom >= 20 && (subtitleSize === "크게" || line.length > 34);

  return (
    <section aria-label="올릴 규격으로 미리보기" data-edit-preview={spec.key} className="min-w-0">
      <div className="mb-stack flex flex-wrap items-center gap-stack-tight" role="group" aria-label="콘텐츠 크기 고르기">
        {specs.map((one) => (
          <Button key={one.key} size="sm" variant="secondary" className={one.key === spec.key ? "border-accent bg-accent-soft text-accent" : ""} aria-pressed={one.key === spec.key} onClick={() => {
            setSpecKey(one.key);
            onAspectRatioChange?.(one.ratio.replaceAll(" ", "").replace("/", ":"));
          }}>
            {one.label}
          </Button>
        ))}
        <span className="ml-auto text-caption text-subtle" data-edit-preview-size>{spec.size}픽셀</span>
      </div>

      <div className="grid place-items-center rounded-surface border border-border bg-surface-2 p-stack">
        <div
          className={`relative w-full max-w-sm overflow-hidden rounded-control bg-accent-soft ${RATIO_CLASS[spec.ratio]}`}
          data-edit-preview-frame={spec.ratio}
          data-card-canvas={kind === "card" ? "true" : undefined}
          onPointerUp={(event) => {
            if (kind !== "card" || !movingCardText.current || !onCardTextPositionsChange) return;
            movingCardText.current = false;
            const next = lines.map((_, index) => cardTextPositions[index] ?? "center");
            next[activeLine] = cardPositionAt(event.clientY, event.currentTarget.getBoundingClientRect());
            onCardTextPositionsChange(next);
          }}
        >
          {spec.safeTop > 0 ? (
            <div aria-hidden="true" className={`absolute inset-x-0 top-0 border-b border-dashed border-border bg-surface/40 ${SAFE_AREA_HEIGHT_CLASS[spec.safeTop]}`} />
          ) : null}
          {spec.safeBottom > 0 ? (
            <div aria-hidden="true" className={`absolute inset-x-0 bottom-0 border-t border-dashed border-border bg-surface/40 ${SAFE_AREA_HEIGHT_CLASS[spec.safeBottom]}`} />
          ) : null}

          {kind === "card" ? (
            <div
              className={`absolute z-10 w-4/5 rounded-control border border-border bg-surface/90 p-stack shadow-lg ${CARD_POSITION_CLASS[cardPosition]}`}
              data-card-text-position={cardPosition}
            >
              <button
                type="button"
                aria-label="카드 글자 끌어 옮기기"
                className="mb-stack-tight min-h-control-touch w-full cursor-move rounded-control border border-border bg-surface-2 px-stack text-caption font-semibold text-muted"
                onPointerDown={(event) => {
                  movingCardText.current = true;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
              >
                글자 위치 옮기기
              </button>
              <textarea
                aria-label={`카드 ${activeLine + 1} 글자`}
                value={line}
                rows={3}
                onChange={(event) => {
                  const next = lines.map((value, index) => index === activeLine ? event.target.value : value);
                  onLinesChange?.(next);
                }}
                className="min-h-control-touch w-full resize-none rounded-control border border-border bg-surface p-stack text-center text-body font-bold text-text"
              />
            </div>
          ) : <div className="absolute inset-0 grid place-items-center p-pad-inset text-center">
            <div className="min-w-0">
              <span className="text-caption font-semibold text-accent">
                {renderReady ? "미리보기" : `${unit} ${activeLine + 1}`}
              </span>
              {/* 영상과 카드뉴스는 같은 문장을 아래 자막이 이미 들고 있다. 가운데는 화면에 무엇이 놓이는지만 말한다. */}
              <p className="mt-stack break-keep text-body font-bold text-text">
                {line ? `여기에 ${unit} 화면이 놓입니다` : `이 ${unit}은 비어 있습니다`}
              </p>
            </div>
          </div>}

          {kind === "video" ? (
            <p
              data-edit-preview-subtitle={subtitleHidden ? "가림" : "보임"}
              className={`absolute inset-x-0 px-stack text-center font-semibold text-text ${SUBTITLE_CLASS[subtitleSize] || "text-body-sm"} ${SUBTITLE_BOTTOM_CLASS[Math.max(spec.safeBottom, 6) + 2]}`}
            >
              {line}
            </p>
          ) : null}
        </div>
      </div>

      {kind === "card" ? (
        <div className="mt-stack flex flex-wrap items-center gap-stack-tight" role="group" aria-label="카드 글자 위치">
          <span className="text-caption font-semibold text-muted">글자 위치</span>
          {(["top", "center", "bottom"] as const).map((position) => (
            <Button
              key={position}
              size="sm"
              variant="secondary"
              className={cardVerticalPosition === position ? "border-accent bg-accent-soft text-accent" : ""}
              aria-pressed={cardVerticalPosition === position}
              onClick={() => {
                if (!onCardTextPositionsChange) return;
                const next = lines.map((_, index) => cardTextPositions[index] ?? "center");
                next[activeLine] = position === "top" ? "top-center" : position === "bottom" ? "bottom-center" : "center";
                onCardTextPositionsChange(next);
              }}
            >
              {position === "top" ? "상단" : position === "bottom" ? "하단" : "중앙"}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="mt-stack flex flex-wrap items-center gap-stack-tight">
        <Button size="sm" onClick={() => onActiveLine(Math.max(0, activeLine - 1))} disabled={activeLine <= 0}>앞 {unit}</Button>
        <span className="text-caption text-subtle">{activeLine + 1} / {Math.max(lines.length, 1)}</span>
        <Button size="sm" onClick={() => onActiveLine(Math.min(lines.length - 1, activeLine + 1))} disabled={activeLine >= lines.length - 1}>다음 {unit}</Button>
        {spec.safeBottom > 0 ? (
          <span className="ml-auto break-keep text-caption text-subtle">점선 안쪽은 게시 화면의 단추가 덮는 자리입니다</span>
        ) : null}
      </div>

      {subtitleHidden ? (
        <p role="status" className="mt-stack-tight break-keep text-caption text-warning">
          이 자막은 게시 화면의 아래 버튼줄에 가립니다. 자막을 줄이거나 문장을 짧게 하십시오.
        </p>
      ) : null}
      {!renderReady ? (
        <p className="mt-stack-tight break-keep text-caption text-subtle">
          {kind === "card" ? "아직 실제 이미지가 나오기 전이라 카드 글자와 위치만 보여 드립니다." : "아직 실제 파일이 나오기 전이라 장면과 자막 배치만 보여 드립니다. 위치와 잘림은 이 화면 그대로입니다."}
        </p>
      ) : null}
    </section>
  );
}
