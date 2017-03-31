;(function () {

  var SERVER_N = 'server:';
  var SERVER_ID = 0;

  var YES = 'YES';
  var NO  = 'NO';

  var GENERATION_TIME = 500;
  var HENDLER_TIME    = GENERATION_TIME

  var MESSAGE      = 'message:';
  var IS_PROCESSED = 'isProcessed';
  var IS_GENERATOR = 'isGenerator';

  var GENERATE_MSG_ID   = 'generateMsgId';
  var LAST_HEND_MSG_ID  = 'lastMsgId';

  var LOG = 'logs:errors';


  var redis  = require('redis');
  var client = redis.createClient();

  client.on("error", function (err) {
    console.log( "Error " + err );
  });

  client.on('connect', function() {
    if (process.argv.length == 3 && process.argv[2] == 'getErrors') {
      getErrors();
    } else {
      setServerInfo();
    }
  });


  function setServerInfo() {
    client.incr('serverId', function(err, id) {
      SERVER_N += id;
      SERVER_ID = id;

      console.log( 'RUN: ' + SERVER_N );

      var value = (id == 1 ? YES : NO);
      client.hmset(SERVER_N, [IS_GENERATOR, value], function() {
        getServerInfo();
      });

    });
  }


  //=> SERVER_N: {}
  function getServerInfo() {
    client.hgetall(SERVER_N, function(err, server) {

      if (server[IS_GENERATOR] === YES) {
        console.log( SERVER_N, 'IS A GENERATOR!' );
        clearInterval( hendler.timerId );

        generator();

      } else {
        console.log(SERVER_N, 'IS A HANDLER!' );
        clearInterval( generator.timerId );

        hendler();
      }

    });
  }

  //=> message:N {}
  function generator() {
    client.incr(GENERATE_MSG_ID, function(err, i) {

      this.timerId = setInterval(function(){
        var key = MESSAGE + i;
        var msg = getMessage();
        client.hmset(key, 'msg', msg, IS_PROCESSED, NO);

        client.set(GENERATE_MSG_ID, i++);

        console.log(key);
      }, GENERATION_TIME);
    });

    //=> int
    function getMessage() {
      this.cnt = this.cnt || 0;
      return this.cnt++;
    }
  };



  var hendlerCnt = 1;
  var hendlerOldKey = MESSAGE + 1;

  client.incr( LAST_HEND_MSG_ID );

  function hendler() {
    var that = this;

    that.timerId = setInterval(function() {
      client.get(LAST_HEND_MSG_ID, function(err, i){

        client.get(GENERATE_MSG_ID, function(err, gi) {
          if (i - gi > 1) {
            client.decr(LAST_HEND_MSG_ID);
          }
        });

        var key = MESSAGE + i;
        if (hendlerCnt > 1) { key = hendlerOldKey};

        client.hgetall(key, function(err, message) {

          if (!message){
            hendlerOldKey = hendlerOldKey || key;

            if (hendlerCnt < SERVER_ID){
              clearInterval(that.timerId);
              setTimeout(hendler, GENERATION_TIME);

              hendlerCnt++;
              return;
            }

            clearInterval(that.timerId);

            client.hmset(SERVER_N, IS_GENERATOR, YES, function() {
              getServerInfo();
            });

              return;
          }

          hendlerCnt = 1;
          hendlerOldKey = '';

          client.incr( LAST_HEND_MSG_ID );

          if (message && message[IS_PROCESSED] === YES) return;

          client.hmset(key, IS_PROCESSED, YES);

          eventHandler( message['msg'], function(err, msg) {
            if (err)
              client.lpush(LOG, msg);

            console.log(key, 'processed!');
          });
        });

      });
    }, HENDLER_TIME);

  }


  // Приложение, получая сообщение, передаёт его в данную функцию:
  function eventHandler(msg, callback) {

    function onComplete(){
      var error = Math.random() > 0.85;
      callback(error, msg);
    }

    // processing takes time...
    setTimeout(onComplete, Math.floor(Math.random()*1000));
  }

  // Get errors messages.
  function getErrors() {
    client.lrange(LOG, 0, -1, function (err, doc) {
      console.log('SHOW LOG BY ERRORS:');

      doc.forEach(function (el) {
        console.log(el);
      });

      resset();
    });
  }


  function resset(){
    client.del(LOG);

    // Clear servers info.
    client.get('serverId', function(err, cnt) {

      for (var i = 1; i < cnt; i++){
        client.del('server:' + i);
      }

      client.del('serverId');
    });

    // Clear messages.
    client.get(GENERATE_MSG_ID, function(err, cnt) {
      for (var i = 1; i < cnt; i++){
        client.del(MESSAGE + i);
      }

      client.del(GENERATE_MSG_ID);
      client.del(LAST_HEND_MSG_ID);

      client.quit();
    });

    console.log('Resset!');
  }

})()

