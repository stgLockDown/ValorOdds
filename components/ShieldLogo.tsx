/**
 * ValorOdds shield logo — a shield emblem with an angular "V" inside.
 *
 * Adapted from the brand's original neon-green shield design to use the
 * site's indigo primary palette (#4f46e5 / #a5b4fc) so it harmonizes with
 * the existing dark-theme UI.
 *
 * Rendered as inline SVG so it scales crisply at any size and inherits
 * currentColor where appropriate. Use the `className` prop to size it
 * (e.g. `h-6 w-6` for navbar, `h-5 w-5` for footer).
 */
export function ShieldLogo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Shield outline */}
      <path
        d="M16 2.5 L28 6.5 V15 C28 22 23 27.5 16 29.5 C9 27.5 4 22 4 15 V6.5 Z"
        fill="none"
        stroke="#a5b4fc"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Inner shield fill (subtle) */}
      <path
        d="M16 4.5 L26 7.8 V15 C26 20.8 21.8 25.6 16 27.3 C10.2 25.6 6 20.8 6 15 V7.8 Z"
        fill="#4f46e5"
        fillOpacity="0.15"
      />
      {/* Angular "V" with pointed top extensions */}
      <path
        d="M9.5 11 L13 11 L16 20.5 L19 11 L22.5 11 L17.5 23 L14.5 23 Z"
        fill="#a5b4fc"
      />
      {/* V top points */}
      <path
        d="M12.5 10.5 L13.5 11.5 L11 11.5 Z M19.5 10.5 L18.5 11.5 L21 11.5 Z"
        fill="#a5b4fc"
      />
    </svg>
  );
}
