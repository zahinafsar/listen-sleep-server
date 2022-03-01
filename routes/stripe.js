const express = require("express");

const { checkSubscription, subscribe, cancelSubscribe } = require("../controllers/stripe");
const { check_auth } = require("../middleware/auth");


const router = express.Router();

router.get("/check", check_auth("user"), checkSubscription);
router.post("/subscribe", check_auth("user"), subscribe);
router.post("/cancel", check_auth("user"), cancelSubscribe);


module.exports = router;
