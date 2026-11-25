import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h, Fragment } from "react";
import { selectOptions } from "../src/selectOptions.js";

test("common select preserves numeric, empty and implicit native option values", () => {
  const rows = selectOptions([h("option", { value: "" }, "최신 점검"), h("option", { value: 20 }, "20개씩 보기"), h(Fragment, null, h("option", null, "중립"))]);
  assert.deepEqual(rows.map(row => [row.value, row.text]), [["", "최신 점검"], ["20", "20개씩 보기"], ["중립", "중립"]]);
});

test("disabled options and groups stay disabled", () => {
  const rows = selectOptions(h("optgroup", { label: "분류", disabled: true }, h("option", { value: "own" }, "당사")));
  assert.equal(rows[0].disabled, true);
  assert.equal(rows[0].group, "분류");
});
