
const Sequelize = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class Camera extends Sequelize.Model {}
  Camera.init({
    // attributes
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    addMethod: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ''
    },
    cameraNum: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    mac: {
      type: DataTypes.STRING,
      allowNull: false
    },
    IPv4: {
      type: DataTypes.STRING,
      allowNull: false
      // allowNull defaults to true
    },
    onvifPort: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 80
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
      // allowNull defaults to true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
      // allowNull defaults to true
    },
    lastConnection: {
      type: DataTypes.DATE,
      allowNull: true
      // allowNull defaults to true
    },
    stream1: {
      type: DataTypes.STRING,
      allowNull: false
    },
    stream2: {
      type: DataTypes.STRING,
      allowNull: true
    },
    stream3: {
      type: DataTypes.STRING,
      allowNull: true
    },
    snapshotUri: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isDhcp: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    stream1Width: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stream1Height: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stream1Settings: {
      type: DataTypes.JSON,
      allowNull: true
    },
    stream1HasAudio: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    stream2Width: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stream2Height: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stream2Settings: {
      type: DataTypes.JSON,
      allowNull: true
    },
    stream2HasAudio: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    stream3Width: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stream3Height: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stream3Settings: {
      type: DataTypes.JSON,
      allowNull: true
    },
    stream3HasAudio: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isRecording: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isStalled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    pid: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hlsUrlStream1: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ''
    },
    hlsUrlStream2: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ''
    },
    hlsUrlStream3: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ''
    },
    unexpectedStops: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'camera'
    // options
  });

  return Camera;
}
