// connection to carmen LPR SDK
const utils = require('../../utils');

async function detectLicensePlate(camId, imgBuf, timestampReceived, jobId, imagePath) {

    const result = {
        hasPlate: false,
        plate: ''
    };

    try {
        // const lprRes = await utils.execAsync(process.cwd() + '/lpr ' + imagePath);
        const lprRes = '٧٨٤رنم,EGY,#ff8000';
        result.hasPlate = lprRes.trim() == 'Plate not found' ? false : true;
        result.plate = lprRes.trim();
    } catch (error) {

    }

    return result
}

module.exports = {
    detectLicensePlate
}