require('dotenv').config();
const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const port = 443;
const Ical = require("./database/ical-model");

app.use('*', (req, res, next) => {
	console.log(`Request: ${req.method} ${req.originalUrl} ${new Date().toLocaleString()}`);
	next();
});

app.get('/', (req, res) => {
	res.send('Hello World!');
});

app.get('/ical/:id/:token', (req, res) => {
	console.log(req.params.id, req.params.token);
	Ical.findOne({ _id: req.params.id, token: req.params.token }).then((doc) => {
		if (doc) {
			https.get(doc.icalUrl, (response) => {
				if (response.statusCode === 200) {
					let data = '';
					response.on('data', (chunk) => {
						data += chunk;
					});
					response.on('end', () => {
						doc.fetchHistory.push({
							date: new Date(),
							data: data,
						});
						doc.save();
						res.setHeader('Content-Type', 'text/calendar'); // Set the content type to .ics
						res.setHeader('Content-Disposition', 'attachment; filename=calendar.ics'); // Force download
						res.send(data);
					});
				} else {
					res.status(500).send('Failed to fetch the .ics file.');
				}
			}).on('error', (error) => {
				res.status(500).send(`Error while fetching the .ics file: ${error.message}`);
			});
		}
	});
});

const options = { // move to config file
	key: fs.readFileSync('/etc/letsencrypt/live/covy.dev/privkey.pem'),
	cert: fs.readFileSync('/etc/letsencrypt/live/covy.dev/fullchain.pem')
};

const icalServer = https.createServer(options, app);

icalServer.listen(port, () => {
	console.log(`Server is running on https://localhost:${port}`);
});

// USE THIS WHEN IN DEV
// app.listen(port, () => {
// 	console.log(`Server is running on http://localhost:${port}`);
// });