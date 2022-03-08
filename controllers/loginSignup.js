const bcrypt = require("bcrypt");
const User = require("../models/Users");
const mongoose = require("mongoose"); // in this file mongoose required only for this method-> mongoose.Types.ObjectId.isValid
const config = require("../config");
const { doLogin, codeSaveDBandSend } = require("../utils/func");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const moment = require("moment");
const { payment } = require("../utils/parser");

exports.signup_ApiController = async (req, res, next) => {
  let {
    email: regEmail,
    fullName,
    password: newPass,
    payment_method,
    payment_period,
  } = req.body;

  try {
    //////////////////////////////////////// INPUT VALIDATION START ////////////////////////////////////////

    regEmail = !!regEmail ? String(regEmail).toLowerCase().trim() : false;
    newPass = !!newPass ? String(newPass) : false;

    const fnF = fullName?.length > 0;
    const emlF = regEmail?.length > 0;
    const newPassF = newPass?.length > 0;

    let emlLng, validEmail, emailExist, emailOk;

    if (regEmail) {
      emlLng = regEmail.length < 40;
      const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      const allowChars = /^[0-9a-zA-Z_@.]+$/;
      const valid = re.test(regEmail) && allowChars.test(regEmail);
      validEmail = valid ? true : false;
      emailExist = await User.findOne({ email: regEmail });
      emailOk = emlF && emlLng && validEmail && !emailExist ? true : false;
    }

    if (newPass) {
      const strongPasswordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,32}$/;
      var passwordStrong = newPass.match(strongPasswordRegex);
    }

    const passwordOk = newPassF && passwordStrong ? true : false;

    //////////////////////////////////////// INPUT VALIDATION END ////////////////////////////////////////

    if (emailOk && passwordOk && fnF && payment_method) {
      const customer = await stripe.customers.create({
        payment_method: payment_method,
        email: regEmail,
        invoice_settings: {
          default_payment_method: payment_method,
        },
      });
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [
          {
            price: payment[payment_period],
          },
        ]
      });
      const encryptedPassword = await bcrypt.hash(newPass, config.saltOrRounds);
      const currentEpochTime = Date.now();
      const userInsertStructure = new User({
        fullName,
        stripeId: customer.id,
        stripSubscriptionId: subscription.id,
        email: regEmail,
        roles: ["user"],
        password: encryptedPassword,
        avatar: "/user-avatar/avatar.png",
        lastOnline: currentEpochTime,
      });
      const saveUserData = await userInsertStructure.save();

      if (saveUserData) {
        const nxt = next;
        const directLogin = true;
        const keepLogged = true;
        const login = await doLogin(nxt, saveUserData, keepLogged, directLogin);

        return res.json({
          message: "Account created successfully",
          user: saveUserData,
          token: login.token,
        });
      } else {
        throw new Error("Failed to save user data to Database");
      }
    } else {
      var error = {};
      if (!emailOk) {
        if (!emlF) {
          error.email = "Please enter your email address!";
        } else if (!emlLng) {
          error.email = "Your email address length is too long";
        } else if (!validEmail) {
          error.email = "Please enter valid email address!";
        } else if (emailExist) {
          error.email = "This email has been used previously.";
        }
      }

      if (!fnF) {
        error.fullName = "First name is required!";
      }

      if (!payment_method) {
        error.payment_method = "Please provide your bank account!";
      }

      if (!passwordOk) {
        if (!newPassF) {
          error.password = "Please enter a new password!";
        } else if (!passwordStrong) {
          error.password =
            "Password must be 8-32 characters long and contain at least 1 uppercase letter and 1 number.";
        }
      }
    }

    return res.status(400).json({ error });
  } catch (err) {
    next(err);
  }
};

exports.verifyCode = async (req, res, next) => {
  let { verifyCode, email } = req.body;
  const verificationFor = "email";

  try {
    verifyCode = !!verifyCode ? String(verifyCode).trim() : false;

    const error = {};
    const userData = await User.findOne({ email });

    if (userData) {
      if (verificationFor === "email") {
        if (userData.forgetCode.wrongTry <= 5) {
          const expireTime = userData.forgetCode.codeExpireTime;
          const currentEpochTime = Date.now();

          if (expireTime > currentEpochTime) {
            if (!userData.forgetCode.used) {
              if (userData.forgetCode.code == verifyCode) {
                await User.updateOne(
                  { _id: userData._id },
                  { isEmailVerified: true, "forgetCode.used": true }
                );

                return res.json({ message: "Email verified successfully" });
              } else {
                await User.updateOne(
                  { _id: userData._id },
                  {
                    "forgetCode.wrongTry": userData.forgetCode.wrongTry + 1,
                  }
                );
                error.issue = `Incorrect verification code, please try again or contact ${config.adminEmailAddress}`;
              }
            } else {
              error.issue = "The code recovery code is already used!";
            }
          } else {
            error.issue = "The code is expired.";
          }
        } else {
          error.issue = "Tried many times with wrong code.!";
        }
      } else if (verificationFor === "phone") {
        if (!userData.isPhoneVerified) {
          if (userData.phoneVerifyCode.wrongTry <= 5) {
            const expireTime = userData.phoneVerifyCode.codeExpireTime;
            const currentEpochTime = Date.now();

            if (expireTime > currentEpochTime) {
              if (!userData.phoneVerifyCode.used) {
                if (userData.phoneVerifyCode.code == verifyCode) {
                  await User.updateOne(
                    { _id: userData._id },
                    { isPhoneVerified: true, "phoneVerifyCode.used": true }
                  );

                  const directLogin = true;
                  const keepLogged = true;

                  const nxt = next;
                  const login = await doLogin(
                    nxt,
                    userData,
                    keepLogged,
                    directLogin
                  );
                  userData.roles = undefined;
                  userData.password = undefined;
                  userData.forgetCode = undefined;
                  userData.phoneVerifyCode = undefined;
                  userData.forgetCode = undefined;

                  userData.isPhoneVerified = true;

                  return res.json({
                    message: "Phone verified successfully",
                    token: login.sessionToken,
                    user: userData,
                  });
                } else {
                  await User.updateOne(
                    { _id: userData._id },
                    {
                      "phoneVerifyCode.wrongTry":
                        userData.phoneVerifyCode.wrongTry + 1,
                    }
                  );
                  error.issue = `Incorrect verification code, please try again or contact ${config.adminEmailAddress}`;
                }
              } else {
                error.issue = "The code recovery code is already used!";
              }
            } else {
              error.issue = "The code is expired.";
            }
          } else {
            error.issue = "Tried many times with wrong code.!";
          }
        } else {
          error.issue = "Your Phone address is already verified!";
        }
      } else {
        error.issue = "Something is messing!";
      }
    } else {
      error.issue = "Invalid request!";
    }

    return res.status(400).json({ error });
  } catch (err) {
    next(err);
  }
};

exports.sendVerifyCode = async (req, res, next) => {
  // let { signUpUserId, resendCodeFor } = req.body;
  console.log(req.body);
  let { email } = req.body;
  let resendCodeFor = "email";

  try {
    // const isValidObjId = mongoose.Types.ObjectId.isValid(signUpUserId);

    const error = {};
    const userData = await User.findOne({ email });

    if (userData) {
      if (resendCodeFor === "email") {
        const subject = "Forget Password";
        const plainTextMsg = "Enter the verification code:";
        const codeName = "forget_code";
        const sendResponse =
          (await codeSaveDBandSend(
            userData,
            subject,
            plainTextMsg,
            codeName
          )) || {};

        if (sendResponse.accepted) {
          return res.json({ message: "Email verification code sended" });
        } else {
          error.issue = "Failed to send email verification code!";
        }
      } else if (resendCodeFor === "phone") {
        if (!userData.isPhoneVerified) {
          const subject = "";
          const plainTextMsg = "Enter the Phone code:";
          const codeName = "Phone_verification_code";
          const sendResponse =
            (await codeSaveDBandSend(
              userData,
              subject,
              plainTextMsg,
              codeName,
              "phone"
            )) || {};

          if (sendResponse.accepted) {
            return res.json({ message: "Phone verification code re-sended" });
          } else {
            error.issue = "Failed to  re-send Phone verification code!";
          }
        } else {
          error.issue = "Your Phone address is already verified!";
        }
      } else {
        error.issue = "Something is messing!";
      }
    } else {
      error.issue = "Invalid request!";
    }

    return res.status(400).json({ error });
  } catch (err) {
    next(err);
  }
};

exports.login_ApiController = async (req, res, next) => {
  let { email, password, keepLogged } = req.body;

  try {
    email = !!email ? String(email).toLowerCase().trim() : false;
    password = !!password ? String(password) : false;

    // Check filled or not
    const emlFilled = email.length > 0;
    const passFilled = password.length > 0;

    //////////////////////////////////////// INPUT VALIDATION START ////////////////////////////////////////

    if (emlFilled) {
      /* Email validation */
      const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      const allowChars = /^[0-9a-zA-Z_@.]+$/;
      var emailOk = re.test(email) && allowChars.test(email);

      // user exist or not
      var userExist = emailOk ? await User.findOne({ email }) : "";
    }

    //////////////////////////////////////// INPUT VALIDATION END ////////////////////////////////////////

    const error = {};
    if (userExist && passFilled) {
      const matched = await bcrypt.compare(password, userExist.password);

      if (matched) {
        const nxt = next;
        const directLogin = true;
        const login = await doLogin(nxt, userExist, keepLogged, directLogin);

        if (login.accepted) {
          res.cookie("session", login.token);
          // return res.json({ user: userExist, token: login.token, sessionId: login.sessionId });
          return res.json({ user: userExist, token: login.token });
        } else {
          throw new Error("Code sent failed");
        }
      } else {
        error.password = "Password wrong!";
      }
    } else {
      if (!emlFilled) {
        error.email = "Please enter your email address!";
      } else {
        if (!emailOk) {
          error.email = "Invalid input!";
        } else if (!userExist) {
          if (emailOk) {
            error.email = "There is no account under the email";
          }
        }
      }

      if (!passFilled) {
        error.password = "Please enter your password!";
      }
    }
    return res.status(400).json({ error });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  let { verifyCode, email, newPassword } = req.body;

  try {
    // validate
    verifyCode = !!verifyCode ? String(verifyCode).trim() : false;

    const error = {};
    // validate
    if (newPassword) {
      const strongPasswordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,32}$/;
      var passwordStrong = newPassword.match(strongPasswordRegex);
      if (passwordStrong) {
        const userData = await User.findOne({ email });
        if (userData) {
          if (userData.forgetCode.wrongTry <= 5) {
            const expireTime = userData.forgetCode.codeExpireTime;
            const currentEpochTime = Date.now();

            if (expireTime > currentEpochTime) {
              if (!userData.forgetCode.used) {
                if (userData.forgetCode.code == verifyCode) {
                  const hashedPassword = await bcrypt.hash(
                    newPassword,
                    config.saltOrRounds
                  );
                  await User.updateOne(
                    { _id: userData._id },
                    {
                      isEmailVerified: true,
                      password: hashedPassword,
                      "forgetCode.used": true,
                    }
                  );
                  return res.json({ message: "Password has been changed!" });
                } else {
                  await User.updateOne(
                    { _id: userData._id },
                    {
                      "forgetCode.wrongTry": userData.forgetCode.wrongTry + 1,
                    }
                  );
                  error.issue = `Incorrect verification code, please try again or contact ${config.adminEmailAddress}`;
                }
              } else {
                error.issue = "The code recovery code is already used!";
              }
            } else {
              error.issue = "The code is expired.";
            }
          } else {
            error.issue = "Tried many times with wrong code.!";
          }
        } else {
          error.issue = "Invalid request!";
        }
      } else {
        error.password =
          "Password must be 8-32 characters long and contain at least 1 uppercase letter and 1 number.";
      }
    } else {
      error.password = "Please enter your password!";
    }

    return res.status(400).json({ error });
  } catch (err) {
    next(err);
  }
};
