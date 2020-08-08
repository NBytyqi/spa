
const Sequelize = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  class User extends Sequelize.Model {}
  User.init({
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
    firstname: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    lastname: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ''
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
        description: 'additional user description'
    },
    scope: {
        type: DataTypes.STRING,
        allowNull: true,
        description: 'scopes this user can access'
    },
    access: {
        type: DataTypes.STRING,
        allowNull: true,
        description: 'read write for the scopes'
    }
  }, {
    sequelize,
    modelName: 'user'
    // options
  });

  return User;
}
