const bcrypt = require("bcrypt");
const User = require("../models/Users");
const mongoose = require("mongoose"); // in this file mongoose required only for this method-> mongoose.Types.ObjectId.isValid
const config = require("../config");
const { doLogin, codeSaveDBandSend } = require("../utils/func");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const moment = require("moment");

exports.signup_ApiController = async (req, res, next) => {
  let {
    email: regEmail,
    fullName,
    password: newPass,
    payment_method,
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
            price: "price_1KXunJLr6WNewAuktFvsgORE",
          },
        ],
        trial_end: moment().add(3, "days").unix(),
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
          token: login.token
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

exports.accountVerify_CodeSubmit_ApiController = async (req, res, next) => {
  let { verifyCode, signUpUserId, verificationFor } = req.body;

  try {
    verifyCode = !!verifyCode ? String(verifyCode).trim() : false;
    const isValidObjId = mongoose.Types.ObjectId.isValid(signUpUserId);

    const error = {};
    if (verifyCode && isValidObjId) {
      const userData = await User.findOne({ _id: signUpUserId });

      if (userData) {
        if (verificationFor === "email") {
          if (!userData.isEmailVerified) {
            if (userData.emailVerifyCode.wrongTry <= 5) {
              const expireTime = userData.emailVerifyCode.codeExpireTime;
              const currentEpochTime = Date.now();

              if (expireTime > currentEpochTime) {
                if (!userData.emailVerifyCode.used) {
                  if (userData.emailVerifyCode.code == verifyCode) {
                    await User.updateOne(
                      { _id: userData._id },
                      { isEmailVerified: true, "emailVerifyCode.used": true }
                    );

                    // const subject = "";
                    // const plainTextMsg = "Enter the phone verification code:";
                    // const codeName = "Phone_verification_code";
                    // const sendResponse = (await codeSaveDBandSend(userData, subject, plainTextMsg, codeName, "phone")) || {};

                    return res.json({ message: "Email verified successfully" });
                  } else {
                    await User.updateOne(
                      { _id: userData._id },
                      {
                        "emailVerifyCode.wrongTry":
                          userData.emailVerifyCode.wrongTry + 1,
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
            error.issue = "Your Email address is already verified!";
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
                    userData.emailVerifyCode = undefined;
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
    } else {
      error.issue = "Request rejected!";
      return res.status(406).json({ error });
    }

    return res.status(400).json({ error });
  } catch (err) {
    next(err);
  }
};

exports.resendAccountVerifyCode_ApiController = async (req, res, next) => {
  let { signUpUserId, resendCodeFor } = req.body;

  try {
    const isValidObjId = mongoose.Types.ObjectId.isValid(signUpUserId);

    const error = {};
    if (resendCodeFor && isValidObjId) {
      const userData = await User.findOne({ _id: signUpUserId });

      if (userData) {
        if (resendCodeFor === "email") {
          if (!userData.isEmailVerified) {
            const subject = "Verify your email address";
            const plainTextMsg = "Enter the phone verification code:";
            const codeName = "Email_verification_code";
            const sendResponse =
              (await codeSaveDBandSend(
                userData,
                subject,
                plainTextMsg,
                codeName
              )) || {};

            if (sendResponse.accepted) {
              return res.json({ message: "Email verification code re-sended" });
            } else {
              error.issue = "Failed to  re-send email verification code!";
            }
          } else {
            error.issue = "Your Email address is already verified!";
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
    } else {
      error.issue = "Request rejected!";
      return res.status(406).json({ error });
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