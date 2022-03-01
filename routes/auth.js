const express = require("express");

const { signup_ApiController, sendVerifyCode, verifyCode, login_ApiController, changePassword } = require("../controllers/loginSignup");

const router = express.Router();

router.post("/signup", signup_ApiController);
router.post("/code-send", sendVerifyCode);
router.post("/change-password", changePassword);
router.post("/code-verify", verifyCode);
router.post("/login", login_ApiController);


module.exports = router;
