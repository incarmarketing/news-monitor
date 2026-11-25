import { useId, useMemo, useRef, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { selectOptions } from "./selectOptions.js";
import "./app-select.css";

export default function AppSelect({ children, value, defaultValue = "", onChange, name, disabled, required, className = "", ...props }) {
  const emptyValue = `empty-${useId()}`;
  const trigger = useRef(null);
  const [internalValue, setInternalValue] = useState(String(defaultValue));
  const [portalContainer, setPortalContainer] = useState(null);
  const options = useMemo(() => selectOptions(children), [children]);
  const selected = String(value ?? internalValue);
  const current = options.find(option => option.value === selected);
  const encode = raw => raw === "" ? emptyValue : raw;
  const change = next => {
    const raw = next === emptyValue ? "" : next;
    setInternalValue(raw);
    const target = { value: raw, name };
    onChange?.({ type: "change", target, currentTarget: target });
  };
  return <>
    {name && <input type="hidden" name={name} value={selected} disabled={disabled} />}
    <Select.Root value={current ? encode(selected) : ""} onValueChange={change} disabled={disabled} required={required}
      onOpenChange={open => { if (open) setPortalContainer(trigger.current?.closest("dialog[open]") || null); }}>
      <Select.Trigger {...props} ref={trigger} type="button" className={`app-select ${className}`.trim()} data-value={selected}
        title={props.title || current?.text} onClick={event => { event.stopPropagation(); props.onClick?.(event); }}>
        <span className="app-select-value"><Select.Value placeholder="선택" /></span>
        <span className="app-select-sizer" aria-hidden="true">{options.map(option => <span key={option.value}>{option.text}</span>)}</span>
        <Select.Icon className="app-select-chevron"><ChevronDown aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={portalContainer || undefined}>
        <Select.Content className="app-select-content" position="popper" align="start" sideOffset={6} collisionPadding={16}
          onClick={event => event.stopPropagation()}
          onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}>
          <Select.ScrollUpButton className="app-select-scroll"><ChevronUp aria-hidden="true" /></Select.ScrollUpButton>
          <Select.Viewport className="app-select-viewport">
            {options.map(option => <Select.Item key={option.value} className="app-select-item" value={encode(option.value)} data-value={option.value} disabled={option.disabled} textValue={option.text}>
              <Select.ItemText>{option.text}</Select.ItemText><Select.ItemIndicator className="app-select-check"><Check aria-hidden="true" /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.Viewport>
          <Select.ScrollDownButton className="app-select-scroll"><ChevronDown aria-hidden="true" /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </>;
}
