const mongoose = require('mongoose');
require('./db');

const messageSchema = new mongoose.Schema({
	messageName: String,
	messageUrl: String,
	professorName: String,
	date: Date,
	messageId: String,
	content: String,
	personCount: Number,
	pfp: String,
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;