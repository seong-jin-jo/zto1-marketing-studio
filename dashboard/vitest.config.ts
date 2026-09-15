import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // 전체 실행에서 파일 워커 4개를 쓰면 jsdom과 API 통합 테스트가 서로를 굶겨
    // 실제로는 끝나는 계약도 기본 5초 안에 스케줄되지 못한다. 테스트 제한시간이나
    // 기대값을 느슨하게 하지 않고 기본 파일 워커를 2개로 제한해 자원 경합을 줄인다.
    minWorkers: 1,
    maxWorkers: 2,
    // 빌드 산출물(.next/standalone)에 복제된 스테일 테스트 수집 제외
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      // 반드시 `@/` 로 끊어야 한다. 키를 `@` 로 두면 vite 가 접두사로 치환해
      // `@aws-sdk/client-s3` 같은 스코프 패키지까지 src 아래로 끌고 가 모듈을 잃는다
      // (2026-09-14 실측: Cannot find module './auth/httpAuthSchemeProvider').
      '@/': `${path.resolve(__dirname, 'src')}/`,
      // openclaw 확장(발행 도구)의 회귀 테스트는 벤더 소스를 상대경로로 직접 부른다.
      // 그 소스가 쓰는 `openclaw/plugin-sdk/*` 는 호스트 애플리케이션이 실행 시점에
      // 꽂아주는 이음매이고, 해결하려면 openclaw 빌드 산출물(dist/, git 미추적)과
      // 그 워크스페이스 node_modules 2.2GB 가 필요하다. CI 는 대시보드 의존성만
      // 설치하므로 이 이음매가 없으면 회귀 셋이 로드조차 못 한다(2026-09-14 실측).
      // 서드파티(typebox·@aws-sdk/client-s3)는 실물로 설치하고, 호스트 이음매만
      // tests/vendor-host 가 원본 그대로 제공한다. 표류는 parity 테스트가 잡는다.
      'openclaw/plugin-sdk/agent-runtime': path.resolve(__dirname, 'tests/vendor-host/openclaw-plugin-sdk/agent-runtime.ts'),
      'openclaw/plugin-sdk/plugin-runtime': path.resolve(__dirname, 'tests/vendor-host/openclaw-plugin-sdk/plugin-runtime.ts'),
      'openclaw/plugin-sdk/core': path.resolve(__dirname, 'tests/vendor-host/openclaw-plugin-sdk/core.ts'),
      // 확장 소스는 openclaw/ 트리에 있어서 node 해석이 그 트리의 node_modules 를
      // 타고 올라간다. 대시보드에 설치해도 거기서는 안 보인다. 그래서 확장이
      // package.json 에 선언한 서드파티 두 개를 대시보드 설치본으로 직접 못박는다.
      // 버전은 확장 선언과 같다(typebox 1.1.39, @aws-sdk/client-s3 3.1056.0).
      typebox: path.resolve(__dirname, 'node_modules/typebox'),
      '@aws-sdk/client-s3': path.resolve(__dirname, 'node_modules/@aws-sdk/client-s3'),
      // 2026-09-16: threads-publish 도구가 미리 서명 주소(getSignedUrl)를 쓰기 시작했다. 같은 방식.
      '@aws-sdk/s3-request-presigner': path.resolve(__dirname, 'node_modules/@aws-sdk/s3-request-presigner'),
    },
  },
});
