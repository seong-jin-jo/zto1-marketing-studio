import { Button } from "@/components/shared/Button";
import type { CardElement } from "@/lib/studio/card-element-contract";
import type { LayerDirection } from "@/lib/studio/card-element-commands";
import styles from "./CardCanvasEditor.module.css";

export function CardElementList({
  elements,
  selectedId,
  onSelect,
  onMove,
  onLayer,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  elements: CardElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onLayer: (id: string, direction: LayerDirection) => void;
  onToggle: (id: string, flag: "hidden" | "locked") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className={styles.elementList} aria-labelledby="card-element-list-title" data-card-element-list>
      <h3 id="card-element-list-title">요소</h3>
      {elements.length === 0 ? <p>추가한 요소가 없습니다.</p> : (
        <ol>
          {[...elements].sort((left, right) => right.z_index - left.z_index).map((element) => (
            <li key={element.id} data-selected={selectedId === element.id} data-element-list-item={element.id}>
              <Button size="sm" className={styles.elementName} aria-pressed={selectedId === element.id} onClick={() => onSelect(element.id)}>{element.name}</Button>
              <div className={styles.listActions} aria-label={`${element.name} 조작`}>
                <Button size="sm" aria-label={`${element.name} 왼쪽 이동`} onClick={() => onMove(element.id, -10, 0)}>←</Button>
                <Button size="sm" aria-label={`${element.name} 오른쪽 이동`} onClick={() => onMove(element.id, 10, 0)}>→</Button>
                <Button size="sm" aria-label={`${element.name} 위 이동`} onClick={() => onMove(element.id, 0, -10)}>↑</Button>
                <Button size="sm" aria-label={`${element.name} 아래 이동`} onClick={() => onMove(element.id, 0, 10)}>↓</Button>
                <Button size="sm" aria-label={`${element.name} 앞으로`} onClick={() => onLayer(element.id, "forward")}>앞</Button>
                <Button size="sm" aria-label={`${element.name} 뒤로`} onClick={() => onLayer(element.id, "backward")}>뒤</Button>
                <Button size="sm" aria-label={`${element.name} ${element.hidden ? "보이기" : "숨기기"}`} aria-pressed={element.hidden} onClick={() => onToggle(element.id, "hidden")}>{element.hidden ? "보이기" : "숨기기"}</Button>
                <Button size="sm" aria-label={`${element.name} ${element.locked ? "잠금 풀기" : "잠금"}`} aria-pressed={element.locked} onClick={() => onToggle(element.id, "locked")}>{element.locked ? "잠금 풀기" : "잠금"}</Button>
                <Button size="sm" aria-label={`${element.name} 복제`} onClick={() => onDuplicate(element.id)}>복제</Button>
                <Button size="sm" variant="danger" aria-label={`${element.name} 삭제`} onClick={() => onDelete(element.id)}>삭제</Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
