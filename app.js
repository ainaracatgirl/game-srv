const WebSocket = require("ws").Server;
const HttpsServer = require('https').createServer;
const fs = require("fs");

const server = HttpsServer({
    cert: fs.readFileSync(process.env.GAME_SRV_CERT),
    key: fs.readFileSync(process.env.GAME_SRV_KEY)
})
const wss = new WebSocket({ server });

server.on('connection', (sock) => {
    console.log("conn");
})

server.listen(443);