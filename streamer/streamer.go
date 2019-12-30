package streamer

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"time"

	"github.com/anacrolix/torrent/metainfo"
	"github.com/gorilla/mux"
	"github.com/juliensalinas/torrengo/ygg"
	"github.com/yvgny/OMXRemote/controller"
)

const torrent_extension = ".torrent"
const ready_flag_path = "/tmp/stream_is_ready"

type Streamer struct {
	client      *http.Client
	Timeout     time.Duration
	LibraryPath string
	Username    string
	Password    string
	Controller  *controller.OMXPlayer
	cmd         *exec.Cmd
}

func NewStreamer(libraryPath string, username string, password string, controller *controller.OMXPlayer) (*Streamer, error) {
	if _, err := os.Stat(libraryPath); os.IsNotExist(err) {
		err = os.Mkdir(libraryPath, os.ModePerm)
		if err != nil {
			return nil, err
		}
	}

	streamer := &Streamer{
		Timeout:     10 * time.Second,
		LibraryPath: libraryPath,
		Username:    username,
		Password:    password,
		Controller:  controller,
	}

	return streamer, nil
}

func (streamer *Streamer) AddHandlers(handler *mux.Router) {
	handler.HandleFunc("/search", streamer.Search).Methods("POST")
	handler.HandleFunc("/stop_stream", streamer.Stop).Methods("GET")
	handler.HandleFunc("/is_streaming", streamer.IsReady).Methods("GET")
	handler.HandleFunc("/download_torrent", streamer.DownloadTorrent).Methods("POST")
	handler.HandleFunc("/list_files", streamer.ListFileInTorrent).Methods("POST")
	handler.HandleFunc("/stream_torrent", streamer.StreamTorrent).Methods("POST")
}

func (streamer *Streamer) IsReady(writer http.ResponseWriter, request *http.Request) {
	_, err := os.Stat(ready_flag_path)
	exists := !os.IsNotExist(err)

	bytes, err := json.Marshal(exists)
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

func (streamer *Streamer) Stop(writer http.ResponseWriter, request *http.Request) {
	if streamer.cmd != nil {
		streamer.cmd.Process.Kill()
		streamer.cmd.Wait()
		streamer.cmd = nil
	}
}

func (streamer *Streamer) StreamTorrent(writer http.ResponseWriter, request *http.Request) {
	err := request.ParseForm()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	path := streamer.LibraryPath + request.Form.Get("torrent")
	idx, err := strconv.Atoi(request.Form.Get("fileIndex"))
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	_ = os.Remove(ready_flag_path)

	cmd := exec.Command("peerflix", path, "--index", fmt.Sprintf("%d", idx), "--remove", "--on-listening", fmt.Sprintf("touch %s", ready_flag_path), "--quiet")
	err = cmd.Start()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	streamer.cmd = cmd

}

func (streamer *Streamer) ListFileInTorrent(writer http.ResponseWriter, request *http.Request) {
	err := request.ParseForm()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	path := streamer.LibraryPath + request.Form.Get("torrent")
	meta, err := metainfo.LoadFromFile(path)
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	info, err := meta.UnmarshalInfo()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	file_infos := info.UpvertedFiles()

	files := make([]string, len(file_infos))
	for i := 0; i < len(file_infos); i++ {
		files[i] = file_infos[i].DisplayPath(&info)
	}

	bytes, err := json.Marshal(files)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	_, err = writer.Write(bytes)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

}

func (streamer *Streamer) DownloadTorrent(writer http.ResponseWriter, request *http.Request) {
	err := request.ParseForm()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	// Create client if no Search was preceding
	if streamer.client == nil {
		_, streamer.client, err = ygg.Lookup("not used", streamer.Timeout)
		if err != nil {
			writeErrorToHTTP(writer, err)
			return
		}
	}

	path, err := ygg.FindAndDlFile(request.Form.Get("destUrl"), streamer.Username, streamer.Password, streamer.Timeout, streamer.client)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	meta, err := metainfo.LoadFromFile(path)
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	info, err := meta.UnmarshalInfo()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	new_name := info.Name + torrent_extension

	os.Rename(path, streamer.LibraryPath+new_name)

	bytes, err := json.Marshal(new_name)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	_, err = writer.Write(bytes)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}
}

func (streamer *Streamer) Search(writer http.ResponseWriter, request *http.Request) {
	err := request.ParseForm()
	if err != nil {
		writeErrorToHTTP(writer, err)
		return
	}

	torrents, client, err := ygg.Lookup(request.Form.Get("query"), streamer.Timeout)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}
	streamer.client = client

	bytes, err := json.Marshal(torrents)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}

	_, err = writer.Write(bytes)
	if err != nil {
		writeErrorToHTTP(writer, err)
		fmt.Fprintln(os.Stderr, err.Error())
		return
	}
}

func writeErrorToHTTP(writer http.ResponseWriter, err error) {
	http.Error(writer, err.Error(), 500)
}
