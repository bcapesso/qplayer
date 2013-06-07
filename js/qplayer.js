/**
 * 
 * A jQuery plugin to create a prayer player with text
 * 
 * Copyright 2013 Pathgate Institute
 */
(function($, $doc, $mustache) {
  
  "use strict";
  
  var defaults = {
    qpSelector: "a.qPlayer",
    templateId: "#qPlayerTpl",
    showDownload: true,
    jPlayerOptions : {
      swfPath: "js/",
      solution: "html,flash",
      wmode: "window",
      smoothPlayBar: true,
      keyEnabled: true,
    }
  };

  var playerIds = 0;
  
  $.fn.qPlayer = function() {
    
    return this.each(function(){
      // for each player 
      //  - create instance variables
      //  - load template
      //  - setup jPlayer
      var playerEl = this;
      var sourceUrl = $(playerEl).attr("href")
      var mediaFormat = sourceUrl.slice(sourceUrl.length - 3, sourceUrl.length);
      $.getJSON(sourceUrl.replace("."+mediaFormat, ".json"))
        .fail(function(jqXHR, status, reason){ 
          // TODO display error in player
        })
        .done(function(config) { 
          var instance = $.extend({
            url: sourceUrl,
            mediaFormat: mediaFormat
          }, $.fn.qPlayer.defaults, $(playerEl).data(), config);
          // enrich captions data by determining the end of each caption
          for (var index=0; index < instance.captions.length; index++) {
            var caption = instance.captions[index];
            if (caption.duration) {
              caption.end = caption.time + caption.duration;
            } else if (index < instance.captions.length - 1) {
              caption.end = instance.captions[index + 1].time;
            } else {
              caption.end = 99999999;
            }
          }
          var id = playerIds++;
          instance.id = id;
          instance.playerId = "qPlayer-jpContainer-"+id;
          instance.selector = "#"+instance.playerId;
          instance.current = 0;
          instance.displayed = -1;
          instance.animating = false;
          instance.findCaption = findCaption;
          instance.updateCaption = updateCaption;
          instance.displayCaption = displayCaption;
          instance.fadeLines = function(fadeIn, options) {
            var lines = this.lines();
            for (var i=0; i < lines.length; i++) {
              if (fadeIn) {
                $(lines[i]).fadeIn();
              } else {
                $(lines[i]).fadeOut(options);
              }
            }
          }
          instance.lines = function() {
            return $(this.selector).children(".line");
          }
          
          var jPlayerId = "qPlayer-jPlayer-"+id;
          
          var template = $(instance.templateId).html();
          var playerHtml = $mustache.to_html(template, instance);
          $(playerEl)
            .attr("id", jPlayerId)
            .attr("href", "")
            .after(playerHtml);
    
          var line = $(instance.selector).find(".line");
          $(line).addClass(instance.classes[0]);
          createClassToggle(instance.classes[0]);
          for (var l=1; l < instance.classes.length; l++) {
            line = $(line).after("<div class='line'></div>").next();
            $(line).addClass(instance.classes[l]);
            createClassToggle(instance.classes[l]);
          }
          
          function createClassToggle(className) {
            var selector_on = instance.selector + " .jp-toggles .qp-" + className;
            var selector_off = selector_on + "-off";
            if ($(selector_on)) {
              $(selector_on).hide().click(function() {
                $(selector_on).hide();
                $(instance.selector).find(".line."+className).removeClass("hidden");
                $(selector_off).show();
              });
              $(selector_off).click(function() {
                $(selector_off).hide();
                $(instance.selector).find(".line."+className).addClass("hidden");
                $(selector_on).show();
              });
            }
          }

            
          var media = {};
          media[mediaFormat] = instance.url;

          $(playerEl).jPlayer($.extend(instance.jPlayerOptions, {
            ready: function (event) {
              $(this).jPlayer("setMedia", media); 
            },
            timeupdate: function(event) {
              instance.updateCaption(event.jPlayer.status.currentTime);
            },
            cssSelectorAncestor: "#"+instance.playerId
          }));
          
          // safe the instance data for later use
          $(playerEl).data(instance);

        });
        
      //  
    });
    
  };
  
  $.fn.qPlayer.defaults = defaults;
    
  function findCaption(time) {
    if (this.captions.length === 0) {
      return null;
    }
    var q = this.captions[this.current];

    while (time > q.end) {
      if (this.current + 1 >= this.captions.length) {
        return null;
      }
      if (time < this.captions[this.current + 1].time) {
        return null;
      }
      this.current++;
      q = this.captions[this.current];
    }
    while (time < q.time) {
      if (this.current === 0) {
        return null;
      }
      if (time > this.captions[this.current - 1].end) {
        return null;
      }
      this.current--;
      q = this.captions[this.current];
    }
    return q;
  }
  
  function updateCaption(time) {
    if (this.animating) {
      return;
    }
    var q = this.findCaption(time);
    var self = this;
    if (q) {
      if (this.displayed !== this.current) {
        if (this.current > 0) {
          this.animating = true;
          this.fadeLines(false, {
            complete: function() {
              self.displayCaption();
              self.animating = false;
            }
          });
        } else {
          self.displayCaption();
        }
      }
    } else {
      this.fadeLines(false);
    }
  };

  function displayCaption() {
    if (this.displayed === this.current) {
      return;
    }
    var text = this.captions[this.current].text;
    var lines = this.lines();
    lines.html("");
    if (text instanceof Array) {
      for (var i=0; i < text.length; i++) {
        $(lines[i]).html(text[i]);
      }
      this.fadeLines(true);
    } else {
      $(lines[0]).html(text);
      this.fadeLines(true);
    }
    this.displayed = this.current;
  }

  
  $($doc).ready(function() {
    // if qpSelector is set then find all elements and instantiate the plugin on them
    if ($.fn.qPlayer.defaults.qpSelector) {
      $($.fn.qPlayer.defaults.qpSelector).qPlayer();
    }
  });
  
}( jQuery, document, window.Mustache ));
