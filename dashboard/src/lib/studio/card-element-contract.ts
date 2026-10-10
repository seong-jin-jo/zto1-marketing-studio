import { z } from "zod";
import type {
  Bubble,
  CardDeckBrand,
  CardDeckCta,
  CardSlideCover,
  HookType,
} from "@/lib/studio/card-deck-contract";
import type { CardTheme } from "@/lib/studio/text-card-image-theme";

export const CARD_DECK_V3_CONTRACT_VERSION = "3.0" as const;
export const CARD_DECK_V3_MAX_BYTES = 256 * 1024;
export const CARD_LOGICAL_WIDTH = 1080;
export const CARD_LOGICAL_HEIGHT = { "4:5": 1350, "1:1": 1080 } as const;
export const CARD_ELEMENT_TYPES = ["text", "image", "shape", "sticker", "logo"] as const;
export const CARD_FONT_FAMILIES = ["Pretendard Variable", "Arial", "Georgia"] as const;
export const CARD_TEXT_BACKGROUND_DEFAULT_COLOR = "#FFFFFF" as const;

export type CardRatioV3 = keyof typeof CARD_LOGICAL_HEIGHT;
export type CardElementType = (typeof CARD_ELEMENT_TYPES)[number];
export type CardFontFamily = (typeof CARD_FONT_FAMILIES)[number];
export type CssHexColor = `#${string}`;

export interface CardElementBase {
  id: string;
  type: CardElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
}

export interface TextElement extends CardElementBase {
  type: "text";
  text: string;
  style: {
    font_family: CardFontFamily;
    font_size: number;
    font_weight: number;
    line_height: number;
    letter_spacing: number;
    color: CssHexColor;
    background_color?: CssHexColor | "transparent";
    align: "left" | "center" | "right";
    vertical_align: "top" | "middle" | "bottom";
  };
}

export interface ImageElement extends CardElementBase {
  type: "image";
  asset_id: string;
  alt: string;
  decorative: boolean;
  fit: "cover" | "contain";
  crop: { x: number; y: number; width: number; height: number };
  corner_radius: number;
}

export interface ShapeElement extends CardElementBase {
  type: "shape";
  shape: "rectangle" | "ellipse" | "line";
  fill: CssHexColor | "transparent";
  stroke: CssHexColor | "transparent";
  stroke_width: number;
  corner_radius: number;
}

export interface StickerElement extends CardElementBase {
  type: "sticker";
  asset_id: string;
  alt: string;
  decorative: boolean;
  fit: "contain";
}

export interface LogoElement extends CardElementBase {
  type: "logo";
  asset_id: string;
  alt: string;
  fit: "contain";
}

export type CardElement = TextElement | ImageElement | ShapeElement | StickerElement | LogoElement;

export interface CardSlideV3 {
  id: string;
  order: number;
  role: "cover" | "body" | "comment_prompt" | "cta";
  content_state: "filled" | "empty";
  background:
    | { kind: "solid"; color: CssHexColor }
    | { kind: "gradient"; from: CssHexColor; to: CssHexColor; angle: number }
    | { kind: "image"; asset_id: string; crop: NormalizedCrop; overlay: CssHexColor | null };
  base:
    | { kind: "plain"; lines: string[] }
    | { kind: "chat_bubble"; cover: CardSlideCover | null; bubbles: Bubble[] };
  elements: CardElement[];
}

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardDeckV3 {
  contract_version: typeof CARD_DECK_V3_CONTRACT_VERSION;
  id: string;
  template: "plain" | "chat_bubble";
  ratio: CardRatioV3;
  revision: number;
  theme: CardTheme;
  brand: CardDeckBrand;
  hook_type: HookType;
  cta: CardDeckCta;
  slides: CardSlideV3[];
  migration?: {
    source_contract_version: "2.0";
    source_sha256: string;
    converter_version: "card-deck-v2-to-v3@1";
  };
}

export class CardDeckV3ValidationError extends Error {
  constructor(readonly code: string, message: string, readonly issues: readonly z.ZodIssue[] = []) {
    super(message);
    this.name = "CardDeckV3ValidationError";
  }
}

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/, "색은 #RRGGBB 또는 #RRGGBBAA 형식이어야 합니다");
const safeId = z.string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9:_.-]+$/, "ID에는 영문, 숫자, :, _, -, .만 사용할 수 있습니다")
  .refine((value) => !value.includes(".."), "ID에는 경로 순회 문자열(..)을 사용할 수 없습니다");
const preciseNumber = z.number().finite().refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7, {
  message: "수는 소수점 셋째 자리까지만 허용됩니다",
});
const nonEmptyText = z.string().min(1).max(2_000);

const geometry = {
  id: safeId,
  name: z.string().trim().min(1).max(100),
  x: preciseNumber,
  y: preciseNumber,
  width: preciseNumber.min(4),
  height: preciseNumber.min(4),
  rotation: preciseNumber.min(-180).max(180),
  z_index: z.number().int().min(0).max(49),
  opacity: preciseNumber.min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
};

const textElementSchema = z.strictObject({
  ...geometry,
  type: z.literal("text"),
  text: z.string().max(2_000),
  style: z.strictObject({
    font_family: z.enum(CARD_FONT_FAMILIES),
    font_size: preciseNumber.min(8).max(240),
    font_weight: preciseNumber.min(100).max(900),
    line_height: preciseNumber.min(0.8).max(2),
    letter_spacing: preciseNumber.min(-20).max(100),
    color: hexColor,
    background_color: z.union([hexColor, z.literal("transparent")]).optional(),
    align: z.enum(["left", "center", "right"]),
    vertical_align: z.enum(["top", "middle", "bottom"]),
  }),
});

const normalizedCropSchema = z.strictObject({
  x: preciseNumber.min(0).max(1),
  y: preciseNumber.min(0).max(1),
  width: preciseNumber.gt(0).max(1),
  height: preciseNumber.gt(0).max(1),
}).refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, {
  message: "자르기 영역은 원본 안에 있어야 합니다",
});

const imageElementSchema = z.strictObject({
  ...geometry,
  type: z.literal("image"),
  asset_id: safeId,
  alt: z.string().max(300),
  decorative: z.boolean(),
  fit: z.enum(["cover", "contain"]),
  crop: normalizedCropSchema,
  corner_radius: preciseNumber.min(0).max(540),
}).refine((element) => element.decorative || element.alt.trim().length > 0, {
  message: "사진에는 대체 텍스트가 있거나 decorative=true여야 합니다",
  path: ["alt"],
});

const paint = z.union([hexColor, z.literal("transparent")]);
const shapeElementSchema = z.strictObject({
  ...geometry,
  type: z.literal("shape"),
  shape: z.enum(["rectangle", "ellipse", "line"]),
  fill: paint,
  stroke: paint,
  stroke_width: preciseNumber.min(0).max(100),
  corner_radius: preciseNumber.min(0).max(540),
}).refine((element) => element.shape !== "line" || (element.width >= 8 && element.height >= 1), {
  message: "선은 폭 8px, 높이 1px 이상이어야 합니다",
});

const stickerElementSchema = z.strictObject({
  ...geometry,
  type: z.literal("sticker"),
  asset_id: safeId,
  alt: z.string().max(300),
  decorative: z.boolean(),
  fit: z.literal("contain"),
});

const logoElementSchema = z.strictObject({
  ...geometry,
  type: z.literal("logo"),
  asset_id: safeId,
  alt: nonEmptyText,
  fit: z.literal("contain"),
});

export const cardElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
  stickerElementSchema,
  logoElementSchema,
]);

const segmentSchema = z.strictObject({ text: nonEmptyText.max(120), bold: z.boolean() });
const bubbleSchema = z.strictObject({
  id: safeId,
  order: z.number().int().min(0),
  speaker: z.enum(["reader", "brand"]),
  segments: z.array(segmentSchema).min(1),
  reaction: z.union([z.literal("heart"), z.null()]),
});
const coverSchema = z.strictObject({ headline: z.string().max(2_000), sub: z.string().max(2_000).nullable() });

const backgroundSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("solid"), color: hexColor }),
  z.strictObject({ kind: z.literal("gradient"), from: hexColor, to: hexColor, angle: preciseNumber.min(-360).max(360) }),
  z.strictObject({ kind: z.literal("image"), asset_id: safeId, crop: normalizedCropSchema, overlay: hexColor.nullable() }),
]);

const slideSchema = z.strictObject({
  id: safeId,
  order: z.number().int().min(0).max(10),
  role: z.enum(["cover", "body", "comment_prompt", "cta"]),
  content_state: z.enum(["filled", "empty"]),
  background: backgroundSchema,
  base: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("plain"), lines: z.array(z.string().max(2_000)).max(50) }),
    z.strictObject({ kind: z.literal("chat_bubble"), cover: coverSchema.nullable(), bubbles: z.array(bubbleSchema).max(50) }),
  ]),
  elements: z.array(cardElementSchema).max(50),
});

const deckSchema = z.strictObject({
  contract_version: z.literal(CARD_DECK_V3_CONTRACT_VERSION),
  id: safeId,
  template: z.enum(["plain", "chat_bubble"]),
  ratio: z.enum(["4:5", "1:1"]),
  revision: z.number().int().min(0),
  theme: z.strictObject({ background: hexColor, foreground: hexColor, accent: hexColor }),
  brand: z.strictObject({
    display_name: nonEmptyText,
    handle: z.string().max(200).nullable(),
    reader_name: nonEmptyText.optional(),
    profile_image_url: z.string().url().nullable().optional(),
    profile_image_asset_id: safeId.nullable().optional(),
  }),
  hook_type: z.enum(["question", "number", "pain"]),
  cta: z.strictObject({ keyword: z.string().min(2).max(8), comment_example: nonEmptyText, save_reason: z.string().min(6).max(2_000) }),
  slides: z.array(slideSchema).min(2).max(11),
  migration: z.strictObject({
    source_contract_version: z.literal("2.0"),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    converter_version: z.literal("card-deck-v2-to-v3@1"),
  }).optional(),
}).superRefine((deck, context) => {
  const slideIds = new Set<string>();
  const elementIds = new Set<string>();
  deck.slides.forEach((slide, slideIndex) => {
    if (slide.order !== slideIndex) {
      context.addIssue({ code: "custom", path: ["slides", slideIndex, "order"], message: `장 순서는 ${slideIndex}여야 합니다` });
    }
    if (slideIds.has(slide.id)) {
      context.addIssue({ code: "custom", path: ["slides", slideIndex, "id"], message: "장 ID가 중복됐습니다" });
    }
    slideIds.add(slide.id);
    const zIndexes = slide.elements.map((element) => element.z_index).sort((left, right) => left - right);
    zIndexes.forEach((zIndex, index) => {
      if (zIndex !== index) {
        context.addIssue({ code: "custom", path: ["slides", slideIndex, "elements"], message: "요소 층 순서는 0부터 연속이어야 합니다" });
      }
    });
    slide.elements.forEach((element, elementIndex) => {
      if (elementIds.has(element.id)) {
        context.addIssue({ code: "custom", path: ["slides", slideIndex, "elements", elementIndex, "id"], message: "요소 ID가 덱 안에서 중복됐습니다" });
      }
      elementIds.add(element.id);
      const radians = element.rotation * Math.PI / 180;
      const rotatedWidth = Math.abs(element.width * Math.cos(radians)) + Math.abs(element.height * Math.sin(radians));
      const rotatedHeight = Math.abs(element.width * Math.sin(radians)) + Math.abs(element.height * Math.cos(radians));
      const centerX = element.x + element.width / 2;
      const centerY = element.y + element.height / 2;
      const stageHeight = CARD_LOGICAL_HEIGHT[deck.ratio];
      const intersects = centerX + rotatedWidth / 2 >= 1
        && centerX - rotatedWidth / 2 <= CARD_LOGICAL_WIDTH - 1
        && centerY + rotatedHeight / 2 >= 1
        && centerY - rotatedHeight / 2 <= stageHeight - 1;
      if (!intersects) {
        context.addIssue({ code: "custom", path: ["slides", slideIndex, "elements", elementIndex], message: "회전된 요소가 장과 최소 1px 교차해야 합니다" });
      }
    });
  });
  if (deck.slides[0]?.role !== "cover" || deck.slides.at(-1)?.role !== "cta") {
    context.addIssue({ code: "custom", path: ["slides"], message: "첫 장은 cover, 마지막 장은 cta여야 합니다" });
  }
});

function validationCode(issues: readonly z.ZodIssue[]): string {
  const message = issues[0]?.message ?? "카드 요소 계약이 올바르지 않습니다";
  const field = String(issues[0]?.path.at(-1) ?? "");
  if (/층 순서/.test(message)) return "INVALID_ELEMENT_ORDER";
  if (/자르기/.test(message)) return "INVALID_CROP";
  if (/대체 텍스트/.test(message)) return "ALT_TEXT_REQUIRED";
  if (/장 순서|장 ID|첫 장/.test(message)) return "INVALID_SLIDE_SET";
  if (["x", "y", "width", "height", "rotation", "opacity"].includes(field) || /요소|px|소수점|수는/.test(message)) return "INVALID_ELEMENT_GEOMETRY";
  if (/색/.test(message)) return "INVALID_COLOR";
  return "INVALID_CARD_DECK_V3";
}

export function validateCardDeckV3(value: unknown): asserts value is CardDeckV3 {
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > CARD_DECK_V3_MAX_BYTES) {
    throw new CardDeckV3ValidationError("CARD_DECK_TOO_LARGE", "카드 요소 덱은 256 KiB 이하여야 합니다");
  }
  const result = deckSchema.safeParse(value);
  if (!result.success) {
    throw new CardDeckV3ValidationError(validationCode(result.error.issues), result.error.issues[0]?.message ?? "카드 요소 계약이 올바르지 않습니다", result.error.issues);
  }
}

export function parseCardDeckV3(value: unknown): CardDeckV3 {
  validateCardDeckV3(value);
  return value;
}

export function cardDeckV3Projection(deck: CardDeckV3): string[] {
  return deck.slides.map((slide) => {
    if (slide.base.kind === "chat_bubble") {
      const coverLines = slide.base.cover
        ? [slide.base.cover.headline.trim(), slide.base.cover.sub?.trim() ?? ""].filter(Boolean)
        : [];
      const bubbleLines = [...slide.base.bubbles]
        .sort((left, right) => left.order - right.order)
        .map((bubble) => bubble.segments.map((segment) => segment.text).join("").trim())
        .filter(Boolean);
      return [...coverLines, ...bubbleLines].join("\n");
    }
    const text = slide.elements
      .filter((element): element is TextElement => element.type === "text" && !element.hidden)
      .sort((left, right) => left.z_index - right.z_index)
      .map((element) => element.text.trim())
      .filter(Boolean);
    if (text.length) return text.join("\n");
    return slide.base.lines.join("\n");
  });
}
