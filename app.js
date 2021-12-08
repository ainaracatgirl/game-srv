const WebSocket = require("ws").Server;
const HttpsServer = require('https').createServer;
const fs = require("fs");

server = HttpsServer({
    cert: fs.readFileSync(process.env.GAME_SRV_CERT),
    key: fs.readFileSync(process.env.GAME_SRV_KEY)
})
socket = new WebSocket({
    server
});

server.listen(443);