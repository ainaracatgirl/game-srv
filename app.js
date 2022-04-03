const app = require('express')();
const HttpServer = require('http').createServer;
const HttpsServer = require('https').createServer;
const { JsonDB } = require('node-json-db');
const fs = require("fs");
const uuid = require('uuid');
const { createHash } = require('crypto');
const cors = require('cors');
const fetch = require('node-fetch');
const JWT = require('jsonwebtoken');

app.use(cors());
const db = new JsonDB(`${__dirname}/teddor_db.json`);

async function validateJWT(jwt) {
    const f = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
    const json = await f.json();
    const keyid = JWT.decode(jwt, { complete: true }).header.kid;
    const googlePem = json[keyid];

    try {
        const x = JWT.verify(jwt, googlePem, {
            algorithms: [ "RS256" ],
            audience: "jdev-es",
            issuer: "https://securetoken.google.com/jdev-es"
        });

        return x;
    } catch(err) {
        return null;
    }
}

function generateAccessToken(user) {
    const tok = uuid.v4();
    db.push(`/tokens/${tok}`, user);
    db.save();
    return tok;
}

function authenticateToken(req, res, next) {
    const token = req.query.token;
  
    if (token == null) return res.sendStatus(401);
    if (!db.exists(`/tokens/${token}`)) return res.sendStatus(401);
    
    req.user = db.getData(`/tokens/${token}`);
    return next();
}

async function authMode1(req, res) {
    if (!req.query.jwt) return res.sendStatus(400);
    const val = await validateJWT(req.query.jwt);
    if (!val) return res.sendStatus(401);

    if (!db.exists(`/users/${val.sub}`)) {
        db.push(`/users/${val.sub}`, { uid: val.sub, pic: val.picture, user: val.email.substr(0, val.email.indexOf('@')), email: val.email });
        db.save();
    }

    const token = generateAccessToken(val.sub);
    return res.send(token);
}

function checkWeekly() {
    let dow = new Date().getUTCDay();
    if (!db.exists('/weekly') || dow < db.getData('/weekly')) {
        db.push('/scores', {});
    }
    db.push('/weekly', dow);
    db.save();
}

app.get('/teddor/migrate', async (req, res) => {
    if (req.query.tddmigv == 1) {
        if (req.query.jdevauth) {
            const jwt = await validateJWT(req.query.jdevauth_id_token);
            if (jwt) {
                if (db.exists(`/users/${jwt.sub}`)) {
                    return res.status(409).send(`This jDev Account has been already used for migration. You can contact support at <a href="mailto:support@jdev.com.es">support@jdev.com.es</a>`);
                }
                const tdduser = db.getData(`/users/${req.query.tdduser}`);
                db.push(`/users/${jwt.sub}`, { migrated: 1, uid: jwt.sub, pic: jwt.picture, user: tdduser.user, email: jwt.email, old_email: tdduser.email });
                db.save();
                return res.status(200).send("Your account has been migrated successfully");
            }
        } else {
            const migURL = `https://game.jdev.com.es/teddor/migrate?tdduser=${req.query.tdduser}&tddmigv=1`;
            const url = `https://jdev.com.es/auth?redirect=${encodeURIComponent(migURL)}`;
            return res.redirect(url);
        }
    }

    return res.status(400).send(`Invalid or expired migration link. Please request a new one by replying to the email you received or by sending an email to <a href="mailto:support@jdev.com.es">support@jdev.com.es</a>`);
});

app.get('/teddor/auth', (req, res) => {
    if (req.query.authmode == 1) return authMode1(req, res);
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
            db.save();
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
    db.save();
    res.sendStatus(200);
});
app.get('/teddor/revoketokens', (req, res) => {
    if (!req.query.user) return res.sendStatus(400);
    const toks = db.getData(`/tokens`);
    for (const tok in toks) {
        if (toks[tok] == req.query.user) delete toks[tok];
    }
    db.push(`/tokens`, toks);
    db.save();
    return res.sendStatus(200);
});
app.get('/teddor/updatescore', authenticateToken, (req, res) => {
    const user = db.getData(`/users/${req.user}`).user;
    db.push(`/scores/${user}`, parseInt(req.query.score));
    db.save();
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
    const user = db.getData(`/users/${req.user}`).user;

    const path = `${__dirname}/teddor_sprl/${user}.sprl.log`;
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