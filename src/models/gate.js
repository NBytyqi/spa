const Sequelize = require('sequelize')
const Op = Sequelize.Op;
module.exports = (sequelize, DataTypes) => {
    class Gate extends Sequelize.Model {}
    Gate.init({
        // attributes
        id: {
            primaryKey: true,
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            description: 'name of this gate'
        },
        type: {
            type: DataTypes.STRING,
            allowNull: false,
            description: 'entrance, exit'
        },
        modbus_ipaddress: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '127.0.0.1',
            description: 'address of modbus slave for this gate'
        },
        modbus_port: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 502,
            description: 'port of modbus slave for this gate'
        },
        modbus_slave_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            description: 'slabe'
        },
        modbus_read_coiladdress: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            description: 'coil address to read from to get status of gate'
        },
        modbus_write_coiladdress: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          description: 'modbus coild address to write to open the gate'
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
            description: 'description of this gate'
        },
    }, {
        indexes: [
            // Create indexes
        ],
        sequelize,
        modelName: 'gate'
        // options
    });


    return Gate;
}