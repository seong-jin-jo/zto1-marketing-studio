// PR #85 재검증 E2E 하네스 진입점. 인증·dev 서버·DB 없이 CardDeckPanel 한 컴포넌트만
// 실제 브라우저(Playwright)에 띄운다 — 리뷰어 탐침 probe3.mjs/ime2.mjs가 쓴 방식을
// 그대로 레포에 들여왔다(scripts/verify-bubble-editor-toolbar-e2e.mjs가 이 파일을 빌드해 쓴다).
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CardDeckPanel } from "@/components/studio/BubbleEditor";
import { wrapSegments } from "@/lib/studio/card-templates/chat-bubble";
import type { Segment } from "@/lib/studio/card-deck-contract";
import deckJson from "../../../tests/studio/fixtures/deck-d100.v2.json";

declare global {
  interface Window {
    __deck: unknown;
    __changes: number;
    // MAJOR 회귀(4차 재검증): 발행 PNG가 실제로 쓰는 그 줄바꿈 함수를 편집실 E2E가
    // 직접 불러 "화면 줄 수 == PNG 줄 수"를 검증한다 — 재구현이 아니라 그 함수 자체를
    // 그대로 쓴다.
    __wrapSegmentsLineCount: (segments: Segment[]) => number;
  }
}

function App() {
  const [deck, setDeck] = useState(() => JSON.parse(JSON.stringify(deckJson)));
  window.__deck = deck;
  window.__changes = window.__changes ?? 0;
  return (
    <CardDeckPanel
      deck={deck}
      onDeckChange={(next) => {
        window.__changes += 1;
        window.__deck = next;
        setDeck(next);
      }}
    />
  );
}

window.__wrapSegmentsLineCount = (segments) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context를 못 만들었다");
  // 글자 크기·최대 폭은 줄바꿈(word-wrap)이 안 끼어들게 넉넉히 준다 — 이 검증이 보는
  // 것은 "\n" 강제 줄바꿈 개수지 폭에 의한 자동 줄바꿈이 아니다.
  return wrapSegments(ctx, segments, 24, 5000).length;
};

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");
createRoot(rootEl).render(<App />);
