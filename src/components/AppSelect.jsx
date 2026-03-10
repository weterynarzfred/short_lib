"use client";

import classNames from "classnames";
import * as Select from "@radix-ui/react-select";

import styles from "./AppSelect.module.scss";

export default function AppSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        aria-label={ariaLabel}
        className={classNames(styles.trigger, className)}
      >
        <Select.Value />
        <Select.Icon className={styles.icon}>
          <svg viewBox="0 0 10 10">
            <path d="M1 2L5 7L9 2" />
          </svg>
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className={styles.content}
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className={styles.viewport}>
            {options.map(option => (
              <Select.Item
                key={option.value}
                value={option.value}
                className={styles.item}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className={styles.indicator}>
                  ✓
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
