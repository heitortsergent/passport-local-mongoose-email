var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    passportLocalMongooseEmail = require('passport-local-mongoose-email');

var Account = new Schema({
    nickname: String,
    birthdate: Date
});

Account.plugin(passportLocalMongooseEmail, {
  usernameField: 'email',
});

module.exports = mongoose.model('Account', Account);