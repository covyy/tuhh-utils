const mongoose = require('mongoose');
require('./db');

const icalSchema = new mongoose.Schema({
	userId: String,
	icalUrl: String,
	createdAt: Date,
	token: String,
	fetchHistory: [{ // not used yet
		at: Date,
		data: {},
	}],
});

const Ical = mongoose.model('Ical', icalSchema);

module.exports = Ical;