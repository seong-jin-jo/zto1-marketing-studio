export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("동시 실행 수는 1 이상의 안전한 정수여야 합니다");
  }

  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }));
}
