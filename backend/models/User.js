const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    // Optional — edited from Settings (updateMyProfile). Without this
    // declared on the schema, Mongoose silently drops any value set on it:
    // the save "succeeds" and the response even echoes it back, but nothing
    // is actually written to the database, so it's gone on the next reload.
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    // --- Forgot-password reset code (hashed, short-lived) ---
    resetPasswordCodeHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    resetPasswordAttempts: { type: Number, select: false, default: 0 },
    // Set when an admin issues a temporary password; the user is made to pick
    // their own on next login (cleared by change-password / reset-password).
    mustChangePassword: { type: Boolean, default: false },
    // Bumped only when a password is reset for someone else's benefit (admin
    // reset, forgot-password flow) so any session issued BEFORE that moment
    // stops working. Deliberately NOT bumped by a normal self-service change,
    // or you'd be logged out of the device you just used to change it.
    passwordChangedAt: { type: Date },
    role: {
      type: String,
      enum: ['student', 'faculty', 'admin'],
      required: [true, 'Role is required'],
    },

    // Profile photo — set only by an admin (scoped to their own department
    // for a department admin), via PUT /api/users/:id/photo. Stored as a
    // relative path under /uploads, served statically by server.js; the
    // frontend prefixes it with the API origin to build a full URL.
    photoUrl: {
      type: String,
      default: null,
    },

    // Student-only fields
    // `unique` + `sparse` together: USN must be unique among whichever
    // documents actually HAVE one set, but faculty/admin accounts (which
    // never have a usn at all) don't collide with each other over "missing".
    // `sparse` alone (the old state of this field) does nothing by itself —
    // it only means something paired with `unique`, which had never
    // actually been added, so nothing was stopping two different students
    // from registering with the exact same USN.
    usn: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },
    semester: {
      type: Number,
    },
    section: {
      type: String,
      trim: true,
    },

    // Faculty/admin-only field — the staff equivalent of a student's USN.
    // Set by an admin via PUT /api/users/:id/staff-id, same sparse+unique
    // pairing as usn so it's only enforced unique among accounts that
    // actually have one set.
    staffId: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },

    // Faculty-only fields
    department: {
      type: String,
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
    },
    cabinLocation: {
      type: String,
      trim: true,
    },
    isAvailable: {
      // used later by the Faculty Locator module to show live in-cabin status
      type: Boolean,
      default: true,
    },

    // This device's Expo push token (one per account — the most recent
    // login/registration wins, so a user signed into two devices only gets
    // pushes on whichever one registered last). select: false keeps it out
    // of ordinary queries; notify.js asks for it explicitly.
    pushToken: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Never leak the password hash even if `select` gets overridden somewhere
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordChangedAt;
  delete obj.pushToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);