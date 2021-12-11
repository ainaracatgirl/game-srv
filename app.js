const app = require('express')();
const HttpServer = require('http').createServer;
const HttpsServer = require('https').createServer;
const { JsonDB } = require('node-json-db');
const fs = require("fs");
const { createHash } = require('crypto'); 
const jwt = require('jsonwebtoken');

require('dotenv').config();

const db = new JsonDB("teddor_db.json");

function generateAccessToken(username) {
    return jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '4h' });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
  
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
    
        req.user = user;
        next();
    });
}

app.get('/teddor/auth', (req, res) => {
    const user = decodeURIComponent(req.query.user).replace('/', '-');
    const passwd = decodeURIComponent(req.query.passwd);
    const email = decodeURIComponent(req.query.email);

    if (!req.query.user || !req.query.passwd)
        return res.status(400).json({ code: 400, message: "Missing query parameters" });
    
    const saltedHash = createHash('SHA-256').update(`${user}:${passwd}@teddor`).digest().toString('hex');
    const path = `/users/${user}`;
    if (db.exists(path)) {
        const data = db.getData(path);
        if (data.saltedHash !== saltedHash) {
            return res.status(401).json({ code: 401, message: "Credentials incorrect" });
        }
    } else {
        if (req.query.email) {
            const userObj = { user, email, saltedHash };
            db.push(path, userObj);
        } else {
            return res.status(400).json({ code: 400, message: "Missing query parameters" });
        }
    }

    const token = generateAccessToken(user);
    res.json({ code: 200, message: 'Token generated. Expires in 4h.', token });
});
app.get('/teddor/updatescore', authenticateToken, (req, res) => {
    db.push(`/scores/${req.user.username}`, parseInt(req.query.score));
    res.json({ code: 200, message: 'Score updated.' });
});
app.get('/teddor/topscores', authenticateToken, (req, res) => {
    const all = db.getData('/scores/');
    const sortable = Object.entries(all)
        .sort(([,a],[,b]) => b-a)
        .slice(0, 10)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
    
    res.json(sortable);
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