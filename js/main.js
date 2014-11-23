var app = angular.module('app', ['ngCookies']);

app.controller('BtcPgp', function($scope, $cookies, $q, $timeout) {

  $scope.bitcoin = bitcoin;

  // read from cookies, if we have them
  if ($cookies.passphrase) {
    // because passphrase is watched, this will set the key, and the wif automatically
    $scope.passphrase = $cookies.passphrase;
  } else if ($cookies.wif) {
    $scope.wif = $cookies.wif; 
    $scope.key = bitcoin.ECKey.fromWIF($scope.wif);
  }

  $scope.spender = 50;

  $scope.createRandom = function() {
    // clear passphrase
    if ($scope.passphrase) {
      $scope.passphrase = "";
    }
    $scope.key = bitcoin.ECKey.makeRandom();
  };

  $scope.$watch('passphrase', function(val) {
    console.log("Passphrase changed to: " + val);
    if (val) {
      var hash = bitcoin.crypto.sha256(val);
      $scope.key = bitcoin.ECKey.fromUint8Arr(true, hash);
      $scope.key.passphrase = val;
    }
  });

  $scope.manualWIF = function(val) {
    $scope.passphrase = "";
    if (val) {
      try {
        $scope.key = bitcoin.ECKey.fromWIF(val);
      } catch (e) {
        /* handle error */
        console.log("Wif is wrong");
      }
    } else {
      $scope.key = "";
    }
  };

  $scope.$watch('key', function(val) {
    console.log("KEY CHANGED TO: " + val);
    if (val) {
      $scope.wif = $scope.key.toWIF();
    }
  });

  $scope.save = function() {
    $cookies.passphrase = $scope.passphrase;
    $cookies.wif = $scope.wif;
    alert("Your bitcoin keys have been saved as cookies.");
  }

  $scope.range2Btc = function(range) {
    return parseFloat((range * .001).toPrecision(2));   
  }

  $scope.fund = function(amount, addr) {
    //freeze address input fields
    //var satoshis = parseInt((amount * Math.pow(10, 8)).toPrecision(3));

    $scope.fundStatus = "Requesting BTC...";
    $scope.progress = 10;
    // XXX this needs to use promise
    //startWebsocket(addr, function(resp) {
      //$scope.fundStatus = "Transaction complete";
      //debugger;
    //});

    // XXX this needs to use angular http service
    //$.post("http://faucet.xeno-genesis.com/request", { address: addr, amount: amount }, function() {
      //$scope.fundStatus = "Request sent successfully.  Listening on blockchain (usually takes around 5 seconds)...";
      //console.log(arguments);
    //});

    testWebsocket(addr).then(function(resp) {
      //$scope.fundStatus = "Complete";
      // we have prev txn, set utxo
      console.log(resp);
      $scope.progress = 90;
    });
  }

  function testWebsocket(address) {
    var mock = '{"transaction_hash":"747b64808595329ef48eb75924e2d9f458215e3b9ffad80721a5dd756a558a59","output_index":0,"value":2900000,"addresses":["mvDbXbTSUwi958YjsH6oY1YMd6udps37fV"],"script":"OP_DUP OP_HASH160 a1417af9cebb676cf858f9c603a258ed5ec6208c OP_EQUALVERIFY OP_CHECKSIG","script_hex":"76a914a1417af9cebb676cf858f9c603a258ed5ec6208c88ac","script_type":"pubkeyhash","required_signatures":1,"spent":false}';
    mock = JSON.parse(mock);
    return $q(function(resolve, reject) {
      $timeout(function() {
        resolve(mock);
      }, 500);
    })
  }

  function startWebsocket(address, cb) {
    var conn = new WebSocket("wss://ws.chain.com/v2/notifications");
    conn.onopen = function (ev) {
      var req = {type: "new-transaction", block_chain: "testnet3"};
      conn.send(JSON.stringify(req));
    };
    conn.onmessage = function (ev) {
      var x = JSON.parse(ev.data);
      console.log(x);
      if (x.payload.transaction.outputs) {
        for (var i = 0, l = x.payload.transaction.outputs.length; i < l; i ++) {
          var v = x.payload.transaction.outputs[i];
          if (v.addresses) {
            for (var j = 0, k = v.addresses.length; j < k; j ++) {
              var a = v.addresses[j];
              if (a === address) {
                console.log("Transaction found: " + v.transaction_hash);
                conn.close();
                cb(v);
              }
            }
          }
        }
      }
    };
  }



});

