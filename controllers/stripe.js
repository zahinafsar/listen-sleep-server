const User = require("../models/Users");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.checkSubscription = async (req, res) => {
  try {
    const user = req.user;
    const subscription = await stripe.subscriptions.retrieve(
      user.stripSubscriptionId
    );
    res.status(200).send(subscription);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

exports.subscribe = async (req, res) => {
  try {
    const user = req.user;
    const subscription = await stripe.subscriptions.create({
      customer: user.stripeId,
      items: [
        {
          price: "price_1KXunJLr6WNewAuktFvsgORE",
        },
      ],
    });
    await User.updateOne({_id: user._id}, {
      stripSubscriptionId: subscription.id,
    });
    const updatedUser = await User.findById(user._id);
    res.status(200).send(updatedUser);
  } catch (err) {
    console.log(err.data.error.message);
    res.status(500).json({ message: err.message });
  }
};

exports.cancelSubscribe = async (req, res) => {
  try {
    const user = req.user;
    await stripe.subscriptions.del(user.stripSubscriptionId);
    await User.updateOne({_id: user._id}, {
      stripSubscriptionId: null,
    });
    const updatedUser = await User.findById(user._id);
    res.status(200).send(updatedUser);
  } catch (err) {
    console.log(err.data.error.message);
    res.status(500).json({ message: err.message });
  }
};

