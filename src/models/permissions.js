const Sequelize = require('sequelize')
const Op = Sequelize.Op;
module.exports = (sequelize, DataTypes) => {
    class Permissions extends Sequelize.Model {}
    Permissions.init({
        // attributes
        id: {
            primaryKey: true,
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4
        },
        cameras: {
            type: DataTypes.STRING,
            allowNull: false,
            description: 'JSON Stringified Array of camreas this user can see, applies to events and live',
            defaultValue: 'all'
        },
        canSearch: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          description: 'if user can search history of events'
        },
        canDelete: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            description: 'if user can delete events'
        },
        canOverrideBlacklist: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            description: 'if user can override a plate on the blacklist'
        },
        canEditSettings: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            description: 'if user can change system settings'
        },
        canAddToBlacklist: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            description: 'if user can add a plate to the blacklist'
        },
        canRemoveFromBlacklist: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            description: 'if user can remove a plate from the blacklist'
        }
    }, {
        indexes: [
            // Create indexes here
        ],
        sequelize,
        modelName: 'permissions'
        // options
    });


    return Permissions;
}