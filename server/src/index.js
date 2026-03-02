import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ port: 8080 });
let userCount = 0;
wss.on("connection", (socket) => {
    console.log("New client connected");
    userCount++;
    console.log(`Total users connected: ${userCount}`);
});
//# sourceMappingURL=index.js.map