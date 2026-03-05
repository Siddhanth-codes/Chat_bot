import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ThemeIcon } from '../icons/theme'

function Dashboard() {
    const [roomId, setRoomId] = useState('');
    const [userName, setUserName] = useState(() => {
        const saved = localStorage.getItem('userName');
        return saved || '';
    });
    const [showAvatars, setShowAvatars] = useState(false);
    const [selectedAvatar, setSelectedAvatar] = useState<number>(() => {
        const saved = localStorage.getItem('selectedAvatar');
        if (saved) {
            return parseInt(saved);
        }
        // Set default avatar (1) if none exists
        localStorage.setItem('selectedAvatar', '1');
        return 1;
    });
    const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
        const saved = localStorage.getItem('theme');
        return saved ? saved === 'dark' : true; // Default to dark
    });
    const [joinStatus, setJoinStatus] = useState('');
    const roomIdRef = useRef<HTMLInputElement>(null);
    const joinWsRef = useRef<WebSocket | null>(null);
    const navigate = useNavigate();

    const generateRandomRoomId = (): string => {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    };

    const handleAvatarSelect = (avatarNum: number) => {
        setSelectedAvatar(avatarNum);
        localStorage.setItem('selectedAvatar', avatarNum.toString());
        setShowAvatars(false);
    };

    const handleUserNameChange = (name: string) => {
        setUserName(name);
        localStorage.setItem('userName', name);
    };

    const handleCreate = () => {
        const randomId = generateRandomRoomId();
        navigate(`/chat?roomId=${encodeURIComponent(randomId)}&action=create&avatar=${selectedAvatar}&userName=${encodeURIComponent(userName)}`);
    };

    const handleJoin = () => {
        const id = roomIdRef.current?.value || roomId;
        if (id.trim()) {
            if (joinWsRef.current) {
                joinWsRef.current.close();
                joinWsRef.current = null;
            }

            const ws = new WebSocket("ws://localhost:8080");
            joinWsRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: "join",
                    payload: {
                        roomId: id.trim(),
                        userName: userName,
                        avatar: selectedAvatar
                    }
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data as string);
                    if (data.type === "room_joined") {
                        setJoinStatus('');
                        ws.close();
                        joinWsRef.current = null;
                        const assignedName = data.userName || userName;
                        navigate(`/chat?roomId=${encodeURIComponent(id.trim())}&action=join&avatar=${selectedAvatar}&userName=${encodeURIComponent(assignedName)}`);
                    } else if (data.type === "join_request_sent") {
                        setJoinStatus('Join request sent. Waiting for approval...');
                    } else if (data.type === "join_rejected") {
                        setJoinStatus('Not allowed');
                        ws.close();
                        joinWsRef.current = null;
                    } else if (data.type === "error") {
                        setJoinStatus(data.message || 'Unable to join room');
                        ws.close();
                        joinWsRef.current = null;
                    }
                } catch {
                    setJoinStatus('Unexpected response from server');
                }
            };

            ws.onerror = () => {
                setJoinStatus('Connection error. Please try again.');
                ws.close();
                joinWsRef.current = null;
            };
        }
    };

    const toggleTheme = () => {
        const newTheme = !isDarkTheme;
        setIsDarkTheme(newTheme);
        localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    };

    useEffect(() => {
        return () => {
            if (joinWsRef.current) {
                joinWsRef.current.close();
                joinWsRef.current = null;
            }
        };
    }, []);

    return (
        <div
            className={`h-screen flex flex-col relative transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(33,33,33,1)]' : 'bg-white'}`}
            onClick={() => setShowAvatars(false)}
        >
            {/* Theme Toggle - Top Right */}
            <button 
                onClick={toggleTheme}
                className={`absolute top-4 right-4 p-2 rounded-full transition-colors z-50 ${isDarkTheme ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
            >
                <ThemeIcon size={24} color={isDarkTheme ? "#ffffff" : "#000000"} />
            </button>

            {/* Website Image - Center */}
            <div className='flex-1 flex items-center justify-center'>
                <div className='flex flex-col items-center gap-6' onClick={(e) => e.stopPropagation()}>
                    <button 
                        onClick={() => setShowAvatars(!showAvatars)}
                        className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <img src="/website.png" alt="Website" className="w-32 h-32 object-contain" />
                        {!showAvatars && (
                            <p className={`text-lg mt-4 transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>Select Avatar</p>
                        )}
                    </button>
                    
                    {/* Name Input Box */}
                    <div className={`rounded-3xl p-6 shadow-2xl border w-full max-w-md transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-gray-100 border-gray-300'}`}>
                        <label className={`text-lg font-semibold mb-3 block transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>Enter Your Name</label>
                        <input 
                            type="text" 
                            value={userName}
                            onChange={(e) => handleUserNameChange(e.target.value)}
                            className={`w-full px-4 py-3 rounded-2xl focus:outline-none focus:ring-2 transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(48,48,48,1)] text-white focus:ring-white placeholder:text-gray-400' : 'bg-gray-200 text-black focus:ring-gray-800 placeholder:text-gray-600'}`}
                            placeholder="Your name"
                        />
                    </div>
                </div>
            </div>

            {/* Avatar Selection Box - Right Side */}
            {showAvatars && (
                <div
                    className={`absolute right-8 top-1/2 transform -translate-y-1/2 rounded-3xl p-6 shadow-2xl border animate-fade-in-scale transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(24,24,24,1)] border-gray-700' : 'bg-white border-gray-300'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 className={`text-xl font-semibold mb-4 text-center transition-colors duration-300 ${isDarkTheme ? 'text-white' : 'text-black'}`}>Select Avatar</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                            <button
                                key={num}
                                onClick={() => handleAvatarSelect(num)}
                                className={`p-3 rounded-xl transition-colors cursor-pointer group ${
                                    selectedAvatar === num 
                                        ? isDarkTheme ? 'bg-gray-700 ring-2 ring-white' : 'bg-gray-300 ring-2 ring-gray-800'
                                        : isDarkTheme ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
                                }`}
                            >
                                <img 
                                    src={`/${num}.png`} 
                                    alt={`Avatar ${num}`}
                                    className="w-16 h-16 object-contain rounded-full group-hover:scale-110 transition-transform"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Chat Input Box - Bottom (same position/width as chat.tsx) */}
            <div className='flex justify-center pb-4 px-4'>
                <div className='w-full max-w-3xl flex flex-col gap-2 relative' onClick={(e) => e.stopPropagation()}>
                    {joinStatus && (
                        <div className={`text-sm px-3 py-2 rounded-lg ${isDarkTheme ? 'bg-gray-800 text-white' : 'bg-gray-200 text-black'}`}>
                            {joinStatus}
                        </div>
                    )}
                    <div className='w-full flex items-center relative'>
                        <input 
                            ref={roomIdRef}
                            type="text" 
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            className={`w-full px-4 py-4 pl-4 pr-40 rounded-3xl focus:outline-none transition-colors duration-300 ${isDarkTheme ? 'bg-[rgba(48,48,48,1)] text-white placeholder:text-gray-400' : 'bg-gray-200 text-black placeholder:text-gray-600'}`}
                            placeholder="Enter a roomId"
                        />
                        <button 
                            onClick={handleCreate}
                            className={`absolute right-28 px-4 py-2 rounded-lg transition-colors ${isDarkTheme ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                        >
                            Create
                        </button>
                        <button 
                            onClick={handleJoin}
                            className={`absolute right-4 px-4 py-2 rounded-lg transition-colors ${isDarkTheme ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                        >
                            Join
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
export default Dashboard;
