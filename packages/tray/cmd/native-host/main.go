package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"io"
	"log"
	"os"

	"chrome-collect-tray/internal/app"
	"chrome-collect-tray/internal/protocol"
)

var Version = "dev"

func main() {
	service, err := app.New(Version)
	if err != nil {
		log.Fatal(err)
	}
	defer service.Close()

	dispatcher := &app.Dispatcher{
		Service: service,
		OpenManagerFunc: func() error {
			return app.LaunchManagerWindow()
		},
	}

	reader := bufio.NewReader(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	for {
		request, err := readRequest(reader)
		if err != nil {
			if err == io.EOF {
				return
			}
			_ = writeResponse(writer, protocol.NewError("", "decode_failed", "请求解码失败"))
			return
		}
		response := dispatcher.Handle(request)
		if err := writeResponse(writer, response); err != nil {
			return
		}
	}
}

func readRequest(reader io.Reader) (protocol.Request, error) {
	var size uint32
	if err := binary.Read(reader, binary.LittleEndian, &size); err != nil {
		return protocol.Request{}, err
	}
	body := make([]byte, size)
	if _, err := io.ReadFull(reader, body); err != nil {
		return protocol.Request{}, err
	}
	var request protocol.Request
	if err := json.Unmarshal(body, &request); err != nil {
		return protocol.Request{}, err
	}
	return request, nil
}

func writeResponse(writer *bufio.Writer, response protocol.Response) error {
	body, err := json.Marshal(response)
	if err != nil {
		return err
	}
	if err := binary.Write(writer, binary.LittleEndian, uint32(len(body))); err != nil {
		return err
	}
	if _, err := writer.Write(body); err != nil {
		return err
	}
	return writer.Flush()
}
