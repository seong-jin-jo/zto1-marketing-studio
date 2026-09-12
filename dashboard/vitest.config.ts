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
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
