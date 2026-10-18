require('module-alias/register');

const fs = require('fs');
const { error, log } = require('@root/Server');

function run(req, res) {
    var project = req.query.p;
    var domain = req.query.d;
    var points = req.query.e;

    if (!Number.isInteger(parseInt(points)) || parseInt(points) < 0 || parseInt(points) > 3) {
        res.status(400);
        res.send();
    }

    if (!fs.existsSync('impressions.json')) {
        fs.writeFileSync('impressions.json', '{}');
    }

    let impressionData = JSON.parse(fs.readFileSync('impressions.json', 'utf8'));
    impressionData[project + '-' + domain] = (impressionData[project] || 0) + parseInt(points);
    fs.writeFileSync('impressions.json', JSON.stringify(impressionData));

    res.status(200);
    res.send();
}

module.exports = run;