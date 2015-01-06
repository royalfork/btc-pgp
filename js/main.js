var app = angular.module('app', ['ngCookies', 'AngularBitcoin', 'AngularPgp', 'Utils']);

Number.prototype.toSatoshi = function() {
    if (isNaN(this)) return NaN;
    if (this === 0) return 0;
    var str = this.toString();
    var sign = (str.indexOf('-') === 0) ? "-" : "";
    str = str.replace(/^-/, '');
    if (str.indexOf('e') >=0) {
        return parseInt(sign + str.replace(".", "").replace(/e-8/, "").replace(/e-7/, "0"), 10);
    } else {
        if (!(/\./).test(str)) str += ".0";
        var parts = str.split(".");
        str = parts[0] + "." + parts[1].slice(0,8);
        while (!(/\.[0-9]{8}/).test(str)) {
            str += "0";
        }
        return parseInt(sign + str.replace(".", "").replace(/^0+/, ""), 10);
    }
};

Number.prototype.toBitcoinString = function() {
    if (isNaN(this)) return NaN;
    if (this === 0) return 0;
    var str = parseInt(this, 10).toString();
    var sign = (str.indexOf('-') === 0) ? "-" : "";
    str = str.replace(/^-/, '');
    var lengthTester = (/[0-9]{8}/);
    while (!lengthTester.test(str)) {
        str = "0" + str;
    }
    str = str.slice(0, str.length - 8) + "." + str.slice(str.length - 8);
    if (str[0] === '.') str = '0' + str;
    return sign + str;
};

Number.prototype.toBitcoin = function() {
    return parseFloat(this.toBitcoinString());
};

app.controller('BtcPgp2', function($scope, $q, $http, $timeout, BtcUtils) {

  $scope.createRandom = function() {
    $scope.privateWif = bitcoin.ECKey.makeRandom().toWIF();
  };

  // this should probably go into angular-bitcoin module
  $scope.fund = function(amount, addr) {
    return $q(function(resolve, reject) {
      $http.post("http://faucet.royalforkblog.com", { address: addr, amount: amount.toSatoshi(), verbose: true }).then(function (resp) {
        var utxo_idx = BtcUtils.getUtxoIndex(resp.data.txn, addr);
        $scope.key.addUtxo({
          transaction_hash: resp.data.txn.txid,
          output_index: utxo_idx,
          value: resp.data.txn.vout[utxo_idx].value.toSatoshi()
        });
        resolve();
      }, function(error) {
        alert("There was an error funding your address.  Please refresh and try again. If the problem persists, please email rf@royalforkblog.com");
        resolve();
      });
    });
  };

  $scope.broadcast = function(key, message, recipient) {
    return $q(function(resolve, reject) {
      if (!message) {
        alert("Please insert a message");
        reject();
      }

      if (message.length > 40) {
        alert("Message is too long");
        reject();
      }

      // broadcast the message
      key.sendOpReturn(message, recipient).then(function(resp) {
        resolve(resp);
      }, function (err) {
        console.log(err);
        reject();
      });
      
    });
  };


  $scope.debug = function() {
    $scope.key.utxo.state = "pending";
  }
  $scope.debug2 = function() {
    $scope.key.utxo.state = "success_no_data";
  }
  $scope.debug3 = function() {
    $scope.key.utxo.state = "success_data";
  }

});

app.controller('EncryptCtrl', function($scope, $cookies, $q, $http, $timeout) {

  $scope.debug = function() {
    console.log($scope);
    debugger;
  }

  $scope.$watch('recipient', function(newVal, oldVal) {
    if (newVal && newVal.length > 26) {
      //
      var ERROR = {
        addr_invalid: {
          message: "Not a valid bitcoin address.",
          class: "danger"
        }
      }

      // use promise to check whether this is valid BTC address
      // creating an Addresss object will throw an error if address is incorrect
      var createAddressObject = function(addr) {
        return $q(function(resolve, reject) {
          try {
            var a = bitcoin.Address.fromBase58Check(addr);
            resolve(a);
          } catch (error) {
            reject({});
          }
        });
      }

      var getPkFromTxnArr = function (addr, result) {
        for (var i = 0, l = result.length; i < l; i ++) {
          var v = result[i];
          for (var i = 0, l = v.inputs.length; i < l; i ++) {
            if (v.inputs[i].addresses[0] === addr) {
              return v.inputs[i]["script_signature"].split(" ")[1]
            }
          }
        }
        throw new Error();
      }

      createAddressObject(newVal).then(function(addr) {
        $scope.recipientMessage = null;

        // add loading indicator
        $scope.fetchingRecipientPk = true;

        var network = {
         111: "testnet3"
        };
        
        $http.get("https://api.chain.com/v2/"+network[addr.version]+"/addresses/"+addr.toString()+"/transactions?api-key-id=82cb03d6a45af7a0d4bb38e74bf519e5").success(function(resp) {
          $scope.fetchingRecipientPk = false;
          if (resp.length === 0) {
            $scope.recipientMessage = {
              message: "This address has never created a transaction.  Transaction reveal public keys, and public keys are necessary for message encryption.",
              class: "warning"
            };
          } else {
            try {
              $scope.pub_key = getPkFromTxnArr(addr.toString(), resp);
              // remove loading indicator
              $scope.recipientMessage = {
                message: "Successfully fetched public key.",
                class: "success"
              };
            } catch (e) {
              $scope.recipientMessage = {
                message: "This address has never created a transaction.  Transaction reveal public keys, and public keys are necessary for message encryption.",
                class: "warning"
              };
            }
          }
        }).error(function(error) {
          $scope.fetchingRecipientPk = false;
          $scope.recipientMessage = {
            message: "Network error.  Please try again later.  If problem persists, please email rf@royalforkblog.com",
            class: "danger"
          };
        });
      }, function(error) {
        $scope.recipientMessage = {
          message: "Not a valid bitcoin address.",
          class: "danger"
        };
      });

    } else {
      $scope.recipientMessage = null;
    }
  });

  $scope.pub_key = "03a9f527f3447228ae9a58e97dac0f5768fe87d8c3a4955c2666b92ecb87226497";
  $scope.message_to_enc = "testing";

  //$scope.encrypt = function(messageObj) {
    //return messageObj.encrypt();
  //}
  //$scope.encrypt = function(message, pub_key) {
    //return $q(function(resolve, reject) {
      //var pgpKey = openpgp.key.generateEccPublic({pub: pub_key, date: new Date(1225566993000)});
      //openpgp.encryptMessage(pgpKey, message).then(function(msg_enc) {
        //$scope.encryptedMessage = msg_enc;
        //resolve();
      //}, function(error) {
        //console.log(error);
        //reject();
      //});
    //});
  //};


  //$scope.encryptedMessage = "-----BEGIN PGP MESSAGE-----\n" +
  //"Version: OpenPGP.js v0.8.1ecc\n" +
  //"Comment: http://royalforkblog.com\n" +
  //"\n" +
  //"wX4Dkx39yzzME0oSAggEce6Ygbd+nx13vZ90yaJEPcS53S6DIUzqwhmG6Cs\n" +
  //"bSPIYJyGprl5FEnf9jlsi5DXFSY2IqJIMVDhxqbb6ZAjLDDRHe7vsYVdkFj\n" +
  //"M1S3RJfjLQ3DolNtOt4zEvi2hRez7gX9DE5xYlGjMiuHY+N/fo7SPwGWuyY\n" +
  //"tbxbRH0j5M6sr3m2I7AACk0tXSNf2dzAzdmI3ZbeLaDR9fBFdgexbNVmRsx\n" +
  //"ykut7O7seSMFqmJE+w==\n" +
  //"=+WqT\n" +
  //"-----END PGP MESSAGE-----";

  //$scope.shortUrl = "http://rfrk.co/Mw==";

  $scope.upload = function(message) {
    return $q(function(resolve, reject) {
      $http.post("https://api.github.com/gists", { files: {"message": { content: message}}}).then(function(gistResp) {
        return $http.post("http://rfrk.co/api/v1/shorten", { long_url: gistResp.data.files.message.raw_url});
      }).then(function(shortenResp) {
        $scope.shortUrl = shortenResp.data.short_url;
        return $scope.broadcast($scope.key, "m!" + $scope.shortUrl, $scope.recipient);
      }).then(function(broadcastResp) {
        console.log("DONE");
        resolve();
      });
    });
  };
});

