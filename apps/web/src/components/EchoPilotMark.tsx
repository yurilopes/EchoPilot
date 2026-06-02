import { useId } from "react";

type Props = {
  size?: number;
  className?: string;
};

export function EchoPilotMark({ size = 60, className }: Props) {
  const ringId = useId();

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={ringId} x1="11" y1="10" x2="53" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1B5B3B" />
          <stop offset="0.46" stopColor="#B59B6A" />
          <stop offset="1" stopColor="#D8E4DC" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="22.5" stroke={`url(#${ringId})`} strokeWidth="5.4" />
      <circle cx="32" cy="32" r="17.9" fill="#F3F7F1" opacity="0.98" />
      <g transform="translate(20 20.5)">
        <path
          d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"
          stroke="#123524"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M23.4 17.8l0.95 2.25 2.25 0.95-2.25 0.95-0.95 2.25-0.95-2.25-2.25-0.95 2.25-0.95 0.95-2.25Z"
        fill="none"
        stroke="#55734D"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M44.5 22.0l1.35 3.05 3.05 1.35-3.05 1.35-1.35 3.05-1.35-3.05-3.05-1.35 3.05-1.35 1.35-3.05Z"
        fill="none"
        stroke="#55734D"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
