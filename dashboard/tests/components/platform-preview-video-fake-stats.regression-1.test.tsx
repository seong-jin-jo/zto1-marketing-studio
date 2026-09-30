// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformPreview } from "@/components/studio/PlatformPreview";

// 2026-10-01 실측(회장 지적): 발행실의 Shorts/Reels/TikTok 세로 영상 미리보기에
// "12.4K", "318" 같은 가짜(하드코딩) 조회수·좋아요 수치가 떠 있었다. 이 미리보기는
// 아직 발행하지 않은 초안을 보여 주는 화면이라 실제 반응 데이터가 존재할 수 없다.
// 실데이터가 없으면 그 수치 UI를 아예 숨긴다(꾸며낸 숫자로 있는 것처럼 보이면 안 된다).
describe("세로 영상 미리보기는 가짜 반응 수치를 보여주지 않는다", () => {
  it.each(["shorts", "reels", "tiktok"] as const)("%s 미리보기에 하드코딩된 12.4K/318/1.2K 가 없다", (platform) => {
    render(
      <PlatformPreview
        platform={platform}
        text={{}}
        media={{ vidUrl: "https://example.test/video.mp4" }}
      />,
    );
    expect(screen.queryByText("12.4K")).not.toBeInTheDocument();
    expect(screen.queryByText("318")).not.toBeInTheDocument();
    expect(screen.queryByText("1.2K")).not.toBeInTheDocument();
  });
});
