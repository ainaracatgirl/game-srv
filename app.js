const app = require('express')();
const HttpServer = require('http').createServer;
const HttpsServer = require('https').createServer;
const { JsonDB } = require('node-json-db');
const fs = require("fs");
const uuid = require('uuid');
const { createHash } = require('crypto');

const db = new JsonDB(`${__dirname}/teddor_db.json`);

function generateAccessToken(username) {
    const tok = uuid.v4();
    db.push(`/tokens/${tok}`, username);
    return tok;
}

function authenticateToken(req, res, next) {
    const token = req.query.token;
  
    if (token == null) return res.sendStatus(401);
    if (!db.exists(`/tokens/${token}`)) return res.sendStatus(401);
    
    req.user = db.getData(`/tokens/${token}`);
    return next();
}

function checkWeekly() {
    let dow = new Date().getUTCDay();
    if (!db.exists('/weekly') || dow < db.getData('/weekly')) {
        db.push('/scores', {});
    }
    db.push('/weekly', dow);
}

app.get('/teddor/auth', (req, res) => {
    const user = decodeURIComponent(req.query.user).replace('/', '-');
    const passwd = decodeURIComponent(req.query.passwd);
    const email = decodeURIComponent(req.query.email);

    if (!req.query.user || !req.query.passwd)
        return res.sendStatus(400);
    
    const saltedHash = createHash('sha256').update(`${user}:${passwd}@teddor`).digest().toString('hex');
    const path = `/users/${user}`;
    if (db.exists(path)) {
        const data = db.getData(path);
        if (data.saltedHash !== saltedHash) {
            return res.sendStatus(401);
        }
    } else {
        if (req.query.email) {
            const userObj = { user, email, saltedHash };
            db.push(path, userObj);
        } else {
            return res.sendStatus(400);
        }
    }

    const token = generateAccessToken(user);
    res.send(token);
});
app.get('/teddor/logout', (req, res) => {
    if (!req.query.token) return res.sendStatus(400);
    db.delete(`/tokens/${req.query.token}`);
    res.sendStatus(200);
})
app.get('/teddor/updatescore', authenticateToken, (req, res) => {
    db.push(`/scores/${req.user}`, parseInt(req.query.score));
    res.sendStatus(200);
});
app.get('/teddor/topscores', authenticateToken, (req, res) => {
    if (!db.exists('/scores/')) return res.json({});
    const all = db.getData('/scores/');
    const sortable = Object.entries(all)
        .sort(([,a],[,b]) => b-a)
        .slice(0, 10)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
    
    res.json(sortable);
});
app.get('/teddor/sprl', authenticateToken, (req, res) => {
    const path = `${__dirname}/teddor_sprl/${req.user}.sprl.log`;
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, Buffer.alloc(0));
    }

    const data = fs.readFileSync(path).subarray(0, 518400);
    const newdat = Buffer.alloc(12);

    newdat.writeInt32BE(parseInt(req.query.bstars), 0);
    newdat.writeInt32BE(parseInt(req.query.xp), 4);
    newdat.writeInt32BE(parseInt(req.query.lvl), 8);

    const out = Buffer.concat([ data, newdat ]);
    fs.writeFileSync(path, out);

    res.sendStatus(200);
});
app.get('/teddor/getsprl', authenticateToken, (req, res) => {
    const path = `${__dirname}/teddor_sprl/${req.query.user}.sprl.log`;
    if (!fs.existsSync(path)) {
        res.sendStatus(404);
    }

    const data = fs.readFileSync(path);
    res.send(data.toString('base64'));
});

const server = HttpsServer({
    cert: fs.readFileSync(process.env.GAME_SRV_CERT),
    key: fs.readFileSync(process.env.GAME_SRV_KEY)
}, app);

server.listen(443, () => {
    console.log(`Server listening on port 443`);
});

checkWeekly();
setInterval(checkWeekly, 4 * 3600 * 1000);

HttpServer((req, res) => {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);