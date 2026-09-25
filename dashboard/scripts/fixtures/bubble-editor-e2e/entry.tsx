// PR #85 재검증 E2E 하네스 진입점. 인증·dev 서버·DB 없이 CardDeckPanel 한 컴포넌트만
// 실제 브라우저(Playwright)에 띄운다 — 리뷰어 탐침 probe3.mjs/ime2.mjs가 쓴 방식을
// 그대로 레포에 들여왔다(scripts/verify-bubble-editor-toolbar-e2e.mjs가 이 파일을 빌드해 쓴다).
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CardDeckPanel } from "@/components/studio/BubbleEditor";
import deckJson from "../../../tests/studio/fixtures/deck-d100.v2.json";

declare global {
  interface Window {
    __deck: unknown;
    __changes: number;
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

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");
createRoot(rootEl).render(<App />);
