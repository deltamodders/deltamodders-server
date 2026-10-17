const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = (parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 3000);
const execSync = require('child_process').execSync;
const flags = require('./package.json').flags || {};
const chalk = require('chalk');

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
function error(errorCode, specialNote) {
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
    if (flags.maintenance) {
        res.status(503).send(error(503, "The server is currently under maintenance. Please try again later."));
        return;
    }

    // check direct file match
    var httpPath = req.path.toLowerCase();
    if (httpPath.endsWith('/')) {
        httpPath += 'index.html';
    }

    if (fs.existsSync(path.join(__dirname, 'endpoints', httpPath))) {
        res.sendFile(path.join(__dirname, 'endpoints', httpPath));
        return;
    }

    // check .endpoint.js match
    var endpointPath = path.join(__dirname, 'endpoints', httpPath + '.endpoint.js');
    if (fs.existsSync(endpointPath)) {
        await require(endpointPath)(req, res, error, log);
        return;
    }

    // check .redir
    var redirPath = path.join(__dirname, 'endpoints', httpPath + '.redir');
    if (fs.existsSync(redirPath)) {
        var redirUrl = fs.readFileSync(redirPath, 'utf8').trim();
        res.redirect(redirUrl);
        return;
    }

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
    res.status(404).send(error(404, msg));
});

app.listen(PORT, () => {
    clear();
    log(`Webserver is running on port ${PORT}`);
    if (PORT == 4000) {
        execSync('start http://localhost:4000');
    }
});