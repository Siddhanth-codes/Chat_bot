import { SendIcon } from '../icons/send'
import { MicIcon } from '../icons/mic'
import { CallIcon } from '../icons/call'
import { VideoIcon } from '../icons/video'
import { PlusIcon } from '../icons/plus'
import { CopyIcon } from '../icons/copy'
import { TeamIcon } from '../icons/team'
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
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showUsersBox, setShowUsersBox] = useState(false);
  const [users, setUsers] = useState<Array<{ name: string; avatar: number }>>([]);
  const messageRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  // Get current user info
  const currentUserName = localStorage.getItem('userName') || 'You';
  const currentUserAvatar = selectedAvatar;

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
  
  useEffect(() => {
    if (!roomId) return;
    
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    wsRef.current = new WebSocket("ws://localhost:8080");
    
    wsRef.current.onopen = () => {
      setError('');
      // Send create or join message based on action
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: action,
          payload: { roomId: roomId }
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
        } else if (data.type === "room_created" || data.type === "room_joined") {
          setError('');
          // Add current user to users list when joining/creating room
          setUsers([{ name: currentUserName, avatar: currentUserAvatar }]);
        } else if (data.type === "users_list") {
          // Handle users list update from server (if implemented)
          setUsers(data.users || []);
        }
      } catch (e) {
        // Regular chat message (not JSON)
        setMessages(m => [...m, event.data as string]);
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
    <div className='h-screen bg-[rgba(33,33,33,1)] flex flex-col relative'>
      <ChatBackground />
      {/* Error Message */}
      {error && (
        <div className='absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg z-50'>
          {error}
        </div>
      )}
      {/* Chat Messages Box - Top */}
      <div className='flex justify-center pt-20 pb-4 px-4'>
        <div className='w-full max-w-3xl h-[70vh] bg-[rgba(24,24,24,1)] rounded-3xl overflow-hidden flex flex-col'>
          {/* Sticky Header Component */}
          <div className='sticky top-0 z-20 bg-[rgba(24,24,24,1)] px-4 py-4 flex items-center justify-between border-b border-gray-700'>
            {/* Room ID - Left */}
            <div className='flex items-center gap-2'>
              <span className='text-white text-sm'>ID: {roomId}</span>
              <button 
                onClick={handleCopyRoomId}
                className='relative p-1 rounded-full hover:bg-gray-600 transition-colors group'
              >
                <CopyIcon />
                <span className='absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none'>
                  {copied ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>
            {/* Team, Call and Video Icons - Right */}
            <div className='flex gap-2'>
              <button 
                onClick={() => setShowUsersBox(!showUsersBox)}
                className='relative p-2 rounded-full hover:bg-gray-600 transition-colors group'
              >
                <TeamIcon size={24} color="#ffffff" />
                <span className='absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none'>
                  Team
                </span>
              </button>
              <button className='relative p-2 rounded-full hover:bg-gray-600 transition-colors group'>
                <CallIcon />
                <span className='absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none'>
                  Call
                </span>
              </button>
              <button className='relative p-2 rounded-full hover:bg-gray-600 transition-colors group'>
                <VideoIcon />
                <span className='absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none'>
                  Video
                </span>
              </button>
            </div>
          </div>
          {/* Messages - Scrollable Area */}
          <div className='flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-width:thin] [scrollbar-color:rgb(75,85,99)_black]'>
            {messages.map((message, index) => (
              <div key={index} className='flex items-start gap-3 max-w-[80%] self-start'>
                {/* Avatar on the left */}
                <div className='flex-shrink-0'>
                  <img 
                    src={`/${selectedAvatar || 1}.png`} 
                    alt="Avatar" 
                    className="w-10 h-10 object-contain rounded-full"
                  />
                </div>
                {/* Message bubble */}
                <div className='bg-white text-black px-4 py-2 rounded-lg'>
                  {message}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Users Box - Shows when team icon is clicked */}
      {showUsersBox && (
        <div className='absolute right-8 top-24 bg-[rgba(24,24,24,1)] rounded-3xl p-6 shadow-2xl border border-gray-700 z-30 animate-fade-in-scale min-w-[280px]'>
          <h3 className="text-white text-xl font-semibold mb-4 text-center">Users in Room</h3>
          <div className="space-y-3">
            {users.length > 0 ? (
              users.map((user, index) => (
                <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 transition-colors">
                  <img 
                    src={`/${user.avatar}.png`} 
                    alt={user.name}
                    className="w-10 h-10 object-contain rounded-full flex-shrink-0"
                  />
                  <span className="text-white text-sm font-medium">{user.name}</span>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-3 p-2 rounded-lg">
                <img 
                  src={`/${currentUserAvatar}.png`} 
                  alt={currentUserName}
                  className="w-10 h-10 object-contain rounded-full flex-shrink-0"
                />
                <span className="text-white text-sm font-medium">{currentUserName}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Input Box - Bottom */}
      <div className='flex justify-center pb-4 px-4'>
        <div className='w-full max-w-3xl relative'>
          <div className='flex items-center relative'>
            <div className='absolute left-4 z-10 group'>
              <button className='p-2 rounded-full hover:bg-gray-600 transition-colors'>
                <PlusIcon />
              </button>
              <span className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none'>
                Add
              </span>
            </div>
            <input 
              ref={messageRef}
              type="text" 
              className="w-full px-4 py-4 pl-14 pr-24 rounded-3xl bg-[rgba(48,48,48,1)] text-white focus:outline-none placeholder:text-gray-400" 
              placeholder="Type your message..."
              onKeyPress={handleKeyPress}
            />
            <div className='absolute right-16 z-10 group'>
              <button className='p-2 rounded-full hover:bg-gray-600 transition-colors'>
                <MicIcon />
              </button>
              <span className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none'>
                Microphone
              </span>
            </div>
            <div className='absolute right-6 z-10 group'>
              <button onClick={handleSendMessage} className='p-2 rounded-full hover:bg-gray-600 transition-colors'>
                <SendIcon />
              </button>
              <span className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none'>
                Send
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default Chat;


