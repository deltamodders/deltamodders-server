require('module-alias/register');

const fs = require('fs');
const { error, log } = require('@root/Server');

function run(req, res) {
    const latestData = JSON.parse(fs.readFileSync('endpoints_assets/deltamodLatest.json', 'utf8'));
    res.json(latestData);
}

module.exports = run;