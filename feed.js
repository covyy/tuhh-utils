require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios');
const Message = require("./database/message-model");
const https = require('https');
const qs = require('qs');
const querystring = require('querystring');

const url_messages = 'https://e-learning.tuhh.de/studip/dispatch.php/messages/overview/';
const url_webhook = process.env.DISCORD_WEBHOOK;

// retrieve a cookie, security_token and login_ticket
// used for post request
function getSecurity(cb) {
	console.log("Getting Security", new Date);
	axios.get(url_messages).then((res) => {
		const html = res.data;
		const isLoginPage = !res.data.includes('You are signed in as ');
		console.log("Login-Page:", isLoginPage, html.length);

		if (isLoginPage) {
			const $ = cheerio.load(html);

			const securityToken = $('input[name="security_token"]').val();
			const loginTicket = $('input[name="login_ticket"]').val();

			let cookie = res.headers['set-cookie']
			if (Array.isArray(cookie)) {
				cookie = cookie[0];
			}

			cb(securityToken, loginTicket, cookie);

			console.log(cookie)
		}
	});
}

function newGet(securityToken, loginTicket, cookie) {
	let data = querystring.stringify({
		'loginname': 'coa5563',
		'password': 'vobpiv-vapzug-ceTma1',
		'security_token': securityToken, // Replace with your actual securityToken
		'login_ticket': loginTicket // Replace with your actual loginTicket
	});

	let options = {
		hostname: 'e-learning.tuhh.de',
		port: 443,
		path: '/studip/dispatch.php/messages/overview',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Connection': 'keep-alive',
			'Content-Length': Buffer.byteLength(data),
			'Cookie': cookie.split(';')[0] // Replace with your actual cookie
		}
	};

	const req = https.request(options, (res) => {
		console.log(`STATUS: ${res.statusCode}`);
		console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
		console.log(`COOKIE: ${res.headers['set-cookie'][0].split(';')[0]}`);
		res.setEncoding('utf8');

		let responseData = '';
		res.on('data', (chunk) => {
			responseData += chunk;
		});

		res.on('end', () => {
			console.log('Response Body:', responseData);
			const sessionCookie = res.headers['set-cookie'][0].split(';')[0];
			fetchMessages(securityToken, loginTicket, sessionCookie);
		});
	});

	req.on('error', (e) => {
		console.error(`problem with request: ${e.message}`);
	});

	req.write(data);
	req.end();
}

(function run() {
	getSecurity((securityToken, loginTicket, cookie) => {
		newGet(securityToken, loginTicket, cookie);
	});

	setTimeout(() => {
		run();
	}, 1000 * 60 * 20); // 20 min
})();

function fetchMessages(securityToken, loginTicket, cookie) {
	axios.post(url_messages, qs.stringify({
		loginname: process.env.STUDIP_LOGIN,
		password: process.env.STUDIP_PASSWORD,
		security_token: securityToken,
		login_ticket: loginTicket

	}), {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Connection': 'keep-alive',
			'Cookie': cookie
		}
	})
		.then(response => {
			const isLoginPage2 = response.data.includes('You are signed in as ');
			// const cookiesNeeded = response.data.includes('Die Anmeldung für Stud.IP ist nur möglich, wenn Sie das Setzen von Cookies erlauben!');
			console.log("Is Logged In:", isLoginPage2);
			const $ = cheerio.load(response.data);

			const tbody = $('#layout_content form table tbody');

			tbody.find('tr').each(async (index, message) => {
				const id = message.attribs.id;
				if (id === 'reloader') return; // a single message at the end of the table

				const exists = !!await Message.findOne({ messageId: id });

				if (exists) {
					console.log(`Message ${index + 1} already exists in the database.`);
				} else {
					console.log(`Message ${index + 1} is new.`);
					const trHtml = $.html(message);
					const messageInfo = parseTrElement(trHtml);
					messageInfo.messageId = id;

					console.log(`Message ${index + 1}: ${JSON.stringify(messageInfo, null, 2)}`);
					await getMessageInfo(messageInfo.messageUrl, cookie, messageInfo);
				}
			});
		})
		.catch(error => {
			console.error(`Error: ${error.message}`);
		});
}

async function getMessageInfo(url, cookie, messageInfo) {
	console.log("Fetching");
	axios.get(url, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': cookie
		}
	}).then(async (res) => {
		try {
			const $ = cheerio.load(res.data);
			const metaData = $('#message_metadata');

			let userProfilePicUrl = '';
			let nobodyProfilePicUrl = '';
			$('img').each(function() {
				let src = $(this).attr('src');
				if (src.includes('_medium')) {
					if (src.includes('nobody_medium')) {
						nobodyProfilePicUrl = src;
					} else {
						userProfilePicUrl = src;
					}
				}
			});

			const metaString = metaData.text().replace(/\s+/g, ' ').trim();
			const personCount = parseInt(metaString.split(' To ')[1].split(' ')[0]);
			const contentData = $('.message_body .formatted-content').text().trim();

			messageInfo.personCount = personCount;
			messageInfo.content = contentData;
			messageInfo.pfp = userProfilePicUrl || nobodyProfilePicUrl;

			const doc = new Message(messageInfo);
			await doc.save();
			console.log('Message saved to database.', personCount);

			if (personCount > 3) sendWeb(messageInfo);
			// otherwise might be group/personal email
		} catch (err) {
			console.log(err);
		}
	});
}

function timeAgo(timestamp) {
	const now = Date.now();
	const secondsAgo = Math.floor((now - timestamp) / 1000);
	const minutesAgo = Math.floor(secondsAgo / 60);
	const hoursAgo = Math.floor(minutesAgo / 60);
	const daysAgo = Math.floor(hoursAgo / 24);

	if (daysAgo > 0) {
		return `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
	} else if (hoursAgo > 0) {
		return `${hoursAgo} hour${hoursAgo !== 1 ? 's' : ''} ago`;
	} else if (minutesAgo > 0) {
		return `${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago`;
	} else {
		return 'just now';
	}
}

const parseTrElement = (html) => {
	const $ = cheerio.load(html);

	let messageName = $('body a').text().trim().split('\n')[0].trim() || '-';
	if (messageName.includes('[') && messageName.includes(': ') && messageName.includes(']')) {
		messageName = messageName.slice(1);
		messageName = messageName.split(': ')[1];
		messageName = messageName.replace(']', '');
	}

	const messageUrl = $('body a').attr('href') || '-';
	const professorName = $('body p').text().trim() || '-';

	const dateRegex = /\b(\d{2}\/\d{2}\/\d{2} \d{2}:\d{2})\b/;
	const match = $('body').text().trim().match(dateRegex);
	let d = '0';

	if (match) {
		const dateString = match[1];
		const [date, time] = dateString.split(' ');
		const [day, month, year] = date.split('/');
		const [hour, minute] = time.split(':');
		d = new Date(`20${year}`, month - 1, day, hour, minute).getTime();
	} else {
		console.error('Date not found in the string.');
	}

	return {
		messageName,
		messageUrl,
		professorName,
		date: d,
	};
};

function sendWeb(data) {
	const embed = {
		title: data.messageName,
		description: data.content,
		color: 0x00c1d4,
		fields: [{
			name: 'To ' + data.personCount + ' students ('+timeAgo(data.date)+')',
			value: '_ _',
		}],
		author: {
			name: data.professorName,
		},
		thumbnail: {
			url: data.pfp,
		},
		url: data.messageUrl,
	};

	const postData = JSON.stringify({
		embeds: [embed],
		content: '<@&1176804180309069825> (right-click channel to mute)', // @mails-datascience
	});

	const options = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
	};

	const req = https.request(url_webhook, options, (res) => {
		let data = '';

		res.on('data', (chunk) => {
			data += chunk;
		});

		res.on('end', () => {
			console.log('Embed sent successfully');
			if (data !== '') {
				console.error('Error sending mail embed:', data);
			}
		});
	});

	req.on('error', (error) => {
		console.error('Error sending embed:', error.message);
	});

	req.write(postData);
	req.end();
}

// catch errors
process.on('unhandledRejection', (err) => {
	console.error(err);
});

process.on('uncaughtException', (err) => {
	console.error(err);
});