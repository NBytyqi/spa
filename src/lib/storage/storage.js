// manage storage devices
const storageUtils = require('./storageutils');
const path = require('path');
const config = require('../../config/config');
const utils = require('../utils');
const fs = require('fs');

// get list of root storage devices the camera system can record to
// load from config file
function getStorageDevicesFromConfig() {
    return config.get('/storageDevices') || [];
}

let useForceStorage = true;
let forceStorage = {
    name: 'force_storage',
    active: true,
    uuid: '123456789',
    devicePath: 'forcestorage',
    mountPoint: config.get('/baseMountingPoint'),
    type: 'partition',
    fsType: '',
    label: 'forcestorage',
    size: 0,
    used: 0,
    available: 0,
    usedPercent: 0,
    parentDrive: '',
    isPrimary: true
}


// start and mount the drives of the system from config file
// once the filesystem is mounted the db will be updated to
async function initalizeStorage() {
    console.log('Initalizing Storage Devices From Config');

    // update mounting positions (incase drive positions have changed)
    const result = await syncDrivesWithConfigFile();

    const storageDevices = result.storageDevices; // these are the drives that SHOULD be here
    const missingDevices = result.missingStorageDevices; // these drives are in the config, but not currently attaced to system

    // ensure maountpoint
    if (process.platform === 'linux') {
        const baseMountingPointExists = fs.existsSync(config.get('/baseMountingPoint'));

        if (!baseMountingPointExists) {
            await utils.execAsync(`sudo mkdir -p ${config.get('/baseMountingPoint')}`);
            await utils.execAsync(`sudo chown ${config.get('/systemUser')}:${config.get('/systemUser')} ${config.get('/baseMountingPoint')} -R`);
        }

        // set owner on default dir
        if (config.get('/baseMountingPoint') === '/media/pi') {
            await utils.execAsync(`sudo chown ${config.get('/systemUser')}:${config.get('/systemUser')} /media`);
            await utils.execAsync(`sudo chown ${config.get('/systemUser')}:${config.get('/systemUser')} /media/pi`);
        }

    }

    console.log(`System has ${storageDevices.length} storage devices configured`);

    // try to mount existing storage devices
    for (const storageDevice of storageDevices) {
        let hasIOError = false;
        const isMounted = await storageUtils.isMounted(storageDevice.devicePath, storageDevice.mountPoint);

        const disconnected = missingDevices.find(item => {
            return item.uuid === storageDevice.uuid
        });


        if (!isMounted) {
            if (!disconnected) {
                await storageUtils.mountPartition(storageDevice.devicePath, storageDevice.mountPoint);
            } else {
                console.error(`ERROR - Device ${storageDevice.devicePath} is not mounted at ${storageDevice.mountPoint} because it is not connected to the system!`);
                throw new Error(`Device ${storageDevice.devicePath} is not mounted at ${storageDevice.mountPoint} because it is not connected to the system!`)
                //TO DO
                // MOVE THE CAMERAS THAT ARE ASSIGNED TO THIS STORAGE DEVICE TO ANOTHER DEVICE!
            }
        } else {
            console.log(`Device ${storageDevice.devicePath} is already mounted at ${storageDevice.mountPoint}`);
        }


        // verify base folder on storage device exists
        const basepath = path.join(storageDevice.mountPoint, config.get('/baseFolder'));
        await utils.ensurePath(basepath);

    }

    await scanForNewDrives();

    // make the primary drive the first drive with a database
    await setPrimaryDrive()

    console.log('Finished initalizing drives');
}

async function scanForNewDrives() {
    console.log('Scanning for new storage devices');
    // get storage device already added to system
    const storageDevices = getStorageDevicesFromConfig();

    // check for new drives (drives without partitions) does NOT include OS drive
    const driveList = await storageUtils.getPhysicalDriveList();
    console.log(`Found ${driveList.length} physical drives`);

    for (const drive of driveList) {
        if (drive.children.length) {
            // see if the partitions of this drive are included
            for (const partition of drive.children) {
                const inList = storageDevices.find(item => {
                    return item.uuid === partition.uuid;
                });

                if (!inList) {
                    // found new Storage Device
                    console.log(`Found storage partitoin at '${partition.name}', but it is not empty, addint it anyways`);

                    // TO DO  ask user if they want to format and add to system, will erase all data on drive
                    await addDrive(drive);
                }
            }

            // TO DO check if this is a camera system drive from this or another system?
            // ...
        } else {
            // add drive if it has no partitions
            console.log(`Found new HD '${drive.name}'`);
            await addDrive(drive);
        }
    }
}

async function addDrive(drive) {
    console.log(`Configuring partitions and file system for HD '${drive.name}'`);

    await storageUtils.unmountAllPathsOnDrive(drive); // this is noop for win32

    const hasExt4 = drive.children.find(item => {
        return item.fstype === 'ext4';
    });


    if (hasExt4) {
        // add the ext4 partitions
        for (const partition of drive.children) {
            if (partition.fstype === 'ext4') {
                await addPartition(partition)
            }
        }
    } else {
        // setup the new drive
        const partition = await reformatDrive(drive);
        await addPartition(partition)
    }

    if (drive.fsType !== 'ext4') {

    }

    return
}

async function reformatDrive(drive) {
    await storageUtils.wipeDrive(drive); // this is noop for win32
    const tempPartition = await storageUtils.createFullDiskPartition(drive);
    const finalPartition = await storageUtils.formatPartitionExt4(tempPartition);

    return finalPartition;
}

async function addPartition(partition) {
    const storageDevices = getStorageDevicesFromConfig();

    // the primary drive is the first drive added to the system
    const isPrimary = !storageDevices.length

    // create mount point
    let newMountPoint = partition.mountpoint;
    if (process.platform === 'linux') {
        const random4DigitNum = Math.floor(1000 + Math.random() * 9000);
        const folderName = `RCSTORAGE${random4DigitNum}`
        newMountPoint = path.join(config.get('/baseMountingPoint'), folderName);
        await storageUtils.mountPartition(`${partition.name}`, newMountPoint, true);

        // // create base folder on drive
        // const basepath = path.join(newMountPoint, config.get('/baseFolder'));
        // await utils.ensurePath(basepath);

        // 2. take ownership of the mount point
        // await utils.execAsync(`sudo chown ${config.get('/systemUser')}:${config.get('/systemUser')} ${basepath}`);
    }

    // create new storageDevice object
    const data = {
        name: partition.name,
        active: true,
        uuid: partition.uuid,
        devicePath: partition.name,
        mountPoint: newMountPoint,
        type: 'partition',
        fsType: partition.fsType,
        label: partition.label,
        size: partition.size,
        used: 0,
        available: partition.size,
        usedPercent: 0,
        parentDrive: partition.pkname,
        isPrimary: isPrimary
    };

    // ADD DRIVE TO CONFIG
    config.push('/storageDevices[]', data);

    console.log(`New storage device added to system at '${data.mountPoint}'  uuid: ${partition.uuid}`);

    return data;
}

async function setPrimaryDrive() {
    let storageDevices = getStorageDevicesFromConfig();

    let primaryFound = false;

    // look for first device with DB as basis for primary drive
    // if multiple drives contain a db, the first found is used!
    for (let sDevice of storageDevices) {
        //console.log(storageDevices, storageDevices.length);

        const dbFile = path.join(sDevice.mountPoint, config.get('/baseFolder'), config.get('/dbFolder'), config.get('/dbName'));
        //  console.log(`Checking for DB at ${dbFile}`)
        const dbFileExists = await utils.existsAsync(dbFile);

        // set primary drive
        const sdIndex = storageDevices.findIndex(item => {
            return item.uuid === sDevice.uuid
        });

        if (dbFileExists && !primaryFound) {
            // set primary drive becuase it has a db already
            console.log(`Setting primary drive to ${sDevice.mountPoint} - Has existing DB`)
            sDevice.isPrimary = true;
            config.push(`/storageDevices[${sdIndex}]`, sDevice);
            primaryFound = true;
        } else {
            // clear primary flag
            sDevice.isPrimary = false;
            config.push(`/storageDevices[${sdIndex}]`, sDevice);
        }
    }

    // if no db found in last step, use largest drive
    if (!primaryFound) {
        let biggest;
        for (const sd of storageDevices) {

            if (!biggest || biggest.size < sd.size) {
                biggest = sd;
            }

        }

        // set primary drive to biggest
        if (biggest) {
            const sdIndex = storageDevices.findIndex(item => {
                return item.uuid === biggest.uuid
            });

            console.log(`Setting primary drive to ${biggest.mountPoint} - Biggest drive`)
            biggest.isPrimary = true;
            config.push(`/storageDevices[${sdIndex}]`, biggest);
            primaryFound = true;
        }
    }

    // if all else fails, use first
    if (!primaryFound && storageDevices.length) {
        console.log(`Setting primary drive to ${storageDevices[0].mountPoint} - First drive`);
        storageDevices[0].isPrimary = true;
        config.push(`/storageDevices[${0}]`, storageDevices[0]);
        primaryFound = true;
    }

}

async function syncDrivesWithConfigFile() {
    // get storage device already added to system
    let storageDevices = getStorageDevicesFromConfig();

    // get actual drive list on system
    const driveList = await storageUtils.getPhysicalDriveList();
    const missingDrives = [];

    for (const sd of storageDevices) {

        if (!driveList.length) {
            sd.active = false;

            const sdIndex = storageDevices.findIndex(item => {
                return item.uuid === sd.uuid
            });

            // update config
            config.push(`/storageDevices[${sdIndex}]`, sd);

            // this drive is missing
            missingDrives.push(sd);
        } else {

            for (const drive of driveList) {
                const foundIndex = drive.children.findIndex(item => {
                    return item.uuid === sd.uuid
                });

                if (foundIndex > -1) {
                    const found = drive.children[foundIndex];
                    if (sd.name !== found.name || sd.parentDrive !== found.pkname) {
                        // drive position has changed has changed
                        console.log(`Detected HD device name change from ${sd.name} to ${found.pkname}`)
                        const data = {
                            name: found.name,
                            active: true,
                            uuid: found.uuid,
                            devicePath: found.name,
                            mountPoint: sd.mountPoint,
                            type: 'partition',
                            fsType: found.fsType,
                            label: found.label,
                            size: found.size,
                            used: 0,
                            available: found.size,
                            usedPercent: 0,
                            parentDrive: found.pkname,
                            isPrimary: sd.isPrimary
                        };

                        const sdIndex = storageDevices.findIndex(item => {
                            return item.uuid === data.uuid
                        });

                        // update config
                        config.push(`/storageDevices[${sdIndex}]`, data);
                    }
                } else {
                    sd.active = false;

                    const sdIndex = storageDevices.findIndex(item => {
                        return item.uuid === sd.uuid
                    });

                    // update config
                    config.push(`/storageDevices[${sdIndex}]`, sd);

                    // this drive is missing
                    missingDrives.push(sd);
                }
            }
        }
    }



    // refresh storage device list
    storageDevices = getStorageDevicesFromConfig();

    return {
        storageDevices: storageDevices,
        missingStorageDevices: missingDrives
    };

}



function getPrimaryDriveInConfig() {
    if (!useForceStorage) {
        const storageDevicesInConfig = getStorageDevicesFromConfig();
        const primary = storageDevicesInConfig.find(item => {
            return item.isPrimary;
        });
        return primary;
    } else {
        forceStorage.mountPoint = config.get('/baseMountingPoint');
        return forceStorage;
    }

}

function setForceStorage(val) {
    useForceStorage = val;
}

function getForceStorage() {
    return useForceStorage;
}

module.exports = {
    getStorageDevicesFromConfig,
    getPrimaryDriveInConfig,
    initalizeStorage,
    scanForNewDrives,
    setForceStorage,
    getForceStorage,
    forceStorage
}