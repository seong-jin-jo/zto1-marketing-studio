import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Next.js 16 인식 오류 대응: 이 repo에는 /Users/sj/package-lock.json,
// dashboard/package-lock.json, openclaw/pnpm-lock.yaml 등 여러 lockfile이
// 존재해 Next.js의 workspace root 자동추론(가장 가까운 lockfile 탐색)이
// 상위 디렉터리(/Users/sj)를 root로 오인한다. 그 결과 `next dev`/`next build`가
// tailwindcss 등 dashboard 전용 의존성을 잘못된 root에서 resolve하려다 실패한다.
// (공식 문서: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
//  "Root directory" 섹션 — 이런 경우 turbopack.root를 절대경로로 직접 지정하라고 권고)
// process.cwd()는 실행 위치(예: 레포 루트에서 --prefix로 실행)에 따라 흔들리므로
// 절대 쓰지 않는다. 대신 ESM 표준 방식(import.meta.url → fileURLToPath)으로 이
// next.config.ts 파일 자신의 디렉터리(= dashboard/ 절대경로)를 고정한다.
const dashboardRoot = fileURLToPath(new URL(".", import.meta.url));
const buildCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dashboardRoot, encoding: "utf8" }).trim();
const buildSourceHash = execFileSync(
  process.execPath,
  [path.join(dashboardRoot, "scripts", "print-source-fingerprint.mjs"), dashboardRoot],
  { cwd: dashboardRoot, encoding: "utf8" },
).trim();

const nextConfig: NextConfig = {
  env: {
    OSMU_BUILD_COMMIT: buildCommit,
    OSMU_BUILD_SOURCE_HASH: buildSourceHash,
  },
  // Next 빌드가 자체 타입 검사를 한 번 더 돌린다. 그 검사는 tsconfig.json 을 그대로 읽어
  // 테스트까지 프로그램에 넣고, 그중 아홉 개가 이웃 워크스페이스(openclaw)의 확장을 직접
  // 부른다. 그 트리는 자기 의존성을 따로 들고 있어 CI 처럼 대시보드만 설치한 곳에서는
  // 모듈을 못 찾고 빌드가 죽는다(2026-09-14 실측).
  //
  // 타입 검사를 없애는 것이 아니다. CI 는 바로 앞 단계에서 `tsc --noEmit -p tsconfig.ci.json`
  // 을 따로 돌리고, 로컬은 벤더 워크스페이스가 설치된 상태로 전체 `tsc --noEmit` 을 돌린다.
  // 여기서 끄는 것은 그 두 검사와 겹치는 세 번째 실행뿐이다.
  typescript: { ignoreBuildErrors: true },
  output: "standalone",
  serverExternalPackages: ["proper-lockfile"],
  turbopack: {
    root: dashboardRoot,
  },
};

export default nextConfig;
