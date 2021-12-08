const WebSocket = require("ws").Server;
const HttpsServer = require('https').createServer;
const fs = require("fs");

const server = HttpsServer({
    cert: fs.readFileSync(process.env.GAME_SRV_CERT),
    key: fs.readFileSync(process.env.GAME_SRV_KEY)
}, (req, res) => {
    res.writeHead(200);
    res.end(req.url);
});
const wss = new WebSocket({ server });

server.listen(443, () => {
    console.log(`Server listening on port 443`);
});