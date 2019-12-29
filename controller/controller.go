package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"strconv"
	"time"

	"github.com/godbus/dbus"
	"github.com/gorilla/mux"
)

const root_interface = "org.mpris.MediaPlayer2"
const root_path = "/org/mpris/MediaPlayer2"
const root_methods = root_interface + ".%s"

const dbus_address = root_interface + ".omxplayer"

const player_interface = root_interface + ".Player"
const player_methods = player_interface + ".%s"

const player_properties_method = "org.freedesktop.DBus.Properties.%s"

const omx_dbus_file_addr = "/tmp/omxplayerdbus.%s"
const omx_dbus_file_pid = omx_dbus_file_addr + ".pid"

const env_dbus_address = "DBUS_SESSION_BUS_ADDRESS"
const env_dbus_pid = "DBUS_SESSION_BUS_PID"

type WebServer struct {
	router *mux.Router
	srv    *http.Server
}

type OMXPlayer struct {
	conn   *dbus.Conn
	object dbus.BusObject
}

func NewWebServer(address string, port string) *WebServer {

	omxplayer := &OMXPlayer{}

	r := mux.NewRouter()
	r.HandleFunc("/pause", omxplayer.Pause).Methods("GET")
	r.HandleFunc("/play", omxplayer.Play).Methods("GET")
	r.HandleFunc("/play_pause", omxplayer.PlayPause).Methods("GET")
	r.HandleFunc("/stop", omxplayer.Stop).Methods("GET")
	r.HandleFunc("/list_subtitles", omxplayer.ListSubtitles).Methods("GET")
	r.HandleFunc("/list_audio", omxplayer.ListAudio).Methods("GET")
	r.HandleFunc("/set_subtitle", omxplayer.SetSubtitle).Methods("POST")
	r.HandleFunc("/set_audio", omxplayer.SetAudio).Methods("POST")
	r.HandleFunc("/seek", omxplayer.Seek).Methods("POST")
	r.HandleFunc("/set_position", omxplayer.SetPosition).Methods("POST")
	r.HandleFunc("/get_source", omxplayer.GetSource).Methods("GET")
	r.HandleFunc("/get_duration", omxplayer.GetDuration).Methods("GET")
	r.HandleFunc("/play_demo_movie", omxplayer.PlayDemo).Methods("GET")
	r.PathPrefix("/").Handler(http.StripPrefix("/", http.FileServer(http.Dir("www/"))))

	server := &http.Server{
		Addr:         address + ":" + port,
		Handler:      r,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}

	ws := &WebServer{
		router: r,
		srv:    server,
	}

	return ws
}

func (ws *WebServer) StartWebServer() error {
	return ws.srv.ListenAndServe()
}

func cleanFiles() {
	os.Remove(omx_dbus_file_addr)
	os.Remove(omx_dbus_file_pid)
}

func (omxplayer *OMXPlayer) PlayDemo(writer http.ResponseWriter, request *http.Request) {
	cleanFiles()
	cmd := exec.Command("omxplayer", "/home/pi/demo.mp4")
	cmd.Start()

	user, err := user.Current()
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	addr, err := waitAndGetContent(fmt.Sprintf(omx_dbus_file_addr, user.Username))
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	pid, err := waitAndGetContent(fmt.Sprintf(omx_dbus_file_pid, user.Username))
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	err = os.Setenv(env_dbus_address, string(addr))
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	err = os.Setenv(env_dbus_pid, string(pid))
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	auth := []dbus.Auth{
		dbus.AuthExternal(user.Username),
		dbus.AuthCookieSha1(user.Username, user.HomeDir),
	}

	if omxplayer.conn, err = dbus.SessionBusPrivate(); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	if err = omxplayer.conn.Auth(auth); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	if err = omxplayer.conn.Hello(); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	omxplayer.object = omxplayer.conn.Object(dbus_address, root_path)

	go func() {
		cmd.Wait()
		omxplayer.conn = nil
	}()
}

func (omxplayer *OMXPlayer) Pause(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "Pause"), 0).Err; err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

}

func (omxplayer *OMXPlayer) Play(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "Play"), 0).Err; err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

}

func (omxplayer *OMXPlayer) Stop(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "Stop"), 0).Err; err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

}

func (omxplayer *OMXPlayer) PlayPause(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "PlayPause"), 0).Err; err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

}

func (omxplayer *OMXPlayer) ListSubtitles(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	var list []string
	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "ListSubtitles"), 0).Store(&list); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	bytes, err := json.Marshal(list)
	if err == nil {
		_, err = writer.Write(bytes)
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			writeErrorToHTTP(writer, err)
			return
		}
	} else {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	}
}

func (omxplayer *OMXPlayer) ListAudio(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	var list []string
	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "ListAudio"), 0).Store(&list); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	bytes, err := json.Marshal(list)
	if err == nil {
		_, err = writer.Write(bytes)
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			writeErrorToHTTP(writer, err)
			return
		}
	} else {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	}
}

func (omxplayer *OMXPlayer) SetSubtitle(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	err := request.ParseForm()
	if err != nil {
		fmt.Println(err.Error())
		writeErrorToHTTP(writer, err)
		return
	}

	index, err := strconv.Atoi(request.Form.Get("index"))
	if err != nil {
		fmt.Println(err.Error())
		writeErrorToHTTP(writer, err)
		return
	}

	var success bool
	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "SelectSubtitle"), 0, int32(index)).Store(&success); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	} else if !success {
		writeErrorToHTTP(writer, errors.New("Could not set subtitle track"))
		return
	}

}

func (omxplayer *OMXPlayer) SetAudio(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	err := request.ParseForm()
	if err != nil {
		fmt.Println(err.Error())
		writeErrorToHTTP(writer, err)
		return
	}

	index, err := strconv.Atoi(request.Form.Get("index"))
	if err != nil {
		fmt.Println(err.Error())
		writeErrorToHTTP(writer, err)
		return
	}

	var success bool
	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "SelectAudio"), 0, int32(index)).Store(&success); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	} else if !success {
		writeErrorToHTTP(writer, errors.New("Could not set audio track"))
		return
	}

}

func (omxplayer *OMXPlayer) Seek(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	err := request.ParseForm()
	if err != nil {
		fmt.Println(err.Error())
		writeErrorToHTTP(writer, err)
		return
	}

	offset, err := strconv.ParseInt(request.Form.Get("offset"), 10, 64)
	if err != nil {
		fmt.Println(err.Error())
		writeErrorToHTTP(writer, err)
		return
	}

	var returned_offset int64
	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "Seek"), 0, offset).Store(&returned_offset); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}
	success := returned_offset == offset

	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	} else if !success {
		writeErrorToHTTP(writer, errors.New("Could not seek: invalid offset"))
		return
	}

}

func (omxplayer *OMXPlayer) SetPosition(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	err := request.ParseForm()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	offset, err := strconv.ParseInt(request.Form.Get("offset"), 10, 64)
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	if body := omxplayer.object.Call(fmt.Sprintf(player_methods, "SetPosition"), 0, dbus.ObjectPath("/not/used"), offset).Body; len(body) == 0 {
		writeErrorToHTTP(writer, errors.New("Could not set position: invalid position"))
		return
	}
}

func (omxplayer *OMXPlayer) GetSource(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	var source string
	if err := omxplayer.object.Call(fmt.Sprintf(player_methods, "GetSource"), 0).Store(&source); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	bytes, err := json.Marshal(source)
	if err == nil {
		_, err = writer.Write(bytes)
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			writeErrorToHTTP(writer, err)
			return
		}
	} else {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	}
}

func (omxplayer *OMXPlayer) GetDuration(writer http.ResponseWriter, request *http.Request) {
	if omxplayer.conn == nil {
		writeOfflineErrorToHTTP(writer)
		return
	}

	var duration int64
	if err := omxplayer.object.Call(fmt.Sprintf(player_properties_method, "Get"), 0, player_interface, "Duration").Store(&duration); err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	}

	bytes, err := json.Marshal(duration)
	if err == nil {
		_, err = writer.Write(bytes)
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			writeErrorToHTTP(writer, err)
			return
		}
	} else {
		fmt.Fprintln(os.Stderr, err.Error())
		writeErrorToHTTP(writer, err)
		return
	}
}

func writeOfflineErrorToHTTP(writer http.ResponseWriter) {
	http.Error(writer, "No OMXPlayer instance available", 503)
}

func writeErrorToHTTP(writer http.ResponseWriter, err error) {
	http.Error(writer, err.Error(), 500)
}
