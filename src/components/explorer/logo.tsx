/**
 * Brand mark, inlined so it can inherit `currentColor` and follow the active
 * theme (light on dark backgrounds, dark on light backgrounds).
 * Keep in sync with `src/app/logo.svg`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 156 156"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path d="M117 117V156H39V117H117ZM78 39H39V117H0V0H78V39ZM156 117H117V78H78V39H156V117Z" />
    </svg>
  );
}
