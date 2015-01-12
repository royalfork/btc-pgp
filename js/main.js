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

app.controller('BtcPgp2', function($scope, $rootScope, $q, $http, $timeout, BtcUtils) {

  $scope.changeTab = function() {
    $('#encrypt').tab('show');
  }


  $scope.debug = function() {
    console.log($scope);
    debugger;
  }

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

  $scope.decrypt = function(message) {
    $rootScope.$broadcast('decrypt', message);
  };

});

app.controller('EncryptCtrl', function($scope, $cookies, $q, $http, $timeout) {

  $scope.debug = function() {
    console.log($scope);
    debugger;
  }

  $scope.recipientAddrMsgs = {
    "success_no_data": {
      message: "This address has never created a transaction.  Transactions reveal public keys, and public keys are necessary for message encryption.",
      class: "warning"
    },
    "success_data": {
      message: "Successfully fetched public key.",
      class: "success"
    }
  }

  $scope.$watch('recipient', function(newVal, oldVal) {
    if ($scope.messageObj) {
      $scope.messageObj.asciiarmor = "";
    }
  });

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

app.controller('DecryptCtrl', function($scope, $rootScope, $http, EncMessageObj) {

  $scope.debug = function() {
    console.log($scope);
    debugger;
  }

  $rootScope.$on('decrypt', function(evt, msg) {
    $('#decrypt_tab').tab('show');

    // create blank EncMessageObj
    var obj = new EncMessageObj();
    $scope.decMessage = obj;
    obj.sender = msg.sender_addresses[0];

    var url_match = msg.text.match(/^m\!(.*)$/);
    if (url_match) {
      $scope.messageLoading = true;
      $http.get(url_match[1]).then(function(resp) {
        $scope.messageLoading = false;
        obj.asciiarmor = resp.data;
        $scope.message_to_dec = resp.data;
      }, function(err) {
        $scope.messageLoading = false;
        alert("Unfortunately, we can't fetch your message.");
      });
    } else {
      alert("Unfortunately, we can't fetch your message.");
    }
  });
});

