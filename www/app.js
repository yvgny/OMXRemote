"use strict";

let tnp = require("torrent-name-parser");

// Constants
const SEEK_TIME = 5 * 1000000; // In microseconds
const REFRESH_PERIOD = 1000; // In milliseconds
const POPOVERS_TIMEOUT = 2000; // In milliseconds
const MAX_IS_STREAMING_WAIT_TIME = 30; // In seconds
const PEERFLIX_DEFAULT_ADDRESS = "http://127.0.0.1:8080/get_stream";

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
