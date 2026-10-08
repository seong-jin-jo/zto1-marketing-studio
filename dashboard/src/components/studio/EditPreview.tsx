"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import type { EditContentKind } from "./StudioRooms";
import styles from "./EditPreview.module.css";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";
import { cardPositionFromPoint } from "@/lib/studio/text-card-image";

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

const CARD_POSITION_GRID: readonly (readonly CardTextPosition[])[] = [
  ["top-left", "top-center", "top-right"],
  ["center-left", "center", "center-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
] as const;

function nudgeCardTextPosition(position: CardTextPosition, key: string): CardTextPosition {
  const row = CARD_POSITION_GRID.findIndex((items) => items.includes(position));
  const column = CARD_POSITION_GRID[row]?.indexOf(position) ?? 1;
  if (key === "ArrowUp") return CARD_POSITION_GRID[Math.max(0, row - 1)][column];
  if (key === "ArrowDown") return CARD_POSITION_GRID[Math.min(CARD_POSITION_GRID.length - 1, row + 1)][column];
  if (key === "ArrowLeft") return CARD_POSITION_GRID[row][Math.max(0, column - 1)];
  if (key === "ArrowRight") return CARD_POSITION_GRID[row][Math.min(CARD_POSITION_GRID[row].length - 1, column + 1)];
  return position;
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
  mediaUrl,
  mediaUrls,
  mediaType = "image",
  cardTextEmbedded = false,
  cardEditingLocked = false,
  tenantId,
  onLinesChange,
  cardTextPositions = [],
  onCardTextPositionsChange,
  aspectRatio,
  onAspectRatioChange,
  stageSize = "default",
}: {
  kind: EditContentKind;
  /** 화면에 남아 있는 대사만 넘긴다 */
  lines: string[];
  activeLine: number;
  onActiveLine: (index: number) => void;
  subtitleSize?: string;
  /** 실제 미디어 파일이 나왔는지 */
  renderReady?: boolean;
  /**
   * 생성실에서 방금 만든 산출물 주소.
   *
   * 2026-09-08 회장 실사용: "생성한 다음 편집실 가면 카드뉴스 영상 아무것도 안 나온다".
   * 편집실은 준비 여부(참거짓)만 받고 산출물 주소를 아예 못 받고 있었다. 그래서 무엇을
   * 만들었든 "여기에 화면이 놓입니다"라는 자리표시자만 그렸다. 만든 것을 보면서 고치는
   * 방이 정작 만든 것을 안 보여 준 셈이다.
   */
  mediaUrl?: string;
  /**
   * 장마다 다른 산출물 주소. 카드뉴스처럼 한 벌이 여러 장인 형식에서 쓴다.
   *
   * 2026-09-14 실측: 카드 3장을 만들어도 편집실은 대표 한 장만 받아 어느 장을 눌러도
   * 같은 그림이었다. 고른 장의 그림이 있으면 그것을 먼저 그린다.
   */
  mediaUrls?: string[];
  /** mediaUrl 이 실제로 무엇인지. 영상 편집 중에도 바탕 이미지를 보여 줄 수 있으므로
   *  화면 종류가 아니라 파일 종류로 태그를 고른다. */
  mediaType?: "image" | "video";
  /**
   * true면 카드 문구가 PNG 픽셀에 이미 포함돼 있다.
   *
   * v70 §3의 카드 무대는 실제 발행 PNG와 같은 한 벌이어야 한다. 무료 글자 카드 위에
   * textarea를 한 벌 더 얹으면 같은 문장이 두 번 보이고, 화면과 발행물도 달라진다.
   * 일반 생성 이미지는 글자 없는 배경이므로 false를 유지해 기존 편집 레이어를 보존한다.
   */
  cardTextEmbedded?: boolean;
  /** 원본 대본·위치가 없어 기존 PNG를 보존해야 하는 카드는 편집 조작을 막는다. */
  cardEditingLocked?: boolean;
  /**
   * 만료된 배달 주소를 되살릴 때 어느 작업 공간으로 다시 서명할지.
   *
   * 2026-09-13. 여기는 `DeliveredMedia` 를 쓰면서도 이것만 안 넘기고 있었다. 운영자 토큰으로
   * 들어온 요청은 본문의 작업 공간 식별자가 유일한 단서라(tenant-auth.ts effectiveTenantId),
   * 없으면 재서명이 401 로 닫힌다. 되살리는 부품을 써 놓고도 못 되살리는 상태였다.
   */
  tenantId?: string;
  onLinesChange?: (lines: string[]) => void;
  cardTextPositions?: CardTextPosition[];
  onCardTextPositionsChange?: (positions: CardTextPosition[]) => void;
  aspectRatio?: string;
  onAspectRatioChange?: (aspectRatio: string) => void;
  /** v70 카드 편집실은 520px 무대를 쓴다. 다른 레거시 미리보기 폭은 그대로 둔다. */
  stageSize?: "default" | "card-v70";
}) {
  const specs = useMemo(() => PREVIEW_SPECS.filter((spec) => (
    spec.kinds.includes(kind) && (stageSize !== "card-v70" || spec.key === "card-portrait")
  )), [kind, stageSize]);
  const matchingSpec = specs.find((one) => one.ratio.replaceAll(" ", "").replace("/", ":") === aspectRatio);
  const [specKey, setSpecKey] = useState(matchingSpec?.key ?? specs[0]?.key ?? "shorts");
  useEffect(() => {
    setSpecKey(matchingSpec?.key ?? specs[0]?.key ?? "shorts");
  }, [matchingSpec?.key, specs]);
  const spec = specs.find((one) => one.key === specKey) ?? specs[0] ?? PREVIEW_SPECS[0];
  const line = lines[activeLine] ?? lines[0] ?? "";
  const unit = kind === "card" ? "장" : kind === "text" ? "문단" : "장면";
  const cardPosition = cardTextPositions[activeLine] ?? "center";
  const activeMediaUrl = mediaUrls?.[activeLine] ?? mediaUrl;
  const movingCardText = useRef(false);
  // 자막이 아래 UI가 덮는 자리 안으로 들어가면 실제 업로드 화면에서 가린다.
  const subtitleHidden = spec.safeBottom >= 20 && (subtitleSize === "크게" || line.length > 34);

  return (
    <section aria-label="올릴 규격으로 미리보기" data-edit-preview={spec.key} className="min-w-0">
      <div className="mb-stack flex flex-wrap items-center gap-stack-tight" role="group" aria-label="콘텐츠 크기 고르기">
        {specs.map((one) => (
          <Button key={one.key} size="sm" variant="secondary" data-content-size-option={one.key} disabled={kind === "card" && cardEditingLocked} className={one.key === spec.key ? "border-accent bg-accent-soft text-accent" : ""} aria-pressed={one.key === spec.key} onClick={() => {
            setSpecKey(one.key);
            onAspectRatioChange?.(one.ratio.replaceAll(" ", "").replace("/", ":"));
          }}>
            {one.label}
          </Button>
        ))}
        <span className="ml-auto text-caption text-subtle" data-edit-preview-size>{spec.size}픽셀</span>
      </div>

      <div className={`grid place-items-center rounded-surface border border-border bg-surface-2 p-stack ${stageSize === "card-v70" ? styles.cardV70StageShell : ""}`} data-edit-preview-stage-shell>
        <div
          className={`relative overflow-hidden rounded-control ${stageSize === "card-v70" ? `${styles.cardStageFrame} ${styles.cardV70Canvas}` : "w-full max-w-sm bg-accent-soft"} ${RATIO_CLASS[spec.ratio]}`}
          data-edit-preview-frame={spec.ratio}
          data-card-canvas={kind === "card" ? "true" : undefined}
          onPointerUp={(event) => {
            if (kind !== "card" || !movingCardText.current || !onCardTextPositionsChange) return;
            movingCardText.current = false;
            const next = lines.map((_, index) => cardTextPositions[index] ?? "center");
            const bounds = event.currentTarget.getBoundingClientRect();
            const relX = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0.5;
            const relY = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0.5;
            next[activeLine] = cardPositionFromPoint(relX, relY);
            onCardTextPositionsChange(next);
          }}
        >
          {spec.safeTop > 0 ? (
            <div aria-hidden="true" className={`absolute inset-x-0 top-0 border-b border-dashed border-border bg-surface/40 ${SAFE_AREA_HEIGHT_CLASS[spec.safeTop]}`} />
          ) : null}
          {spec.safeBottom > 0 ? (
            <div aria-hidden="true" className={`absolute inset-x-0 bottom-0 border-t border-dashed border-border bg-surface/40 ${SAFE_AREA_HEIGHT_CLASS[spec.safeBottom]}`} />
          ) : null}

          {/* 만든 것을 배경으로 깔고 그 위에 글자와 자막을 얹는다. 실제 결과에 가깝게 보여야
              무엇을 고칠지 판단할 수 있다. 종전에는 이 자리가 비어 "여기에 화면이 놓입니다"
              라는 자리표시자만 있었다(2026-09-08 회장 실사용). */}
          {activeMediaUrl ? (
            <DeliveredMedia
              type={mediaType === "video" ? "video" : "image"}
              src={activeMediaUrl}
              tenantId={tenantId}
              alt="방금 만든 산출물 미리보기"
              dataAttr={{ "data-edit-preview-media": mediaType === "video" ? "video" : "image" }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}

          {kind === "card" ? (cardTextEmbedded ? null : (
            <div
              className={`absolute z-10 w-4/5 rounded-control border border-border p-stack shadow-lg ${stageSize === "card-v70" ? styles.cardV70TextOverlay : styles.cardTextOverlay} ${CARD_POSITION_CLASS[cardPosition]}`}
              data-card-text-position={cardPosition}
              aria-label="카드 글자 직접 끌어 옮기기"
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
              role="group"
              tabIndex={cardEditingLocked ? -1 : 0}
              onKeyDown={(event) => {
                if (cardEditingLocked || !onCardTextPositionsChange || !event.key.startsWith("Arrow")) return;
                const nextPosition = nudgeCardTextPosition(cardPosition, event.key);
                if (nextPosition === cardPosition) return;
                event.preventDefault();
                const next = lines.map((_, index) => cardTextPositions[index] ?? "center");
                next[activeLine] = nextPosition;
                onCardTextPositionsChange(next);
              }}
              onPointerDown={(event) => {
                if (cardEditingLocked || event.target instanceof HTMLTextAreaElement) return;
                movingCardText.current = true;
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
            >
              <textarea
                aria-label={`카드 ${activeLine + 1} 글자`}
                data-card-face-copy
                value={line}
                rows={3}
                onChange={(event) => {
                  const next = lines.map((value, index) => index === activeLine ? event.target.value : value);
                  onLinesChange?.(next);
                }}
                className={`min-h-control-touch w-full resize-none rounded-control border p-stack text-center text-body font-bold ${styles.cardTextInput}`}
              />
            </div>
          )) : kind === "video" && mediaType === "video" && activeMediaUrl ? null : (
            // 2026-09-21 회장 지적: 영상 탭에서 "재생도 안 된다". 원인은 이 자리표시 레이어가
            // 영상 유무와 상관없이 항상 그려져 DeliveredMedia 가 그리는 영상 재생 컨트롤 위를
            // absolute inset-0 로 덮고 있었던 것이다(포인터 이벤트가 이 div 로 먼저 잡혀
            // 재생·탐색 버튼을 못 눌렀다). 실제로 영상 태그가 그려질 때(mediaType==="video")만
            // 이 레이어를 렌더하지 않아 재생 화면이 최상위에서 클릭을 받게 한다. 영상 편집 중
            // 바탕 이미지만 있을 때(mediaType==="image")는 영상 태그가 없으므로 이 레이어가
            // 계속 "아직 영상이 없습니다" 안내를 보여준다(교차 리뷰 PR #66 minor 5).
            <div className="absolute inset-0 grid place-items-center p-pad-inset text-center">
              <div className="min-w-0">
                <span className="text-caption font-semibold text-accent">
                  {renderReady ? "미리보기" : `${unit} ${activeLine + 1}`}
                </span>
                {/* 영상과 카드뉴스는 같은 문장을 아래 자막이 이미 들고 있다. 가운데는 화면에 무엇이 놓이는지만 말한다. */}
                <p className="mt-stack break-keep text-body font-bold text-text">
                  {kind === "video"
                    ? `아직 영상이 없습니다. 생성실에서 "숏폼 영상 만들기"를 누르면 여기서 재생됩니다.`
                    : line
                      ? `여기에 ${unit} 화면이 놓입니다`
                      : `이 ${unit}은 비어 있습니다`}
                </p>
              </div>
            </div>
          )}

          {kind === "video" ? (
            // pointer-events-none: 표시 전용 오버레이다. 1:1·16:9 처럼 아래 여백이 없는 규격에서는
            // 이 p가 실제 영상 재생 컨트롤 바(크롬 기준 약 48px) 위에 겹치는데, 이벤트를 흡수하면
            // 재생·탐색 버튼을 못 누른다(교차 리뷰 PR #66 MAJOR 3).
            <p
              data-edit-preview-subtitle={subtitleHidden ? "가림" : "보임"}
              className={`pointer-events-none absolute inset-x-0 px-stack text-center font-semibold text-text ${SUBTITLE_CLASS[subtitleSize] || "text-body-sm"} ${SUBTITLE_BOTTOM_CLASS[Math.max(spec.safeBottom, 6) + 2]}`}
            >
              {line}
            </p>
          ) : null}
        </div>
      </div>

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
