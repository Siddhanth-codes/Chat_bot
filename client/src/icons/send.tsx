export const SendIcon = ({ color = "#ffffff", ...props }) => {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" {...props}>
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  );
};