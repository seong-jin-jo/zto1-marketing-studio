/**
 * N1·N2·J4 회귀(2026-09-22 코드리뷰 2차). `studio/page.tsx`의 `scheduleEditAutosave`는
 * React 클로저 안에 있어 직접 import해 단위 테스트할 수 없다(이 레포의 다른 page.tsx
 * 로직 테스트도 같은 이유로 소스 슬라이스 방식을 쓴다 — pr4-remaining-wiring.test.tsx).
 * 그래서 두 층으로 검증한다.
 *
 * ① 여기서는 `scheduleEditAutosave`가 실제로 호출하는 순수 함수들(pruneEmptyBubbles·
 *    emptyBubbleSlideNumber·sanitizeForSave)을 그 함수가 쓰는 것과 같은 순서·같은 방식으로
 *    호출해, "카드덱에 빈 말풍선 장이 있어도 영상 저장 페이로드는 영향을 안 받는다"는
 *    핵심 불변식을 직접 검증한다(N1·J4). 이 로직이 page.tsx 안에서 바뀌어도 여기 쓴
 *    시뮬레이션과 실제 소스가 같은 구조를 쓰는지는 ②가 잡는다.
 * ② `page.tsx` 소스에서 scheduleEditAutosave 본문을 슬라이스해 ①이 흉내 낸 분기
 *    구조(빈 슬라이드면 deckForSave를 안 실음 + editForSave는 그대로 감)가 실제로
 *    있는지 문자열로 대조한다.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { pruneEmptyBubbles, emptyBubbleSlideNumber } from "@/lib/studio/card-deck-ops";
import { addOverlay, emptyVideoEdit, sanitizeForSave, addComment, validateVideoEdit, type VideoEdit } from "@/lib/studio/video-edit-contract";
import { validateCardDeck, type CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * scheduleEditAutosave의 결정 로직을 그대로 흉내 낸다(page.tsx 발췌와 동일 순서).
 * 실제 page.tsx가 이 구조를 유지하는지는 아래 "구조 대조" describe가 잡는다.
 */
function decideSavePayload(deckToSave: CardDeck | null, editToSave: VideoEdit | null) {
  let deckForSave: CardDeck | null = null;
  let holdMessage = "";
  if (deckToSave) {
    const pruned = pruneEmptyBubbles(deckToSave);
    const emptySlide = emptyBubbleSlideNumber(pruned);
    if (emptySlide !== null) {
      holdMessage = `${emptySlide}번 장에 말풍선이 비어 있어 카드덱 자동 저장을 보류했습니다. 내용을 채우면 저장됩니다.`;
    } else {
      deckForSave = pruned;
    }
  }
  let editForSave: VideoEdit | null = null;
  if (editToSave) {
    const { deck: sanitized, droppedCount } = sanitizeForSave(editToSave);
    editForSave = sanitized;
    if (droppedCount > 0) {
      const note = "빈 문구·작성자 항목은 채울 때까지 저장에서 빠집니다.";
      holdMessage = holdMessage ? `${holdMessage} ${note}` : note;
    }
  }
  return { deckForSave, editForSave, holdMessage };
}

describe("N1·J4 회귀: 카드덱이 빈 말풍선으로 보류돼도 같은 배치의 영상 편집은 저장된다", () => {
  it("빈 말풍선 카드덱 + 영상 오버레이가 같은 800ms 배치에 들어오면, 카드덱은 빠지고 영상은 그대로 저장 페이로드에 남는다", () => {
    const deckWithEmptyBubble = clone(deckD100) as unknown as CardDeck;
    // 1번(대화) 장의 말풍선을 전부 비워 emptyBubbleSlideNumber가 그 장 번호를 돌려주게 한다.
    deckWithEmptyBubble.slides[1] = { ...deckWithEmptyBubble.slides[1], bubbles: [] };

    const videoEdit = addOverlay(emptyVideoEdit(), "hook", "이거 순서가 틀렸다면?", 0, 3);

    const { deckForSave, editForSave, holdMessage } = decideSavePayload(deckWithEmptyBubble, videoEdit);

    // 옛 코드(타이머 통합 직후, N1 결함)는 이 배치에서 videoEdit 자체가 통째로 유실됐다
    // (카드덱 타이머가 영상 타이머를 죽이고 조기 반환). 여기서는 영상이 살아남아야 한다.
    expect(editForSave).not.toBeNull();
    expect(editForSave!.overlays).toHaveLength(1);
    expect(editForSave!.overlays[0].text).toBe("이거 순서가 틀렸다면?");

    // 카드덱은 빈 말풍선 장 때문에 보류되고(payload에서 빠지고), 그 사유가 보인다.
    expect(deckForSave).toBeNull();
    expect(holdMessage).toContain("2번 장");
    expect(holdMessage).toContain("보류");
  });

  it("영상만 바뀌고 카드덱 배치가 없으면(cardDeck 완전 정상) 영상 저장이 방해받지 않는다", () => {
    const validDeck = clone(deckD100) as unknown as CardDeck;
    expect(() => validateCardDeck(validDeck)).not.toThrow();
    const videoEdit = addOverlay(emptyVideoEdit(), "cta", "댓글에 '순서' 남기면 방법 보내줄게", 1, 4);

    // deckToSave가 null(이번 배치에 카드덱 변경이 없었다)이어도 editForSave는 그대로 채워진다.
    const { deckForSave, editForSave } = decideSavePayload(null, videoEdit);
    expect(deckForSave).toBeNull();
    expect(editForSave).not.toBeNull();
    expect(editForSave!.overlays).toHaveLength(1);
  });
});

describe("N2 회귀: update로 들어온 빈 값은 저장 페이로드에서 빠지고 400을 유발하지 않는다", () => {
  it("작성자·문구를 지우는 중(빈 문자열) 자동저장이 오면 그 댓글은 저장에서 빠진다", () => {
    let edit = addComment(emptyVideoEdit(), { author: "user1", text: "저도 효과봤어요", source: "manual", startSec: 0, endSec: 3 });
    // updateComment는 검증이 없어 빈 문자열도 그대로 상태에 들어간다(사용자가 지우는 중).
    edit = { ...edit, comments: edit.comments.map((c) => ({ ...c, author: "" })) };

    const { deck: sanitized, droppedCount } = sanitizeForSave(edit);
    expect(droppedCount).toBe(1);
    expect(sanitized.comments).toHaveLength(0);
    // sanitize된 결과는 서버 validateVideoEdit도 통과해야 400이 안 난다.
    expect(() => validateVideoEdit(sanitized)).not.toThrow();
  });

  it("빈 값이 없으면 아무것도 드롭되지 않는다(정상 경로 회귀 0)", () => {
    const edit = addOverlay(emptyVideoEdit(), "hook", "훅", 0, 3);
    const { deck: sanitized, droppedCount } = sanitizeForSave(edit);
    expect(droppedCount).toBe(0);
    expect(sanitized.overlays).toHaveLength(1);
  });
});

describe("구조 대조: page.tsx의 scheduleEditAutosave가 위 시뮬레이션과 같은 분기를 쓰는지", () => {
  it("scheduleEditAutosave 본문에 pendingCardDeck·pendingVideoEdit를 각각 읽고, 카드덱 보류와 무관하게 editForSave를 채우는 구조가 있다", () => {
    const body = pageSrc.slice(
      pageSrc.indexOf("function scheduleEditAutosave()"),
      pageSrc.indexOf("function scheduleEditAutosave()") + 1800,
    );
    expect(body).toContain("const deckToSave = pendingCardDeck.current");
    expect(body).toContain("const editToSave = pendingVideoEdit.current");
    // 카드덱 보류(deckForSave = null로 남는 case)와 editForSave 채움이 서로 다른 if 블록
    // 이어야 한다 — 한 블록에서 return 하면 N1이 재발한다.
    expect(body).toContain("if (deckToSave) {");
    expect(body).toContain("if (editToSave) {");
    expect(body).not.toMatch(/if \(deckToSave\)[\s\S]{0,300}return;[\s\S]{0,50}if \(editToSave\)/);
    expect(body).toContain("sanitizeForSave(editToSave)");
  });
});
