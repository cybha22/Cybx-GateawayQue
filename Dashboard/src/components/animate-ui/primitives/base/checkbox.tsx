"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<HTMLMotionProps<"button">, "onChange"> {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

function Checkbox({
  checked = false,
  indeterminate = false,
  onCheckedChange,
  disabled,
  className,
  children,
  ...props
}: CheckboxProps) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      data-state={checked ? "checked" : "unchecked"}
      data-checked={checked ? "" : undefined}
      data-indeterminate={indeterminate ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      whileTap={{ scale: 0.9 }}
      className={cn(
        "inline-flex items-center justify-center rounded-sm border border-border transition-colors duration-200",
        "data-[checked]:bg-primary data-[checked]:border-primary data-[checked]:text-primary-foreground",
        "data-[indeterminate]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:text-primary-foreground",
        "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}

function CheckboxIndicator({
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="3.5"
      stroke="currentColor"
      className={cn("pointer-events-none", className)}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.15 }}
      {...(props as any)}
    >
      <motion.path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      />
    </motion.svg>
  );
}

export { Checkbox, CheckboxIndicator, type CheckboxProps };
