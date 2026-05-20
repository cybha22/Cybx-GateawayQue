//go:build !windows

package proxy

import "os/exec"

func configurePlatformProc(cmd *exec.Cmd) {
	_ = cmd
}
