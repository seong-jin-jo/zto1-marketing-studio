import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { getChannelCred, fetchXPublicMetrics, fetchMetaPostMetrics, fetchYouTubeMetrics } from "@/lib/publish";
import { readJson, writeJson, dataPath } from "@/lib/file-io";
import { runWithTenant } from "@/lib/tenant-context";
import { fetchTikTokVideoMetrics } from "@/lib/tiktok";
import {
  buildPerformanceMetricsCoverage,
  type MetricsCoverageAggregateRow,
} from "@/lib/performance-metrics-coverage";

const THREADS_API = "https://graph.threads.net/v1.0";

// 온보딩 체크리스트용: 성과 수집을 한 번이라도 돌리면 "analytics 확인" 단계 완료로 표시.
function markAnalyticsViewed(tenantId: string) {
  try {
    runWithTenant(tenantId, () => {
      const s = readJson<Record<string, unknown>>(dataPath("settings.json")) || {};
      if (s.analyticsViewed !== true) { s.analyticsViewed = true; writeJson(dataPath("settings.json"), s); }
    });
  } catch { /* 비차단 */ }
}

// GET /api/metrics?tenant_id=... — 발행물 + 성과 목록(성과 대시보드)
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) {
    return Response.json({ posts: [], coverage: buildPerformanceMetricsCoverage([]) });
  }
  try {
    const { posts, coverageRows } = await withTenant(tenantId, async (sql) => {
      const posts = await sql`
        SELECT id, platform, external_id, permalink, text, status, error, published_at,
               views, likes, replies, reposts, metrics_at,
               provider_meta -> 'metricsBlocked' AS metrics_blocked
        FROM published_posts WHERE tenant_id = ${tenantId}
        ORDER BY published_at DESC LIMIT 100`;
      const coverageRows = await sql<MetricsCoverageAggregateRow[]>`
        SELECT platform,
               COUNT(*) FILTER (WHERE status = 'published')::int AS published_count,
               COUNT(*) FILTER (WHERE status = 'published' AND metrics_at IS NOT NULL)::int AS collected_count,
               MAX(metrics_at)::text AS last_collected_at
        FROM published_posts
        WHERE tenant_id = ${tenantId}
        GROUP BY platform`;
      return { posts, coverageRows };
    });
    return Response.json({ posts, coverage: buildPerformanceMetricsCoverage(coverageRows) });
  } catch (e) {
    return Response.json({
      posts: [],
      coverage: buildPerformanceMetricsCoverage([]),
      error: String(e),
    }, { status: 500 });
  }
}

// POST /api/metrics — 성과 수집 { tenant_id }. 연결된 채널 자격증명 필요.
export async function POST(request: Request) {
  const __b = await request.json();
  const tenant_id = await effectiveTenantId(request, __b.tenant_id);
  if (!tenant_id) return Response.json({ error: "tenant_id required" }, { status: 400 });
  const cred = await getChannelCred(tenant_id, "threads");
  const xCred = await getChannelCred(tenant_id, "x");
  const igCred = await getChannelCred(tenant_id, "instagram");
  const fbCred = await getChannelCred(tenant_id, "facebook");
  // 2026-09-10: YouTube 는 연결돼 있는데도 수집 대상이 아니었다. 숏폼을 올려도 결과가
  // 영영 안 돌아왔다. 되받을 숫자가 없으면 다음 제안이 뻔해진다.
  const ytCred = await getChannelCred(tenant_id, "youtube");
  const tiktokCred = await getChannelCred(tenant_id, "tiktok");
  // 2026-09-09: 종전에는 Threads 가 없으면 여기서 끝냈다. 그래서 X 만 연결한 사람은
  // 성과 수집을 아예 못 돌렸다. 둘 다 없을 때만 막는다.
  if (!cred && !xCred && !igCred && !fbCred && !ytCred && !tiktokCred) {
    return Response.json({ ok: false, error: "성과를 읽어 올 수 있는 채널이 연결돼 있지 않습니다. Threads, X, Instagram, Facebook, YouTube, TikTok 중 하나를 연결해 주세요." }, { status: 400 });
  }
  try {
    const { updated, total, skipped } = await withTenant(tenant_id, async (sql) => {
      const rows = cred ? await sql<{ id: string; external_id: string }[]>`
        SELECT id, external_id FROM published_posts
        WHERE tenant_id = ${tenant_id} AND platform = 'threads' AND external_id IS NOT NULL` : [];
      let n = 0;
      // 2026-09-05 회장 계정 실측: 수집 대상 1건인데 갱신 0건으로 끝나고 화면에는 아무
      // 말이 없었다. 제공자 응답이 실패하면 여기서 조용히 건너뛰었기 때문이다. 사유를
      // 모으면 화면이 "왜 안 모였는지"를 말할 수 있다. 토큰은 절대 남기지 않는다.
      const skipped: string[] = [];
      for (const r of rows) {
        const threadsToken = cred!.token;
        try {
          const resp = await fetch(`${THREADS_API}/${r.external_id}/insights?metric=views,likes,replies,reposts&access_token=${threadsToken}`);
          if (!resp.ok) {
            const detail = (await resp.text().catch(() => "")).slice(0, 200);
            // 성과 조회가 막혔을 때 원인이 둘로 갈린다. 게시물을 못 찾는 것과 권한이 없는
            // 것이다. 제공자 문구만으로는 구분되지 않아("does not exist, cannot be loaded
            // due to missing permissions, or does not support this operation") 기본 조회를
            // 한 번 더 해 본다. 기본 조회가 되면 게시물은 있고 성과 권한만 없는 것이다.
            const basic = await fetch(`${THREADS_API}/${r.external_id}?fields=id&access_token=${threadsToken}`)
              .then((res) => res.status).catch(() => 0);
            // 저장한 식별자가 이 계정의 게시물 목록에 있는지 본다. 없으면 우리가 잘못된
            // 식별자를 저장한 것이고, 있으면 조회 권한 문제다. 이 구분이 있어야 다음
            // 조치가 갈린다(우리 데이터 교정 대 채널 재연결).
            const own = await fetch(`${THREADS_API}/me/threads?fields=id&limit=25&access_token=${threadsToken}`)
              .then(async (res) => res.ok
                ? { status: res.status, ids: ((await res.json()) as { data?: { id: string }[] }).data?.map((x) => x.id) ?? [] }
                : { status: res.status, ids: [] as string[] })
              .catch(() => ({ status: 0, ids: [] as string[] }));
            console.error("[metrics][collect-skip] threads insights", resp.status, "basic", basic,
              "ownList", own.status, "ownCount", own.ids.length,
              "idInOwnList", own.ids.includes(r.external_id), detail);
            // 2026-09-05 실측: 토큰은 정상(목록 조회 200)인데 그 계정의 게시물 목록이
            // 0건이고 우리가 저장한 식별자도 목록에 없었다. 발행에 쓴 계정과 지금 연결된
            // 계정이 다를 때 이 모양이 된다. 사용자에게는 재연결 대상이 계정이라는 것을
            // 알려야 다음 행동이 정해진다.
            const skipCode = basic === 200 ? "insights_forbidden"
              : own.status === 200 && !own.ids.includes(r.external_id) ? "post_not_in_account"
                : `provider_${resp.status}`;
            skipped.push(skipCode);
            // 글 단위로 "왜 이 글은 못 재는지"를 남긴다. 남기지 않으면 성과실이 전부를
            // "아직 수집 안 함"으로 뭉뚱그려, 기다리면 채워질 것처럼 보인다. 실제로는
            // 계정이 바뀌기 전까지 영원히 안 채워지는 글이다(2026-09-05 실측).
            await sql`
              UPDATE published_posts
              SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
                metricsBlocked: { code: skipCode, at: new Date().toISOString() },
              } as never)}
              WHERE id = ${r.id}`;
            continue;
          }
          const data = (await resp.json()) as { data?: { name: string; values: { value: number }[] }[] };
          const m: Record<string, number> = {};
          for (const d of data.data ?? []) m[d.name] = d.values?.[0]?.value ?? 0;
          await sql`
            UPDATE published_posts
            SET views = ${m.views ?? 0}, likes = ${m.likes ?? 0}, replies = ${m.replies ?? 0},
                reposts = ${m.reposts ?? 0}, metrics_at = now(),
                -- 다시 재지게 되면 막힘 표식을 지운다. 남겨 두면 고쳐진 뒤에도 경고가 남는다.
                provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked'
            WHERE id = ${r.id}`;
          n++;
        } catch (error) {
          console.error("[metrics][collect-skip] threads exception",
            error instanceof Error ? error.message : String(error));
          skipped.push("exception");
        }
      }
      // ── X 성과 수집 ────────────────────────────────────────────────────
      // 2026-09-09 회장 지적("성과 수집이 Threads 만"). 우리는 X 로 발행까지 하면서
      // 그 결과를 한 번도 되받지 않았다. 사업계획의 One Thing 은 "결과를 되받아 다음
      // 제안으로 돌린다" 인데, 되받는 칸이 비면 그 뒤 칸이 전부 비어 돈다.
      let xTotal = 0;
      if (xCred) {
        const xRows = await sql<{ id: string; external_id: string }[]>`
          SELECT id, external_id FROM published_posts
          WHERE tenant_id = ${tenant_id} AND platform = 'x' AND external_id IS NOT NULL`;
        xTotal = xRows.length;
        if (xRows.length) {
          // 한 번에 묶어 묻는다. 글마다 따로 부르면 X 시간당 한도에 금방 닿는다.
          const result = await fetchXPublicMetrics(xCred, xRows.map((r) => r.external_id));
          if (!result.ok) {
            console.error("[metrics][collect-skip] x", result.status ?? "", result.error);
            skipped.push(`x_${result.status ?? "error"}`);
          } else {
            for (const r of xRows) {
              const m = result.metrics[r.external_id];
              if (!m) {
                // 응답에 없는 글은 지운 글이거나 다른 계정의 글이다. 기다려도 안 채워진다.
                await sql`
                  UPDATE published_posts
                  SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
                    metricsBlocked: { code: "post_not_in_account", at: new Date().toISOString() },
                  } as never)}
                  WHERE id = ${r.id}`;
                continue;
              }
              await sql`
                UPDATE published_posts
                SET views = ${m.views}, likes = ${m.likes}, replies = ${m.replies},
                    reposts = ${m.reposts}, metrics_at = now(),
                    provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked'
                WHERE id = ${r.id}`;
              n++;
            }
          }
        }
      }
      // ── Instagram 피드·Reels·Facebook 성과 수집 ──────────────────────
      // Reels 발행 결과도 Instagram Media ID 다. 피드와 같은 Instagram 자격증명을 쓰지만
      // 요청 지표가 달라 수집 호출은 분리한다. 저장 이름 두 갈래는 한 대상으로 합친다.
      let metaTotal = 0;
      for (const [platform, metaCred] of [
        ["instagram", igCred],
        ["instagram_reels", igCred],
        ["facebook", fbCred],
      ] as const) {
        if (!metaCred) continue;
        const metaRows = platform === "instagram"
          ? await sql<{ id: string; external_id: string }[]>`
              SELECT id, external_id FROM published_posts
              WHERE tenant_id = ${tenant_id} AND platform = 'instagram' AND external_id IS NOT NULL`
          : platform === "instagram_reels"
            ? await sql<{ id: string; external_id: string }[]>`
                SELECT id, external_id FROM published_posts
                WHERE tenant_id = ${tenant_id}
                  AND platform IN ('instagram_reels', 'reels')
                  AND external_id IS NOT NULL`
          : await sql<{ id: string; external_id: string }[]>`
              SELECT id, external_id FROM published_posts
              WHERE tenant_id = ${tenant_id} AND platform = 'facebook' AND external_id IS NOT NULL`;
        metaTotal += metaRows.length;
        if (!metaRows.length) continue;
        const result = await fetchMetaPostMetrics(metaCred, platform, metaRows.map((r) => r.external_id));
        if (!result.ok) {
          console.error("[metrics][collect-skip]", platform, result.error);
          skipped.push(`${platform}_error`);
          continue;
        }
        for (const r of metaRows) {
          const m = result.metrics[r.external_id];
          if (!m) {
            await sql`
              UPDATE published_posts
              SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
                metricsBlocked: { code: "insights_forbidden", at: new Date().toISOString() },
              } as never)}
              WHERE id = ${r.id}`;
            continue;
          }
          await sql`
            UPDATE published_posts
            SET views = ${m.views}, likes = ${m.likes}, replies = ${m.replies}, metrics_at = now(),
                provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked'
            WHERE id = ${r.id}`;
          n++;
        }
      }
      // ── YouTube·쇼츠 성과 수집 ────────────────────────────────────────
      // 같은 자격증명으로 두 갈래를 함께 읽는다. 쇼츠도 YouTube 영상이라 조회 방법이 같은데,
      // 갈래 이름이 다르다는 이유로 한쪽만 읽으면 그쪽 성과가 영영 안 모인다.
      let ytTotal = 0;
      if (ytCred) {
        const ytRows = await sql<{ id: string; external_id: string }[]>`
          SELECT id, external_id FROM published_posts
          WHERE tenant_id = ${tenant_id} AND platform IN ('youtube', 'shorts') AND external_id IS NOT NULL`;
        ytTotal = ytRows.length;
        if (ytRows.length) {
          const result = await fetchYouTubeMetrics(ytCred, ytRows.map((r) => r.external_id));
          if (!result.ok) {
            console.error("[metrics][collect-skip] youtube", result.status ?? "", result.error);
            skipped.push(`youtube_${result.status ?? "error"}`);
          } else {
            for (const r of ytRows) {
              const m = result.metrics[r.external_id];
              if (!m) {
                // 비공개거나 지운 영상은 응답에서 그냥 빠진다. 기다려도 안 채워지므로
                // 그렇게 표시해야 사용자가 무한정 기다리지 않는다.
                await sql`
                  UPDATE published_posts
                  SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
                    metricsBlocked: { code: "video_not_visible", at: new Date().toISOString() },
                  } as never)}
                  WHERE id = ${r.id}`;
                continue;
              }
              await sql`
                UPDATE published_posts
                SET views = ${m.views}, likes = ${m.likes}, replies = ${m.replies}, metrics_at = now(),
                    provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked'
                WHERE id = ${r.id}`;
              n++;
            }
          }
        }
      }
      // TikTok 발행 결과의 실제 영상 ID는 published_posts.external_id에 저장된다. Display API는
      // video.list 권한으로 한 번에 20개씩 조회하므로 공용 helper가 분할 호출을 책임진다.
      let tiktokTotal = 0;
      if (tiktokCred) {
        const tiktokRows = await sql<{ id: string; external_id: string }[]>`
          SELECT id, external_id FROM published_posts
          WHERE tenant_id = ${tenant_id} AND platform = 'tiktok' AND external_id IS NOT NULL`;
        tiktokTotal = tiktokRows.length;
        if (tiktokRows.length) {
          const result = await fetchTikTokVideoMetrics(
            tiktokCred.token,
            tiktokRows.map((row) => row.external_id),
          );
          if (!result.ok) {
            console.error("[metrics][collect-skip] tiktok", result.status ?? "", result.error);
            const skipCode = result.status === 401 || result.status === 403
              ? "insights_forbidden"
              : `tiktok_${result.status ?? "error"}`;
            skipped.push(skipCode);
            for (const row of tiktokRows) {
              await sql`
                UPDATE published_posts
                SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
                  metricsBlocked: { code: skipCode, at: new Date().toISOString() },
                } as never)}
                WHERE id = ${row.id}`;
            }
          } else {
            for (const row of tiktokRows) {
              const metric = result.metrics[row.external_id];
              if (!metric) {
                await sql`
                  UPDATE published_posts
                  SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
                    metricsBlocked: { code: "video_not_visible", at: new Date().toISOString() },
                  } as never)}
                  WHERE id = ${row.id}`;
                skipped.push("video_not_visible");
                continue;
              }
              await sql`
                UPDATE published_posts
                SET views = ${metric.views}, likes = ${metric.likes}, replies = ${metric.replies},
                    reposts = ${metric.reposts}, metrics_at = now(),
                    provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked'
                WHERE id = ${row.id}`;
              n++;
            }
          }
        }
      }
      return { updated: n, total: rows.length + xTotal + metaTotal + ytTotal + tiktokTotal, skipped };
    });
    markAnalyticsViewed(tenant_id);
    // 수집 대상이 있는데 하나도 못 모았으면 그것을 성공으로 말하지 않는다.
    const collectionBlocked = total > 0 && updated === 0;
    return Response.json({
      ok: true,
      updated,
      total,
      ...(collectionBlocked ? {
        collectionBlocked: true,
        reason: skipped.includes("exception")
          ? "성과 조회 중 오류가 났습니다. 잠시 후 다시 시도해 주세요."
          : skipped.includes("post_not_in_account")
            ? "연결된 채널 계정에서 이 게시물을 찾을 수 없습니다. 글을 올린 계정과 지금 연결된 계정이 다를 수 있습니다. 채널을 다시 연결하면서 글을 올린 계정을 선택해 주세요."
          : skipped.includes("video_not_visible")
            ? "연결된 채널 계정에서 이 영상을 찾을 수 없습니다. 영상이 비공개 또는 삭제됐거나 다른 계정으로 발행됐는지 확인해 주세요."
          : skipped.includes("insights_forbidden")
            ? "게시물은 확인되는데 성과 조회 권한이 없습니다. 채널을 다시 연결해 성과 조회 권한을 허용해 주세요."
            : `채널이 성과 조회를 거절했습니다(응답 ${skipped[0] ?? "알 수 없음"}). 채널을 다시 연결한 뒤 시도해 주세요.`,
      } : {}),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
