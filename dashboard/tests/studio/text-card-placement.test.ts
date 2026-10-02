/**
 * 편집실에서 고른 자리가 그리는 좌표를 바꾸는지를 본다.
 * 브라우저 캔버스가 없으면 그림을 만들지 않으므로, 여기서는 그리기 호출을 받아
 * 글자가 앉는 좌표가 칸마다 다른지 확인한다. 그 좌표가 PNG에 찍힌다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cardDeckRenderInputs } from "@/lib/studio/card-deck";
import {
  cardPositionFromPoint,
  cardTextOrigin,
  renderTextCard,
} from "@/lib/studio/text-card-image";

type Draw = { text: string; x: number; y: number };

function installRecorder(): Draw[] {
  const draws: Draw[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        fillStyle: "",
        font: "",
        textAlign: "left",
        textBaseline: "top",
        fillRect() {},
        measureText(text: string) { return { width: [...String(text)].length * 40 }; },
        fillText(text: string, x: number, y: number) { draws.push({ text, x, y }); },
      };
    },
    toDataURL() {
      return `data:image/png;base64,${Buffer.from(JSON.stringify(draws)).toString("base64")}`;
    },
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  return draws;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("카드 글자 자리가 내보내는 그림을 바꾼다", () => {
  it("포인터의 가로는 왼쪽과 오른쪽 칸을 가른다", () => {
    expect(cardPositionFromPoint(0.1, 0.1)).toBe("top-left");
    expect(cardPositionFromPoint(0.5, 0.5)).toBe("center");
    expect(cardPositionFromPoint(0.9, 0.9)).toBe("bottom-right");
    expect(cardPositionFromPoint(0.1, 0.5)).toBe("center-left");
  });

  it("아홉 칸은 그리기 좌표에서 세로만 남지 않는다", () => {
    const left = cardTextOrigin("top-left", 1080, 1080, 200, 120, 108);
    const right = cardTextOrigin("bottom-right", 1080, 1080, 200, 120, 108);
    expect(left.x).toBeLessThan(right.x);
    expect(left.y).toBeLessThan(right.y);
    expect(cardDeckRenderInputs({
      lines: ["가"],
      ratio: "1:1",
      positions: ["bottom-right"],
    })[0].position).toBe("bottom-right");
  });

  it("왼쪽 위와 오른쪽 아래는 다른 좌표에 글자를 그린다", () => {
    const leftDraws = installRecorder();
    const topLeft = renderTextCard({ text: "가", ratio: "1:1", position: "top-left" });
    const left = [...leftDraws];
    vi.unstubAllGlobals();
    const rightDraws = installRecorder();
    const bottomRight = renderTextCard({ text: "가", ratio: "1:1", position: "bottom-right" });
    expect(topLeft).toMatch(/^data:image\/png/);
    expect(bottomRight).toMatch(/^data:image\/png/);
    expect(topLeft).not.toBe(bottomRight);
    expect(left[0].x).toBeLessThan(rightDraws[0].x);
    expect(left[0].y).toBeLessThan(rightDraws[0].y);
    expect(left[0].x).toBeLessThan(540);
    expect(left[0].y).toBeLessThan(540);
    expect(rightDraws[0].x).toBeGreaterThan(540);
    expect(rightDraws[0].y).toBeGreaterThan(540);
  });
});
