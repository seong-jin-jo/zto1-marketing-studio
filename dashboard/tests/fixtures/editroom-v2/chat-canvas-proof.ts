import sourceFixture from "../../studio/fixtures/deck-d100.v2.json";
import type { CardDeck } from "../../../src/lib/studio/card-deck-contract";
import { renderChatBubbleSlideToCanvas } from "../../../src/lib/studio/card-templates/chat-bubble";

const profileSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAnIGhlaWdodD0nMTYwJz48cmVjdCB3aWR0aD0nMTYwJyBoZWlnaHQ9JzE2MCcgZmlsbD0nI0ZFNDUwMCcvPjxjaXJjbGUgY3g9JzgwJyBjeT0nNTUnIHI9JzMwJyBmaWxsPScjRkZGRkZGJy8+PHBhdGggZD0nTTMwIDE0MGM1LTM1IDk1LTM1IDEwMCAwJyBmaWxsPScjRkZGRkZGJy8+PC9zdmc+";
const deck = structuredClone(sourceFixture) as unknown as CardDeck;
deck.brand.profile_image_url = profileSvg;
deck.brand.profile_image_asset_id = "s5b-profile.svg";
const slide = deck.slides.find((candidate) => candidate.role === "chat") ?? deck.slides[1];
const canvas = await renderChatBubbleSlideToCanvas({ deck, slide, index: slide.order, total: deck.slides.length });
if (!canvas) throw new Error("S5B_BROWSER_CANVAS_EMPTY");
canvas.dataset.browserCanvasProof = "ready";
canvas.setAttribute("aria-label", "카톡 브라우저 canvas 증거");
document.querySelector("#proof")?.append(canvas);
