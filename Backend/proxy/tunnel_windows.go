//go:build windows

package proxy

import (
	"os/exec"
	"syscall"
)

func configurePlatformProc(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
}
