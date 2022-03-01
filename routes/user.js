const express = require("express");

const { myProfile } = require("../controllers/user");
const { check_auth } = require("../middleware/auth");


const router = express.Router();

router.get("/me", check_auth("user"), myProfile);


module.exports = router;
