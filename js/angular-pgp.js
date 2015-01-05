angular.module('AngularPgp', [])

.factory('MessageObj', function($q) {
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
    this.uploadBroadcast = function(key, addr) {
      var that = this;
      that.upload = {
        state: "pending"
      };

      // do upload things
      
    }
  }
})

.directive('messageModel', function(MessageObj) {
  return {
    require: "ngModel",
    scope: {
      messageModel: "="
    },
    link: function (scope, elem, attrs, ctrl) {

      ctrl.$parsers.unshift(function(value) {
        scope.messageModel = new MessageObj(value);
        return value;
      });

      // validates value based on programmatic change
      ctrl.$formatters.unshift(function(value) {
        //createBtcObj(value);
        scope.messageModel = new MessageObj(value);
        return value;
      });
    }
  }
});
