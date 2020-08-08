const exec = require('child_process').exec;
const util = require('util');
const fs = require('fs');
const got = require('got');
const FormData = require('form-data');
const rxjs = require('rxjs');
const {
    filter,
    take
} = require('rxjs/operators');
const uuidv4 = require('uuid/v4');
const logger = require('./logging').getLog('notifications');

const sendQueue = [];

const messageSentSubject = new rxjs.Subject();
const processSMSSubject = new rxjs.Subject();
let processingSMS = false;

let pendingNext;
let lastSent;

const queueTime = 200;

let processSMSSub;
if (!processSMSSub) {
    processSMSSub = processSMSSubject.subscribe(async (item) => {

        if (sendQueue.length) {
            const delta = lastSent ? Date.now() - lastSent : queueTime; // time since last msg in ms
            // logger.info(delta)
            if (!processingSMS && delta >= queueTime) {
                processingSMS = true;
                const msg = sendQueue.shift();
                logger.info('Sending text to ' + msg.phoneNum);
                const data = {};
                data.to = msg.phoneNum;
                data.from = '13304002767';
                data.body = msg.text;
                data.is_mms = false;

                const result = await got.post('https://api.flowroute.com/v2.1/messages', {
                    body: JSON.stringify(data),
                    headers: {
                        'Content-Type': 'application/vnd.api+json'
                    },
                    auth: '89767590:nmRYuUn9MfcyihAuEvLCAoA6fpyjEOov'
                });

                const body = result && result.body ? JSON.parse(result.body).data : {};

                lastSent = Date.now();

                processingSMS = false;

                messageSentSubject.next({
                    originalMsg: msg,
                    response: body
                });

                processSMSSubject.next();

            } else {

                if (!processingSMS) {
                    if (pendingNext) {
                        clearTimeout(pendingNext);
                    }
                    const delta2 = lastSent ? Date.now() - lastSent : queueTime; // time since last msg in ms
                    logger.info('Queuing message');

                    logger.info('Send next in ' + (queueTime - delta2) + 'ms');
                    pendingNext = setTimeout(() => {
                        if (sendQueue.length) {
                            logger.info('next queue item')
                            processSMSSubject.next();

                        }
                        pendingNext = null;
                    }, queueTime - delta2); // throttle to 200ms
                }



            }

        }



    });
}


async function sendSMS(phoneNum, text) {

    const msg = {
        phoneNum: phoneNum,
        text: text,
        id: uuidv4()
    };


    sendQueue.push(msg);


    processSMSSubject.next(); // signal the start of the process

    // return promise to response
    return messageSentSubject.pipe(filter(item => {
        return item.originalMsg.id === msg.id
    }), take(1)).toPromise();

}

async function testSingle() {
    logger.info('sending test message');

    // test single
    const result = sendSMS('3304177841', 'test!');
    logger.info(result);

}

async function testMultiple() {
    logger.info('sending 5 test messages');

    const promises = [];

    for (let index = 1; index < 6; index++) {
        promises.push(sendSMS('3304177841', 'test! ' + index));

    }

    logger.info('all sent, waiting for all to return');

    const timeout = setTimeout(() => {

    }, 10000);

    const res = await Promise.all(promises);

    clearTimeout(timeout);

    logger.info('all returned! ', res);
}

// testMultiple();

module.exports = {
    sendSMS
}