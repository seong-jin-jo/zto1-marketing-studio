\set t '5edb6703-c63e-43b8-86e3-d0a952836ebd'
-- 이 테넌트가 없으면 UPDATE는 0행을 바꾸고 이후 모든 INSERT가 외래키 위반으로 죽는다.
-- 시드는 빈 DB에서도 그대로 돌아야 하므로 먼저 테넌트를 만든다(있으면 이름만 맞춘다).
INSERT INTO tenants (id, slug, name, status, tier)
VALUES (:'t', 'monostudio', '모노스튜디오', 'active', 'team')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug;

-- 연결된 채널 계정 (secret_enc는 upsertChannelAccount와 동일하게 armor(pgp_sym_encrypt(...))로
-- 암호화한다 — 평문 더미('local-demo')는 /api/channel-config의 dearmor()가 실패해 쿼리 전체가
-- catch로 떨어지고 DB 연결상태가 조용히 file-fallback으로 새는 걸 감춘다. 로컬 데모 키는
-- .env.local의 OSMU_SECRET_KEY와 반드시 일치해야 한다.
INSERT INTO channel_accounts (tenant_id, provider, external_account_id, display_name, username, secret_enc, is_default, status, token_expires_at)
VALUES
 (:'t','threads','17841400000001','모노스튜디오','monostudio','' || armor(pgp_sym_encrypt('local-demo-token-threads', 'devlocalsecret0123456789')),true,'active', now()+interval '45 days'),
 (:'t','instagram','17841400000002','모노스튜디오','monostudio.official','' || armor(pgp_sym_encrypt('local-demo-token-instagram', 'devlocalsecret0123456789')),true,'active', now()+interval '52 days'),
 (:'t','x','1500000000000001','모노스튜디오','monostudio_kr','' || armor(pgp_sym_encrypt('local-demo-token-x', 'devlocalsecret0123456789')),true,'active', now()+interval '80 days'),
 (:'t','facebook','1020304050','모노스튜디오 페이지','monostudio.page','' || armor(pgp_sym_encrypt('local-demo-token-facebook', 'devlocalsecret0123456789')),true,'expired', now()-interval '3 days')
ON CONFLICT DO NOTHING;

-- 브랜드 위키
INSERT INTO wiki_docs (tenant_id, path, title, content, hash, updated_at) VALUES
 (:'t','brand/positioning.md','포지셔닝','1인 브랜드 대표를 위한 마케팅 실행 에이전트. 승인하지 않은 사실은 콘텐츠에 넣지 않는다.','h1', now()-interval '2 days'),
 (:'t','brand/tone.md','톤과 어휘','과장 금지. 숫자는 근거와 함께. 반말 금지.','h2', now()-interval '1 day'),
 (:'t','brand/offer.md','가격과 혜택','스타터 월 29,000원. 첫 달 무료. 채널 5개까지.','h3', now()-interval '6 hours')
ON CONFLICT DO NOTHING;

INSERT INTO brand_guides (tenant_id, prompt_guide, source, synced_at)
VALUES (:'t','확인된 사실만 사용한다. 가격·혜택은 brand/offer.md 승인본만 인용한다.','wiki', now()-interval '5 hours')
ON CONFLICT (tenant_id) DO UPDATE SET prompt_guide=EXCLUDED.prompt_guide, synced_at=EXCLUDED.synced_at;

-- 초안(스튜디오 발행 이력에 뜬다)
INSERT INTO drafts (tenant_id, idea, payload, status, created_at) VALUES
 (:'t','가을 신규 고객 안내','{"threads":"확인 가능한 마케팅 흐름을 먼저 만듭니다. 무엇을 왜 게시했는지 남겨야 다음 판단이 쉬워집니다.","x":"초안은 팔지 않습니다. 발행 증거를 팝니다.","instagram":{"caption":"확인할 수 있는 마케팅 흐름을 카드뉴스로 정리했습니다.","hashtags":["#마케팅자동화","#1인브랜드"]}}','published', now()-interval '3 hours'),
 (:'t','자동 게시를 켜기 전에 볼 것','{"threads":"자동 게시 전에 브랜드 사실을 먼저 승인하세요."}','partial', now()-interval '1 day'),
 (:'t','브랜드 자료로 초안 만드는 순서','{"threads":"위키의 승인된 문단만 초안에 들어갑니다."}','draft', now()-interval '2 days'),
 (:'t','첫 문장을 고객 상황으로 바꾼 판','{"threads":"고객이 겪는 상황을 첫 문장에 둡니다."}','stopped', now()-interval '3 days')
ON CONFLICT DO NOTHING;

-- 승인 대기 큐
-- queue_posts.id 는 queue.json 의 post.id 와 같은 값을 쓰므로 기본값이 없다. 시드가 직접 준다.
INSERT INTO queue_posts (id, tenant_id, text, topic, status, hashtags, channels, generated_at, approved_at) VALUES
 ('aaaa1111-0000-4000-8000-000000000001',:'t','확인 가능한 마케팅 흐름을 먼저 만듭니다.','온보딩','approved','{"#마케팅자동화"}','{"threads":{"status":"published"},"x":{"status":"published"},"instagram":{"status":"pending"}}', now()-interval '4 hours', now()-interval '3 hours'),
 ('aaaa1111-0000-4000-8000-000000000002',:'t','승인하지 않은 사실은 콘텐츠에 들어가지 않습니다.','브랜드','pending','{"#브랜드위키"}','{"threads":{"status":"pending"}}', now()-interval '2 hours', NULL),
 ('aaaa1111-0000-4000-8000-000000000003',:'t','채널마다 다시 쓰는 이유는 플랫폼 정책입니다.','정책','pending','{"#콘텐츠정책"}','{"threads":{"status":"pending"},"instagram":{"status":"pending"}}', now()-interval '40 minutes', NULL)
ON CONFLICT DO NOTHING;

-- 발행 결과 + 성과
INSERT INTO published_posts (tenant_id, platform, external_id, permalink, text, status, published_at, views, likes, replies, reposts, metrics_at) VALUES
 (:'t','threads','t_1001','https://www.threads.net/@monostudio/post/t1001','확인 가능한 마케팅 흐름을 먼저 만듭니다.','published', now()-interval '3 hours', 1840, 124, 18, 6, now()-interval '20 minutes'),
 (:'t','x','x_2001','https://x.com/monostudio_kr/status/2001','초안은 팔지 않습니다. 발행 증거를 팝니다.','published', now()-interval '2 hours', 920, 61, 7, 12, now()-interval '20 minutes'),
 (:'t','instagram','i_3001','https://www.instagram.com/p/i3001/','확인할 수 있는 마케팅 흐름을 카드뉴스로 정리했습니다.','published', now()-interval '1 day', 3120, 268, 31, 0, now()-interval '25 minutes'),
 (:'t','threads','t_1002','https://www.threads.net/@monostudio/post/t1002','위키의 승인된 문단만 초안에 들어갑니다.','published', now()-interval '2 days', 640, 38, 4, 2, now()-interval '30 minutes'),
 (:'t','facebook',NULL,NULL,'페이지 토큰 만료로 발행하지 못했습니다.','failed', now()-interval '5 hours', 0,0,0,0, NULL)
ON CONFLICT DO NOTHING;

-- 팔로워 추이
INSERT INTO growth_metrics (tenant_id, channel, followers, following, recorded_at)
SELECT :'t','threads', 1200 + (d*17), 180, now() - (d || ' days')::interval FROM generate_series(0,13) d
ON CONFLICT DO NOTHING;
INSERT INTO growth_metrics (tenant_id, channel, followers, following, recorded_at)
SELECT :'t','instagram', 2400 + (d*9), 310, now() - (d || ' days')::interval FROM generate_series(0,13) d
ON CONFLICT DO NOTHING;

SELECT 'channel_accounts' AS t, count(*) FROM channel_accounts UNION ALL
SELECT 'drafts', count(*) FROM drafts UNION ALL
SELECT 'queue_posts', count(*) FROM queue_posts UNION ALL
SELECT 'published_posts', count(*) FROM published_posts UNION ALL
SELECT 'growth_metrics', count(*) FROM growth_metrics UNION ALL
SELECT 'wiki_docs', count(*) FROM wiki_docs;
