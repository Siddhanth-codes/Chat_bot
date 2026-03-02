export const VideoIcon = ({ color = "#ffffff", ...props }) => {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
      <polygon points="16 10 22 7 22 17 16 14 16 10" />
    </svg>
  );
};