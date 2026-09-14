import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

function source(relative: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../src", relative), "utf8");
}

describe("SNS-007 multi-account source contracts", () => {
  it("account creation is serialized and inactive accounts cannot publish", () => {
    const code = source("lib/channel-accounts.ts");
    expect(code).toContain("pg_advisory_xact_lock");
    expect(code).toMatch(/id = \$\{accountId\}[\s\S]*status = 'active'/);
    expect(code).toMatch(/is_default = true[\s\S]*status = 'active'/);
  });

  it("OAuth callback never places refreshToken in plaintext meta", () => {
    const code = source("app/api/connect/[provider]/callback/route.ts");
    expect(code).not.toMatch(/meta\.refreshToken\s*=/);
    expect(code).toContain("refreshToken: tok.refreshToken");
  });

  it("workspace changes clear prior account selections", () => {
    // 작업 공간이 바뀌면 계정 선택이 비워지는지를 본다. 예전 정규식은 이 초기화가
    // useEffect 의 첫 문장일 것까지 요구해서, 같은 effect 안에서 순서만 바뀌어도 깨졌다
    // (2026-09-02 v67 리팩터에서 실제로 깨졌고 동작 자체는 그대로였다).
    // 정규식으로 effect 시작점을 고정하면 문장 순서에 다시 묶인다. useEffect 단위로 쪼갠 뒤
    // 작업 공간을 읽는 블록을 골라, 그 안에 초기화가 있는지만 본다.
    const studioBlocks = source("app/studio/page.tsx").split("useEffect((");
    const workspaceBlock = studioBlocks.find((block) => block.includes("const workspaceId = activeWorkspace?.id"));
    expect(workspaceBlock, "작업 공간 변경 effect를 찾지 못했다").toBeDefined();
    expect(workspaceBlock!).toContain("setSelectedAccounts({})");
    expect(source("components/studio/SchedulePanel.tsx")).toMatch(/useEffect\(\(\) => \{\s*setSelectedAccounts\(\{\}\)/);
    expect(source("app/videos/page.tsx")).toMatch(/setPublishAccountId\(""\)[\s\S]*activeWorkspace\?\.id/);
  });

  it("YouTube upload UI and API carry the selected account id", () => {
    const page = source("app/videos/page.tsx");
    const route = source("app/api/video/publish/route.ts");
    expect(page).toContain('data-testid="youtube-publish-account-select"');
    // SNS-015: 같은 핸들러가 Reels도 처리하지만 계정 선택값은 YouTube 발행에만 실린다
    // (Instagram 발행에 YouTube 계정 id가 새면 안 된다).
    expect(page).toMatch(/account_id: platform === "youtube" \? \(publishAccountId \|\| undefined\) : platform === "tiktok"/);
    expect(route).toContain('getChannelCred(tenantId, "youtube", accountId)');
    expect(route).toContain("refreshYoutubeAccessToken(tenantId, accountId)");
  });

  it("video workspace delegates YouTube/TikTok connection and account ownership to channel pages", () => {
    const page = source("app/videos/page.tsx");
    expect(page).not.toContain('from "@/components/channel/SocialConnectButton"');
    expect(page).not.toContain('from "@/components/channel/AccountManager"');
    expect(page).not.toContain("<SocialConnectButton");
    expect(page).not.toContain("<AccountManager");
    expect(page).toContain('href="/channels/youtube"');
    expect(page).toContain('href="/channels/tiktok"');
  });

  it("TikTok video publishing preserves account switching and creator-authorized publish controls", () => {
    const page = source("app/videos/page.tsx");
    expect(page).toContain('data-testid="tiktok-status-card"');
    expect(page).toContain('data-testid="tiktok-publish-account-select"');
    expect(page).toContain('data-testid="tiktok-privacy-select"');
    expect(page).toContain('data-testid="tiktok-publish-button"');
    expect(page).not.toContain('data-testid="tiktok-disabled-card"');
    expect(page).toContain("is_ai_generated: tiktokAiGenerated");
    expect(page).toContain("/api/tiktok/publish-status?publish_id=");
    expect(page).toContain("tiktok-pending:");
    expect(page).toContain("Boolean(tiktokPending[v.filename])");
    expect(page).toContain("tiktokPendingState.workspaceId === pendingWorkspaceId");
    expect(page).toContain("current.workspaceId !== workspaceId");
  });

  it("Reels UI uses design tokens only and stays gated on Instagram connection", () => {
    const page = source("app/videos/page.tsx");
    // SNS-015 QA: 하드코딩 팔레트는 라이트/다크 대비가 깨진다 — 시맨틱 토큰만 허용.
    expect(page).not.toMatch(/\b(?:bg|text|hover:bg|hover:text)-pink-\d{2,3}\b/);
    const reelsCard = page.slice(page.indexOf('data-testid="reels-status-card"'));
    expect(reelsCard.slice(0, 400)).not.toMatch(/\btext-green-\d{2,3}\b/);
    expect(page).toContain('data-testid="reels-publish-button"');
    expect(page).toContain('data-testid="reels-status-card"');
    expect(page).toMatch(/igConnected \? "text-success" : "text-subtle"/);
    expect(page).toMatch(/igConnected && \(\s*<button\s+data-testid="reels-publish-button"/);
    // 생성 탭은 운영자 전용 — 고객 세션에는 탭도 패널도 그리지 않는다.
    expect(page).toMatch(/canGenerate && \(\s*<button\s+data-testid="video-generate-tab"/);
    expect(page).toContain('tab === "generate" && canGenerate');
    expect(page).toMatch(/activeWorkspace \? `\/api\/channels\/instagram\/accounts\?tenant_id=\$\{activeWorkspace\.id\}` : null/);
  });

  it("connect UI recognizes direct video publishing providers", () => {
    const button = source("components/channel/SocialConnectButton.tsx");
    const capabilities = source("lib/channel-capabilities.ts");
    expect(capabilities).toContain('VIDEO_PUBLISH_PLATFORMS = ["youtube", "tiktok"]');
    expect(button).toContain("...VIDEO_PUBLISH_PLATFORMS");
  });
});
