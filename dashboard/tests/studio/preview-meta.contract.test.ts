import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적 둘.
// "해시태그나 첫댓글도 미리보기화면에서 직관적으로 수정할수있게 하는게 낫지않겠어?"
// "지금 화면에서 왜 이런 메타정보(해시태그 첫댓글 캡션 등등)는 비어있어."
//
// 공란의 원인은 단절이었다. 생성은 인스타그램 해시태그를 실제로 만들어 내려보내는데
// (/api/studio/text 계약의 instagram.hashtags) 발행실은 그 값을 한 번도 읽지 않고
// 사용자가 손으로 채우기만 기다렸다. 만들어 놓고 안 쓰면 없는 것과 같다.
// 사업계획 §3.2 는 "채널별 해시태그·첫 댓글은 발행실이 맡는다" 고 정했다. 맡는다는 것은
// 빈 칸을 내주는 것이 아니라 채워 놓고 고치게 하는 것이다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("발행실 메타정보", () => {
  it("생성이 만든 해시태그를 발행실이 받아 채운다", () => {
    const page = src("app/studio/page.tsx");
    expect(page).toContain("text?.instagram?.hashtags");
    expect(page).toContain("PLATFORM_FIELD_CONTRACT");
    expect(page).toContain("setHashtags((current)");
  });

  it("사용자가 손댄 칸은 덮어쓰지 않는다", () => {
    const page = src("app/studio/page.tsx");
    // 채우는 것이 덮어쓰기가 되면 고쳐 놓은 값이 사라진다.
    expect(page).toMatch(/if \(next\[platform\]\?\.trim\(\)\) continue;/);
  });

  it("해시태그를 미리보기 본문 아래에서 고친다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    for (const platform of ["threads", "x", "facebook"]) {
      expect(preview, `${platform} 해시태그가 미리보기에 없다`)
        .toContain(`testId="preview-tags-${platform}"`);
    }
    expect(preview).toContain("editor?.onHashtagsChange");
  });

  it("아래에 같은 해시태그 칸을 또 두지 않는다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toMatch(/contract\.hashtags && !BODY_EDITABLE_IN_PREVIEW\.has\(platform\)/);
  });
});
