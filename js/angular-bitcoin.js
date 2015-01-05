angular.module('AngularBitcoin', [])

.value('CHAIN_KEY', 'DEMO-4a5e1e4')

// given a key, this creates an object with necessary key info
.factory('BtcObj', function($q, $http, $timeout, BtcUtils, CHAIN_KEY) {
  // different states that requests can be in
  var states = {
    PENDING:          "pending",
    SUCCESS_DATA:     "success_data",
    SUCCESS_NO_DATA:  "success_no_data",
    FAIL:             "fail"
  };

  // obj which holds API interactions
  // each endpoint has 2 attributes:
  //  getUrl function
  //    input single obj, returns url string
  //  processSuccess functions
  //    input response data, returns parsed response
  var types = {
    "utxo": {
      getUrl: function(addr) {
        return "https://api.chain.com/v2/testnet3/addresses/"+addr+"/unspents?api-key-id=" + CHAIN_KEY;
      },
      processSuccess: function(data) {
        return data; 
      }
    },
    "opreturn": {
      getUrl: function(addr) {
        return "https://api.chain.com/v2/testnet3/addresses/"+addr+"/op-returns?api-key-id=" + CHAIN_KEY;
      },
      processSuccess: function(data) {
        return data; 
      }
    }
  };

  // accepts the type, and arguments which that type needs 
  //  eg. type "utxo" requires an address in it's getUrl function
  // returns object which has current state, which will update after request
  // finishes.
  //
  // 1. set state to pending
  // 2. make data request
  // 3. if success, and has data, set data, set state
  // 4. if success, and no data, set state
  // 5. if fails, set state
  function setUp (type, args) {
    var obj = {};
    obj.state = states.PENDING;
    $http.get(types[type].getUrl(args)).then(function(resp) {
      if (resp.data && resp.data.length > 0) {
        obj.state = states.SUCCESS_DATA;
        obj.data = types[type].processSuccess(resp.data);
      } else {
        obj.state = states.SUCCESS_NO_DATA;
      }
    }, function(error) {
      obj.state = states.FAIL;
    });
    return obj;
  }


  return function(opts){
    if (opts.key) {
      this.key = opts.key;
      this.addr = this.key.pub.getAddress(bitcoin.networks.testnet).toString(); 

      // broadcasts an opreturn txn
      this.sendOpReturn = function(message, recipient) {
        var that = this;
        return $q(function(resolve, reject) {

          // add input
          if (!that.utxo.data) {
            return reject("No utxo data");
          }
          var utxo = that.utxo.data.pop();
          var tx = new bitcoin.TransactionBuilder();
          tx.addInput(utxo.transaction_hash, utxo.output_index);

          // create op_return script
          var script = bitcoin.Script.fromASM("OP_RETURN " + BtcUtils.a2hex(message));
          tx.addOutput(script, 0);

          var sat = utxo.value;

          // if there's a recipient, add recipient
          if (recipient) {
            tx.addOutput(that.addr, 1000);
            sat -= 1000;
          }

          // add change
          tx.addOutput(that.addr, sat - 1000);

          tx.sign(0, that.key);
          tx = tx.build();
          console.log(tx);

          // broadcast transaction across network
          $http.post("http://faucet.royalforkblog.com/sendraw", { hex: tx.toHex() }).then(function(resp) {
            that.addUtxo({
              transaction_hash: resp.data.id,
              output_index: 1,
              value: tx.outs[1].value
            });

            that.addOpReturn({
              text: message
            });

            resolve(resp.data);

          }, function(error) {
            alert("There was an error funding your address.  Please refresh and try again. If the problem persists, please email rf@royalforkblog.com");
            console.log(error);
            reject();
          });
            
        });
      }
    }

    if (opts.addr) {
      this.addr = opts.addr;
    }

    if (opts.utxo) {
      // utxo.data is an array of utxo's
      this.utxo = (function(that) {
        return setUp("utxo", that.addr);
      }(this));

      this.addUtxo = function(utxo) {
        this.utxo.state = states.SUCCESS_DATA;
        this.utxo.data = this.utxo.data || [];
        this.utxo.data.push(utxo);
        return this.utxo;
      }
    }

    if (opts.opreturn) {
      // opreturn.data is an array of opreturns
      this.opreturn = (function(that) {
        return setUp("opreturn", that.addr);
      }(this));

      this.addOpReturn = function(txn) {
        this.opreturn.state = states.SUCCESS_DATA;
        this.opreturn.data = this.opreturn.data || [];
        this.opreturn.data.push(txn);
        return this.opreturn;
      }
    }

  }
})

.service('BtcUtils', function() {
  this.getUtxoIndex = function getUtxoIndex (txn, addr) {
    for (var i = 0, l = txn.vout.length; i < l; i ++) {
      var v = txn.vout[i];
      if (v.scriptPubKey.addresses[0] === addr) {
        return v.n; 
      }
    }
  };

  this.hex2a = function (hexx) {
    var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
  };

  this.a2hex = function (str) {
    var arr = [];
    for (var i = 0, l = str.length; i < l; i ++) {
      var hex = Number(str.charCodeAt(i)).toString(16);
      arr.push(hex);
    }
    return arr.join('');
  };
})

// BtcObj can be built with WIF (or addr)
// this service validates the WIF or addr
// if valid, returns a BtcObj
// if invalid, returns undef
// as part of the options, it also includes boolean flags for which attributes it wishes to get asyncronously
//  these flags are: 
//    utxo
//    txns
//    opreturns
.service('BtcObjBuilder', function(BtcObj) {
  this.build = function(opts) {
    if (opts.hasOwnProperty("wif")) {
      // wif is invalid
      if (!opts.wif || opts.wif.length < 51) {
        return null;
      }

      // use the wif to create a btc object
      // bitcoinjs throws error if wif is wrong
      try {
        var key = bitcoin.ECKey.fromWIF(opts.wif);
      } catch (e) {
        // wif is invalid
        return null;
      }

      opts.key = key;
      return new BtcObj(opts);
    }
  }
})

.directive('wifModel', function(BtcObjBuilder) {
  return {
    require: "ngModel",
    scope: {
      wifModel: "="
    },
    link: function (scope, elem, attrs, ctrl) {

      // value can be several types (for now, always WIF)
      // for each type:
      //  validate input
      //  if input is valid, create object, bind to btcModel
      //  if input is invalid, set btcModel object to undefined
      function createBtcObj (value) {
        // scope.btcModel will be null if wif is invalid
        scope.wifModel = BtcObjBuilder.build({
          wif: value,
          utxo: true,
          opreturn: true
        });
        return scope.wifModel;
      }

      // This is a bit of a hack.  I want to create an object based on user
      // input, and bind that object to the btcModel object.  To trigger object
      // creation, we use validation functions which fire whenever the user
      // changes the input.

      // validates value based on user-input
      ctrl.$parsers.unshift(function(value) {
        var model = createBtcObj(value);
        ctrl.$setValidity('wifModel', !!model);
        return model ? value : false;
      });

      // validates value based on programmatic change
      ctrl.$formatters.unshift(function(value) {
        var model = createBtcObj(value);
        ctrl.$setValidity('wifModel', !!model);
        return model ? value : false;
      });
      
    }
  }
})

// iterates through model.utxo.data and calculates total balance
.filter('getBalance', function() {
  return function(input) {
    if (input) {
      var total = 0;
      for (var i = 0, l = input.length; i < l; i ++) {
        var v = input[i];
        total += v.value;
      }
      return total.toBitcoin();
    }
  }
})

// iterates through list of opreturn messages, and returns one prefixed by "p!"
.filter('showBtcPgpMessage', function() {
  return function(input) {
    if (input) {
      for (var i = 0, l = input.length; i < l; i ++) {
        var v = input[i];
        var match = v.text.match(/^p!(.*)$/);
        if (match) {
          return match[1];
        }
      }
      return "(none)";
    }
  }
});
