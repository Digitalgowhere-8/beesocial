const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
