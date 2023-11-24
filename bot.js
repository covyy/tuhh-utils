require('dotenv').config();
const OpenAI = require('openai');
const { Client, GatewayIntentBits } = require('discord.js');
const { REST, Routes } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const Ical = require("./database/ical-model");
const cr = require('crypto');

const icalRegex = /^https:\/\/tune\.tuhh\.de(:443)?\/qisserver\/pages\/cm\/exa\/timetable\/individualTimetableCalendarExport\.faces\?user=[a-z0-9-]{1,}&hash=[a-z0-9]{1,}&termgroup=$/;
const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/ig;

function addAngleBrackets(string) {
	return string.replace(urlRegex, (url) => {
		// Check if the URL is already enclosed in angle brackets
		if (url.startsWith('<') && url.endsWith('>')) {
			return url; // URL already enclosed, no change
		}
		return `<${url}>`; // Enclose URL in angle brackets
	});
}

const commands = [
	new SlashCommandBuilder()
		.setName('ical')
		.setDescription('Enter your TUHH calendar link, and I will repair it for you')
		.addStringOption(option =>
			option.setName('link')
				.setDescription('Your Tune calendar link')
				.setRequired(true)),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
	try {
		console.log('Started refreshing application (/) commands.');

		await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });

		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
})();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	]
});

const openai = new OpenAI({
	apiKey: process.env.OPENAI_KEY,
});

const prompt = { role: 'user', content: `In the following conversation, you answer questions for the students of TUHH. If a student asks you to compute something, redirect them to useful sources, instead of trying to solve it yourself. For example, tell them to visit some of the following useful sites:
Wolfram Alpha: https://www.wolframalpha.com/
Calculate the limit of a function approaching a value: https://www.wolframalpha.com/calculators/limit-calculator
Calculate the derivative of a function: https://www.wolframalpha.com/calculators/derivative-calculator
Calculate the integral of a function: https://www.wolframalpha.com/calculators/integral-calculator
Calculate the Taylor series of a function: https://www.wolframalpha.com/calculators/series-calculator
Calculate the Laplace transform of a function: https://www.wolframalpha.com/calculators/laplace-transform-calculator
and so on...

Do not try to solve them yourself, as you are only a language model with limited capabilities regarding logic.
` };
let messageHistory = [];
async function complete(query) {
	// for some reason, the open ai API doesn't always answer fast
	console.log("completing...");
	messageHistory.push({ role: 'user', content: query });
	if (messageHistory.length > 6) {
		messageHistory = messageHistory.slice(-6);
	}

	try {
		const chatCompletion = await openai.chat.completions.create({
			messages: [prompt, ...messageHistory],
			model: 'gpt-3.5-turbo',
		});

		const modelResponse = chatCompletion.choices[0].message.content;
		messageHistory.push({ role: 'assistant', content: modelResponse });

		console.log('>', messageHistory);
		return addAngleBrackets(modelResponse);
	} catch(e) {
		console.log(e);
		const errResponse = "Something went wrong :(";
		messageHistory.push({ role: 'assistant', content: errResponse });
		console.log('>', messageHistory);
		return "Something went wrong :(";
	}

	// Is this unreachable?
	// Again, ensure the history doesn't exceed 6 messages
	if (messageHistory.length > 6) {
		messageHistory = messageHistory.slice(-6);
	}
}

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

let lastId = "";
client.on('messageCreate', msg => {
	if (msg.channelId !== '1176113963042349168') return; // #tu-gpt
	lastId = msg.id;
	if (msg.author.bot) return;
	if (msg.content.startsWith('!')) return;

	msg.channel.sendTyping(); // buggy

	console.log(msg.content)
	complete(msg.content).then((res) => {
		if (msg.id !== lastId) {
			// use message reference
			msg.reply(res);
		} else msg.channel.send(res);
	}).catch((err) => {
		console.log(err);
		msg.channel.send("Something went wrong :(");
	});
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;

	if (interaction.commandName === 'ical') {
		const link = interaction.options.getString('link');
		if (icalRegex.test(link)) {
			Ical.findOneAndDelete({ userId: interaction.user.id }).finally((doc) => {
				console.log(doc, !!doc)
				const token = cr.randomBytes(16).toString('hex');
				Ical.create({
					userId: interaction.user.id,
					icalUrl: link,
					createdAt: new Date(),
					fetchHistory: [],
					token: token,
				}).then((doc) => {
					interaction.reply({ content: "**Your calendar link has been saved. In your calendar app, subscribe to** <https://covy.dev/ical/" + doc._id + "/"+token+">\nAnyone with this link can access your calendar, you can invalidate it from within Tune.", ephemeral: true });
				}).catch((err) => {
					console.log(err);
					interaction.reply({ content: "**Something went wrong :(**", ephemeral: true });
				});
			});
		} else {
			interaction.reply({ content: "**Der von dir angegebene Link ist ungültig oder abgelaufen.**\nBeispiel Link von Tune:\n\n<https://tune.tuhh.de:443/qisserver/pages/cm/exa/timetable/individualTimetableCalendarExport.faces?user=xxxxx&hash=xxxxx&termgroup=>", ephemeral: true });
		}
	}
});

client.login(process.env.DISCORD_TOKEN);