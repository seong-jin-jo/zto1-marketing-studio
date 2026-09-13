import { Type } from "typebox";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  beginQueuePublishAttempt,
  recordQueueProviderResult,
  resolvePublisherQueuePath,
} from "../../threads-queue/api.js";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

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
        description: "Public URL of an image to attach. When provided, the post becomes an IMAGE type instead of TEXT.",
      }),
    ),
    quote_post_id: Type.Optional(
      Type.String({
        description: "Media ID of a Threads post to quote. Creates a quote post with your text + the quoted post.",
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
      const attempt = await beginQueuePublishAttempt({ queuePath, postId, channel: "threads", claimToken });
      let resultRecorded = false;

      try {

      // Convert local /images/ path to public URL via temporary upload
      if (imageUrl && imageUrl.startsWith("/images/")) {
        const filename = imageUrl.replace("/images/", "");
        const dataDir = process.env.DATA_DIR || resolve(process.cwd(), "data");
        const localPath = resolve(dataDir, "images", filename);
        const fileBuffer = await readFile(localPath);
        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);
        const uploadResp = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: formData });
        if (!uploadResp.ok) {
          throw new Error(`Image upload failed (${uploadResp.status}). Cannot publish image without public URL.`);
        }
        const uploadData = (await uploadResp.json()) as { data?: { url?: string } };
        const tmpUrl = uploadData.data?.url;
        if (!tmpUrl) {
          throw new Error("Image upload returned no URL.");
        }
        // tmpfiles.org requires /dl/ prefix for direct download
        imageUrl = tmpUrl.replace("tmpfiles.org/", "tmpfiles.org/dl/");
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
        throw new Error(`Threads container creation failed (${createResp.status}): ${err}`);
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
        throw new Error(`Threads publish failed (${publishResp.status}): ${err}`);
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
