// import {WebSocketServer,WebSocket}from "ws";
// const wss=new WebSocketServer({port:8080});
// let userCount=0;
// let allSockets:WebSocket[]=[];
// wss.on("connection",(socket)=>{
//     console.log("New client connected");
//     allSockets.push(socket);
//     userCount++;
//     console.log(`Total users connected: ${userCount}`);
//     socket.on("message",(e)=>{
//         console.log(`Received message: ${e.toString()}`);
//        allSockets.forEach(s=>s.send(`${e.toString()} from server`));
//     })
//     socket.on("disconnect",()=>{
//         console.log("Client disconnected");
//         allSockets=allSockets.filter(s=>s!==socket);
//         userCount--;
//         console.log(`Total users connected: ${userCount}`);
//     })
// })

import {WebSocketServer,WebSocket}from "ws";
const wss= new WebSocketServer({port:8080});
interface User{
    socket:WebSocket;
    room:string;
    name:string;
    avatar:number;
}
interface JoinRequest {
    socket: WebSocket;
    userName: string;
    avatar: number;
    roomId: string;
    requestId: string; // Unique ID for each request
}

let allSockets:User[]=[];
let existingRooms:Set<string>=new Set();
let roomCreators:Map<string, WebSocket>=new Map(); // roomId -> creator socket
let pendingJoinRequests:Map<string, JoinRequest[]>=new Map(); // roomId -> pending requests

// Helper function to generate random name
function generateRandomName(): string {
    const adjectives = ['Cool', 'Swift', 'Bright', 'Brave', 'Clever', 'Daring', 'Epic', 'Fierce', 'Gentle', 'Happy', 'Jolly', 'Kind', 'Lucky', 'Mighty', 'Noble', 'Quick', 'Radiant', 'Smart', 'Tough', 'Wise'];
    const nouns = ['Tiger', 'Eagle', 'Wolf', 'Lion', 'Falcon', 'Bear', 'Hawk', 'Fox', 'Panther', 'Dragon', 'Phoenix', 'Shark', 'Cobra', 'Jaguar', 'Leopard', 'Raven', 'Stallion', 'Viper', 'Warrior', 'Ninja'];
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 1000);
    return `${randomAdjective}${randomNoun}${randomNum}`;
}

// Helper function to broadcast users list to all users in a room
function broadcastUsersList(roomId: string) {
    const roomUsers = allSockets.filter(u => u.room === roomId);
    const usersList = roomUsers.map(u => ({
        name: u.name,
        avatar: u.avatar
    }));
    
    roomUsers.forEach(user => {
        user.socket.send(JSON.stringify({
            type: "users_list",
            users: usersList
        }));
    });
}
wss.on("connection",(socket)=>{
    console.log("New client connected");
    
    socket.on("message",(message)=>{
        try {
            const parsedMessage=JSON.parse(message.toString());
            
            if(parsedMessage.type==="create"){
                const roomId=parsedMessage.payload?.roomId;
                let userName=parsedMessage.payload?.userName;
                // Generate random name if userName is empty or not provided
                if(!userName || userName.trim() === ""){
                    userName = generateRandomName();
                }
                const avatar=parsedMessage.payload?.avatar || 1;
                
                if(!roomId || roomId.trim() === ""){
                    socket.send(JSON.stringify({
                        type: "error",
                        message: "Room ID cannot be empty."
                    }));
                    return;
                }
                
                // Check if user is already in a room
                const existingUserIndex=allSockets.findIndex(u => u.socket === socket);
                if(existingUserIndex > -1){
                    // User already exists, update their room, name, and avatar
                    const existingUser = allSockets[existingUserIndex];
                    if(existingUser){
                        existingUser.room = roomId;
                        existingUser.name = userName;
                        existingUser.avatar = avatar;
                    }
                }else{
                    // New user, add to allSockets
                    allSockets.push({
                        socket,
                        room:roomId,
                        name: userName,
                        avatar: avatar
                    });
                }
                
                existingRooms.add(roomId);
                // Set creator for this room
                roomCreators.set(roomId, socket);
                // Initialize pending requests for this room
                pendingJoinRequests.set(roomId, []);
                socket.send(JSON.stringify({type:"room_created",roomId:roomId, isCreator: true}));
                // Broadcast updated users list to all users in the room
                broadcastUsersList(roomId);
            }

        if(parsedMessage.type==="join"){
            const roomId=parsedMessage.payload?.roomId;
            let userName=parsedMessage.payload?.userName;
            // Generate random name if userName is empty or not provided
            if(!userName || userName.trim() === ""){
                userName = generateRandomName();
            }
            const avatar=parsedMessage.payload?.avatar || 1;
            
            if(!roomId || roomId.trim() === ""){
                socket.send(JSON.stringify({
                    type: "error",
                    message: "Room ID cannot be empty."
                }));
                return;
            }
            
            if(existingRooms.has(roomId)){
                const creator = roomCreators.get(roomId);
                if(creator && creator !== socket){
                    // Room has a creator, send join request
                    const requestId = `${Date.now()}-${Math.random()}`; // Unique ID
                    const request: JoinRequest = {
                        socket,
                        userName,
                        avatar,
                        roomId,
                        requestId
                    };
                    const requests = pendingJoinRequests.get(roomId) || [];
                    requests.push(request);
                    pendingJoinRequests.set(roomId, requests);
                    
                    // Notify creator about the join request
                    creator.send(JSON.stringify({
                        type: "join_request",
                        payload: {
                            userName,
                            avatar,
                            requestId: requestId
                        }
                    }));
                    
                    // Notify requester that request was sent
                    socket.send(JSON.stringify({
                        type: "join_request_sent",
                        message: "Join request sent to room creator"
                    }));
                } else {
                    // No creator or creator is joining, auto-approve
                    const existingUserIndex=allSockets.findIndex(u => u.socket === socket);
                    if(existingUserIndex > -1){
                        const existingUser = allSockets[existingUserIndex];
                        if(existingUser){
                            existingUser.room = roomId;
                            existingUser.name = userName;
                            existingUser.avatar = avatar;
                        }
                    }else{
                        allSockets.push({
                            socket,
                            room:roomId,
                            name: userName,
                            avatar: avatar
                        });
                    }
                    socket.send(JSON.stringify({type:"room_joined",roomId:roomId}));
                    broadcastUsersList(roomId);
                }
            }else{
                socket.send(JSON.stringify({type:"error",message:"roomid dont exist you can create one"}));
            }
        }

        if(parsedMessage.type==="approve_join"){
            const roomId = parsedMessage.payload?.roomId;
            const requestId = parsedMessage.payload?.requestId;
            
            if(roomId && requestId){
                const requests = pendingJoinRequests.get(roomId) || [];
                const requestIndex = requests.findIndex(r => r.requestId === requestId);
                if(requestIndex > -1){
                    const request = requests[requestIndex];
                    // Add user to room
                    allSockets.push({
                        socket: request.socket,
                        room: roomId,
                        name: request.userName,
                        avatar: request.avatar
                    });
                    
                    // Notify user they were approved
                    request.socket.send(JSON.stringify({
                        type: "room_joined",
                        roomId: roomId
                    }));
                    
                    // Remove request from pending
                    requests.splice(requestIndex, 1);
                    pendingJoinRequests.set(roomId, requests);
                    
                    // Broadcast updated users list
                    broadcastUsersList(roomId);
                    
                    // Notify creator request was handled
                    const creator = roomCreators.get(roomId);
                    if(creator){
                        creator.send(JSON.stringify({
                            type: "join_approved",
                            requestId: requestId
                        }));
                    }
                }
            }
        }

        if(parsedMessage.type==="reject_join"){
            const roomId = parsedMessage.payload?.roomId;
            const requestId = parsedMessage.payload?.requestId;
            
            if(roomId && requestId){
                const requests = pendingJoinRequests.get(roomId) || [];
                const requestIndex = requests.findIndex(r => r.requestId === requestId);
                if(requestIndex > -1){
                    const request = requests[requestIndex];
                    
                    // Notify user they were rejected
                    request.socket.send(JSON.stringify({
                        type: "join_rejected",
                        message: "Not allowed"
                    }));
                    
                    // Remove request from pending
                    requests.splice(requestIndex, 1);
                    pendingJoinRequests.set(roomId, requests);
                    
                    // Notify creator request was handled
                    const creator = roomCreators.get(roomId);
                    if(creator){
                        creator.send(JSON.stringify({
                            type: "join_rejected",
                            requestId: requestId
                        }));
                    }
                }
            }
        }

        if(parsedMessage.type==="chat"){
            const currentUser=allSockets.find(u => u && u.socket === socket);
            if(currentUser && currentUser.room){
                const roomId=currentUser.room;
                const messageData = {
                    type: "message",
                    payload: {
                        message: parsedMessage.payload.message,
                        senderName: currentUser.name,
                        senderAvatar: currentUser.avatar
                    }
                };
                allSockets.forEach(user => {
                    if(user && user.room === roomId){
                        user.socket.send(JSON.stringify(messageData));
                    }
                });
            }else{
                socket.send(JSON.stringify({
                    type: "error",
                    message: "You must join a room before sending messages."
                }));
            }
        }
        } catch (error) {
            console.error("Invalid JSON received:", message.toString());
            socket.send(JSON.stringify({
                type: "error",
                message: "Invalid JSON format. Please send valid JSON."
            }));
        }
    })
    
    socket.on("error",(error)=>{
        console.error("WebSocket error:", error);
    });
    
    socket.on("close",()=>{
        console.log("Client disconnected");
        const index=allSockets.findIndex(u => u.socket === socket);
        if(index>-1){
            const disconnectedUser = allSockets[index];
            if(disconnectedUser){
                const roomId = disconnectedUser.room;
                allSockets.splice(index,1);
                // Check if creator disconnected
                if(roomCreators.get(roomId) === socket){
                    roomCreators.delete(roomId);
                    pendingJoinRequests.delete(roomId);
                }
                // Remove from pending requests if exists
                for(const [rId, requests] of pendingJoinRequests.entries()){
                    const reqIndex = requests.findIndex(r => r.socket === socket);
                    if(reqIndex > -1){
                        requests.splice(reqIndex, 1);
                        pendingJoinRequests.set(rId, requests);
                    }
                }
                // Broadcast updated users list to remaining users in the room
                if(roomId){
                    broadcastUsersList(roomId);
                }
            }
        }
        console.log(`Total users connected: ${allSockets.length}`);
    })
})