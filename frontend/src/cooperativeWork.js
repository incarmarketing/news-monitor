export async function mapCooperatively(rows, project, {
  signal,
  budgetMs = 8,
  now = () => performance.now(),
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
} = {}) {
  const result = [];
  let started = now();
  for (let index = 0; index < rows.length; index += 1) {
    if (signal?.aborted) throw new DOMException("Work cancelled", "AbortError");
    result.push(project(rows[index], index));
    if (now() - started >= budgetMs && index + 1 < rows.length) {
      await yieldControl();
      started = now();
    }
  }
  if (signal?.aborted) throw new DOMException("Work cancelled", "AbortError");
  return result;
}
