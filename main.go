package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/yvgny/OMXRemote/controller"
	"github.com/yvgny/OMXRemote/streamer"
)

type WebServer struct {
	router *mux.Router
	srv    *http.Server
}

func main() {
	portArg := flag.String("port", "8080", "port for the remote controller")
	addressArg := flag.String("bindAddress", "0.0.0.0", "the adress on which the remote controller should listen")
	torrentsLibraryPathArg := flag.String("torrentsLibraryPath", "torrents/", "the folder in which the torrents file are saved")
	yggUsernameArg := flag.String("yggUsername", "", "username of the YGG account")
	yggPasswordArg := flag.String("yggPassword", "", "password of the YGG account")
	flag.Parse()

	if *yggUsernameArg == "" || *yggPasswordArg == "" {
		fmt.Fprintln(os.Stderr, "Please provide a valid YGG account.")
		os.Exit(1)
	}

	omxplayer := controller.NewOMXPlayer()
	streamer, err := streamer.NewStreamer(*torrentsLibraryPathArg, *yggUsernameArg, *yggPasswordArg, omxplayer)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	remote := NewWebServer(*addressArg, *portArg)
	streamer.AddHandlers(remote.router)
	omxplayer.AddHandlers(remote.router)

	err = remote.StartWebServer()
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}

	// Let the server run
	wg := &sync.WaitGroup{}
	wg.Add(1)
	wg.Wait()
}

func NewWebServer(address, port string) *WebServer {
	r := mux.NewRouter()

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
