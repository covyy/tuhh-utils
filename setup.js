console.log("Running Setup...");
const fs = require('fs');
const path = require('path');

// Specify the path to the .env file
const envPath = path.join(__dirname, '.env');

// Function to create the .env file with default content
function createEnvFile() {
	const content = `
STUDIP_LOGIN=""
STUDIP_PASSWORD=""
MONGO_URL=""
OPENAI_KEY=""
DISCORD_TOKEN=""
DISCORD_CLIENT_ID=""
DISCORD_WEBHOOK=""
`;
	fs.writeFileSync(envPath, content.trim());
	console.log('.env file created successfully.');
}

function printError(message) {
	// ANSI escape code for red color
	const red = '\x1b[31m';
	// ANSI escape code to reset the color
	const reset = '\x1b[0m';
	console.error(red, message, reset);
}

// Function to check if any environment variable is an empty string
function checkEnvVariables() {
	const content = fs.readFileSync(envPath, 'utf8');
	const lines = content.split(/\r?\n/);

	for (let line of lines) {
		if (line.trim() === '') {
			continue;
		}
		const [key, value] = line.split('=');
		if (value === '""' || value === "") {
			printError(`Error: Environment variable ${key} is empty.`);
			return;
		}
	}

	console.log(`
	All environment variables are set correctly.
	You may now run one of the following:
	 $ npm run server
	 $ npm run feed
	 $ npm run bot
	`);
}

// Check if the .env file exists
fs.access(envPath, fs.constants.F_OK, (err) => {
	if (err) {
		// File does not exist, so create it
		createEnvFile();
	} else {
		// File exists, check the variables
		checkEnvVariables();
	}
});

// Author: ChatGPT