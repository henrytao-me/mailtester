var fs = require('fs');
var path = require('path');
var q = require('q');
var _ = require('lodash');

var child = require('child_process');

var log = function() {
  // console.log.apply(console, arguments);
};

var mailtester = function(email) {
  // split email & domain
  var tmp = email.split('@');
  var name = tmp[0];
  var domain = tmp[1];

  return q().then(function() {
    // check dns
    log('-----------------------------');
    log('------ dns lookup: ' + email);

    var deferred = q.defer();
    var dns = require('dns');

    dns.resolve(domain, 'MX', function(e, addresses) {
      if (e) {
        deferred.reject({
          error: 'dns not found'
        });
        return;
      }

      // get address with highest priority
      var res = null;
      _.each(addresses, function(address) {
        if (!res) {
          res = address
        }
        if (res.priority > address.priority) {
          res = address;
        }
      });
      try {
      	deferred.resolve(res.exchange);	
      } catch(ex){
      	deferred.reject({
      		error: 'unknow'
      	});
      }
    });
    return deferred.promise;

  }).then(function(address) {
    // telnet
    var deferred = q.defer();

    log('------ telnet to: ' + address);
    var telnet = child.spawn('telnet', [address, 25]);
    telnet.stdout.setEncoding('utf8');
    telnet.stderr.setEncoding('utf8');
    telnet.stdin.setEncoding('utf8');

    var timeoutId = setTimeout(function(){
	  	deferred.reject({
	  		error: 'timeout'
	  	});
	  	telnet.kill();
	  }, 5000);

    var count = 0;

    telnet.stdout.on('data', function(data) {
      count += 1;
      if (data.match(/550-|550|5[0-9][0-9]\ /)) {
        log('> ERROR: ' + data);
        telnet.kill();
        return deferred.resolve(false);

      } else if (data.match(/2[0-9]{2}/)) {
        log('> OK: ' + data);

      } else {
        log('> INFO: ' + data);
      }
      if (count === 4) {
        telnet.kill();
        deferred.resolve(true);
      }
    });

    telnet.stderr.on('data', function(data) {
      telnet.kill();
      deferred.reject({
        error: 'stderr'
      });
    });

    log('------ ' + 'HELO');
    telnet.stdin.write('HELO' + '\n');

    log('------ ' + 'mail from: <hi@mailtester.com>');
    telnet.stdin.write('mail from: <hi@mailtester.com>' + '\n');

    log('------ ' + 'rcpt to: <' + email + '>');
    telnet.stdin.write('rcpt to: <' + email + '>' + '\n');

    return deferred.promise;

  }).catch(function() {
    return false;
  });
};

// mailtester('zokhummawia@gmsil.com').then(function(res) {
//   console.log('resssssssssssssssss', res);
// });

// read file
var filename = 'data.csv';
fs.readFile(path.resolve(__dirname, '..', 'test', filename), function(err, data) {
  if (err) {
    throw err;
  }
  var list = data.toString().split(/\r?\n/);
  var index = 0;

  var func = function() {
    if (list.length > 0) {
      var email = list.shift();
      mailtester(email).then(function(res) {
      	index += 1;
        console.log(index, email, res);
        fs.open(path.resolve(__dirname, '..', 'test', 'output.' + filename), 'a', 0666, function(err, fd) {
          fs.writeSync(fd, email + ',' + (res === true ? 'valid' : 'invalid') + "\n", null, undefined, function(err, written) {});
          func();
        });
      });
    }
  };
  func();
});

