const express = require("express");

const { checkSubscription, subscribe } = require("../controllers/stripe");
const { check_auth } = require("../middleware/auth");


const router = express.Router();

router.get("/check", check_auth("user"), checkSubscription);
router.post("/subscribe", check_auth("user"), subscribe);


module.exports = router;
