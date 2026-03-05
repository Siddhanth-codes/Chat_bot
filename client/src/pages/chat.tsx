import { SendIcon } from '../icons/send'
import { MicIcon } from '../icons/mic'
import { CallIcon } from '../icons/call'
import { VideoIcon } from '../icons/video'
import { PlusIcon } from '../icons/plus'
import { CopyIcon } from '../icons/copy'
import { TeamIcon } from '../icons/team'
import { ThemeIcon } from '../icons/theme'
import { LetInIcon } from '../icons/letin'
import ChatBackground from '../components/ChatBackground'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

function Chat() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId') || '';
  const action = searchParams.get('action') || 'create';
  const avatarParam = searchParams.get('avatar');
  const selectedAvatar = (() => {
    // Get from URL param first, then localStorage, then default to 1
    if (avatarParam) {
      const num = parseInt(avatarParam);
      if (!isNaN(num)) {
        localStorage.setItem('selectedAvatar', num.toString());
        return num;
      }
    }
    const saved = localStorage.getItem('selectedAvatar');
    if (saved) {
      return parseInt(saved);
    }
    // Set default avatar (1) if none exists
    localStorage.setItem('selectedAvatar', '1');
    return 1;
  })();
  const [messages, setMessages] = useState<Array<{ message: string; senderName: string; senderAvatar: number; isSystemMessage?: boolean }>>([]);
  const [error, setError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUsersBox, setShowUsersBox] = useState(false);
  const [users, setUsers] = useState<Array<{ name: string; avatar: number; isCreator?: boolean }>>([]);
  const [isCreator, setIsCreator] = useState(false);
  const [joinRequests, setJoinRequests] = useState<Array<{ userName: string; avatar: number; requestId: string }>>([]);
  const [showJoinRequestsBox, setShowJoinRequestsBox] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true; // Default to dark
  });
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messageRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedRef = useRef(false);
  const isTypingRef = useRef(false);
  const navigate = useNavigate();

  // Get current user info from URL params first (each tab has its own), then localStorage
  const userNameParam = searchParams.get('userName');
  const currentUserName = userNameParam || localStorage.getItem('userName') || '';
  const currentUserAvatar = selectedAvatar;

  const toggleTheme = () => {
    const newTheme = !isDarkTheme;
    setIsDarkTheme(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSendMessage = () => {
    const message = messageRef.current?.value?.trim();
    if (message && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Clear typing state first
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (isTypingRef.current) {
        sendTypingStatus(false);
      }
      wsRef.current.send(JSON.stringify({type:"chat",payload:{message}}));
      messageRef.current!.value = '';
    } else if (message && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
      setError('Not connected. Please wait for connection...');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
      // Stop typing indicator when message is sent
      sendTypingStatus(false);
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing",
        payload: { isTyping }
      }));
    }
    isTypingRef.current = isTyping;
  };

  const handleInputChange = () => {
    // Only send "typing true" if not already marked as typing
    if (!isTypingRef.current) {
      sendTypingStatus(true);
    }
    
    // Clear existing timeout and reset the inactivity timer
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 2000);
  };

  const handleApproveJoin = (requestId: string) => {
    // Optimistically remove from UI immediately
    setJoinRequests(prev => prev.filter(req => req.requestId !== requestId));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "approve_join",
        payload: { roomId, requestId }
      }));
    }
  };

  const handleRejectJoin = (requestId: string) => {
    // Optimistically remove from UI immediately
    setJoinRequests(prev => prev.filter(req => req.requestId !== requestId));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "reject_join",
        payload: { roomId, requestId }
      }));
    }
  };
  
  useEffect(() => {
    if (!roomId) return;
    
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    // Clear any previous errors and set connecting state
    setError('');
    setIsConnecting(true);
    hasConnectedRef.current = false; // Reset connection status
    
    // Clear any existing connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    
    wsRef.current = new WebSocket("ws://localhost:8080");
    
    // Set a connection timeout
    connectionTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN && !hasConnectedRef.current) {
        setIsConnecting(false);
        setError('Connection timeout. Please make sure the server is running.');
        if (wsRef.current) {
          wsRef.current.close();
        }
      }
    }, 5000); // 5 second timeout
    
    wsRef.current.onopen = () => {
      hasConnectedRef.current = true;
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      setIsConnecting(false);
      setError('');
      // Send create or join message based on action with user info
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: action,
          payload: { 
            roomId: roomId,
            userName: currentUserName,
            avatar: currentUserAvatar
          }
        }));
      }
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === "error") {
          setError(data.message);
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else if (data.type === "room_created") {
          setError('');
          setIsConnecting(false);
          setIsCreator(data.isCreator || false);
          // Users list will be sent separately by server
        } else if (data.type === "room_joined") {
          setError('');
          setIsConnecting(false);
          // Users list will be sent separately by server
        } else if (data.type === "join_request") {
          // Creator received a join request
          setJoinRequests(prev => [...prev, {
            userName: data.payload.userName,
            avatar: data.payload.avatar,
            requestId: data.payload.requestId
          }]);
        } else if (data.type === "join_request_sent") {
          // User sent a join request, waiting for approval
          setError('Join request sent. Waiting for approval...');
          setTimeout(() => setError(''), 3000);
        } else if (data.type === "join_rejected") {
          if (data.requestId) {
            setJoinRequests(prev => prev.filter(req => req.requestId !== data.requestId));
          } else {
            // User was rejected
            setError('Not allowed');
            setTimeout(() => setError(''), 3000);
          }
        } else if (data.type === "join_approved") {
          // Remove approved request from list
          setJoinRequests(prev => prev.filter(req => req.requestId !== data.requestId));
        } else if (data.type === "users_list") {
          // Handle users list update from server
          setUsers(data.users || []);
        } else if (data.type === "message") {
          // Handle chat message with sender info
          setMessages(m => [...m, {
            message: data.payload.message,
            senderName: data.payload.senderName,
            senderAvatar: data.payload.senderAvatar,
            isSystemMessage: data.payload.isSystemMessage || false
          }]);
          // Stop typing indicator when message is received
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(data.payload.senderName);
            return newSet;
          });
        } else if (data.type === "typing") {
          // Handle typing indicator
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            if (data.payload.isTyping) {
              newSet.add(data.payload.userName);
            } else {
              newSet.delete(data.payload.userName);
            }
            return newSet;
          });
        }
      } catch (e) {
        // If parsing fails, ignore (shouldn't happen with new format)
        console.error('Failed to parse message:', e);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Error will be handled in onclose if connection fails
    };
    
    wsRef.current.onclose = (event) => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      setIsConnecting(false);
      // Connection closed
      setTypingUsers(new Set());
      // Only show error if connection closed unexpectedly (not a clean close)
      // and we never successfully connected
      if (!event.wasClean && !hasConnectedRef.current) {
        setError('Connection error. Please make sure the server is running.');
      }
    };
    
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // Clear typing timeout on unmount
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      isTypingRef.current = false;
    };
  }, [roomId, action, navigate, currentUserName, currentUserAvatar]);
  return (
    <div
      className={`h-screen flex relative transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(33,33,33,1)]' : 'bg-white'}`}
      onClick={() => {
        setShowUsersBox(false);
        setShowJoinRequestsBox(false);
      }}
    >
      {isDarkTheme && <ChatBackground />}
      
      {/* Left Sidebar */}
      <div className={`w-16 flex flex-col items-center py-4 border-r transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-gray-50 border-gray-300'}`}>
        {/* Spacer to push icon to bottom */}
        <div className="flex-1"></div>
        
        {/* LetIn Icon at bottom with notification */}
        <div className="relative">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if(isCreator) {
                setShowJoinRequestsBox(!showJoinRequestsBox);
              }
            }}
            className={`p-2 rounded-lg transition-colors ${isDarkTheme ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
          >
            <LetInIcon size={24} color={isDarkTheme ? "#ffffff" : "#000000"} />
          </button>
          {/* Notification circle - appears when there are pending join requests */}
          {isCreator && joinRequests.length > 0 && (
            <div className={`absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 animate-pulse ${isDarkTheme ? 'border-gray-800' : 'border-white'}`}></div>
          )}
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
      {/* Theme Toggle - Top Right */}
      <button 
        onClick={(e) => {
          e.stopPropagation();
          toggleTheme();
        }}
        className={`absolute top-4 right-4 p-2 rounded-full transition-colors z-50 ${isDarkTheme ? 'hover:bg-gray-700' : 'hover:bg-gray-300'}`}
      >
        <ThemeIcon size={24} color={isDarkTheme ? "#ffffff" : "#000000"} />
      </button>

      {/* Error Message - Only show if not connecting */}
      {error && !isConnecting && (
        <div className='absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg z-50'>
          {error}
        </div>
      )}
      {/* Chat Messages Box - Top */}
      <div className='flex justify-center pt-20 pb-4 px-4'>
        <div className={`w-full max-w-3xl h-[70vh] rounded-3xl overflow-hidden flex flex-col transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)]' : 'bg-gray-100'}`}>
          {/* Sticky Header Component */}
          <div className={`sticky top-0 z-20 px-4 py-4 flex items-center justify-between border-b transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-gray-100 border-gray-300'}`}>
            {/* Room ID - Left */}
            <div className='flex items-center gap-2'>
              <span className={`text-sm transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>ID: {roomId}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyRoomId();
                }}
                className={`relative p-1 rounded-full transition-colors group ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}
              >
                <CopyIcon color={isDarkTheme ? "#ffffff" : "#000000"} />
                <span className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                  {copied ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>
            {/* Team, Call and Video Icons - Right */}
            <div className='flex gap-2'>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUsersBox(!showUsersBox);
                }}
                className={`relative p-2 rounded-full transition-colors group ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}
              >
                <TeamIcon size={24} color={isDarkTheme ? "#ffffff" : "#000000"} />
                <span className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                  Team
                </span>
              </button>
              <button className={`relative p-2 rounded-full transition-colors group ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}>
                <CallIcon color={isDarkTheme ? "#ffffff" : "#000000"} />
                <span className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                  Call
                </span>
              </button>
              <button className={`relative p-2 rounded-full transition-colors group ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}>
                <VideoIcon color={isDarkTheme ? "#ffffff" : "#000000"} />
                <span className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                  Video
                </span>
              </button>
            </div>
          </div>
          {/* Messages - Scrollable Area */}
          <div className={`flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-width:thin] ${isDarkTheme ? '[&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-thumb]:bg-gray-600 [scrollbar-color:rgb(75,85,99)_black]' : '[&::-webkit-scrollbar-track]:bg-gray-200 [&::-webkit-scrollbar-thumb]:bg-gray-400 [scrollbar-color:rgb(156,163,175)_rgb(229,231,235)]'}`}>
            {messages.map((msg, index) => (
              msg.isSystemMessage ? (
                // System message - centered and styled differently
                <div key={index} className='flex justify-center items-center w-full my-2'>
                  <span className={`text-xs italic transition-colors duration-300 ${isDarkTheme ? 'text-gray-500' : 'text-gray-500'}`}>
                    {msg.message}
                  </span>
                </div>
              ) : (
                // Regular chat message
                <div key={index} className='flex items-start gap-3 max-w-[80%] self-start'>
                  {/* Avatar on the left */}
                  <div className='flex-shrink-0'>
                    <img 
                      src={`/${msg.senderAvatar}.png`} 
                      alt={msg.senderName}
                      className="w-10 h-10 object-contain rounded-full"
                    />
                  </div>
                  {/* Message bubble with sender name */}
                  <div className='flex flex-col'>
                    <span className={`text-xs mb-1 transition-colors duration-300 ${isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`}>{msg.senderName}</span>
                    <div className={`px-4 py-2 rounded-lg transition-colors duration-300 ${isDarkTheme ? 'bg-white text-black' : 'bg-gray-800 text-white'}`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              )
            ))}
            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
              <div className='flex items-start gap-3 max-w-[80%] self-start'>
                <div className='flex-shrink-0'>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDarkTheme ? 'bg-gray-700' : 'bg-gray-300'}`}>
                    <div className="flex gap-1">
                      <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-gray-400' : 'bg-gray-600'}`} style={{ animationDelay: '0ms' }}></div>
                      <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-gray-400' : 'bg-gray-600'}`} style={{ animationDelay: '150ms' }}></div>
                      <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-gray-400' : 'bg-gray-600'}`} style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
                <div className='flex flex-col'>
                  <span className={`text-xs mb-1 transition-colors duration-300 ${isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`}>
                    {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                  </span>
                  <div className={`px-4 py-2 rounded-lg transition-colors duration-300 ${isDarkTheme ? 'bg-gray-800' : 'bg-gray-200'}`}>
                    <div className="flex gap-1">
                      <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-gray-500' : 'bg-gray-500'}`} style={{ animationDelay: '0ms' }}></div>
                      <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-gray-500' : 'bg-gray-500'}`} style={{ animationDelay: '150ms' }}></div>
                      <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-gray-500' : 'bg-gray-500'}`} style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Users Box - Shows when team icon is clicked */}
      {showUsersBox && (
        <div
          className={`absolute right-8 top-24 rounded-3xl p-6 shadow-2xl border z-30 animate-fade-in-scale min-w-[280px] transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-white border-gray-300'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className={`text-xl font-semibold mb-4 text-center transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>Users in Room</h3>
          <div className="space-y-3">
            {users.length > 0 ? (
              users.map((user, index) => {
                const isCurrentUser = user.name === currentUserName;
                const isHost = user.isCreator || false;
                return (
                  <div key={index} className={`flex items-center justify-between gap-3 p-2 rounded-lg transition-colors ${isDarkTheme ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                    <div className="flex items-center gap-3 flex-1">
                      <img 
                        src={`/${user.avatar}.png`} 
                        alt={user.name}
                        className="w-10 h-10 object-contain rounded-full flex-shrink-0"
                      />
                      <span className={`text-sm font-medium transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>{user.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isHost && (
                        <span className={`text-xs font-semibold px-2 py-1 rounded transition-colors duration-300 ${isDarkTheme ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}>
                          Host
                        </span>
                      )}
                      {isCurrentUser && (
                        <span className={`text-xs font-semibold px-2 py-1 rounded transition-colors duration-300 ${isDarkTheme ? 'bg-gray-600 text-white' : 'bg-gray-400 text-white'}`}>
                          You
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={`text-sm text-center py-4 transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>No users in room</div>
            )}
          </div>
        </div>
      )}

      {/* Join Requests Box - Shows when creator clicks letin icon */}
      {showJoinRequestsBox && isCreator && (
        <div
          className={`absolute left-20 bottom-4 rounded-3xl p-6 shadow-2xl border z-30 animate-fade-in-scale min-w-[320px] max-w-[400px] transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-white border-gray-300'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className={`text-xl font-semibold mb-4 text-center transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>Join Requests</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {joinRequests.length > 0 ? (
              joinRequests.map((request, index) => (
                <div key={index} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${isDarkTheme ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <div className="flex items-center gap-3 flex-1">
                    <img 
                      src={`/${request.avatar}.png`} 
                      alt={request.userName}
                      className="w-10 h-10 object-contain rounded-full flex-shrink-0"
                    />
                    <span className={`text-sm font-medium transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>{request.userName}</span>
                  </div>
                  <div className="flex gap-2">
                    {/* Tick button */}
                    <button
                      onClick={() => handleApproveJoin(request.requestId)}
                      className="p-2 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    {/* Cross button */}
                    <button
                      onClick={() => handleRejectJoin(request.requestId)}
                      className="p-2 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className={`text-sm text-center py-4 transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>No pending requests</div>
            )}
          </div>
        </div>
      )}

      {/* Chat Input Box - Bottom */}
      <div className='flex justify-center pb-4 px-4'>
        <div className='w-full max-w-3xl relative'>
          <div className='flex items-center relative'>
            <div className='absolute left-4 z-10 group'>
              <button className={`p-2 rounded-full transition-colors ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}>
                <PlusIcon color={isDarkTheme ? "#ffffff" : "#000000"} />
              </button>
              <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                Add
              </span>
            </div>
            <input 
              ref={messageRef}
              type="text" 
              className={`w-full px-4 py-4 pl-14 pr-24 rounded-3xl focus:outline-none transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(48,48,48,1)] text-white placeholder:text-gray-400' : 'bg-gray-200 text-black placeholder:text-gray-600'}`}
              placeholder="Type your message..."
              onKeyDown={handleKeyPress}
              onChange={handleInputChange}
              onBlur={() => sendTypingStatus(false)}
            />
            <div className='absolute right-16 z-10 group'>
              <button className={`p-2 rounded-full transition-colors ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}>
                <MicIcon color={isDarkTheme ? "#ffffff" : "#000000"} />
              </button>
              <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                Microphone
              </span>
            </div>
            <div className='absolute right-6 z-10 group'>
              <button onClick={handleSendMessage} className={`p-2 rounded-full transition-colors ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}>
                <SendIcon color={isDarkTheme ? "#ffffff" : "#000000"} />
              </button>
              <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                Send
              </span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
export default Chat;


