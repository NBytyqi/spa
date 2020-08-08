
const Sequelize = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class StorageDevice extends Sequelize.Model {}
  StorageDevice.init({
    // attributes
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      notes: '/dev/sda1'
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    uuid: {
      type: DataTypes.STRING,
      allowNull: false
    },
    devicePath: {
      type: DataTypes.STRING,
      allowNull: false,
      notes: 'device location e.g. /dev/sda1'
    },
    mountPoint: {
      type: DataTypes.STRING,
      allowNull: false,
      notes: 'place to mount drive. e.g. /media/storage1'
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      notes: 'disk, or part (partition), or boot, etc...'
    },
    fsType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
      // allowNull defaults to true
    },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ''
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
      // allowNull defaults to true
    },
    used: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
      // allowNull defaults to true
    },
    available: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
      // allowNull defaults to true
    },
    usedPercent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
      // allowNull defaults to true
    },
    parentDrive: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
    },
  }, {
    sequelize,
    modelName: 'storagedevice'
    // options
  });
  return StorageDevice;
}
