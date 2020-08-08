const Sequelize = require('sequelize')
const Op = Sequelize.Op;
module.exports = (sequelize, DataTypes) => {
    class Blacklist extends Sequelize.Model {}
    Blacklist.init({
        // attributes
        id: {
            primaryKey: true,
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4
        },
        plate: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
            description: 'plate name/number'
        },
        notes: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: '',
            description: 'plate name/number'
        }
    }, {
        indexes: [
            // Create indexes here
        ],
        sequelize,
        modelName: 'blacklist'
        // options
    });


    return Blacklist;
}