require('module-alias/register');

const fs = require('fs');
const { error, log } = require('@root/Server');

function run(req, res) {
    let impressionData = JSON.parse(fs.readFileSync('impressions.json', 'utf8'));
    res.json(impressionData);
}

module.exports = run;