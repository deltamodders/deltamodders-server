require('module-alias/register');

const path = require('path');
const { execSync } = require('child_process');
const { error, log } = require('@root/Server');

function run(req, res) {
    log("Updating server (triggered by webhook)");

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
}

module.exports = run;