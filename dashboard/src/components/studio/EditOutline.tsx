"use client";

import { DeliveredMedia } from "@/components/studio/DeliveredMedia";
import styles from "./EditOutline.module.css";

/**
 * 편집실 왼쪽 176px 목차 칸의 내용물.
 *
 * DESIGN.md §4 「편집실 3영역 골격(v65)」이 `.edit-outline` 을 176px 세로 칸으로 이미
 * 계약했고 `EditOutline` 을 컴포넌트 인벤토리에 등록까지 해 뒀다. 그런데 그 칸에는
 * `1. 첫 장` 같은 글자 목록만 있었고, 장을 옮기려면 미리보기 아래 `앞 장`·`다음 장`
 * 화살표를 여러 번 눌러야 했다. 카드뉴스는 장과 장의 흐름이 곧 상품인데 그 흐름이
 * 화면에 없었다(설계문서 osmu-four-room-ux-uplift-v1.0 §2.1).
 *
 * 그래서 새 칸을 만들지 않고 이미 있는 집을 채운다. 썸네일과 순번, 누르면 바로 이동,
 * 순서 바꾸기, 추가와 삭제, 표지·마무리 배지까지 이 칸 안에서 끝낸다.
 *
 * 새 색·새 글꼴·새 간격·새 radius·새 상태를 만들지 않았다. 선택 표현은 사이드바
 * 관습(--accent-soft 배경 + 왼쪽 --accent 2px 선)을 그대로 계승한다.
 */
export function EditOutline({
  title,
  unit,
  lines,
  activeIndex,
  onSelect,
  visibleLines,
  thumbnails,
  tenantId,
  showRoles = false,
  note,
  onMove,
  onMoveTo,
  onAdd,
  onRemove,
}: {
  /** 칸 제목. 형식마다 다르다(글 문단 · 카드 목록 · 영상 장면 · 대사 목록) */
  title: string;
  /** 세는 단위. 장 · 문단 · 장면 · 대사 */
  unit: string;
  lines: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** 빼기로 감춘 장. 목록에서도 그렇게 보여야 왜 결과에 없는지 안다. */
  visibleLines?: boolean[];
  /** 장마다 다른 그림 주소. 카드뉴스처럼 한 벌이 여러 장인 형식에서만 들어온다. */
  thumbnails?: (string | undefined)[];
  /** 만료된 배달 주소를 되살릴 작업 공간 */
  tenantId?: string;
  /** 첫 장 `표지`, 끝 장 `마무리` 배지를 달지 */
  showRoles?: boolean;
  /** 목록 아래 정직 고지 한 줄 */
  note?: string;
  onMove?: (index: number, delta: number) => void;
  /**
   * 끌어서 놓기로 먼 자리까지 한 번에 옮긴다.
   *
   * 회장 확정 D-2026-09-09-1: "직접 문구 수정이나 드래그앤 드롭정도는 할수있는거지.
   * 프롬프팅보다 편하니까." 다만 끌기만 두면 키보드와 보조기기에서 순서를 못 바꾼다.
   * 그래서 ▲▼ 단추를 함께 남긴다. 같은 일을 두 길로 할 수 있게 두는 것이다.
   */
  onMoveTo?: (from: number, to: number) => void;
  onAdd?: () => void;
  onRemove?: (index: number) => void;
}) {
  const count = lines.length;
  return (
    <>
      <div className="flex items-baseline justify-between gap-stack-tight">
        <b className="text-body text-text">{title}</b>
        <span className="text-caption text-subtle" data-outline-count>{count}{unit}</span>
      </div>
      <ol className={`mt-stack ${styles.items}`}>
        {lines.map((line, index) => {
          const active = index === activeIndex;
          const hidden = visibleLines?.[index] === false;
          // 순서를 바꾸면 역할도 따라온다. 첫 장이 표지이고 끝 장이 마무리다.
          const role = showRoles && count > 1 ? (index === 0 ? "표지" : index === count - 1 ? "마무리" : "") : "";
          const thumbUrl = thumbnails?.[index];
          return (
            <li key={`outline-${index}`}>
              <button
                type="button"
                data-outline-item={index}
                aria-current={active ? "true" : "false"}
                aria-label={`${index + 1}번째 ${unit} 고르기`}
                onClick={() => onSelect(index)}
                draggable={Boolean(onMoveTo)}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
                onDragOver={(event) => { if (onMoveTo) event.preventDefault(); }}
                onDrop={(event) => {
                  if (!onMoveTo) return;
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(from)) onMoveTo(from, index);
                }}
                className={`${styles.item} ${active ? styles.itemActive : ""} ${hidden ? styles.itemHidden : ""}`}
              >
                {thumbUrl ? (
                  <DeliveredMedia
                    type="image"
                    src={thumbUrl}
                    tenantId={tenantId}
                    alt={`${index + 1}번째 ${unit} 미리보기`}
                    className={styles.thumb}
                    dataAttr={{ "data-outline-thumb": String(index) }}
                  />
                ) : (
                  <span aria-hidden="true" className={`${styles.thumb} ${styles.thumbFallback} text-caption`}>{index + 1}</span>
                )}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-micro">
                    <span className="text-caption font-bold text-subtle">{index + 1}</span>
                    {role ? (
                      <span
                        data-outline-role={role}
                        className={`rounded-chip px-micro text-caption font-bold ${role === "표지" ? "bg-accent-soft text-accent" : "bg-success-soft text-success"}`}
                      >
                        {role}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-micro block break-keep text-caption text-muted">{line.trim() || `빈 ${unit}`}</span>
                </span>
              </button>
              {active && (onMove || onRemove) ? (
                <div className={styles.controls} data-outline-controls={index}>
                  {onMove ? (
                    <>
                      <button type="button" className={styles.control} data-outline-up={index} aria-label={`${index + 1}번째 ${unit}을 위로`} disabled={index === 0} onClick={() => onMove(index, -1)}>▲</button>
                      <button type="button" className={styles.control} data-outline-down={index} aria-label={`${index + 1}번째 ${unit}을 아래로`} disabled={index === count - 1} onClick={() => onMove(index, 1)}>▼</button>
                    </>
                  ) : null}
                  {onRemove ? (
                    <button type="button" className={styles.control} data-outline-remove={index} aria-label={`${index + 1}번째 ${unit} 삭제`} disabled={count <= 1} onClick={() => onRemove(index)}>삭제</button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {onAdd ? (
        <button type="button" className={styles.action} data-outline-add onClick={onAdd}>목록 끝에 {unit} 추가</button>
      ) : null}
      {note ? <p className="mt-stack break-keep text-caption text-subtle" data-outline-note>{note}</p> : null}
    </>
  );
}
