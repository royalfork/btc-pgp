var app = angular.module('app', ['ngCookies']);

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


app.controller('BtcPgp', function($scope, $cookies, $q, $http, $timeout) {

  $scope.bitcoin = bitcoin;

  // read from cookies, if we have them
  if ($cookies.passphrase) {
    // because passphrase is watched, this will set the key, and the wif automatically
    $scope.passphrase = $cookies.passphrase;
  } else if ($cookies.wif) {
    $scope.wif = $cookies.wif; 
    $scope.key = bitcoin.ECKey.fromWIF($scope.wif);
  }

  $scope.createRandom = function() {
    // clear passphrase
    if ($scope.passphrase) {
      $scope.passphrase = "";
    }
    $scope.key = bitcoin.ECKey.makeRandom();
    console.log($scope.addr($scope.key).length);
  };

  $scope.addr =  function (key) {
    if (key) {
      return key.pub.getAddress(bitcoin.networks.testnet).toString(); 
    }
  }

  $scope.$watch('passphrase', function(val) {
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
    if (val) {
      $scope.wif = $scope.key.toWIF();
    }
  });

  $scope.save = function() {
    if ($scope.passphrase) {
      $cookies.passphrase = $scope.passphrase;
    }
    $cookies.wif = $scope.wif;
    alert("WIF " + $scope.wif + " has been saved as a cookie.");
  }

  // parse verose raw transaction from bitcoind and return utxo index of addr
  function getUtxoIndex (txn, addr) {
    for (var i = 0, l = txn.vout.length; i < l; i ++) {
      var v = txn.vout[i];
      if (v.scriptPubKey.addresses[0] === addr) {
        return v.n; 
      }
    }
  }

  $scope.fund = function(amount, addr) {
    return $q(function(resolve, reject) {
      $http.post("http://localhost:4444", { address: addr, amount: amount.toSatoshi(), verbose: true }).then(function (resp) {
        $scope.utxo = resp.data.txn; 
        resolve();
      }, function(error) {
        alert("There was an error funding your address.  Please refresh and try again. If the problem persists, please email rf@royalforkblog.com");
        resolve();
      });
    });
  };

  $scope.broadcast = function(key, utxo, message) {
    return $q(function(resolve, reject) {
      if (message.length > 40) {
        resolve();
        return alert("Message is too long.");
      }

      // create message
      var addr = key.pub.getAddress(bitcoin.networks.testnet).toString();
      var idx = getUtxoIndex(utxo, addr);
      // add input
      var tx = new bitcoin.TransactionBuilder();
      tx.addInput(utxo.txid, idx);

      // create op_return script
      var script = bitcoin.Script.fromASM("OP_RETURN " + a2hex("mx!"+message));
      tx.addOutput(script, 0);

      // add change
      tx.addOutput(addr, utxo.vout[idx].value.toSatoshi() - 1000);

      tx.sign(0, key);
      tx = tx.build();

      // broadcast transaction across network
      $http.post("http://localhost:4444/sendraw", { hex: tx.toHex() }).then(function(resp) {
        $scope.fundTxn = resp.data;
        resolve();
      }, function(error) {
        alert("There was an error funding your address.  Please refresh and try again. If the problem persists, please email rf@royalforkblog.com");
        console.log(error);
        resolve();
      });
    })
  };

  function hex2a(hexx) {
    var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
  }

  function a2hex(str) {
    var arr = [];
    for (var i = 0, l = str.length; i < l; i ++) {
      var hex = Number(str.charCodeAt(i)).toString(16);
      arr.push(hex);
    }
    return arr.join('');
  }

});

app.directive('statusButton', function($q) {
    return {
      restrict: 'AEC',
      scope: {click:'&?'},
      bindToController: true,
      controllerAs: 'ctrl',
      template: "<div class=\"ctrl.class\" ng-class=\"{ 'loading': ctrl.state==='loading', 'complete': ctrl.state==='complete' }\"><input class=\"btn\" type=\"button\" ng-value=\"ctrl.value\" ng-click=\"ctrl.action()\"></div>",
      transclude: true,
      controller: function($scope, $element, $attrs) {
        var ctrl = this;
        ctrl.value = $attrs.value;
        var fn = ctrl.click || function() { return $q.when('done')};
        this.action = function() {
          ctrl.state = 'loading';
          fn().then(function(res) {
            ctrl.state = 'complete';
          });
        }
      }
    }
  });
