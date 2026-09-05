import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // 전체 실행에서 가용 CPU 16개를 모두 쓰면 jsdom과 API 통합 테스트가 서로를 굶겨
    // 실제로는 끝나는 계약도 기본 5초 안에 스케줄되지 못한다. 테스트 제한시간이나
    // 기대값을 느슨하게 하지 않고 파일 워커만 제한해 실제 대기와 자원 경합을 구분한다.
    minWorkers: 1,
    maxWorkers: 4,
    // 빌드 산출물(.next/standalone)에 복제된 스테일 테스트 수집 제외
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
