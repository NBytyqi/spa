const Sequelize = require('sequelize')
const Op = Sequelize.Op;
module.exports = (sequelize, DataTypes) => {
    class Event extends Sequelize.Model {}
    Event.init({
        // attributes
        id: {
            primaryKey: true,
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
            description: 'pending, approved, denied'
        },
        type: {
            type: DataTypes.STRING,
            allowNull: true,
            description: 'plate detected, or ...'
        },
        plate: {
            type: DataTypes.STRING,
            allowNull: false,
            description: 'plate number/string'
        },
        isBlacklisted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          description: 'flag if this plate is blacklisted'
        },
        isOverride: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          description: 'flag if this blocked plate has been overridden'
        },
        startDate: {
            type: DataTypes.DATE,
            allowNull: true,
            description: 'start date of event'
        },
        endDate: {
            type: DataTypes.DATE,
            allowNull: true,
            description: 'end date of event'
        },
        carOnSensor: {
            type: DataTypes.DATE,
            allowNull: true,
            description: 'when the car first showed up on the sensor'
        },
        carOffSensor: {
            type: DataTypes.DATE,
            allowNull: true,
            description: 'when the car first left the sensor'
        },
        gateOpened: {
            type: DataTypes.DATE,
            allowNull: true,
            description: 'timestamp of when gate opened'
        },
        gateClosed: {
            type: DataTypes.DATE,
            allowNull: true,
            description: 'timestamp of when gate closed'
        },
        sensorDuration: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            description: 'duration in seconds of event'
        },
        gateOpenDuration: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            description: 'duration in seconds of event'
        },
        duration: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            description: 'duration in seconds of event'
        },
        searchString: {
            type: DataTypes.STRING,
            allowNull: true,
            description: 'additional string that can be searched'
        },
        complete: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          description: 'flag if this event is complete'
        },
        isApproved: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          description: 'user approved vehicle'
        },
        isDenied: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          description: 'user denied vehicle'
        },
        isDeniedAndBlacklisted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          description: 'user blacklisted and denied this vehicle'
        },
        isPendingAction: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          description: 'waiting user action'
        },
    }, {
        indexes: [
            // Create indexes
            {
                fields: ['cameraId', 'startDate', 'endDate'] // get all events by camera and date
            },
            {
                fields: ['recordingId'] // search events by recording
            },
            {
                fields: ['searchString'] // search by data string. e.g. person, car, white shirt, brown fox, etc..
            }
        ],
        sequelize,
        modelName: 'event'
        // options
    });


    return Event;
}