import { describe, it, expect } from 'vitest';
import { SCHEDULABLE_PLATFORMS } from '@/lib/constants';
import { PROVIDERS, getProvider } from '@/lib/social-connect';

// "노출=발행가능" 원칙(wiki/reference/channel-status.md) 회귀 방지.
// OAuth "연결"은 12채널(threads/instagram/x/facebook + PROVIDERS 8종)까지 구현됐고,
// 대시보드 직접 "발행"(lib/publish.ts)은 두 갈래로 SCHEDULABLE_PLATFORMS 8채널을 지원한다:
//   ① OAuth 앱 등록형(threads/x/facebook/instagram) — PROVIDERS의 getProvider로도 조회됨.
//   ② credential/webhook 방식(bluesky/telegram/discord/slack, 2026-07) — OAuth 앱 등록 없이
//      handle+app password / bot token / webhook URL을 Settings에서 직접 입력해 발행.
//      이 중 slack만 PROVIDERS(OAuth 연결)에도 존재하지만, 실제 저장 경로는 여전히 webhook 수동
//      입력(channel-config bridge)이라 getProvider 유무와 SCHEDULABLE_PLATFORMS 소속은 별개다.
//      bluesky/telegram/discord는 애초에 OAuth 연결이 없는 채널이라 PROVIDERS에 없다(정상).
// SocialConnectButton은 이 집합으로 "발행 준비 중" 배지 노출 여부를 판단한다 — SSOT가
// 여기서 흔들리면 그 UI 판단도 같이 흔들리므로, 두 소스(constants·social-connect)의
// 교차 상태를 이 테스트로 고정한다.
describe('발행 지원 채널 집합 SSOT (SCHEDULABLE_PLATFORMS)', () => {
  it('현재 발행 지원 9채널 — threads/x/facebook/instagram/linkedin + bluesky/telegram/discord/slack', () => {
    expect([...SCHEDULABLE_PLATFORMS].sort()).toEqual(
      ['facebook', 'instagram', 'threads', 'x', 'linkedin', 'bluesky', 'telegram', 'discord', 'slack'].sort(),
    );
  });

  it('연결만 되고 발행 미지원인 채널(OAuth PROVIDERS 중 SCHEDULABLE_PLATFORMS 밖)은 UI가 정직 배지를 띄워야 하는 대상', () => {
    const connectOnlyProviders = Object.keys(PROVIDERS).filter(
      (name) => !(SCHEDULABLE_PLATFORMS as readonly string[]).includes(name),
    );
    // youtube/naver_blog/pinterest/tumblr/tiktok/line = 연결만 가능, 발행 미지원.
    // slack은 2026-07부로 SCHEDULABLE_PLATFORMS 편입 → 이 목록에서 빠짐(배지 사라짐).
    // linkedin은 2026-09-08 텍스트 발행 구현으로 편입 → 이 목록에서 빠짐.
    expect(connectOnlyProviders.sort()).toEqual(
      ['youtube', 'naver_blog', 'pinterest', 'tumblr', 'tiktok', 'line'].sort(),
    );
    for (const name of connectOnlyProviders) {
      expect((SCHEDULABLE_PLATFORMS as readonly string[]).includes(name)).toBe(false);
    }
  });

  it('OAuth 앱 등록형 발행 채널(threads/x/facebook/instagram/slack)은 connect provider(getProvider)로도 조회 가능', () => {
    const oauthBacked = ['threads', 'x', 'facebook', 'instagram', 'slack'] as const;
    for (const name of oauthBacked) {
      expect(getProvider(name)).not.toBeNull();
    }
  });

  it('credential/webhook 방식 채널(bluesky/telegram/discord)은 OAuth connect provider가 없다 — 수동 입력 전용이 설계 의도', () => {
    const credentialOnly = ['bluesky', 'telegram', 'discord'] as const;
    for (const name of credentialOnly) {
      expect((SCHEDULABLE_PLATFORMS as readonly string[]).includes(name)).toBe(true);
      expect(getProvider(name)).toBeNull();
    }
  });
});
