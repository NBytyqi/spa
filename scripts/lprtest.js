const LPR = require('../src/lib/image-processing/lpr/carmen-lpr');



async function test() {
    //const res = await LPR.detectLicensePlate(null,null,null,null,'/usr/src/gx/examples/c/cmanpr/test.jpg');
    // const res = await LPR.detectLicensePlate(null,null,null,null,'/home/ahmed/Downloads/vehicles_Front_3_FEB_2020_jpg/IMG20200203133639.jpg');
    const res = await LPR.detectLicensePlate(null, null, null, null, '/home/ahmed/Downloads/vehicles_30_Jan_2020_jpg/IMG20200130135143.jpg');

    // parse arabic letters in the 
    let tempResult = JSON.stringify(res.plate);
    tempResult = tempResult.replace(/\(/g, '\\u').replace(/\)/g, '');
    res.plate = JSON.parse(tempResult);

    // get hex color value
    const data = res.plate.split(',');
    if (data.length == 3) {
        const reverseDecimal = parseInt(data[2]);
        let hexColor = reverseDecimal.toString(16).padStart(6, 0);
        data[2] = '#' + hexColor.match(/.{1,2}/g).reverse().join('');
    }
    res.plate = data.join(',');

    console.log(res);
}

test();