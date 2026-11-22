export default function AnonIcon({ size = 20, ...p }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      <path d="M3 11h18" />
      <path d="M6 11l1.6-5.6a1 1 0 0 1 1-.7h6.8a1 1 0 0 1 1 .7L18 11" />
      <circle cx="7.5" cy="17" r="2.8" />
      <circle cx="16.5" cy="17" r="2.8" />
      <path d="M10.3 16.4c1.1-.6 2.3-.6 3.4 0" />
    </svg>
  );
}