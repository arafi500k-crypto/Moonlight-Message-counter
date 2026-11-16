export function MoonLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="34"
        height="34"
        rx="10"
        fill="#151421"
        stroke="rgba(196, 181, 253, 0.25)"
        strokeWidth="1.25"
      />
      <path
        d="M21.8 10.6C18.3 11.1 15.6 14.1 15.6 17.8C15.6 21.8 18.8 25 22.8 25C24.2 25 25.5 24.6 26.6 23.9C25.2 26.1 22.7 27.5 19.9 27.5C15.4 27.5 11.8 23.9 11.8 19.4C11.8 14.9 15.4 11.3 19.9 11.3C20.6 11.3 21.2 11.4 21.8 10.6Z"
        fill="#C4B5FD"
      />
      <circle cx="24.5" cy="12.5" r="1.5" fill="#8B5CF6" />
      <path
        d="M9.5 24.5C12.2 26.8 15.9 28.1 19.8 28.1"
        stroke="rgba(167, 139, 250, 0.45)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
