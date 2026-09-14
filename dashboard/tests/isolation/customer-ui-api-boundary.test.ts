import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const customerSurfaces: Array<{
  file: string;
  forbidden: string[];
  retained?: string[];
}> = [
  {
    file: "src/components/home/PerformanceDashboard.tsx",
    forbidden: ["/api/cron-status", "/api/token-status"],
    retained: ["/api/metrics"],
  },
  {
    file: "src/components/home/PerformanceRoom.tsx",
    forbidden: ["/api/cron-status", "/api/token-status"],
    retained: ["/api/suggestions", "/api/suggestions/enqueue"],
  },
  {
    file: "src/components/channel/ChannelPage.tsx",
    forbidden: ["/api/cron-status", "/api/cron-runs", "/api/cron-interval", "/api/cron/"],
    retained: ["/api/analytics", "/api/settings"],
  },
  {
    file: "src/components/channel/InstagramPage.tsx",
    forbidden: ["/api/cron-status", "/api/cron-runs", "/api/cron-interval", "/api/cron/", "/api/design-tools"],
    retained: ["/api/queue", "/api/channel-config/instagram", 'TenantAutomationSettings channel="instagram"'],
  },
  {
    file: "src/components/channel/MessagingPage.tsx",
    forbidden: [
      "/api/notification-settings",
      "/api/chat-channels",
      "/api/send-notification",
      "/api/slack-config",
      "/api/slack-template",
      "/api/slack-report-preview",
      "/api/slack-send-custom",
      "/api/slack-test",
    ],
    retained: ["/api/channel-config/"],
  },
  {
    file: "src/app/images/page.tsx",
    forbidden: ["/api/r2-config"],
    retained: ["/api/images"],
  },
  {
    file: "src/app/blog/page.tsx",
    forbidden: ["/api/cron-status", "/api/cron-interval", "/api/cron/"],
    retained: ["/api/blog-queue", "/api/blog-guide", "/api/blog-keywords"],
  },
  {
    file: "src/app/google-analytics/page.tsx",
    forbidden: ["/api/ga-analytics"],
  },
  {
    file: "src/app/search-advisor/page.tsx",
    forbidden: ["/api/nsa-data"],
  },
  {
    file: "src/app/naver-trends/page.tsx",
    forbidden: ["/api/naver-datalab-config", "/api/naver-trend"],
  },
];

describe("customer UI operator/global API boundary", () => {
  it.each(customerSurfaces)(
    "$file never requests operator-only/global APIs while retaining tenant-safe content",
    ({ file, forbidden, retained = [] }) => {
      const source = read(file);
      for (const endpoint of forbidden) expect(source).not.toContain(endpoint);
      for (const endpoint of retained) expect(source).toContain(endpoint);
    },
  );

  it("does not weaken the customer proxy allowlist to make forbidden calls pass", () => {
    const proxy = read("src/proxy.ts");
    const forbidden = [
      "/api/cron-status",
      "/api/cron-runs",
      "/api/cron-interval",
      "/api/token-status",
      "/api/notification-settings",
      "/api/chat-channels",
      "/api/send-notification",
      "/api/slack-config",
      "/api/slack-template",
      "/api/slack-report-preview",
      "/api/slack-send-custom",
      "/api/slack-test",
      "/api/r2-config",
      "/api/ga-config",
      "/api/ga-analytics",
      "/api/nsa-data",
      "/api/naver-datalab-config",
      "/api/naver-trend",
    ];

    for (const endpoint of forbidden) {
      expect(proxy).not.toMatch(new RegExp(`^\\s*"${endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",`, "m"));
    }
  });

  it("direct customer fetches use the shared role-aware 401 handler", () => {
    for (const file of [
      "src/components/channel/InstagramPage.tsx",
      "src/app/videos/page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("handleUnauthorizedResponse");
      expect(source).not.toContain('new CustomEvent("auth:required")');
    }
  });
});
