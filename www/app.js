"use strict";

// Constants
const SEEK_TIME = 5 * 1000000; // In microseconds
const REFRESH_PERIOD = 1000; // In milliseconds
const POPOVERS_TIMEOUT = 2000; // In milliseconds
const MAX_IS_STREAMING_WAIT_TIME = 30; // In seconds
const PEERFLIX_DEFAULT_ADDRESS = "http://127.0.0.1:8888/";

// Controller URLs
let playback_statusURL = window.location.origin + "/playback_status";
let get_durationURL = window.location.origin + "/get_duration";
let get_positionURL = window.location.origin + "/get_position";
let set_positionURL = window.location.origin + "/set_position";
let list_subtitlesURL = window.location.origin + "/list_subtitles";
let list_audioURL = window.location.origin + "/list_audio";
let set_subtitlesURL = window.location.origin + "/set_subtitle";
let set_audioURL = window.location.origin + "/set_audio";
let get_sourceURL = window.location.origin + "/get_source";
let seekURL = window.location.origin + "/seek";
let playURL = window.location.origin + "/play";
let pauseURL = window.location.origin + "/pause";
let stopURL = window.location.origin + "/stop";
let openURL = window.location.origin + "/open";
let play_pauseURL = window.location.origin + "/play_pause";
let show_subtitlesURL = window.location.origin + "/show_subtitles";
let hide_subtitlesURL = window.location.origin + "/hide_subtitles";

// Streamer URLs
let searchURL = window.location.origin + "/search";
let is_streamingURL = window.location.origin + "/is_streaming";
let download_torrentURL = window.location.origin + "/download_torrent";
let list_filesURL = window.location.origin + "/list_files";
let stream_torrentURL = window.location.origin + "/stream_torrent";
let stop_streamingURL = window.location.origin + "/stop_stream";


// Current state
let duration = 0; // In microseconds
let position = 0; // In microseconds
let subtitles = [];
let audio_tracks = [];

$(document).ready(function () {
    pollCurrentState();
    showListModalList();

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
                modalList.append(
                    `
                        <li class="list-group-item d-flex justify-content-between align-items-center" desc-url="${result.DescURL}">
                            ${result.Name} (${result.Seeders} seeders, ${result.Size})
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

function isStreaming() {
    $.getJSON(is_streamingURL)
        .done(is)
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

    setTime();

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

function setTime() {
    $("#time").text(formatTime(position) + " / " + formatTime(duration));
    $("#duration-slider")
        .attr("max", "" + duration)
        .attr("value", "" + position);
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

function selectFromList(getList, callback) {

}
