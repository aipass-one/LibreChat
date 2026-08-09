import { JSX } from 'react/jsx-runtime';

export default function AIPassIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {/* Purple box with rounded corners except top-right */}
      <path d="M5 4 H22 V17 Q22 20 19 20 H5 Q2 20 2 17 V7 Q2 4 5 4 Z" fill="#8A4FFF" />
      <text
        x="12"
        y="14.5"
        textAnchor="middle"
        fill="white"
        fontFamily="Arial, sans-serif"
        fontSize="8"
        fontWeight="bold"
      >
        AI
      </text>
    </svg>
  );
}
