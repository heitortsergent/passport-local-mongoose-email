var passport = require('passport');
var Account = require('./models/account');
var sendgrid = require('sendgrid')(process.env.SENDGRID_USERNAME, process.env.SENDGRID_PASSWORD);

module.exports = function (app) {
    
  app.get('/', function (req, res) {
    res.render('index', { user : req.user });
  });

  app.get('/register', function(req, res) {
    res.render('register', { });
  });

//register email
  app.post('/register', function(req, res) {
    Account.register(new Account({ email : req.body.email }), req.body.password, function(err, account) {
      if (err) {
        return res.render("register", {info: "Sorry. That username already exists. Try again."});
      }

      //send email verification
      var authenticationURL = 'http://localhost:3000/verify?authToken=' + account.authToken;
      sendgrid.send({
        to:       account.email,
        from:     'emailauth@yourdomain.com',
        subject:  'Confirm your email',
        html:     '<a target=_blank href=\"' + authenticationURL + '\">Confirm your email</a>'
        }, function(err, json) {
        if (err) { return console.error(err); }

        res.redirect('/email-verification');
      });
    });
  });

  app.get('/email-verification', function(req, res) {
    res.render('email-verification', {title: 'Email verification sent!'})
  });

  app.get('/verify', function(req, res) {
      Account.verifyEmail(req.query.authToken, function(err, existingAuthToken) {
        if(err) console.log('err:', err);

        res.render('email-verification', { title : 'Email verified succesfully!' });
      });
  });

  app.get('/login', function(req, res) {
    res.render('login', { user : req.user });
  });
  
  app.get('/unauthorized', function(req, res) {
    res.render('index', { info : "Unauthorized" });
  });

  //login needs to check for verified token, before letting the user log in
  app.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/unauthorized'
  }));

  app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
  });

  app.get('/ping', function(req, res){
    res.send("pong!", 200);
  });
  
};
