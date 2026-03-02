export const ThemeIcon = ({ size = 24, color = "#000000", ...props }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      {...props}
    >
      <path d="M18 31H38V5" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M30 21H10V43" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M44 11L38 5L32 11" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 37L10 43L4 37" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );