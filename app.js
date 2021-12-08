const app = require('express')();
const HttpServer = require('http').createServer;
const HttpsServer = require('https').createServer;
const fs = require("fs");

app.get('/', (req, res) => {
    res.send("hai~ hai~");
});

const server = HttpsServer({
    cert: fs.readFileSync(process.env.GAME_SRV_CERT),
    key: fs.readFileSync(process.env.GAME_SRV_KEY)
}, app);

server.listen(443, () => {
    console.log(`Server listening on port 443`);
});
HttpServer((req, res) => {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);