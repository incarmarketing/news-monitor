import assert from "node:assert/strict";

export async function chooseOption(page, control, value) {
  await control.click();
  await page.locator(`.app-select-content:visible .app-select-item[data-value=${JSON.stringify(String(value))}]`).click();
  assert.equal(await control.getAttribute("data-value"), String(value));
}
