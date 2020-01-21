(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

let tnp = require("torrent-name-parser");

// Constants
const SEEK_TIME = 5 * 1000000; // In microseconds
const REFRESH_PERIOD = 1000; // In milliseconds
const POPOVERS_TIMEOUT = 2000; // In milliseconds
const MAX_IS_STREAMING_WAIT_TIME = 30; // In seconds
const PEERFLIX_DEFAULT_ADDRESS = "http://127.0.0.1:8888/";

// Controller URLs
let base_url = window.location.origin;
let playback_statusURL = base_url + "/playback_status";
let get_durationURL = base_url + "/get_duration";
let get_positionURL = base_url + "/get_position";
let set_positionURL = base_url + "/set_position";
let list_subtitlesURL = base_url + "/list_subtitles";
let list_audioURL = base_url + "/list_audio";
let set_subtitlesURL = base_url + "/set_subtitle";
let set_audioURL = base_url + "/set_audio";
let get_sourceURL = base_url + "/get_source";
let seekURL = base_url + "/seek";
let playURL = base_url + "/play";
let pauseURL = base_url + "/pause";
let stopURL = base_url + "/stop";
let openURL = base_url + "/open";
let play_pauseURL = base_url + "/play_pause";
let show_subtitlesURL = base_url + "/show_subtitles";
let hide_subtitlesURL = base_url + "/hide_subtitles";

// Streamer URLs
let searchURL = base_url + "/search";
let is_streamingURL = base_url + "/is_streaming";
let download_torrentURL = base_url + "/download_torrent";
let list_filesURL = base_url + "/list_files";
let stream_torrentURL = base_url + "/stream_torrent";
let stop_streamingURL = base_url + "/stop_stream";


// Current state
let duration = 0; // In microseconds
let position = 0; // In microseconds
let subtitles = [];
let audio_tracks = [];
let prevent_duration_slider_update = false;

$(document).ready(function () {
    pollCurrentState();
    showListModalList();

    // Configure duration bar
    let duration_slider = $("#duration-slider");
    duration_slider
        .on('mousedown', function () {
            prevent_duration_slider_update = true;
        })
        .on('mouseup', function () {
            $.post(set_positionURL, {offset: duration_slider.val()});
            setTimeout(() => {
                prevent_duration_slider_update = false;
            }, REFRESH_PERIOD)
        })
        .on('input change', function () {
            if (prevent_duration_slider_update) {
                setTime(duration_slider.val())
            }
        });

    // Configure onClick events
    $("#playButton").on("click", function () {
        togglePlayButton();
        $.get(play_pauseURL, () => undefined);
    });

    $("#forward").on("click", function () {
        $.post(seekURL, {offset: SEEK_TIME}, () => undefined);
    });

    $("#rewind").on("click", function () {
        $.post(seekURL, {offset: -SEEK_TIME}, () => undefined);
    });

    $("#stop").on("click", function () {
        stopCurrentSession();
    });

    $("#switchAudio").on("click", function () {
        if (audio_tracks.length > 0) {
            let modalDialog = $("#list-modal-dialog");
            let modalList = $("#modal-list");
            modalList.empty();
            audio_tracks.forEach(audio_track => {
                let checkmarkStr = "";
                if (audio_track.active) {
                    checkmarkStr = `<ion-icon name="checkmark"></ion-icon>`
                }
                modalList.append(
                    `
                        <li class="list-group-item d-flex justify-content-between align-items-center" audio-index="${audio_track.index}">
                            ${audio_track.language} (${audio_track.name})
                            ${checkmarkStr}
                        </li>
                    `
                )
            });

            modalDialog
                .modal();

            modalList.off().on("click", "li", function (e) {
                e.preventDefault();
                modalDialog.modal("hide");
                let index = $(this).attr("audio-index");
                $.post(set_audioURL, {index: index})
            })
        } else {
            $("#switchAudioButton")
                .popover();

            setTimeout(() => {
                $("#switchAudioButton")
                    .popover("hide")
            }, POPOVERS_TIMEOUT)
        }
    });

    $("#switchSubtitles").on("click", function () {
        if (subtitles.length > 0) {
            let modalDialog = $("#list-modal-dialog");
            let modalList = $("#modal-list");
            modalList.empty();
            subtitles.forEach(subtitle => {
                let checkmarkStr = "";
                if (subtitle.active) {
                    checkmarkStr = `<ion-icon name="checkmark"></ion-icon>`
                }
                modalList.append(
                    `
                        <li class="list-group-item d-flex justify-content-between align-items-center" sub-index="${subtitle.index}">
                            ${subtitle.language} (${subtitle.name})
                            ${checkmarkStr}
                        </li>
                    `
                )
            });

            modalDialog
                .modal();

            modalList.off().on("click", "li", function (e) {
                e.preventDefault();
                let index = $(this).attr("sub-index");
                modalDialog.modal("hide");
                $.get(show_subtitlesURL);
                $.post(set_subtitlesURL, {index: index});
            })
        } else {
            $("#switchSubtitlesButton")
                .popover();

            setTimeout(() => {
                $("#switchSubtitlesButton")
                    .popover("hide")
            }, POPOVERS_TIMEOUT)
        }
    });

    setupSearchBox();
});

function stopCurrentSession() {
    $.get(stopURL);
    $.get(stop_streamingURL);
}

function setupSearchBox() {
    $("#search-torrent-form").submit(function (e) {
        e.preventDefault();
        let modalDialog = $("#list-modal-dialog");

        modalDialog.modal();
        showSpinnerModalList();

        let torrentName = $("#torrent-name").val();
        $.post(searchURL, {query: torrentName}, function (results) {
            let modalList = $("#modal-list");
            modalList.empty();
            results.sort(function (torrent1, torrent2) {
                return torrent2.Seeders - torrent1.Seeders;
            });

            results.forEach(result => {
                let infos = tnp(result.Name);
                modalList.append(
                    `
                        <li class="list-group-item d-flex justify-content-between align-items-center" desc-url="${result.DescURL}">
                            ${infos.title} [${infos.resolution}, ${infos.codec}] (${result.Seeders} seeders, ${result.Size})
                        </li>

                `)
            });

            showListModalList();

            modalList.off().on("click", "li", function (e) {
                e.preventDefault();
                showSpinnerModalList();
                let descURL = $(this).attr("desc-url");
                $.post(download_torrentURL, {descUrl: descURL}, function (torrentName) {
                    $.post(list_filesURL, {torrent: torrentName}, function (files) {
                        modalList.empty();
                        files.forEach(file => {
                            modalList.append(
                                `
                                <li class="list-group-item d-flex justify-content-between align-items-center" file-index="${file.Index}">
                                    ${file.Filename}
                                </li>
                                 `)
                        });

                        showListModalList();

                        modalList.off().on("click", "li", function (e) {
                            e.preventDefault();
                            showSpinnerModalList();
                            stopCurrentSession();
                            let index = $(this).attr("file-index");
                            $.post(stream_torrentURL, {torrent: torrentName, fileIndex: index}, function () {
                                $.ajax({
                                    dataType: "json",
                                    url: is_streamingURL,
                                    type: "GET",
                                    tryCount: 0,
                                    retryLimit: MAX_IS_STREAMING_WAIT_TIME,
                                    success: function (is_streaming) {
                                        if (is_streaming) {
                                            $.post(openURL, {file: PEERFLIX_DEFAULT_ADDRESS}, function () {
                                                showListModalList();
                                                modalDialog.modal("hide");
                                            });
                                        } else {
                                            if (this.tryCount++ <= this.retryLimit) {
                                                setTimeout(() => $.ajax(this), 1000);
                                            }
                                        }
                                    },
                                })
                            })
                        })

                    }, 'json')
                }, 'json')
            })

        }, 'json')
    })

}

function showSpinnerModalList() {
    $("#audioListTitle").text("Please wait...");
    $("#modal-list-spinner").show();
    $("#modal-list").hide();
}

function showListModalList() {
    $("#audioListTitle").text("Please choose an entry:");
    $("#modal-list-spinner").hide();
    $("#modal-list").show();
}

function pollCurrentState() {
    $.getJSON(playback_statusURL)
        .done(function (playback_status) {
            $("#playButton").attr("name", playback_status === "Paused" ? "play" : "pause")
        })
        .fail(function () {
            $("#playButton").attr("name", "play");
        });

    $.getJSON(get_durationURL)
        .done(function (_duration) {
            duration = _duration
        })
        .fail(function () {
            duration = 0
        });

    $.getJSON(get_positionURL)
        .done(function (_pos) {
            position = _pos
        })
        .fail(function () {
            position = 0
        });

    if (!prevent_duration_slider_update) {
        setTime(position);
        setDurationSlider(position);
    }

    $.getJSON(get_sourceURL)
        .done(function (source) {
            $("#source").text(source)
        })
        .fail(function () {
            $("#source").text("No title playing yet")
        });

    $.getJSON(list_subtitlesURL)
        .done(function (subtitles_info) {
            let parsed = [];
            subtitles_info.forEach(subtitle_info => {
                let split = subtitle_info.split(":");
                parsed.push({
                    index: split[0],
                    language: split[1],
                    name: split[2],
                    codec: split[3],
                    active: split[4] === "active"
                })
            });

            subtitles = parsed;
        })
        .fail(function () {
            subtitles = [];
        });

    $.getJSON(list_audioURL)
        .done(function (audios_info) {
            let parsed = [];
            audios_info.forEach(audio_info => {
                let split = audio_info.split(":");
                parsed.push({
                    index: split[0],
                    language: split[1],
                    name: split[2],
                    codec: split[3],
                    active: split[4] === "active"
                })
            });

            audio_tracks = parsed;
        })
        .fail(function () {
            audio_tracks = [];
        });

    setTimeout(pollCurrentState, REFRESH_PERIOD);
}

function togglePlayButton() {
    let button = $("#playButton");
    if (button.attr("name") === "play") {
        button.attr("name", "pause")
    } else {
        button.attr("name", "play")
    }
}

function setTime(pos) {
    $("#time").text(formatTime(pos) + " / " + formatTime(duration));
}

function setDurationSlider(pos) {
    $("#duration-slider")
        .prop("max", duration)
        .prop("value", pos);
}

function formatTime(totalMicroseconds) {
    let formatter = new Intl.NumberFormat(undefined, {
        minimumIntegerDigits: 2,
    });
    let totalSeconds = Math.floor(totalMicroseconds / 1000000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds - hours * 3600) / 60);
    let seconds = totalSeconds - hours * 3600 - minutes * 60;

    return "" + formatter.format(hours) + ":" + formatter.format(minutes) + ":" + formatter.format(seconds)
}

},{"torrent-name-parser":3}],2:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter;

var Core = function() {
  EventEmitter.call(this);

  var parts;

  this.getParts = function() {
    return parts;
  };

  this.on('setup', function () {
    parts = {};
  });

  this.on('part', function (part) {
    parts[part.name] = part.clean;
  });
};

Core.prototype = Object.create(EventEmitter.prototype);
Core.prototype.constructor = EventEmitter;

Core.prototype.exec = function(name, customPatterns, customTypes) {
  this.emit('setup', {
    name: name
  }, {patterns: customPatterns, types:customTypes});
  this.emit('start');
  this.emit('end');

  return this.getParts();
};

Core.prototype.configure = function(customPatterns, customTypes) {
  this.emit('configure', {patterns: customPatterns, types: customTypes});
};

module.exports = new Core();

},{"events":7}],3:[function(require,module,exports){
'use strict';

require('./parts/common');
require('./parts/title');
require('./parts/excess');

module.exports = ptn;

function ptn(name, customPatterns, customTypes) {
  return require('./core').exec(name, customPatterns, customTypes);
}

ptn.configure = function(customPatterns, customTypes) {
  require('./core').configure(customPatterns, customTypes);
};

},{"./core":2,"./parts/common":4,"./parts/excess":5,"./parts/title":6}],4:[function(require,module,exports){
'use strict';

var core = require('../core');

/**
 * Pattern should contain either none or two capturing groups.
 * In case of two groups - 1st is raw, 2nd is clean.
 */
var patterns = {
  season: /([Ss]?([0-9]{1,2}))[Eex]|([Ss]([0-9]{1,2}))/,
  episode: /([Eex]([0-9]{2})(?:[^0-9]|$))/,
  year: /([\[\(]?((?:19[0-9]|20[01])[0-9])[\]\)]?)/,
  resolution: /(([0-9]{3,4}(?:p|i)))[^M]/,
  quality: /hdtv|bluray|(?:b[dr]|dvd|hd|tv)rip|web-?(?:dl|rip)|dvd/i,
  codec: /dvix|mpeg[0-9]|divx|xvid|(?:x|h)[-\. ]?26(?:4|5)|avc|hevc/i,
  audio: /MP3|DD5\.?1|Dual[\- ]Audio|LiNE|DTS|AAC(?:\.?2\.0)?|AC3(?:\.5\.1)?/,
  group: /(- ?([^-]+))$/,
  region: /R[0-9]/,
  extended: /EXTENDED/,
  hardcoded: /HC/,
  proper: /PROPER/,
  repack: /REPACK/,
  container: /MKV|AVI|MP4|mkv|avi|mp4/,
  website: /^(\[ ?([^\]]+?) ?\])/,
  language: /(?:TRUE)?FR(?:ENCH)?|EN(?:G(?:LISH)?)?|VOST(?:(F(?:R)?)|A)?|MULTI(?:Lang|Truefrench|\-VF2)?|SUBFRENCH/gi
};
var types = {
  season: 'integer',
  episode: 'integer',
  year: 'integer',
  extended: 'boolean',
  hardcoded: 'boolean',
  proper: 'boolean',
  repack: 'boolean'
};
var currentPatterns;
var currentTypes;
var torrent;

core.on('configure', function(config) {
  for (var key in config.patterns) {
    patterns[key] = config.patterns[key]; // override or create specified keys
  }
  for (var key in config.types) {
    types[key] = config.types[key]; // override or create specified keys
  }
});

core.on('setup', function (data, config) {
  torrent = data;
  currentPatterns = patterns;
  currentTypes = types;
  for (var key in config.patterns) {
    currentPatterns[key] = config.patterns[key]; // temporarily override or create specified keys
  }
  for (var key in config.types) {
    currentTypes[key] = config.types[key]; // temporarily override or create specified keys
  }
});

core.on('start', function() {
  var key, match, index, clean, part;

  for(key in currentPatterns) {
    if(currentPatterns.hasOwnProperty(key)) {
      if(!(match = torrent.name.match(currentPatterns[key]))) {
        continue;
      }

      index = {
        raw:   match[1] ? 1 : 0,
        clean: match[1] ? 2 : 0
      };

      if(currentTypes[key] && currentTypes[key] === 'boolean') {
        clean = true;
      }
      else {
        clean = match[index.clean];

        if(currentTypes[key] && currentTypes[key] === 'integer') {
          clean = parseInt(clean.replace(/[^0-9.]/, ""), 10);
        }
      }

      if(key === 'group') {
        if(clean.match(currentPatterns.codec) || clean.match(currentPatterns.quality)) {
          continue;
        }


        if(clean.match(/[^ ]+ [^ ]+ .+/)) {
          key = 'episodeName';
        }
        clean = clean.replace(/ *\([^)]*\) */, "");
        clean = clean.replace(/ *\[[^)]*\] */, "");
      }

      if(key === 'language') {

        var i = 0;
        while( match = currentPatterns.language.exec(torrent.name) ) {

          var separator = torrent.name.charAt(match.index-1); // separators are usually - + _ . \s
          if(match.index == 0 || !/[-+_.\s]/.test(separator) || separator !== torrent.name.charAt(match.index + match[0].length)) { // & language usually not in first
            continue;
          }

          part = {
            name: 'language' + (++i),
            match: match,
            raw: match[0],
            clean: match[0].toUpperCase()
          };
          part.name = i == 1 ? 'language' : part.name; // ensure sustainability
          core.emit('part', part);
        }

        continue;
      }

      part = {
        name: key,
        match: match,
        raw: match[index.raw],
        clean: clean
      };

      if(key === 'episode') {
        core.emit('map', torrent.name.replace(part.raw, '{episode}'));
      }

      core.emit('part', part);
    }
  }

  core.emit('common');
});

core.on('late', function (part) {
  if(part.name === 'group') {
    core.emit('part', part);
  }
  else if(part.name === 'episodeName') {
    part.clean = part.clean.replace(/[\._]/g, ' ');
    part.clean = part.clean.replace(/_+$/, '').trim();
    core.emit('part', part);
  }
});

},{"../core":2}],5:[function(require,module,exports){
'use strict';

var core = require('../core');

var torrent, raw, groupRaw;
var escapeRegex = function(string) {
  return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
};

core.on('setup', function (data) {
  torrent = data;
  raw = torrent.name;
  groupRaw = '';
});

core.on('part', function (part) {
  if(part.name === 'excess') {
    return;
  }
  else if(part.name === 'group') {
    groupRaw = part.raw;
  }

  // remove known parts from the excess
  raw = raw.replace(part.raw, '');
});

core.on('map', function (map) {
  torrent.map = map;
});

core.on('end', function () {
  var clean, groupPattern, episodeNamePattern;

  // clean up excess
  clean = raw.replace(/(^[-\. ]+)|([-\. ]+$)/g, '');
  clean = clean.replace(/[\(\)\/]/g, ' ');
  clean = clean.split(/\.\.+| +/).filter(Boolean);

  if(clean.length !== 0) {
    groupPattern = escapeRegex(clean[clean.length - 1] + groupRaw) + '$';

    if(torrent.name.match(new RegExp(groupPattern))) {
      core.emit('late', {
        name: 'group',
        clean: clean.pop() + groupRaw
      });
    }

    if(torrent.map && clean[0]) {
      episodeNamePattern = '{episode}' + escapeRegex(clean[0].replace(/_+$/, ''));

      if(torrent.map.match(new RegExp(episodeNamePattern))) {
        core.emit('late', {
          name: 'episodeName',
          clean: clean.shift()
        });
      }
    }
  }

  if(clean.length !== 0) {
    core.emit('part', {
      name: 'excess',
      raw: raw,
      clean: clean.length === 1 ? clean[0] : clean
    });
  }
});

},{"../core":2}],6:[function(require,module,exports){
'use strict';

var core = require('../core');

require('./common');

var torrent, start, end, raw;

core.on('setup', function (data) {
  torrent = data;
  start = 0;
  end = undefined;
  raw = undefined;
});

core.on('part', function (part) {
  if(!part.match) {
    return;
  }

  if(part.match.index === 0) {
    start = part.match[0].length;

    return;
  }

  if(!end || part.match.index < end) {
    end = part.match.index;
  }
});

core.on('common', function () {
  var raw = end ? torrent.name.substr(start, end - start).split('(')[0] : torrent.name;
  var clean = raw;

  // clean up title
  clean = raw.replace(/^ -/, '');

  if(clean.indexOf(' ') === -1 && clean.indexOf('.') !== -1) {
    clean = clean.replace(/\./g, ' ');
  }

  clean = clean.replace(/_/g, ' ');
  clean = clean.replace(/([\(_]|- )$/, '').trim();

  core.emit('part', {
    name: 'title',
    raw: raw,
    clean: clean
  });
});

},{"../core":2,"./common":4}],7:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}]},{},[1]);
