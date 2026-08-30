const execSync = require('child_process').execSync;
const path = require('path');
const fs = require('fs');
const REPO_URL = 'git@github.com/deltamodders/misctools.git';

function copyDir(source, destination) {
	fs.mkdirSync(destination, { recursive: true });

	for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
		const sourcePath = path.join(source, entry.name);
		const destinationPath = path.join(destination, entry.name);

		if (entry.isDirectory()) {
			copyDir(sourcePath, destinationPath);
		} else {
			fs.copyFileSync(sourcePath, destinationPath);
		}
	}
}

if (fs.existsSync(path.join(__dirname, '..', 'misctools'))) {
    console.log('Removing existing MiscTools build...');
    fs.rmSync(path.join(__dirname, '..', 'misctools'), { recursive: true, force: true });
}

console.log('Cloning MiscTools repository... (you may need to authenticate with your GitHub)');

execSync('git clone ' + REPO_URL, { stdio: 'ignore', cwd: path.join(__dirname) });

console.log('Building MiscTools...');

execSync('npm install', { stdio: 'ignore', cwd: path.join(__dirname, 'misctools') });
execSync('npm run build', { stdio: 'ignore', cwd: path.join(__dirname, 'misctools') });

console.log('Copying built MiscTools to the project...');

copyDir(path.join(__dirname, 'misctools', 'dist'), path.join(__dirname, '..', 'misctools'));

console.log('Cleaning up...');

execSync('rm -rf ' + path.join(__dirname, 'misctools'), { stdio: 'ignore' });