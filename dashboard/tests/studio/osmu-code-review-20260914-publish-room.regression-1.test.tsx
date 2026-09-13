// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlatformPreview } from "@/components/studio/PlatformPreview";

const pageSource = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

afterEach(cleanup);

describe("OSMU 코드리뷰 발행실 회귀", () => {
  it("OSMU-012 거절 경로: 카드 재합성 실패 시 옛 그림을 저장하거나 발행실로 이동하지 않는다", () => {
    const move = pageSource.slice(pageSource.indexOf("async function moveToPublish()"), pageSource.indexOf("// 플랫폼별 발행 텍스트 추출"));
    const failureGuard = move.indexOf('if (editKind === "card" && !redrawn) return;');
    // save 호출의 줄바꿈이나 인자 배치는 동작 계약이 아니다. 호출 순서만 고정한다.
    const saveCall = move.search(/await\s+save\s*\(/);
    const roomChange = move.indexOf('changeRoom("publish")');

    expect(failureGuard).toBeGreaterThan(0);
    expect(failureGuard).toBeLessThan(saveCall);
    expect(failureGuard).toBeLessThan(roomChange);
    expect(pageSource).toContain("발행실로 이동하지 않았습니다. 다시 시도해주세요.");
  });

  it("OSMU-013 정상 경로: 인스타그램 미리보기는 실제 발행 이미지 세 장을 순서대로 보여준다", () => {
    const images = ["/actual-1.png", "/actual-2.png", "/actual-3.png"];
    render(
      <PlatformPreview
        platform="instagram"
        text={{ instagram: { caption: "본문", slides: ["가짜 글자 카드", "보이면 안 됨"] } }}
        media={{ imgUrl: images[0], imgUrls: images }}
      />,
    );

    expect(screen.getByTestId("preview-media-instagram")).toHaveAttribute("src", images[0]);
    fireEvent.click(screen.getByRole("button", { name: "다음 카드" }));
    expect(screen.getByTestId("preview-media-instagram")).toHaveAttribute("src", images[1]);
    fireEvent.click(screen.getByRole("button", { name: "다음 카드" }));
    expect(screen.getByTestId("preview-media-instagram")).toHaveAttribute("src", images[2]);
    expect(screen.queryByText("가짜 글자 카드")).not.toBeInTheDocument();
  });

  it("OSMU-013 경계값: 페이지가 채널별 실제 발행 배열과 같은 계획을 미리보기에 넘긴다", () => {
    expect(pageSource).toContain("imgUrls: planChannelImages(platform, publishDeck).images");
  });

  it("OSMU-014 거절 경로: 발행실 본문에는 학습 상세 값 목록을 상주시키지 않는다", () => {
    const context = pageSource.slice(
      pageSource.indexOf('data-testid="publish-learning-context"'),
      pageSource.indexOf('<section data-room="publish"'),
    );
    expect(context).toContain("학습 정보 고치기");
    expect(context).not.toContain("publishLearningRows");
    expect(context).not.toContain("<dl");
  });
});
