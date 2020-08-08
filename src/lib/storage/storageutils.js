// handles detection, formatting, mounting, etc
const exec = require('child_process').exec;
const utils = require('../utils');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');

// get list of physical drives connected to system
async function getPhysicalDriveList() {
    // return json list of drive info
    // lsblk -bin -O -J -p
    // example output listed in hd_example_output.json
    let drives = [];

    if (process.platform === 'linux') {
        try {
            const stdout = await utils.execAsync('lsblk -bin -O -J -p');
            const json = JSON.parse(stdout);
            drives = json.blockdevices ? json.blockdevices : [];

            // filter out the main storage sd card, only use plugin drives
            drives = drives.filter(item => {
                return item.name && item.name.indexOf('mmcblk') === -1;
            });
            // add empty children array if missing
            for (const drive of drives) {
                if (!drive.children) {
                    drive.children = [];
                }
            }


        } catch (error) {
            console.log('Error getting physical drive list', error);
        }
    }

    if (process.platform === 'win32') {
        const drivelist = require('drivelist');

        drives = await drivelist.list();
        drives = drives.filter(item => {
            return !item.isSystem
        }); // filter out system drive

        // create some addition fields to match linux command above
        drives = drives.map(drive => {
            drive.children = [...drive.mountpoints];
            drive.name = drive.children && drive.children.length === 1 ? drive.children[0].path : drive.device;

            drive.children = drive.children.map(partition => {
                partition.name = partition.path;
                partition.uuid = partition.path;
                partition.serial = '';
                partition.fsType = 'ntfs';
                partition.label = partition.path;
                partition.pkname = drive.device;
                partition.mountpoint = partition.path;
                partition.size = drive.size;
                return partition;
            });
            return drive;
        });

    }


    return drives;
}

// get list of partitions on drive
// async function getPartitionList(driveName) {
//     // lsblk -io NAME,LABEL,TYPE,SIZE,MOUNTPOINT,FSTYPE,UUID | grep 'sda.*part.*$' | sed -E 's/`\-//g'

//     // outputs
//     // sda1      VIDEOSTORAGE1 part 232.9G            ext4   88b87292-c1e3-483e-b9e7-27b9d535bf76

// }


// mount partition to a folder
async function mountPartition(devicePath, mountPoint, isNew = false) {
    if (process.platform === 'linux' && devicePath && mountPoint) {
        console.log(`Mounting ${devicePath} to ${mountPoint}`);
        try {
            // 1. create mount path
            // sudo mkdir /media/VIDEOSTORAGE1
            await utils.ensurePath(mountPoint);

            // 2. take ownership of the mount point
            await utils.execAsync(`sudo chown ${config.get('/systemUser')}:${config.get('/systemUser')} ${mountPoint}`);

            // 2.1  make folder immutable
            if (isNew) {
                console.log('Setting permissions on new partition')
                await utils.execAsync(`sudo mount '${devicePath}' '${mountPoint}'`);
                // await new Promise(resolve => setTimeout(resolve, 1000)); // pause 1 sec
                await utils.execAsync(`sudo chattr -i ${mountPoint}`);
                await utils.execAsync(`sudo chown ${config.get('/systemUser')}:${config.get('/systemUser')} ${mountPoint}`);
                console.log(`Creating base folder ${path.join(mountPoint, config.get('/baseFolder'))}`)
                await utils.execAsync(`mkdir ${path.join(mountPoint, config.get('/baseFolder'))}`); // add base folder and make parent immutable
                // mark the new folder as immutable so if the drive becomes dismountd we cannot accidently write to the root fs
                // can only do this before the dir is mounted, and we should own it first
                // sudo chattr +i mountPoint
                await utils.execAsync(`sudo chattr +i ${mountPoint}`);
            } else {
                // 3. mount path
                // sudo mount /dev/sda1 /media/pi/VIDEOSTORAGE1
                await utils.execAsync(`sudo chown ${config.get('/systemUser')}:${config.get('/systemUser')} ${mountPoint}`);
                await utils.execAsync(`sudo mount '${devicePath}' '${mountPoint}'`);
            }

        } catch (error) {
            console.error(`Could not mount '${devicePath}' '${mountPoint}'`, error)
        }


    }
}

// dismount All partitions of a drive
async function unmountAllPathsOnDrive(drive) {
    console.log(`Dismounting all partitions of '${drive.name}'`);
    for (const partition of drive.children) {
        await unmountPartition(partition.pkname, partition.mountpoint);
    }
}

// dismount a partition
async function unmountPartition(devicePath, mountPoint) {
    // unmount path
    // sudo umount /dev/sda1
    if (process.platform === 'linux') {
        console.log(`Dismounting '${mountPoint}'`);
        try {
            await utils.execAsync(`sudo umount ${mountPoint}`);
        } catch (error) {

        }

        // remove mount path from filesystem
        // sudo rm -rf /media/pi/VIDEOSTORAGE1
        try {
            const mounted = await isMounted(devicePath, mountPoint);
            if (!mounted) {
                await utils.execAsync(`sudo rm -rf ${mountPoint}`);
            }
        } catch (error) {
            console.log(`Could not remove mount point folder '${mountPoint}'`)
        }
    }

}


// clear all partitions off of drive (will remove all data on drive!!)
async function wipeDrive(drive) {
    // 1. dismount all partitions/mountpaths
    await unmountAllPathsOnDrive(drive);


    // 2. remove all partitions
    // sudo wipefs -a /dev/sda
    if (process.platform === 'linux') {
        console.log(`Wiping drive '${drive.name}'`);
        try {
            await utils.execAsync(`sudo wipefs -a ${drive.name}`);
        } catch (error) {
            console.error('Could not wipe fs from drive')
        }
    }
}

// make a partition fill the whole drive
async function createFullDiskPartition(drive) {
    // echo 'start=2048, type=83' | sudo sfdisk /dev/sda
    if (process.platform === 'linux' && drive) {
        console.log(`Creating full size partition on '${drive.name}'`);
        try {
            await utils.execAsync(`echo 'start=2048, type=83' | sudo sfdisk ${drive.name}`);
            await new Promise(resolve => setTimeout(resolve, 500)); // pause let sys update
            const driveList = await getPhysicalDriveList();

            const updatedDriveInfo = driveList.find(item => {
                return item.name === drive.name && item.serial === drive.serial;
            })
            if (updatedDriveInfo) {
                return updatedDriveInfo.children ? updatedDriveInfo.children[0] : null
            }
        } catch (error) {
            console.error('Could not create partition', error);
        }
    }

    if (process.platform === 'win32') {
        return drive.children ? drive.children[0] : null;
    }
}


// format a drive with EXT4 using the whole size of the drive (will remove all data on drive!!)
async function formatPartitionExt4(partition) {
    // create new image on pathName
    // sudo mkfs.ext4 -F -O 64bit -L "VIDEOSTORAGE1" /dev/sda1
    if (process.platform === 'linux' && partition) {
        console.log(`Formating partition '${partition.name}' with ext4 fs, label 'RCSTORAGE'`);
        try {
            await utils.execAsync(`sudo mkfs.ext4 -F -O 64bit -L "RCSTORAGE" ${partition.name}`);
            await new Promise(resolve => setTimeout(resolve, 500)); // pause let sys update (uuid was missing otherwise in drivelist)
            //get updated partition info that should now have uuid after formatting
            const driveList = await getPhysicalDriveList();

            const updatedDriveInfo = driveList.find(drive => {
                if (drive.children) {
                    const foundpart = drive.children.find(item => {
                        return item.name === partition.name
                    });
                    if (foundpart) {
                        return true;
                    }
                }
                return false;
            });

            // DEBUG uuid was missing without pause
            // console.log(updatedDriveInfo.children[0]);
            // process.exit()
            return updatedDriveInfo.children[0]


        } catch (error) {
            console.error('Could format drive with ext4 fs: ', error)
        }

    }

    // TO DO on windows just keep the partition intact for now
    if (partition && process.platform === 'win32') {
        return partition;
    }

}


// check to see if a path is mounted to a drive
async function isMounted(devicePath, mountPoint) {

    switch (process.platform) {
        case 'linux':
            // lsblk /dev/sdc1 -n -o MOUNTPOINT
            // #outputs either
            // <nothing> (not mounted)
            // 		or
            // /media/pi/VIDEOSTORAGE1
            //console.log('checking mountint ' + mountPoint);
            const stdout = await utils.execAsync(`lsblk ${devicePath} -n -o MOUNTPOINT`);
            //console.log(stdout)
            if (stdout.indexOf(mountPoint) > -1 && stdout.indexOf(`${mountPoint}: not a block device`) === -1) {
                return true;
            }
            break;

        case 'win32':
            // for windows, just check that the folder exists
            const folPath = path.join(mountPoint);
            if (fs.existsSync(folPath)) {
                return true;
            }
            break;
        default:
            break;
    }

    // default to false
    return false;
}

// return the number of partitions on a drive name e.g. 'sda'
async function getNumberOfPartitions(driveName) {
    // lsblk -io NAME,TYPE | grep "^\`\-sda.*part.*" | wc -l
}



module.exports = {
    getPhysicalDriveList,
    mountPartition,
    unmountPartition,
    unmountAllPathsOnDrive,
    wipeDrive,
    formatPartitionExt4,
    isMounted,
    getNumberOfPartitions,
    createFullDiskPartition
}