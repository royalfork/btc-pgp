var app = angular.module('app', []);

app.controller('BtcPgp', function($scope, $timeout, $q, $http) {

  $scope.createRandom = function() {
    // clear passphrase
    $scope.passphrase = "";
    $scope.key = bitcoin.ECKey.makeRandom();
  };

  $scope.$watch('passphrase', function(val) {
    if (val) {
      var hash = bitcoin.crypto.sha256(val);
      $scope.key = bitcoin.ECKey.fromUint8Arr(true, hash);
    } else {
      $scope.wif = "";
    }
  });

  $scope.$watch('key', function(val) {
    if (val) {
      $scope.wif = $scope.key.toWIF();
    }
  })

  $scope.manualWIF = function(val) {
    $scope.passphrase = "";
    if (val) {
      try {
        $scope.key = bitcoin.ECKey.fromWIF(val);
      } catch (e) {
        /* handle error */
        console.log("WE HAVE ERROR");
      }
    }
  };

  $scope.bitcoin = bitcoin;


});
