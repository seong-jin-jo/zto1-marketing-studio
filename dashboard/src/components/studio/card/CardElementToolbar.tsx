import { Button } from "@/components/shared/Button";
import { CARD_FONT_FAMILIES, CARD_TEXT_BACKGROUND_DEFAULT_COLOR, type CardElement, type TextElement } from "@/lib/studio/card-element-contract";
import type { LayerDirection } from "@/lib/studio/card-element-commands";
import styles from "./CardCanvasEditor.module.css";

export function CardElementToolbar({
  element,
  onTextChange,
  onGeometryChange,
  onLayer,
  onDuplicate,
  onDelete,
}: {
  element: CardElement;
  onTextChange: (patch: { text?: string; style?: Partial<TextElement["style"]> }) => void;
  onGeometryChange: (patch: Partial<Pick<CardElement, "width" | "height" | "rotation">>) => void;
  onLayer: (direction: LayerDirection) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.contextToolbar} data-card-element-toolbar>
      <div className={styles.floatingToolbar} role="toolbar" aria-label={`${element.name} 도구`}>
        {element.type === "text" ? (
          <>
          <label className={`${styles.toolbarField} ${styles.fontField}`}><span>글꼴</span><select value={element.style.font_family} aria-label="글꼴" onChange={(event) => onTextChange({ style: { font_family: event.target.value as TextElement["style"]["font_family"] } })}>{CARD_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
          <label className={`${styles.toolbarField} ${styles.sizeField}`}><span>크기</span><input type="number" min={8} max={240} value={element.style.font_size} aria-label="글자 크기" onChange={(event) => {
            if (event.target.value === "") return;
            onTextChange({ style: { font_size: Math.min(240, Math.max(8, Number(event.target.value))) } });
          }} /></label>
          <label className={styles.colorField}><span>글자</span><input type="color" value={element.style.color.slice(0, 7)} aria-label="글자 색" onChange={(event) => onTextChange({ style: { color: event.target.value as `#${string}` } })} /></label>
          <label className={styles.colorField}><span>배경</span><input type="color" value={(element.style.background_color === "transparent" ? CARD_TEXT_BACKGROUND_DEFAULT_COLOR : element.style.background_color ?? CARD_TEXT_BACKGROUND_DEFAULT_COLOR).slice(0, 7)} aria-label="글 배경색" onChange={(event) => onTextChange({ style: { background_color: event.target.value as `#${string}` } })} /></label>
          <Button size="sm" aria-label="배경 없음" title="배경 없음" aria-pressed={!element.style.background_color || element.style.background_color === "transparent"} onClick={() => onTextChange({ style: { background_color: "transparent" } })}>없음</Button>
          <Button size="sm" aria-pressed={element.style.font_weight >= 700} onClick={() => onTextChange({ style: { font_weight: element.style.font_weight >= 700 ? 400 : 700 } })}>굵게</Button>
          <label className={`${styles.toolbarField} ${styles.alignField}`}><span>정렬</span><select aria-label="글 정렬" value={element.style.align} onChange={(event) => onTextChange({ style: { align: event.target.value as TextElement["style"]["align"] } })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
          </>
        ) : null}
        <Button size="sm" aria-label="뒤로 한 층" onClick={() => onLayer("backward")}>뒤로</Button>
        <Button size="sm" aria-label="앞으로 한 층" onClick={() => onLayer("forward")}>앞으로</Button>
        <Button size="sm" onClick={onDuplicate}>복제</Button>
        <Button size="sm" variant="danger" onClick={onDelete}>삭제</Button>
      </div>
      <details className={styles.geometryDetails} data-card-geometry-details>
        <summary>크기·회전</summary>
        <div className={styles.geometryFields}>
          <label className={styles.toolbarField}><span>너비</span><input type="number" min={4} value={element.width} aria-label="요소 너비" onChange={(event) => {
            if (event.target.value === "") return;
            onGeometryChange({ width: Math.max(4, Number(event.target.value)) });
          }} /></label>
          <label className={styles.toolbarField}><span>높이</span><input type="number" min={4} value={element.height} aria-label="요소 높이" onChange={(event) => {
            if (event.target.value === "") return;
            onGeometryChange({ height: Math.max(4, Number(event.target.value)) });
          }} /></label>
          <label className={styles.toolbarField}><span>각도</span><input type="number" min={-180} max={180} value={element.rotation} aria-label="요소 각도" onChange={(event) => {
            if (event.target.value === "") return;
            onGeometryChange({ rotation: Math.min(180, Math.max(-180, Number(event.target.value))) });
          }} /><span aria-hidden="true">°</span></label>
          <Button size="sm" aria-label="맨 뒤로" onClick={() => onLayer("back")}>맨 뒤로</Button>
          <Button size="sm" aria-label="맨 앞으로" onClick={() => onLayer("front")}>맨 앞으로</Button>
        </div>
      </details>
    </div>
  );
}
