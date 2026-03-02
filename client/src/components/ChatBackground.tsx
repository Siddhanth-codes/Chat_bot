const ChatBackground = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
    {Array.from({length: 20}).map((_, i) => (
      <div
        key={i}
        className="absolute w-1 h-1 bg-blue-400/20 rounded-full animate-float"
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 10}s`,
          animationDuration: `${5 + Math.random() * 10}s`
        }}
      />
    ))}
  </div>
);

export default ChatBackground;
