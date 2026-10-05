import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_FONT_ERROR_CODE, CARD_FONT_LICENSE_FILE, CARD_FONT_PUBLIC_FILE, assertCardFontReady } from "./card-font";

describe("S2-AC4 카드 렌더 Pretendard 고정", () => {
  it("저장소에 고정 폰트와 라이선스를 두고 hash 검증을 통과한다", () => {
    expect(fs.existsSync(path.join(process.cwd(), CARD_FONT_PUBLIC_FILE))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), CARD_FONT_LICENSE_FILE))).toBe(true);
    expect(() => assertCardFontReady()).not.toThrow();
  });

  it("폰트가 없거나 hash가 다르면 fallback 없이 FONT_LOAD_FAILED로 거절한다", () => {
    expect(() => assertCardFontReady({ fontPath: "/tmp/osmu-missing-pretendard.woff2" })).toThrow(
      expect.objectContaining({ code: CARD_FONT_ERROR_CODE }),
    );
  });
});
