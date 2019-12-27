package main

import (
	"flag"
	"fmt"
	"os"
	"sync"

	"github.com/yvgny/OMXRemote/controller"
)

func main() {
	portArg := flag.String("port", "8080", "port for the remote controller")
	addressArg := flag.String("bind address", "0.0.0.0", "the adress on which the remote controller should listen")
	busAddrArg := flag.String("bus address", "org.mpris.MediaPlayer2.omxplayer", "the bus address of the OMXPlayer instance")
	flag.Parse()
	remote := controller.NewWebServer(*addressArg, *portArg, *busAddrArg)
	err := remote.StartWebServer()
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}

	// Let the server run
	wg := &sync.WaitGroup{}
	wg.Add(1)
	wg.Wait()
}
