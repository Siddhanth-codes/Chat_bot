import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

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
    const roomIdRef = useRef<HTMLInputElement>(null);
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
        navigate(`/chat?roomId=${encodeURIComponent(randomId)}&action=create&avatar=${selectedAvatar}`);
    };

    const handleJoin = () => {
        const id = roomIdRef.current?.value || roomId;
        if (id.trim()) {
            navigate(`/chat?roomId=${encodeURIComponent(id.trim())}&action=join&avatar=${selectedAvatar}`);
        }
    };

    return (
        <div className='h-screen bg-[rgba(33,33,33,1)] flex flex-col relative'>
            {/* Website Image - Center */}
            <div className='flex-1 flex items-center justify-center'>
                <div className='flex flex-col items-center gap-6'>
                    <button 
                        onClick={() => setShowAvatars(!showAvatars)}
                        className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <img src="/website.png" alt="Website" className="w-32 h-32 object-contain" />
                        {!showAvatars && (
                            <p className="text-white text-lg mt-4">Select Avatar</p>
                        )}
                    </button>
                    
                    {/* Name Input Box */}
                    <div className='bg-[rgba(24,24,24,1)] rounded-3xl p-6 shadow-2xl border border-gray-700 w-full max-w-md'>
                        <label className="text-white text-lg font-semibold mb-3 block">Enter Your Name</label>
                        <input 
                            type="text" 
                            value={userName}
                            onChange={(e) => handleUserNameChange(e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-[rgba(48,48,48,1)] text-white focus:outline-none focus:ring-2 focus:ring-white placeholder:text-gray-400"
                            placeholder="Your name"
                        />
                    </div>
                </div>
            </div>

            {/* Avatar Selection Box - Right Side */}
            {showAvatars && (
                <div className='absolute right-8 top-1/2 transform -translate-y-1/2 bg-[rgba(24,24,24,1)] rounded-3xl p-6 shadow-2xl border border-gray-700 animate-fade-in-scale'>
                    <h3 className="text-white text-xl font-semibold mb-4 text-center">Select Avatar</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                            <button
                                key={num}
                                onClick={() => handleAvatarSelect(num)}
                                className={`p-3 rounded-xl hover:bg-gray-700 transition-colors cursor-pointer group ${
                                    selectedAvatar === num ? 'bg-gray-700 ring-2 ring-white' : ''
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
                <div className='w-full max-w-3xl flex items-center relative'>
                    <input 
                        ref={roomIdRef}
                        type="text" 
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="w-full px-4 py-4 pl-4 pr-40 rounded-3xl bg-[rgba(48,48,48,1)] text-white focus:outline-none placeholder:text-gray-400" 
                        placeholder="Enter a roomId"
                    />
                    <button 
                        onClick={handleCreate}
                        className='absolute right-28 px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200 transition-colors'
                    >
                        Create
                    </button>
                    <button 
                        onClick={handleJoin}
                        className='absolute right-4 px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200 transition-colors'
                    >
                        Join
                    </button>
                </div>
            </div>
        </div>
    )
}
export default Dashboard;

