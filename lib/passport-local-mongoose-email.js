var util = require('util'),
    crypto = require('crypto'),
    LocalStrategy = require('passport-local').Strategy,
    BadRequestError = require('./badrequesterror');

module.exports = function(schema, options) {
    options = options || {};
    options.saltlen = options.saltlen || 32;
    options.iterations = options.iterations || 25000;
    options.keylen = options.keylen || 512;
    options.digest = options.digest || 'SHA1';
    options.encoding = options.encoding || 'hex';

    // Populate field names with defaults if not set
    options.usernameField = options.usernameField || 'username';
    options.hashField = options.hashField || 'hash';
    options.saltField = options.saltField || 'salt';
    options.authToken = options.authToken || 'authToken';
    options.isAuthenticated = options.isAuthenticated || 'isAuthenticated';

    // option to convert username to lowercase when finding
    options.usernameLowerCase = options.usernameLowerCase || false;

    options.incorrectPasswordError = options.incorrectPasswordError || 'Incorrect password';
    options.incorrectUsernameError = options.incorrectUsernameError || 'Incorrect username';
    options.missingUsernameError = options.missingUsernameError || 'Field %s is not set';
    options.missingPasswordError = options.missingPasswordError || 'Password argument not set!';
    options.userEmailUnverifiedError = options.userEmailUnverifiedError || 'User did not verify email!';
    options.userExistsError = options.userExistsError || 'User already exists with name %s';
    options.noSaltValueStoredError = options.noSaltValueStoredError || 'Authentication not possible. No salt value stored in mongodb collection!';
    options.authTokenNotFoundError = options.authTokenNotFoundError || 'Authentication token is not found!';

    var schemaFields = {};
    if (!schema.path(options.usernameField)) {
        schemaFields[options.usernameField] = String;
    }
    schemaFields[options.hashField] = String;
    schemaFields[options.saltField] = String;
    schemaFields[options.authToken] = String;
    schemaFields[options.isAuthenticated] = Boolean;

    schema.add(schemaFields);

    schema.pre('save', function(next) {
        // if specified, convert the username to lowercase
        if (options.usernameLowerCase) {
            this[options.usernameField] = this[options.usernameField].toLowerCase();
        }

        next();
    });

    schema.methods.setPassword = function (password, cb) {
        if (!password) {
            return cb(new BadRequestError(options.missingPasswordError));
        }
        
        var self = this;

        crypto.randomBytes(options.saltlen, function(err, buf) {
            if (err) {
                return cb(err);
            }

            var salt = buf.toString(options.encoding);

            crypto.pbkdf2(password, salt, options.iterations, options.keylen, options.digest, function(err, hashRaw) {
                if (err) {
                    return cb(err);
                }

                self.set(options.hashField, new Buffer(hashRaw, 'binary').toString(options.encoding));
                self.set(options.saltField, salt);

                cb(null, self);
            });
        });
    };

    schema.methods.setAuthToken = function (cb) {        
        var self = this;

        crypto.randomBytes(48, function(err, buf) {
            if (err) {
                return cb(err);
            }

            var authToken = buf.toString('hex');
            self.set(options.authToken, authToken);
            
            cb(null, self);
        });
    };

    schema.methods.authenticate = function(password, cb) {
        var self = this;

        //TODO: add token authentication failed logic here

        if (!this.get(options.saltField)) {
            return cb(null, false, { message: options.noSaltValueStoredError });
        }

        crypto.pbkdf2(password, this.get(options.saltField), options.iterations, options.keylen, options.digest, function(err, hashRaw) {
            if (err) {
                return cb(err);
            }
            
            var hash = new Buffer(hashRaw, 'binary').toString(options.encoding);

            if (hash === self.get(options.hashField)) {
                return cb(null, self);
            } else {
                return cb(null, false, { message: options.incorrectPasswordError });
            }
        });
    };

    schema.statics.authenticate = function() {
        var self = this;

        return function(username, password, cb) {
            self.findByUsername(username, function(err, user) {
                if (err) { return cb(err); }

                if (user) {
                    if(user.isAuthenticated) {
                        return user.authenticate(password, cb);
                    } else {
                        return cb(null, false, { message: options.userEmailUnverifiedError });
                    }
                } else {
                    return cb(null, false, { message: options.incorrectUsernameError });
                }
            });
        }
    };

    schema.statics.serializeUser = function() {
        return function(user, cb) {
            cb(null, user.get(options.usernameField));
        }
    };

    schema.statics.deserializeUser = function() {
        var self = this;

        return function(username, cb) {
            self.findByUsername(username, cb);
        }
    };
    
    schema.statics.register = function(user, password, cb) {
        // Create an instance of this in case user isn't already an instance
        if (!(user instanceof this)) {
            user = new this(user);
        }

        if (!user.get(options.usernameField)) {
            return cb(new BadRequestError(util.format(options.missingUsernameError, options.usernameField)));
        }

        var self = this;
        self.findByUsername(user.get(options.usernameField), function(err, existingUser) {
            if (err) { return cb(err); }
            
            if (existingUser) {
                return cb(new BadRequestError(util.format(options.userExistsError, user.get(options.usernameField))));
            }
            
            user.setPassword(password, function(err, user) {
                if (err) {
                    return cb(err);
                }

                user.setAuthToken(function(err,user) {
                    if (err) {
                        return cb(err);
                    }
                  
                    user.isAuthenticated = false;
                    user.save(function(err) {
                        if (err) {
                            return cb(err);
                        }

                        cb(null, user);
                    });
                });
            });
        });
    };

    schema.statics.verifyEmail = function(authToken, cb) {
        var self = this;
        self.findByAuthToken(authToken, function(err, user) {
            if (err) { return cb(err); }

            if(user) {
                user.isAuthenticated = true;
                user.authToken = '';
                user.save(function(err) {
                    if (err) {
                        return cb(err);
                    }

                    cb(null, user);
                });
            } else {
                return cb(null, false, { message: options.authTokenNotFoundError });
            }
        });
    };

    schema.statics.findByAuthToken = function(authToken, cb) {
        var queryParameters = {};
        
        queryParameters[options.authToken] = authToken;
        
        var query = this.findOne(queryParameters);
        if (options.selectFields) {
            query.select(options.selectFields);
        }

        if (options.populateFields) {
            query.populate(options.populateFields);
        }

        if (cb) {
            query.exec(cb);
        } else {
            return query;
        }
    };

    schema.statics.findByUsername = function(username, cb) {
        var queryParameters = {};
        
        // if specified, convert the username to lowercase
        if (username !== undefined && options.usernameLowerCase) {
            username = username.toLowerCase();
        }
        
        queryParameters[options.usernameField] = username;
        
        var query = this.findOne(queryParameters);
        if (options.selectFields) {
            query.select(options.selectFields);
        }

        if (options.populateFields) {
            query.populate(options.populateFields);
        }

        if (cb) {
            query.exec(cb);
        } else {
            return query;
        }
    };

    schema.statics.createStrategy = function() {
        return new LocalStrategy(options, this.authenticate());
    };
};
