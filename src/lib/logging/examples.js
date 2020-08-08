
// on app startup init logging
const logging = require('./index');
logging.initLogging();


// in other parts of app, get the logger you want
const logger = require('index').getLog('app', 'section 1'); // log name to get, and OPTIONAL sectionName


// start logging
logger.log("log - this is a test of the logging module!!");
logger.info("info - this is a test of the logging module!!");
logger.warn("ut oh!");
logger.debug("just a thing that might be important");
logger.trace("check this out", 'dog', 'yo');
logger.error("a bad error");
logger.error("this is not good!!!!!!!", {error: {message: "stack trace..", errNo: 123456}});
logger.error("this is not good!!!!!!!", {error: {message: "stack trace..", errNo: 123456}}, {hello: 'world'}, 'another message');