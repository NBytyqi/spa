const Sequelize = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Snapshot extends Sequelize.Model {}
  Snapshot.init({
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
    thumbFilename: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    height: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 0
    },
    thumbWidth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    thumbHeight: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 0
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    thumbFileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: true
    },
    recordingId: {
      type: Sequelize.STRING,
      references: {
        model: 'recording', // 'persons' refers to table name
        key: 'id', // 'id' refers to column name in persons table
      }
    },
    dayPath: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
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
        fields: ['timestamp', 'cameraId']
      }, {
        fields: [{
          name: 'recordingId'
        }, {
          name: 'timestamp',
          order: 'ASC'
        }]
      }, {
        fields: ['cameraId']
      }
    ],
    sequelize,
    modelName: 'snapshot'
    // options
  });


  return Snapshot;
}