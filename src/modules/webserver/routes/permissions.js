const express = require('express');
const app = express.Router();
const _ = require('lodash');

const logger = require('../../../lib/logging').getLog('webserver', 'permissions-route');
const db = require('../../../lib/db');

//app.enable("trust proxy"); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)



//create
app.post('/', async function (req, res) {

  const data = req.body;
  if (!data) {
      return new Error('No Data Received');
  }

  // users.push(profile);
  try {
      const newItem = await db.models.Permissions.create(data);

      res.status(200).json(newItem);
  } catch (error) {
      return new Error('Could not process this request');
  }

});

//get
app.get('/:id', async function (req, res) {

  const id = req.params.id;
  // get this user
  const item = await db.models.Permissions.findOne({
      where: {
          id: id
      },
      include: [db.models.User]
  });


  return res.json(item)

});

//get multiple
app.get('/', async function (req, res) {

  // get this user
  const items = await db.models.Permissions.findAll({
      include: [db.models.User]
  });


  return res.json(items);
});

//update
app.put('/:id', async function (req, res) {

  const id = req.params.id;
  // get this user
  let item = await db.models.Permissions.findOne({
      where: {
          id: id
      },
      include: []
  });

  // update
  item = Object.assign(item, req.body);
  try {
      await item.save();

  } catch (error) {
      console.log(error);
      return error;
  }

  return res.status(200).end();
});

//delete
app.delete('/:id', async function (req, res) {

  const id = req.params.id;
  // get this user
  let item = await db.models.Permissions.findOne({
      where: {
          id: id
      },
      include: []
  });

  // delete
  await item.destroy();


  res.status(200).end();
});


module.exports = app