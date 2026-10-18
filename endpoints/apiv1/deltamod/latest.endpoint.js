const fs = require('fs');

function run(req, res, error, log) {
    const latestData = JSON.parse(fs.readFileSync('endpoints_assets/deltamodLatest.json', 'utf8'));
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
}

module.exports = run;