; Hung 0.1.0 (black screen) does not respond to WM_CLOSE.
; electron-builder then:
;   1. shows "AXGATE 로그 뷰어 cannot be closed"
;   2. runs the old uninstaller; Abort from un.onInit returns exit code 2
;      → "Failed to uninstall old application files: 2"
; Force-kill the process and do not invoke the previous uninstaller.

Var /GLOBAL oldInstallDir

!macro killViewerProcess
  Push $R8
  ExecWait '"$SYSDIR\taskkill.exe" /F /IM "AXGATE-Log-Viewer.exe" /T' $R8
  ExecWait '"$SYSDIR\taskkill.exe" /F /IM "AXGATE 로그 뷰어.exe" /T' $R8
  Sleep 2000
  Pop $R8
!macroend

!macro preInit
  !insertmacro killViewerProcess
!macroend

!macro customInit
  !insertmacro killViewerProcess
!macroend

!macro customUnInit
  !insertmacro killViewerProcess
!macroend

!macro customCheckAppRunning
  !insertmacro killViewerProcess
  !ifndef BUILD_UNINSTALLER
    ReadRegStr $oldInstallDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $oldInstallDir == ""
      ReadRegStr $oldInstallDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${EndIf}
    ${If} $oldInstallDir == ""
      StrCpy $oldInstallDir "$INSTDIR"
    ${EndIf}
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
    Delete "$oldInstallDir\${UNINSTALL_FILENAME}"
    Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  !endif
!macroend

!macro wipeOldInstallDir
  !insertmacro killViewerProcess
  ${If} $oldInstallDir != ""
    RMDir /r "$oldInstallDir"
  ${EndIf}
  ${If} $INSTDIR != ""
    RMDir /r "$INSTDIR"
  ${EndIf}
  ClearErrors
  StrCpy $R0 0
!macroend

!macro customUnInstallCheck
  !insertmacro wipeOldInstallDir
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro wipeOldInstallDir
!macroend

!macro customRemoveFiles
  !insertmacro killViewerProcess
  RMDir /r "$INSTDIR"
!macroend
