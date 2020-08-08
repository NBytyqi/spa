// modbus control functions
// create an empty modbus client
var ModbusRTU = require("modbus-serial");
var client = new ModbusRTU();

const rxjs = require('rxjs')

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

        // await client.setID(slaveId);

        await client.readHoldingRegisters(1, 1)
            .then(console.log);

        // const result = await client.readCoil(2);
        // console.log(result)

        console.log('-------------------- connected 2')
    } catch (error) {
        console.log(error)

    } finally {
        connecting = false;
    }

}

connect('127.0.0.1', 502, 1);