const Sequelize = require('sequelize')
const Op = Sequelize.Op;
module.exports = (sequelize, DataTypes) => {
  class Recording extends Sequelize.Model {}
  Recording.init({
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4
    },
    save: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    initSize: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: 0
    },
    bitRate: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    plate: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
    }
  }, {
    indexes: [
      // Create a unique index
      {
        unique: true,
        fields: ['id', 'startDate']
      }
    ],
    sequelize,
    modelName: 'recording'
    // options
  });


  return Recording;
}