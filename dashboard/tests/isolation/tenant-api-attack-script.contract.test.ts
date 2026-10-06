import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRoot = process.cwd();
const apiRoot = path.join(dashboardRoot, "src", "app", "api");
const script = fs.readFileSync(
  path.join(dashboardRoot, "scripts", "verify-tenant-isolation-e2e.mjs"),
  "utf8",
);

function routeFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

function apiPath(file: string): string {
  return `/${path.relative(path.join(dashboardRoot, "src", "app"), file).replaceAll(path.sep, "/").replace(/\/route\.ts$/, "")}`;
}

function routePattern(route: string): RegExp {
  const escaped = route
    .split("/")
    .map((segment) => segment.startsWith("[") && segment.endsWith("]")
      ? "[^/?]+"
      : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("/");
  return new RegExp(`^${escaped}(?:\\?|$)`);
}

function readAttackPaths(): string[] {
  return [...script.matchAll(/\["READ-\d+",\s*(["`])([^"`]+)\1\]/g)].map((match) => match[2]);
}

describe("작업 공간 격리 실앱 공격 스크립트 계약", () => {
  it("TENANT-READ-01 한국어 설명: effectiveTenantId를 쓰는 모든 GET 읽기 경로를 공격 목록에 포함한다", () => {
    const protectedGetRoutes = routeFiles(apiRoot)
      .filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        return source.includes("effectiveTenantId") && source.includes("export async function GET");
      })
      .map(apiPath)
      .sort();
    const attackPaths = readAttackPaths();

    expect(attackPaths).toHaveLength(new Set(attackPaths).size);
    for (const route of protectedGetRoutes) {
      expect(
        attackPaths.some((candidate) => routePattern(route).test(candidate)),
        `${route} 읽기 경로가 실앱 공격 목록에서 빠졌습니다.`,
      ).toBe(true);
    }
  });

  it("TENANT-WRITE-01 한국어 설명: 파일과 DB 객체의 교차 수정·삭제 및 몸통 위조를 함께 공격한다", () => {
    for (const required of [
      "WRITE-01 큐 수정",
      "WRITE-04 큐 삭제",
      "WRITE-05 블로그 수정",
      "WRITE-06 블로그 삭제",
      "WRITE-07 채널 기본계정",
      "WRITE-08 채널 삭제",
      "WRITE-09 편집실 수정",
      "WRITE-10 편집실 큐 인계",
      "WRITE-11 댓글 상태 수정",
      "WRITE-12 이미지 삭제",
      "WRITE-13 내보내기 실패 장 재시도",
      "BODY-01 guide tenant_id 위조",
      "BODY-02 integration tenant_id 위조",
      "BODY-03 schedule tenant_id 위조",
      "POST-01 B 데이터베이스 불변",
      "POST-02 B 파일 불변",
    ]) {
      expect(script).toContain(required);
    }
  });

  it("TENANT-AUTH-01 한국어 설명: 무토큰·폐기 토큰·과거 만료 시각 JWT를 fail-closed로 검증한다", () => {
    expect(script).toContain("Authorization 없음");
    expect(script).toContain("폐기된 osmu 토큰");
    expect(script).toContain("AUTH-EXP-01 과거 exp JWT");
    expect(script).toContain("expired.status === 401 || expired.status === 503");
  });
});
