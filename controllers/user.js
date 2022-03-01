exports.myProfile = async (req, res) => {
  try {
    const user = req.user;
    res.status(200).send(user);
  } catch (err) {
    console.log(err)
    res.status(500).json({ message: err.message });
  }
};
