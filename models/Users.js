const mongoose = require("mongoose");
const crypto = require("crypto");

var UserSchema = new mongoose.Schema(
	{
		fullName: {
			type: String,
			required: [true, "Name is required"],
		},
		stripeId: String,
		stripSubscriptionId: String,
		email: {
			type: String,
			lowercase: true,
			unique: true,
			required: [true, "Email can't be blank"],
			match: [/\S+@\S+\.\S+/, "Email is invalid"],
			index: true,
		},
		// location: String,
		roles: [{ type: "String" }],
		isEmailVerified: { type: Boolean, default: true },
		// isPhoneVerified: { type: Boolean, default: false },
		password: {
			type: String,
			required: true,
		},
		// favourite: {
		// 	book: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }],
		// 	podcast: [{ type: mongoose.Schema.Types.ObjectId, ref: "Podcast" }],
		// 	video: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
		// },
		// bookMarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book", unique: true }],
		// phone: Number,
		resetPasswordToken: String,
		resetPasswordExpires: Date,
		avatar: String,
		lastOnline: Date,
		emailVerifyCode: {
			code: Number,
			codeExpireTime: Date,
			wrongTry: Number,
			used: Boolean,
		},
		// phoneVerifyCode: {
		// 	code: Number,
		// 	codeExpireTime: Date,
		// 	wrongTry: Number,
		// 	used: Boolean,
		// },
		forgetCode: {
			code: Number,
			codeExpireTime: Date,
			wrongTry: Number,
			used: Boolean,
			worked: Boolean,
			token: String,
		},
	},
	{
		timestamps: true,
	}
);

const user = mongoose.model("User", UserSchema);
module.exports = user;
