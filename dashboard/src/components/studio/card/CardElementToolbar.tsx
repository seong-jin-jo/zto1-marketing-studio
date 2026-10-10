import { Button } from "@/components/shared/Button";
import { CARD_FONT_FAMILIES, type CardElement, type TextElement } from "@/lib/studio/card-element-contract";
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
    <div className={styles.floatingToolbar} role="toolbar" aria-label={`${element.name} 도구`} data-card-element-toolbar>
      {element.type === "text" ? (
        <>
          <label className={styles.toolbarField}>글꼴<select value={element.style.font_family} aria-label="글꼴" onChange={(event) => onTextChange({ style: { font_family: event.target.value as TextElement["style"]["font_family"] } })}>{CARD_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
          <label className={styles.toolbarField}>글자 크기<input type="number" min={8} max={240} value={element.style.font_size} aria-label="글자 크기" onChange={(event) => {
            if (event.target.value === "") return;
            onTextChange({ style: { font_size: Math.min(240, Math.max(8, Number(event.target.value))) } });
          }} /></label>
          <label className={styles.colorField}>색<input type="color" value={element.style.color.slice(0, 7)} aria-label="글자 색" onChange={(event) => onTextChange({ style: { color: event.target.value as `#${string}` } })} /></label>
          <label className={styles.colorField}>배경<input type="color" value={(element.style.background_color === "transparent" ? "#FFFFFF" : element.style.background_color ?? "#FFFFFF").slice(0, 7)} aria-label="글 배경색" onChange={(event) => onTextChange({ style: { background_color: event.target.value as `#${string}` } })} /></label>
          <Button size="sm" aria-pressed={!element.style.background_color || element.style.background_color === "transparent"} onClick={() => onTextChange({ style: { background_color: "transparent" } })}>배경 없음</Button>
          <Button size="sm" aria-pressed={element.style.font_weight >= 700} onClick={() => onTextChange({ style: { font_weight: element.style.font_weight >= 700 ? 400 : 700 } })}>굵게</Button>
          {(["left", "center", "right"] as const).map((align) => {
            const label = align === "left" ? "왼쪽" : align === "center" ? "가운데" : "오른쪽";
            return <Button key={align} size="sm" aria-label={`${label} 정렬`} aria-pressed={element.style.align === align} onClick={() => onTextChange({ style: { align } })}>{label}</Button>;
          })}
        </>
      ) : null}
      <label className={styles.toolbarField}>너비<input type="number" min={4} value={element.width} aria-label="요소 너비" onChange={(event) => {
        if (event.target.value === "") return;
        onGeometryChange({ width: Math.max(4, Number(event.target.value)) });
      }} /></label>
      <label className={styles.toolbarField}>높이<input type="number" min={4} value={element.height} aria-label="요소 높이" onChange={(event) => {
        if (event.target.value === "") return;
        onGeometryChange({ height: Math.max(4, Number(event.target.value)) });
      }} /></label>
      <label className={styles.toolbarField}>각도<input type="number" min={-180} max={180} value={element.rotation} aria-label="요소 각도" onChange={(event) => {
        if (event.target.value === "") return;
        onGeometryChange({ rotation: Math.min(180, Math.max(-180, Number(event.target.value))) });
      }} /><span aria-hidden="true">°</span></label>
      <Button size="sm" aria-label="맨 뒤로" onClick={() => onLayer("back")}>맨 뒤</Button>
      <Button size="sm" aria-label="뒤로 한 층" onClick={() => onLayer("backward")}>뒤로</Button>
      <Button size="sm" aria-label="앞으로 한 층" onClick={() => onLayer("forward")}>앞으로</Button>
      <Button size="sm" aria-label="맨 앞으로" onClick={() => onLayer("front")}>맨 앞</Button>
      <Button size="sm" onClick={onDuplicate}>복제</Button>
      <Button size="sm" variant="danger" onClick={onDelete}>삭제</Button>
    </div>
  );
}
