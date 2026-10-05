import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CARD_FONT_ERROR_CODE = "FONT_LOAD_FAILED" as const;
export const CARD_FONT_FAMILY = "Pretendard Variable" as const;
export const CARD_FONT_PUBLIC_FILE = "public/fonts/PretendardVariable.woff2" as const;
export const CARD_FONT_LICENSE_FILE = "public/fonts/Pretendard-LICENSE.txt" as const;
export const CARD_FONT_SHA256 = "9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4" as const;

export class CardFontLoadError extends Error {
  readonly code = CARD_FONT_ERROR_CODE;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CardFontLoadError";
  }
}

export function assertCardFontReady(options: { fontPath?: string } = {}): string {
  const fontPath = options.fontPath ?? path.join(process.cwd(), CARD_FONT_PUBLIC_FILE);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(fontPath);
  } catch (cause) {
    throw new CardFontLoadError(`${CARD_FONT_ERROR_CODE}: 고정 Pretendard 폰트를 읽지 못했습니다.`, { cause });
  }
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actual !== CARD_FONT_SHA256) {
    throw new CardFontLoadError(`${CARD_FONT_ERROR_CODE}: Pretendard 파일 hash가 고정값과 다릅니다.`);
  }
  return fontPath;
}
