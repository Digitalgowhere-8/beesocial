const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email']
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user', index: true },

    // Profile fields
    company: { type: String, default: '', trim: true, maxlength: 120 },
    designation: { type: String, default: '', trim: true, maxlength: 120 },
    interests: [{ type: String }],         // categories the user wants to follow
    avatar: { type: String, default: '' },  // optional URL

    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Hash password on save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password during login
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Public JSON (strip password etc.)
userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
