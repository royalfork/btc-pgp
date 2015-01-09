angular.module('Utils', [])

  .directive('statusButton', function() {
    return {
      restict: "E",
      replace: true,
      scope: {
        value: "@?",
        click: "&?",
        disabled: "=?"
      },
      template: "<div ng-class=\"state\"><input type=\"button\" class=\"btn\" value=\"{{ value }}\" ng-click=\"action()\" ng-disabled=\"disabled\" /></div>",
      link: function(scope, elem, attrs) {
        scope.action = function() {
          scope.state = "loading";
          scope.click().then(function() {
            scope.state = "complete";
          }, function() {
            scope.state = "complete";
          });
        };
      }
    };
  })


  .directive('saveCookie', function($cookies) {
    return {
      restrict: "A",
      require: "ngModel",
      link: function(scope, elem, attrs, ctrl) {

        // if we have a cookie, set it on the ng-model
        var saved_val = $cookies[attrs.ngModel];
        if (saved_val) {
          scope[attrs.ngModel] = saved_val;
        }

        // if ngModel changes, and it passes validation, save the new value to cookie
        scope.$watch(function() {
          return ctrl.$modelValue;
        }, function(newVal) {
          if (newVal) {
            console.log("Saving: " + newVal);
            $cookies[attrs.ngModel] = newVal;
          }
        });
      }
    }
  })

