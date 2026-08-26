const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.argv.includes('--dev') ? 3000 : 80;
const jwtkey = require('./assets/keys.json').jwtkey;
const execSync = require('child_process').execSync;

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


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'Deltamodders');
    next();
});

/* Itch.io login + APIv1 itch */

app.get('/login/itch', (req, res) => {
    res.sendFile(path.join(__dirname, 'assets/itchLogin.html'));
});
app.post('/login/itch/callback', async (req, res) => {
    if (!req.headers['user-agent']) {
        res.json({ success: false, error: "Invalid request" });
        return;
    }
    var token = req.body.token;
    var quikLookupPath = path.join(__dirname, 'itch.lookup.json');
    if (!fs.existsSync(quikLookupPath)) {
        fs.writeFileSync(quikLookupPath, JSON.stringify({
            existingItchUsers: []
        }));
    }
    var quikLookup = JSON.parse(fs.readFileSync(quikLookupPath, 'utf8'));

    // step 1: validate scopes
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

    if (quikLookup.existingItchUsers.map(u => u.id).indexOf(user.data.user.id) !== -1) {
        var existingUser = quikLookup.existingItchUsers.find(u => u.id === user.data.user.id);
        var existingUserDataPath = path.join(__dirname, 'itch.db', `${existingUser.uuid}.json`);
        if (!fs.existsSync(existingUserDataPath)) {
            res.json({ success: false, error: "Server error: user is in lookup but data not found" });
            return;
        }
        var generatedToken = jwt.sign({ uuid: existingUser.uuid, username: user.data.user.username, userID: user.data.user.id }, jwtkey);
        res.json({ success: true, token: generatedToken });
        return;
    }

    if (!user || !user.data || !user.data.user.id) {
        res.json({ success: false, error: "Failed to fetch user data" });
        return;
    }

    if (!fs.existsSync(path.join(__dirname, 'itch.db'))) {
        fs.mkdirSync(path.join(__dirname, 'itch.db'));
    }

    var uuid = require('crypto').randomUUID();
    fs.writeFileSync(path.join(__dirname, 'itch.db', `${uuid}.json`), JSON.stringify({
        username: user.data.user.username,
        userID: user.data.user.id,
        createdAt: new Date().toISOString(),
        uuid,
        pic: user.data.user.cover_url || "",
        data: {}
    }));

    quikLookup.existingItchUsers.push({ id: user.data.user.id, uuid: uuid });

    fs.writeFileSync(quikLookupPath, JSON.stringify(quikLookup));

    var generatedToken = jwt.sign({ uuid, username: user.data.user.username, userID: user.data.user.id }, jwtkey);

    res.json({ success: true, token: generatedToken });
});
app.get('/apiv1/deltamod_itch/:token', (req, res) => {
    var token = req.params.token;
    if (!token) {
        res.json({ success: false, error: "Missing token" });
        return;
    }

    try {
        var decoded = jwt.verify(token, jwtkey);
        var userInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'itch.db', `${decoded.uuid}.json`), 'utf8'));
        res.json({ success: true, user: {
            name: userInfo.username,
            id: userInfo.userID,
            pic: userInfo.pic
        } } );
    } catch (error) {
        res.json({ success: false, error: "Invalid token: " + token });
    }
});

app.post('/apiv1/deltamod_itch_db/data', (req, res) => {
    var token = req.body.token;
    var data = atob(req.body.data);

    if (!token || !data) {
        res.json({ success: false, error: "Missing token or data" });
        return;
    }

    try {
        var decoded = jwt.verify(token, jwtkey);
    }
    catch (error) {
        res.json({ success: false, error: "Invalid token" });
        return;
    }

    var userDataPath = path.join(__dirname, 'itch.db', `${decoded.uuid}.json`);
    if (!fs.existsSync(userDataPath)) {
        res.json({ success: false, error: "User data not found" });
        return;
    }

    var userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
    userData.data = {
        ...userData.data,
        ...JSON.parse(data)
    }
    var write = JSON.stringify(userData, null, 4);
    if (write.length > 1000000) { // 1MB limit
        res.json({ success: false, error: "Requested edits exceed size limit" });
        return;
    }
    fs.writeFileSync(userDataPath, write);

    res.json({ success: true });
});

app.get('/apiv1/deltamod_itch_db/data', async (req, res) => {
    var token = req.query.token;
    if (!token) {
        res.json({ success: false, error: "Missing token" });
        return;
    }

    try {
        var tokenInfo = jwt.verify(token, jwtkey);
    }
    catch (error) {
        res.json({ success: false, error: "Invalid token" });
        return;
    }

    var userDataPath = path.join(__dirname, 'itch.db', `${tokenInfo.uuid}.json`);
    if (!fs.existsSync(userDataPath)) {
        res.json({ success: false, error: "User data not found" });
        return;
    }

    var userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
    res.json({ success: true, data: userData.data });
});

/* API v1, deltamod */

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

    /*
    deltamodLaunches++;
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!deltamodUserIPs.has(ip)) {
        deltamodUserIPs.add(ip);
    }
    if (!commonVersions[userVersion]) {
        commonVersions[userVersion] = 0;
    }
    commonVersions[userVersion]++;
    */

    res.json({
        update: isOutdated,
        newVersionLink: isOutdated ? latestData.dlMirrorWindows : "",
        version: isOutdated ? latestData.latestVersion : ""
    });

    /*
    try {
        var ipInfo = await axios.get(`http://ip-api.com/json/${ip}`).catch(() => null);

        var country = ipInfo.data.country;

        if (!commonCountries[country]) {
            commonCountries[country] = 0;
        }
        commonCountries[country]++;
    }
    catch (e) {}
    */
});

// Internal server update endpoint
// This endpoint doesn't work in dev mode!
app.post('/apiv1/internal/serverUpdateWebhook', (req, res) => {
    if (process.argv.includes('--dev')) {
        res.status(200).send('OK');
        return;
    }

    execSync('git fetch', { stdio: 'ignore', cwd: path.join(__dirname) });
    execSync('git pull', { stdio: 'ignore', cwd: path.join(__dirname) });
    execSync('npm install', { stdio: 'ignore', cwd: path.join(__dirname) });

    // send response before restarting the server
    res.status(200).send('OK');

    execSync('sleep 1 && pm2 start deltamodders-server', { stdio: 'ignore', cwd: path.join(__dirname), detached: true });
});

// static files
app.use('/misctools', express.static('misctools'));
app.use('/', express.static('pub'));

// 404
app.use((req, res, next) => {
    var msg = "The page you are looking for does not exist.";
    if (req.url == '/thankyou') {
        msg = "...no problem?";
    }
    res.status(404).send(error(404, msg));
});

app.listen(PORT, () => {
    console.log(`Webserver is running on port ${PORT}`);
    if (PORT == 3000) {
        execSync('start http://localhost:3000');
    }
});