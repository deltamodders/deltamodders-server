const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = express();
const PORT = (parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 80);
const execSync = require('child_process').execSync;
const { JSONFilePreset } = require('lowdb');

const flags = require('./package.json').flags || {};

let itchDB = null;
let jwtkey = null;

async function initializeItchDB() {
    if (flags.ITCH_IO_SERVICE && !process.argv.includes('--dev')) {
        console.log("Itch.io service is enabled.");
        jwtkey = require('./assets/keys.json').jwtkey;

        const defaultData = { users: [] };
        itchDB = await JSONFilePreset(
            path.join(__dirname, 'itchdbv2.json'),
            defaultData
        );
    }
}

function logToDisk(logMessage) {
    const logFilePath = 'server.log';
    if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, '');
    }
    fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${logMessage}\n`);
}

function error(errorCode, specialNote) {
    let errorPage = fs.readFileSync('assets/error.html', 'utf8');
    errorPage = errorPage.replace('$errorCode', errorCode);
    errorPage = errorPage.replace('$specialNote', specialNote);
    return errorPage;
}

function findUserByUUID(uuid) {
    if (!itchDB) return null;
    return itchDB.data.users.find(u => u.uuid === uuid) || null;
}

function findUserByItchToken(token) {
    if (!itchDB) return null;
    return itchDB.data.users.find(u => u.token === token) || null;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'Deltamodders');
    next();
});

app.get('/login/itch', (req, res) => {
    if (!flags.ITCH_IO_SERVICE) {
        res.status(200).send(error("Not available", "This service is not available at the moment."));
        return;
    }
    res.sendFile(path.join(__dirname, 'assets/itchLogin.html'));
});

app.post('/login/itch/callback', async (req, res) => {
    if (!flags.ITCH_IO_SERVICE || !itchDB || !jwtkey) {
        res.status(200).send(error("Not available", "This service is not available at the moment."));
        return;
    }

    var token = req.body.token;

    if (!token) {
        res.json({ success: false, error: "Missing token" });
        return;
    }

    var scopesResponse = await axios.get('https://api.itch.io/credentials/info', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).catch(() => null);

    if (!scopesResponse || !scopesResponse.data || !scopesResponse.data.scopes) {
        res.json({ success: false, error: "Token is invalid" });
        return;
    }

    if (!scopesResponse.data.scopes.includes('profile')) {
        res.json({ success: false, error: "Token is missing required scopes" });
        return;
    }

    var user = await axios.get('https://api.itch.io/profile', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).catch(() => null);

    if (!user || !user.data || !user.data.user || !user.data.user.id) {
        res.json({ success: false, error: "Failed to fetch user data" });
        return;
    }

    var existingUser = findUserByItchToken(token);

    if (existingUser) {
        existingUser.username = user.data.user.username;
        existingUser.userID = user.data.user.id;
        existingUser.pic = user.data.user.cover_url || user.data.user.avatar_url || null;

        if (!existingUser.data) {
            existingUser.data = {};
        }

        await itchDB.write();

        var generatedToken = jwt.sign({
            uuid: existingUser.uuid,
            username: existingUser.username,
            userID: existingUser.userID
        }, jwtkey);

        res.json({ success: true, token: generatedToken });
        return;
    }

    var uuid = crypto.randomUUID();

    var newUser = {
        uuid,
        token,
        username: user.data.user.username,
        userID: user.data.user.id,
        pic: user.data.user.cover_url || user.data.user.avatar_url || null,
        data: {}
    };

    itchDB.data.users.push(newUser);
    await itchDB.write();

    var generatedToken = jwt.sign({
        uuid: newUser.uuid,
        username: newUser.username,
        userID: newUser.userID
    }, jwtkey);

    res.json({ success: true, token: generatedToken });
});

app.get('/apiv1/deltamod_itch/:token', (req, res) => {
    if (!flags.ITCH_IO_SERVICE || !itchDB || !jwtkey) {
        res.status(200).json({ success: false, error: "This service is not available at the moment." });
        return;
    }

    var token = req.params.token;

    if (!token) {
        res.json({ success: false, error: "Missing token" });
        return;
    }

    try {
        var decoded = jwt.verify(token, jwtkey);
        var userInfo = findUserByUUID(decoded.uuid);

        if (!userInfo) {
            res.json({ success: false, error: "User data not found" });
            return;
        }

        res.json({
            success: true,
            user: {
                name: userInfo.username,
                id: userInfo.userID,
                pic: userInfo.pic
            }
        });
    } catch (error) {
        res.json({ success: false, error: "Invalid token" });
    }
});

app.post('/apiv1/deltamod_itch_db/data', async (req, res) => {
    if (!flags.ITCH_IO_SERVICE || !itchDB || !jwtkey) {
        res.status(200).json({ success: false, error: "This service is not available at the moment." });
        return;
    }

    var token = req.body.token;
    var encodedData = req.body.data;

    if (!token || !encodedData) {
        res.json({ success: false, error: "Missing token or data" });
        return;
    }

    var decoded;

    try {
        decoded = jwt.verify(token, jwtkey);
    } catch (error) {
        res.json({ success: false, error: "Invalid token" });
        return;
    }

    var userData = findUserByUUID(decoded.uuid);

    if (!userData) {
        res.json({ success: false, error: "User data not found" });
        return;
    }

    var data;

    try {
        data = Buffer.from(encodedData, 'base64').toString('utf8');
    } catch (error) {
        res.json({ success: false, error: "Invalid encoded data" });
        return;
    }

    var parsedData;

    try {
        parsedData = JSON.parse(data);
    } catch (error) {
        res.json({ success: false, error: "Invalid JSON data" });
        return;
    }

    if (typeof parsedData !== 'object' || parsedData === null || Array.isArray(parsedData)) {
        res.json({ success: false, error: "Data must be a JSON object" });
        return;
    }

    userData.data = {
        ...(userData.data || {}),
        ...parsedData
    };

    if (Buffer.byteLength(JSON.stringify(userData.data), 'utf8') > 1000000) {
        res.json({ success: false, error: "Requested edits exceed size limit" });
        return;
    }

    try {
        await itchDB.write();
    } catch (error) {
        logToDisk(`Failed to save Itch.io database: ${error.message}`);
        res.status(500).json({ success: false, error: "Failed to save user data" });
        return;
    }

    res.json({ success: true });
});

app.get('/apiv1/deltamod_itch_db/data', async (req, res) => {
    if (!flags.ITCH_IO_SERVICE || !itchDB || !jwtkey) {
        res.status(200).json({ success: false, error: "This service is not available at the moment." });
        return;
    }

    var token = req.query.token;

    if (!token) {
        res.json({ success: false, error: "Missing token" });
        return;
    }

    var tokenInfo;

    try {
        tokenInfo = jwt.verify(token, jwtkey);
    } catch (error) {
        res.json({ success: false, error: "Invalid token" });
        return;
    }

    var userData = findUserByUUID(tokenInfo.uuid);

    if (!userData) {
        res.json({ success: false, error: "User data not found" });
        return;
    }

    res.json({
        success: true,
        data: userData.data || {}
    });
});

app.get('/apiv1/deltamod/latest', async (req, res) => {
    const latestData = JSON.parse(fs.readFileSync('assets/deltamodLatest.json', 'utf8'));
    const userVersion = req.query.v || null;

    if (!userVersion) {
        res.json({ error: "Data missing" });
        return;
    }

    var versionParts = userVersion.split('.').map(Number);

    if (versionParts.some(isNaN) || versionParts.length != 3) {
        res.json({ error: "Invalid version format" });
        return;
    }

    var latestVersionParts = latestData.latestVersion.split('.').map(Number);

    var isOutdated = false;

    for (let i = 0; i < Math.max(versionParts.length, latestVersionParts.length); i++) {
        const userPart = versionParts[i] || 0;
        const latestPart = latestVersionParts[i] || 0;

        if (userPart < latestPart) {
            isOutdated = true;
            break;
        } else if (userPart > latestPart) {
            break;
        }
    }

    res.json({
        update: isOutdated,
        newVersionLink: isOutdated ? latestData.dlMirrorWindows : "",
        version: isOutdated ? latestData.latestVersion : ""
    });
});

app.post('/apiv1/internal/serverUpdateWebhook', (req, res) => {
    if (process.argv.includes('--dev')) {
        res.status(200).send('OK');
        return;
    }

    execSync('git fetch', { stdio: 'ignore', cwd: __dirname });
    execSync('git pull', { stdio: 'ignore', cwd: __dirname });
    execSync('npm install', { stdio: 'ignore', cwd: __dirname });

    res.status(200).send('OK');

    execSync('sleep 1 && pm2 start deltamodders-server', {
        stdio: 'ignore',
        cwd: __dirname,
        detached: true
    });
});

app.use('/misctools', express.static('misctools'));
app.use('/', express.static('pub'));

app.get('/discord', (req, res) => {
    res.redirect('https://discord.gg/EtxuMrk52C');
});

app.get('/remoterune', (req, res) => {
    res.redirect('https://remoterune.net/?utm_source=deltamodders');
});

app.use((req, res, next) => {
    var msg = "The page you are looking for does not exist.";

    if (req.url == '/thankyou') {
        msg = "...no problem?";
    }

    res.status(404).send(error(404, msg));
});

async function startServer() {
    await initializeItchDB();

    app.listen(PORT, () => {
        console.log(`Webserver is running on port ${PORT}`);

        if (PORT == 3000) {
            execSync('start http://localhost:3000');
        }
    });
}

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});