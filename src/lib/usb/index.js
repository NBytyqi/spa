// reset the use controller
const utils = require('../utils');
const path = require('path');
const fs = require('fs');

const pathToUhubctl = path.join(process.cwd(), 'bin/uhubctl');


async function resetUSBController() {
    // make sure the hubctl program has execute permissions
    await utils.execAsync(`sudo chmod +x ${pathToUhubctl}`);

    // do a power cycle on the usb hub
    await cycleUSBPower();

    // unbind usb3 controller on pi 4
    await unBindHub(false);

    // bind usb controller on pi 4
    await bindHub(true);
}

async function cycleUSBPower() {
    // turn off power to ports
    await utils.execAsync(`sudo ${pathToUhubctl} -a off`);

    // turn on power to usb ports
    await utils.execAsync(`sudo ${pathToUhubctl} -a on`);

    // trigger usb rules
    return triggerUSBEnumeration();
}

async function bindHub(enumerateAfter = true) {
    await utils.execAsync(`sudo sh -c "echo -n '0000:01:00.0' > /sys/bus/pci/drivers/xhci_hcd/bind"`);
    if (enumerateAfter) {
        return triggerUSBEnumeration();
    }
    return;
}

async function unBindHub(enumerateAfter = true) {
    await utils.execAsync(`sudo sh -c "echo -n '0000:01:00.0' > /sys/bus/pci/drivers/xhci_hcd/unbind"`);
    if (enumerateAfter) {
        return triggerUSBEnumeration();
    }
    return;
}

async function triggerUSBEnumeration() {
    return utils.execAsync('sudo udevadm trigger');
}

function hubExists() {
    return fs.existsSync('/sys/bus/pci/drivers/xhci_hcd/0000:01:00.0');
}

module.exports = {
    hubExists,
    resetUSBController,
    cycleUSBPower,
    bindHub,
    unBindHub
}