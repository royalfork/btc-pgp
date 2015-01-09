angular.module('AngularPgp', [])

.factory('EncMessageObj', function($q) {
  return function(asciiarmor) {
    this.asciiarmor = asciiarmor;
    this.decrypt = function(keyObj) {
      var that = this;
      return $q(function(resolve, reject) {
        // read ascii armor into openpgpjs message
        try {
          var msg = openpgp.message.readArmored(that.asciiarmor);
        } catch (e) {
          /* handle error */
          alert("Please enter a valid PGP message.");
          return reject();
        }
        // generate openpgpjs private key from wif
        openpgp.generateKeyPair({keyType: 18, curve: "secp256k1", priv: keyObj.key.d.toHex(), date: new Date(1225566993000)}).then(function(key) {
          // decrypt openpgpjs message w/ openpgpjs private key
          return openpgp.decryptMessage(key.key, msg);
        }).then(function(pt) {
          // set decryption message to plain text
          that.message = pt;
          resolve();
        }, function() {
          reject();
        });
      })
    }
  }
})

.factory('MessageObj', function($q, $http) {
  return function (message) {
    this.message = message; 
    this.encrypt = function(pub_key) {
      var that = this;
      return $q(function(resolve, reject) {
        var pgpKey = openpgp.key.generateEccPublic({pub: pub_key, date: new Date(1225566993000)});
        openpgp.encryptMessage(pgpKey, that.message).then(function(asciiarmor) {
          that.asciiarmor = asciiarmor;
          resolve();
        }, function(error) {
          console.log(error);
          reject();
        });
      });
    };
    // uploads encrypted message to github gists
    // shortens gist url
    // broadcasts shortened gist url as op return to recipient address
    this.uploadBroadcast = function(key, addrObj) {
      var that = this;
      return $q(function(resolve, reject) {
        $http.post("https://api.github.com/gists", { files: {"message": { content: that.asciiarmor}}}).then(function(gistResp) {
          return $http.post("http://rfrk.co/api/v1/shorten", { long_url: gistResp.data.files.message.raw_url});
        }).then(function(shortenResp) {
          that.shortUrl = shortenResp.data.short_url;
          return key.sendOpReturn("m!" + that.shortUrl, addrObj.addr.toString());
        }).then(function(broadcastResp) {
          that.uploadTxid = broadcastResp.id;
          resolve();
        });
      });
    }
  }
})

.directive('messageModel', function(MessageObj, EncMessageObj) {
  return {
    require: "ngModel",
    scope: {
      messageModel: "="
    },
    link: function (scope, elem, attrs, ctrl) {
      var enc;
      if (attrs.hasOwnProperty("encrypted")) {
        enc = true; 
      }
      
      ctrl.$parsers.unshift(function(value) {
        if (enc) {
          scope.messageModel = new EncMessageObj(value);
        } else {
          scope.messageModel = new MessageObj(value);
        }
        return value;
      });

      // validates value based on programmatic change
      ctrl.$formatters.unshift(function(value) {
        if (enc) {
          scope.messageModel = new EncMessageObj(value);
        } else {
          scope.messageModel = new MessageObj(value);
        }
        return value;
      });
    }
  }
});
