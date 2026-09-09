import { navItems } from "../src/data.js";

export const sections = navItems.map(({ id, label }) => ({ id, name: id, label }));

export function expectedSection(id, width) {
  return id === "reports" && width <= 1240 ? "overview" : id;
}

export function validateSectionState({ requested, width, actual, visibleText, errors = [] }) {
  const expected = expectedSection(requested, width);
  const failures = [];
  if (actual !== expected) failures.push(`Expected ${expected}, received ${actual || "no app shell"}`);
  if (!visibleText || visibleText.trim().length < 20) failures.push("Active workspace is empty");
  if (/화면 불러오는 중|화면을 표시하지 못|문제가 발생했습니다/.test(visibleText || "")) failures.push("Workspace did not finish rendering");
  failures.push(...errors);
  return failures;
}
