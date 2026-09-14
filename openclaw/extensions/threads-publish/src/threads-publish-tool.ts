import { jsonResult, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { Type } from "typebox";
import {
  beginQueuePublishAttempt,
  recordQueueProviderResult,
  resolvePublisherQueuePath,
} from "../../threads-queue/api.js";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

const LOCAL_IMAGE_PREFIX = "/images/";

type ThreadsPublishConfig = {
  accessToken?: string;
  userId?: string;
  queuePath?: string;
};

function resolveConfig(api: OpenClawPluginApi): { accessToken: string; userId: string } {
  const pluginCfg = (api.pluginConfig ?? {}) as ThreadsPublishConfig;
  const accessToken =
    (typeof pluginCfg.accessToken === "string" && pluginCfg.accessToken.trim()) ||
    process.env.THREADS_ACCESS_TOKEN ||
    "";
  const userId =
    (typeof pluginCfg.userId === "string" && pluginCfg.userId.trim()) ||
    process.env.THREADS_USER_ID ||
    "";
  if (!accessToken) {
    throw new Error(
      "Threads access token not configured. Set THREADS_ACCESS_TOKEN env var or configure in plugin settings.",
    );
  }
  if (!userId) {
    throw new Error(
      "Threads user ID not configured. Set THREADS_USER_ID env var or configure in plugin settings.",
    );
  }
  return { accessToken, userId };
}

const ThreadsPublishToolSchema = Type.Object(
  {
    text: Type.String({
      description: "The text content to publish on Threads. Max 500 characters.",
    }),
    image_url: Type.Optional(
      Type.String({
        description:
          "Public URL of an image to attach. When provided, the post becomes an IMAGE type instead of TEXT.",
      }),
    ),
    quote_post_id: Type.Optional(
      Type.String({
        description:
          "Media ID of a Threads post to quote. Creates a quote post with your text + the quoted post.",
      }),
    ),
    queue_id: Type.String({ description: "get_approved가 반환한 큐 작업물 ID." }),
    claim_token: Type.String({ description: "get_approved가 반환한 claimToken." }),
  },
  { additionalProperties: false },
);

export function createThreadsPublishTool(api: OpenClawPluginApi) {
  return {
    name: "threads_publish",
    label: "Threads Publish",
    description:
      "Publish a text or image post to Meta Threads. Uses 2-step flow: create media container, then publish. Pass image_url for image posts.",
    parameters: ThreadsPublishToolSchema,
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const text = readStringParam(rawParams, "text", { required: true });
      const postId = readStringParam(rawParams, "queue_id", { required: true });
      const claimToken = readStringParam(rawParams, "claim_token", { required: true });
      if (text.length > 500) {
        throw new Error(`Text exceeds 500 character limit (${text.length} chars).`);
      }

      let imageUrl = readStringParam(rawParams, "image_url");
      const quotePostId = readStringParam(rawParams, "quote_post_id");
      const { accessToken, userId } = resolveConfig(api);
      const queuePath = resolvePublisherQueuePath((api.pluginConfig ?? {}) as ThreadsPublishConfig);
      const attempt = await beginQueuePublishAttempt({
        queuePath,
        postId,
        channel: "threads",
        claimToken,
        payload: { text, imageUrls: imageUrl ? [imageUrl] : [], quotePostId },
      });
      let resultRecorded = false;
      const recordProviderFailure = async (error: string) => {
        await recordQueueProviderResult({
          queuePath,
          postId,
          channel: "threads",
          claimToken,
          idempotencyKey: attempt.idempotencyKey,
          state: "provider_failed",
          error,
        });
        resultRecorded = true;
      };

      try {
        // Meta가 읽을 URL의 저장과 만료 계약이 생기기 전에는 로컬 고객 이미지를 외부에 복제하지 않는다.
        if (imageUrl && imageUrl.startsWith("/images/")) {
          const message = "보호된 이미지 배달 저장소가 준비되지 않아 발행하지 않았습니다";
          await recordProviderFailure(message);
          throw new Error(message);
        }

        // Step 1: Create media container
        const createUrl = `${THREADS_API_BASE}/${userId}/threads`;
        const containerParams: Record<string, string> = {
          media_type: imageUrl ? "IMAGE" : "TEXT",
          text,
          access_token: accessToken,
        };
        if (imageUrl) {
          containerParams.image_url = imageUrl;
        }
        if (quotePostId) {
          containerParams.quote_post_id = quotePostId;
        }
        const createResp = await fetch(createUrl, {
          method: "POST",
          body: new URLSearchParams(containerParams),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": attempt.idempotencyKey,
          },
        });

        if (!createResp.ok) {
          const err = await createResp.text();
          const message = `Threads container creation failed (${createResp.status}): ${err}`;
          await recordProviderFailure(message);
          throw new Error(message);
        }

        const createData = (await createResp.json()) as { id: string };
        const containerId = createData.id;

        // Step 2: Publish the container
        const publishUrl = `${THREADS_API_BASE}/${userId}/threads_publish`;
        const publishResp = await fetch(publishUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": attempt.idempotencyKey,
          },
          body: new URLSearchParams({
            creation_id: containerId,
            access_token: accessToken,
          }),
        });

        if (!publishResp.ok) {
          const err = await publishResp.text();
          const message = `Threads publish failed (${publishResp.status}): ${err}`;
          await recordProviderFailure(message);
          throw new Error(message);
        }

        const publishData = (await publishResp.json()) as { id: string };

        await recordQueueProviderResult({
          queuePath,
          postId,
          channel: "threads",
          claimToken,
          idempotencyKey: attempt.idempotencyKey,
          state: "provider_succeeded",
          providerId: publishData.id,
        });
        resultRecorded = true;

        return jsonResult({
          success: true,
          threadsMediaId: publishData.id,
          containerId,
          textLength: text.length,
          mediaType: imageUrl ? "IMAGE" : "TEXT",
          quoted: quotePostId || null,
          idempotencyKey: attempt.idempotencyKey,
        });
      } catch (error) {
        if (!resultRecorded) {
          await recordQueueProviderResult({
            queuePath,
            postId,
            channel: "threads",
            claimToken,
            idempotencyKey: attempt.idempotencyKey,
            state: "result_unknown",
            error: error instanceof Error ? error.message : String(error),
          }).catch(() => {});
        }
        throw error;
      }
    },
  };
}
