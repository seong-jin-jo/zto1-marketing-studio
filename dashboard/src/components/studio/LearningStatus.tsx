"use client";

import { useEffect, useState } from "react";
import { LEARNING_SLOT_TOTAL } from "./learning-info";

// 헤더 학습 정보. 회장 지적 "왜 헤더에 학습 정보가 사라짐?"의 자리다.
// 네 방 어디에 있든 항상 보이고, 얼마나 찼는지가 숫자와 막대로 같이 보인다.
// 문답을 안 채우고 닫으면 한 번만 깜빡인다. 상시 깜빡임은 잔소리가 된다.

export function LearningStatus({
  filled,
  onOpen,
  flashToken = 0,
}: {
  filled: number;
  onOpen: () => void;
  /** 값이 바뀔 때마다 한 번 깜빡인다. 문답을 덜 채우고 닫은 순간에만 올린다. */
  flashToken?: number;
}) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!flashToken) return;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), 1600);
    return () => clearTimeout(timer);
  }, [flashToken]);

  const done = filled >= LEARNING_SLOT_TOTAL;
  const remaining = Math.max(0, LEARNING_SLOT_TOTAL - filled);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-learning-status={filled}
      data-learning-flash={flashing ? "on" : undefined}
      aria-label={done
        ? `학습 정보 ${filled} / ${LEARNING_SLOT_TOTAL}칸 채움. 모두 채움`
        : `학습 정보 ${filled} / ${LEARNING_SLOT_TOTAL}칸 채움. 남은 ${remaining}칸 이어 채우기`}
      title={done ? "학습 정보를 모두 채웠습니다" : `남은 ${remaining}칸을 이어서 채웁니다`}
      className={`inline-flex min-h-control-touch items-center gap-stack-tight rounded-control border px-stack text-body-sm font-semibold ${
        flashing ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted hover:bg-surface"
      }`}
    >
      <span>학습 정보</span>
      <span className={done ? "text-success" : "text-accent"}>
        {filled} / {LEARNING_SLOT_TOTAL}
      </span>
      <span className="text-caption text-muted">
        {done ? "모두 채움" : `남은 ${remaining}칸 이어 채우기`}
      </span>
      <progress
        className="progress-semantic w-16"
        max={LEARNING_SLOT_TOTAL}
        value={filled}
        aria-hidden="true"
      />
    </button>
  );
}
