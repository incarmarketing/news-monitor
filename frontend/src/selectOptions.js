import { Children, Fragment, isValidElement } from "react";

export function selectText(children) {
  return Children.toArray(children).map(child => isValidElement(child) ? selectText(child.props.children) : String(child)).join("");
}

export function selectOptions(children, group = "", groupDisabled = false) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) return selectOptions(child.props.children, group, groupDisabled);
    if (child.type === "optgroup") return selectOptions(child.props.children, child.props.label || "", groupDisabled || child.props.disabled);
    if (child.type !== "option") return [];
    const text = selectText(child.props.children);
    return [{ value: String(child.props.value ?? text), text, group, disabled: Boolean(groupDisabled || child.props.disabled) }];
  });
}
