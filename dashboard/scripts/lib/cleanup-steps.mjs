export async function runCleanupSteps(steps) {
  const failures = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      failures.push({
        label: step.label,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failures;
}
