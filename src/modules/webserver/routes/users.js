const express = require('express');
const app = express.Router();
const _ = require('lodash');

const logger = require('../../../lib/logging').getLog('webserver', 'users-route');
const db = require('../../../lib/db');

//app.enable("trust proxy"); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)



//create user
app.post('/', async function (req, res) {
  try {

    var userScheme = req.body;

    if (!userScheme.email || !req.body.password) {
      return res.status(400).send("You must send the username and the password");
    }

    // look for existing user
    const user = await db.models.User.findOne({
      where: {
        email: userScheme.email
      },
      include: []
    });


    if (user) {
      return res.status(400).send("A user with that username already exists");
    }

    // users.push(profile);
    const newUser = await db.models.User.create(userScheme);

    if (userScheme.permissions) {
      // with supplied permissions
      await newUser.createPermission(userScheme.permissions);

    } else {
      // use defaults
      await newUser.createPermission();
    }

    return res.status(200).json(newUser);

  } catch (error) {
    logger.errror(error);
    return res.status(400).send(error).end();
  }


});

//get user
app.get('/:id', async function (req, res) {

  let userId = req.params.id;

  if (!userId || userId === 'null') {
    // try to get from token
    userId = req.user.data.id;
  }

  // get this user
  const user = await db.models.User.findOne({
    where: {
      id: userId
    },
    include: [db.models.Permissions]
  });


  return res.json(user)

  // res.status(201).send({
  //   id_token: createToken(profile)
  // });
});

//get users
app.get('/', async function (req, res) {

  // get this user
  const users = await db.models.User.findAll({
    include: [db.models.Permissions]
  });


  return res.json(users)

  // res.status(201).send({
  //   id_token: createToken(profile)
  // });
});

//update user
app.put('/:id', async function (req, res) {
  try {


    let userId = req.params.id;



    // get this user
    let user = await db.models.User.findOne({
      where: {
        id: userId
      },
      include: []
    });

    // update user settings here

    user = Object.assign(user, req.body);
    await user.save();

    if (req.body && req.body.permission) {
      let permission = await user.getPermission();
      user = Object.assign(permission, req.body.permissions);
      await permission.save();
    }

    res.status(200).end();
  } catch (error) {
    logger.error(error);
    return res.status(400).send(error.message).end()
  }
});

//delete user
app.delete('/:id', async function (req, res) {

  const userId = req.params.id;
  // get this user
  let user = await db.models.User.findOne({
    where: {
      id: userId
    },
    include: []
  });

  const permission = await user.getPermission();
  if (permission) {
    await permission.destroy();
  }

  // delete user
  await user.destroy();

  res.status(200).end();
});



module.exports = app