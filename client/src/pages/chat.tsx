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
  const [messages, setMessages] = useState<Array<{ message: string; senderName: string; senderAvatar: number }>>([]);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showUsersBox, setShowUsersBox] = useState(false);
  const [users, setUsers] = useState<Array<{ name: string; avatar: number }>>([]);
  const [hasNewUser, setHasNewUser] = useState(false);
  const [previousUsersCount, setPreviousUsersCount] = useState(0);
  const [isCreator, setIsCreator] = useState(false);
  const [joinRequests, setJoinRequests] = useState<Array<{ userName: string; avatar: number; requestId: string }>>([]);
  const [showJoinRequestsBox, setShowJoinRequestsBox] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true; // Default to dark
  });
  const messageRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  // Get current user info - send empty string if no name so backend can generate random name
  const currentUserName = localStorage.getItem('userName') || '';
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
    }
  };

  const handleApproveJoin = (requestId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "approve_join",
        payload: { roomId, requestId }
      }));
    }
  };

  const handleRejectJoin = (requestId: string) => {
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
    
    wsRef.current = new WebSocket("ws://localhost:8080");
    
    wsRef.current.onopen = () => {
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
          setIsCreator(data.isCreator || false);
          // Users list will be sent separately by server
        } else if (data.type === "room_joined") {
          setError('');
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
          if(!isCreator) {
            // User was rejected
            setError('Not allowed');
            setTimeout(() => setError(''), 3000);
          } else {
            // Creator rejected someone, remove from list
            setJoinRequests(prev => prev.filter(req => req.requestId !== data.requestId));
          }
        } else if (data.type === "join_approved") {
          // Remove approved request from list
          setJoinRequests(prev => prev.filter(req => req.requestId !== data.requestId));
        } else if (data.type === "users_list") {
          // Handle users list update from server
          const newUsers = data.users || [];
          // Check if a new user joined (users count increased)
          if (newUsers.length > previousUsersCount && previousUsersCount > 0) {
            setHasNewUser(true);
            // Auto-hide notification after 5 seconds
            setTimeout(() => setHasNewUser(false), 5000);
          }
          setPreviousUsersCount(newUsers.length);
          setUsers(newUsers);
        } else if (data.type === "message") {
          // Handle chat message with sender info
          setMessages(m => [...m, {
            message: data.payload.message,
            senderName: data.payload.senderName,
            senderAvatar: data.payload.senderAvatar
          }]);
        }
      } catch (e) {
        // If parsing fails, ignore (shouldn't happen with new format)
        console.error('Failed to parse message:', e);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error. Please make sure the server is running.');
    };
    
    wsRef.current.onclose = () => {
      // Connection closed
    };
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, action, navigate]);
  return (
    <div className={`h-screen flex relative transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(33,33,33,1)]' : 'bg-white'}`}>
      {isDarkTheme && <ChatBackground />}
      
      {/* Left Sidebar */}
      <div className={`w-16 flex flex-col items-center py-4 border-r transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-gray-50 border-gray-300'}`}>
        {/* Spacer to push icon to bottom */}
        <div className="flex-1"></div>
        
        {/* LetIn Icon at bottom with notification */}
        <div className="relative">
          <button 
            onClick={() => {
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
        onClick={toggleTheme}
        className='absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors z-50'
      >
        <ThemeIcon size={24} color={isDarkTheme ? "#ffffff" : "#000000"} />
      </button>

      {/* Error Message */}
      {error && (
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
                onClick={handleCopyRoomId}
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
                onClick={() => setShowUsersBox(!showUsersBox)}
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
            ))}
          </div>
        </div>
      </div>

      {/* Users Box - Shows when team icon is clicked */}
      {showUsersBox && (
        <div className={`absolute right-8 top-24 rounded-3xl p-6 shadow-2xl border z-30 animate-fade-in-scale min-w-[280px] transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-white border-gray-300'}`}>
          <h3 className={`text-xl font-semibold mb-4 text-center transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>Users in Room</h3>
          <div className="space-y-3">
            {users.length > 0 ? (
              users.map((user, index) => (
                <div key={index} className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${isDarkTheme ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                  <img 
                    src={`/${user.avatar}.png`} 
                    alt={user.name}
                    className="w-10 h-10 object-contain rounded-full flex-shrink-0"
                  />
                  <span className={`text-sm font-medium transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>{user.name}</span>
                </div>
              ))
            ) : (
              <div className={`text-sm text-center py-4 transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>No users in room</div>
            )}
          </div>
        </div>
      )}

      {/* Join Requests Box - Shows when creator clicks letin icon */}
      {showJoinRequestsBox && isCreator && (
        <div className={`absolute left-20 bottom-4 rounded-3xl p-6 shadow-2xl border z-30 animate-fade-in-scale min-w-[320px] max-w-[400px] transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-white border-gray-300'}`}>
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
              onKeyPress={handleKeyPress}
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


