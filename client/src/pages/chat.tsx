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
  const [messages, setMessages] = useState<Array<{
    id?: string;
    message: string;
    senderName: string;
    senderAvatar: number;
    isSystemMessage?: boolean;
    isGeminiResponse?: boolean;
    imageUrl?: string;
    replyTo?: { senderName: string; message?: string; imageUrl?: string };
  }>>([]);
  const [error, setError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [pendingGeminiPrompt, setPendingGeminiPrompt] = useState<string | null>(null);
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
  const [selectedReply, setSelectedReply] = useState<{ id?: string; senderName: string; message?: string; imageUrl?: string } | null>(null);
  const messageRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleApiKeySubmit = async () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('gemini_api_key', apiKeyInput.trim());
      setShowApiKeyModal(false);
      setApiKeyInput('');
      
      // Retry the pending Gemini request
      if (pendingGeminiPrompt) {
        const prompt = pendingGeminiPrompt;
        setPendingGeminiPrompt(null);
        setIsGeminiLoading(true);
        
        try {
          const geminiResponse = await callGeminiAPI(prompt);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "chat",
              payload: {
                message: geminiResponse.text || 'No response',
                senderName: 'Gemini AI',
                senderAvatar: 1,
                isGeminiResponse: true,
                imageUrl: geminiResponse.imageUrl,
                messageId: `gem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
              }
            }));
          } else {
            setMessages(prev => [...prev, {
              message: geminiResponse.text || 'No response',
              senderName: 'Gemini AI',
              senderAvatar: 1,
              isSystemMessage: false,
              isGeminiResponse: true,
              imageUrl: geminiResponse.imageUrl
            }]);
          }
        } catch (err: any) {
          setError(err.message || 'Failed to get response from Gemini');
          setMessages(prev => [...prev, {
            message: `Error: ${err.message || 'Failed to get response from Gemini'}`,
            senderName: 'Gemini AI',
            senderAvatar: 1,
            isSystemMessage: false,
            isGeminiResponse: true
          }]);
        } finally {
          setIsGeminiLoading(false);
        }
      }
    }
  };

  // Gemini API integration
  const callGeminiAPI = async (prompt: string): Promise<{ text?: string; imageUrl?: string }> => {
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '';
    
    if (!GEMINI_API_KEY) {
      // Show modal to enter API key
      setPendingGeminiPrompt(prompt);
      setShowApiKeyModal(true);
      throw new Error('API_KEY_REQUIRED'); // Special error to trigger modal
    }

    const lowerPrompt = prompt.toLowerCase();
    const isImageRequest = lowerPrompt.includes('create a picture') || 
                          lowerPrompt.includes('create a image') ||
                          lowerPrompt.includes('create picture') ||
                          lowerPrompt.includes('generate image') ||
                          lowerPrompt.includes('generate a image') ||
                          lowerPrompt.includes('generate picture') ||
                          lowerPrompt.includes('draw') ||
                          lowerPrompt.includes('make a picture') ||
                          lowerPrompt.includes('make a image') ||
                          lowerPrompt.includes('make image') ||
                          /create\s+(\w+\s+)*image/i.test(prompt) ||
                          /generate\s+(\w+\s+)*picture/i.test(prompt) ||
                          /make\s+(\w+\s+)*picture/i.test(prompt) ||
                          /create\s+(\w+\s+)*picture/i.test(prompt) ||
                          /create\s+(\w+\s+)*photo/i.test(prompt) ||
                          lowerPrompt.includes('image of') ||
                          lowerPrompt.includes('picture of') ||
                          lowerPrompt.includes('photo of');

    const isQuotaError = (message: string) =>
      /quota exceeded|rate limit|resource_exhausted|free_tier/i.test(message);

    const isModelAvailabilityError = (message: string) =>
      /not found|not supported|not available|unsupported/i.test(message);

    const buildFriendlyQuotaMessage = (rawMessage: string) =>
      `Gemini quota exceeded for this API key/project. Please retry later or switch to another key/project with available quota.\n` +
      `Details: ${rawMessage}\n` +
      `Docs: https://ai.google.dev/gemini-api/docs/rate-limits`;

    const imageModels = [
      'gemini-2.0-flash-exp-image-generation'
    ];

    const textModels = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];

    const discoverImageModels = async (): Promise<string[]> => {
      try {
        const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        if (!listResponse.ok) return imageModels;
        const listData = await listResponse.json();
        const models = Array.isArray(listData.models) ? listData.models : [];
        const discovered = models
          .filter((m: any) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent') &&
            typeof m.name === 'string' &&
            m.name.toLowerCase().includes('image')
          )
          .map((m: any) => String(m.name).replace(/^models\//, ''));

        return discovered.length > 0 ? discovered : imageModels;
      } catch {
        return imageModels;
      }
    };

    const modelsToTry = isImageRequest ? await discoverImageModels() : textModels;
    let lastError = isImageRequest ? 'Failed to generate image' : 'Failed to get response from Gemini';
    const attemptedModels: string[] = [];
    let lastQuotaError = '';

    const structuredTextPrompt = `You are a helpful chat assistant inside a realtime chat app.
Always return structured output in this exact style:

Direct Answer:
- One clear sentence.

Structured Points:
- Use bullet points for normal topics.
- Use numbered points for ordered topics (steps, layers, phases, rankings, lists like "7 layers").
- Keep points short, clear, and practical.

Rules:
- Never return a single-line-only answer.
- No long paragraphs.
- Use simple language.
- If user asks "teach/explain", include enough detail to be useful.
- If the topic has N parts (example: 7 layers), include all N parts with numbering and one-line explanation each.
- For simple greeting requests (example: "say hi to Hey1"), return only the final greeting line and nothing else.

User message:
${prompt}`;

    for (const modelName of modelsToTry) {
      attemptedModels.push(modelName);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: isImageRequest ? prompt : structuredTextPrompt
            }]
          }],
          ...(isImageRequest
            ? {
                generationConfig: {
                  responseModalities: ['TEXT', 'IMAGE']
                }
              }
            : {
                generationConfig: {
                  maxOutputTokens: 800,
                  temperature: 0.5
                }
              })
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Gemini request failed (${modelName})`;

        if (isQuotaError(errorMessage)) {
          // For image requests, try other image-capable models before failing.
          // Quota can differ by model/category in some projects.
          if (isImageRequest) {
            lastQuotaError = errorMessage;
            lastError = errorMessage;
            continue;
          }
          throw new Error(buildFriendlyQuotaMessage(errorMessage));
        }

        // If a model is unavailable for this key/project, try the next fallback model.
        if (isModelAvailabilityError(errorMessage)) {
          lastError = errorMessage;
          continue;
        }

        lastError = errorMessage;
        continue;
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];

      if (isImageRequest) {
        let textResponse = '';
        let imageUrl: string | undefined;

        for (const part of parts) {
          if (part.text) {
            textResponse += part.text;
          }
          if (part.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            imageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
          }
        }

        if (imageUrl || textResponse) {
          return {
            text: textResponse || 'Here is your generated image:',
            imageUrl
          };
        }
      } else {
        const geminiResponse = parts.find((part: any) => part.text)?.text || 'No response from Gemini';
        return { text: geminiResponse };
      }
    }
    if (isImageRequest && lastQuotaError) {
      return {
        text:
          'Image generation is currently unavailable for this API key/project. ' +
          'I can still help with text responses. Please try again later or switch API key for image support.'
      };
    }

    if (isImageRequest && isModelAvailabilityError(lastError)) {
      return {
        text:
          'Image generation is not enabled for this API key/project right now. ' +
          'Text generation is available, so you can continue chatting.'
      };
    }

    throw new Error(lastError);
  };

  const handleSendMessage = async () => {
    const message = messageRef.current?.value?.trim();
    if (!message) return;

    // Check if message starts with @Gem followed by , or : or space
    const geminiMatch = message.match(/^@Gem[,:;]?\s*(.+)/i);
    
    if (geminiMatch) {
      // Handle Gemini request
      const geminiPrompt = geminiMatch[1].trim();
      
      if (!geminiPrompt) {
        setError('Please provide a question or request after @Gem');
        return;
      }

      // Clear input
      messageRef.current!.value = '';
      setIsGeminiLoading(true);
      setError('');

      // Add user's question to chat
      setMessages(prev => [...prev, {
        message: `@Gem: ${geminiPrompt}`,
        senderName: currentUserName,
        senderAvatar: currentUserAvatar,
        isSystemMessage: false
      }]);

      try {
        // Fast path for simple "say hi to X" prompts to keep reply concise.
        const simpleGreetingMatch = geminiPrompt.match(/^say\s+(?:hi|hello)\s+to\s+(.+)$/i);
        const geminiResponse = simpleGreetingMatch
          ? { text: `Hello, ${simpleGreetingMatch[1].trim()}!` }
          : await callGeminiAPI(geminiPrompt);

        // Broadcast Gemini response to everyone in the room.
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "chat",
            payload: {
              message: geminiResponse.text || 'No response',
              senderName: 'Gemini AI',
              senderAvatar: 1,
              isGeminiResponse: true,
              imageUrl: geminiResponse.imageUrl,
              messageId: `gem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            }
          }));
        } else {
          // Fallback to local display if socket is unavailable.
          setMessages(prev => [...prev, {
            message: geminiResponse.text || 'No response',
            senderName: 'Gemini AI',
            senderAvatar: 1,
            isSystemMessage: false,
            isGeminiResponse: true,
            imageUrl: geminiResponse.imageUrl
          }]);
        }
      } catch (err: any) {
        // Don't show error if it's just the API key modal trigger
        if (err.message !== 'API_KEY_REQUIRED') {
          setError(err.message || 'Failed to get response from Gemini');
          // Add error message to chat
          setMessages(prev => [...prev, {
            message: `Error: ${err.message || 'Failed to get response from Gemini'}`,
            senderName: 'Gemini AI',
            senderAvatar: 1,
            isSystemMessage: false,
            isGeminiResponse: true
          }]);
        }
      } finally {
        // Only clear loading if we're not waiting for API key
        if (!showApiKeyModal) {
          setIsGeminiLoading(false);
        }
      }
    } else {
      // Regular chat message
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Clear typing state first
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        if (isTypingRef.current) {
          sendTypingStatus(false);
        }
        wsRef.current.send(JSON.stringify({
          type:"chat",
          payload:{
            message,
            messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            replyTo: selectedReply
              ? {
                  senderName: selectedReply.senderName,
                  message: selectedReply.message,
                  imageUrl: selectedReply.imageUrl
                }
              : undefined
          }
        }));
        messageRef.current!.value = '';
        setSelectedReply(null);
      } else if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setError('Not connected. Please wait for connection...');
      }
    }
  };

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow selecting the same file again later
    e.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported for now.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    // Keep payload sizes reasonable for websocket transfer.
    const maxBytes = 3 * 1024 * 1024; // 3MB
    if (file.size > maxBytes) {
      setError('Image too large. Please use an image smaller than 3MB.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected. Please wait for connection...');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) {
        setError('Failed to read image file.');
        return;
      }

      wsRef.current?.send(JSON.stringify({
        type: "chat",
        payload: {
          message: 'sent an image',
          imageUrl
        }
      }));
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
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
            id: data.payload.messageId,
            message: data.payload.message,
            senderName: data.payload.senderName,
            senderAvatar: data.payload.senderAvatar,
            isSystemMessage: data.payload.isSystemMessage || false,
            isGeminiResponse: data.payload.isGeminiResponse || false,
            imageUrl: data.payload.imageUrl,
            replyTo: data.payload.replyTo
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

      {/* Gemini API Key Modal */}
      {showApiKeyModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowApiKeyModal(false)}
        >
          <div 
            className={`rounded-3xl p-6 shadow-2xl border max-w-md w-full mx-4 transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-white border-gray-300'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-xl font-semibold mb-4 transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>
              Gemini API Key Required
            </h3>
            <p className={`text-sm mb-4 transition-colors duration-300 ${isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`}>
              Please enter your Google Gemini API key to use AI features.
              <br />
              <a 
                href="https://makersuite.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                Get your free API key here
              </a>
            </p>
            <input
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter your Gemini API key"
              className={`w-full px-4 py-3 rounded-2xl focus:outline-none focus:ring-2 transition-colors duration-300 mb-4 ${
                isDarkTheme 
                  ? 'bg-[rgba(48,48,48,1)] text-white focus:ring-white placeholder:text-gray-400' 
                  : 'bg-gray-200 text-black focus:ring-gray-800 placeholder:text-gray-600'
              }`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleApiKeySubmit();
                }
              }}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleApiKeySubmit}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${isDarkTheme ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
              >
                Save & Continue
              </button>
              <button
                onClick={() => {
                  setShowApiKeyModal(false);
                  setApiKeyInput('');
                  setPendingGeminiPrompt(null);
                  setIsGeminiLoading(false);
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${isDarkTheme ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-black hover:bg-gray-300'}`}
              >
                Cancel
              </button>
            </div>
          </div>
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
                // Regular chat message or Gemini response
                <div key={index} className='flex items-start gap-3 max-w-[80%] self-start'>
                  {/* Avatar on the left */}
                  <div className='flex-shrink-0'>
                    {msg.isGeminiResponse ? (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isDarkTheme ? 'bg-purple-800 text-purple-100' : 'bg-purple-200 text-purple-800'}`}>
                        🤖
                      </div>
                    ) : (
                      <img 
                        src={`/${msg.senderAvatar}.png`} 
                        alt={msg.senderName}
                        className="w-10 h-10 object-contain rounded-full"
                      />
                    )}
                  </div>
                  {/* Message bubble with sender name */}
                  <div className='flex flex-col'>
                    <span className={`text-xs mb-1 transition-colors duration-300 ${msg.isGeminiResponse ? 'text-purple-400' : isDarkTheme ? 'text-gray-400' : 'text-gray-600'}`}>
                      {msg.senderName}
                      {msg.isGeminiResponse && ' 🤖'}
                    </span>
                    <div className={`px-4 py-2 rounded-lg transition-colors duration-300 whitespace-pre-line break-words ${
                      msg.isGeminiResponse 
                        ? isDarkTheme ? 'bg-purple-900/30 border border-purple-700 text-purple-100' : 'bg-purple-100 border border-purple-300 text-purple-900'
                        : isDarkTheme ? 'bg-white text-black' : 'bg-gray-800 text-white'
                    }`}>
                      {msg.replyTo && (
                        <div className={`mb-2 px-2 py-1 rounded border-l-4 text-xs ${
                          isDarkTheme
                            ? 'bg-black/20 border-gray-500 text-gray-300'
                            : 'bg-white/50 border-gray-400 text-gray-700'
                        }`}>
                          <div className="font-semibold">{msg.replyTo.senderName}</div>
                          <div className="truncate">{msg.replyTo.message || (msg.replyTo.imageUrl ? 'Image' : '')}</div>
                        </div>
                      )}
                      {msg.message}
                      {msg.imageUrl && (
                        <div className="mt-2">
                          <img src={msg.imageUrl} alt="Shared image" className="rounded-lg max-w-full max-h-96 object-contain" />
                          <div className="flex justify-end mt-2">
                            <a
                              href={msg.imageUrl}
                              download={`chat-image-${msg.id || 'file'}.png`}
                              className={`text-xs px-2 py-1 rounded transition-colors ${
                                isDarkTheme ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-black hover:bg-gray-300'
                              }`}
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                    {!msg.isSystemMessage && (
                      <button
                        onClick={() =>
                          setSelectedReply({
                            id: msg.id,
                            senderName: msg.senderName,
                            message: msg.message,
                            imageUrl: msg.imageUrl
                          })
                        }
                        className={`mt-1 text-xs text-left transition-colors ${
                          isDarkTheme ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'
                        }`}
                      >
                        Reply
                      </button>
                    )}
                  </div>
                </div>
              )
            ))}
            {/* Gemini Loading Indicator */}
            {isGeminiLoading && (
              <div className='flex items-start gap-3 max-w-[80%] self-start'>
                <div className='flex-shrink-0'>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isDarkTheme ? 'bg-purple-800 text-purple-100' : 'bg-purple-200 text-purple-800'}`}>
                    🤖
                  </div>
                </div>
                <div className='flex flex-col'>
                  <span className={`text-xs mb-1 transition-colors duration-300 text-purple-400`}>
                    Gemini AI 🤖
                  </span>
                  <div className={`px-4 py-2 rounded-lg transition-colors duration-300 ${isDarkTheme ? 'bg-purple-900/30 border border-purple-700' : 'bg-purple-100 border border-purple-300'}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-purple-400' : 'bg-purple-600'}`} style={{ animationDelay: '0ms' }}></div>
                        <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-purple-400' : 'bg-purple-600'}`} style={{ animationDelay: '150ms' }}></div>
                        <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? 'bg-purple-400' : 'bg-purple-600'}`} style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className={`text-sm ${isDarkTheme ? 'text-purple-200' : 'text-purple-700'}`}>Thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
          {selectedReply && (
            <div className={`mb-2 px-3 py-2 rounded-xl border flex items-start justify-between gap-3 ${
              isDarkTheme ? 'bg-[rgba(48,48,48,1)] border-gray-700 text-white' : 'bg-gray-200 border-gray-300 text-black'
            }`}>
              <div className="min-w-0">
                <div className="text-xs font-semibold">Replying to {selectedReply.senderName}</div>
                <div className="text-xs truncate">{selectedReply.message || (selectedReply.imageUrl ? 'Image' : '')}</div>
              </div>
              <button
                onClick={() => setSelectedReply(null)}
                className={`text-xs px-2 py-1 rounded ${isDarkTheme ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'}`}
              >
                Cancel
              </button>
            </div>
          )}
          <div className='flex items-center relative'>
            <div className='absolute left-4 z-10 group'>
              <button onClick={handleAddClick} className={`p-2 rounded-full transition-colors ${isDarkTheme ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}>
                <PlusIcon color={isDarkTheme ? "#ffffff" : "#000000"} />
              </button>
              <span className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${isDarkTheme ? 'bg-black text-white' : 'bg-gray-800 text-white'}`}>
                Add
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelected}
            />
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


