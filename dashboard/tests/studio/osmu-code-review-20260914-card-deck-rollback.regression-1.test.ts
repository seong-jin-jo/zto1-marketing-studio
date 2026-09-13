import { describe, expect, it, vi } from "vitest";
import { CardDeckError, renderAndUploadCardDeck } from "@/lib/studio/card-deck";

describe("OSMU-011 카드뉴스 저장 원자성", () => {
  it("OSMU-011 정상 경로: 다섯 장이 모두 저장되면 회수 없이 주소 전체를 반환한다", async () => {
    const rollback = vi.fn(async () => {});

    const urls = await renderAndUploadCardDeck(
      { lines: ["1", "2", "3", "4", "5"], ratio: "4:5" },
      {
        render: (input) => `data:image/png;base64,${input.index}`,
        upload: async (_dataUrl, index) => ({ url: `/image/${index}`, rollback }),
      },
    );

    expect(urls).toEqual(["/image/0", "/image/1", "/image/2", "/image/3", "/image/4"]);
    expect(rollback).not.toHaveBeenCalled();
  });

  it("OSMU-011 거절 경로: 다섯째 장 저장 실패 시 앞 네 객체를 역순으로 모두 회수한다", async () => {
    const removed: number[] = [];

    await expect(renderAndUploadCardDeck(
      { lines: ["1", "2", "3", "4", "5"], ratio: "4:5" },
      {
        render: (input) => `data:image/png;base64,${input.index}`,
        upload: async (_dataUrl, index) => {
          if (index === 4) throw new CardDeckError("다섯째 장 503");
          return { url: `/image/${index}`, rollback: async () => { removed.push(index); } };
        },
      },
    )).rejects.toThrow("다섯째 장 503");

    expect(removed).toEqual([3, 2, 1, 0]);
  });

  it("OSMU-011 경계값: 보상 삭제도 실패하면 저장소 확인이 필요한 오류로 승격한다", async () => {
    await expect(renderAndUploadCardDeck(
      { lines: ["1", "2"], ratio: "4:5" },
      {
        render: (input) => `data:image/png;base64,${input.index}`,
        upload: async (_dataUrl, index) => {
          if (index === 1) throw new CardDeckError("둘째 장 503");
          return { url: "/image/0", rollback: async () => { throw new Error("삭제 503"); } };
        },
      },
    )).rejects.toThrow(/임시 파일 1개를 회수하지 못했습니다/);
  });
});
