"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

/** Where the choice is kept. Read by the inline script in the document head. */
export const THEME_STORAGE_KEY = "rf4u-theme";

/**
 * Switches the site between dark and light.
 *
 * The whole mechanism is one attribute on `<html>`. Every colour in the site is
 * a CSS variable, and `globals.css` redefines those variables under
 * `[data-theme="light"]`, so flipping the attribute repaints everything without
 * a re-render or a second set of class names.
 *
 * The choice is remembered, and the system preference is only the starting
 * point. Somebody who has said which one they want should not be overruled by
 * their operating system on the next visit.
 *
 * Renders a placeholder of the same size before hydration. The server cannot
 * know which theme is stored, so drawing a definite state would mean showing the
 * wrong icon for a moment on every load, and a control that visibly changes its
 * mind is worse than one that arrives a beat late.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing, or storage disabled. The theme still applies for this
      // page; it simply will not be remembered, which is a fine degradation.
    }
  }

  if (theme === null) {
    return <span className="block h-7 w-14 rounded-full border border-basalt-600" />;
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      onClick={() => choose(isLight ? "dark" : "light")}
      className={
        "group relative block h-7 w-14 shrink-0 rounded-full border transition-colors " +
        (isLight
          ? "border-oxide-500/60 bg-oxide-400/25"
          : "border-basalt-600 bg-basalt-800")
      }
    >
      {/*
        The track carries both symbols and the knob covers the inactive one, so
        the control shows what it does rather than only what it is. A single icon
        that swaps is ambiguous: nobody can tell whether it means the current
        state or the one it would move to.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-[0.3125rem]"
      >
        <Sun className={isLight ? "text-oxide-500" : "text-steel-500"} />
        <Moon className={isLight ? "text-steel-500" : "text-oxide-400"} />
      </span>

      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full " +
          "border shadow transition-[left] duration-200 ease-out " +
          (isLight
            ? "left-[calc(100%-1.375rem)] border-oxide-500/70 bg-steel-100"
            : "left-[0.1875rem] border-basalt-500 bg-basalt-600")
        }
      />
    </button>
  );
}

function Sun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="currentColor">
      <circle cx="8" cy="8" r="3.1" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="7.4"
          y="0.6"
          width="1.2"
          height="2.4"
          rx="0.6"
          transform={`rotate(${angle} 8 8)`}
        />
      ))}
    </svg>
  );
}

function Moon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="currentColor">
      <path d="M13.2 10.4A5.6 5.6 0 0 1 5.9 3.1a5.7 5.7 0 1 0 7.3 7.3Z" />
    </svg>
  );
}
