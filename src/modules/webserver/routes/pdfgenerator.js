const express = require('express')
const router = express.Router()
const {create,download} = require('./pdfgenerator2')


router.route('/').post(create).get(download)


module.exports = router;