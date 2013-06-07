
(function($, $wnd, $doc, $mustache) {
  
  "use strict";
  
  var DEBUG = 0;
  var INFO = 1;
  var ERROR = 2;
  
  var LOG_LEVEL_NAMES= ["DEBUG","INFO","ERROR"];
  
  var LOG_LEVEL = INFO;
  
  function log(level, message) {
    if (level >= LOG_LEVEL && $wnd.console && $wnd.console.log) {
      $wnd.console.log(new Date().toTimeString() + " " + LOG_LEVEL_NAMES[level] + ": " + message);
    }
  }
  
  function log_raw(level, message) {
    if (level >= LOG_LEVEL && $wnd.console && $wnd.console.log) {
      $wnd.console.log(message);
    }
  }
  
  
  var defaults = {
    qpSelector: "a.qPlayer",
    templateId: "#qPlayerTpl",
    showDownload: true,
    cueLineSelector: ".cue_line",
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
      var configUrl = $(playerEl).data("configUrl");
      if (!configUrl) {
        configUrl = sourceUrl.replace("."+mediaFormat, ".json");
      }
      // load the datafile belonging to the resource
      $.getJSON(configUrl)
        .fail(function(jqXHR, status, reason){
          log(ERROR, "Failed to load " + configUrl + " : " + reason)
          // TODO display error in player
        })
        .done(function(configData) {
          log(INFO, "Loaded " + configUrl + " with " + configData.cues.length + " cues");
          var instance = $.extend({
            url: sourceUrl,
            mediaFormat: mediaFormat
          }, $.fn.qPlayer.defaults, configData, $(playerEl).data());
          // enrich cues data by determining the end of each cue
          for (var index=0; index < instance.cues.length; index++) {
            var cue = instance.cues[index];
            if (index < instance.cues.length - 1) {
              cue.end = instance.cues[index + 1].time;
            } else {
              cue.end = 99999999;
            }
            // prevent overlap if duration is too long
            if (cue.duration && (cue.time + cue.duration) < cue.end) {
              cue.end = cue.time + cue.duration;
            }
          }
          var id = playerIds++;
          instance.id = id;
          instance.playerId = "qPlayer-container-"+id;
          instance.selector = "#"+instance.playerId;
          instance.cueLineSelector = instance.selector + " " + instance.cueLineSelector;
          instance.current = 0;
          instance.lastCue = null;
          instance.synchronizing = false;
          instance.findCue = $.fn.qPlayer.findCue;
          instance.updateCue = $.fn.qPlayer.updateCue;
          instance.onCueStart = $.fn.qPlayer.onCueStart;
          instance.onCueEnd = $.fn.qPlayer.onCueEnd;
          
          var jPlayerId = "qPlayer-jPlayer-"+id;
          
          // use mustache to inject an instance of the player html code loaded from a template
          
          var template = $(instance.templateId).html();
          var playerHtml = $mustache.to_html(template, instance);
          $(playerEl)
            .attr("id", jPlayerId)    // update the main element with the id that will become the jPlayer element
            .attr("href", "")         // clear the href attribute so it cannot be downloaded
            .after(playerHtml);       // inject the template html
    
          // if there is toggles defined in the data file then we set them up here
          for (var c=0; c < instance.toggles.length; c++) {
            $.fn.qPlayer.createClassToggle(instance, instance.toggles[c]);
          }
          
          // setup jPlayer
          
          var media = {};
          media[mediaFormat] = instance.url;

          $(playerEl).jPlayer($.extend({ supplied: mediaFormat }, instance.jPlayerOptions, {
            ready: function (event) {
              log(DEBUG, "setting jPlayer media:");
              log_raw(DEBUG, media);
              $(this).jPlayer("setMedia", media); 
            },
            timeupdate: function(event) {
              instance.updateCue(event.jPlayer.status.currentTime);
            },
            cssSelectorAncestor: "#"+instance.playerId
          }));
          
          // safe the instance data for later use
          $(playerEl).data(instance);
          
          log(INFO, "Setup qPlayer for " + instance.url + " successful");

        });
        
      //  
    });
    
  };
  
  $.fn.qPlayer.defaults = defaults;
    
  $.fn.qPlayer.findCue = function(time) {
    if (this.length === 0) {
      return null;
    }
    var q = this.cues[this.current];

    while (time > q.end) {
      if (this.current + 1 >= this.cues.length) {
        return null;
      }
      if (time < this.cues[this.current + 1].time) {
        return null;
      }
      this.current++;
      q = this.cues[this.current];
    }
    while (time < q.time) {
      if (this.current === 0) {
        return null;
      }
      if (time > this.cues[this.current - 1].end) {
        return null;
      }
      this.current--;
      q = this.cues[this.current];
    }
    return q;
  }
  
  $.fn.qPlayer.updateCue = function(time) {
    // this.synchronizing is used to allow asynchronous processing in onCueStart / onCueEnd
    // in order to block processing until animations have finished
    if (this.synchronizing) {
      log(DEBUG, "bailing out: synchronizing");
      return;
    }
    var q = this.findCue(time);
    var self = this;
    // check if we have processed the found cue yet
    if (q !== this.lastCue) {
      log(DEBUG, "cue state has changed");
      if (q) {
        log(DEBUG, "new cue to activate");
        // there is a new cue
        // check if there is still an active cue
        if (this.lastCue) {
          log(DEBUG, "deactivate last cue...");
          // signal the end of the last cue
          this.synchronizing = true;
          var self = this;
          this.onCueEnd(this.lastCue, time, function() {
            log(DEBUG, "done. start new cue...");
            self.lastCue = null;
            // wait till the end (can be asynchronous)
            // onCueEnd must call this function
            self.onCueStart(q, time, function() {
              log(DEBUG, "done.");
              self.synchronizing = false;
              self.lastCue = q;
            });
          });
        } else {
          log(DEBUG, "start new cue...");
          // there is no current cue active
          // start the next one immediately
          this.synchronizing = true;
          var self = this;
          this.onCueStart(q, time, function() {
            log(DEBUG, "done.");
            self.synchronizing = false;
            self.lastCue = q;
          });
        }
      } else {
        log(DEBUG, "no current cue");
        // there is no cue at this time
        if (this.lastCue) {
          log(DEBUG, "deactivate last cue...");
          // signal the end of the last cue
          this.synchronizing = true;
          var self = this;
          this.onCueEnd(this.lastCue, time, function() {
            log(DEBUG, "done.");
            self.synchronizing = false;
            self.lastCue = null;
          });
        }
      }
    }
  };

  $.fn.qPlayer.onCueStart = function(cue, time, callback) {
    var lines_content = cue.lines;
    var lineElements = $(this.cueLineSelector);
    if (lines_content instanceof Array) {
      for (var i=0; i < lines_content.length; i++) {
        $(lineElements[i]).find(".content").html(lines_content[i]);
      }
      $.fn.qPlayer.animateCueLines(lineElements, true, callback);
    } else {
      $(lineElements[0]).find(".content").html(lines_content);
      $.fn.qPlayer.animateCueLines(lineElements, true, callback);
    }
  }
  
  $.fn.qPlayer.onCueEnd = function(cue, time, callback) {
    $.fn.qPlayer.animateCueLines($(this.cueLineSelector), false, callback);
  }

  $.fn.qPlayer.fadeCueLines = function(lines, startCue, callback) {
    var options = {
      complete: callback
    };
    if (LOG_LEVEL <= DEBUG) {
      if (startCue) {
        log(DEBUG, "Fading in...");
      } else {
        log(DEBUG, "Fading out...");
      }
    }
    for (var i = 0; i < lines.length; i++) {
      var o = (i === 0) ? options : null;
      if (startCue) {
        $(lines[i]).fadeIn(o);
      } else {
        $(lines[i]).fadeOut(o);
      }
    }
  }
  
  // you can set animateCueLines to the one you want to use
  $.fn.qPlayer.animateCueLines = $.fn.qPlayer.fadeCueLines;
   

  // initialize the toggle elements and add script to toggle cue lines
  $.fn.qPlayer.createClassToggle = function(instance, className) {
    var selector_on = instance.selector + " .jp-toggles .qp-" + className;
    var selector_off = selector_on + "-off";
    if ($(selector_on).length > 0) {
      $(selector_on).hide().click(function() {
        $(selector_on).hide();
        $(instance.cueLineSelector+"."+className).removeClass("hidden");
        $(selector_off).show();
      });
      $(selector_off).click(function() {
        $(selector_off).hide();
        $(instance.cueLineSelector+"."+className).addClass("hidden");
        $(selector_on).show();
      });
    }
  }

 
  $($doc).ready(function() {
    // if qpSelector is set then find all elements and instantiate the plugin on them
    if ($.fn.qPlayer.defaults.qpSelector) {
      $($.fn.qPlayer.defaults.qpSelector).qPlayer();
    }
  });
  
}( jQuery, window, document, window.Mustache ));
