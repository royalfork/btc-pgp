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
  //    input response data, returns state.SUCCESS_DATA, or state SUCCESS_NO_DATA, and the data
  var types = {
    "utxo": {
      getUrl: function(addr) {
        return "https://api.chain.com/v2/testnet3/addresses/"+addr+"/unspents?api-key-id=" + CHAIN_KEY;
      },
      processSuccess: function(data) {
        return {
          state: data.length > 0 ? states.SUCCESS_DATA : states.SUCCESS_NO_DATA,
          data: data
        }; 
      }
    },
    "opreturn": {
      getUrl: function(addr) {
        return "https://api.chain.com/v2/testnet3/addresses/"+addr+"/op-returns?api-key-id=" + CHAIN_KEY;
      },
      processSuccess: function(data) {
        // opreturn messages store 2 things:
        //  single greetings
        //  array of messages
        // it's possible that neither of these exist
        return {
          state: data.length > 0 ? states.SUCCESS_DATA : states.SUCCESS_NO_DATA,
          data: {
            greeting: BtcUtils.getGreeting(data),
            messages: BtcUtils.getMessages(data)
          }
        }; 
      }
    },
    "txns": {
      getUrl: function(addr) {
        return "https://api.chain.com/v2/testnet3/addresses/"+addr+"/transactions?api-key-id=" + CHAIN_KEY;
      },
      processSuccess: function(data) {
        return {
          state: data.length > 0 ? states.SUCCESS_DATA : states.SUCCESS_NO_DATA,
          data: data
        }; 
      }
    },
    "pubKey": {
      getUrl: function(addr) {
        return "https://api.chain.com/v2/testnet3/addresses/"+addr+"/transactions?api-key-id=" + CHAIN_KEY;
      },
      processSuccess: function(data, addr) {
        // parse list of txns, extract pub key from txn
        for (var i = 0, l = data.length; i < l; i ++) {
          var v = data[i];
          for (var i = 0, l = v.inputs.length; i < l; i ++) {
            if (v.inputs[i].addresses[0] === addr.toString()) {
              return {
                data: v.inputs[i]["script_signature"].split(" ")[1],
                state: states.SUCCESS_DATA
              }
            }
          }
        }

        return {
          state: states.SUCCESS_NO_DATA
        }; 
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
      var resp = types[type].processSuccess(resp.data, args);
      obj.state = resp.state;
      if (resp.data) {
        obj.data = resp.data;
      }
    }, function(error) {
      obj.state = states.FAIL;
    });
    return obj;
  }

  function sendOpReturn (message, recipient) {
    var that = this;
    return $q(function(resolve, reject) {

      // add input
      if (!that.utxo.data) {
        return reject("No utxo data");
      }

      var tx = new bitcoin.TransactionBuilder();

      // add inputs
      var tx_value = 0;
      var needed = recipient ? 2000 : 1000; // txn fee + recipient txn
      for (var i = 0, l = that.utxo.data.length; i < l; i ++) {
        var utxo = that.utxo.data[i];  
        tx.addInput(utxo.transaction_hash, utxo.output_index);
        tx_value += utxo.value;
        if (tx_value >= needed) {
          break;
        }
      }

      // create op_return script
      var script = bitcoin.Script.fromASM("OP_RETURN " + BtcUtils.a2hex(message));
      tx.addOutput(script, 0);

      // if there's a recipient, add recipient
      if (recipient) {
        tx.addOutput(that.addr, 1000);
      }

      // add change
      tx.addOutput(that.addr, tx_value - needed);

      // sign inputs
      for (var i = 0, l = tx.tx.ins.length; i < l; i ++) {
        tx.sign(i, that.key);
      }

      // build txn (this throws exceptions if there are issues)
      try {
        tx = tx.build();
        console.log(tx);
      } catch (e) {
        alert("There was a problem broadcasting this message on the blockchain.  Please try again, or file a bug report.");
        reject();
      }

      // broadcast transaction across network
      $http.post("http://faucet.royalforkblog.com/sendraw", { hex: tx.toHex() }).then(function(resp) {
        that.addUtxo({
          transaction_hash: resp.data.id,
          output_index: 1,
          value: tx.outs[1].value
        });

        resolve(resp.data);

      }, function(error) {
        alert("There was an error funding your address.  Please refresh and try again. If the problem persists, please email rf@royalforkblog.com");
        console.log(error);
        reject();
      });
        
    });
  }


  return function(opts){
    if (opts.key) {
      this.key = opts.key;
      this.addr = this.key.pub.getAddress(bitcoin.networks.testnet).toString(); 
      this.pubKey = this.key.pub.toHex();

      // broadcasts an opreturn txn
      this.sendOpReturn = sendOpReturn;
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

    if (opts.txns) {
      this.txns = (function(that) {
        return setUp('txns', that.addr);
      }(this));
    }

    if (opts.pubKey) {
      this.pubKey = (function(that) {
        return setUp('pubKey', that.addr);
      }(this));
    }

  }
})

.service('BtcUtils', function() {



  this.getGreeting = function(opreturnArray) {
    if (opreturnArray) {
      for (var i = 0, l = opreturnArray.length; i < l; i ++) {
        var v = opreturnArray[i];
        var match = v.text.match(/^p!(.*)$/);
        if (match) {
          return match[1];
        }
      }
    }
  }

  this.getMessages = function(opreturnArray) {
    if (opreturnArray) {
      var msgs = [];
      for (var i = 0, l = opreturnArray.length; i < l; i ++) {
        var v = opreturnArray[i];
        var match = v.text.match(/^m!(.*)$/);
        if (match) {
          msgs.push(v);
        }
      }
      return msgs;
    }
  }

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
// this service validates the WIF of addr
// if valid, returns a BtcObj
// if invalid, returns undef
.service('BtcObjBuilder', function(BtcObj) {
  // value can be several types
  // for each type:
  //  validate input
  //  if input is valid, create object, bind to btcModel
  //  if input is invalid, set btcModel object to undefined
  this.createBtcObj = function (value, type) {
    var model;
    switch (type) {
      case 'wif':
        // scope.btcModel will be null if wif is invalid
        model = this.build({
          wif: value,
          utxo: true,
          opreturn: true
        });
        break;
      case 'addr':
        // scope.btcModel will be null if wif is invalid
        model = this.build({
          addr: value,
          pubKey: true
        });
        break;
      default: 
        throw new Error("Type not supported");
    }
    return model;
  }

  this.build = function(opts) {
    // validates WIF
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
    }

    // validates address
    if (opts.hasOwnProperty('addr')) {
      // validate the address
      if (!opts.addr || opts.addr.length < 26 || opts.addr.length > 34) {
        return null;
      }
      try {
        var addr = bitcoin.Address.fromBase58Check(opts.addr);
      } catch (error) {
        return null
      }
      opts.addr = addr;
    }

    return new BtcObj(opts);
  }
})

.directive('btcType', function(BtcObjBuilder) {
  return {
    require: "ngModel",
    scope: {
      btcModel: "="
    },
    link: function (scope, elem, attrs, ctrl) {

      // This is a bit of a hack.  I want to create an object based on user
      // input, and bind that object to the btcModel object.  To trigger object
      // creation, we use validation functions which fire whenever the user
      // changes the input.

      // validates value based on user-input
      ctrl.$parsers.unshift(function(value) {
        scope.btcModel = BtcObjBuilder.createBtcObj(value, attrs.btcType);
        ctrl.$setValidity('btcModel', !!scope.btcModel);
        return !!scope.btcModel ? value : false;
      });

      // validates value based on programmatic change
      ctrl.$formatters.unshift(function(value) {
        scope.btcModel = BtcObjBuilder.createBtcObj(value, attrs.btcType);
        ctrl.$setValidity('btcModel', !!scope.btcModel);
        return !!scope.btcModel ? value : false;
      });
      
    }
  }
})

.directive('btcAddress', function(BtcObjBuilder) {
  return {
    scope: {
      btcModel: "="
    },
    link: function (scope, elem, attrs, ctrl) {

      // watches inner html and sets btcModel obj when it changes
      scope.$watch(function() {
        return elem.html();
      }, function(newVal, oldVal) {
        scope.btcModel = BtcObjBuilder.build({
          addr: newVal,
          opreturn: true
        });
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
