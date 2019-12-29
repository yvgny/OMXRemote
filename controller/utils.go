package controller

import (
	"io/ioutil"
	"time"
)

const MAX_RETRY = 100

func waitAndGetContent(path string) (content []byte, err error) {
	for i := 0; i < MAX_RETRY; i++ {
		content, err = ioutil.ReadFile(path)
		if err == nil {
			return
		}
		time.Sleep(600 * time.Millisecond)
	}

	return
}
