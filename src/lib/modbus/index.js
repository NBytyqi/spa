// modbus control functions
// create an empty modbus client
var ModbusRTU = require("modbus-serial");
var client = new ModbusRTU();

const db = require('../db');
const _ = require('lodash');
const ioServer = require('../../modules/webserver/socketio/server');
const rxjs = require('rxjs')

let timer;
let gates = []; // list of gates

let status = []; // gates status

const gateOpenedSubject = new rxjs.Subject()
const gateClosedSubject = new rxjs.Subject()
const carOnSensorSubject = new rxjs.Subject()
const carOffSensorSubject = new rxjs.Subject()
const statusChangedSubject = new rxjs.Subject()

let connecting = false;


async function connect(ip, port, slaveId) {

    try {
        connecting = true;
        await client.connectTCP(ip, {
            port: port
        });

        await client.setID(slaveId);
    } catch (error) {

    } finally {
        connecting = false;
    }

}

async function writeCoil(ip, port, slaveId, coilAddress, data) {

    if (!client.isOpen) {
        await connect(ip, port, slaveId);
    }

    

    await client.writeCoil(coilAddress, data);
}

async function readCoil(ip, port, slaveId, coilAddress) {
    if (!client.isOpen) {
        await connect(ip, port, slaveId);
    }

    const result = await client.readCoil(coilAddress);

    return result;
}

async function writeCoilByGate(gateInstance, address, data) {
    if (!client.isOpen) {
        await connect(gateInstance.modbus_ipaddress, gateInstance.modbus_port, gateInstance.modbus_slave_id);
    }

    await client.writeCoil(address, data);
}

async function readCoilByGate(gateInstance, address) {
    if (!client.isOpen) {
        await connect(gateInstance.modbus_ipaddress, gateInstance.modbus_port, gateInstance.modbus_slave_id);
    }

    const result = await client.readCoil(address);

    return result;
}

async function openGate(gateInstance) {
    try {
        if (!client.isOpen) {
            await connect(gateInstance.modbus_ipaddress, gateInstance.modbus_port, gateInstance.modbus_slave_id);
        }

        await client.writeCoil(gateInstance.modbus_write_coiladdress, 1);
    } catch (error) {
        console.log(error)
    }
}

async function closeGate(gateInstance) {
    // open connection to a tcp line
    if (!client.isOpen) {
        await connect(gateInstance.modbus_ipaddress, gateInstance.modbus_port, gateInstance.modbus_slave_id);
    }

    await client.writeCoil(gateInstance.modbus_write_coiladdress, 0);
}

async function isGateOpen(gateInstance) {
    try {
        if (!client.isOpen) {
            await connect(gateInstance.modbus_ipaddress, gateInstance.modbus_port, gateInstance.modbus_slave_id);
        }

        const result = await client.readCoils(gateInstance.modbus_write_coiladdress, 1);

        return result;
    } catch (error) {
        console.log(error);
    }
    // open connection to a tcp line

}

async function isSensorActive(gateInstance) {
    try {
        if (!client.isOpen) {
            await connect(gateInstance.modbus_ipaddress, gateInstance.modbus_port, gateInstance.modbus_slave_id);
        }

        const result = await client.readCoils(gateInstance.modbus_read_coiladdress, 1);

        return result;
    } catch (error) {
        console.log(error);
        return error.code;
    }
    // open connection to a tcp line

}





// get status of all gates
async function getCurrentStatus() {
    return status;
}

function getStatusByGateId(id) {
    return status.find(item => item.gateId === id);
}

async function checkStatus() {

    for (const gate of gates) {

        if (!client.isOpen && !connecting) {
            await connect(gate.modbus_ipaddress, gate.modbus_port, gate.modbus_slave_id);
            if (!client.isOpen && !connecting) {
                return;
            }

        }

        const gateResponse = await isGateOpen(gate);
        const sensorResponse = await isSensorActive(gate);
        let connected = true;

        if (gateResponse === 'ECONNREFUSED' || sensorResponse === 'ECONNREFUSED') {
            connected = false;


        }

        // new status
        const result = {
            gateId: gate.id,
            connected: connected,
            gateOpen: _.get(gateResponse, 'data[0]', -1),
            sensor: _.get(sensorResponse, 'data[0]', -1)
        }

        const oldStatusIdx = status.findIndex(item => item.gateId === gate.id);



        // check if changed
        if (oldStatusIdx > -1) {
            const oldStatus = status[oldStatusIdx];
            let changed = false;

            if (oldStatus.gateOpen === -1) {
                status[oldStatusIdx].gateOpen = result.gateOpen;
            }

            // gate opened
            if (oldStatus.gateOpen === false && result.gateOpen === true) {
                changed = true;
                ioServer.io.emit('modbus_gateStatusChange', {
                    id: gate.id,
                    timestamp: new Date(),
                    event: 'Gate Opened'
                });
                ioServer.io.emit('modbus_gateOpened', {
                    id: gate.id,
                    timestamp: new Date()
                });
                gateOpenedSubject.next({
                    result: result,
                    gate: gate
                });
            }

            // gate closed
            if (oldStatus.gateOpen === true && result.gateOpen === false) {
                changed = true;
                ioServer.io.emit('modbus_gateStatusChange', {
                    id: gate.id,
                    timestamp: new Date(),
                    event: 'Gate Closed'
                });
                ioServer.io.emit('modbus_gateClosed', {
                    id: gate.id,
                    timestamp: new Date()
                });
                gateClosedSubject.next({
                    result: result,
                    gate: gate
                });
            }

            if (oldStatus.sensor === -1) {
                status[oldStatusIdx].sensor = result.sensor;
            }

            // car on sensor
            if (oldStatus.sensor === false && result.sensor === true) {
                changed = true;
                ioServer.io.emit('modbus_gateStatusChange', {
                    id: gate.id,
                    timestamp: new Date(),
                    event: 'Car On Sensor'
                });
                ioServer.io.emit('modbus_carOnSensor', {
                    id: gate.id,
                    timestamp: new Date()
                });
                carOnSensorSubject.next({
                    result: result,
                    gate: gate
                })
            }


            // car off sensor
            if (oldStatus.sensor === true && result.sensor === false) {
                changed = true;
                ioServer.io.emit('modbus_gateStatusChange', {
                    id: gate.id,
                    timestamp: new Date(),
                    event: 'Car Off Sensor'
                });
                ioServer.io.emit('modbus_carOffSensor', {
                    id: gate.id,
                    timestamp: new Date()
                });
                carOffSensorSubject.next({
                    result: result,
                    gate: gate
                });
            }

            if (changed) {
                statusChangedSubject.next({
                    result: result,
                    gate: gate
                });
                status.splice(oldStatusIdx, 1, result);
            }

        } else {
            status.push(result);
            ioServer.io.emit('modbus_initialStatus', {
                id: gate.id,
                timestamp: new Date(),
                event: 'Initial Gate Status'
            });
        }


    }
}

async function startGateCheckTimer() {

    // get this user
    gates = await db.models.Gate.findAll({
        include: [db.models.Camera]
    });

    timer = setInterval(() => {
        checkStatus();
    }, 700);

}

function stopGateCheckTimer() {
    if (timer) {
        clearInterval(timer);
    }

    gates = [];
    // status = [];
}


module.exports = {
    openGate,
    closeGate,
    isGateOpen,
    isSensorActive,
    writeCoil,
    readCoil,
    writeCoilByGate,
    readCoilByGate,
    getCurrentStatus,
    getStatusByGateId,
    checkStatus,
    startGateCheckTimer,
    stopGateCheckTimer,
    gateOpenedSubject,
    gateClosedSubject,
    carOnSensorSubject,
    carOffSensorSubject,
    statusChangedSubject
}