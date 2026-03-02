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
}
let allSockets:User[]=[];
let existingRooms:Set<string>=new Set();
wss.on("connection",(socket)=>{
    console.log("New client connected");
    
    socket.on("message",(message)=>{
        try {
            const parsedMessage=JSON.parse(message.toString());
            
            if(parsedMessage.type==="create"){
                const roomId=parsedMessage.payload?.roomId;
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
                    // User already exists, update their room
                    const existingUser = allSockets[existingUserIndex];
                    if(existingUser){
                        existingUser.room = roomId;
                    }
                }else{
                    // New user, add to allSockets
                    allSockets.push({
                        socket,
                        room:roomId
                    });
                }
                
                existingRooms.add(roomId);
                socket.send(JSON.stringify({type:"room_created",roomId:roomId}));
            }

        if(parsedMessage.type==="join"){
            const roomId=parsedMessage.payload?.roomId;
            if(!roomId || roomId.trim() === ""){
                socket.send(JSON.stringify({
                    type: "error",
                    message: "Room ID cannot be empty."
                }));
                return;
            }
            
            if(existingRooms.has(roomId)){
                // Check if user is already in a room
                const existingUserIndex=allSockets.findIndex(u => u.socket === socket);
                if(existingUserIndex > -1){
                    // User already exists, update their room
                    const existingUser = allSockets[existingUserIndex];
                    if(existingUser){
                        existingUser.room = roomId;
                    }
                }else{
                    // New user, add to allSockets
                    allSockets.push({
                        socket,
                        room:roomId
                    });
                }
                socket.send(JSON.stringify({type:"room_joined",roomId:roomId}));
            }else{
                socket.send(JSON.stringify({type:"error",message:"roomid dont exist you can create one"}));
            }
        }

        if(parsedMessage.type==="chat"){
            const currentUser=allSockets.find(u => u && u.socket === socket);
            if(currentUser && currentUser.room){
                const roomId=currentUser.room;
                allSockets.forEach(user => {
                    if(user && user.room === roomId){
                        user.socket.send(parsedMessage.payload.message);
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
            allSockets.splice(index,1);
        }
        console.log(`Total users connected: ${allSockets.length}`);
    })
})