const mongoose = require('mongoose');
module.exports = mongoose.model('ReportNotification', new mongoose.Schema({
  user: { type: String, index: true },
  type: String, title: String, message: String, link: String,
  read: { type: Boolean, default: false }
}, { timestamps: true }));
