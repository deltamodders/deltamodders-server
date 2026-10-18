const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = (parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 3000);
const execSync = require('child_process').execSync;
const flags = require('./package.json').flags || {};
const chalk = require('chalk');
const serverFilePath = path.dirname(require.main?.filename || process.argv[1]);

// console help functions
function clear() {
    process.stdout.write('\x1Bc');
}
function log(...messageArray) {
    var message = messageArray.join(' ');
    var stack = new Error().stack.split('\n')[2].trim();
    var stackParts = stack.split(' ');
    var fileInfo = stackParts[stackParts.length - 1].split('\\');
    var fileName = fileInfo[fileInfo.length - 1];
    process.stdout.write(`${chalk.blue(`[${fileName.split(':')[0]}]`)} ${message}\n`);
}

// generate error page
function error(errorCode, specialNote, request) {
    if (request.headers['user-agent'] && request.headers['user-agent'].includes('curl')) {
        return `DELTAModders Server v${require('./package.json').version}\n(You are receiving a pure text output because it appears you are using curl)\nError ${errorCode}: ${specialNote}`;
    }
    let errorPage = fs.readFileSync('endpoints_assets/error.html', 'utf8');
    errorPage = errorPage.replace('$errorCode', errorCode);
    errorPage = errorPage.replace('$specialNote', specialNote);
    return errorPage;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// add http header watermark
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'DELTAModders Server v' + require('./package.json').version);
    next();
});

// Evaluate request
app.use(async (req, res, next) => {
    var isDebugCall = req.headers['user-agent'].includes('deltamodders-dev');

    // check direct file match
    var httpPath = req.path;
    if (httpPath.endsWith('/')) {
        httpPath += 'index.html';
    }

    // serve maintenance page only if maintenance flag is set and the request is for an HTML page
    if (flags.maintenance && (httpPath.endsWith('.html') || fs.existsSync(path.join(serverFilePath, 'endpoints', httpPath + '.endpoint.js')))) {
        res.status(503).send(error(503, "The server is currently under maintenance. Please try again later.", req));
        return;
    }

    // static file match
    if (isDebugCall) { log(`Debug call: ${req.method} ${req.path} (static path = ${path.join(serverFilePath, 'endpoints', httpPath)})`); }
    if (fs.existsSync(path.join(serverFilePath, 'endpoints', httpPath))) {
        res.sendFile(path.join(serverFilePath, 'endpoints', httpPath));
        return;
    }

    // check .endpoint.js match
    if (isDebugCall) { log(`Debug call: ${req.method} ${req.path} (endpoint path = ${path.join(serverFilePath, 'endpoints', httpPath + '.endpoint.js')})`); }
    var endpointPath = path.join(serverFilePath, 'endpoints', httpPath + '.endpoint.js');
    if (fs.existsSync(endpointPath)) {
        await require(endpointPath)(req, res);
        return;
    }

    // check .redir
    if (isDebugCall) { log(`Debug call: ${req.method} ${req.path} (redir path = ${path.join(serverFilePath, 'endpoints', httpPath + '.redir')})`); }
    var redirPath = path.join(serverFilePath, 'endpoints', httpPath + '.redir');
    if (fs.existsSync(redirPath)) {
        var redirUrl = fs.readFileSync(redirPath, 'utf8').trim();
        res.redirect(redirUrl);
        return;
    }

    if (isDebugCall) { log(`Debug call: ${req.method} ${req.path} (no match)`); }

    // if no match, continue to next middleware
    next();
    return;
});

// 404
app.use((req, res, next) => {
    var msg = "The page you are looking for does not exist.";
    if (req.url == '/thankyou') {
        msg = "...no problem?"; // easter egg
    }
    res.status(404).send(error(404, msg, req));
});

app.listen(PORT, () => {
    clear();
    log(`Webserver is running on port ${PORT}`);
    if (PORT == 4000) {
        execSync('start http://localhost:4000');
    }
});